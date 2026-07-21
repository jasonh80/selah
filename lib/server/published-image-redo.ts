// SERVER-ONLY. Published-chapter single-image redo — the DEDICATED lane
// (Codex APPROVE WITH CONDITIONS, board #29 2026-07-19; unlocks IQ-004 and
// IQ-013 once the owner confirms each spend).
//
// The conditions, and where each is enforced here:
//   - Dedicated lane; the generic reviewed-chapter guard is NOT loosened —
//     only the new "applyPublishedImageRedo" MutationAction acts on a
//     "reviewed" row (protected-chapters.ts), and only the apply/rollback
//     paths below use it. Every other action refuses published rows unchanged.
//   - Candidate state NEVER lives in the live chapter row — it lives in the
//     dedicated table chapter_published_image_redo (see
//     supabase/chapter-published-image-redo.sql; fails closed until created).
//   - Candidate generation is separate and immutable: the worker uploads to
//     the job's own append-only storage directory and records the URL here,
//     touching nothing the public ever reads.
//   - "Use on live chapter" is a SECOND explicit owner confirmation, digest-
//     and revision-bound; apply is ONE conditional write that changes exactly
//     one images[i].src, after rerunning the full public validation
//     (validateMarkSprintPublishCandidate) and the serve-time identity check
//     (protectedChapterServeAllowed) against the EXACT next workup — the live
//     page cannot 404 or go invalid, and it is unchanged until that write.
//   - Stale/conflicting/protected chapters refuse: the binding digest includes
//     the live row's revision AND the exact src being replaced; psalm-23
//     refuses inside decideMutation before anything else runs. Mark 6 is
//     unlocked for EXACTLY this lane (owner authorization 2026-07-20, board
//     #29) — decideMutation still refuses every other action for it.
//   - Rollback is owner-confirmed, revision-bound, and revalidated the same
//     way, restoring the exact base_src the candidate replaced.
import { getSupabaseAdmin } from "./supabase";
import { sha256Canonical } from "./generation-manifest";
import {
  deriveMarkSprintImageRedoPlan,
  markSprintFinalReviewDigest,
  type MarkSprintImageRedoPlan,
} from "./mark8-image-plan";
import {
  decideMutation,
  ChapterMutationError,
  isChapterMutationError,
  isRedoUnlockedProtectedSlug,
  type MutationDecision,
} from "./protected-chapters";
import { requireJobStore, JOB_TOKEN_TTL_MS, newJobId, type JobStorePort } from "./generation-jobs";
import {
  validateMarkSprintPublishCandidate,
  protectedChapterServeAllowed,
} from "./chapter-workups-repository";
import { readStoredSetupApproval } from "./chapter-setup-approvals";
import { snapshotVersion } from "./chapter-versions-repository";
import { inspectSourceOverlapReview } from "../source-overlap-review";
import { isConnectedStudioSlug, connectedChapterLabel } from "../studio-mark8-preflight";
import type { ChapterWorkup } from "../types";

const TABLE = "chapter_published_image_redo";
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type PublishedRedoStatus =
  | "queued" // claimed — the worker has NOT consumed it yet
  | "running" // atomically consumed by the worker BEFORE any spend
  | "candidate"
  | "failed"
  | "blocked" // paid work without a durable cost row — stays locked
  | "rejected"
  | "applied"
  | "rolled_back";

export interface PublishedRedoRow {
  id: string;
  slug: string;
  status: PublishedRedoStatus;
  kind: string;
  notes: string;
  bindingDigest: string;
  baseRevision: string;
  baseSrc: string;
  model: string;
  candidateUrl: string | null;
  spentCount: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  /** The live row revision the apply wrote — rollback is pinned to it. */
  appliedRevision: string | null;
}

