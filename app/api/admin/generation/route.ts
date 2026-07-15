import { NextResponse } from "next/server";
import {
  getGenerationSettings,
  updateGenerationSettings,
  logGenerationAudit,
  logGenerationAuditVerified,
} from "@/lib/server/generation-settings";
import {
  generationAllowed,
  isProtectedMarkSprintGenerationIdentity,
  mark8GenerationAllowed,
  parseSlug,
} from "@/lib/server/generate-chapter-workup";
import {
  getChapterStatus,
  getStudioChapterStatus,
  publishChapter,
} from "@/lib/server/chapter-workups-repository";
import {
  claimGenerationJob,
  claimImageJob,
  failGenerationJob,
  releaseImageJob,
  requireJobStore,
  IMAGE_JOB_ERROR_CODE_KEY,
  IMAGE_JOB_KEY,
  IMAGE_JOB_MODEL_KEY,
  IMAGE_JOB_SPENT_COUNT_KEY,
  IMAGE_JOB_STATE_KEY,
  ALLOW_DISCARD_COMPLETED_IMAGES,
} from "@/lib/server/generation-jobs";
import { triggerBackgroundGeneration, triggerBackgroundImageGeneration } from "@/lib/server/trigger-generation";
import {
  imageGenAllowed,
  checkImageModel,
  prepareImageJobBinding,
} from "@/lib/server/images";
import {
  deriveMarkSprintImagePlan,
  markSprintFinalReviewDigest,
  MARK_8_IMAGE_ESTIMATED_COST_USD,
  MARK_8_IMAGE_MODEL,
} from "@/lib/server/mark8-image-plan";
import {
  chapterMutationDecision,
  isChapterMutationError,
  type MutationAction,
} from "@/lib/server/protected-chapters";
import {
  snapshotVersion,
  listVersions,
  getVersionWorkup,
  applyMergedDraft,
  restoreVersion,
} from "@/lib/server/chapter-versions-repository";
import type { ChapterWorkup } from "@/lib/types";
import {
  addExample,
  listExamples,
  setExampleActive,
  deleteExample,
  getRelevantExamples,
  TEXT_EXAMPLE_TYPES,
} from "@/lib/server/selah-examples";
import { getAuditLog } from "@/lib/server/selah-feedback";
import {
  submitReview,
  listGlobalRules,
  setRuleActive,
  deleteRule,
  seedFromLibrary,
  selectRulesForGeneration,
  getRuleCounts,
  type ReviewScope,
} from "@/lib/server/selah-brain";
import { loadMark8RuntimePreview } from "@/lib/server/studio-mark8-preflight-loader";
import {
  buildMark8StudioPreflightResponse,
  MARK_8_PREFLIGHT_ERROR,
  MARK_8_STUDIO_SLUG,
  connectedChapterLabel,
  isConnectedStudioSlug,
  studioPreflightError,
} from "@/lib/studio-mark8-preflight";
import {
  mintStudioPreviewAccess,
  STUDIO_PREVIEW_COOKIE,
  STUDIO_PREVIEW_MAX_AGE_SECONDS,
  studioPreviewCookiePath,
} from "@/lib/server/studio-preview-access";
import {
  getMark8StudioSetupStatus,
  isMark8StudioSetupError,
  runMark8StudioSetup,
} from "@/lib/server/mark8-studio-setup";
import {
  getMarkSprintStudioSetupStatus,
  isMarkSprintStudioSetupError,
  markSprintChapterLabel,
  markSprintFactorySetupFor,
  runMarkSprintStudioSetup,
} from "@/lib/server/mark-sprint-studio-setup";

// Admin generation control API. Auth = DEV_ADMIN_TOKEN (header x-admin-token).
// The Supabase service-role key never reaches the browser; all checks run here.
export const dynamic = "force-dynamic";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;

