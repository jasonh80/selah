import type { ChapterWorkup } from "../types";
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
  isStoredMark8ImageUrl,
  mark8FinalReviewDigest,
  MARK_8_IMAGE_SLUG,
} from "./mark8-image-plan";

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
      failureMessage: "Studio stopped the draft because it copied too much Bible wording. Text credit was used. Adjust the instructions before trying again.",
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

/**
 * Pure final Mark 8 publication check. The browser supplies only the digest it
 * approved; this function recomputes the identity from the complete current
 * workup and independently verifies the finished image run and storage origin.
 */
export function validateMark8PublishCandidate(
  workup: ChapterWorkup,
  submittedReviewDigest: string | undefined,
  configuredSupabaseUrl: string | undefined,
): Mark8PublishValidation {
  if (!submittedReviewDigest || !LOWERCASE_SHA256.test(submittedReviewDigest)) {
    return {
      ok: false,
      reason: "Review the final Mark 8 chapter and images again before publishing.",
    };
  }

  const raw = workup as unknown as Record<string, unknown>;
  if (MARK_8_IMAGE_JOB_KEYS.some((key) => Object.prototype.hasOwnProperty.call(raw, key))) {
    return {
      ok: false,
      reason: "Mark 8 images are still being prepared or need attention. Finish that step before publishing.",
    };
  }

  const freshReviewDigest = mark8FinalReviewDigest(workup);
  if (
    freshReviewDigest === null ||
    !Array.isArray(workup.images) ||
    !workup.images.every(isStoredMark8ImageUrl)
  ) {
    return {
      ok: false,
      reason: "Mark 8 needs exactly 3 or 5 finished images from one completed image run before publishing.",
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
      reason: "One or more Mark 8 images are outside Selah's chapter image storage. Nothing was published.",
    };
  }

  if (submittedReviewDigest !== freshReviewDigest) {
    return {
      ok: false,
      reason: "Mark 8 changed after you reviewed it. Preview and approve the final chapter again.",
    };
  }
  return { ok: true, reviewDigest: freshReviewDigest };
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
  return (data?.workup_json as ChapterWorkup | undefined) ?? null;
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
  return { workup: data.workup_json as ChapterWorkup, status: (data.status as string) ?? "unknown" };
}

/** Promote a draft to published (status → reviewed). Returns the new status. */
export async function publishChapter(
  slug: string,
  options: { reviewDigest?: string } = {},
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

  if (slug === MARK_8_IMAGE_SLUG) {
    const validation = validateMark8PublishCandidate(
      row.workupJson as unknown as ChapterWorkup,
      options.reviewDigest,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
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

/** Status plus a small, allowlisted failure explanation for Selah Studio. */
export async function getStudioChapterStatus(slug: string): Promise<StudioChapterStatus> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getStudioChapterStatus");
    return { status: null };
  }
  const { data, error } = await db
    .from(TABLE)
    .select("status,generation_error")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { status: null };
  const status = (data?.status as string | undefined) ?? null;
  const safeFailure =
    slug === MARK_8_IMAGE_SLUG && status === "failed"
      ? safeProtectedMarkFailure(data?.generation_error)
      : null;
  return { status, ...(safeFailure ?? {}) };
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