// ---------------------------------------------------------------------------
// Store port + test seam (mirrors PrepareProposalStore).
// ---------------------------------------------------------------------------
export type PublishedRedoLookup =
  | { kind: "row"; row: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export interface PublishedRedoStore {
  /** Tri-state reads: a database error is never collapsed to "no row". */
  latest(slug: string): Promise<PublishedRedoLookup>;
  byId(id: string): Promise<PublishedRedoLookup>;
  insert(row: Record<string, unknown>): Promise<"ok" | "conflict" | { error: string }>;
  /** Conditional write: only rows matching (id, expected status, and every
   * extraEquals column) move. 0 changed rows = the predicate lost. */
  conditionalUpdate(
    id: string,
    expectedStatus: PublishedRedoStatus,
    next: Record<string, unknown>,
    extraEquals?: Record<string, string>,
  ): Promise<number | { error: string }>;
}

let storeForTesting: PublishedRedoStore | null = null;
export function __setPublishedRedoStoreForTesting(store: PublishedRedoStore | null): void {
  storeForTesting = store;
}

function laneStore(): PublishedRedoStore | null {
  if (storeForTesting) return storeForTesting;
  const db = getSupabaseAdmin();
  if (!db) return null;
  return {
    async latest(slug: string): Promise<PublishedRedoLookup> {
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error(`[selah] published redo read failed (${slug})`);
        return { kind: "error", message: error.message };
      }
      return data ? { kind: "row", row: data as Record<string, unknown> } : { kind: "missing" };
    },
    async byId(id: string): Promise<PublishedRedoLookup> {
      const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (error) {
        console.error(`[selah] published redo read failed (${id})`);
        return { kind: "error", message: error.message };
      }
      return data ? { kind: "row", row: data as Record<string, unknown> } : { kind: "missing" };
    },
    async insert(row: Record<string, unknown>) {
      const { error } = await db.from(TABLE).insert(row);
      if (!error) return "ok";
      // The partial unique index (one live attempt per slug) reports as a
      // conflict — the single-use claim losing, not an outage.
      if (String(error.code) === "23505") return "conflict";
      console.error(`[selah] published redo insert failed (${String(row.slug)})`);
      return { error: error.message };
    },
    async conditionalUpdate(id, expectedStatus, next, extraEquals) {
      let query = db.from(TABLE).update(next).eq("id", id).eq("status", expectedStatus);
      for (const [column, value] of Object.entries(extraEquals ?? {})) {
        query = query.eq(column, value);
      }
      const { data, error } = await query.select("id");
      if (error) {
        console.error(`[selah] published redo update failed (${id})`);
        return { error: error.message };
      }
      return (data ?? []).length;
    },
  };
}

function requireLaneStore(slug: string, action: string): PublishedRedoStore {
  const store = laneStore();
  if (!store) {
    throw new ChapterMutationError(
      "WRITE_FAILED",
      action,
      slug,
      "published-redo storage is not configured (run supabase/chapter-published-image-redo.sql first)",
    );
  }
  return store;
}

const STATUSES: readonly PublishedRedoStatus[] = [
  "queued", "running", "candidate", "failed", "blocked", "rejected", "applied", "rolled_back",
];

/** Strictly validated row; anything off-shape reads as null (fail closed). */
function parseRow(raw: Record<string, unknown>): PublishedRedoRow | null {
  const status = raw.status;
  if (typeof status !== "string" || !STATUSES.includes(status as PublishedRedoStatus)) return null;
  if (typeof raw.id !== "string" || !UUID.test(raw.id)) return null;
  if (typeof raw.slug !== "string" || !raw.slug) return null;
  if (typeof raw.kind !== "string" || !raw.kind) return null;
  if (typeof raw.notes !== "string") return null;
  if (typeof raw.binding_digest !== "string" || !SHA256.test(raw.binding_digest)) return null;
  if (typeof raw.base_revision !== "string" || !raw.base_revision) return null;
  if (typeof raw.base_src !== "string" || !/^https:\/\//u.test(raw.base_src)) return null;
  if (typeof raw.model !== "string" || !raw.model) return null;
  const candidateUrl = typeof raw.candidate_url === "string" ? raw.candidate_url : null;
  if (candidateUrl !== null && !/^https:\/\//u.test(candidateUrl)) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    status: status as PublishedRedoStatus,
    kind: raw.kind,
    notes: raw.notes,
    bindingDigest: raw.binding_digest,
    baseRevision: raw.base_revision,
    baseSrc: raw.base_src,
    model: raw.model,
    candidateUrl,
    spentCount: typeof raw.spent_count === "number" ? raw.spent_count : Number(raw.spent_count ?? 0) || 0,
    errorCode: typeof raw.error_code === "string" ? raw.error_code : null,
    createdAt: typeof raw.created_at === "string" ? raw.created_at : "",
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : "",
    appliedRevision: typeof raw.applied_revision === "string" ? raw.applied_revision : null,
  };
}

const ACTIVE: readonly PublishedRedoStatus[] = ["queued", "running", "candidate", "blocked"];

/**
 * Revision equality across serializations (Codex #66 final review):
 * chapter_workups.updated_at is timestamptz — the value we WRITE is a JS ISO
 * string ("…Z") but reads come back in PostgreSQL's serialization
 * ("…+00:00"). Comparing raw strings would refuse valid rollbacks. Postgres
 * itself compares parsed instants (the conditional-write predicates are
 * representation-insensitive), so this comparison must be too: exact string
 * match, else both sides parse to the same instant. Unparseable or missing
 * values never match (fail closed).
 */
export function sameRevision(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = Date.parse(a);
  const pb = Date.parse(b);
  return Number.isFinite(pa) && Number.isFinite(pb) && pa === pb;
}

// ---------------------------------------------------------------------------
// Live-row context: one read, guarded by the DEDICATED action.
// ---------------------------------------------------------------------------
interface LiveChapterContext {
  workup: ChapterWorkup;
  json: Record<string, unknown>;
  revision: string;
  decision: MutationDecision;
}

async function readLiveReviewedChapter(
  store: JobStorePort,
  slug: string,
  action: string,
): Promise<LiveChapterContext> {
  const row = await store.read(slug);
  if (!row || "error" in row) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      `stored "${slug}" chapter is unreadable (fail closed)`,
    );
  }
  const decision = decideMutation("applyPublishedImageRedo", slug, {
    kind: "row",
    row: { status: row.status, updatedAt: row.updatedAt },
  });
  if (!decision.allowed) {
    throw new ChapterMutationError("REFUSED", action, slug, decision.reason);
  }
  return {
    workup: row.workupJson as unknown as ChapterWorkup,
    json: (row.workupJson ?? {}) as Record<string, unknown>,
    revision: decision.expected!.updatedAt!,
    decision,
  };
}

