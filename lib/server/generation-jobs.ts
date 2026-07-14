// SERVER-ONLY. Issue #8: authenticated, single-use generation job claims.
//
// Lifecycle: the ROUTE takes ONE atomic claim (unique job id, state "queued")
// and hands the worker a SIGNED, EXPIRING token. The worker CONSUMES the claim
// — an atomic conditional write flipping "queued" → "running" pinned to the
// exact job id — so a duplicated delivery loses at the write, not at a read.
// Every terminal write (complete/fail/release) re-asserts the job id and the
// row revision, refuses protected slugs, and treats a missing revision as
// fail-closed. An older worker can never overwrite, fail, or release a newer
// run: its predicates match zero rows, which is a typed CONFLICT.
//
// Job id + state live inside workup_json (jsonb) — no schema change. Storage
// is abstracted behind JobStorePort so the offline safety gate exercises the
// REAL route/worker orchestration against a fake store.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ChapterWorkup } from "../types";
import { sourceOverlapReviewAccepted } from "../source-overlap-review";
import { getSupabaseAdmin } from "./supabase";
import {
  decideMutation,
  isProtectedSlug,
  ChapterMutationError,
  type RowLookup,
} from "./protected-chapters";
import {
  assertMark8ImagesArePlaceholders,
  deriveMark8ImagePlan,
  MARK_8_IMAGE_MODEL,
  MARK_8_IMAGE_SLUG,
} from "./mark8-image-plan";

export const TEXT_JOB_KEY = "generationJobId";
export const TEXT_JOB_STATE_KEY = "generationJobState";
export const TEXT_JOB_MANIFEST_DIGEST_KEY = "generationApprovedManifestDigest";
export const IMAGE_JOB_KEY = "imageJobId";
export const IMAGE_JOB_STATE_KEY = "imageJobState";
export const IMAGE_JOB_PLAN_DIGEST_KEY = "imageJobPlanDigest";
export const IMAGE_JOB_MODEL_KEY = "imageJobModel";
export const IMAGE_JOB_SPENT_COUNT_KEY = "imageJobSpentCount";
export const IMAGE_JOB_ERROR_CODE_KEY = "imageJobErrorCode";

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/;

export interface JobRow {
  status: string;
  updatedAt: string | null;
  workupJson: Record<string, unknown>;
}

export interface JobPredicates {
  status: string;
  updatedAt?: string | null; // when provided non-null, asserted on the write
  /** Every listed workup_json key must equal its value (null = key absent). */
  json?: { key: string; equals: string | null }[];
}

export interface JobStorePort {
  read(slug: string): Promise<JobRow | null | { error: string }>;
  insert(slug: string, payload: Record<string, unknown>): Promise<"ok" | "duplicate" | { error: string }>;
  /** Conditional UPDATE honoring ALL predicates; returns changed-row count. */
  update(slug: string, predicates: JobPredicates, next: Record<string, unknown>): Promise<number | { error: string }>;
}

export interface ImageJobBinding {
  planDigest: string;
  model: string;
  sourceOverlapReportDigest?: string;
}

function toLookup(row: JobRow | null | { error: string }): RowLookup {
  if (row === null) return { kind: "missing" };
  if (typeof row === "object" && "error" in row) return { kind: "error", message: row.error };
  return { kind: "row", row: { status: row.status, updatedAt: row.updatedAt } };
}

export function newJobId(): string {
  return randomUUID(); // collision-resistant, never a timestamp
}

// ---------------- signed, expiring worker tokens ----------------

export type JobPurpose = "text" | "image";

// Reuses the existing admin secret when a dedicated one isn't configured.
// FAIL-CLOSED: with neither set, tokens can't be signed and workers refuse all
// requests — generation cannot run unauthenticated.
function jobTokenSecret(): string {
  return process.env.GENERATION_JOB_SECRET || process.env.DEV_ADMIN_TOKEN || "";
}

export const JOB_TOKEN_TTL_MS = 20 * 60 * 1000; // > the 15-min background budget

function tokenPayload(
  purpose: JobPurpose,
  slug: string,
  jobId: string,
  exp: number,
  approvedManifestDigest?: string,
): string {
  const base = `selah-job-v1|${purpose}|${slug}|${jobId}|${exp}`;
  return approvedManifestDigest === undefined
    ? base
    : `${base}|approvedManifestDigest=${approvedManifestDigest}`;
}

