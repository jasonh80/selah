// Offline safety gate for issue #8 PR 1 (runs as `npm run prebuild` — every
// local and Netlify build fails unless these invariants hold).
//
// No network, no Supabase, no env secrets: it tests the PURE decision core
// (decideMutation) exhaustively and the conditional-write semantics the
// repositories rely on, via an in-memory fake store that honors the same
// predicates (slug + expected status + expected updated_at, zero rows = conflict).
import assert from "node:assert/strict";
import {
  decideMutation,
  PROTECTED_SLUGS,
  type MutationAction,
  type RowLookup,
  type ChapterRowSnapshot,
} from "../lib/server/protected-chapters";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

const ACTIONS: MutationAction[] = [
  "createGeneratingChapterWorkup",
  "saveReadyChapterWorkup",
  "updateChapterWorkupJson",
  "markChapterWorkupFailed",
  "restoreVersion",
  "applyMergedDraft",
  "publishChapter",
];
const STATUSES = ["draft", "generating", "ready", "failed", "reviewed"] as const;
const row = (status: string, updatedAt: string | null = "2026-07-12T00:00:00Z"): RowLookup => ({
  kind: "row",
  row: { status, updatedAt },
});

// ---------- 1. Protected slugs: every action refused, regardless of status ----------
for (const slug of PROTECTED_SLUGS) {
  for (const action of ACTIONS) {
    for (const status of STATUSES) {
      ok(!decideMutation(action, slug, row(status)).allowed, `${slug} ${action} ${status} refused`);
    }
    ok(!decideMutation(action, slug, { kind: "missing" }).allowed, `${slug} ${action} missing refused`);
  }
}

// ---------- 2. Published (reviewed) rows: immutable through every action ----------
for (const action of ACTIONS) {
  const d = decideMutation(action, "mark-8", row("reviewed"));
  ok(!d.allowed && /published|immutable/i.test(d.reason), `reviewed blocks ${action} with clear reason`);
}

// ---------- 3. Legacy "ready" rows: quarantined for every action (incl. publish) ----------
for (const action of ACTIONS) {
  const d = decideMutation(action, "mark-8", row("ready"));
  ok(!d.allowed && /quarantined/i.test(d.reason), `ready quarantined for ${action}`);
}

// ---------- 4. DB/read errors and missing config: fail closed for every action ----------
for (const action of ACTIONS) {
  ok(!decideMutation(action, "mark-8", { kind: "error", message: "boom" }).allowed, `db error refuses ${action}`);
  ok(!decideMutation(action, "mark-8", { kind: "unconfigured" }).allowed, `unconfigured refuses ${action}`);
}
ok(!decideMutation("publishChapter", "", row("draft")).allowed, "empty slug refused");

// ---------- 5. Per-action transitions (exact allowed sets) ----------
const expectAllowed: Array<[MutationAction, string]> = [
  ["createGeneratingChapterWorkup", "draft"],
  ["createGeneratingChapterWorkup", "failed"],
  ["saveReadyChapterWorkup", "generating"],
  ["updateChapterWorkupJson", "draft"],
  ["markChapterWorkupFailed", "generating"],
  ["restoreVersion", "draft"],
  ["restoreVersion", "failed"],
  ["applyMergedDraft", "draft"],
  ["applyMergedDraft", "failed"],
  ["publishChapter", "draft"],
];
for (const [action, status] of expectAllowed) {
  const d = decideMutation(action, "mark-8", row(status));
  ok(d.allowed && d.expected?.status === status, `${action} allowed on ${status} with token`);
}
const expectRefused: Array<[MutationAction, string]> = [
  ["createGeneratingChapterWorkup", "generating"], // duplicate-run protection
  ["saveReadyChapterWorkup", "draft"],
  ["saveReadyChapterWorkup", "failed"],
  ["updateChapterWorkupJson", "generating"],
  ["updateChapterWorkupJson", "failed"],
  ["markChapterWorkupFailed", "draft"],
  ["markChapterWorkupFailed", "failed"],
  ["restoreVersion", "generating"],
  ["applyMergedDraft", "generating"],
  ["publishChapter", "generating"],
  ["publishChapter", "failed"],
];
for (const [action, status] of expectRefused) {
  ok(!decideMutation(action, "mark-8", row(status)).allowed, `${action} refused on ${status}`);
}

// ---------- 5b. NULL updated_at can never authorize a mutation (fail closed) ----------
for (const [action, status] of expectAllowed) {
  const d = decideMutation(action, "mark-8", row(status, null));
  ok(!d.allowed && /updated_at|revision/i.test(d.reason), `${action} on ${status} with NULL revision refused`);
}

// ---------- 6. Missing row: only creation may proceed ----------
for (const action of ACTIONS) {
  const d = decideMutation(action, "mark-8", { kind: "missing" });
  if (action === "createGeneratingChapterWorkup") {
    ok(d.allowed && d.expected === null, "create allowed on missing row with expect-no-row token");
  } else {
    ok(!d.allowed, `${action} refused on missing row`);
  }
}

// ---------- 7. Conditional-write semantics (fake store honoring the predicates) ----------
interface FakeRow {
  slug: string;
  status: string;
  updated_at: string | null;
}
class FakeStore {
  rows = new Map<string, FakeRow>();
  /** Mirrors the repos' conditional UPDATE: predicates must all match; returns changed count. */
  conditionalUpdate(
    slug: string,
    expected: ChapterRowSnapshot | null,
    next: Partial<FakeRow>,
  ): number {
    const r = this.rows.get(slug);
    if (!r) return 0;
    if (expected) {
      if (r.status !== expected.status) return 0;
      if (expected.updatedAt !== null && r.updated_at !== expected.updatedAt) return 0;
    }
    Object.assign(r, next);
    return 1;
  }
  insert(rowIn: FakeRow): "ok" | "duplicate" {
    if (this.rows.has(rowIn.slug)) return "duplicate";
    this.rows.set(rowIn.slug, rowIn);
    return "ok";
  }
  lookup(slug: string): RowLookup {
    const r = this.rows.get(slug);
    return r ? { kind: "row", row: { status: r.status, updatedAt: r.updated_at } } : { kind: "missing" };
  }
}

// 7a. Stale revision → zero-row conflict (guard passed, row changed before write).
{
  const store = new FakeStore();
  store.rows.set("mark-8", { slug: "mark-8", status: "draft", updated_at: "T1" });
  const decision = decideMutation("updateChapterWorkupJson", "mark-8", store.lookup("mark-8"));
  ok(decision.allowed, "7a guard passes on draft");
  // ...another actor publishes the row mid-run:
  store.rows.set("mark-8", { slug: "mark-8", status: "reviewed", updated_at: "T2" });
  const changed = store.conditionalUpdate("mark-8", decision.expected, { status: "draft" });
  ok(changed === 0, "7a stale revision writes ZERO rows (conflict, published row untouched)");
  ok(store.rows.get("mark-8")!.status === "reviewed", "7a published row not overwritten");
}

// 7b. updated_at drift alone (same status) → zero-row conflict.
{
  const store = new FakeStore();
  store.rows.set("mark-9", { slug: "mark-9", status: "draft", updated_at: "T1" });
  const decision = decideMutation("applyMergedDraft", "mark-9", store.lookup("mark-9"));
  store.rows.set("mark-9", { slug: "mark-9", status: "draft", updated_at: "T2" }); // concurrent edit
  const changed = store.conditionalUpdate("mark-9", decision.expected, { updated_at: "T3" });
  ok(changed === 0, "7b updated_at drift → conflict");
}

// 7c. Create on missing row = INSERT; a racing create = duplicate → conflict.
{
  const store = new FakeStore();
  const decision = decideMutation("createGeneratingChapterWorkup", "mark-10", store.lookup("mark-10"));
  ok(decision.allowed && decision.expected === null, "7c create allowed, expect-no-row");
  // ...a concurrent worker inserts first:
  ok(store.insert({ slug: "mark-10", status: "generating", updated_at: "T1" }) === "ok", "7c racer inserts");
  ok(store.insert({ slug: "mark-10", status: "generating", updated_at: "T2" }) === "duplicate", "7c duplicate insert = conflict, no overwrite");
  ok(store.rows.get("mark-10")!.updated_at === "T1", "7c first writer wins, second conflicts");
}

// 7d. Publish is draft-only + revision-pinned; ready/reviewed can never slip through.
{
  const store = new FakeStore();
  store.rows.set("mark-11", { slug: "mark-11", status: "ready", updated_at: "T1" });
  ok(!decideMutation("publishChapter", "mark-11", store.lookup("mark-11")).allowed, "7d ready cannot publish (quarantine)");
  store.rows.set("mark-11", { slug: "mark-11", status: "draft", updated_at: "T1" });
  const decision = decideMutation("publishChapter", "mark-11", store.lookup("mark-11"));
  ok(decision.allowed, "7d draft may publish");
  const changed = store.conditionalUpdate("mark-11", decision.expected, { status: "reviewed", updated_at: "T2" });
  ok(changed === 1 && store.rows.get("mark-11")!.status === "reviewed", "7d publish flips exactly the expected draft");
  const again = store.conditionalUpdate("mark-11", decision.expected, { status: "reviewed" });
  ok(again === 0, "7d replaying the same publish token conflicts (zero rows)");
}

// ---------- 8. Swallowed-write prevention (orchestration contract) ----------
// The generate flow must ONLY reach the model call if the placeholder claim
// SUCCEEDED. We assert the contract shape: a failed/conflicted claim throws,
// so a simulated orchestrator can never flip its "modelCalled" flag.
{
  let modelCalled = false;
  const store = new FakeStore();
  store.rows.set("mark-8", { slug: "mark-8", status: "reviewed", updated_at: "T1" });
  function claimOrThrow(slug: string): void {
    const d = decideMutation("createGeneratingChapterWorkup", slug, store.lookup(slug));
    if (!d.allowed) throw new Error(d.reason);
    if (d.expected === null) {
      if (store.insert({ slug, status: "generating", updated_at: "T" }) !== "ok") throw new Error("conflict");
    } else if (store.conditionalUpdate(slug, d.expected, { status: "generating" }) !== 1) {
      throw new Error("conflict");
    }
  }
  try {
    claimOrThrow("mark-8");
    modelCalled = true;
  } catch {
    /* refusal expected */
  }
  ok(!modelCalled, "8 no model call can follow a refused/failed placeholder claim");
}