// ---------------------------------------------------------------------------
// Binding: the draft-lane redo plan digest PLUS the live revision. Any change
// to the published chapter — or to the exact image being replaced — drifts
// the digest, so stale reviews can never authorize spend or an apply.
// ---------------------------------------------------------------------------
export interface PublishedRedoBinding {
  plan: MarkSprintImageRedoPlan;
  baseRevision: string;
  digest: string;
}

export function publishedRedoDigest(slug: string, planDigest: string, baseRevision: string): string {
  return sha256Canonical({
    domain: `selah-${slug}-published-image-redo`,
    slug,
    planDigest,
    baseRevision,
  });
}

export async function derivePublishedRedoBinding(
  slug: string,
  kind: string,
  notes: string,
  action: string,
): Promise<PublishedRedoBinding> {
  // Mark 6 joins the connected chapters in THIS lane only (owner
  // authorization 2026-07-20, board #29): the published single-image redo.
  // Every other Studio path still treats it as unconnected and protected.
  if (!isConnectedStudioSlug(slug) && !isRedoUnlockedProtectedSlug(slug)) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      "published single-image redo is available only for connected protected chapters",
    );
  }
  const store = requireJobStore(slug, action);
  const live = await readLiveReviewedChapter(store, slug, action);
  let plan: MarkSprintImageRedoPlan;
  try {
    plan = deriveMarkSprintImageRedoPlan(slug, live.workup, kind, notes);
  } catch (error) {
    throw new ChapterMutationError("REFUSED", action, slug, String((error as Error).message));
  }
  return {
    plan,
    baseRevision: live.revision,
    digest: publishedRedoDigest(slug, plan.digest, live.revision),
  };
}