/** Sign a worker token. Throws (fail closed) when no secret is configured. */
export function signJobToken(
  purpose: JobPurpose,
  slug: string,
  jobId: string,
  now = Date.now(),
  approvedManifestDigest?: string,
): {
  token: string;
  exp: number;
} {
  if (approvedManifestDigest !== undefined && purpose !== "text") {
    throw new ChapterMutationError("REFUSED", "signJobToken", slug, "manifest binding is valid only for text jobs");
  }
  const manifestDigest = validateApprovedManifestDigest(
    approvedManifestDigest,
    "signJobToken",
    slug,
  );
  const secret = jobTokenSecret();
  if (!secret) {
    throw new ChapterMutationError("REFUSED", "signJobToken", slug, "no job-signing secret configured — refusing to trigger unauthenticated work");
  }
  const exp = now + JOB_TOKEN_TTL_MS;
  const sig = createHmac("sha256", secret)
    .update(tokenPayload(purpose, slug, jobId, exp, manifestDigest))
    .digest("hex");
  return { token: `${exp}.${sig}`, exp };
}

/** Verify a worker token: signature AND expiry. Constant-time comparison. */
export function verifyJobToken(
  purpose: JobPurpose,
  slug: string,
  jobId: string,
  token: string,
  now = Date.now(),
  approvedManifestDigest?: string,
): { ok: boolean; reason?: string } {
  if (approvedManifestDigest !== undefined && purpose !== "text") {
    return { ok: false, reason: "manifest binding is valid only for text jobs" };
  }
  if (approvedManifestDigest !== undefined && !LOWERCASE_SHA256.test(approvedManifestDigest)) {
    return { ok: false, reason: "invalid approved manifest digest" };
  }
  const secret = jobTokenSecret();
  if (!secret) return { ok: false, reason: "no job-signing secret configured" };
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed token" };
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed expiry" };
  const expected = createHmac("sha256", secret)
    .update(tokenPayload(purpose, slug, jobId, exp, approvedManifestDigest))
    .digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };
  if (now > exp) return { ok: false, reason: "token expired" };
  return { ok: true };
}

// ---------------- shared terminal-write guard ----------------

/**
 * Every consume/terminal write starts here: refuse protected slugs outright,
 * refuse unreadable rows, and refuse rows without a pinnable revision. Returns
 * the row so the caller can pin its conditional write to updatedAt + job id.
 */
async function readRowForTerminalWrite(
  store: JobStorePort,
  slug: string,
  action: string,
): Promise<JobRow> {
  if (isProtectedSlug(slug)) {
    throw new ChapterMutationError("REFUSED", action, slug, `"${slug}" is an explicitly protected chapter — terminal writes refuse it too`);
  }
  const row = await store.read(slug);
  if (!row || (typeof row === "object" && "error" in row)) {
    throw new ChapterMutationError("REFUSED", action, slug, "row unreadable — cannot verify claim (fail closed)");
  }
  if (row.updatedAt === null || row.updatedAt === "") {
    throw new ChapterMutationError("REFUSED", action, slug, "row has no updated_at revision — cannot pin the write (fail closed)");
  }
  return row;
}

export interface ClaimMeta {
  book: string;
  chapter: number;
  title: string;
  source?: string;
  bibleVersion?: string;
  /** Optional owner-approved manifest bound to this one text job. */
  approvedManifestDigest?: string;
  /**
   * Server-only approval to replace already completed images during a text
   * regeneration. A browser boolean cannot satisfy this unique-symbol token;
   * an authenticated server caller must import and pass it deliberately.
   */
  allowDiscardCompletedImages?: typeof ALLOW_DISCARD_COMPLETED_IMAGES;
}

export const ALLOW_DISCARD_COMPLETED_IMAGES = Symbol(
  "selah.allow-discard-completed-images",
);

const IMAGE_JOB_METADATA_KEYS = [
  IMAGE_JOB_KEY,
  IMAGE_JOB_STATE_KEY,
  IMAGE_JOB_PLAN_DIGEST_KEY,
  IMAGE_JOB_MODEL_KEY,
  IMAGE_JOB_SPENT_COUNT_KEY,
  IMAGE_JOB_ERROR_CODE_KEY,
] as const;

const PAID_IMAGE_JOB_STATES = new Set(["queued", "running", "failed", "blocked"]);

/**
 * Text completion replaces the entire workup, including its images. Refuse
 * that lifecycle while paid image work is active or unresolved, and require
 * an explicit server-only approval before replacing completed image assets.
 */
