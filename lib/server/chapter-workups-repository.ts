import type { ChapterWorkup } from "../types";
import { isMarkSprintSlug } from "./mark-sprint-manifest-policy";
import { isProtectedMarkSprintGenerationIdentity } from "./generate-chapter-workup";
import {
  inspectSourceOverlapReview,
  sourceOverlapReviewAccepted,
} from "../source-overlap-review";
import { getSupabaseAdmin, warnSupabaseMissing } from "./supabase";
import {
  decideMutation,
  ChapterMutationError,
  type RowLookup,
} from "./protected-chapters";
import {
  IMAGE_JOB_ERROR_CODE_KEY,
  IMAGE_JOB_KEY,
  IMAGE_JOB_MODEL_KEY,
  IMAGE_JOB_PLAN_DIGEST_KEY,
  IMAGE_JOB_SPENT_COUNT_KEY,
  IMAGE_JOB_STATE_KEY,
  requireJobStore,
  type JobRow,
} from "./generation-jobs";
import {
  isStoredMarkSprintImageUrl,
  markSprintFinalReviewDigest,
  MARK_8_IMAGE_SLUG,
} from "./mark8-image-plan";
import { isConnectedStudioSlug } from "../studio-mark8-preflight";
import {
  buildMarkSprintSetupContract,
  connectedChapterReceiptApplies,
  markSprintScopedSetupApprovalApplies,
  type MarkSprintStudioSetupApproval,
} from "./mark-sprint-setup-contracts";
import { readStoredSetupApproval } from "./chapter-setup-approvals";

// NOTE (issue #8): the generation lifecycle (claim → verify → complete/fail)
// lives EXCLUSIVELY in generation-jobs.ts with single-use job ids. This module
// deliberately exposes no generating/save/fail mutators — there is no direct-
// repository path around the job claim.

/**
 * The ONLY place that knows about the chapter_workups table.
 *
 * Safe by design: when Supabase isn't configured, every function no-ops (read
 * functions return null/[]), so the registry can fall back to the local
 * fixture/registry without crashing. The registry will call these later.
 */

const TABLE = "chapter_workups";

// TEMPORARY (issue #8 PR 1 → remove in PR 3): protected legacy chapters stored
// as "ready" that remain publicly served until the validated PR 3 publisher
// migrates them to "reviewed". Mutation is blocked by PROTECTED_SLUGS anyway.
const LEGACY_PUBLIC_READY_EXCEPTIONS: readonly string[] = ["psalm-23"];

export type WorkupStatus = "draft" | "generating" | "ready" | "failed" | "reviewed";

export type StudioTextCreditStatus = "none" | "possible" | "used";
export interface StudioChapterStatus {
  status: string | null;
  failureMessage?: string;
  textCredit?: StudioTextCreditStatus;
  copyReview?:
    | { status: "warning"; reportDigest: string; findingCount: number }
    | { status: "invalid" };
  /**
   * Opaque revision of the stored draft (updated_at). Studio binds remembered
   * review approvals to this exact value: any drift — including out-of-band
   * writes while the owner works elsewhere — re-requires a fresh read.
   */
  draftRevision?: string;
}

const PRE_MODEL_FAILURES = new Set([
  "INVALID_INPUT",
  "CLAIM_NOT_CONSUMED",
  "CLAIM_CONSUME_WRITE_FAILED",
  "ESV_KEY_MISSING",
  "RUNTIME_STORAGE_MISSING",
  "PREPARATION_FAILED",
  "PREPARATION_REFUSED",
  "MANIFEST_DIGEST_MISMATCH",
  "PREFLIGHT_INVALID",
  "RUN_AUTHORIZATION_INVALID",
]);