// ---------- 9. Image-run isolation: run paths are unique and never legacy/stable ----------
{
  const legacyStablePaths = ["mark-6/nazareth.png", "mark-6/establishing.png", "psalm-23/establishing.png"];
  const runPath = (slug: string, runId: string, file: string) => `${slug}/${runId}/${file}`;
  const a = runPath("mark-8", "2026-07-12t01-00-00-000z", "hero.png");
  const b = runPath("mark-8", "2026-07-12t01-05-00-000z", "hero.png");
  ok(a !== b, "9 two runs never share a path");
  for (const legacy of legacyStablePaths) {
    ok(a !== legacy && b !== legacy, `9 run path can never equal published path ${legacy}`);
  }
  ok(/\/[0-9tz\-]+\//.test(a), "9 run path contains a run-scoped directory");
}

// ---------- 10. Refusal reasons are clear (auditable) ----------
for (const lookup of [row("reviewed"), row("ready"), { kind: "error", message: "x" } as RowLookup]) {
  const d = decideMutation("publishChapter", "mark-8", lookup);
  ok(!d.allowed && d.reason.length > 20 && d.reason.includes("publishChapter"), "10 refusal reason names action + cause");
}




// =====================================================================
// INTEGRATION SUITE — drives the REAL admin route (app/api/admin/generation)
// and the REAL Netlify workers (generate-chapter-background /
// generate-images-background) end-to-end against a fake store, fake trigger
// transport, and a zero-spend fake generator. No network, no Supabase, no
// OpenAI, no secrets: the only env var set is a dummy DEV_ADMIN_TOKEN used to
// sign/verify job tokens inside this process.
// =====================================================================
process.env.DEV_ADMIN_TOKEN = "verify-studio-safety-offline-token";

import type { JobStorePort, JobRow, JobPredicates } from "../lib/server/generation-jobs";
import {
  claimGenerationJob,
  consumeGenerationClaim,
  takeConsumedTextJobCapabilityForDispatch,
  completeGenerationJob,
  failGenerationJob,
  claimImageJob,
  consumeImageClaim,
  completeImageJob,
  releaseImageJob,
  signJobToken,
  verifyJobToken,
  __setJobStoreForTesting,
  TEXT_JOB_KEY,
  TEXT_JOB_STATE_KEY,
  TEXT_JOB_MANIFEST_DIGEST_KEY,
  IMAGE_JOB_KEY,
  IMAGE_JOB_STATE_KEY,
  IMAGE_JOB_PLAN_DIGEST_KEY,
  IMAGE_JOB_MODEL_KEY,
  IMAGE_JOB_SPENT_COUNT_KEY,
  IMAGE_JOB_ERROR_CODE_KEY,
  ALLOW_DISCARD_COMPLETED_IMAGES,
} from "../lib/server/generation-jobs";
import { isChapterMutationError, __setRowLookupForTesting } from "../lib/server/protected-chapters";
import {
  __setTriggerTransportForTesting,
  triggerBackgroundGeneration,
  type TriggerResult,
} from "../lib/server/trigger-generation";
import {
  __setGenerationTestOverrides,
  getGenerationSettings,
  type GenerationSettings,
} from "../lib/server/generation-settings";
import {
  __setCostCaptureForTesting,
  __setCostWriteFailureForTesting,
  type CostEventInput,
} from "../lib/server/cost-events-repository";
import {
  __setGenerationConfigBypassForTesting,
  __setTextGeneratorForTesting,
} from "../lib/server/generate-chapter-workup";
import { __setImageTestOverrides, __setImageDepsForTesting, generateAndStoreChapterImages } from "../lib/server/images";
import {
  deriveMark8ImagePlan,
  isStoredMark8ImageUrl,
  mark8FinalReviewDigest,
  MARK_8_IMAGE_MODEL,
} from "../lib/server/mark8-image-plan";
import {
  safeProtectedMarkFailure,
  validateMark8PublishCandidate,
} from "../lib/server/chapter-workups-repository";
import { POST as adminPost } from "../app/api/admin/generation/route";
import textWorker, {
  __setMark8PermissionCheckerForTesting,
  __setProtectedMarkDraftRunnerForTesting,
} from "../netlify/functions/generate-chapter-background.mts";
import imagesWorker from "../netlify/functions/generate-images-background.mts";
import type { ChapterWorkup } from "../lib/types";
import { createSourceOverlapReviewWarning } from "../lib/source-overlap-review";
import generatedFixture from "../lib/ai/fixtures/exodus-27-generated.json";

class FakeJobStore implements JobStorePort {
  rows = new Map<string, { status: string; updated_at: string | null; workup_json: Record<string, unknown>; extra: Record<string, unknown> }>();
  failNextUpdate = false; // simulates a database write failure on the next update
  private tick = 0;
  now(): string { return `T${++this.tick}`; }
  seed(slug: string, status: string, json: Record<string, unknown> = {}, updatedAt: string | null = "T0"): void {
    this.rows.set(slug, { status, updated_at: updatedAt, workup_json: json, extra: {} });
  }
  async read(slug: string): Promise<JobRow | null | { error: string }> {
    const r = this.rows.get(slug);
    return r ? { status: r.status, updatedAt: r.updated_at, workupJson: r.workup_json } : null;
  }
  async insert(slug: string, payload: Record<string, unknown>): Promise<"ok" | "duplicate" | { error: string }> {
    if (this.rows.has(slug)) return "duplicate";
    this.rows.set(slug, {
      status: String(payload.status),
      updated_at: this.now(),
      workup_json: (payload.workup_json as Record<string, unknown>) ?? {},
      extra: payload,
    });
    return "ok";
  }
  async update(slug: string, p: JobPredicates, next: Record<string, unknown>): Promise<number | { error: string }> {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      return { error: "simulated database write failure" };
    }
    const r = this.rows.get(slug);
    if (!r) return 0;
    if (r.status !== p.status) return 0;
    if (p.updatedAt !== undefined && p.updatedAt !== null && r.updated_at !== p.updatedAt) return 0;
    for (const check of p.json ?? []) {
      const actual = r.workup_json?.[check.key];
      if (check.equals === null && actual !== undefined && actual !== null) return 0;
      if (check.equals !== null && actual !== check.equals) return 0;
    }
    if ("status" in next) r.status = String(next.status);
    if ("workup_json" in next) r.workup_json = next.workup_json as Record<string, unknown>;
    r.updated_at = this.now();
    return 1;
  }
}

const META = { book: "Mark", chapter: 8, title: "Mark 8" };
const WORKUP = { slug: "mark-8", title: "Mark 8" } as unknown as ChapterWorkup;
const MARK8_IMAGE_WORKUP = {
  slug: "mark-8",
  title: "Mark 8",
  heroKind: "peter-confession",
  images: [
    {
      kind: "bread-in-the-boat",
      index: 1,
      label: "Bread in the Boat",
      description: "The disciples sit with one loaf while missing what Jesus has shown them.",
      prompt: "A historically grounded first-century Galilean fishing boat with the disciples and one loaf.",
      caption: "One loaf was in the boat, but their understanding was still forming.",
      src: "/img/placeholder/establishing.svg",
      alt: "The disciples in a fishing boat with one loaf between them.",
      status: "placeholder",
    },
    {
      kind: "peter-confession",
      index: 2,
      label: "You Are the Christ",
      description: "Peter names Jesus as the Christ near Caesarea Philippi.",
      prompt: "Peter answering Jesus near Caesarea Philippi with the disciples gathered close.",
      caption: "Peter sees truly, but he still has more to learn about the way of the Messiah.",
      src: "/img/placeholder/detail.svg",
      alt: "Peter answering Jesus as the disciples listen near Caesarea Philippi.",
      status: "placeholder",
    },
    {
      kind: "take-up-the-cross",
      index: 3,
      label: "Take Up Your Cross",
      description: "Jesus calls the crowd and disciples to costly, faithful following.",
      prompt: "Jesus teaching an ordinary crowd and His disciples on a rugged northern road.",
      caption: "Following Jesus means receiving His way, not reshaping it around ours.",
      src: "/img/placeholder/human.svg",
      alt: "Jesus teaching His disciples and a crowd on a rugged road.",
      status: "placeholder",
    },
  ],
} as unknown as ChapterWorkup;
const MARK8_IMAGE_BINDING = {
  planDigest: deriveMark8ImagePlan(MARK8_IMAGE_WORKUP).digest,
  model: MARK_8_IMAGE_MODEL,
};

function completedMark8Workup(
  jobId = "44444444-4444-4444-8444-444444444444",
  origin = "https://offline-selah.supabase.co",
): ChapterWorkup {
  const workup = structuredClone(MARK8_IMAGE_WORKUP);
  workup.images = workup.images.map((image) => ({
    ...image,
    status: "complete" as const,
    src: `${origin}/storage/v1/object/public/chapter-images/mark-8/${jobId}/${image.kind}.png`,
  }));
  return workup;
}
const MANIFEST_DIGEST_A = "a".repeat(64);
const MANIFEST_DIGEST_B = "b".repeat(64);
const SOURCE_OVERLAP_REPORT_DIGEST = "c".repeat(64);
const SOURCE_OVERLAP_WARNING = createSourceOverlapReviewWarning({
  manifestDigest: MANIFEST_DIGEST_A,
  reportDigest: SOURCE_OVERLAP_REPORT_DIGEST,
  canonicalDraftDigest: "d".repeat(64),
  blockerCodes: ["MOSAIC_10_PLUS"],
  findingCount: 2,
  blockFindingCount: 1,
  reviewFindingCount: 1,
});

async function expectCode(fn: () => Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await fn();
    ok(false, `${label} (should have thrown ${code})`);
  } catch (e) {
    ok(isChapterMutationError(e) && e.code === code, `${label} → ${code}`);
  }
}