// ---------------------------------------------------------------------------
// Claim (route-side): the row INSERT is the atomic single-use claim.
// ---------------------------------------------------------------------------
export async function claimPublishedImageRedo(
  slug: string,
  request: { kind: string; notes: string; bindingDigest: string },
): Promise<{ jobId: string; binding: PublishedRedoBinding }> {
  const action = "claimPublishedImageRedo";
  const lane = requireLaneStore(slug, action);
  const binding = await derivePublishedRedoBinding(slug, request.kind, request.notes, action);
  if (!SHA256.test(request.bindingDigest) || binding.digest !== request.bindingDigest) {
    // derivePublishedRedoBinding already proved the slug is connected.
    const label = isConnectedStudioSlug(slug) ? connectedChapterLabel(slug) : slug;
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      `the ${label} chapter or your redo request changed after you reviewed the cost`,
    );
  }
  // A live attempt (queued/running/candidate/blocked) refuses a second claim —
  // the unique index backs this check even under a race.
  const latest = await latestParsed(lane, slug, action);
  if (latest && ACTIVE.includes(latest.status)) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "a published-image redo is already in progress or awaiting your decision — resolve it first",
    );
  }
  const jobId = newJobId();
  const inserted = await lane.insert({
    id: jobId,
    slug,
    status: "queued",
    kind: binding.plan.kind,
    notes: binding.plan.notes,
    binding_digest: binding.digest,
    base_revision: binding.baseRevision,
    base_src: binding.plan.currentSrc,
    model: binding.plan.model,
    spent_count: 0,
  });
  if (inserted === "conflict") {
    throw new ChapterMutationError("CONFLICT", action, slug, "another claim won the race");
  }
  if (typeof inserted === "object") {
    throw new ChapterMutationError("WRITE_FAILED", action, slug, inserted.error);
  }
  return { jobId, binding };
}

async function latestParsed(
  lane: PublishedRedoStore,
  slug: string,
  action: string,
): Promise<PublishedRedoRow | null> {
  const latest = await lane.latest(slug);
  if (latest.kind === "error") {
    throw new ChapterMutationError(
      "WRITE_FAILED",
      action,
      slug,
      `published-redo storage read failed: ${latest.message}`,
    );
  }
  if (latest.kind === "missing") return null;
  const parsed = parseRow(latest.row);
  if (!parsed) {
    // A malformed lane row must never read as "no attempt" — it could hide a
    // live claim or unrecorded spend.
    throw new ChapterMutationError(
      "WRITE_FAILED",
      action,
      slug,
      "published-redo storage returned an unreadable row (fail closed)",
    );
  }
  return parsed;
}

/** Free status read for the Studio card. Null = no attempt recorded. */
export async function publishedRedoStatusFor(slug: string): Promise<PublishedRedoRow | null> {
  const lane = laneStore();
  if (!lane) return null;
  return latestParsed(lane, slug, "publishedRedoStatusFor");
}

/** Failed trigger: the worker was provably never invoked (zero spend). */
export async function releasePublishedRedoClaim(slug: string, jobId: string): Promise<boolean> {
  const lane = laneStore();
  if (!lane) return false;
  const changed = await lane.conditionalUpdate(jobId, "queued", {
    status: "failed",
    error_code: "trigger_failed",
    updated_at: new Date().toISOString(),
  });
  return typeof changed === "number" && changed === 1;
}

// ---------------------------------------------------------------------------
// Worker side: consume before any spend; duplicates lose at the conditional
// write; the binding (incl. live revision) is revalidated from scratch.
// ---------------------------------------------------------------------------
export async function consumePublishedRedoClaim(
  slug: string,
  jobId: string,
  bindingDigest: string,
): Promise<{ row: PublishedRedoRow; binding: PublishedRedoBinding }> {
  const action = "consumePublishedRedoClaim";
  if (!jobId) throw new ChapterMutationError("REFUSED", action, slug, "missing job id");
  const lane = requireLaneStore(slug, action);
  const lookup = await lane.byId(jobId);
  if (lookup.kind !== "row") {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      lookup.kind === "missing" ? "redo claim not found" : `published-redo storage read failed: ${lookup.message}`,
    );
  }
  const row = parseRow(lookup.row);
  if (!row || row.slug !== slug || row.bindingDigest !== bindingDigest) {
    throw new ChapterMutationError("CONFLICT", action, slug, "redo claim is not owned by this worker");
  }
  const changed = await lane.conditionalUpdate(
    jobId,
    "queued",
    { status: "running", updated_at: new Date().toISOString() },
    { binding_digest: bindingDigest },
  );
  if (typeof changed === "object") {
    throw new ChapterMutationError("WRITE_FAILED", action, slug, changed.error);
  }
  if (changed !== 1) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "redo claim already consumed or superseded — refusing duplicate delivery",
    );
  }
  // Consumed — we own "running" from here. Revalidate the FULL binding
  // against the live chapter; a published-row change between route and
  // worker makes the digest drift and the claim dies pre-spend. ANY failure
  // in this block (including an unreadable live row — Codex #66 P1-3) must
  // close the running claim before rethrowing: no spend has happened, and a
  // stranded "running" row would hold the one-active-per-slug lock forever.
  try {
    const binding = await derivePublishedRedoBinding(slug, row.kind, row.notes, action);
    if (binding.digest !== bindingDigest || !sameRevision(binding.baseRevision, row.baseRevision)) {
      throw new ChapterMutationError(
        "CONFLICT",
        action,
        slug,
        "the published chapter changed after this redo was confirmed — no credit was used",
      );
    }
    return { row, binding };
  } catch (error) {
    const stale = isChapterMutationError(error) && error.code === "CONFLICT";
    await markPublishedRedoTerminalFailure(
      slug,
      jobId,
      "failed",
      0,
      stale ? "stale_binding" : "post_consume_refusal",
      ["running"],
    );
    throw error;
  }
}