/** Convert only allowlisted protected-run codes into safe owner guidance. */
export function safeProtectedMarkFailure(
  generationError: unknown,
): Omit<StudioChapterStatus, "status"> | null {
  if (typeof generationError !== "string") return null;
  const match = /^protected_mark_draft:([A-Z_]+)$/u.exec(generationError);
  if (!match) return null;
  const code = match[1];
  if (PRE_MODEL_FAILURES.has(code)) {
    return {
      failureMessage: "Studio stopped before the writing AI began. No text credit was used. Check readiness before trying again.",
      textCredit: "none",
    };
  }
  const failures: Record<string, Omit<StudioChapterStatus, "status">> = {
    RUN_DEADLINE_EXCEEDED: {
      failureMessage: "Studio reached its safe time limit. The writing AI may have started and some text credit may have been used. Check the chapter before trying again.",
      textCredit: "possible",
    },
    MODEL_EXECUTION_FAILED: {
      failureMessage: "The writing AI did not finish. Some text credit may have been used. Check the setup before trying again.",
      textCredit: "possible",
    },
    MODEL_RESPONSE_INVALID: {
      failureMessage: "The AI returned a draft Studio could not safely use. Text credit was used. Review the setup before trying again.",
      textCredit: "used",
    },
    SOURCE_OVERLAP_BLOCKED: {
      failureMessage: "Studio could not safely verify the Bible-wording check. Text credit was used. Do not retry until the checker is reviewed.",
      textCredit: "used",
    },
    MARK_QUALITY_BLOCKED: {
      failureMessage: "The draft finished but did not meet Selah's quality bar. Text credit was used. Review what failed before trying again.",
      textCredit: "used",
    },
    RESULT_DIGEST_MISMATCH: {
      failureMessage: "Studio could not verify the finished draft. Text credit was used. Do not retry until the saved plan is checked.",
      textCredit: "used",
    },
    COST_LOG_FAILED: {
      failureMessage: "The draft ran, but Studio could not safely record its cost. Text credit was used. Do not retry until this is checked.",
      textCredit: "used",
    },
    DRAFT_COMPLETION_FAILED: {
      failureMessage: "The draft finished, but Studio could not safely save it. Text credit was used. Check the saved chapter before trying again.",
      textCredit: "used",
    },
  };
  return failures[code] ?? null;
}

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
const MARK_8_IMAGE_JOB_KEYS = [
  IMAGE_JOB_KEY,
  IMAGE_JOB_STATE_KEY,
  IMAGE_JOB_PLAN_DIGEST_KEY,
  IMAGE_JOB_MODEL_KEY,
  IMAGE_JOB_SPENT_COUNT_KEY,
  IMAGE_JOB_ERROR_CODE_KEY,
] as const;

export type Mark8PublishValidation =
  | { ok: true; reviewDigest: string }
  | { ok: false; reason: string };

function sprintChapterLabel(slug: string): string {
  const match = /^mark-(\d+)$/u.exec(slug);
  return match ? `Mark ${match[1]}` : slug;
}

/**
 * Pure final protected-sprint publication check. The browser supplies only the
 * digest it approved; this function recomputes the identity from the complete
 * current workup and independently verifies the finished image run and
 * storage origin.
 */
