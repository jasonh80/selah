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
  protectedTextRunConfigured,
  protectedTextRunConnected,
  parseSlug,
} from "@/lib/server/generate-chapter-workup";
import {
  getChapterReviewedAt,
  getChapterStatus,
  getStudioChapterStatus,
  publishChapter,
} from "@/lib/server/chapter-workups-repository";
import { listRecentCostEvents } from "@/lib/server/cost-events-repository";
import { buildStudioChapterInfoResponse } from "@/lib/studio-chapter-info";
import { shapeStudioCostHistory } from "@/lib/studio-cost-history";
import { BUILD_ID } from "@/lib/build";
import {
  claimGenerationJob,
  claimImageJob,
  claimImageRedoJob,
  applyImageRedoCandidate,
  rejectImageRedoCandidate,
  releaseImageRedoJob,
  failGenerationJob,
  releaseImageJob,
  requireJobStore,
  IMAGE_JOB_ERROR_CODE_KEY,
  IMAGE_JOB_KEY,
  IMAGE_JOB_MODEL_KEY,
  IMAGE_JOB_SPENT_COUNT_KEY,
  IMAGE_JOB_STATE_KEY,
  IMAGE_REDO_BINDING_DIGEST_KEY,
  IMAGE_REDO_CANDIDATE_URL_KEY,
  IMAGE_REDO_ERROR_CODE_KEY,
  IMAGE_REDO_JOB_KEY,
  IMAGE_REDO_KIND_KEY,
  IMAGE_REDO_NOTES_KEY,
  IMAGE_REDO_SPENT_COUNT_KEY,
  IMAGE_REDO_STATE_KEY,
  ALLOW_DISCARD_COMPLETED_IMAGES,
  hasTransientJobControlKeys,
} from "@/lib/server/generation-jobs";
import {
  triggerBackgroundGeneration,
  triggerBackgroundImageGeneration,
  triggerBackgroundImageRedo,
} from "@/lib/server/trigger-generation";
import {
  imageGenAllowed,
  checkImageModel,
  prepareImageJobBinding,
  prepareImageRedoBinding,
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
import {
  connectedChapterReceiptAppliesIncludingStored,
  readStoredSetupApproval,
  recordStoredSetupApproval,
} from "@/lib/server/chapter-setup-approvals";
import { markSprintStoredApprovalApplies } from "@/lib/server/mark-sprint-setup-contracts";
import { isMarkSprintSlug } from "@/lib/server/mark-sprint-manifest-policy";
import { buildPrepareChapterProposal } from "@/lib/server/prepare-chapter-proposal";

// Admin generation control API. Auth = DEV_ADMIN_TOKEN (header x-admin-token).
// The Supabase service-role key never reaches the browser; all checks run here.
export const dynamic = "force-dynamic";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;

// Shape-parse the owner's edited Prepare-Chapter notes. Structural validity
// against the chapter's reviewed note set (ids, order, count, size caps) is
// enforced by packetNotesValidFor inside the proposal builder.
function readSubmittedPacketNotes(
  value: unknown,
): Array<{ id: string; text: string }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const notes: Array<{ id: string; text: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const id = (item as { id?: unknown }).id;
    const text = (item as { text?: unknown }).text;
    if (typeof id !== "string" || typeof text !== "string") return null;
    notes.push({ id, text });
  }
  return notes;
}

// The packet the Prepare screen would serve for this chapter RIGHT NOW: the
// owner's recorded (possibly edited) packet when a valid approval row exists,
// else the version-controlled artifact. Both the status action and the
// approve base-digest check read through this, so what the owner opened is
// provably what the server still shows — a recorded-but-unseeded approval is
// resumed with its exact edits instead of being silently shadowed by the
// pristine artifact (adversarial review findings 1 and 2).
async function currentPreparePacket(slug: string) {
  const stored = await readStoredSetupApproval(slug);
  const packet =
    stored?.packet_notes && markSprintStoredApprovalApplies(slug, stored)
      ? stored.packet_notes
      : undefined;
  return packet;
}