export async function completePublishedRedoCandidate(
  slug: string,
  jobId: string,
  candidateUrl: string,
): Promise<void> {
  const action = "completePublishedRedoCandidate";
  const lane = requireLaneStore(slug, action);
  const changed = await lane.conditionalUpdate(jobId, "running", {
    status: "candidate",
    candidate_url: candidateUrl,
    spent_count: 1,
    updated_at: new Date().toISOString(),
  });
  if (typeof changed === "object") {
    throw new ChapterMutationError("WRITE_FAILED", action, slug, changed.error);
  }
  if (changed !== 1) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "redo claim was resolved by another writer — candidate not recorded",
    );
  }
}

/**
 * Terminal failure, pinned to the exact states THIS caller can own. A worker
 * that never consumed the claim must pass ["queued"] only — a definitively
 * lost consume means ANOTHER worker owns the "running" row, and closing it
 * from here would discard that worker's (possibly paid) in-flight run while
 * recording "no spend" (adversarial-review finding, 2026-07-19).
 */
export async function markPublishedRedoTerminalFailure(
  slug: string,
  jobId: string,
  state: "failed" | "blocked",
  spentCount: number,
  errorCode: string,
  expectedStates: readonly ("queued" | "running")[],
): Promise<boolean> {
  const lane = laneStore();
  if (!lane) return false;
  for (const expected of expectedStates) {
    const changed = await lane.conditionalUpdate(jobId, expected, {
      status: state,
      spent_count: Math.max(0, Math.floor(spentCount)),
      error_code: errorCode.slice(0, 80),
      updated_at: new Date().toISOString(),
    });
    if (typeof changed === "number" && changed === 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The owner's decisions: apply (second confirmation), reject, rollback.
// ---------------------------------------------------------------------------

/** Rerun the FULL public validation + serve-time identity check against the
 * exact workup that would go live. Refuses (fail closed) on any miss. */
async function assertNextWorkupServesClean(
  slug: string,
  next: ChapterWorkup,
  action: string,
): Promise<void> {
  const fresh = markSprintFinalReviewDigest(slug, next);
  if (!fresh) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      "the resulting chapter would not pass final review (images incomplete or unresolved state) — nothing was changed",
    );
  }
  const inspection = inspectSourceOverlapReview(next as unknown as Record<string, unknown>);
  const overlapDigest = inspection.kind === "warning" ? inspection.warning.reportDigest : undefined;
  const approval = await readStoredSetupApproval(slug);
  if (isRedoUnlockedProtectedSlug(slug) && !isConnectedStudioSlug(slug)) {
    // Mark 6 (owner authorization 2026-07-20, board #29) predates the sprint
    // machinery, so validateMarkSprintPublishCandidate would refuse it for
    // requirements that cannot exist for it (Studio connection, owner setup
    // receipt). Run the equivalent checks that DO exist for it instead:
    // the recomputed final-review identity already passed above (which
    // itself requires the full plan shape, complete stored images, and no
    // unresolved redo keys), and every image must sit at the exact
    // configured Selah storage origin — the same origin pin the sprint
    // validation enforces. Nothing here loosens the sprint/publish gates:
    // this branch is unreachable for connected or unlisted slugs.
    let expectedOrigin: string;
    try {
      const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
      if (configured.protocol !== "https:") throw new Error("unsafe protocol");
      expectedOrigin = configured.origin;
    } catch {
      throw new ChapterMutationError(
        "REFUSED",
        action,
        slug,
        "Selah's chapter image storage is not safely configured — nothing was changed",
      );
    }
    const exactOrigin =
      Array.isArray(next.images) &&
      next.images.every((image) => {
        try {
          return new URL(image.src).origin === expectedOrigin;
        } catch {
          return false;
        }
      });
    if (!exactOrigin) {
      throw new ChapterMutationError(
        "REFUSED",
        action,
        slug,
        "the resulting chapter failed full public validation — nothing was changed (one or more images are outside Selah's chapter image storage)",
      );
    }
  } else {
    const validation = validateMarkSprintPublishCandidate(
      slug,
      next,
      fresh,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      overlapDigest,
      approval,
    );
    if (!validation.ok) {
      throw new ChapterMutationError(
        "REFUSED",
        action,
        slug,
        `the resulting chapter failed full public validation — nothing was changed (${validation.reason})`,
      );
    }
  }
  if (!protectedChapterServeAllowed(slug, next, approval)) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      "the resulting chapter would not be publicly servable — nothing was changed",
    );
  }
}