function assertTextClaimMayReplaceImages(
  slug: string,
  row: JobRow | null | { error: string },
  meta: ClaimMeta,
): void {
  if (row === null || "error" in row) return;
  const json = row.workupJson;
  const presentMetadata = IMAGE_JOB_METADATA_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(json, key),
  );
  if (presentMetadata.length > 0) {
    const rawState = json[IMAGE_JOB_STATE_KEY];
    const state = typeof rawState === "string" && PAID_IMAGE_JOB_STATES.has(rawState)
      ? ` (${rawState})`
      : "";
    throw new ChapterMutationError(
      "REFUSED",
      "claimGenerationJob",
      slug,
      `image job${state} is active or unresolved — refusing to replace its paid work`,
    );
  }

  const images = json.images;
  if (images === undefined) return;
  if (!Array.isArray(images)) {
    throw new ChapterMutationError(
      "REFUSED",
      "claimGenerationJob",
      slug,
      "stored images are unreadable — refusing to replace them (fail closed)",
    );
  }
  const hasCompletedImages = images.some(
    (image) =>
      typeof image === "object" &&
      image !== null &&
      (image as Record<string, unknown>).status === "complete",
  );
  if (
    hasCompletedImages &&
    meta.allowDiscardCompletedImages !== ALLOW_DISCARD_COMPLETED_IMAGES
  ) {
    throw new ChapterMutationError(
      "REFUSED",
      "claimGenerationJob",
      slug,
      "completed images require explicit trusted approval before text regeneration can replace them",
    );
  }
}

// ---------------- text jobs ----------------

const consumedTextJobCapabilityBrand: unique symbol = Symbol("consumedTextJobCapability");

/** Opaque proof minted only after the queued → running write succeeds. */
export type ConsumedTextJobCapability = {
  readonly [consumedTextJobCapabilityBrand]: true;
};

export interface ConsumedTextJobIdentity {
  slug: string;
  jobId: string;
  approvedManifestDigest?: string;
}

const consumedTextJobCapabilities = new WeakMap<object, Readonly<ConsumedTextJobIdentity>>();

function mintConsumedTextJobCapability(identity: ConsumedTextJobIdentity): ConsumedTextJobCapability {
  // The object deliberately carries no data. Copying or serializing it loses
  // the WeakMap identity and therefore cannot copy the authority.
  const capability = Object.freeze(Object.create(null)) as ConsumedTextJobCapability;
  consumedTextJobCapabilities.set(capability, Object.freeze({ ...identity }));
  return capability;
}

function validateApprovedManifestDigest(
  digest: string | undefined,
  action: string,
  slug: string,
): string | undefined {
  if (digest === undefined) return undefined;
  if (!LOWERCASE_SHA256.test(digest)) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      "approved manifest digest must be a lowercase SHA-256 digest",
    );
  }
  return digest;
}

/**
 * Require the caller's optional digest to exactly match the claim. A bound
 * claim cannot be consumed or finished by omitting its digest, and a generic
 * claim cannot be upgraded into a manifest-bound run after it was claimed.
 * The returned predicate closes the read/write race for bound claims.
 */
function manifestBindingPredicates(
  row: JobRow,
  approvedManifestDigest: string | undefined,
  action: string,
  slug: string,
): { key: string; equals: string }[] {
  const expected = validateApprovedManifestDigest(approvedManifestDigest, action, slug);
  const stored = row.workupJson?.[TEXT_JOB_MANIFEST_DIGEST_KEY];
  const storedDigest = typeof stored === "string" ? stored : undefined;

  if (storedDigest !== expected || (stored !== undefined && storedDigest === undefined)) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "approved manifest digest does not match this text-job claim",
    );
  }

  return expected === undefined
    ? []
    : [{ key: TEXT_JOB_MANIFEST_DIGEST_KEY, equals: expected }];
}

/**
 * One-time proof accessor for protected dispatch. It both verifies the exact
 * job identity and consumes the capability, so forged, cloned, or replayed
 * objects cannot authorize paid work.
 */
export function takeConsumedTextJobCapabilityForDispatch(
  capability: unknown,
  expected: ConsumedTextJobIdentity,
): Readonly<ConsumedTextJobIdentity> {
  const action = "takeConsumedTextJobCapabilityForDispatch";
  const approvedManifestDigest = validateApprovedManifestDigest(
    expected.approvedManifestDigest,
    action,
    expected.slug,
  );
  if (!capability || (typeof capability !== "object" && typeof capability !== "function")) {
    throw new ChapterMutationError("REFUSED", action, expected.slug, "consumed text-job capability is missing or forged");
  }
  const identity = consumedTextJobCapabilities.get(capability);
  if (!identity) {
    throw new ChapterMutationError("REFUSED", action, expected.slug, "consumed text-job capability is missing, forged, cloned, or already used");
  }
  if (
    identity.slug !== expected.slug ||
    identity.jobId !== expected.jobId ||
    identity.approvedManifestDigest !== approvedManifestDigest
  ) {
    throw new ChapterMutationError("CONFLICT", action, expected.slug, "consumed text-job capability belongs to a different job binding");
  }
  consumedTextJobCapabilities.delete(capability);
  return identity;
}

/**
 * Atomic single claim for TEXT generation (route-side; the worker consumes,
 * never re-claims). Missing row → INSERT (duplicate = conflict). Existing
 * draft/failed row → conditional update pinned to status + updated_at. The
 * claim stamps status="generating", the job id, and state "queued".
 */