export function validateMarkSprintPublishCandidate(
  slug: string,
  workup: ChapterWorkup,
  submittedReviewDigest: string | undefined,
  configuredSupabaseUrl: string | undefined,
  submittedSourceOverlapReportDigest?: string,
  storedReceiptApproval?: MarkSprintStudioSetupApproval | null,
): Mark8PublishValidation {
  const label = sprintChapterLabel(slug);
  // FAIL-CLOSED FIRST (PR #32 review, blocker 3): only an explicitly
  // connected chapter whose exact owner setup receipt still applies may even
  // attempt the strict validation. A Prepare-Chapter approval row (Mark 9+)
  // counts only when the async caller fetched it AND it matches this slug's
  // freshly recomputed contract — the function stays pure by validating the
  // supplied row itself rather than trusting a caller boolean. Chapters
  // without any receipt are unpublishable regardless of how complete an
  // out-of-band draft's images and digests look.
  const storedReceiptApplies =
    isMarkSprintSlug(slug) &&
    markSprintScopedSetupApprovalApplies(
      slug,
      buildMarkSprintSetupContract(slug),
      storedReceiptApproval ?? null,
    );
  if (
    !isConnectedStudioSlug(slug) ||
    (!connectedChapterReceiptApplies(slug) && !storedReceiptApplies)
  ) {
    return {
      ok: false,
      reason: `${label} is not an owner-approved publishable chapter yet. Nothing was published.`,
    };
  }
  const copyReview = sourceOverlapReviewAccepted(
    workup,
    submittedSourceOverlapReportDigest,
  );
  if (!copyReview.ok) {
    return { ok: false, reason: copyReview.reason };
  }
  if (!submittedReviewDigest || !LOWERCASE_SHA256.test(submittedReviewDigest)) {
    return {
      ok: false,
      reason: `Review the final ${label} chapter and images again before publishing.`,
    };
  }

  const raw = workup as unknown as Record<string, unknown>;
  if (MARK_8_IMAGE_JOB_KEYS.some((key) => Object.prototype.hasOwnProperty.call(raw, key))) {
    return {
      ok: false,
      reason: `${label} images are still being prepared or need attention. Finish that step before publishing.`,
    };
  }

  const freshReviewDigest = markSprintFinalReviewDigest(slug, workup);
  if (
    freshReviewDigest === null ||
    !Array.isArray(workup.images) ||
    !workup.images.every((image) => isStoredMarkSprintImageUrl(slug, image))
  ) {
    return {
      ok: false,
      reason: `${label} needs exactly 3 or 5 finished images from one completed image run before publishing.`,
    };
  }

  let expectedOrigin: string;
  try {
    const configured = new URL(configuredSupabaseUrl ?? "");
    if (configured.protocol !== "https:") throw new Error("unsafe protocol");
    expectedOrigin = configured.origin;
  } catch {
    return {
      ok: false,
      reason: "Selah's chapter image storage is not safely configured. Nothing was published.",
    };
  }

  const exactOrigin = workup.images.every((image) => {
    try {
      return new URL(image.src).origin === expectedOrigin;
    } catch {
      return false;
    }
  });
  if (!exactOrigin) {
    return {
      ok: false,
      reason: `One or more ${label} images are outside Selah's chapter image storage. Nothing was published.`,
    };
  }

  if (submittedReviewDigest !== freshReviewDigest) {
    return {
      ok: false,
      reason: `${label} changed after you reviewed it. Preview and approve the final chapter again.`,
    };
  }
  return { ok: true, reviewDigest: freshReviewDigest };
}

/** Frozen Mark 8 entry point (offline verifiers exercise this signature). */
export function validateMark8PublishCandidate(
  workup: ChapterWorkup,
  submittedReviewDigest: string | undefined,
  configuredSupabaseUrl: string | undefined,
  submittedSourceOverlapReportDigest?: string,
): Mark8PublishValidation {
  return validateMarkSprintPublishCandidate(
    MARK_8_IMAGE_SLUG,
    workup,
    submittedReviewDigest,
    configuredSupabaseUrl,
    submittedSourceOverlapReportDigest,
  );
}

function publishLookup(row: JobRow | null | { error: string }): RowLookup {
  if (row === null) return { kind: "missing" };
  if ("error" in row) return { kind: "error", message: row.error };
  return {
    kind: "row",
    row: { status: row.status, updatedAt: row.updatedAt },
  };
}

/**
 * PR #32 re-review P1: the read boundary applies the same alias-aware
 * fail-closed identity rule as the publish guard. A row may be served only if
 * it carries NO protected Mark sprint identity (request slug AND stored
 * workup slug/book/chapter both checked), or it is exactly a canonical
 * CONNECTED chapter whose stored workup identifies as itself AND whose owner
 * receipt applies (code literal, or a Prepare-Chapter approval row supplied
 * by the async caller and validated here). Already-stored alias rows
 * ("mark-09"), innocuously named rows smuggling a protected workup, and
 * unreceipted sprint chapters are never served — even if something marked
 * them "reviewed" out of band. Connecting a chapter to Studio (Mark 9) does
 * NOT loosen this boundary.
 */