function swapExactlyOneSrc(
  json: Record<string, unknown>,
  kind: string,
  fromSrc: string,
  toSrc: string,
  slug: string,
  action: string,
): Record<string, unknown> {
  const images = json.images;
  if (!Array.isArray(images)) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      "stored images are unreadable or the target image is missing (fail closed)",
    );
  }
  const target = images.find((image) => (image as Record<string, unknown>)?.kind === kind) as
    | Record<string, unknown>
    | undefined;
  if (!target) {
    throw new ChapterMutationError(
      "REFUSED",
      action,
      slug,
      "stored images are unreadable or the target image is missing (fail closed)",
    );
  }
  if (target.src !== fromSrc) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "the live image is no longer the one this candidate was made from — nothing was changed",
    );
  }
  const nextImages = images.map((image) => {
    const record = image as Record<string, unknown>;
    return record?.kind === kind ? { ...record, src: toSrc } : record;
  });
  return { ...json, images: nextImages };
}

export interface PublishedRedoApplyResult {
  applied: boolean;
  alreadyApplied: boolean;
  snapshotVersion: number | null;
}

/**
 * SECOND owner confirmation ("Use on live chapter"): one conditional write on
 * the reviewed row, pinned to the exact revision read in this same flow,
 * changing exactly one images[i].src — after a rollback snapshot and the full
 * revalidation above. The live page is unchanged until that write commits.
 */
export async function applyPublishedRedoCandidate(
  slug: string,
  expected: { jobId: string; kind: string; candidateUrl: string },
): Promise<PublishedRedoApplyResult> {
  const action = "applyPublishedImageRedo";
  const lane = requireLaneStore(slug, action);
  const lookup = await lane.byId(expected.jobId);
  if (lookup.kind !== "row") {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      lookup.kind === "missing"
        ? "the redo candidate changed or was resolved after you reviewed it"
        : `published-redo storage read failed: ${lookup.message}`,
    );
  }
  const row = parseRow(lookup.row);
  if (
    !row ||
    row.slug !== slug ||
    row.status !== "candidate" ||
    row.kind !== expected.kind ||
    row.candidateUrl !== expected.candidateUrl
  ) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "the redo candidate changed or was resolved after you reviewed it",
    );
  }
  const chapterStore = requireJobStore(slug, action);
  const live = await readLiveReviewedChapter(chapterStore, slug, action);

  // Idempotent duplicate apply: if the live image already IS the candidate,
  // settle the bookkeeping and report success without another write.
  const liveTarget = Array.isArray(live.json.images)
    ? ((live.json.images as unknown[]).find(
        (image) => (image as Record<string, unknown>)?.kind === expected.kind,
      ) as Record<string, unknown> | undefined)
    : undefined;
  if (liveTarget?.src === expected.candidateUrl) {
    await settleApplied(lane, row.id, live.revision);
    return { applied: true, alreadyApplied: true, snapshotVersion: null };
  }

  // The candidate is bound to the EXACT revision it was generated from
  // (Codex #66 P1-1): even if the target image itself is unchanged, any
  // other change to the live row since generation refuses — the owner
  // reviewed a candidate against a chapter that no longer exists.
  if (!sameRevision(live.revision, row.baseRevision)) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "the published chapter changed after this candidate was created — create a fresh candidate",
    );
  }

  const nextJson = swapExactlyOneSrc(
    live.json,
    expected.kind,
    row.baseSrc,
    expected.candidateUrl,
    slug,
    action,
  );
  await assertNextWorkupServesClean(slug, nextJson as unknown as ChapterWorkup, action);

  const version = await snapshotVersion(slug, "before-published-image-redo-apply");
  if (version === null) {
    throw new ChapterMutationError(
      "WRITE_FAILED",
      action,
      slug,
      "Studio could not save a rollback snapshot, so nothing was changed. Try again.",
    );
  }

  // The exact revision the apply writes — stored in the lane row so rollback
  // can pin itself to it (Codex #66 P1-2).
  const appliedRevision = new Date().toISOString();
  const changed = await chapterStore.update(
    slug,
    { status: "reviewed", updatedAt: live.revision, json: [] },
    { workup_json: nextJson, updated_at: appliedRevision },
  );
  if (typeof changed === "object") {
    throw new ChapterMutationError("WRITE_FAILED", action, slug, changed.error);
  }
  if (changed !== 1) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "the chapter changed while you were deciding — check the candidate again",
    );
  }
  // Lane bookkeeping AFTER the live write. If this write loses, the live
  // change stands; a later duplicate apply settles it idempotently above.
  await settleApplied(lane, row.id, appliedRevision);
  return { applied: true, alreadyApplied: false, snapshotVersion: version };
}