const integration = async () => {
  // ---------- J. Signed, expiring job tokens ----------
  {
    const { token } = signJobToken("text", "mark-8", "job-1");
    ok(verifyJobToken("text", "mark-8", "job-1", token).ok, "J token round-trips");
    ok(!verifyJobToken("text", "mark-9", "job-1", token).ok, "J token bound to slug");
    ok(!verifyJobToken("text", "mark-8", "job-2", token).ok, "J token bound to job id");
    ok(!verifyJobToken("image", "mark-8", "job-1", token).ok, "J token bound to purpose");
    ok(!verifyJobToken("text", "mark-8", "job-1", token.slice(0, -2) + "ff").ok, "J tampered signature rejected");
    ok(!verifyJobToken("text", "mark-8", "job-1", "junk").ok, "J malformed token rejected");
    const past = signJobToken("text", "mark-8", "job-1", Date.now() - 60 * 60 * 1000);
    ok(!verifyJobToken("text", "mark-8", "job-1", past.token).ok, "J expired token rejected");
    // Fail-closed with no secret at all:
    const saved = process.env.DEV_ADMIN_TOKEN;
    delete process.env.DEV_ADMIN_TOKEN;
    delete process.env.GENERATION_JOB_SECRET;
    await expectCode(async () => signJobToken("text", "mark-8", "job-1"), "REFUSED", "J signing without a secret refuses");
    ok(!verifyJobToken("text", "mark-8", "job-1", token).ok, "J verification without a secret refuses");
    process.env.DEV_ADMIN_TOKEN = saved;
  }

  // ---------- I1. Claim → consume → complete (single-use, consumed exactly once) ----------
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", META);
    const r0 = store.rows.get("mark-8")!;
    ok(r0.status === "generating" && r0.workup_json[TEXT_JOB_KEY] === jobId, "I1 claim marks generating + stamps job id");
    ok(r0.workup_json[TEXT_JOB_STATE_KEY] === "queued", "I1 claim starts queued");
    await consumeGenerationClaim(store, "mark-8", jobId);
    ok(store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "running", "I1 consumption flips queued → running");
    // A DUPLICATED DELIVERY (same valid job id) loses at the conditional write:
    await expectCode(() => consumeGenerationClaim(store, "mark-8", jobId), "CONFLICT", "I1 second consumption of the same job refused");
    await completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP });
    const r = store.rows.get("mark-8")!;
    ok(r.status === "draft" && (r.workup_json as { title?: string }).title === "Mark 8", "I1 worker saved draft");
  }

  // I1b. Concurrent duplicate consumption: exactly one winner.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", META);
    const results = await Promise.allSettled([
      consumeGenerationClaim(store, "mark-8", jobId),
      consumeGenerationClaim(store, "mark-8", jobId),
    ]);
    const wins = results.filter((x) => x.status === "fulfilled").length;
    ok(wins === 1, `I1b concurrent duplicate deliveries: exactly one consumption wins (got ${wins})`);
  }

  // I1c. Completion requires a CONSUMED claim — a queued (never-consumed) job can't complete.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", META);
    await expectCode(() => completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP }), "CONFLICT", "I1c unconsumed job cannot complete");
  }

  // I1d. An approved manifest is stored once and required at every worker step.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    ok(
      store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === MANIFEST_DIGEST_A,
      "I1d claim stores the approved manifest digest",
    );
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", jobId),
      "CONFLICT",
      "I1d bound claim cannot be consumed with the digest omitted",
    );
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_B),
      "CONFLICT",
      "I1d bound claim cannot be consumed with a different digest",
    );
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_A.toUpperCase()),
      "REFUSED",
      "I1d uppercase digest is invalid",
    );
    await consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_A);
    await expectCode(
      () => completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP }),
      "CONFLICT",
      "I1d bound job cannot complete with the digest omitted",
    );
    await expectCode(
      () => completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP }, MANIFEST_DIGEST_B),
      "CONFLICT",
      "I1d bound job cannot complete with a different digest",
    );
    await completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP }, MANIFEST_DIGEST_A);
    ok(store.rows.get("mark-8")!.status === "draft", "I1d exact manifest-bound job completes");
  }

  // I1e. Terminal failure is digest-bound too, including retries/cross-run use.
  {
    const store = new FakeJobStore();
    const jobA = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    ok(
      (await failGenerationJob(store, "mark-8", jobA, "trigger failed", {
        expectedState: "queued",
      })) === "conflict",
      "I1e bound failure refuses an omitted digest",
    );
    ok(
      (await failGenerationJob(store, "mark-8", jobA, "trigger failed", {
        expectedState: "queued",
        approvedManifestDigest: MANIFEST_DIGEST_B,
      })) === "conflict",
      "I1e bound failure refuses a mismatched digest",
    );
    ok(
      (await failGenerationJob(store, "mark-8", jobA, "trigger failed", {
        expectedState: "queued",
        approvedManifestDigest: MANIFEST_DIGEST_A,
      })) === "marked_failed",
      "I1e bound failure accepts the exact digest",
    );

    const jobB = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_B,
    });
    ok(
      store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === MANIFEST_DIGEST_B,
      "I1e retry replaces the old run's digest",
    );
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", jobB, MANIFEST_DIGEST_A),
      "CONFLICT",
      "I1e run B cannot consume using run A's digest",
    );
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", jobA, MANIFEST_DIGEST_A),
      "CONFLICT",
      "I1e run A cannot cross into run B",
    );
    await consumeGenerationClaim(store, "mark-8", jobB, MANIFEST_DIGEST_B);
    await completeGenerationJob(store, "mark-8", jobB, { workup: WORKUP }, MANIFEST_DIGEST_B);
    ok(store.rows.get("mark-8")!.status === "draft", "I1e run B completes with its own digest");
  }

  // I1f. Generic jobs retain their original API and do not inherit a prior binding.
  {
    const store = new FakeJobStore();
    const boundJob = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    await failGenerationJob(store, "mark-8", boundJob, "retry", {
      expectedState: "queued",
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    const genericJob = await claimGenerationJob(store, "mark-8", META);
    ok(
      store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === undefined,
      "I1f generic retry clears the prior run's manifest binding",
    );
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", genericJob, MANIFEST_DIGEST_A),
      "CONFLICT",
      "I1f generic claim cannot be upgraded with a digest after claim",
    );
    await consumeGenerationClaim(store, "mark-8", genericJob);
    await completeGenerationJob(store, "mark-8", genericJob, { workup: WORKUP });
    ok(store.rows.get("mark-8")!.status === "draft", "I1f generic lifecycle remains unchanged");
  }

  // I1g. Digest predicates close consume and terminal read/write races.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    const originalUpdate = store.update.bind(store);
    store.update = async (slug, predicates, next) => {
      if ((predicates.json ?? []).some((p) => p.key === TEXT_JOB_STATE_KEY && p.equals === "queued")) {
        store.rows.get(slug)!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] = MANIFEST_DIGEST_B;
      }
      return originalUpdate(slug, predicates, next);
    };
    await expectCode(
      () => consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_A),
      "CONFLICT",
      "I1g consume refuses a digest swap during its write",
    );
  }
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    await consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_A);
    const originalUpdate = store.update.bind(store);
    store.update = async (slug, predicates, next) => {
      if ((predicates.json ?? []).some((p) => p.key === TEXT_JOB_STATE_KEY && p.equals === "running")) {
        store.rows.get(slug)!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] = MANIFEST_DIGEST_B;
      }
      return originalUpdate(slug, predicates, next);
    };
    await expectCode(
      () => completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP }, MANIFEST_DIGEST_A),
      "CONFLICT",
      "I1g completion refuses a digest swap during its write",
    );
    ok(store.rows.get("mark-8")!.status === "generating", "I1g failed terminal assertion leaves the draft unapplied");
  }
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    const originalUpdate = store.update.bind(store);
    store.update = async (slug, predicates, next) => {
      store.rows.get(slug)!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] = MANIFEST_DIGEST_B;
      return originalUpdate(slug, predicates, next);
    };
    ok(
      (await failGenerationJob(store, "mark-8", jobId, "boom", {
        expectedState: "queued",
        approvedManifestDigest: MANIFEST_DIGEST_A,
      })) === "conflict",
      "I1g failure refuses a digest swap during its terminal write",
    );
    ok(store.rows.get("mark-8")!.status === "generating", "I1g conflicted failure cannot change job status");
  }

  // I1h. Invalid digests never create a claim.
  {
    const store = new FakeJobStore();
    await expectCode(
      () => claimGenerationJob(store, "mark-8", { ...META, approvedManifestDigest: "abc" }),
      "REFUSED",
      "I1h malformed approved manifest digest refused",
    );
    ok(!store.rows.has("mark-8"), "I1h malformed digest causes no row mutation");
  }

  // I1i. Only a successful atomic consume mints one-use dispatch authority.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", {
      ...META,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    let failedCapability: unknown;
    try {
      failedCapability = await consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_B);
    } catch {
      // Expected: a mismatched consume returns no authority.
    }
    ok(failedCapability === undefined, "I1i mismatched consume returns no capability");

    const capability = await consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_A);
    ok(Object.keys(capability).length === 0, "I1i capability exposes no serializable job data");
    await expectCode(
      async () => takeConsumedTextJobCapabilityForDispatch({}, {
        slug: "mark-8",
        jobId,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }),
      "REFUSED",
      "I1i forged capability refused",
    );
    const cloned = structuredClone(capability);
    await expectCode(
      async () => takeConsumedTextJobCapabilityForDispatch(cloned, {
        slug: "mark-8",
        jobId,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }),
      "REFUSED",
      "I1i cloned capability refused",
    );
    const serializedClone = JSON.parse(JSON.stringify(capability)) as unknown;
    await expectCode(
      async () => takeConsumedTextJobCapabilityForDispatch(serializedClone, {
        slug: "mark-8",
        jobId,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }),
      "REFUSED",
      "I1i serialized capability refused",
    );
    await expectCode(
      async () => takeConsumedTextJobCapabilityForDispatch(capability, {
        slug: "mark-9",
        jobId,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }),
      "CONFLICT",
      "I1i capability cannot cross slugs",
    );
    await expectCode(
      async () => takeConsumedTextJobCapabilityForDispatch(capability, {
        slug: "mark-8",
        jobId,
        approvedManifestDigest: MANIFEST_DIGEST_B,
      }),
      "CONFLICT",
      "I1i capability cannot cross manifest digests",
    );
    const identity = takeConsumedTextJobCapabilityForDispatch(capability, {
      slug: "mark-8",
      jobId,
      approvedManifestDigest: MANIFEST_DIGEST_A,
    });
    ok(
      identity.slug === "mark-8" &&
      identity.jobId === jobId &&
      identity.approvedManifestDigest === MANIFEST_DIGEST_A,
      "I1i exact protected dispatch receives the bound identity",
    );
    await expectCode(
      async () => takeConsumedTextJobCapabilityForDispatch(capability, {
        slug: "mark-8",
        jobId,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }),
      "REFUSED",
      "I1i consumed capability cannot be replayed",
    );
    let duplicateCapability: unknown;
    try {
      duplicateCapability = await consumeGenerationClaim(store, "mark-8", jobId, MANIFEST_DIGEST_A);
    } catch {
      // Expected: duplicate delivery returns no authority.
    }
    ok(duplicateCapability === undefined, "I1i duplicate consume returns no capability");
  }

  // I2. Duplicate request while a run is live: second claim refused.
  {
    const store = new FakeJobStore();
    await claimGenerationJob(store, "mark-8", META);
    await expectCode(() => claimGenerationJob(store, "mark-8", META), "REFUSED", "I2 duplicate generate request refused while generating");
  }

  // I3. Stale worker: old job can neither consume, complete, nor fail a newer run.
  {
    const store = new FakeJobStore();
    const jobA = await claimGenerationJob(store, "mark-8", META);
    ok((await failGenerationJob(store, "mark-8", jobA, "trigger failed", { expectedState: "queued" })) === "marked_failed", "I3 failed trigger marks job A failed");
    ok(store.rows.get("mark-8")!.status === "failed", "I3 not stranded as generating");
    const jobB = await claimGenerationJob(store, "mark-8", META); // retry claims B
    await expectCode(() => consumeGenerationClaim(store, "mark-8", jobA), "CONFLICT", "I3 zombie A cannot consume");
    await expectCode(() => completeGenerationJob(store, "mark-8", jobA, { workup: WORKUP }), "CONFLICT", "I3 zombie A cannot overwrite B");
    ok((await failGenerationJob(store, "mark-8", jobA, "zombie", { expectedState: "queued" })) === "conflict", "I3 zombie A cannot fail B (conflict, not stranded)");
    ok(store.rows.get("mark-8")!.workup_json[TEXT_JOB_KEY] === jobB, "I3 B's claim intact");
    await consumeGenerationClaim(store, "mark-8", jobB);
    await completeGenerationJob(store, "mark-8", jobB, { workup: WORKUP });
    ok(store.rows.get("mark-8")!.status === "draft", "I3 newer run B completes normally");
  }

  // I3b. Cleanup write failure is reported truthfully, never as success.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", META);
    store.failNextUpdate = true;
    ok((await failGenerationJob(store, "mark-8", jobId, "boom", { expectedState: "queued" })) === "write_failed", "I3b cleanup write failure → write_failed (row may be stranded)");
    ok(store.rows.get("mark-8")!.status === "generating", "I3b row genuinely still generating — outcome told the truth");
    ok((await failGenerationJob(store, "mark-8", jobId, "boom", { expectedState: "queued" })) === "marked_failed", "I3b retry cleanup succeeds");
  }

  // I3c. Cleanup authority is state-bound: route/pre-run cleanup cannot kill a
  // worker-owned run, and worker cleanup cannot claim an unconsumed queue item.
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", META);
    ok(
      (await failGenerationJob(store, "mark-8", jobId, "worker too early", {
        expectedState: "running",
      })) === "conflict",
      "I3c running cleanup cannot fail a queued job",
    );
    ok(store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "queued", "I3c queued claim remains intact");
    await consumeGenerationClaim(store, "mark-8", jobId);
    ok(
      (await failGenerationJob(store, "mark-8", jobId, "lost trigger response", {
        expectedState: "queued",
      })) === "conflict",
      "I3c delayed route cleanup cannot fail a consumed job",
    );
    ok(store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "running", "I3c running worker remains intact");
    await completeGenerationJob(store, "mark-8", jobId, { workup: WORKUP });
    ok(store.rows.get("mark-8")!.status === "draft", "I3c worker still completes after delayed route cleanup");
  }
  {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", META);
    const originalUpdate = store.update.bind(store);
    store.update = async (slug, predicates, next) => {
      store.rows.get(slug)!.workup_json[TEXT_JOB_STATE_KEY] = "running";
      return originalUpdate(slug, predicates, next);
    };
    ok(
      (await failGenerationJob(store, "mark-8", jobId, "raced cleanup", {
        expectedState: "queued",
      })) === "conflict",
      "I3c queued-to-running race is a zero-row conflict",
    );
    ok(store.rows.get("mark-8")!.status === "generating", "I3c raced cleanup leaves the running job untouched");
  }

  // I4. Job ids are collision-resistant UUIDs, not timestamps.
  {
    const store = new FakeJobStore();
    const a = await claimGenerationJob(store, "mark-8", META);
    ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a), "I4 job id is a UUID");
  }

  // I4b. Text regeneration cannot silently orphan or discard paid images.
  {
    const store = new FakeJobStore();
    store.seed("mark-8", "draft", {
      ...(structuredClone(MARK8_IMAGE_WORKUP) as unknown as Record<string, unknown>),
      [IMAGE_JOB_KEY]: "44444444-4444-4444-8444-444444444444",
      [IMAGE_JOB_STATE_KEY]: "running",
    });
    await expectCode(
      () => claimGenerationJob(store, "mark-8", META),
      "REFUSED",
      "I4b active paid image work blocks text regeneration",
    );
    ok(store.rows.get("mark-8")!.status === "draft", "I4b active image row stays untouched");

    const withCompletedImage = structuredClone(MARK8_IMAGE_WORKUP);
    withCompletedImage.images[0] = {
      ...withCompletedImage.images[0],
      status: "complete",
      src: "https://offline-selah.supabase.co/storage/v1/object/public/chapter-images/mark-8/44444444-4444-4444-8444-444444444444/feeding-four-thousand.png",
    };
    store.seed(
      "mark-8",
      "draft",
      withCompletedImage as unknown as Record<string, unknown>,
    );
    await expectCode(
      () => claimGenerationJob(store, "mark-8", META),
      "REFUSED",
      "I4b completed paid images require trusted discard approval",
    );
    const approvedJob = await claimGenerationJob(store, "mark-8", {
      ...META,
      allowDiscardCompletedImages: ALLOW_DISCARD_COMPLETED_IMAGES,
    });
    ok(
      store.rows.get("mark-8")!.status === "generating" && Boolean(approvedJob),
      "I4b exact server-only discard approval permits one replacement draft",
    );
  }

  // I4c. Failed Mark 8 runs expose only useful, allowlisted owner guidance.
  {
    const preModel = safeProtectedMarkFailure("protected_mark_draft:PREPARATION_REFUSED");
    ok(
      preModel?.textCredit === "none" && preModel.failureMessage?.includes("No text credit"),
      "I4c pre-model failure truthfully reports no text spend",
    );
    const quality = safeProtectedMarkFailure("protected_mark_draft:MARK_QUALITY_BLOCKED");
    ok(
      quality?.textCredit === "used" && quality.failureMessage?.includes("quality bar"),
      "I4c quality failure reports used text credit and a useful next step",
    );
    const deadline = safeProtectedMarkFailure("protected_mark_draft:RUN_DEADLINE_EXCEEDED");
    ok(
      deadline?.textCredit === "possible" && deadline.failureMessage?.includes("safe time limit"),
      "I4c deadline failure warns that text credit may have been used",
    );
    ok(
      safeProtectedMarkFailure("private database error") === null &&
        safeProtectedMarkFailure("protected_mark_draft:UNKNOWN_PRIVATE_CODE") === null,
      "I4c unknown or private errors are never exposed",
    );
  }

  // I5. Image single-use claim + consume: duplicates cannot double-spend.
  {
    const store = new FakeJobStore();
    store.seed("mark-8", "draft", structuredClone(MARK8_IMAGE_WORKUP) as unknown as Record<string, unknown>);
    const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
    ok(
      store.rows.get("mark-8")!.workup_json[IMAGE_JOB_PLAN_DIGEST_KEY] === MARK8_IMAGE_BINDING.planDigest &&
        store.rows.get("mark-8")!.workup_json[IMAGE_JOB_MODEL_KEY] === MARK_8_IMAGE_MODEL,
      "I5 Mark 8 claim binds the exact ordered plan and gpt-image-2",
    );
    await expectCode(
      () => claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING),
      "CONFLICT",
      "I5 second image request cannot claim (no double spend)",
    );
    await consumeImageClaim(store, "mark-8", jobId, MARK8_IMAGE_BINDING);
    await expectCode(
      () => consumeImageClaim(store, "mark-8", jobId, MARK8_IMAGE_BINDING),
      "CONFLICT",
      "I5 duplicate image delivery cannot consume twice",
    );
    ok(await releaseImageJob(store, "mark-8", jobId), "I5 failed run releases claim");
    const second = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
    ok(second.jobId !== jobId, "I5 retry gets a fresh job id");
    await consumeImageClaim(store, "mark-8", second.jobId, MARK8_IMAGE_BINDING);
    await completeImageJob(store, "mark-8", second.jobId, { title: "Mark 8", images: [{}] } as unknown as ChapterWorkup);
    ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "I5 completion clears the claim");
  }

  // I6. Stale image worker: superseded run cannot apply; bytes stay orphaned.
  {
    const store = new FakeJobStore();
    store.seed("mark-8", "draft", structuredClone(MARK8_IMAGE_WORKUP) as unknown as Record<string, unknown>);
    const first = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
    ok(await releaseImageJob(store, "mark-8", first.jobId), "I6 first run released");
    const second = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
    await expectCode(
      () => completeImageJob(store, "mark-8", first.jobId, { title: "stale" } as unknown as ChapterWorkup),
      "CONFLICT",
      "I6 stale image worker cannot apply (orphaned files stay isolated)",
    );
    ok((store.rows.get("mark-8")!.workup_json as { title?: string }).title === "Mark 8", "I6 draft untouched by stale run");
    await consumeImageClaim(store, "mark-8", second.jobId, MARK8_IMAGE_BINDING);
    await completeImageJob(store, "mark-8", second.jobId, { title: "Mark 8", images: [{}] } as unknown as ChapterWorkup);
  }

  // I7. Claims refuse protected / published / quarantined / null-revision rows.
  {
    const store = new FakeJobStore();
    store.seed("mark-6", "draft", {});
    await expectCode(() => claimGenerationJob(store, "mark-6", META), "REFUSED", "I7 protected slug cannot be claimed");
    store.seed("mark-8", "reviewed", {});
    await expectCode(() => claimGenerationJob(store, "mark-8", META), "REFUSED", "I7 published row cannot be claimed");
    store.seed("mark-9", "ready", {});
    await expectCode(() => claimGenerationJob(store, "mark-9", META), "REFUSED", "I7 quarantined ready row cannot be claimed");
    store.seed("mark-10", "draft", {}, null);
    await expectCode(() => claimGenerationJob(store, "mark-10", META), "REFUSED", "I7 null updated_at cannot authorize a claim");
    store.seed("mark-11", "draft", {}, null);
    await expectCode(() => claimImageJob(store, "mark-11"), "REFUSED", "I7 null updated_at cannot authorize an image claim");
  }

  // I8. TERMINAL helpers enforce protection too (Codex P1-2): a pre-claimed
  // protected row can never be consumed, completed, failed, or released.
  {
    const store = new FakeJobStore();
    const jid = "11111111-1111-4111-8111-111111111111";
    store.seed("mark-6", "generating", { [TEXT_JOB_KEY]: jid, [TEXT_JOB_STATE_KEY]: "queued" });
    await expectCode(() => consumeGenerationClaim(store, "mark-6", jid), "REFUSED", "I8 protected slug cannot be consumed");
    await expectCode(() => completeGenerationJob(store, "mark-6", jid, { workup: WORKUP }), "REFUSED", "I8 protected slug cannot be completed");
    ok((await failGenerationJob(store, "mark-6", jid, "x", { expectedState: "queued" })) !== "marked_failed", "I8 protected slug cannot be failed");
    ok(store.rows.get("mark-6")!.status === "generating", "I8 protected row untouched by terminal helpers");
    store.seed("psalm-23", "draft", { [IMAGE_JOB_KEY]: jid, imageJobState: "queued", title: "P23" });
    await expectCode(() => consumeImageClaim(store, "psalm-23", jid), "REFUSED", "I8 protected slug cannot consume image claim");
    await expectCode(() => completeImageJob(store, "psalm-23", jid, WORKUP), "REFUSED", "I8 protected slug cannot complete image job");
    ok(!(await releaseImageJob(store, "psalm-23", jid)), "I8 protected slug cannot be released");
    ok((store.rows.get("psalm-23")!.workup_json as { title?: string }).title === "P23", "I8 protected image row untouched");
    // Null-revision rows refuse terminal writes too:
    store.seed("mark-9", "generating", { [TEXT_JOB_KEY]: jid, [TEXT_JOB_STATE_KEY]: "queued" }, null);
    await expectCode(() => consumeGenerationClaim(store, "mark-9", jid), "REFUSED", "I8 null revision cannot be consumed");
    await expectCode(() => completeGenerationJob(store, "mark-9", jid, { workup: WORKUP }), "REFUSED", "I8 null revision cannot be completed");
  }
};