export function protectedChapterServeAllowed(
  slug: string,
  workup: ChapterWorkup | null | undefined,
  storedReceiptApproval?: MarkSprintStudioSetupApproval | null,
): boolean {
  const stored = workup ?? undefined;
  const sprintIdentity =
    isProtectedMarkSprintGenerationIdentity({ slug }) ||
    isProtectedMarkSprintGenerationIdentity({
      slug: typeof stored?.slug === "string" ? stored.slug : "",
      ...(typeof stored?.book === "string" ? { book: stored.book } : {}),
      ...(typeof stored?.chapter === "number" ? { chapter: stored.chapter } : {}),
    });
  if (!sprintIdentity) return true;
  if (!isMarkSprintSlug(slug) || stored?.slug !== slug || !isConnectedStudioSlug(slug)) {
    return false;
  }
  const receipted =
    connectedChapterReceiptApplies(slug) ||
    markSprintScopedSetupApprovalApplies(
      slug,
      buildMarkSprintSetupContract(slug),
      storedReceiptApproval ?? null,
    );
  if (!receipted) return false;
  // The stored workup must identify as the SAME chapter in every field a
  // workup is required to carry — a "mark-7"-labeled row whose body says
  // Mark 9 (or another book) must never serve at the Mark 7 URL.
  const expectedChapter = Number(slug.split("-")[1]);
  return (
    typeof stored.book === "string" &&
    stored.book.trim().toLowerCase() === "mark" &&
    stored.chapter === expectedChapter
  );
}

/**
 * Returns the stored render workup for a chapter when a ready/reviewed row
 * exists, else null (caller falls back to the local source).
 */
export async function getChapterWorkupBySlug(slug: string): Promise<ChapterWorkup | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getChapterWorkupBySlug");
    return null;
  }

  // Issue #8 invariant 1: ONLY published ("reviewed") chapters are public.
  // Legacy "ready" rows are quarantined until they pass the publish gate.
  //
  // TEMPORARY, NAMED EXCEPTION (remove in PR 3): psalm-23 predates the publish
  // flow and is stored as legacy "ready". Publishing it through the CURRENT
  // publisher was rejected in review (it is the browser-trusting path PR 3
  // replaces), so this explicitly protected, immutable chapter stays served
  // until the validated PR 3 publisher migrates it. It cannot be mutated (the
  // guard protects it regardless of status), and no OTHER ready row is served.
  const servable = LEGACY_PUBLIC_READY_EXCEPTIONS.includes(slug)
    ? ["reviewed", "ready"]
    : ["reviewed"];
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,status")
    .eq("slug", slug)
    .in("status", servable)
    .maybeSingle();

  if (error) {
    console.error(`[selah] getChapterWorkupBySlug(${slug}) failed:`, error.message);
    return null;
  }
  const workup = (data?.workup_json as ChapterWorkup | undefined) ?? null;
  // Fetch the Prepare-Chapter approval only when the sync receipts don't
  // already answer (sprint slug without a code literal) — public reads of
  // ordinary chapters never touch the approvals table.
  const storedApproval =
    workup && isMarkSprintSlug(slug) && !connectedChapterReceiptApplies(slug)
      ? await readStoredSetupApproval(slug)
      : null;
  if (workup && !protectedChapterServeAllowed(slug, workup, storedApproval)) {
    console.error(`[selah] getChapterWorkupBySlug(${slug}) refused a protected alias/identity row`);
    return null;
  }
  return workup;
}

/** Fetch a workup at ANY status (incl. draft) — for admin preview only. */
export async function getDraftWorkup(
  slug: string,
): Promise<{ workup: ChapterWorkup; status: string } | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getDraftWorkup");
    return null;
  }
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,status")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data?.workup_json) return null;
  const workup = data.workup_json as ChapterWorkup;
  const storedApproval =
    isMarkSprintSlug(slug) && !connectedChapterReceiptApplies(slug)
      ? await readStoredSetupApproval(slug)
      : null;
  if (!protectedChapterServeAllowed(slug, workup, storedApproval)) {
    console.error(`[selah] getDraftWorkup(${slug}) refused a protected alias/identity row`);
    return null;
  }
  return { workup, status: (data.status as string) ?? "unknown" };
}