/** Lane bookkeeping for a candidate that IS live. Normally candidate→applied;
 * if a racing reject flipped the row first, rejected→applied repairs it so the
 * owner's rollback path is never lost (adversarial-review finding). The
 * applied revision — the exact live-row revision the candidate now sits on —
 * is recorded so rollback can pin itself to it. */
async function settleApplied(
  lane: PublishedRedoStore,
  jobId: string,
  appliedRevision: string,
): Promise<void> {
  for (const expected of ["candidate", "rejected"] as const) {
    const changed = await lane.conditionalUpdate(jobId, expected, {
      status: "applied",
      applied_at: new Date().toISOString(),
      applied_revision: appliedRevision,
      updated_at: new Date().toISOString(),
    });
    if (typeof changed === "number" && changed === 1) return;
  }
  console.error(`[selah] published redo ${jobId}: applied on the live row but lane bookkeeping did not settle`);
}

/**
 * Owner-confirmed, revision-bound ROLLBACK: restores the exact base_src the
 * apply replaced, with the same snapshot + full revalidation + conditional
 * write discipline. Refuses if the live image is no longer the candidate
 * (something else changed it since).
 */
export async function rollbackPublishedRedo(
  slug: string,
  jobId: string,
): Promise<{ snapshotVersion: number | null; alreadyRolledBack?: boolean }> {
  const action = "applyPublishedImageRedo";
  const lane = requireLaneStore(slug, action);
  const lookup = await lane.byId(jobId);
  if (lookup.kind === "error") {
    // A storage outage is never an owner error (fail closed, honest code).
    throw new ChapterMutationError(
      "WRITE_FAILED",
      action,
      slug,
      `published-redo storage read failed: ${lookup.message}`,
    );
  }
  const row = lookup.kind === "row" ? parseRow(lookup.row) : null;
  if (!row || row.slug !== slug || row.status !== "applied" || !row.candidateUrl) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "only an applied published-redo can be rolled back",
    );
  }
  const chapterStore = requireJobStore(slug, action);
  const live = await readLiveReviewedChapter(chapterStore, slug, action);
  // Idempotent duplicate rollback: if the live image is already back on the
  // pre-redo source (a prior rollback's lane write was lost), settle the
  // bookkeeping and report success without another chapter write.
  const liveTarget = Array.isArray(live.json.images)
    ? ((live.json.images as unknown[]).find(
        (image) => (image as Record<string, unknown>)?.kind === row.kind,
      ) as Record<string, unknown> | undefined)
    : undefined;
  if (liveTarget?.src === row.baseSrc) {
    const settled = await lane.conditionalUpdate(jobId, "applied", {
      status: "rolled_back",
      updated_at: new Date().toISOString(),
    });
    if (typeof settled === "object" || settled !== 1) {
      console.error(`[selah] published redo ${jobId}: rollback settle did not land`);
    }
    return { snapshotVersion: null, alreadyRolledBack: true };
  }
  // Rollback is bound to the EXACT revision the apply wrote (Codex #66 P1-2):
  // any later change to the live row — even one leaving the candidate src in
  // place — refuses, instead of restoring base_src over unknown state.
  if (!sameRevision(live.revision, row.appliedRevision)) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "the published chapter changed after this redo was applied — rollback refused (fail closed)",
    );
  }
  const nextJson = swapExactlyOneSrc(live.json, row.kind, row.candidateUrl, row.baseSrc, slug, action);
  await assertNextWorkupServesClean(slug, nextJson as unknown as ChapterWorkup, action);
  const version = await snapshotVersion(slug, "before-published-image-redo-rollback");
  if (version === null) {
    throw new ChapterMutationError(
      "WRITE_FAILED",
      action,
      slug,
      "Studio could not save a rollback snapshot, so nothing was changed. Try again.",
    );
  }
  const changed = await chapterStore.update(
    slug,
    { status: "reviewed", updatedAt: live.revision, json: [] },
    { workup_json: nextJson, updated_at: new Date().toISOString() },
  );
  if (typeof changed === "object") {
    throw new ChapterMutationError("WRITE_FAILED", action, slug, changed.error);
  }
  if (changed !== 1) {
    throw new ChapterMutationError(
      "CONFLICT",
      action,
      slug,
      "the chapter changed while you were deciding — check it again",
    );
  }
  const settled = await lane.conditionalUpdate(jobId, "applied", {
    status: "rolled_back",
    updated_at: new Date().toISOString(),
  });
  if (typeof settled === "object" || settled !== 1) {
    console.error(`[selah] published redo ${jobId}: rolled back on the live row but lane bookkeeping did not settle`);
  }
  return { snapshotVersion: version };
}