export async function claimGenerationJob(
  store: JobStorePort,
  slug: string,
  meta: ClaimMeta,
): Promise<string> {
  const approvedManifestDigest = validateApprovedManifestDigest(
    meta.approvedManifestDigest,
    "claimGenerationJob",
    slug,
  );
  const row = await store.read(slug);
  const decision = decideMutation("createGeneratingChapterWorkup", slug, toLookup(row));
  if (!decision.allowed) throw new ChapterMutationError("REFUSED", "claimGenerationJob", slug, decision.reason);
  assertTextClaimMayReplaceImages(slug, row, meta);

  const jobId = newJobId();
  const now = new Date().toISOString();
  const base = {
    status: "generating",
    generation_started_at: now,
    generation_error: null,
    updated_at: now,
  };

  if (decision.expected === null) {
    const inserted = await store.insert(slug, {
      ...base,
      slug,
      book: meta.book,
      chapter: meta.chapter,
      title: meta.title,
      subtitle: null,
      source: meta.source ?? "generated",
      bible_version: meta.bibleVersion ?? null,
      workup_json: {
        [TEXT_JOB_KEY]: jobId,
        [TEXT_JOB_STATE_KEY]: "queued",
        ...(approvedManifestDigest === undefined
          ? {}
          : { [TEXT_JOB_MANIFEST_DIGEST_KEY]: approvedManifestDigest }),
      },
    });
    if (inserted === "duplicate") {
      throw new ChapterMutationError("CONFLICT", "claimGenerationJob", slug, "another claim won the insert race");
    }
    if (typeof inserted === "object") {
      throw new ChapterMutationError("WRITE_FAILED", "claimGenerationJob", slug, inserted.error);
    }
    return jobId;
  }

  // Existing draft/failed row: preserve its content, stamp the claim.
  const existingJson = (row && !("error" in row) && row.workupJson) || {};
  const claimedJson: Record<string, unknown> = {
    ...existingJson,
    [TEXT_JOB_KEY]: jobId,
    [TEXT_JOB_STATE_KEY]: "queued",
  };
  // A retry is a new run. It may bind a new approved manifest or return to the
  // unchanged generic lifecycle, but it must never inherit an older digest.
  if (approvedManifestDigest === undefined) {
    delete claimedJson[TEXT_JOB_MANIFEST_DIGEST_KEY];
  } else {
    claimedJson[TEXT_JOB_MANIFEST_DIGEST_KEY] = approvedManifestDigest;
  }
  const changed = await store.update(
    slug,
    { status: decision.expected.status, updatedAt: decision.expected.updatedAt },
    { ...base, workup_json: claimedJson },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "claimGenerationJob", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "claimGenerationJob", slug, "row changed during claim (zero-row write)");
  }
  return jobId;
}

/**
 * Worker-side ATOMIC CONSUMPTION (replaces the old read-and-compare verify):
 * flips "queued" → "running" with a conditional write pinned to status,
 * revision, job id, AND queued state. A duplicated delivery — two workers
 * holding the same valid token — loses here with zero rows changed, BEFORE
 * any paid model call. Protected slugs and null revisions are refused.
 */
export async function consumeGenerationClaim(
  store: JobStorePort,
  slug: string,
  jobId: string,
  approvedManifestDigest?: string,
): Promise<ConsumedTextJobCapability> {
  if (!jobId) throw new ChapterMutationError("REFUSED", "consumeGenerationClaim", slug, "missing job id");
  const row = await readRowForTerminalWrite(store, slug, "consumeGenerationClaim");
  if (row.status !== "generating" || row.workupJson?.[TEXT_JOB_KEY] !== jobId) {
    throw new ChapterMutationError("CONFLICT", "consumeGenerationClaim", slug, "claim is not owned by this worker");
  }
  const manifestPredicates = manifestBindingPredicates(
    row,
    approvedManifestDigest,
    "consumeGenerationClaim",
    slug,
  );
  const changed = await store.update(
    slug,
    {
      status: "generating",
      updatedAt: row.updatedAt,
      json: [
        { key: TEXT_JOB_KEY, equals: jobId },
        { key: TEXT_JOB_STATE_KEY, equals: "queued" },
        ...manifestPredicates,
      ],
    },
    {
      workup_json: { ...row.workupJson, [TEXT_JOB_STATE_KEY]: "running" },
      updated_at: new Date().toISOString(),
    },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "consumeGenerationClaim", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "consumeGenerationClaim", slug, "claim already consumed or superseded — refusing duplicate delivery");
  }
  return mintConsumedTextJobCapability({
    slug,
    jobId,
    ...(approvedManifestDigest === undefined ? {} : { approvedManifestDigest }),
  });
}