/** Promote a draft to published (status → reviewed). Returns the new status. */
export async function publishChapter(
  slug: string,
  options: { reviewDigest?: string; sourceOverlapReportDigest?: string } = {},
): Promise<string> {
  // Publishing promotes exactly a DRAFT (per-action transition). Legacy "ready"
  // rows and re-publishes are refused. Read status + revision + full workup ONCE,
  // validate that same snapshot, then condition the write on its exact revision.
  const store = requireJobStore(slug, "publishChapter");
  const row = await store.read(slug);
  const decision = decideMutation("publishChapter", slug, publishLookup(row));
  if (!decision.allowed || !decision.expected || row === null || "error" in row) {
    throw new ChapterMutationError("REFUSED", "publishChapter", slug, decision.reason);
  }

  // Every protected sprint chapter takes the strict final-review path — a
  // sprint draft (including one created out-of-band) can never use the
  // generic publish action while its owner receipt/reviews are unmet
  // (PR #30 review, hole 2). The identity check is ALIAS-AWARE on both the
  // row slug and the stored workup (PR #32 re-review): a stored row like
  // "mark-09", or an innocuously named row whose workup identifies as a
  // protected Mark chapter, must never slip through the generic path and
  // become publicly served at its raw URL.
  const storedWorkup = row.workupJson as unknown as ChapterWorkup;
  const protectedSprintIdentity =
    isProtectedMarkSprintGenerationIdentity({ slug }) ||
    isProtectedMarkSprintGenerationIdentity({
      slug: typeof storedWorkup?.slug === "string" ? storedWorkup.slug : "",
      ...(typeof storedWorkup?.book === "string" ? { book: storedWorkup.book } : {}),
      ...(typeof storedWorkup?.chapter === "number" ? { chapter: storedWorkup.chapter } : {}),
    });
  if (protectedSprintIdentity) {
    if (!isMarkSprintSlug(slug) || storedWorkup?.slug !== slug) {
      throw new ChapterMutationError(
        "REFUSED",
        "publishChapter",
        slug,
        "This row identifies as a protected Mark chapter under a non-canonical or mismatched slug and can never be published.",
      );
    }
    const validation = validateMarkSprintPublishCandidate(
      slug,
      storedWorkup,
      options.reviewDigest,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      options.sourceOverlapReportDigest,
      await readStoredSetupApproval(slug),
    );
    if (!validation.ok) {
      throw new ChapterMutationError("REFUSED", "publishChapter", slug, validation.reason);
    }
  }

  const now = new Date().toISOString();
  const changed = await store.update(
    slug,
    { status: decision.expected.status, updatedAt: decision.expected.updatedAt },
    {
      status: "reviewed" satisfies WorkupStatus,
      reviewed_at: now,
      updated_at: now,
    },
  );
  if (typeof changed === "object") {
    throw new ChapterMutationError("WRITE_FAILED", "publishChapter", slug, changed.error);
  }
  if (changed !== 1) {
    throw new ChapterMutationError(
      "CONFLICT", "publishChapter", slug,
      "This chapter changed after your review. Preview it again before publishing.",
    );
  }
  return "reviewed";
}

/**
 * Update ONLY workup_json on an existing row, leaving status/version untouched.
 * Used by image generation to swap placeholder images for stored ones without
 * touching the (already-reviewed) text. Never creates a row.
 */

/**
 * A failed read must never masquerade as the true fact "never published"
 * (PR #36 review, P1-2) — the two outcomes are distinct types.
 */
export type ChapterReviewedAtLookup =
  | { kind: "ok"; reviewedAt: string | null }
  | { kind: "unavailable" };

