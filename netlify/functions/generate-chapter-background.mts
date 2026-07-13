// Netlify BACKGROUND function (note the "-background" suffix): runs up to 15 min,
// so deep OpenAI generation isn't killed by the request timeout.
//
// AUTHENTICATED single-use worker: POST-only, and every request must carry a
// signed, expiring job token bound to (text, slug, jobId) and, when present,
// the approved manifest digest minted by the route that took the atomic claim.
// The chosen generic/protected runner then atomically CONSUMES the claim
// (queued → running) — a duplicated delivery loses at that conditional write,
// before any paid model call. Refusals are durably audited, not just logged.
import {
  generateAndStoreChapter,
  generationAllowed,
  isProtectedMarkSprintGenerationIdentity,
  mark8GenerationAllowed,
} from "../../lib/server/generate-chapter-workup";
import {
  failGenerationJob,
  requireJobStore,
  verifyJobToken,
} from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";
import { runConfiguredProtectedMarkDraftJob } from "../../lib/server/mark-sprint-draft-job";

const MARK_8_SLUG = "mark-8";
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;

type ProtectedMarkDraftRunner = typeof runConfiguredProtectedMarkDraftJob;
let protectedMarkDraftRunnerOverride: ProtectedMarkDraftRunner | null = null;
type Mark8PermissionChecker = typeof mark8GenerationAllowed;
let mark8PermissionCheckerOverride: Mark8PermissionChecker | null = null;

/** Offline verification seam only. Production always uses the configured runner. */
export function __setProtectedMarkDraftRunnerForTesting(
  runner: ProtectedMarkDraftRunner | null,
): void {
  protectedMarkDraftRunnerOverride = runner;
}

/** Offline verification seam only. Production always reads live settings. */
export function __setMark8PermissionCheckerForTesting(
  checker: Mark8PermissionChecker | null,
): void {
  mark8PermissionCheckerOverride = checker;
}

async function refuse(slug: string, reason: string, status: number): Promise<Response> {
  await logGenerationAudit({
    action: "refused:worker_generate",
    slug: slug || undefined,
    status: "failed",
    message: reason.slice(0, 300),
  });
  return new Response(JSON.stringify({ ok: false, error: reason }), { status });
}

async function cleanupProtectedMark8Claim(
  slug: string,
  jobId: string,
  approvedManifestDigest: string,
  reason: string,
  baseStatus: number,
): Promise<Response> {
  try {
    const cleanup = await failGenerationJob(
      requireJobStore(slug, "worker_generate_mark8_cleanup"),
      slug,
      jobId,
      reason,
      {
        expectedState: "queued",
        approvedManifestDigest,
      },
    );
    const cleanupNote =
      cleanup === "marked_failed"
        ? "job marked failed"
        : cleanup === "conflict"
          ? "job already started, completed, or was superseded; nothing was overwritten"
          : "cleanup write failed; the job may still be marked generating";
    const status =
      cleanup === "write_failed"
        ? 500
        : cleanup === "conflict"
          ? 409
          : baseStatus;
    return refuse(slug, `${reason} — ${cleanupNote}`, status);
  } catch {
    return refuse(
      slug,
      `${reason} — cleanup was unavailable; the job may still be marked generating`,
      500,
    );
  }
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return refuse("", `method ${req.method} not allowed — worker accepts POST only`, 405);
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? body.slug : "";
  const jobId = typeof body.job === "string" ? body.job : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (body.approvedManifestDigest !== undefined && typeof body.approvedManifestDigest !== "string") {
    return refuse(slug, "invalid approved manifest digest — refusing unauthenticated work", 400);
  }
  const approvedManifestDigest = body.approvedManifestDigest as string | undefined;
  if (!slug || !jobId) {
    return refuse(slug, "missing slug or job id — refusing unclaimed work", 400);
  }
  if (
    slug === MARK_8_SLUG &&
    (approvedManifestDigest === undefined ||
      !LOWERCASE_SHA256.test(approvedManifestDigest))
  ) {
    return refuse(
      slug,
      "Mark 8 requires an exact approved manifest digest",
      400,
    );
  }
  const auth = verifyJobToken("text", slug, jobId, token, undefined, approvedManifestDigest);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }

  // Protected sprint chapters can never fall through to the generic generator.
  // Only Mark 8 is connected; Mark 9–11 remain explicitly blocked.
  if (isProtectedMarkSprintGenerationIdentity({ slug })) {
    if (slug !== MARK_8_SLUG || approvedManifestDigest === undefined) {
      return refuse(
        slug,
        "protected Mark sprint generation is not connected for this chapter",
        403,
      );
    }
    // Recheck the owner's live kill switch/permission immediately before the
    // protected runner can consume the claim or spend. Turning generation OFF
    // after the route queued this job therefore still stops it safely.
    let mark8Allowed: boolean;
    try {
      const checkPermission =
        mark8PermissionCheckerOverride ?? mark8GenerationAllowed;
      mark8Allowed = await checkPermission(slug);
    } catch {
      return cleanupProtectedMark8Claim(
        slug,
        jobId,
        approvedManifestDigest,
        "protected Mark 8 permission check failed",
        500,
      );
    }
    if (!mark8Allowed) {
      return cleanupProtectedMark8Claim(
        slug,
        jobId,
        approvedManifestDigest,
        "protected Mark 8 generation is OFF or no longer allowed",
        403,
      );
    }
    const runner =
      protectedMarkDraftRunnerOverride ?? runConfiguredProtectedMarkDraftJob;
    try {
      const result = await runner({
        slug,
        jobId,
        approvedManifestDigest,
      });
      if (result.ok) {
        return new Response(
          JSON.stringify({
            ok: true,
            slug,
            jobId,
            status: result.status,
            manifestDigest: result.manifestDigest,
          }),
          { status: 200 },
        );
      }
      await logGenerationAudit({
        action: "refused:worker_generate",
        slug,
        status: "failed",
        message: `protected Mark 8 runner stopped (${result.code})`,
      });
      const status =
        result.status === "conflict"
          ? 409
          : result.status === "refused"
            ? 403
            : 500;
      return new Response(
        JSON.stringify({
          ok: false,
          slug,
          jobId,
          status: result.status,
          code: result.code,
          manifestDigest: result.manifestDigest,
        }),
        { status },
      );
    } catch {
      console.error("[selah] protected Mark 8 draft runner failed");
      return cleanupProtectedMark8Claim(
        slug,
        jobId,
        approvedManifestDigest,
        "protected Mark 8 draft runner failed",
        500,
      );
    }
  }

  if (!(await generationAllowed(slug))) {
    return refuse(slug, "generation not allowed for this slug", 403);
  }
  try {
    const workup = await generateAndStoreChapter(slug, jobId, approvedManifestDigest);
    return new Response(JSON.stringify({ ok: Boolean(workup), slug, jobId }), {
      status: workup ? 200 : 409,
    });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background generation error:", msg);
    await logGenerationAudit({ action: "refused:worker_generate", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
