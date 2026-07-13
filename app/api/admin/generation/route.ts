import { NextResponse } from "next/server";
import {
  getGenerationSettings,
  updateGenerationSettings,
  logGenerationAudit,
  type GenerationSettings,
} from "@/lib/server/generation-settings";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import {
  getChapterStatus,
  getDraftWorkup,
  publishChapter,
} from "@/lib/server/chapter-workups-repository";
import {
  claimGenerationJob,
  claimImageJob,
  failGenerationJob,
  releaseImageJob,
  requireJobStore,
} from "@/lib/server/generation-jobs";
import { triggerBackgroundGeneration, triggerBackgroundImageGeneration } from "@/lib/server/trigger-generation";
import { imageGenAllowed, checkImageModel } from "@/lib/server/images";
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

// Admin generation control API. Auth = DEV_ADMIN_TOKEN (header x-admin-token).
// The Supabase service-role key never reaches the browser; all checks run here.
export const dynamic = "force-dynamic";

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

  // ---- save settings ----
  if (action === "save") {
    const updated = await updateGenerationSettings((body.settings ?? {}) as Partial<GenerationSettings>);
    await logGenerationAudit({ action: "update_settings", status: updated ? "succeeded" : "failed" });
    return NextResponse.json({ ok: Boolean(updated), settings: updated });
  }

  // ---- publish a draft ----
  if (action === "publish") {
    const slug = String(body.slug ?? "");
    const draft = await getDraftWorkup(slug);
    if (!draft) return NextResponse.json({ ok: false, error: "no stored row for slug" }, { status: 404 });
    try {
      const status = await publishChapter(slug);
      await logGenerationAudit({ action: "publish", slug, status: "succeeded" });
      return NextResponse.json({ ok: true, slug, status });
    } catch (e) {
      return mapMutationError(slug, "publish", e);
    }
  }

  // ---- poll a chapter's status (for the Generate Draft progress UI) ----
  if (action === "status") {
    const slug = String(body.slug ?? "");
    return NextResponse.json({ ok: true, slug, status: await getChapterStatus(slug) });
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
    const probe = await checkImageModel(typeof body.model === "string" ? body.model : undefined);
    if (!probe.ok) {
      return refuse(slug, "generate_images", `image model "${probe.model}" unavailable: ${probe.error}`, 502);
    }
    let imageJobId: string;
    try {
      const claim = await claimImageJob(requireJobStore(slug, "generate_images"), slug);
      imageJobId = claim.jobId;
    } catch (e) {
      return mapMutationError(slug, "generate_images", e);
    }
    await logGenerationAudit({ action: "generate_images", slug, status: "started", message: `job ${imageJobId}` });
    const triggered = await triggerBackgroundImageGeneration(slug, new URL(req.url).host, imageJobId);
    if (!triggered.ok) {
      const released = await releaseImageJob(requireJobStore(slug, "generate_images"), slug, imageJobId);
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
    const row = await getDraftWorkup(slug);
    const imgs = row?.workup.images ?? [];
    const stored = imgs.filter((i) => /^https?:\/\//.test(i.src));
    return NextResponse.json({
      ok: true,
      slug,
      total: imgs.length,
      stored: stored.length,
      done: imgs.length > 0 && stored.length === imgs.length,
      urls: stored.map((i) => ({ kind: i.kind, src: i.src })),
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
      const cleanup = await failGenerationJob(requireJobStore(slug, "generate"), slug, jobId, `trigger failed: ${triggered.error ?? triggered.status}`);
      const cleanupNote =
        cleanup === "marked_failed"
          ? "job marked failed"
          : cleanup === "conflict"
            ? "a newer run owns this chapter; nothing was overwritten"
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