function authed(req: Request): boolean {
  const expected = process.env.DEV_ADMIN_TOKEN || "";
  const provided = req.headers.get("x-admin-token") || new URL(req.url).searchParams.get("token") || "";
  return Boolean(expected) && provided === expected;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await getGenerationSettings() });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  // Durable audit for every blocked attempt (Codex finding #5), then the
  // matching HTTP status: REFUSED→403, CONFLICT→409, WRITE_FAILED→500.
  async function refuse(slug: string, what: string, reason: string, status: number) {
    await logGenerationAudit({ action: `refused:${what}`, slug, status: "failed", message: reason.slice(0, 300) });
    return NextResponse.json({ ok: false, error: reason }, { status });
  }
  async function guardOrRefuse(slug: string, what: string, guardAction: MutationAction) {
    const guard = await chapterMutationDecision(slug, guardAction);
    if (!guard.allowed) return refuse(slug, what, guard.reason, 403);
    return null;
  }
  async function mapMutationError(slug: string, what: string, e: unknown) {
    if (isChapterMutationError(e)) {
      const status = e.code === "REFUSED" ? 403 : e.code === "CONFLICT" ? 409 : 500;
      return refuse(slug, what, `${e.code}: ${e.message}`, status);
    }
    return refuse(slug, what, String((e as Error).message ?? "unknown error").slice(0, 300), 500);
  }

  // ---- short-lived, read-only draft preview access ----
  // This cookie is accepted only by /dev/preview/<slug>. It cannot authorize
  // this admin API or any write, generation, image, or publish action.
  if (action === "preview_access") {
    const slug = String(body.slug ?? "");
    const value = mintStudioPreviewAccess(slug);
    const path = studioPreviewCookiePath(slug);
    if (!value || !path) {
      return NextResponse.json(
        { ok: false, error: "Studio could not open the draft preview." },
        { status: 400 },
      );
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(STUDIO_PREVIEW_COOKIE, value, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: STUDIO_PREVIEW_MAX_AGE_SECONDS,
      path,
    });
    return response;
  }

  // ---- exact private Mark 8 Brain + notes setup ----
  // This path never generates, fetches Scripture, changes settings, creates
  // images, or publishes. Both version-controlled approvals must already pass.
  if (action === "mark8_setup_status") {
    if (String(body.slug ?? "") !== MARK_8_STUDIO_SLUG) {
      return NextResponse.json({ ok: false, error: "Mark 8 setup is unavailable." }, { status: 400 });
    }
    try {
      return NextResponse.json({ ok: true, setup: await getMark8StudioSetupStatus() });
    } catch {
      return NextResponse.json({ ok: false, error: "Studio could not check Mark 8 setup." }, { status: 503 });
    }
  }
  if (action === "mark8_setup") {
    const auditSetup = async (
      status: "started" | "succeeded" | "failed",
      message: string,
    ) => {
      const recorded = await logGenerationAuditVerified({
        action: "mark8_setup",
        slug: MARK_8_STUDIO_SLUG,
        status,
        message,
      });
      if (!recorded) throw new Error("Mark 8 setup audit unavailable");
    };
    if (String(body.slug ?? "") !== MARK_8_STUDIO_SLUG || body.confirm !== true) {
      try {
        await auditSetup("failed", "refused:invalid_confirmation");
      } catch {
        console.error("[selah] Mark 8 setup refusal audit unavailable");
      }
      return NextResponse.json({ ok: false, error: "Mark 8 setup confirmation is required." }, { status: 400 });
    }
    const setupDigest = typeof body.setupDigest === "string" ? body.setupDigest : "";
    if (!LOWERCASE_SHA256.test(setupDigest)) {
      try {
        await auditSetup("failed", "refused:invalid_receipt");
      } catch {
        console.error("[selah] Mark 8 setup refusal audit unavailable");
      }
      return NextResponse.json({ ok: false, error: "The exact Mark 8 setup receipt is required." }, { status: 400 });
    }
    try {
      await auditSetup("started", "owner-confirmed private setup");
    } catch {
      return NextResponse.json(
        { ok: false, error: "Studio could not record the Mark 8 setup start. Nothing changed." },
        { status: 500 },
      );
    }
    try {
      const result = await runMark8StudioSetup(setupDigest);
      try {
        await auditSetup("succeeded", "99 Brain rules + 10 Mark 8 notes verified");
        return NextResponse.json({ ok: true, setup: result.status, result: result.result });
      } catch {
        // The verified setup writes are authoritative. Never tell the owner
        // they failed merely because the later activity record was unavailable.
        let setup = result.status;
        try {
          const reread = await getMark8StudioSetupStatus();
          if (reread.complete) setup = reread;
        } catch {
          // runMark8StudioSetup already performed an exact post-write readback.
        }
        return NextResponse.json({
          ok: true,
          setup,
          result: result.result,
          auditWarning: "Mark 8 setup succeeded, but its activity record is unavailable.",
        });
      }
    } catch (error) {
      const refused =
        isMark8StudioSetupError(error) &&
        ["UNAPPROVED", "DIGEST_MISMATCH", "REVIEW_REQUIRED"].includes(error.code);
      try {
        await auditSetup(
          "failed",
          `${refused ? "refused" : "failed"}:${isMark8StudioSetupError(error) ? error.code : "unknown"}`,
        );
      } catch {
        console.error("[selah] Mark 8 setup failure audit unavailable");
      }
      const status = isMark8StudioSetupError(error)
        ? error.code === "UNAPPROVED"
          ? 403
          : error.code === "DIGEST_MISMATCH" || error.code === "REVIEW_REQUIRED"
            ? 409
            : 500
        : 500;
      return NextResponse.json(
        {
          ok: false,
          error:
            status === 403
              ? "Selah Brain and the exact Mark 8 notes still need approval."
              : status === 409
                ? "Mark 8 setup changed or needs review. Nothing else was started."
                : "Studio could not safely finish Mark 8 setup.",
        },
        { status },
      );
    }
  }

  // ---- exact private factory Brain + notes setup (chapters after Mark 8) ----
  // Same guarantees as mark8_setup: never generates, fetches Scripture,
  // changes settings, creates images, or publishes. The chapter must have its
  // own owner receipt in mark-sprint-setup-contracts.ts (fail-closed).
  if (action === "mark_sprint_setup_status") {
    const setupSlug = String(body.slug ?? "");
    if (!markSprintFactorySetupFor(setupSlug)) {
      return NextResponse.json({ ok: false, error: "Chapter setup is unavailable." }, { status: 400 });
    }
    const label = markSprintChapterLabel(setupSlug);
    try {
      return NextResponse.json({ ok: true, setup: await getMarkSprintStudioSetupStatus(setupSlug) });
    } catch {
      return NextResponse.json({ ok: false, error: `Studio could not check ${label} setup.` }, { status: 503 });
    }
  }
  if (action === "mark_sprint_setup") {
    const setupSlug = String(body.slug ?? "");
    if (!markSprintFactorySetupFor(setupSlug)) {
      return NextResponse.json({ ok: false, error: "Chapter setup is unavailable." }, { status: 400 });
    }
    const label = markSprintChapterLabel(setupSlug);
    const auditSetup = async (
      status: "started" | "succeeded" | "failed",
      message: string,
    ) => {
      const recorded = await logGenerationAuditVerified({
        action: "mark_sprint_setup",
        slug: setupSlug,
        status,
        message,
      });
      if (!recorded) throw new Error(`${label} setup audit unavailable`);
    };
    if (body.confirm !== true) {
      try {
        await auditSetup("failed", "refused:invalid_confirmation");
      } catch {
        console.error(`[selah] ${label} setup refusal audit unavailable`);
      }
      return NextResponse.json({ ok: false, error: `${label} setup confirmation is required.` }, { status: 400 });
    }
    const setupDigest = typeof body.setupDigest === "string" ? body.setupDigest : "";
    if (!LOWERCASE_SHA256.test(setupDigest)) {
      try {
        await auditSetup("failed", "refused:invalid_receipt");
      } catch {
        console.error(`[selah] ${label} setup refusal audit unavailable`);
      }
      return NextResponse.json({ ok: false, error: `The exact ${label} setup receipt is required.` }, { status: 400 });
    }
    try {
      await auditSetup("started", "owner-confirmed private setup");
    } catch {
      return NextResponse.json(
        { ok: false, error: `Studio could not record the ${label} setup start. Nothing changed.` },
        { status: 500 },
      );
    }
    try {
      const result = await runMarkSprintStudioSetup(setupSlug, setupDigest);
      try {
        await auditSetup(
          "succeeded",
          `${result.status.ruleCount} Brain rules + ${result.status.noteCount} ${label} notes verified`,
        );
        return NextResponse.json({ ok: true, setup: result.status, result: result.result });
      } catch {
        // The verified setup writes are authoritative. Never tell the owner
        // they failed merely because the later activity record was unavailable.
        let setup = result.status;
        try {
          const reread = await getMarkSprintStudioSetupStatus(setupSlug);
          if (reread.complete) setup = reread;
        } catch {
          // runMarkSprintStudioSetup already performed an exact post-write readback.
        }
        return NextResponse.json({
          ok: true,
          setup,
          result: result.result,
          auditWarning: `${label} setup succeeded, but its activity record is unavailable.`,
        });
      }
    } catch (error) {
      const refused =
        isMarkSprintStudioSetupError(error) &&
        ["UNKNOWN_CHAPTER", "UNAPPROVED", "DIGEST_MISMATCH", "REVIEW_REQUIRED"].includes(error.code);
      try {
        await auditSetup(
          "failed",
          `${refused ? "refused" : "failed"}:${isMarkSprintStudioSetupError(error) ? error.code : "unknown"}`,
        );
      } catch {
        console.error(`[selah] ${label} setup failure audit unavailable`);
      }
      const status = isMarkSprintStudioSetupError(error)
        ? error.code === "UNAPPROVED" || error.code === "UNKNOWN_CHAPTER"
          ? 403
          : error.code === "DIGEST_MISMATCH" || error.code === "REVIEW_REQUIRED"
            ? 409
            : 500
        : 500;
      return NextResponse.json(
        {
          ok: false,
          error:
            status === 403
              ? `Selah Brain and the exact ${label} notes still need approval.`
              : status === 409
                ? `${label} setup changed or needs review. Nothing else was started.`
                : `Studio could not safely finish ${label} setup.`,
        },
        { status },
      );
    }
  }

  // ---- read-only Mark 8 owner preparation ----
  // Reads exact live Brain/notes/example evidence plus ESV Mark 7–9. It cannot
  // claim a job, call a model, write Supabase, publish, or authorize a run.
  if (action === "mark_sprint_prepare") {
    const prepareSlug = String(body.slug ?? "");
    if (!isConnectedStudioSlug(prepareSlug)) {
      return NextResponse.json({ ok: false, error: MARK_8_PREFLIGHT_ERROR }, { status: 400 });
    }
    try {
      const preview = await loadMark8RuntimePreview(prepareSlug);
      return NextResponse.json(buildMark8StudioPreflightResponse(preview, prepareSlug));
    } catch {
      // Do not reveal which key, service, row, or source check is unavailable.
      return NextResponse.json(
        { ok: false, error: studioPreflightError(prepareSlug) },
        { status: 503 },
      );
    }
  }

  // ---- save settings ----
  if (action === "save") {
    const requested = body.settings;
    if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
      return NextResponse.json({ ok: false, error: "invalid settings" }, { status: 400 });
    }
    const values = requested as Record<string, unknown>;
    if (
      typeof values.text_generation_enabled !== "boolean" ||
      typeof values.image_generation_enabled !== "boolean" ||
      typeof values.require_confirm !== "boolean"
    ) {
      return NextResponse.json({ ok: false, error: "invalid settings" }, { status: 400 });
    }
    // Studio owns only the visible safety switches. Preserve the server-managed
    // chapter allowlist, model choices, and budget even if a stale/older client
    // includes them in its request.
    const updated = await updateGenerationSettings({
      text_generation_enabled: values.text_generation_enabled,
      image_generation_enabled: values.image_generation_enabled,
      require_confirm: values.require_confirm,
    });
    try {
      await logGenerationAudit({ action: "update_settings", status: updated ? "succeeded" : "failed" });
    } catch {
      // The settings write is authoritative. An audit outage must not make
      // Studio claim that a switch stayed unchanged after it actually saved.
      console.error(`[selah] settings audit failed after ${updated ? "save" : "failed save"}`);
    }
    return NextResponse.json({ ok: Boolean(updated), settings: updated });
  }

  // ---- publish a draft ----
  if (action === "publish") {
    const slug = String(body.slug ?? "");
    try {
      const status = await publishChapter(slug, {
        reviewDigest:
          typeof body.reviewDigest === "string" ? body.reviewDigest : undefined,
        sourceOverlapReportDigest:
          typeof body.sourceOverlapReportDigest === "string"
            ? body.sourceOverlapReportDigest
            : undefined,
      });
      try {
        await logGenerationAudit({ action: "publish", slug, status: "succeeded" });
      } catch {
        // The publish write is authoritative. An audit outage must never make
        // Studio report failure after the chapter is already live.
        console.error(`[selah] publish audit failed after ${slug} was published`);
      }
      return NextResponse.json({ ok: true, slug, status });
    } catch (e) {
      if (isChapterMutationError(e)) {
        const status = e.code === "REFUSED" ? 403 : e.code === "CONFLICT" ? 409 : 500;
        return refuse(slug, "publish", e.message, status);
      }
      return refuse(slug, "publish", "Studio could not safely publish this chapter.", 500);
    }
  }

  // ---- poll a chapter's status (for the Generate Draft progress UI) ----
  if (action === "status") {
    const slug = String(body.slug ?? "");
    return NextResponse.json({ ok: true, slug, ...(await getStudioChapterStatus(slug)) });
  }

  // ---- Selah Brain review (does this feel like Selah?) ----
  // Saves a chapter note; future/both also creates an active global rule.
  if (action === "feedback") {
    const ok = await submitReview({
      slug: String(body.slug ?? ""),
      verdict: String(body.verdict ?? "yes") as "yes" | "needs_work",
      note: typeof body.note === "string" ? body.note : "",
      scope: String(body.scope ?? "chapter") as ReviewScope,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    });
    return NextResponse.json({ ok });
  }

  // ---- Selah Brain rules (Advanced Settings → What Selah Has Learned) ----
  if (action === "rules_list") {
    return NextResponse.json({ ok: true, rules: await listGlobalRules() });
  }
  if (action === "rule_toggle") {
    const ok = await setRuleActive(String(body.id ?? ""), body.active === true);
    return NextResponse.json({ ok });
  }
  if (action === "rule_delete") {
    const ok = await deleteRule(String(body.id ?? ""));
    return NextResponse.json({ ok });
  }
  // Seed the v1.1 library (idempotent). Rules only — never generates a chapter.
  if (action === "rules_seed") {
    const result = await seedFromLibrary();
    return NextResponse.json({ ok: !result.error, ...result, counts: await getRuleCounts() });
  }
  // Preview which rules would be retrieved for a chapter (no generation).
  if (action === "rules_select") {
    return NextResponse.json({ ok: true, selection: await selectRulesForGeneration(String(body.slug ?? ""), "copy_generation") });
  }
  if (action === "rules_counts") {
    return NextResponse.json({ ok: true, counts: await getRuleCounts() });
  }

  // ---- draft version history (Compare Versions) ----
  if (action === "versions_list") {
    return NextResponse.json({ ok: true, versions: await listVersions(String(body.slug ?? "")) });
  }
  if (action === "version_get") {
    const workup = await getVersionWorkup(String(body.slug ?? ""), Number(body.version));
    return NextResponse.json({ ok: Boolean(workup), workup });
  }
  if (action === "version_restore") {
    const slug = String(body.slug ?? "");
    const blocked = await guardOrRefuse(slug, "version_restore", "restoreVersion");
    if (blocked) return blocked;
    const ok = await restoreVersion(slug, Number(body.version));
    if (!ok) return refuse(slug, "version_restore", "restore failed or conflicted — nothing was written", 409);
    return NextResponse.json({ ok: true });
  }
  if (action === "versions_snapshot") {
    const version = await snapshotVersion(String(body.slug ?? ""), typeof body.label === "string" ? body.label : undefined);
    return NextResponse.json({ ok: version !== null, version });
  }
  if (action === "version_apply") {
    const slug = String(body.slug ?? "");
    const blocked = await guardOrRefuse(slug, "version_apply", "applyMergedDraft");
    if (blocked) return blocked;
    const result = await applyMergedDraft(
      slug,
      body.workup as ChapterWorkup,
      typeof body.label === "string" ? body.label : undefined,
    );
    if (!result.ok) return refuse(slug, "version_apply", "merge failed or conflicted — nothing was written", 409);
    return NextResponse.json({ ok: true, version: result.version });
  }

  // ---- image model availability probe (no image generated, no cost) ----
  if (action === "image_model_check") {
    const result = await checkImageModel(typeof body.model === "string" ? body.model : undefined);
    return NextResponse.json(result);
  }

  // ---- image generation (Image Preview stage; separate kill switch) ----
  // Order matters: guard → kill switch → model PROBE (no cost) → atomic
  // single-use claim → authenticated trigger. A failed trigger RELEASES the
  // claim (truthfully reported if release fails) — never a stranded claim.
  if (action === "generate_images") {
    const slug = String(body.slug ?? "");
    const blocked = await guardOrRefuse(slug, "generate_images", "updateChapterWorkupJson");
    if (blocked) return blocked;
    if (!(await imageGenAllowed(slug))) {
      return refuse(
        slug,
        "generate_images",
        "Image generation not allowed — needs Image Generation ON, the slug allowlisted, and an approved image plan.",
        403,
      );
    }
    let store: ReturnType<typeof requireJobStore>;
    try {
      store = requireJobStore(slug, "generate_images");
    } catch (error) {
      return mapMutationError(slug, "generate_images", error);
    }
    let binding: Awaited<ReturnType<typeof prepareImageJobBinding>>;
    try {
      binding = await prepareImageJobBinding(
        store,
        slug,
        typeof body.sourceOverlapReportDigest === "string"
          ? body.sourceOverlapReportDigest
          : undefined,
      );
    } catch (error) {
      return mapMutationError(slug, "generate_images", error);
    }
    if (
      isConnectedStudioSlug(slug) &&
      (!binding ||
        body.approvedImagePlanDigest !== binding.planDigest ||
        body.approvedImageModel !== binding.model ||
        body.approvedImageCount !== binding.imageCount)
    ) {
      return refuse(
        slug,
        "generate_images",
        `The ${connectedChapterLabel(slug)} image plan changed after you reviewed its count and cost. Check the plan again before spending credit.`,
        409,
      );
    }
    const probe = await checkImageModel(
      binding?.model ?? (typeof body.model === "string" ? body.model : undefined),
    );
    if (!probe.ok) {
      return refuse(slug, "generate_images", `image model "${probe.model}" unavailable: ${probe.error}`, 502);
    }
    let imageJobId: string;
    try {
      const claim = await claimImageJob(store, slug, binding);
      imageJobId = claim.jobId;
    } catch (e) {
      return mapMutationError(slug, "generate_images", e);
    }
    await logGenerationAudit({ action: "generate_images", slug, status: "started", message: `job ${imageJobId}` });
    const triggered = await triggerBackgroundImageGeneration(
      slug,
      new URL(req.url).host,
      imageJobId,
      binding,
    );
    if (!triggered.ok) {
      const released = await releaseImageJob(store, slug, imageJobId, "queued");
      return refuse(
        slug,
        "generate_images",
        `background trigger failed (${triggered.error ?? `HTTP ${triggered.status}`}) — ` +
          (released ? "image claim released" : "image claim could NOT be released; the row may still hold a stale claim"),
        released ? 502 : 500,
      );
    }
    return NextResponse.json({ ok: true, triggered: true, slug, jobId: imageJobId });
  }
  if (action === "images_status") {
    const slug = String(body.slug ?? "");
    let row;
    try {
      row = await requireJobStore(slug, "images_status").read(slug);
    } catch {
      return NextResponse.json({ ok: false, error: "image status unavailable" }, { status: 500 });
    }
    if (!row || "error" in row) {
      return NextResponse.json(
        { ok: false, error: row && "error" in row ? "image status unavailable" : "draft not found" },
        { status: row ? 500 : 404 },
      );
    }
    const workup = row.workupJson as unknown as ChapterWorkup;
    const imgs = Array.isArray(workup.images) ? workup.images : [];
    const stored = imgs.filter((image) => image.status === "complete" && /^https:\/\//u.test(image.src));
    const rawState = row.workupJson[IMAGE_JOB_STATE_KEY];
    const hasActiveJob = typeof row.workupJson[IMAGE_JOB_KEY] === "string";
    const state = hasActiveJob && ["queued", "running", "failed", "blocked"].includes(String(rawState))
      ? String(rawState)
      : "idle";
    const spentCountValue = Number(row.workupJson[IMAGE_JOB_SPENT_COUNT_KEY]);
    const spentCount = Number.isSafeInteger(spentCountValue) && spentCountValue >= 0
      ? Math.min(spentCountValue, imgs.length)
      : 0;
    const connectedImageSlug = isConnectedStudioSlug(slug);
    const reviewDigest = connectedImageSlug
      ? markSprintFinalReviewDigest(slug, workup)
      : null;
    let estimatedCostUsd: number | undefined;
    let mark8Plan: ReturnType<typeof deriveMarkSprintImagePlan> | null = null;
    if (connectedImageSlug) {
      try {
        mark8Plan = deriveMarkSprintImagePlan(slug, workup);
        const exactCount = mark8Plan.images.length;
        estimatedCostUsd = Math.round(exactCount * MARK_8_IMAGE_ESTIMATED_COST_USD * 1000) / 1000;
      } catch {
        return NextResponse.json(
          { ok: false, error: `${connectedChapterLabel(slug)} image plan is not ready.` },
          { status: 409 },
        );
      }
    }
    const done = connectedImageSlug
      ? reviewDigest !== null
      : imgs.length > 0 && stored.length === imgs.length;
    return NextResponse.json({
      ok: true,
      slug,
      total: imgs.length,
      stored: stored.length,
      done,
      state,
      spentCount,
      ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
      ...(mark8Plan === null ? {} : { planDigest: mark8Plan.digest }),
      heroKind: workup.heroKind ?? null,
      ...(mark8Plan !== null
        ? { model: MARK_8_IMAGE_MODEL }
        : hasActiveJob && typeof row.workupJson[IMAGE_JOB_MODEL_KEY] === "string"
        ? { model: row.workupJson[IMAGE_JOB_MODEL_KEY] }
        : {}),
      ...(state === "blocked"
        ? { errorCode: "cost_record_failed" }
        : state === "failed"
          ? {
              errorCode:
                row.workupJson[IMAGE_JOB_ERROR_CODE_KEY] === "completion_conflict"
                  ? "completion_conflict"
                  : "image_run_failed",
            }
          : {}),
      images: imgs.map((image) => ({
        kind: image.kind,
        label: image.label,
        description: image.description ?? "",
        status:
          (state === "queued" || state === "running") && image.status !== "complete"
            ? "generating"
            : ["placeholder", "generating", "complete", "failed"].includes(String(image.status))
              ? image.status
              : "placeholder",
      })),
      ...(reviewDigest === null ? {} : { reviewDigest }),
    });
  }

  // ---- Selah Brain approved examples ----
  if (action === "examples_list") {
    return NextResponse.json({ ok: true, examples: await listExamples() });
  }
  if (action === "example_add") {
    const ok = await addExample({
      title: String(body.title ?? ""),
      genre: String(body.genre ?? ""),
      example_type: String(body.example_type ?? "voice"),
      content: String(body.content ?? ""),
      source_title: typeof body.source_title === "string" ? body.source_title : undefined,
    });
    return NextResponse.json({ ok });
  }
  if (action === "example_toggle") {
    const ok = await setExampleActive(String(body.id ?? ""), body.active === true);
    return NextResponse.json({ ok });
  }
  if (action === "example_delete") {
    const ok = await deleteExample(String(body.id ?? ""));
    return NextResponse.json({ ok });
  }
  // Preview which TEXT examples would be retrieved for a chapter (no generation).
  if (action === "examples_select") {
    const ex = await getRelevantExamples(String(body.slug ?? ""), { types: TEXT_EXAMPLE_TYPES });
    return NextResponse.json({ ok: true, examples: ex.map((e) => ({ title: e.title, exampleType: e.exampleType, chars: e.content.length })) });
  }

  // ---- recent activity (Advanced Settings audit panel) ----
  if (action === "audit") {
    return NextResponse.json({ ok: true, entries: await getAuditLog() });
  }

  // ---- generate a draft (text only) ----
  if (action === "generate") {
    const slug = String(body.slug ?? "");
    // Issue #8 mutation guard: published/protected chapters cannot be regenerated.
    const blocked = await guardOrRefuse(slug, "generate", "createGeneratingChapterWorkup");
    if (blocked) return blocked;
    const protectedMarkSprint = isProtectedMarkSprintGenerationIdentity({ slug });

    // Mark 8 is the only protected sprint chapter connected to the worker.
    // Its owner-confirmed manifest digest is carried through the atomic claim,
    // signed trigger, worker authentication, and every cleanup/terminal write.
    // Mark 9–11 remain blocked and can never fall through to generic generation.
    if (protectedMarkSprint) {
      if (!isConnectedStudioSlug(slug)) {
        return refuse(
          slug,
          "generate",
          "blocked — only owner-approved protected chapters are connected",
          403,
        );
      }
      const approvedManifestDigest =
        typeof body.approvedManifestDigest === "string"
          ? body.approvedManifestDigest
          : "";
      if (!LOWERCASE_SHA256.test(approvedManifestDigest)) {
        return refuse(
          slug,
          "generate",
          `${connectedChapterLabel(slug)} requires the exact prepared manifest digest`,
          400,
        );
      }
      if (body.confirm !== true) {
        return refuse(slug, "generate", "confirmation required", 400);
      }

      let settings = await getGenerationSettings();
      if (!settings.text_generation_enabled) {
        return refuse(
          slug,
          "generate",
          "Text Generation is OFF — turn it on in Advanced Settings.",
          403,
        );
      }
      // Validate the parsed identity BEFORE any settings write — a request
      // that will be refused must never leave the chapter in allowed_slugs
      // (PR #30 review, hole 3).
      const parsedIdentity = parseSlug(slug);
      if (
        !parsedIdentity ||
        parsedIdentity.book !== "Mark" ||
        `mark-${parsedIdentity.chapter}` !== slug
      ) {
        return refuse(slug, "generate", "blocked — protected chapter identity mismatch", 400);
      }
      // Studio promises chapter access is automatic. Only after the exact
      // digest, owner confirmation, identity check, and text switch pass may
      // this one chapter be added; refused requests never change settings.
      if (!settings.allowed_slugs.includes(slug)) {
        const updated = await updateGenerationSettings({
          allowed_slugs: [...settings.allowed_slugs, slug],
        });
        if (!updated || !updated.allowed_slugs.includes(slug)) {
          return refuse(
            slug,
            "generate",
            `Studio could not approve ${connectedChapterLabel(slug)} for this private draft.`,
            500,
          );
        }
        settings = updated;
      }
      if (!(await mark8GenerationAllowed(slug))) {
        return refuse(
          slug,
          "generate",
          `blocked — protected ${connectedChapterLabel(slug)} generation is not fully configured`,
          403,
        );
      }

      const parsed = parsedIdentity;

      let jobId: string;
      try {
        jobId = await claimGenerationJob(
          requireJobStore(slug, "generate"),
          slug,
          {
            book: parsed.book,
            chapter: parsed.chapter,
            title: `${parsed.book} ${parsed.chapter}`,
            source: "generated",
            approvedManifestDigest,
            ...(body.confirmDiscardCompletedImages === true
              ? { allowDiscardCompletedImages: ALLOW_DISCARD_COMPLETED_IMAGES }
              : {}),
          },
        );
      } catch (e) {
        return mapMutationError(slug, "generate", e);
      }

      const triggered = await triggerBackgroundGeneration(
        slug,
        new URL(req.url).host,
        jobId,
        approvedManifestDigest,
      );
      if (!triggered.ok) {
        const cleanup = await failGenerationJob(
          requireJobStore(slug, "generate"),
          slug,
          jobId,
          `trigger failed: ${triggered.error ?? triggered.status}`,
          {
            expectedState: "queued",
            approvedManifestDigest,
          },
        );
        const cleanupNote =
          cleanup === "marked_failed"
            ? "job marked failed"
            : cleanup === "conflict"
              ? "the job already started or was superseded; nothing was overwritten"
              : "CLEANUP WRITE FAILED — the row may still be marked generating";
        return refuse(
          slug,
          "generate",
          `background trigger failed (${triggered.error ?? `HTTP ${triggered.status}`}) — ${cleanupNote}`,
          cleanup === "write_failed" ? 500 : 502,
        );
      }

      return NextResponse.json({
        ok: true,
        triggered: true,
        slug,
        jobId,
        model: settings.selected_text_model,
        note: `Creating one private ${connectedChapterLabel(slug)} draft. Nothing is published.`,
      });
    }

    const confirm = body.confirm === true || body.confirm === "yes";
    const settings = await getGenerationSettings();

    if (settings.require_confirm && !confirm) {
      return NextResponse.json({ ok: false, error: "confirmation required", requireConfirm: true });
    }
    // Kill switch: text generation must be enabled.
    if (!settings.text_generation_enabled) {
      return NextResponse.json(
        { ok: false, error: "Text Generation is OFF — turn it on in Advanced Settings." },
        { status: 403 },
      );
    }
    // Temporarily allow the picked slug server-side (so the picker drives the
    // allowlist — no manual typing). Persists in allowed_slugs.
    if (!settings.allowed_slugs.includes(slug)) {
      await updateGenerationSettings({ allowed_slugs: [...settings.allowed_slugs, slug] });
    }
    if (!(await generationAllowed(slug))) {
      return NextResponse.json({ ok: false, error: "blocked — generation not allowed for this slug" }, { status: 403 });
    }
    const status = await getChapterStatus(slug);
    if (status === "generating") {
      return NextResponse.json({ ok: false, error: "already generating — wait for it to finish" });
    }

    const parsed = parseSlug(slug);
    if (!parsed) return refuse(slug, "generate", "unparseable slug", 400);
    let jobId: string;
    try {
      // ONE atomic claim with a unique job id — the worker only verifies it.
      // If this fails, NO trigger and NO success-shaped response follow.
      jobId = await claimGenerationJob(requireJobStore(slug, "generate"), slug, {
        book: parsed.book,
        chapter: parsed.chapter,
        title: `${parsed.book} ${parsed.chapter}`,
        source: "generated",
      });
    } catch (e) {
      return mapMutationError(slug, "generate", e);
    }
    const triggered = await triggerBackgroundGeneration(slug, new URL(req.url).host, jobId);
    if (!triggered.ok) {
      // The chapter must never be stranded as "generating" by a failed trigger:
      // fail the claimed job (pinned to this job id) and report the CLEANUP
      // OUTCOME truthfully — a failed cleanup write means the row may still
      // say "generating", and the response must never claim otherwise.
      const cleanup = await failGenerationJob(
        requireJobStore(slug, "generate"),
        slug,
        jobId,
        `trigger failed: ${triggered.error ?? triggered.status}`,
        { expectedState: "queued" },
      );
      const cleanupNote =
        cleanup === "marked_failed"
          ? "job marked failed"
          : cleanup === "conflict"
            ? "the job already started or was superseded; nothing was overwritten"
            : "CLEANUP WRITE FAILED — the row may still be marked generating";
      return refuse(
        slug,
        "generate",
        `background trigger failed (${triggered.error ?? `HTTP ${triggered.status}`}) — ${cleanupNote}`,
        cleanup === "write_failed" ? 500 : 502,
      );
    }
    return NextResponse.json({
      ok: true,
      triggered: true,
      slug,
      model: settings.selected_text_model,
      note: `Generating "${slug}" as a DRAFT in the background. It saves to Supabase (hidden from public). Preview it, then Publish.`,
    });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