/**
 * Owner REJECTION / DISMISSAL: the live chapter is untouched. Works on a
 * reviewable "candidate", a "failed" attempt (spend already durably
 * recorded), and a provably-stale "queued" claim (older than the worker-token
 * TTL — its signed token is expired, so no worker can ever consume it, and
 * consume is the only path to spend). Live queued/running and "blocked" stay
 * locked. The candidate file stays orphaned in its immutable directory
 * (never deleted — owner decision IQ-010). Never throws; false = nothing cleared.
 */
export type PublishedRedoRejectOutcome = "rejected" | "healed_applied" | "none";

export async function rejectPublishedRedo(
  slug: string,
  now = Date.now(),
): Promise<PublishedRedoRejectOutcome> {
  const lane = laneStore();
  if (!lane) return "none";
  let row: PublishedRedoRow | null;
  try {
    row = await latestParsed(lane, slug, "rejectPublishedRedo");
  } catch (e) {
    console.error(`[selah] rejectPublishedRedo(${slug}): ${(e as Error).message}`);
    return "none";
  }
  if (!row) return "none";
  // A candidate the live chapter ALREADY uses is not rejectable — an apply
  // committed on the live row (its lane settle may have raced or been lost).
  // Repair the bookkeeping to "applied" instead, so the audit line stays true
  // and the owner's rollback path survives. FAIL CLOSED (Codex #66 P1-4): a
  // candidate may be rejected only after an AUTHORITATIVE live read proves
  // its URL is not live — an unreadable/missing live row refuses, because
  // rejecting blind could hide an applied candidate's rollback path.
  if (row.status === "candidate" && row.candidateUrl) {
    let provenNotLive = false;
    try {
      const chapterRow = await requireJobStore(slug, "rejectPublishedRedo").read(slug);
      if (chapterRow && !("error" in chapterRow)) {
        const images = chapterRow.workupJson?.images;
        const target = Array.isArray(images)
          ? (images.find((image) => (image as Record<string, unknown>)?.kind === row!.kind) as
              | Record<string, unknown>
              | undefined)
          : undefined;
        if (target?.src === row.candidateUrl) {
          await settleApplied(lane, row.id, chapterRow.updatedAt ?? "");
          return "healed_applied";
        }
        if (typeof target?.src === "string") provenNotLive = true;
      }
    } catch (e) {
      console.error(`[selah] rejectPublishedRedo(${slug}) live check: ${(e as Error).message}`);
    }
    if (!provenNotLive) return "none";
  }
  const revisionMs = Date.parse(row.updatedAt || row.createdAt || "");
  const staleQueued =
    row.status === "queued" && Number.isFinite(revisionMs) && now - revisionMs > JOB_TOKEN_TTL_MS;
  if (row.status !== "candidate" && row.status !== "failed" && !staleQueued) return "none";
  const changed = await lane.conditionalUpdate(row.id, row.status, {
    status: "rejected",
    updated_at: new Date().toISOString(),
  });
  return typeof changed === "number" && changed === 1 ? "rejected" : "none";
}