/**
 * Terminal SUCCESS: pinned to status="generating", THIS job id, AND the
 * consumed ("running") state — only the worker that consumed may complete.
 */
export async function completeGenerationJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  result: { workup: ChapterWorkup; version?: string; bibleVersion?: string },
  approvedManifestDigest?: string,
): Promise<void> {
  const row = await readRowForTerminalWrite(store, slug, "completeGenerationJob");
  const manifestPredicates = manifestBindingPredicates(
    row,
    approvedManifestDigest,
    "completeGenerationJob",
    slug,
  );
  const changed = await store.update(
    slug,
    {
      status: "generating",
      updatedAt: row.updatedAt,
      json: [
        { key: TEXT_JOB_KEY, equals: jobId },
        { key: TEXT_JOB_STATE_KEY, equals: "running" },
        ...manifestPredicates,
      ],
    },
    {
      workup_json: result.workup,
      status: "draft",
      version: result.version ?? null,
      bible_version: result.bibleVersion ?? null,
      generation_completed_at: new Date().toISOString(),
      generation_error: null,
      updated_at: new Date().toISOString(),
    },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "completeGenerationJob", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "completeGenerationJob", slug, "stale worker: a newer run owns this chapter");
  }
}

export type FailJobOutcome = "marked_failed" | "conflict" | "write_failed";
export type TextJobFailureState = "queued" | "running";
export interface FailGenerationJobOptions {
  expectedState: TextJobFailureState;
  approvedManifestDigest?: string;
}

/**
 * Terminal FAILURE. Pinned to this job id and the one lifecycle state the
 * caller actually owns. Route/pre-run cleanup may fail only "queued"; a worker
 * that successfully consumed the claim may fail only "running". Never throws
 * — but the caller MUST inspect the outcome:
 * "conflict" means the claim is in another lifecycle state, finished, or
 * superseded (safe to leave); "write_failed" means the row may be STRANDED as
 * generating and the response must say so.
 */
export async function failGenerationJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  message: string,
  options: FailGenerationJobOptions,
): Promise<FailJobOutcome> {
  let row: JobRow;
  try {
    row = await readRowForTerminalWrite(store, slug, "failGenerationJob");
  } catch (e) {
    const conflictLike = isProtectedFailure(e);
    console.error(
      `[selah] failGenerationJob(${slug}): cleanup read ${conflictLike ? "refused" : "failed"}`,
    );
    return conflictLike ? "conflict" : "write_failed";
  }
  if (
    row.status !== "generating" ||
    row.workupJson?.[TEXT_JOB_KEY] !== jobId ||
    row.workupJson?.[TEXT_JOB_STATE_KEY] !== options.expectedState
  ) return "conflict";
  let manifestPredicates: { key: string; equals: string }[];
  try {
    manifestPredicates = manifestBindingPredicates(
      row,
      options.approvedManifestDigest,
      "failGenerationJob",
      slug,
    );
  } catch (e) {
    console.error(`[selah] failGenerationJob(${slug}): ${(e as Error).message}`);
    return "conflict";
  }
  let changed: number | { error: string };
  try {
    changed = await store.update(
      slug,
      {
        status: "generating",
        updatedAt: row.updatedAt,
        json: [
          { key: TEXT_JOB_KEY, equals: jobId },
          { key: TEXT_JOB_STATE_KEY, equals: options.expectedState },
          ...manifestPredicates,
        ],
      },
      { status: "failed", generation_error: message.slice(0, 300), updated_at: new Date().toISOString() },
    );
  } catch {
    console.error(
      `[selah] failGenerationJob(${slug}): cleanup update rejected — row may be stranded generating`,
    );
    return "write_failed";
  }
  if (typeof changed === "object") {
    console.error(`[selah] failGenerationJob(${slug}): write failed — row may be stranded generating: ${changed.error}`);
    return "write_failed";
  }
  return changed === 1 ? "marked_failed" : "conflict";
}

// A protected-slug refusal during cleanup means we must not touch the row at
// all — that is a safe stop (conflict-like), not a stranded write failure.
function isProtectedFailure(e: unknown): boolean {
  return e instanceof ChapterMutationError && /protected chapter/.test(e.message);
}

// ---------------- image jobs (single-use; duplicates cannot double-spend) ----------------