// =====================================================================
// REAL ROUTE + REAL WORKER SUITE — imports the actual Next.js admin route
// handler and the actual Netlify worker handlers, wired to the fake store,
// fake trigger transport, in-memory audit/cost capture, and a zero-spend
// generator that returns the schema-valid Exodus 27 fixture.
// =====================================================================
const ADMIN = process.env.DEV_ADMIN_TOKEN!;
const GENERIC_SLUG = "exodus-27";
const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: true,
  allowed_slugs: [GENERIC_SLUG, "mark-8"],
  selected_text_model: "offline-test-model",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: false,
  updated_at: "T0",
};

function adminReq(body: Record<string, unknown>, token = ADMIN): Request {
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
}
function workerReq(fn: string, body: Record<string, unknown>, method = "POST"): Request {
  return new Request(`http://localhost:3000/.netlify/functions/${fn}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}
function storeLookup(store: FakeJobStore) {
  return async (slug: string) => {
    const r = store.rows.get(slug);
    return r
      ? ({ kind: "row", row: { status: r.status, updatedAt: r.updated_at } } as const)
      : ({ kind: "missing" } as const);
  };
}

const realRouteAndWorkers = async () => {
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  const store = new FakeJobStore();
  let lastTrigger: {
    url: string;
    body: { slug: string; job: string; token: string; approvedManifestDigest?: string };
  } | null = null;
  let triggerResult: TriggerResult = { ok: true, status: 202 };
  let textGeneratorCalls = 0;
  let protectedRunnerCalls = 0;
  let protectedRunnerMode: "complete" | "throw_before" | "throw_after_consume" = "complete";

  __setJobStoreForTesting(store);
  __setRowLookupForTesting(storeLookup(store));
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting(costs);
  __setGenerationConfigBypassForTesting(true);
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = req;
    return triggerResult;
  });
  __setTextGeneratorForTesting(async () => {
    textGeneratorCalls++;
    return {
      content: JSON.stringify(generatedFixture),
      inputTokens: 0,
      outputTokens: 0,
    };
  });
  __setProtectedMarkDraftRunnerForTesting(async (input) => {
    protectedRunnerCalls++;
    if (protectedRunnerMode === "throw_before") {
      throw new Error("offline runner failure before consume");
    }
    try {
      await consumeGenerationClaim(
        store,
        input.slug,
        input.jobId,
        input.approvedManifestDigest,
      );
      if (protectedRunnerMode === "throw_after_consume") {
        throw new Error("offline runner failure after consume");
      }
      await completeGenerationJob(
        store,
        input.slug,
        input.jobId,
        { workup: WORKUP, version: "offline-protected-dispatch", bibleVersion: "ESV" },
        input.approvedManifestDigest,
      );
    } catch (error) {
      if (protectedRunnerMode === "throw_after_consume") throw error;
      return Object.freeze({
        ok: false as const,
        slug: input.slug,
        status: "conflict" as const,
        code: "CLAIM_NOT_CONSUMED" as const,
        manifestDigest: input.approvedManifestDigest,
      });
    }
    return Object.freeze({
      ok: true as const,
      slug: "mark-8" as const,
      status: "draft" as const,
      manifestDigest: input.approvedManifestDigest,
      canonicalDraftDigest: MANIFEST_DIGEST_B,
      snapshotVersion: null,
    });
  });

  try {
    // R1. Route auth: no/bad admin token → 401; nothing claimed, nothing triggered.
    {
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }, "wrong-token"));
      ok(res.status === 401, "R1 bad admin token → 401");
      ok(store.rows.size === 0 && lastTrigger === null, "R1 unauthorized request claimed/triggered nothing");
    }

    // R1b. A browser that signed in before Mark 8 was automatically allowed
    // may still hold a stale full settings object. Saving the visible image
    // switch must not erase that server-managed chapter access or model setup.
    {
      __setGenerationTestOverrides({
        settings: {
          ...TEST_SETTINGS,
          image_generation_enabled: false,
          allowed_slugs: [GENERIC_SLUG, "mark-8"],
        },
        captureAudit: audit,
      });
      const res = await adminPost(adminReq({
        action: "save",
        settings: {
          ...TEST_SETTINGS,
          image_generation_enabled: true,
          allowed_slugs: [GENERIC_SLUG],
          selected_text_model: "stale-text-model",
          selected_image_model: "stale-image-model",
          daily_budget_limit_usd: 999,
        },
      }));
      const saved = await getGenerationSettings();
      ok(res.status === 200, "R1b visible Studio switches saved");
      ok(saved.image_generation_enabled, "R1b image switch changed to ON");
      ok(saved.allowed_slugs.includes("mark-8"), "R1b stale save preserved Mark 8 access");
      ok(
        saved.selected_text_model === TEST_SETTINGS.selected_text_model &&
          saved.selected_image_model === TEST_SETTINGS.selected_image_model &&
          saved.daily_budget_limit_usd === TEST_SETTINGS.daily_budget_limit_usd,
        "R1b stale save preserved server-managed models and budget",
      );
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }

    // R1c. The switch write is authoritative. A later audit outage cannot make
    // Studio report failure and roll its screen back after the save succeeded.
    {
      __setGenerationTestOverrides({
        settings: { ...TEST_SETTINGS, image_generation_enabled: false },
        captureAudit: audit,
        auditFailure: true,
      });
      const res = await adminPost(adminReq({
        action: "save",
        settings: {
          text_generation_enabled: true,
          image_generation_enabled: true,
          require_confirm: true,
        },
      }));
      const saved = await getGenerationSettings();
      ok(res.status === 200, "R1c settings save stays successful through an audit outage");
      ok(saved.image_generation_enabled, "R1c authoritative switch write remains saved");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }

    // R2. Protected slug through the REAL route: refused + durably audited.
    {
      store.seed("mark-6", "draft", {});
      const res = await adminPost(adminReq({ action: "generate", slug: "mark-6" }));
      ok(res.status === 403, "R2 protected slug generate → 403");
      ok(audit.some((a) => a.action === "refused:generate" && a.slug === "mark-6"), "R2 refusal durably audited");
      ok(store.rows.get("mark-6")!.status === "draft" && lastTrigger === null, "R2 protected row untouched, no trigger");
    }

    // R2b. Mark 8 needs the exact lowercase digest plus an explicit owner
    // confirmation. Bad requests cannot claim, trigger, or edit the allowlist.
    {
      const withoutMark8 = {
        ...TEST_SETTINGS,
        allowed_slugs: [GENERIC_SLUG],
      };
      __setGenerationTestOverrides({ settings: withoutMark8, captureAudit: audit });

      const missing = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
      }));
      ok(missing.status === 400, "R2b Mark 8 missing manifest digest → 400");

      const uppercase = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A.toUpperCase(),
      }));
      ok(uppercase.status === 400, "R2b Mark 8 uppercase manifest digest → 400");

      const unconfirmed = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(unconfirmed.status === 400, "R2b Mark 8 without owner confirmation → 400");
      ok(
        !(await getGenerationSettings()).allowed_slugs.includes("mark-8"),
        "R2b malformed/unconfirmed requests did not edit the allowlist",
      );
      ok(
        !store.rows.has("mark-8") && lastTrigger === null,
        "R2b malformed/unconfirmed requests made no claim and no trigger",
      );
    }

    // R2c. Mark 9–11 remain blocked and never reach generic generation.
    {
      for (const blockedSlug of ["mark-9", "mark-10", "mark-11"]) {
        const res = await adminPost(adminReq({
          action: "generate",
          slug: blockedSlug,
          confirm: true,
          approvedManifestDigest: MANIFEST_DIGEST_A,
        }));
        ok(res.status === 403, `R2c ${blockedSlug} protected route remains blocked`);
        ok(!store.rows.has(blockedSlug), `R2c ${blockedSlug} made no claim`);
      }
      ok(lastTrigger === null, "R2c Mark 9–11 sent no trigger");
    }

    // R3. Kill switch OFF through the REAL route: refused before any claim.
    {
      __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }));
      ok(res.status === 403, "R3 text kill switch OFF → 403");
      ok(!store.rows.has(GENERIC_SLUG) && lastTrigger === null, "R3 no claim, no trigger with switch OFF");
      const mark8 = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(mark8.status === 403, "R3 protected Mark 8 also honors text kill switch OFF");
      ok(!store.rows.has("mark-8") && lastTrigger === null, "R3 Mark 8 OFF made no claim and no trigger");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }

    // R3b. Turning the switch OFF after the route queued Mark 8 still stops
    // the worker before protected dispatch and cleans up the exact claim.
    {
      store.rows.delete("mark-8");
      lastTrigger = null;
      const protectedBefore = protectedRunnerCalls;
      const textBefore = textGeneratorCalls;
      const queued = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(queued.status === 200 && lastTrigger !== null, "R3b Mark 8 queued while the switch was ON");
      const body = { ...lastTrigger!.body };
      __setGenerationTestOverrides({
        settings: { ...TEST_SETTINGS, text_generation_enabled: false },
        captureAudit: audit,
      });
      const stopped = await textWorker(workerReq("generate-chapter-background", body));
      ok(stopped.status === 403, "R3b worker-time OFF check refuses protected Mark 8");
      ok(store.rows.get("mark-8")!.status === "failed", "R3b worker-time OFF cleanup marked the exact job failed");
      ok(protectedRunnerCalls === protectedBefore, "R3b OFF reached no protected runner");
      ok(textGeneratorCalls === textBefore, "R3b OFF reached no generic model path");
      store.rows.delete("mark-8");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }

    // R3c. A settings-read rejection is also cleaned up before either runner.
    {
      lastTrigger = null;
      const protectedBefore = protectedRunnerCalls;
      const textBefore = textGeneratorCalls;
      const queued = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(queued.status === 200 && lastTrigger !== null, "R3c queued Mark 8 before permission-read failure");
      __setMark8PermissionCheckerForTesting(async () => {
        throw new Error("offline settings read rejection");
      });
      const stopped = await textWorker(workerReq(
        "generate-chapter-background",
        { ...lastTrigger!.body },
      ));
      __setMark8PermissionCheckerForTesting(null);
      ok(stopped.status === 500, "R3c permission-read rejection reports failure");
      ok(store.rows.get("mark-8")!.status === "failed", "R3c rejected permission read cleaned the exact queued job");
      ok(
        store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === MANIFEST_DIGEST_A,
        "R3c cleanup remained bound to the approved manifest digest",
      );
      ok(protectedRunnerCalls === protectedBefore, "R3c permission-read rejection reached no protected runner");
      ok(textGeneratorCalls === textBefore, "R3c permission-read rejection reached no generic runner");
      store.rows.delete("mark-8");
    }

    // R3d. A duplicate delivery that sees the switch OFF cannot use queued
    // cleanup to cancel the first delivery after it already consumed the job.
    {
      lastTrigger = null;
      const queued = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(queued.status === 200 && lastTrigger !== null, "R3d queued Mark 8 for duplicate-delivery race");
      const body = { ...lastTrigger!.body };
      await consumeGenerationClaim(store, "mark-8", body.job, MANIFEST_DIGEST_A);
      __setGenerationTestOverrides({
        settings: { ...TEST_SETTINGS, text_generation_enabled: false },
        captureAudit: audit,
      });
      const duplicate = await textWorker(workerReq("generate-chapter-background", body));
      ok(duplicate.status === 409, "R3d duplicate OFF delivery cannot clean up a running job");
      ok(
        store.rows.get("mark-8")!.status === "generating" &&
          store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "running",
        "R3d first delivery remains running",
      );
      await completeGenerationJob(
        store,
        "mark-8",
        body.job,
        { workup: WORKUP, version: "offline-race-proof", bibleVersion: "ESV" },
        MANIFEST_DIGEST_A,
      );
      ok(store.rows.get("mark-8")!.status === "draft", "R3d first delivery can still save its private draft");
      store.rows.delete("mark-8");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }

    // R4. FULL PIPELINE: real route claims + triggers; real worker authenticates,
    // consumes, generates (fixture), completes a draft.
    {
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }));
      ok(res.status === 200, "R4 route accepted generate");
      ok(lastTrigger !== null, "R4 route sent an authenticated trigger");
      const { slug, job, token } = lastTrigger!.body;
      ok(slug === GENERIC_SLUG && !!job && !!token, "R4 trigger carries slug + job + signed token");
      ok(lastTrigger!.body.approvedManifestDigest === undefined, "R4 generic trigger payload remains unchanged");
      ok(store.rows.get(GENERIC_SLUG)!.workup_json[TEXT_JOB_STATE_KEY] === "queued", "R4 claim is queued until the worker consumes");

      const wres = await textWorker(workerReq("generate-chapter-background", { slug, job, token }));
      ok(wres.status === 200, `R4 real worker completed (HTTP ${wres.status})`);
      ok(store.rows.get(GENERIC_SLUG)!.status === "draft", "R4 worker saved a draft via the real pipeline");

      // Replay the SAME delivery (valid token, already-consumed job): refused, draft untouched.
      const replay = await textWorker(workerReq("generate-chapter-background", { slug, job, token }));
      ok(replay.status === 500 || replay.status === 409, `R4 duplicate delivery refused (HTTP ${replay.status})`);
      ok(store.rows.get(GENERIC_SLUG)!.status === "draft", "R4 duplicate delivery changed nothing");
      ok(audit.some((a) => a.action === "generate_text_conflict" || String(a.message ?? "").includes("claim not consumed")), "R4 duplicate delivery durably audited");
    }

    // R5. Worker authentication/method handling (the real handler).
    {
      const jid = "22222222-2222-4222-8222-222222222222";
      const get = await textWorker(workerReq("generate-chapter-background", {}, "GET"));
      ok(get.status === 405, "R5 non-POST → 405");
      const missing = await textWorker(workerReq("generate-chapter-background", { slug: "mark-8" }));
      ok(missing.status === 400, "R5 missing job id → 400");
      const bad = await textWorker(workerReq("generate-chapter-background", {
        slug: "mark-8",
        job: jid,
        token: "junk",
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(bad.status === 401, "R5 bad token → 401");
      const expired = signJobToken(
        "text",
        "mark-8",
        jid,
        Date.now() - 60 * 60 * 1000,
        MANIFEST_DIGEST_A,
      ).token;
      const exp = await textWorker(workerReq("generate-chapter-background", {
        slug: "mark-8",
        job: jid,
        token: expired,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(exp.status === 401, "R5 expired token → 401");
      const wrongPurpose = signJobToken("image", "mark-8", jid).token;
      const wp = await textWorker(workerReq("generate-chapter-background", {
        slug: "mark-8",
        job: jid,
        token: wrongPurpose,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(wp.status === 401, "R5 image-purpose token rejected by text worker");
      ok(audit.filter((a) => a.action === "refused:worker_generate").length >= 4, "R5 worker refusals durably audited");
    }

    // R5b. Real trigger + worker bind an optional approved manifest digest.
    {
      store.rows.delete(GENERIC_SLUG);
      lastTrigger = null;
      const jobId = await claimGenerationJob(store, GENERIC_SLUG, {
        book: "Exodus",
        chapter: 27,
        title: "Exodus 27",
        approvedManifestDigest: MANIFEST_DIGEST_A,
      });
      const triggered = await triggerBackgroundGeneration(
        GENERIC_SLUG,
        "localhost:3000",
        jobId,
        MANIFEST_DIGEST_A,
      );
      ok(triggered.ok && lastTrigger !== null, "R5b real trigger accepted the bound text job");
      ok(
        lastTrigger!.body.approvedManifestDigest === MANIFEST_DIGEST_A,
        "R5b trigger carries the approved manifest digest",
      );

      const body = lastTrigger!.body;
      const callsBeforeRefusals = textGeneratorCalls;
      const omitted = await textWorker(workerReq("generate-chapter-background", {
        slug: body.slug,
        job: body.job,
        token: body.token,
      }));
      ok(omitted.status === 401, "R5b worker rejects an omitted bound digest");

      const mismatched = await textWorker(workerReq("generate-chapter-background", {
        ...body,
        approvedManifestDigest: MANIFEST_DIGEST_B,
      }));
      ok(mismatched.status === 401, "R5b worker rejects a mismatched bound digest");

      const tamperedDigest = `${MANIFEST_DIGEST_A.slice(0, -1)}b`;
      const tampered = await textWorker(workerReq("generate-chapter-background", {
        ...body,
        approvedManifestDigest: tamperedDigest,
      }));
      ok(tampered.status === 401, "R5b worker rejects a tampered bound digest");

      const replacement = body.token.endsWith("0") ? "1" : "0";
      const tamperedToken = await textWorker(workerReq("generate-chapter-background", {
        ...body,
        token: `${body.token.slice(0, -1)}${replacement}`,
      }));
      ok(tamperedToken.status === 401, "R5b worker rejects a tampered bound token");
      ok(textGeneratorCalls === callsBeforeRefusals, "R5b all digest/auth refusals happen before text work");

      const exact = await textWorker(workerReq("generate-chapter-background", body));
      ok(exact.status === 200, `R5b exact digest-bound worker completed (HTTP ${exact.status})`);
      ok(textGeneratorCalls === callsBeforeRefusals + 1, "R5b exact binding performs text work once");
      ok(store.rows.get(GENERIC_SLUG)!.status === "draft", "R5b exact bound run saved its draft");
    }

    // R5c. The real route + handler dispatch Mark 8 only through the protected
    // runner. This offline runner seam performs the real digest-bound
    // claim/consume/complete writes but makes no source, model, or network call.
    {
      store.rows.delete("mark-8");
      lastTrigger = null;
      const callsBefore = textGeneratorCalls;
      const protectedBefore = protectedRunnerCalls;
      __setGenerationTestOverrides({
        settings: { ...TEST_SETTINGS, allowed_slugs: [GENERIC_SLUG] },
        captureAudit: audit,
      });

      const routeResponse = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(routeResponse.status === 200, "R5c confirmed Mark 8 route accepted the protected draft");
      ok(lastTrigger !== null, "R5c protected route sent an authenticated trigger");
      ok(
        (await getGenerationSettings()).allowed_slugs.includes("mark-8"),
        "R5c confirmed Mark 8 was automatically added to the allowlist",
      );
      const firstBody = { ...lastTrigger!.body };
      ok(
        firstBody.slug === "mark-8" &&
          firstBody.approvedManifestDigest === MANIFEST_DIGEST_A,
        "R5c trigger carries exact Mark 8 slug + manifest digest",
      );
      ok(
        store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "queued" &&
          store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === MANIFEST_DIGEST_A,
        "R5c route atomically queued the digest-bound job",
      );

      const omitted = await textWorker(workerReq("generate-chapter-background", {
        slug: firstBody.slug,
        job: firstBody.job,
        token: firstBody.token,
      }));
      ok(omitted.status === 400, "R5c Mark 8 worker rejects a missing digest");
      const wrong = await textWorker(workerReq("generate-chapter-background", {
        ...firstBody,
        approvedManifestDigest: MANIFEST_DIGEST_B,
      }));
      ok(wrong.status === 401, "R5c Mark 8 worker rejects a digest not bound to its token");
      ok(protectedRunnerCalls === protectedBefore, "R5c bad digest requests never reached the protected runner");

      const exact = await textWorker(workerReq("generate-chapter-background", firstBody));
      ok(exact.status === 200, `R5c exact protected dispatch completed (HTTP ${exact.status})`);
      ok(protectedRunnerCalls === protectedBefore + 1, "R5c protected runner dispatched exactly once");
      ok(textGeneratorCalls === callsBefore, "R5c generic generator never handled Mark 8");
      ok(store.rows.get("mark-8")!.status === "draft", "R5c protected dispatch saved only a private draft");

      const replay = await textWorker(workerReq("generate-chapter-background", firstBody));
      ok(replay.status === 409, "R5c duplicate protected delivery is refused");
      ok(store.rows.get("mark-8")!.status === "draft", "R5c duplicate delivery changed nothing");

      lastTrigger = null;
      const secondRoute = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_B,
      }));
      ok(secondRoute.status === 200 && lastTrigger !== null, "R5c a new confirmed Mark 8 job can be queued");
      const secondBody = { ...lastTrigger!.body };
      const stale = await textWorker(workerReq("generate-chapter-background", firstBody));
      ok(stale.status === 409, "R5c stale delivery cannot consume a newer job");
      ok(
        store.rows.get("mark-8")!.workup_json[TEXT_JOB_KEY] === secondBody.job &&
          store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "queued" &&
          store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === MANIFEST_DIGEST_B,
        "R5c stale delivery left the newer digest-bound job untouched",
      );
      const secondExact = await textWorker(workerReq("generate-chapter-background", secondBody));
      ok(secondExact.status === 200, "R5c newer exact delivery completes normally");
      ok(textGeneratorCalls === callsBefore, "R5c no Mark 8 path reached generic generation");
      store.rows.delete("mark-8");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }

    // R5d. The actual worker refuses Mark 9–11 before either generator runs.
    {
      const callsBefore = textGeneratorCalls;
      const protectedBefore = protectedRunnerCalls;
      for (const blockedSlug of ["mark-9", "mark-10", "mark-11"]) {
        const job = `offline-${blockedSlug}-job`;
        const token = signJobToken(
          "text",
          blockedSlug,
          job,
          undefined,
          MANIFEST_DIGEST_A,
        ).token;
        const response = await textWorker(workerReq("generate-chapter-background", {
          slug: blockedSlug,
          job,
          token,
          approvedManifestDigest: MANIFEST_DIGEST_A,
        }));
        ok(response.status === 403, `R5d worker keeps ${blockedSlug} blocked`);
      }
      ok(textGeneratorCalls === callsBefore, "R5d Mark 9–11 never reached generic generation");
      ok(protectedRunnerCalls === protectedBefore, "R5d Mark 9–11 never reached the Mark 8 runner");
    }

    // R5e. An outer catch may clean only a queued claim. Once a runner consumed
    // it, the outer layer has no ownership proof and must leave it untouched.
    {
      store.rows.delete("mark-8");
      lastTrigger = null;
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });

      protectedRunnerMode = "throw_before";
      const beforeRoute = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(beforeRoute.status === 200 && lastTrigger !== null, "R5e queued throw-before job");
      const beforeResponse = await textWorker(workerReq(
        "generate-chapter-background",
        { ...lastTrigger!.body },
      ));
      ok(beforeResponse.status === 500, "R5e throw before consume reports worker failure");
      ok(store.rows.get("mark-8")!.status === "failed", "R5e throw before consume cleaned the queued job");

      lastTrigger = null;
      protectedRunnerMode = "throw_after_consume";
      const afterRoute = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_B,
      }));
      ok(afterRoute.status === 200 && lastTrigger !== null, "R5e queued throw-after-consume job");
      const afterResponse = await textWorker(workerReq(
        "generate-chapter-background",
        { ...lastTrigger!.body },
      ));
      ok(afterResponse.status === 409, "R5e throw after consume reports a non-destructive conflict");
      ok(
        store.rows.get("mark-8")!.status === "generating" &&
          store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "running",
        "R5e outer catch left the running job untouched without ownership proof",
      );
      ok(
        (await failGenerationJob(store, "mark-8", String(lastTrigger!.body.job), "owned runner cleanup", {
          expectedState: "running",
          approvedManifestDigest: MANIFEST_DIGEST_B,
        })) === "marked_failed",
        "R5e a runner with running-state authority can clean up its own job",
      );
      protectedRunnerMode = "complete";
      store.rows.delete("mark-8");
    }

    // R6. Trigger failure through the REAL route: job failed + truthful response.
    {
      store.rows.delete(GENERIC_SLUG);
      triggerResult = { ok: false, error: "connect ECONNREFUSED" };
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }));
      ok(res.status === 502, "R6 trigger failure → 502");
      ok(store.rows.get(GENERIC_SLUG)!.status === "failed", "R6 job marked failed, not stranded");
      const bodyJson = (await res.json()) as { error?: string };
      ok(/job marked failed/.test(bodyJson.error ?? ""), "R6 response states the true cleanup outcome");
      store.rows.delete(GENERIC_SLUG);
    }

    // R6b. If the worker accepted and consumed a trigger but the route lost the
    // response, route-side queued cleanup cannot terminate the paid run.
    {
      store.rows.delete("mark-8");
      lastTrigger = null;
      __setTriggerTransportForTesting(async (req) => {
        lastTrigger = req;
        await consumeGenerationClaim(
          store,
          req.body.slug,
          req.body.job,
          req.body.approvedManifestDigest,
        );
        return { ok: false, error: "accepted response lost" };
      });
      const response = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(response.status === 502, "R6b lost trigger response reports failure to Studio");
      ok(lastTrigger !== null, "R6b worker received the trigger before its response was lost");
      ok(
        store.rows.get("mark-8")!.status === "generating" &&
          store.rows.get("mark-8")!.workup_json[TEXT_JOB_STATE_KEY] === "running",
        "R6b route cleanup left the consumed job running",
      );
      await completeGenerationJob(
        store,
        "mark-8",
        lastTrigger!.body.job,
        { workup: WORKUP, version: "offline-lost-response", bibleVersion: "ESV" },
        MANIFEST_DIGEST_A,
      );
      ok(store.rows.get("mark-8")!.status === "draft", "R6b accepted worker can still save the private draft");
      store.rows.delete("mark-8");
      __setTriggerTransportForTesting(async (req) => {
        lastTrigger = req;
        return triggerResult;
      });
    }

    // R6c. Trigger failure AND cleanup write failure: response admits stranding.
    {
      triggerResult = { ok: false, error: "connect ECONNREFUSED" };
      // The claim is an INSERT (row deleted above), so the FIRST update is the
      // cleanup write — make it fail once.
      const origUpdate = store.update.bind(store);
      let failedOnce = false;
      store.update = async (slug, p, next) => {
        if (!failedOnce) {
          failedOnce = true;
          return { error: "simulated cleanup write failure" };
        }
        return origUpdate(slug, p, next);
      };
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }));
      store.update = origUpdate;
      ok(res.status === 500, "R6c cleanup write failure → 500");
      const bodyJson = (await res.json()) as { error?: string };
      ok(/CLEANUP WRITE FAILED|still be marked generating/i.test(bodyJson.error ?? ""), "R6c response admits the row may be stranded");
      ok(store.rows.get(GENERIC_SLUG)!.status === "generating", "R6c row genuinely stranded — response told the truth");
      store.rows.delete(GENERIC_SLUG);
      triggerResult = { ok: true, status: 202 };
    }

    // R6d. Mark 8 trigger cleanup must present the same manifest digest that
    // was bound to the claim; omitting it would conflict and strand the row.
    {
      store.rows.delete("mark-8");
      lastTrigger = null;
      triggerResult = { ok: false, error: "offline protected trigger failure" };
      __setGenerationTestOverrides({
        settings: { ...TEST_SETTINGS, allowed_slugs: [GENERIC_SLUG] },
        captureAudit: audit,
      });
      const response = await adminPost(adminReq({
        action: "generate",
        slug: "mark-8",
        confirm: true,
        approvedManifestDigest: MANIFEST_DIGEST_A,
      }));
      ok(response.status === 502, "R6d Mark 8 trigger failure → 502");
      ok(store.rows.get("mark-8")!.status === "failed", "R6d exact digest cleanup marked the protected job failed");
      ok(
        store.rows.get("mark-8")!.workup_json[TEXT_JOB_MANIFEST_DIGEST_KEY] === MANIFEST_DIGEST_A,
        "R6d cleanup stayed pinned to the original manifest digest",
      );
      store.rows.delete("mark-8");
      triggerResult = { ok: true, status: 202 };
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
    }
  } finally {
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setGenerationConfigBypassForTesting(false);
    __setTriggerTransportForTesting(null);
    __setTextGeneratorForTesting(null);
    __setMark8PermissionCheckerForTesting(null);
    __setProtectedMarkDraftRunnerForTesting(null);
  }
};

// =====================================================================
// REAL IMAGE PIPELINE SUITE — the actual worker handler + the actual
// generateAndStoreChapterImages envelope: bucket failure, upload failure,
// spend accounting, conflicts. Zero network, zero spend.
// =====================================================================
type FakeDb = {
  buckets: { failCreate: boolean };
  uploads: string[];
  failUploadAfter: number; // fail uploads once this many succeeded (-1 = never)
  storage: unknown;
};
function fakeDb(): FakeDb {
  const state: FakeDb = { buckets: { failCreate: false }, uploads: [], failUploadAfter: -1, storage: null };
  state.storage = {
    createBucket: async () => (state.buckets.failCreate ? { error: { message: "bucket boom" } } : { error: null }),
    from: () => ({
      upload: async (path: string) => {
        if (state.failUploadAfter >= 0 && state.uploads.length >= state.failUploadAfter) {
          return { error: { message: "upload boom" } };
        }
        state.uploads.push(path);
        return { error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://fake.storage/storage/v1/object/public/chapter-images/${path}` },
      }),
    }),
  };
  return state;
}
const realImagePipeline = async () => {
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  const store = new FakeJobStore();
  const db = fakeDb();
  let imageTrigger: {
    body: {
      slug: string;
      job: string;
      token: string;
      imagePlanDigest?: string;
      imageModel?: string;
    };
  } | null = null;

  __setJobStoreForTesting(store);
  __setRowLookupForTesting(storeLookup(store));
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting(costs);
  __setImageTestOverrides({
    configBypass: true,
    modelProbe: async (model) => ({ ok: true, model }),
  });
  __setTriggerTransportForTesting(async (request) => {
    imageTrigger = request;
    return { ok: true, status: 202 };
  });
  __setImageDepsForTesting({
    db: { storage: db.storage } as never,
    generateBytes: async () => Buffer.from("fake-png"),
  });

  try {
    const workupJson = structuredClone(MARK8_IMAGE_WORKUP) as unknown as Record<string, unknown>;

    // M0. REAL Studio admin route: exact draft plan + project-standard model
    // are bound before its authenticated background dispatch.
    {
      const warnedWorkup = {
        ...structuredClone(workupJson),
        sourceOverlapReview: SOURCE_OVERLAP_WARNING,
      };
      store.seed("mark-8", "draft", warnedWorkup);
      const warningNotReviewed = await adminPost(adminReq({
        action: "generate_images",
        slug: "mark-8",
        approvedImagePlanDigest: MARK8_IMAGE_BINDING.planDigest,
        approvedImageCount: 3,
        approvedImageModel: MARK_8_IMAGE_MODEL,
      }));
      ok(
        warningNotReviewed.status === 403,
        "M0 copy-warning draft cannot spend on images before owner review",
      );
      ok(
        store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined &&
          imageTrigger === null,
        "M0 unreviewed copy warning claims nothing and triggers nothing",
      );
      const wrongWarningReview = await adminPost(adminReq({
        action: "generate_images",
        slug: "mark-8",
        approvedImagePlanDigest: MARK8_IMAGE_BINDING.planDigest,
        approvedImageCount: 3,
        approvedImageModel: MARK_8_IMAGE_MODEL,
        sourceOverlapReportDigest: "e".repeat(64),
      }));
      ok(
        wrongWarningReview.status === 403 && imageTrigger === null,
        "M0 stale copy-warning approval cannot spend",
      );
      const reviewedWarning = await adminPost(adminReq({
        action: "generate_images",
        slug: "mark-8",
        approvedImagePlanDigest: MARK8_IMAGE_BINDING.planDigest,
        approvedImageCount: 3,
        approvedImageModel: MARK_8_IMAGE_MODEL,
        sourceOverlapReportDigest: SOURCE_OVERLAP_REPORT_DIGEST,
      }));
      const reviewedWarningBody = await reviewedWarning.json() as Record<string, unknown>;
      ok(
        reviewedWarning.status === 200 && reviewedWarningBody.triggered === true,
        "M0 exact copy-warning review unlocks only the confirmed image run",
      );
      ok(
        (imageTrigger as unknown as { body: Record<string, unknown> }).body
          .sourceOverlapReportDigest === SOURCE_OVERLAP_REPORT_DIGEST,
        "M0 exact copy-warning review stays bound through worker dispatch",
      );
      ok(
        await releaseImageJob(
          store,
          "mark-8",
          String(reviewedWarningBody.jobId),
          "queued",
        ),
        "M0 reviewed warning test releases its unspent claim",
      );
      store.rows.delete("mark-8");
      imageTrigger = null;

      store.seed("mark-8", "draft", structuredClone(workupJson));
      const unconfirmed = await adminPost(adminReq({
        action: "generate_images",
        slug: "mark-8",
      }));
      ok(unconfirmed.status === 409, "M0 Studio refuses image spend without the exact owner-confirmed plan");
      ok(store.rows.get("mark-8")!.status === "draft" && imageTrigger === null, "M0 unconfirmed image request claims nothing and triggers nothing");

      const response = await adminPost(adminReq({
        action: "generate_images",
        slug: "mark-8",
        approvedImagePlanDigest: MARK8_IMAGE_BINDING.planDigest,
        approvedImageCount: 3,
        approvedImageModel: MARK_8_IMAGE_MODEL,
      }));
      const body = await response.json() as Record<string, unknown>;
      ok(response.status === 200 && body.triggered === true, "M0 Studio route claims and dispatches Mark 8 images");
      const trigger = imageTrigger as unknown as { body: Record<string, unknown> };
      ok(
        trigger.body.imagePlanDigest === MARK8_IMAGE_BINDING.planDigest &&
          trigger.body.imageModel === MARK_8_IMAGE_MODEL,
        "M0 dispatch carries the exact stored plan digest and gpt-image-2 binding",
      );
      const row = store.rows.get("mark-8")!;
      ok(
        row.workup_json[IMAGE_JOB_PLAN_DIGEST_KEY] === MARK8_IMAGE_BINDING.planDigest &&
          row.workup_json[IMAGE_JOB_MODEL_KEY] === MARK_8_IMAGE_MODEL,
        "M0 atomic claim persists the same plan/model binding",
      );
      const statusResponse = await adminPost(adminReq({ action: "images_status", slug: "mark-8" }));
      const status = await statusResponse.json() as Record<string, unknown>;
      ok(
        status.state === "queued" && status.model === MARK_8_IMAGE_MODEL && status.done === false &&
          status.planDigest === MARK8_IMAGE_BINDING.planDigest && status.estimatedCostUsd === 0.495,
        "M0 Studio status truthfully reports queued exact-model work",
      );
      ok(
        await releaseImageJob(store, "mark-8", String(body.jobId), "queued"),
        "M0 unspent route claim releases cleanly",
      );
      store.rows.delete("mark-8");
      imageTrigger = null;

      const invalidPlan = structuredClone(workupJson);
      invalidPlan.images = (invalidPlan.images as unknown[]).slice(0, 2);
      store.seed("mark-8", "draft", invalidPlan);
      const invalidStatus = await adminPost(adminReq({ action: "images_status", slug: "mark-8" }));
      const invalidBody = await invalidStatus.json() as Record<string, unknown>;
      ok(
        invalidStatus.status === 409 && invalidBody.ok === false && !("estimatedCostUsd" in invalidBody),
        "M0 invalid plan blocks Studio instead of showing a false $0 estimate",
      );
      store.rows.delete("mark-8");
    }

    // M1. Worker method/auth (real handler).
    {
      const jid = "33333333-3333-4333-8333-333333333333";
      ok((await imagesWorker(workerReq("generate-images-background", {}, "GET"))).status === 405, "M1 non-POST → 405");
      ok((await imagesWorker(workerReq("generate-images-background", { slug: "mark-8", job: jid, token: "junk" }))).status === 401, "M1 bad token → 401");
      const textToken = signJobToken("text", "mark-8", jid).token;
      ok((await imagesWorker(workerReq("generate-images-background", { slug: "mark-8", job: jid, token: textToken }))).status === 401, "M1 text-purpose token rejected by image worker");
      ok(audit.filter((a) => a.action === "refused:worker_images").length >= 3, "M1 image worker refusals durably audited");
    }

    // M2. Happy path through the REAL worker: claim (as the route does) → consume → generate → upload → complete.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      const token = signJobToken("image", "mark-8", jobId).token;
      const res = await imagesWorker(workerReq("generate-images-background", {
        slug: "mark-8",
        job: jobId,
        token,
        imagePlanDigest: MARK8_IMAGE_BINDING.planDigest,
        imageModel: MARK8_IMAGE_BINDING.model,
      }));
      ok(res.status === 200, `M2 real image worker succeeded (HTTP ${res.status})`);
      ok(db.uploads.length === 3 && db.uploads.every((p) => p.includes(`mark-8/${jobId}/`)), "M2 uploads go to the immutable job directory");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "M2 completion cleared the claim");
      ok(
        costs.some((c) => c.imageCount === 3 && c.estimatedCostUsd === 0.495 && c.imageQuality === "high" && !(c.metadata as { failed?: boolean })?.failed),
        "M2 success spend records gpt-image-2 high-quality estimate",
      );
      const finalWorkup = store.rows.get("mark-8")!.workup_json as unknown as ChapterWorkup;
      ok(
        finalWorkup.images.map((image) => image.kind).join(",") ===
          MARK8_IMAGE_WORKUP.images.map((image) => image.kind).join(","),
        "M2 exact planned image order replaces placeholders (no append)",
      );
      ok(finalWorkup.heroKind === MARK8_IMAGE_WORKUP.heroKind, "M2 exact heroKind is preserved");
      ok(finalWorkup.images.every(isStoredMark8ImageUrl), "M2 final image URLs use the exact public Mark 8 job/kind paths");
      const reviewDigest = mark8FinalReviewDigest(finalWorkup);
      ok(reviewDigest !== null, "M2 complete final workup gets a review digest");
      ok(
        mark8FinalReviewDigest({ ...finalWorkup, title: "Changed after review" }) !== reviewDigest,
        "M2 review digest binds non-image render content too",
      );
      ok(
        mark8FinalReviewDigest({
          ...finalWorkup,
          [IMAGE_JOB_KEY]: "transient",
          [IMAGE_JOB_STATE_KEY]: "queued",
          [IMAGE_JOB_PLAN_DIGEST_KEY]: MARK8_IMAGE_BINDING.planDigest,
          [IMAGE_JOB_MODEL_KEY]: MARK_8_IMAGE_MODEL,
        } as ChapterWorkup) === reviewDigest,
        "M2 transient image-job keys do not change the final review digest",
      );
      const statusResponse = await adminPost(adminReq({ action: "images_status", slug: "mark-8" }));
      const statusBody = await statusResponse.json() as Record<string, unknown>;
      ok(
        statusResponse.status === 200 && statusBody.done === true && statusBody.state === "idle" &&
          statusBody.reviewDigest === reviewDigest,
        "M2 Studio status exposes the exact complete-workup review digest",
      );
      const statusItems = statusBody.images as Array<Record<string, unknown>>;
      ok(
        statusItems.length === 3 && statusItems.every((item) => typeof item.description === "string" && !("prompt" in item) && !("src" in item)),
        "M2 Studio status is useful but exposes no prompts or storage URLs",
      );
      // Duplicate delivery of the same run: refused, no double spend.
      db.uploads.length = 0;
      const replay = await imagesWorker(workerReq("generate-images-background", {
        slug: "mark-8",
        job: jobId,
        token,
        imagePlanDigest: MARK8_IMAGE_BINDING.planDigest,
        imageModel: MARK8_IMAGE_BINDING.model,
      }));
      ok(replay.status === 500, "M2 duplicate image delivery refused");
      ok(db.uploads.length === 0, "M2 duplicate delivery spent nothing");
      store.rows.delete("mark-8");
    }

    // M3b. Worker-time switches and thrown control reads release queued work;
    // no valid pre-spend refusal can leave Mark 8 stranded or spend anything.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      db.uploads.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      __setGenerationTestOverrides({
        settings: { ...TEST_SETTINGS, image_generation_enabled: false },
        captureAudit: audit,
      });
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      ok(!result.ok && store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "M3b disabled switch releases queued claim");
      ok(db.uploads.length === 0, "M3b disabled switch spends nothing");
      store.rows.delete("mark-8");

      store.seed("mark-8", "draft", structuredClone(workupJson));
      const throwingSettings = { ...TEST_SETTINGS };
      Object.defineProperty(throwingSettings, "image_generation_enabled", {
        enumerable: true,
        get() { throw new Error("settings read boom"); },
      });
      const thrownJob = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      __setGenerationTestOverrides({ settings: throwingSettings, captureAudit: audit });
      const thrown = await generateAndStoreChapterImages("mark-8", thrownJob.jobId, MARK8_IMAGE_BINDING);
      ok(!thrown.ok && /settings read boom/.test(thrown.error ?? ""), "M3b thrown control check surfaces");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "M3b thrown control check releases queued claim");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
      store.rows.delete("mark-8");
    }

    // M3c. Worker re-verifies both exact claim bindings before spend.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      db.uploads.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      const wrongModel = await generateAndStoreChapterImages("mark-8", jobId, {
        ...MARK8_IMAGE_BINDING,
        model: "gpt-image-1",
      });
      ok(!wrongModel.ok && /gpt-image-2/.test(wrongModel.error ?? ""), "M3c wrong worker model binding refused");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined && db.uploads.length === 0, "M3c wrong model releases queued claim with zero spend");
      store.rows.delete("mark-8");

      store.seed("mark-8", "draft", structuredClone(workupJson));
      const changedPlanJob = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      const changedRow = store.rows.get("mark-8")!;
      const changedImages = structuredClone((changedRow.workup_json as unknown as ChapterWorkup).images);
      changedImages[0].caption += " changed";
      changedRow.workup_json = { ...changedRow.workup_json, images: changedImages };
      const changed = await generateAndStoreChapterImages("mark-8", changedPlanJob.jobId, MARK8_IMAGE_BINDING);
      ok(!changed.ok && /no longer matches|changed|digest/i.test(changed.error ?? ""), "M3c changed stored plan refused");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined && db.uploads.length === 0, "M3c changed plan releases queued claim with zero spend");
      store.rows.delete("mark-8");
    }

    // M3. Bucket failure INSIDE the envelope: claim released, audited, no spend.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      db.buckets.failCreate = true;
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      db.buckets.failCreate = false;
      ok(!result.ok && /bucket boom|createBucket/.test(result.error ?? ""), "M3 bucket failure surfaces");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "M3 claim released after bucket failure");
      ok(costs.length === 0, "M3 nothing generated → no cost event");
      ok(audit.some((a) => a.action === "image_run_failed"), "M3 failure durably audited");
      store.rows.delete("mark-8");
    }

    // M4. Generated-but-upload-failed images COUNT AS SPEND.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      db.uploads.length = 0;
      db.failUploadAfter = 1; // first upload ok, second fails (after 2nd generation)
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      db.failUploadAfter = -1;
      ok(!result.ok, "M4 upload failure fails the run");
      const spend = costs.find((c) => (c.metadata as { failed?: boolean })?.failed);
      ok(!!spend && spend.imageCount === 2, "M4 BOTH generated images counted as spend (uploaded only 1)");
      ok((spend!.metadata as { uploaded?: number }).uploaded === 1, "M4 spend metadata separates generated vs uploaded");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_STATE_KEY] === "failed", "M4 paid failure is terminal, not auto-retried");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_SPENT_COUNT_KEY] === 2, "M4 terminal state exposes exact spend count");
      const retry = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      ok(retry.jobId !== jobId && store.rows.get("mark-8")!.workup_json[IMAGE_JOB_STATE_KEY] === "queued", "M4 explicit owner retry replaces only failed state");
      ok(await releaseImageJob(store, "mark-8", retry.jobId, "queued"), "M4 retry claim can be safely released before spend");
      store.rows.delete("mark-8");
    }

    // M5. Terminal conflict AFTER spend records a cost event (not just an audit).
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      // Sabotage the terminal write: another actor replaces the claim mid-run.
      const row = store.rows.get("mark-8")!;
      const origUpdate = store.update.bind(store);
      store.update = async (slug, p, next) => {
        // Before the COMPLETION write lands (state pinned to "running"), the
        // claim key changes — the consume itself is left alone:
        const isCompletion = (p.json ?? []).some((c) => c.key === "imageJobState" && c.equals === "running");
        if (isCompletion) {
          row.workup_json = { ...row.workup_json, [IMAGE_JOB_KEY]: "someone-else" };
        }
        return origUpdate(slug, p, next);
      };
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      store.update = origUpdate;
      ok(!result.ok && /not applied|CONFLICT/i.test(result.error ?? ""), "M5 superseded run cannot apply");
      const spend = costs.find((c) => (c.metadata as { planDigest?: string })?.planDigest === MARK8_IMAGE_BINDING.planDigest);
      ok(!!spend && spend.imageCount === 3, "M5 conflicted spend was strictly recorded before terminal apply");
      ok(audit.some((a) => a.action === "image_run_conflict"), "M5 conflict durably audited");
      store.rows.delete("mark-8");
    }

    // M6. Spend whose strict cost row fails is BLOCKED and cannot retry.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      db.uploads.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      __setCostCaptureForTesting(null);
      __setCostWriteFailureForTesting("insert_failed");
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      __setCostWriteFailureForTesting(null);
      __setCostCaptureForTesting(costs);
      const row = store.rows.get("mark-8")!;
      ok(!result.ok && /blocked/.test(result.error ?? ""), "M6 unrecorded spend returns blocked");
      ok(row.workup_json[IMAGE_JOB_STATE_KEY] === "blocked", "M6 unrecorded spend is visibly blocked, not running");
      ok(row.workup_json[IMAGE_JOB_SPENT_COUNT_KEY] === 3, "M6 blocked state preserves exact spend count");
      ok(row.workup_json[IMAGE_JOB_ERROR_CODE_KEY] === "cost_record_failed", "M6 blocked state carries safe error code");
      await expectCode(
        () => claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING),
        "CONFLICT",
        "M6 blocked spend cannot automatically retry",
      );
      const statusResponse = await adminPost(adminReq({ action: "images_status", slug: "mark-8" }));
      const statusBody = await statusResponse.json() as Record<string, unknown>;
      ok(statusBody.state === "blocked" && statusBody.spentCount === 3 && statusBody.done === false, "M6 Studio sees terminal blocked state and spend count");
      store.rows.delete("mark-8");
    }

    // M7. A completion write conflict that still belongs to this exact job is
    // terminal `failed`, never an endless running poll.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      const originalUpdate = store.update.bind(store);
      let failCompletionOnce = true;
      store.update = async (slug, predicates, next) => {
        const isCompletion = (predicates.json ?? []).some(
          (check) => check.key === IMAGE_JOB_STATE_KEY && check.equals === "running",
        ) && "workup_json" in next && !(IMAGE_JOB_STATE_KEY in (next.workup_json as Record<string, unknown>));
        if (isCompletion && failCompletionOnce) {
          failCompletionOnce = false;
          return 0;
        }
        return originalUpdate(slug, predicates, next);
      };
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      store.update = originalUpdate;
      ok(!result.ok, "M7 completion conflict fails the run");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_STATE_KEY] === "failed", "M7 owned completion conflict becomes terminal failed");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_SPENT_COUNT_KEY] === 3, "M7 completion conflict exposes spent count");
      store.rows.delete("mark-8");
    }

    // M8. The Mark 8 worker stops before Netlify's hard limit and preserves a
    // truthful possible-spend record for an aborted in-flight model request.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      __setImageTestOverrides({
        configBypass: true,
        runDeadlineMs: 30,
        modelProbe: async (model) => ({ ok: true, model }),
      });
      __setImageDepsForTesting({
        db: { storage: db.storage } as never,
        generateBytes: async () => new Promise<Buffer>((resolve) => {
          setTimeout(() => resolve(Buffer.from("late-fake-png")), 200);
        }),
      });
      const { jobId } = await claimImageJob(store, "mark-8", MARK8_IMAGE_BINDING);
      const result = await generateAndStoreChapterImages("mark-8", jobId, MARK8_IMAGE_BINDING);
      const row = store.rows.get("mark-8")!;
      const deadlineCost = costs.find(
        (cost) => (cost.metadata as { deadlineExceeded?: boolean })?.deadlineExceeded === true,
      );
      ok(!result.ok && /safety deadline/u.test(result.error ?? ""), "M8 image run exits through the safe deadline path");
      ok(
        row.workup_json[IMAGE_JOB_STATE_KEY] === "failed" &&
          row.workup_json[IMAGE_JOB_SPENT_COUNT_KEY] === 1,
        "M8 possible in-flight spend becomes visible terminal state, never endless running",
      );
      ok(
        deadlineCost?.imageCount === 1 &&
          (deadlineCost.metadata as { generated?: number; billingUncertain?: boolean }).generated === 0 &&
          (deadlineCost.metadata as { billingUncertain?: boolean }).billingUncertain === true,
        "M8 possible billing is recorded without calling an unfinished image complete",
      );
      __setImageTestOverrides({
        configBypass: true,
        modelProbe: async (model) => ({ ok: true, model }),
      });
      __setImageDepsForTesting({
        db: { storage: db.storage } as never,
        generateBytes: async () => Buffer.from("fake-png"),
      });
      store.rows.delete("mark-8");
    }

    // N. Final publishing is bound to the exact, owner-reviewed Mark 8 workup.
    // The same row revision that passes this check must win the conditional
    // publish write; browser claims, stale reviews, and foreign image origins
    // can never make placeholder or changed content immutable.
    {
      const savedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://offline-selah.supabase.co";
      try {
        const finalWorkup = completedMark8Workup();
        const digest = mark8FinalReviewDigest(finalWorkup);
        ok(digest !== null, "N1 complete synthetic Mark 8 workup has a final review digest");
        ok(
          validateMark8PublishCandidate(
            finalWorkup,
            digest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 exact final review + trusted storage passes the pure publish gate",
        );
        const warnedFinalWorkup = {
          ...finalWorkup,
          sourceOverlapReview: SOURCE_OVERLAP_WARNING,
        } as ChapterWorkup;
        const warnedFinalDigest = mark8FinalReviewDigest(warnedFinalWorkup);
        ok(
          !validateMark8PublishCandidate(
            warnedFinalWorkup,
            warnedFinalDigest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 copy-warning draft cannot publish before exact owner review",
        );
        ok(
          validateMark8PublishCandidate(
            warnedFinalWorkup,
            warnedFinalDigest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            SOURCE_OVERLAP_REPORT_DIGEST,
          ).ok,
          "N1 exact copy-warning review and final review unlock publishing",
        );
        ok(
          !validateMark8PublishCandidate(
            warnedFinalWorkup,
            warnedFinalDigest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            "e".repeat(64),
          ).ok,
          "N1 stale copy-warning review cannot publish",
        );
        ok(
          !validateMark8PublishCandidate(
            {
              ...finalWorkup,
              sourceOverlapReview: { version: 1 },
            } as ChapterWorkup,
            digest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            SOURCE_OVERLAP_REPORT_DIGEST,
          ).ok,
          "N1 malformed copy-warning metadata fails closed",
        );
        ok(
          !validateMark8PublishCandidate(
            finalWorkup,
            undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 missing owner review digest is refused",
        );
        ok(
          !validateMark8PublishCandidate(
            { ...finalWorkup, title: "Changed after owner review" },
            digest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 changed final copy invalidates the owner review",
        );
        ok(
          !validateMark8PublishCandidate(
            completedMark8Workup(
              "55555555-5555-4555-8555-555555555555",
              "https://foreign-storage.example",
            ),
            mark8FinalReviewDigest(
              completedMark8Workup(
                "55555555-5555-4555-8555-555555555555",
                "https://foreign-storage.example",
              ),
            ) ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 foreign storage origin is refused even when its digest matches",
        );
        const wrongBucket = completedMark8Workup();
        wrongBucket.images = wrongBucket.images.map((image) => ({
          ...image,
          src: image.src.replace(
            "/storage/v1/object/public/chapter-images/mark-8/",
            "/storage/v1/object/public/unapproved-images/mark-8/",
          ),
        }));
        ok(
          !validateMark8PublishCandidate(
            wrongBucket,
            mark8FinalReviewDigest(wrongBucket) ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 same-origin images outside the approved chapter path are refused",
        );
        const mixedRuns = completedMark8Workup();
        mixedRuns.images[1] = {
          ...mixedRuns.images[1],
          src: mixedRuns.images[1].src.replace(
            "44444444-4444-4444-8444-444444444444",
            "55555555-5555-4555-8555-555555555555",
          ),
        };
        ok(
          !validateMark8PublishCandidate(
            mixedRuns,
            digest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 images mixed from different immutable runs are refused",
        );
        ok(
          !validateMark8PublishCandidate(
            {
              ...finalWorkup,
              [IMAGE_JOB_KEY]: "active-job",
              [IMAGE_JOB_STATE_KEY]: "running",
            } as ChapterWorkup,
            digest ?? undefined,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          ).ok,
          "N1 active image metadata blocks publish",
        );

        store.seed(
          "mark-8",
          "draft",
          structuredClone(finalWorkup) as unknown as Record<string, unknown>,
        );
        const missing = await adminPost(adminReq({
          action: "publish",
          slug: "mark-8",
        }));
        ok(missing.status === 403, "N2 real admin route refuses Mark 8 without final owner review");
        ok(store.rows.get("mark-8")!.status === "draft", "N2 refused publish leaves Mark 8 private");

        __setGenerationTestOverrides({
          settings: TEST_SETTINGS,
          captureAudit: audit,
          auditFailure: true,
        });
        const exact = await adminPost(adminReq({
          action: "publish",
          slug: "mark-8",
          reviewDigest: digest,
        }));
        __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
        ok(exact.status === 200, "N2 real admin route accepts exact owner-reviewed Mark 8 even if the later audit is unavailable");
        ok(store.rows.get("mark-8")!.status === "reviewed", "N2 exact publish promotes Mark 8 once");

        store.seed(
          "mark-8",
          "draft",
          structuredClone(finalWorkup) as unknown as Record<string, unknown>,
        );
        const originalUpdate = store.update.bind(store);
        let changedBeforePublish = true;
        store.update = async (slug, predicates, next) => {
          if (slug === "mark-8" && changedBeforePublish && next.status === "reviewed") {
            changedBeforePublish = false;
            store.rows.get(slug)!.updated_at = store.now();
          }
          return originalUpdate(slug, predicates, next);
        };
        const stale = await adminPost(adminReq({
          action: "publish",
          slug: "mark-8",
          reviewDigest: digest,
        }));
        store.update = originalUpdate;
        ok(stale.status === 409, "N2 row change between review validation and write is a conflict");
        ok(store.rows.get("mark-8")!.status === "draft", "N2 stale review can never publish");
        store.rows.delete("mark-8");

        store.seed("exodus-27", "draft", { slug: "exodus-27", title: "Exodus 27" });
        const legacy = await adminPost(adminReq({
          action: "publish",
          slug: "exodus-27",
        }));
        ok(legacy.status === 200, "N3 real admin route preserves non-Mark draft publishing");
        ok(store.rows.get("exodus-27")!.status === "reviewed", "N3 non-Mark draft publish behavior is preserved");
        store.rows.delete("exodus-27");
      } finally {
        if (savedSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        else process.env.NEXT_PUBLIC_SUPABASE_URL = savedSupabaseUrl;
        store.rows.delete("mark-8");
      }
    }
  } finally {
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setCostWriteFailureForTesting(null);
    __setImageTestOverrides(null);
    __setImageDepsForTesting(null);
    __setTriggerTransportForTesting(null);
  }
};

integration()
  .then(realRouteAndWorkers)
  .then(realImagePipeline)
  .then(() => {
    console.log(`verify:studio-safety ✓ ${checks} checks passed (decision core + write semantics + signed single-use jobs + REAL route/worker integration)`);
  })
  .catch((e) => {
    console.error("verify:studio-safety FAILED:", e);
    process.exit(1);
  });