// Shape the transient single-image-redo keys for the Studio status poll (so a
// page refresh recovers redo progress). Returns null when no redo is active.
const IMAGE_REDO_STATES = ["queued", "running", "candidate", "failed", "blocked"] as const;
function redoStatusFor(
  json: Record<string, unknown>,
): { redo: Record<string, unknown> } | null {
  const jobId = json[IMAGE_REDO_JOB_KEY];
  const rawState = json[IMAGE_REDO_STATE_KEY];
  if (
    typeof jobId !== "string" ||
    !IMAGE_REDO_STATES.includes(rawState as (typeof IMAGE_REDO_STATES)[number])
  ) {
    return null;
  }
  const spentRaw = Number(json[IMAGE_REDO_SPENT_COUNT_KEY]);
  const candidateUrl = json[IMAGE_REDO_CANDIDATE_URL_KEY];
  const bindingDigest = json[IMAGE_REDO_BINDING_DIGEST_KEY];
  const errorCode = json[IMAGE_REDO_ERROR_CODE_KEY];
  return {
    redo: {
      kind: typeof json[IMAGE_REDO_KIND_KEY] === "string" ? json[IMAGE_REDO_KIND_KEY] : "",
      state: rawState,
      notes: typeof json[IMAGE_REDO_NOTES_KEY] === "string" ? json[IMAGE_REDO_NOTES_KEY] : "",
      spentCount: Number.isSafeInteger(spentRaw) && spentRaw >= 0 ? spentRaw : 0,
      ...(typeof candidateUrl === "string" && /^https:\/\//u.test(candidateUrl)
        ? { candidateUrl }
        : {}),
      ...(typeof bindingDigest === "string" ? { bindingDigest } : {}),
      ...(typeof errorCode === "string" && errorCode !== "" ? { errorCode } : {}),
    },
  };
}

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

  // ---- Prepare Chapter screen (owner decision A5, board #29, 2026-07-16) ----
  // prepare_chapter_status is READ-ONLY: it returns the Brain's proposal built
  // entirely from the reviewed version-controlled artifacts plus whether the
  // owner's approval already applies. It cannot generate, fetch Scripture,
  // change settings, create images, or publish.
  if (action === "prepare_chapter_status") {
    const prepareSlug = String(body.slug ?? "");
    if (!buildPrepareChapterProposal(prepareSlug) || !markSprintFactorySetupFor(prepareSlug)) {
      return NextResponse.json(
        { ok: false, error: "This chapter cannot be prepared on-screen yet." },
        { status: 400 },
      );
    }
    try {
      // Serve the owner's recorded edited packet when one exists — a
      // recorded-but-unseeded approval resumes with its exact edits.
      const proposal = buildPrepareChapterProposal(
        prepareSlug,
        await currentPreparePacket(prepareSlug),
      );
      if (!proposal) {
        return NextResponse.json(
          { ok: false, error: "This chapter cannot be prepared on-screen yet." },
          { status: 400 },
        );
      }
      const approved = await connectedChapterReceiptAppliesIncludingStored(prepareSlug);
      let setupComplete = false;
      if (approved) {
        try {
          setupComplete = (await getMarkSprintStudioSetupStatus(prepareSlug)).complete;
        } catch {
          setupComplete = false;
        }
      }
      return NextResponse.json({
        ok: true,
        prepare: { ...proposal, approved, setupComplete },
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `Studio could not check ${markSprintChapterLabel(prepareSlug)} preparation.`,
        },
        { status: 503 },
      );
    }
  }
  // prepare_chapter_preview is READ-ONLY and pure: given the owner's edited
  // note texts it recomputes the exact digest that packet would bind, so the
  // screen can show — and the approve request can echo — a digest derived
  // from precisely the texts on screen (PR #40 review, item 6). No database,
  // no writes, no spend.
  if (action === "prepare_chapter_preview") {
    const prepareSlug = String(body.slug ?? "");
    if (!markSprintFactorySetupFor(prepareSlug)) {
      return NextResponse.json(
        { ok: false, error: "This chapter cannot be prepared on-screen yet." },
        { status: 400 },
      );
    }
    const notes = readSubmittedPacketNotes(body.notes);
    const proposal = notes ? buildPrepareChapterProposal(prepareSlug, notes) : null;
    if (!proposal) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The edited notes do not match this chapter's reviewed structure. Every note needs its own non-empty text.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, setupDigest: proposal.setupDigest });
  }
  // prepare_chapter_approve records the owner's ONE approval of the exact
  // on-screen packet (digest-bound, audited) — including any inline note
  // edits, which are stored with the approval and bound by its digests —
  // then runs the same reconciling note seeder the code-receipted chapters
  // use. It never generates text or images, never fetches Scripture, and
  // never publishes — the existing confirm-before-spend flow still guards
  // every credit.
  if (action === "prepare_chapter_approve") {
    const prepareSlug = String(body.slug ?? "");
    const factory = markSprintFactorySetupFor(prepareSlug);
    const submittedNotes =
      body.notes === undefined ? undefined : readSubmittedPacketNotes(body.notes);
    const proposal =
      factory && submittedNotes !== null
        ? buildPrepareChapterProposal(prepareSlug, submittedNotes)
        : null;
    if (!proposal || !factory) {
      return NextResponse.json(
        {
          ok: false,
          error:
            submittedNotes === null
              ? "The edited notes do not match this chapter's reviewed structure. Nothing was approved."
              : "This chapter cannot be prepared on-screen yet.",
        },
        { status: 400 },
      );
    }
    const label = proposal.label;
    const auditPrepare = async (
      status: "started" | "succeeded" | "failed",
      message: string,
    ) => {
      const recorded = await logGenerationAuditVerified({
        action: "prepare_chapter_approve",
        slug: prepareSlug,
        status,
        message,
      });
      if (!recorded) throw new Error(`${label} preparation audit unavailable`);
    };
    if (body.confirm !== true) {
      try {
        await auditPrepare("failed", "refused:invalid_confirmation");
      } catch {
        console.error(`[selah] ${label} preparation refusal audit unavailable`);
      }
      return NextResponse.json(
        { ok: false, error: `${label} preparation confirmation is required.` },
        { status: 400 },
      );
    }
    // TWO digest checks (adversarial review, finding 2). The BASE digest
    // proves the packet the owner OPENED is the packet the server would
    // still serve right now — so movements, watch-outs, locations, and
    // settings changing underneath the read always refuse, even when the
    // edited-notes digest is fetched fresh at click time. The setup digest
    // then binds the exact (possibly edited) notes being approved.
    const baseDigest = typeof body.baseSetupDigest === "string" ? body.baseSetupDigest : "";
    let servedNow: string | null = null;
    try {
      servedNow =
        buildPrepareChapterProposal(prepareSlug, await currentPreparePacket(prepareSlug))
          ?.setupDigest ?? null;
    } catch {
      servedNow = null;
    }
    if (!servedNow || baseDigest !== servedNow) {
      try {
        await auditPrepare("failed", "refused:base_digest_mismatch");
      } catch {
        console.error(`[selah] ${label} preparation refusal audit unavailable`);
      }
      return NextResponse.json(
        { ok: false, error: `The ${label} proposal changed after you read it. Reload and review it again.` },
        { status: 409 },
      );
    }
    const approvedDigest = typeof body.setupDigest === "string" ? body.setupDigest : "";
    if (approvedDigest !== proposal.setupDigest) {
      try {
        await auditPrepare("failed", "refused:digest_mismatch");
      } catch {
        console.error(`[selah] ${label} preparation refusal audit unavailable`);
      }
      return NextResponse.json(
        { ok: false, error: `The ${label} proposal changed after you read it. Reload and review it again.` },
        { status: 409 },
      );
    }
    try {
      await auditPrepare("started", "owner approved the on-screen packet");
    } catch {
      return NextResponse.json(
        { ok: false, error: `Studio could not record the ${label} preparation start. Nothing changed.` },
        { status: 500 },
      );
    }
    // The approval-row write and the later note seeding are reported
    // SEPARATELY (PR #40 review, blocker 4): a failed row write must never
    // read as "Your approval is saved."
    // Whether the owner edited anything: compare against the unedited
    // artifact digest so identical resubmissions stay recorded as unedited.
    const editedPacket =
      submittedNotes !== undefined &&
      buildPrepareChapterProposal(prepareSlug)?.setupDigest !== proposal.setupDigest
        ? submittedNotes
        : null;
    try {
      // The approval row binds the exact reviewed packet — including any
      // owner-edited note texts, stored alongside so every later gate can
      // rebuild and re-verify this exact contract. Recording it is what
      // makes the seeding runner's receipt check pass.
      await recordStoredSetupApproval({
        scope: factory.contract.scope,
        slug: factory.contract.slug,
        approved_by: "Jason Hales (owner)",
        approved_at: new Date().toISOString(),
        evidence: editedPacket
          ? "Owner reviewed the on-screen Prepare Chapter packet (movements, guidance notes, watch-outs, locations, textual variants) in Studio, edited note text inline, and approved the exact edited packet in one action; digests bound at approval time."
          : "Owner reviewed the on-screen Prepare Chapter packet (movements, guidance notes, watch-outs, locations, textual variants) in Studio and approved it in one action; digests bound at approval time.",
        guidance_digest: proposal.guidanceDigest,
        notes_digest: proposal.notesDigest,
        receipt_digest: proposal.setupDigest,
        packet_notes: editedPacket,
      });
    } catch {
      try {
        await auditPrepare("failed", "failed:approval_row_write");
      } catch {
        console.error(`[selah] ${label} approval-write failure audit unavailable`);
      }
      return NextResponse.json(
        {
          ok: false,
          error: `Studio could not record your ${label} approval. Nothing was saved — approve again when Studio can reach its records.`,
        },
        { status: 500 },
      );
    }
    try {
      const result = await runMarkSprintStudioSetup(prepareSlug, approvedDigest);
      try {
        await auditPrepare(
          "succeeded",
          `${result.status.ruleCount} Brain rules + ${result.status.noteCount} ${label} notes verified`,
        );
      } catch {
        console.error(`[selah] ${label} preparation success audit unavailable`);
      }
      return NextResponse.json({
        ok: true,
        prepared: true,
        setup: result.status,
        message: `${label} is prepared. Create the text draft when you're ready.`,
      });
    } catch (error) {
      try {
        await auditPrepare(
          "failed",
          `failed:${isMarkSprintStudioSetupError(error) ? error.code : "unknown"}`,
        );
      } catch {
        console.error(`[selah] ${label} preparation failure audit unavailable`);
      }
      const message = isMarkSprintStudioSetupError(error)
        ? error.code === "REVIEW_REQUIRED"
          ? `An existing ${label} note needs review before preparation. Your approval is recorded; nothing else was changed.`
          : error.code === "UNAPPROVED"
            ? `Selah Brain and the exact ${label} notes still need approval.`
            : `Your approval is recorded, but Studio could not finish seeding the ${label} notes. Try again.`
        : `Your approval is recorded, but Studio could not finish seeding the ${label} notes. Try again.`;
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
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

  // ---- read-only per-chapter launch info (issue #29 Studio polish) ----
  // Last publish time, the Selah build serving Studio, and the models a
  // launch would use. Reads only; cannot generate, write, or publish.
  if (action === "chapter_info") {
    const slug = String(body.slug ?? "");
    if (!slug) return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
    const settings = await getGenerationSettings();
    const lookup = await getChapterReviewedAt(slug);
    // A failed read must never render as "Not published yet" (P1-2). No
    // database detail is revealed — only that the facts are unavailable.
    if (lookup.kind === "unavailable") {
      return NextResponse.json(
        { ok: false, error: "Chapter details are unavailable right now." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      buildStudioChapterInfoResponse(slug, {
        reviewedAt: lookup.reviewedAt,
        buildId: BUILD_ID,
        textModel: settings.selected_text_model,
        // Protected chapters pin gpt-image-2 via their exact image binding.
        imageModel: isConnectedStudioSlug(slug)
          ? MARK_8_IMAGE_MODEL
          : settings.selected_image_model,
      }),
    );
  }

  // ---- read-only spend history (issue #29 cost-ledger groundwork) ----
  // Allowlisted fields only; raw metadata (errors, digests, job ids) never
  // reaches the browser. Reads only; records nothing and spends nothing.
  if (action === "cost_history") {
    const events = await listRecentCostEvents(50);
    // A failed read must never render as "$0 spent / no history" (P1-2).
    if (events === null) {
      return NextResponse.json(
        { ok: false, error: "Spend history is unavailable right now." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, events: shapeStudioCostHistory(events) });
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
  // Whole-workup writers must never run over a LIVE job claim or an
  // unresolved redo candidate: the write would erase paid work (or hide a
  // blocked, unrecorded spend) with neither a decision nor an audit trail.
  // This pre-check exists for the CLEAR error message; the race itself is
  // closed by the write, which asserts the absence of every transient job
  // key in its own conditional predicates (Codex review, PR #51 P1). An
  // unreadable row FAILS CLOSED here — never "assume idle".
  async function refuseVersionWriteDuringActiveJob(slug: string, what: string) {
    let row;
    try {
      row = await requireJobStore(slug, what).read(slug);
    } catch (error) {
      return mapMutationError(slug, what, error);
    }
    if (row && "error" in row) {
      return refuse(slug, what, "the chapter row is unreadable — nothing was written (fail closed)", 503);
    }
    if (row && hasTransientJobControlKeys(row.workupJson)) {
      return refuse(
        slug,
        what,
        "a generation, image, or redo job is active or unresolved on this chapter — resolve it before restoring or merging drafts",
        409,
      );
    }
    return null;
  }
  if (action === "version_restore") {
    const slug = String(body.slug ?? "");
    const blocked = await guardOrRefuse(slug, "version_restore", "restoreVersion");
    if (blocked) return blocked;
    const busy = await refuseVersionWriteDuringActiveJob(slug, "version_restore");
    if (busy) return busy;
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
    const busy = await refuseVersionWriteDuringActiveJob(slug, "version_apply");
    if (busy) return busy;
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
    // The exact owner setup receipt must still apply BEFORE the image claim
    // (PR #40 review, blocker 2) — a deleted or drifted receipt (stored row
    // or code literal) blocks paid image work exactly as it blocks text. The
    // worker re-runs this same freshly-recomputed gate again immediately
    // before model spend.
    if (
      isMarkSprintSlug(slug) &&
      !(await connectedChapterReceiptAppliesIncludingStored(slug))
    ) {
      return refuse(
        slug,
        "generate_images",
        `blocked — ${markSprintChapterLabel(slug)}'s exact owner setup receipt is missing or changed; no image credit was used`,
        403,
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
        // The admin-only per-image src powers the Studio review thumbnails and
        // the redo comparison; only completed stored HTTPS urls are surfaced.
        src:
          image.status === "complete" && /^https:\/\//u.test(image.src) ? image.src : "",
        status:
          (state === "queued" || state === "running") && image.status !== "complete"
            ? "generating"
            : ["placeholder", "generating", "complete", "failed"].includes(String(image.status))
              ? image.status
              : "placeholder",
      })),
      ...(reviewDigest === null ? {} : { reviewDigest }),
      ...(redoStatusFor(row.workupJson) ?? {}),
    });
  }

  // ---- single-image redo (board #29 owner decision, 2026-07-17) ----
  // Four steps, each separately owner-driven: FREE preflight (exact model,
  // size, max charge, binding digest) → ONE paid candidate (no auto-retry)
  // → owner Use (swaps exactly one src, snapshot first) or Reject (chapter
  // untouched). Draft chapters only; published chapters refuse via the same
  // mutation guard as every other write.
  if (action === "redo_image_preflight") {
    const slug = String(body.slug ?? "");
    const kind = String(body.kind ?? "");
    const notes = typeof body.notes === "string" ? body.notes : "";
    const blocked = await guardOrRefuse(slug, "redo_image_preflight", "updateChapterWorkupJson");
    if (blocked) return blocked;
    if (!(await imageGenAllowed(slug))) {
      return refuse(
        slug,
        "redo_image_preflight",
        "Image generation not allowed — needs Image Generation ON and the chapter allowlisted.",
        403,
      );
    }
    if (
      isMarkSprintSlug(slug) &&
      !(await connectedChapterReceiptAppliesIncludingStored(slug))
    ) {
      return refuse(
        slug,
        "redo_image_preflight",
        `blocked — ${markSprintChapterLabel(slug)}'s exact owner setup receipt is missing or changed`,
        403,
      );
    }
    let store: ReturnType<typeof requireJobStore>;
    try {
      store = requireJobStore(slug, "redo_image_preflight");
    } catch (error) {
      return mapMutationError(slug, "redo_image_preflight", error);
    }
    try {
      const row = await store.read(slug);
      const json = (row && !("error" in row) && row.workupJson) || {};
      if (typeof json[IMAGE_JOB_KEY] === "string") {
        return refuse(slug, "redo_image_preflight", "a full image job is active or unresolved for this chapter", 409);
      }
      if (
        typeof json[IMAGE_REDO_JOB_KEY] === "string" &&
        json[IMAGE_REDO_STATE_KEY] !== "failed"
      ) {
        return refuse(
          slug,
          "redo_image_preflight",
          "an image redo is already in progress or awaiting your decision — resolve it first",
          409,
        );
      }
      const redo = await prepareImageRedoBinding(store, slug, kind, notes);
      return NextResponse.json({
        ok: true,
        slug,
        redo: {
          kind: redo.kind,
          index: redo.index,
          label: redo.label,
          notes: redo.notes,
          model: redo.model,
          size: redo.size,
          estimatedCostUsd: redo.estimatedCostUsd,
          bindingDigest: redo.bindingDigest,
        },
      });
    } catch (error) {
      return mapMutationError(slug, "redo_image_preflight", error);
    }
  }
  if (action === "redo_image") {
    const slug = String(body.slug ?? "");
    const kind = String(body.kind ?? "");
    const notes = typeof body.notes === "string" ? body.notes : "";
    const bindingDigest = typeof body.bindingDigest === "string" ? body.bindingDigest : "";
    if (body.confirm !== true) {
      return refuse(slug, "redo_image", "confirmation required", 400);
    }
    const blocked = await guardOrRefuse(slug, "redo_image", "updateChapterWorkupJson");
    if (blocked) return blocked;
    if (!(await imageGenAllowed(slug))) {
      return refuse(
        slug,
        "redo_image",
        "Image generation not allowed — needs Image Generation ON and the chapter allowlisted.",
        403,
      );
    }
    if (
      isMarkSprintSlug(slug) &&
      !(await connectedChapterReceiptAppliesIncludingStored(slug))
    ) {
      return refuse(
        slug,
        "redo_image",
        `blocked — ${markSprintChapterLabel(slug)}'s exact owner setup receipt is missing or changed; no image credit was used`,
        403,
      );
    }
    let store: ReturnType<typeof requireJobStore>;
    try {
      store = requireJobStore(slug, "redo_image");
    } catch (error) {
      return mapMutationError(slug, "redo_image", error);
    }
    let fresh: Awaited<ReturnType<typeof prepareImageRedoBinding>>;
    try {
      fresh = await prepareImageRedoBinding(store, slug, kind, notes);
    } catch (error) {
      return mapMutationError(slug, "redo_image", error);
    }
    if (fresh.bindingDigest !== bindingDigest) {
      return refuse(
        slug,
        "redo_image",
        "The image or your redo request changed after you reviewed its cost. Check it again before spending credit.",
        409,
      );
    }
    const probe = await checkImageModel(fresh.model);
    if (!probe.ok) {
      return refuse(slug, "redo_image", `image model "${probe.model}" unavailable: ${probe.error}`, 502);
    }
    let redoJobId: string;
    try {
      const claim = await claimImageRedoJob(store, slug, { kind, notes, bindingDigest });
      redoJobId = claim.jobId;
    } catch (e) {
      return mapMutationError(slug, "redo_image", e);
    }
    await logGenerationAudit({
      action: "redo_image",
      slug,
      status: "started",
      message: `job ${redoJobId} — one candidate for "${fresh.kind}"`,
    });
    const triggered = await triggerBackgroundImageRedo(slug, new URL(req.url).host, redoJobId, {
      bindingDigest,
      kind: fresh.kind,
      model: fresh.model,
    });
    if (!triggered.ok) {
      const released = await releaseImageRedoJob(store, slug, redoJobId, "queued");
      return refuse(
        slug,
        "redo_image",
        `background trigger failed (${triggered.error ?? `HTTP ${triggered.status}`}) — ` +
          (released
            ? "redo claim released"
            : "redo claim could NOT be released; the row may still hold a stale claim"),
        released ? 502 : 500,
      );
    }
    return NextResponse.json({ ok: true, triggered: true, slug, jobId: redoJobId });
  }
  if (action === "redo_image_apply") {
    const slug = String(body.slug ?? "");
    const kind = String(body.kind ?? "");
    const candidateUrl = typeof body.candidateUrl === "string" ? body.candidateUrl : "";
    if (body.confirm !== true) {
      return refuse(slug, "redo_image_apply", "confirmation required", 400);
    }
    const blocked = await guardOrRefuse(slug, "redo_image_apply", "updateChapterWorkupJson");
    if (blocked) return blocked;
    let store: ReturnType<typeof requireJobStore>;
    try {
      store = requireJobStore(slug, "redo_image_apply");
    } catch (error) {
      return mapMutationError(slug, "redo_image_apply", error);
    }
    // Pre-validate the exact candidate BEFORE the snapshot: a refused apply
    // (double-click after success, stale tab, wrong url) must not append a
    // version row — and must never write a POST-apply state under the
    // "before-image-redo-apply" label, which would defeat the rollback. The
    // atomic conditional write below still guards the race.
    try {
      const row = await store.read(slug);
      const json = (row && !("error" in row) && row.workupJson) || {};
      if (
        json[IMAGE_REDO_STATE_KEY] !== "candidate" ||
        json[IMAGE_REDO_KIND_KEY] !== kind ||
        json[IMAGE_REDO_CANDIDATE_URL_KEY] !== candidateUrl
      ) {
        return refuse(
          slug,
          "redo_image_apply",
          "the redo candidate changed or was resolved after you reviewed it",
          409,
        );
      }
    } catch (error) {
      return mapMutationError(slug, "redo_image_apply", error);
    }
    // Rollback snapshot FAIL-CLOSED before the one-image swap: no snapshot,
    // no mutation ("Snapshot before every regeneration or image run").
    const version = await snapshotVersion(slug, "before-image-redo-apply");
    if (version === null) {
      return refuse(
        slug,
        "redo_image_apply",
        "Studio could not save a rollback snapshot, so nothing was changed. Try again.",
        500,
      );
    }
    try {
      await applyImageRedoCandidate(store, slug, { kind, candidateUrl });
    } catch (e) {
      return mapMutationError(slug, "redo_image_apply", e);
    }
    await logGenerationAudit({
      action: "image_redo_applied",
      slug,
      status: "succeeded",
      message: `"${kind}" now uses the approved candidate (rollback snapshot v${version})`,
    });
    return NextResponse.json({ ok: true, slug, kind, src: candidateUrl });
  }
  if (action === "redo_image_reject") {
    const slug = String(body.slug ?? "");
    const blocked = await guardOrRefuse(slug, "redo_image_reject", "updateChapterWorkupJson");
    if (blocked) return blocked;
    let store: ReturnType<typeof requireJobStore>;
    try {
      store = requireJobStore(slug, "redo_image_reject");
    } catch (error) {
      return mapMutationError(slug, "redo_image_reject", error);
    }
    const rejected = await rejectImageRedoCandidate(store, slug);
    if (!rejected) {
      return refuse(
        slug,
        "redo_image_reject",
        "Nothing was cleared — the candidate may already be resolved, the request may still be live, or the redo needs attention (blocked spend stays locked).",
        409,
      );
    }
    await logGenerationAudit({
      action: "image_redo_rejected",
      slug,
      status: "succeeded",
      message: "candidate rejected; the chapter is unchanged (file stays orphaned in its job directory)",
    });
    return NextResponse.json({ ok: true, slug });
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
      // The exact per-chapter owner receipt must apply BEFORE any settings
      // write, job claim, or worker trigger — a connected slug whose receipt
      // is missing or drifted is refused with nothing mutated (PR #32 review,
      // blocker 2 / the original PR #30 hole-3 invariant). Prepare-Chapter
      // approvals (Mark 9+) live as digest-bound rows, so the stored-aware
      // gate is consulted here.
      if (!(await connectedChapterReceiptAppliesIncludingStored(slug))) {
        return refuse(
          slug,
          "generate",
          `blocked — ${connectedChapterLabel(slug)}'s exact owner setup receipt is missing or changed; nothing was modified`,
          403,
        );
      }
      // EVERY refusal-capable check runs BEFORE the allowlist write (PR #40
      // review, blocker 1): a refused request must never leave the chapter
      // persisted in allowed_slugs. Membership in the runnable protected set
      // and the environment prerequisites are the last pure checks; after the
      // write, only writes (claim/trigger) remain, and the authenticated
      // worker independently re-runs the full composite gate before spend.
      if (!protectedTextRunConnected(slug) || !protectedTextRunConfigured()) {
        return refuse(
          slug,
          "generate",
          `blocked — protected ${connectedChapterLabel(slug)} generation is not fully configured`,
          403,
        );
      }
      // Studio promises chapter access is automatic. Only after the exact
      // digest, owner confirmation, identity check, receipt, runnable
      // connection, and text switch pass may this one chapter be added;
      // refused requests never change settings.
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
    // EVERY refusal-capable check runs BEFORE the allowlist write (PR #40
    // review, blocker 1 — same invariant as the protected path): a refused
    // request must never leave a slug persisted in allowed_slugs.
    const parsed = parseSlug(slug);
    if (!parsed) return refuse(slug, "generate", "unparseable slug", 400);
    if (!protectedTextRunConfigured()) {
      return NextResponse.json(
        { ok: false, error: "blocked — generation not allowed for this slug" },
        { status: 403 },
      );
    }
    const status = await getChapterStatus(slug);
    if (status === "generating") {
      return NextResponse.json({ ok: false, error: "already generating — wait for it to finish" });
    }
    // Temporarily allow the picked slug server-side (so the picker drives the
    // allowlist — no manual typing). Persists in allowed_slugs. Only writes
    // after every pure check above passed, and the write is verified.
    if (!settings.allowed_slugs.includes(slug)) {
      const updated = await updateGenerationSettings({
        allowed_slugs: [...settings.allowed_slugs, slug],
      });
      if (!updated || !updated.allowed_slugs.includes(slug)) {
        return refuse(slug, "generate", "Studio could not approve this chapter for a draft.", 500);
      }
    }
    // Final composite re-check on live settings (identity, config, switch,
    // allowlist) — with the pre-write checks above this can only refuse on a
    // concurrent settings flip, and the allowlisted slug is then a legitimate
    // generic chapter, not a protected one.
    if (!(await generationAllowed(slug))) {
      return NextResponse.json({ ok: false, error: "blocked — generation not allowed for this slug" }, { status: 403 });
    }
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