function validatedImageBinding(
  slug: string,
  workup: ChapterWorkup,
  binding: ImageJobBinding | undefined,
  action: string,
): ImageJobBinding | undefined {
  if (slug !== MARK_8_IMAGE_SLUG) {
    if (binding === undefined) return undefined;
    if (!LOWERCASE_SHA256.test(binding.planDigest) || binding.model.trim() === "") {
      throw new ChapterMutationError("REFUSED", action, slug, "image-job binding is malformed");
    }
    return { planDigest: binding.planDigest, model: binding.model };
  }
  if (!binding) {
    throw new ChapterMutationError("REFUSED", action, slug, "Mark 8 requires a bound image plan and model");
  }
  if (!LOWERCASE_SHA256.test(binding.planDigest)) {
    throw new ChapterMutationError("REFUSED", action, slug, "Mark 8 image-plan digest must be a lowercase SHA-256 digest");
  }
  if (binding.model !== MARK_8_IMAGE_MODEL) {
    throw new ChapterMutationError("REFUSED", action, slug, `Mark 8 requires ${MARK_8_IMAGE_MODEL} exactly`);
  }
  const copyReview = sourceOverlapReviewAccepted(
    workup,
    binding.sourceOverlapReportDigest,
  );
  if (!copyReview.ok) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      copyReview.reason,
    );
  }
  let derived;
  try {
    assertMark8ImagesArePlaceholders(workup);
    derived = deriveMark8ImagePlan(workup);
  } catch (error) {
    throw new ChapterMutationError("REFUSED", action, slug, String((error as Error).message));
  }
  if (derived.digest !== binding.planDigest) {
    throw new ChapterMutationError("CONFLICT", action, slug, "stored Mark 8 image plan no longer matches this claim");
  }
  return {
    planDigest: derived.digest,
    model: MARK_8_IMAGE_MODEL,
    ...(binding.sourceOverlapReportDigest
      ? { sourceOverlapReportDigest: binding.sourceOverlapReportDigest }
      : {}),
  };
}

function imageBindingPredicates(
  row: JobRow,
  slug: string,
  binding: ImageJobBinding | undefined,
  action: string,
): { key: string; equals: string }[] {
  const expected = validatedImageBinding(
    slug,
    row.workupJson as unknown as ChapterWorkup,
    binding,
    action,
  );
  const storedDigest = row.workupJson[IMAGE_JOB_PLAN_DIGEST_KEY];
  const storedModel = row.workupJson[IMAGE_JOB_MODEL_KEY];
  if (expected === undefined) {
    if (storedDigest !== undefined || storedModel !== undefined) {
      throw new ChapterMutationError("CONFLICT", action, slug, "unexpected image-job binding on a legacy claim");
    }
    return [];
  }
  if (storedDigest !== expected.planDigest || storedModel !== expected.model) {
    throw new ChapterMutationError("CONFLICT", action, slug, "image plan or model does not match this claim");
  }
  return [
    { key: IMAGE_JOB_PLAN_DIGEST_KEY, equals: expected.planDigest },
    { key: IMAGE_JOB_MODEL_KEY, equals: expected.model },
  ];
}

/**
 * Atomic single-use IMAGE claim on a draft row (route-side). Refuses while
 * another image claim is active (no double spend). Stamps state "queued"; the
 * worker consumes it. Error paths must release via releaseImageJob.
 */
export async function claimImageJob(
  store: JobStorePort,
  slug: string,
  binding?: ImageJobBinding,
): Promise<{ jobId: string; workup: ChapterWorkup; binding?: ImageJobBinding }> {
  const row = await store.read(slug);
  const decision = decideMutation("updateChapterWorkupJson", slug, toLookup(row));
  if (!decision.allowed) throw new ChapterMutationError("REFUSED", "claimImageJob", slug, decision.reason);
  const json = (row && !("error" in row) && row.workupJson) || {};
  const previousJobId = typeof json[IMAGE_JOB_KEY] === "string" ? json[IMAGE_JOB_KEY] : "";
  const previousState = typeof json[IMAGE_JOB_STATE_KEY] === "string" ? json[IMAGE_JOB_STATE_KEY] : "";
  const ownerConfirmedRetry =
    slug === MARK_8_IMAGE_SLUG && previousJobId !== "" && previousState === "failed";
  if (previousJobId && !ownerConfirmedRetry) {
    throw new ChapterMutationError("CONFLICT", "claimImageJob", slug, "an image job is already active for this chapter");
  }
  const exactBinding = validatedImageBinding(
    slug,
    json as unknown as ChapterWorkup,
    binding,
    "claimImageJob",
  );
  const jobId = newJobId();
  const claimedJson = { ...json };
  delete claimedJson[IMAGE_JOB_SPENT_COUNT_KEY];
  delete claimedJson[IMAGE_JOB_ERROR_CODE_KEY];
  const changed = await store.update(
    slug,
    {
      status: decision.expected!.status,
      updatedAt: decision.expected!.updatedAt,
      json: ownerConfirmedRetry
        ? [
            { key: IMAGE_JOB_KEY, equals: previousJobId },
            { key: IMAGE_JOB_STATE_KEY, equals: "failed" },
          ]
        : [{ key: IMAGE_JOB_KEY, equals: null }], // key must still be absent at write time
    },
    {
      workup_json: {
        ...claimedJson,
        [IMAGE_JOB_KEY]: jobId,
        [IMAGE_JOB_STATE_KEY]: "queued",
        ...(exactBinding
          ? {
              [IMAGE_JOB_PLAN_DIGEST_KEY]: exactBinding.planDigest,
              [IMAGE_JOB_MODEL_KEY]: exactBinding.model,
            }
          : {}),
      },
      updated_at: new Date().toISOString(),
    },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "claimImageJob", slug, changed.error);
  if (changed !== 1) throw new ChapterMutationError("CONFLICT", "claimImageJob", slug, "another image claim won the race");
  return {
    jobId,
    workup: { ...(json as unknown as ChapterWorkup) },
    ...(exactBinding ? { binding: exactBinding } : {}),
  };
}