// TEST SEAM (offline verify only): feed a reviewed_at answer (or a simulated
// outage) so the read-only Studio chapter-info action can be asserted
// without Supabase.
let reviewedAtForTesting: Map<string, string | null> | "unavailable" | null = null;
export function __setReviewedAtForTesting(
  rows: Map<string, string | null> | "unavailable" | null,
): void {
  reviewedAtForTesting = rows;
}

/**
 * When the chapter was last published (reviewed_at). Read-only — feeds the
 * Studio per-chapter info panel (issue #29). reviewedAt null means the truth
 * "never published"; a read failure is reported as unavailable instead.
 */
export async function getChapterReviewedAt(slug: string): Promise<ChapterReviewedAtLookup> {
  if (reviewedAtForTesting === "unavailable") return { kind: "unavailable" };
  if (reviewedAtForTesting) {
    return { kind: "ok", reviewedAt: reviewedAtForTesting.get(slug) ?? null };
  }
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getChapterReviewedAt");
    return { kind: "unavailable" };
  }
  const { data, error } = await db
    .from(TABLE)
    .select("reviewed_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { kind: "unavailable" };
  const reviewedAt = data?.reviewed_at;
  return {
    kind: "ok",
    reviewedAt: typeof reviewedAt === "string" && reviewedAt ? reviewedAt : null,
  };
}

/** Raw status of a chapter row (any status), or null. */
export async function getChapterStatus(slug: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getChapterStatus");
    return null;
  }
  const { data, error } = await db
    .from(TABLE)
    .select("status,generation_started_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return (data?.status as string | undefined) ?? null;
}

// TEST SEAM (offline verify only): force the unreachable-store outcome
// deterministically. Verifiers must NEVER depend on Supabase env being
// absent — in the production BUILD environment the real keys exist, so an
// unseamed call would query the live database mid-build (this broke the
// production deploys of 2026-07-16).
let studioStatusUnavailableForTesting = false;
export function __setStudioStatusUnavailableForTesting(on: boolean): void {
  studioStatusUnavailableForTesting = on;
}

/** Status plus a small, allowlisted failure explanation for Selah Studio. */
export async function getStudioChapterStatus(slug: string): Promise<StudioChapterStatus> {
  if (studioStatusUnavailableForTesting) return { status: null };
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getStudioChapterStatus");
    return { status: null };
  }
  const { data, error } = await db
    .from(TABLE)
    .select("status,generation_error,workup_json,updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { status: null };
  const status = (data?.status as string | undefined) ?? null;
  const draftRevision =
    typeof data?.updated_at === "string" && data.updated_at ? data.updated_at : undefined;
  const safeFailure =
    isConnectedStudioSlug(slug) && status === "failed"
      ? safeProtectedMarkFailure(data?.generation_error)
      : null;
  const copyInspection = inspectSourceOverlapReview(data?.workup_json);
  const copyReview =
    copyInspection.kind === "warning"
      ? {
          status: "warning" as const,
          reportDigest: copyInspection.warning.reportDigest,
          findingCount: copyInspection.warning.findingCount,
        }
      : copyInspection.kind === "invalid" && data?.workup_json
        ? { status: "invalid" as const }
        : undefined;
  return {
    status,
    ...(safeFailure ?? {}),
    ...(copyReview ? { copyReview } : {}),
    ...(draftRevision ? { draftRevision } : {}),
  };
}



/** Mark a chapter's generation as failed so it can be retried/reviewed. */

/** All published workups (for browsing/sitemaps). Empty when unconfigured. */
export async function listReadyChapterWorkups(): Promise<ChapterWorkup[]> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("listReadyChapterWorkups");
    return [];
  }

  // Same temporary psalm-23 exception as getChapterWorkupBySlug (PR 3 removes).
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,slug,status")
    .or(`status.eq.reviewed,and(status.eq.ready,slug.in.(${LEGACY_PUBLIC_READY_EXCEPTIONS.join(",")}))`)
    .order("chapter", { ascending: true });

  if (error) {
    console.error("[selah] listReadyChapterWorkups failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.workup_json as ChapterWorkup);
}