/** Worker-side atomic consumption of an image claim ("queued" → "running"). */
export async function consumeImageClaim(
  store: JobStorePort,
  slug: string,
  jobId: string,
  binding?: ImageJobBinding,
): Promise<ChapterWorkup> {
  if (!jobId) throw new ChapterMutationError("REFUSED", "consumeImageClaim", slug, "missing job id");
  const row = await readRowForTerminalWrite(store, slug, "consumeImageClaim");
  if (row.status !== "draft" || row.workupJson?.[IMAGE_JOB_KEY] !== jobId) {
    throw new ChapterMutationError("CONFLICT", "consumeImageClaim", slug, "image claim is not owned by this worker");
  }
  const bindingPredicates = imageBindingPredicates(row, slug, binding, "consumeImageClaim");
  const changed = await store.update(
    slug,
    {
      status: "draft",
      updatedAt: row.updatedAt,
      json: [
        { key: IMAGE_JOB_KEY, equals: jobId },
        { key: IMAGE_JOB_STATE_KEY, equals: "queued" },
        ...bindingPredicates,
      ],
    },
    {
      workup_json: { ...row.workupJson, [IMAGE_JOB_STATE_KEY]: "running" },
      updated_at: new Date().toISOString(),
    },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "consumeImageClaim", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "consumeImageClaim", slug, "image claim already consumed or superseded — refusing duplicate delivery");
  }
  return { ...(row.workupJson as unknown as ChapterWorkup) };
}

/** Terminal image SUCCESS: pinned to this consumed claim; clears the claim keys. */
export async function completeImageJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  finalWorkup: ChapterWorkup,
): Promise<void> {
  const row = await readRowForTerminalWrite(store, slug, "completeImageJob");
  const json = { ...(finalWorkup as unknown as Record<string, unknown>) };
  delete json[IMAGE_JOB_KEY];
  delete json[IMAGE_JOB_STATE_KEY];
  delete json[IMAGE_JOB_PLAN_DIGEST_KEY];
  delete json[IMAGE_JOB_MODEL_KEY];
  delete json[IMAGE_JOB_SPENT_COUNT_KEY];
  delete json[IMAGE_JOB_ERROR_CODE_KEY];
  const changed = await store.update(
    slug,
    {
      status: "draft",
      updatedAt: row.updatedAt,
      json: [
        { key: IMAGE_JOB_KEY, equals: jobId },
        { key: IMAGE_JOB_STATE_KEY, equals: "running" },
      ],
    },
    { workup_json: json, updated_at: new Date().toISOString() },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "completeImageJob", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "completeImageJob", slug, "stale image worker: claim superseded or row changed");
  }
}

/**
 * Release a claim after a failed run (pinned to job id in either state — a
 * trigger failure releases a "queued" claim, a worker failure a "running"
 * one). Never throws; false = claim not released (superseded or write failed).
 */
export async function releaseImageJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  expectedState?: "queued" | "running",
): Promise<boolean> {
  let row: JobRow;
  try {
    row = await readRowForTerminalWrite(store, slug, "releaseImageJob");
  } catch (e) {
    console.error(`[selah] releaseImageJob(${slug}): ${(e as Error).message}`);
    return false;
  }
  if (row.workupJson?.[IMAGE_JOB_KEY] !== jobId) return false;
  if (expectedState !== undefined && row.workupJson?.[IMAGE_JOB_STATE_KEY] !== expectedState) return false;
  const json = { ...row.workupJson };
  delete json[IMAGE_JOB_KEY];
  delete json[IMAGE_JOB_STATE_KEY];
  delete json[IMAGE_JOB_PLAN_DIGEST_KEY];
  delete json[IMAGE_JOB_MODEL_KEY];
  delete json[IMAGE_JOB_SPENT_COUNT_KEY];
  delete json[IMAGE_JOB_ERROR_CODE_KEY];
  const changed = await store.update(
    slug,
    {
      status: "draft",
      updatedAt: row.updatedAt,
      json: [
        { key: IMAGE_JOB_KEY, equals: jobId },
        ...(expectedState === undefined
          ? []
          : [{ key: IMAGE_JOB_STATE_KEY, equals: expectedState }]),
      ],
    },
    { workup_json: json, updated_at: new Date().toISOString() },
  );
  return typeof changed === "number" && changed === 1;
}

/**
 * Paid work that cannot complete remains locked. `failed` means the spend was
 * durably recorded; `blocked` means even the cost record failed. Both prevent
 * an automatic second paid run from hiding or duplicating the first spend.
 */
export async function markImageJobTerminalFailure(
  store: JobStorePort,
  slug: string,
  jobId: string,
  state: "failed" | "blocked",
  spentCount: number,
  errorCode: string,
  binding?: ImageJobBinding,
): Promise<boolean> {
  let row: JobRow;
  try {
    row = await readRowForTerminalWrite(store, slug, "markImageJobTerminalFailure");
  } catch (error) {
    console.error(`[selah] markImageJobTerminalFailure(${slug}): ${(error as Error).message}`);
    return false;
  }
  if (row.workupJson?.[IMAGE_JOB_KEY] !== jobId || row.workupJson?.[IMAGE_JOB_STATE_KEY] !== "running") {
    return false;
  }
  let bindingPredicates: { key: string; equals: string }[];
  try {
    bindingPredicates = imageBindingPredicates(
      row,
      slug,
      binding,
      "markImageJobTerminalFailure",
    );
  } catch (error) {
    console.error(`[selah] markImageJobTerminalFailure(${slug}): ${(error as Error).message}`);
    return false;
  }
  const changed = await store.update(
    slug,
    {
      status: "draft",
      updatedAt: row.updatedAt,
      json: [
        { key: IMAGE_JOB_KEY, equals: jobId },
        { key: IMAGE_JOB_STATE_KEY, equals: "running" },
        ...bindingPredicates,
      ],
    },
    {
      workup_json: {
        ...row.workupJson,
        [IMAGE_JOB_STATE_KEY]: state,
        [IMAGE_JOB_SPENT_COUNT_KEY]: Math.max(0, Math.floor(spentCount)),
        [IMAGE_JOB_ERROR_CODE_KEY]: errorCode.slice(0, 80),
      },
      updated_at: new Date().toISOString(),
    },
  );
  return typeof changed === "number" && changed === 1;
}

// ---------------- real Supabase adapter ----------------

export function supabaseJobStore(): JobStorePort | null {
  const db = getSupabaseAdmin();
  if (!db) return null;
  return {
    async read(slug) {
      const { data, error } = await db
        .from("chapter_workups")
        .select("status, updated_at, workup_json")
        .eq("slug", slug)
        .maybeSingle();
      if (error) return { error: String(error.message) };
      if (!data) return null;
      return {
        status: (data.status as string) ?? "",
        updatedAt: (data.updated_at as string | null) ?? null,
        workupJson: (data.workup_json as Record<string, unknown>) ?? {},
      };
    },
    async insert(_slug, payload) {
      const { error } = await db.from("chapter_workups").insert(payload);
      if (!error) return "ok";
      const text = `${error.message} ${(error as { code?: string }).code ?? ""}`;
      return /duplicate|unique|23505/i.test(text) ? "duplicate" : { error: error.message };
    },
    async update(slug, predicates, next) {
      let query = db.from("chapter_workups").update(next).eq("slug", slug).eq("status", predicates.status);
      if (predicates.updatedAt !== undefined && predicates.updatedAt !== null) {
        query = query.eq("updated_at", predicates.updatedAt);
      }
      for (const check of predicates.json ?? []) {
        query =
          check.equals === null
            ? query.is(`workup_json->>${check.key}`, null)
            : query.eq(`workup_json->>${check.key}`, check.equals);
      }
      const { data, error } = await query.select("slug");
      if (error) return { error: String(error.message) };
      return data?.length ?? 0;
    },
  };
}

// TEST SEAM (offline safety gate only): lets scripts/verify-studio-safety.ts
// drive the REAL admin route and REAL Netlify workers against a fake store.
// Never set in production code paths.
let jobStoreOverride: JobStorePort | null = null;
export function __setJobStoreForTesting(store: JobStorePort | null): void {
  jobStoreOverride = store;
}

export function requireJobStore(slug: string, action: string): JobStorePort {
  if (jobStoreOverride) return jobStoreOverride;
  const store = supabaseJobStore();
  if (!store) throw new ChapterMutationError("WRITE_FAILED", action, slug, "storage is not configured");
  return store;
}
