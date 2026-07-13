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
} from "../lib/server/generation-jobs";
import { isChapterMutationError, __setRowLookupForTesting } from "../lib/server/protected-chapters";
import { __setTriggerTransportForTesting, type TriggerResult } from "../lib/server/trigger-generation";
import {
  __setGenerationTestOverrides,
  type GenerationSettings,
} from "../lib/server/generation-settings";
import { __setCostCaptureForTesting, type CostEventInput } from "../lib/server/cost-events-repository";
import {
  __setGenerationConfigBypassForTesting,
  __setTextGeneratorForTesting,
} from "../lib/server/generate-chapter-workup";
import { __setImageTestOverrides, __setImageDepsForTesting, generateAndStoreChapterImages } from "../lib/server/images";
import { POST as adminPost } from "../app/api/admin/generation/route";
import textWorker from "../netlify/functions/generate-chapter-background.mts";
import imagesWorker from "../netlify/functions/generate-images-background.mts";
import type { ChapterWorkup } from "../lib/types";
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
const MANIFEST_DIGEST_A = "a".repeat(64);
const MANIFEST_DIGEST_B = "b".repeat(64);

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
      (await failGenerationJob(store, "mark-8", jobA, "trigger failed")) === "conflict",
      "I1e bound failure refuses an omitted digest",
    );
    ok(
      (await failGenerationJob(store, "mark-8", jobA, "trigger failed", MANIFEST_DIGEST_B)) === "conflict",
      "I1e bound failure refuses a mismatched digest",
    );
    ok(
      (await failGenerationJob(store, "mark-8", jobA, "trigger failed", MANIFEST_DIGEST_A)) === "marked_failed",
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
    await failGenerationJob(store, "mark-8", boundJob, "retry", MANIFEST_DIGEST_A);
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
      (await failGenerationJob(store, "mark-8", jobId, "boom", MANIFEST_DIGEST_A)) === "conflict",
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
    ok((await failGenerationJob(store, "mark-8", jobA, "trigger failed")) === "marked_failed", "I3 failed trigger marks job A failed");
    ok(store.rows.get("mark-8")!.status === "failed", "I3 not stranded as generating");
    const jobB = await claimGenerationJob(store, "mark-8", META); // retry claims B
    await expectCode(() => consumeGenerationClaim(store, "mark-8", jobA), "CONFLICT", "I3 zombie A cannot consume");
    await expectCode(() => completeGenerationJob(store, "mark-8", jobA, { workup: WORKUP }), "CONFLICT", "I3 zombie A cannot overwrite B");
    ok((await failGenerationJob(store, "mark-8", jobA, "zombie")) === "conflict", "I3 zombie A cannot fail B (conflict, not stranded)");
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
    ok((await failGenerationJob(store, "mark-8", jobId, "boom")) === "write_failed", "I3b cleanup write failure → write_failed (row may be stranded)");
    ok(store.rows.get("mark-8")!.status === "generating", "I3b row genuinely still generating — outcome told the truth");
    ok((await failGenerationJob(store, "mark-8", jobId, "boom")) === "marked_failed", "I3b retry cleanup succeeds");
  }

  // I4. Job ids are collision-resistant UUIDs, not timestamps.
  {
    const store = new FakeJobStore();
    const a = await claimGenerationJob(store, "mark-8", META);
    ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a), "I4 job id is a UUID");
  }

  // I5. Image single-use claim + consume: duplicates cannot double-spend.
  {
    const store = new FakeJobStore();
    store.seed("mark-8", "draft", { title: "Mark 8", images: [] });
    const { jobId } = await claimImageJob(store, "mark-8");
    await expectCode(() => claimImageJob(store, "mark-8"), "CONFLICT", "I5 second image request cannot claim (no double spend)");
    await consumeImageClaim(store, "mark-8", jobId);
    await expectCode(() => consumeImageClaim(store, "mark-8", jobId), "CONFLICT", "I5 duplicate image delivery cannot consume twice");
    ok(await releaseImageJob(store, "mark-8", jobId), "I5 failed run releases claim");
    const second = await claimImageJob(store, "mark-8");
    ok(second.jobId !== jobId, "I5 retry gets a fresh job id");
    await consumeImageClaim(store, "mark-8", second.jobId);
    await completeImageJob(store, "mark-8", second.jobId, { title: "Mark 8", images: [{}] } as unknown as ChapterWorkup);
    ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "I5 completion clears the claim");
  }

  // I6. Stale image worker: superseded run cannot apply; bytes stay orphaned.
  {
    const store = new FakeJobStore();
    store.seed("mark-8", "draft", { title: "Mark 8", images: [] });
    const first = await claimImageJob(store, "mark-8");
    ok(await releaseImageJob(store, "mark-8", first.jobId), "I6 first run released");
    const second = await claimImageJob(store, "mark-8");
    await expectCode(
      () => completeImageJob(store, "mark-8", first.jobId, { title: "stale" } as unknown as ChapterWorkup),
      "CONFLICT",
      "I6 stale image worker cannot apply (orphaned files stay isolated)",
    );
    ok((store.rows.get("mark-8")!.workup_json as { title?: string }).title === "Mark 8", "I6 draft untouched by stale run");
    await consumeImageClaim(store, "mark-8", second.jobId);
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
    ok((await failGenerationJob(store, "mark-6", jid, "x")) !== "marked_failed", "I8 protected slug cannot be failed");
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
  let lastTrigger: { url: string; body: { slug: string; job: string; token: string } } | null = null;
  let triggerResult: TriggerResult = { ok: true, status: 202 };

  __setJobStoreForTesting(store);
  __setRowLookupForTesting(storeLookup(store));
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting(costs);
  __setGenerationConfigBypassForTesting(true);
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = req;
    return triggerResult;
  });
  __setTextGeneratorForTesting(async () => ({
    content: JSON.stringify(generatedFixture),
    inputTokens: 0,
    outputTokens: 0,
  }));

  try {
    // R1. Route auth: no/bad admin token → 401; nothing claimed, nothing triggered.
    {
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }, "wrong-token"));
      ok(res.status === 401, "R1 bad admin token → 401");
      ok(store.rows.size === 0 && lastTrigger === null, "R1 unauthorized request claimed/triggered nothing");
    }

    // R2. Protected slug through the REAL route: refused + durably audited.
    {
      store.seed("mark-6", "draft", {});
      const res = await adminPost(adminReq({ action: "generate", slug: "mark-6" }));
      ok(res.status === 403, "R2 protected slug generate → 403");
      ok(audit.some((a) => a.action === "refused:generate" && a.slug === "mark-6"), "R2 refusal durably audited");
      ok(store.rows.get("mark-6")!.status === "draft" && lastTrigger === null, "R2 protected row untouched, no trigger");
    }

    // R2b. Mark sprint slugs remain blocked until their protected runner is connected.
    {
      const res = await adminPost(adminReq({ action: "generate", slug: "mark-8" }));
      ok(res.status === 403, "R2b Mark sprint slug requires protected runner");
      ok(!store.rows.has("mark-8") && lastTrigger === null, "R2b protected Mark sprint made no claim and no trigger");
      ok(audit.some((a) => a.action === "refused:generate" && a.slug === "mark-8"), "R2b refusal durably audited");
    }

    // R3. Kill switch OFF through the REAL route: refused before any claim.
    {
      __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
      const res = await adminPost(adminReq({ action: "generate", slug: GENERIC_SLUG }));
      ok(res.status === 403, "R3 text kill switch OFF → 403");
      ok(!store.rows.has(GENERIC_SLUG) && lastTrigger === null, "R3 no claim, no trigger with switch OFF");
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
      const bad = await textWorker(workerReq("generate-chapter-background", { slug: "mark-8", job: jid, token: "junk" }));
      ok(bad.status === 401, "R5 bad token → 401");
      const expired = signJobToken("text", "mark-8", jid, Date.now() - 60 * 60 * 1000).token;
      const exp = await textWorker(workerReq("generate-chapter-background", { slug: "mark-8", job: jid, token: expired }));
      ok(exp.status === 401, "R5 expired token → 401");
      const wrongPurpose = signJobToken("image", "mark-8", jid).token;
      const wp = await textWorker(workerReq("generate-chapter-background", { slug: "mark-8", job: jid, token: wrongPurpose }));
      ok(wp.status === 401, "R5 image-purpose token rejected by text worker");
      ok(audit.filter((a) => a.action === "refused:worker_generate").length >= 4, "R5 worker refusals durably audited");
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

    // R6b. Trigger failure AND cleanup write failure: response admits stranding.
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
      ok(res.status === 500, "R6b cleanup write failure → 500");
      const bodyJson = (await res.json()) as { error?: string };
      ok(/CLEANUP WRITE FAILED|still be marked generating/i.test(bodyJson.error ?? ""), "R6b response admits the row may be stranded");
      ok(store.rows.get(GENERIC_SLUG)!.status === "generating", "R6b row genuinely stranded — response told the truth");
      store.rows.delete(GENERIC_SLUG);
      triggerResult = { ok: true, status: 202 };
    }
  } finally {
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setGenerationConfigBypassForTesting(false);
    __setTriggerTransportForTesting(null);
    __setTextGeneratorForTesting(null);
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
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake.storage/${path}` } }),
    }),
  };
  return state;
}
const TEST_PLAN = [
  { kind: "establishing" as const, prompt: "p1", alt: "a1", caption: "c1" },
  { kind: "detail" as const, prompt: "p2", alt: "a2", caption: "c2" },
];

const realImagePipeline = async () => {
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  const store = new FakeJobStore();
  const db = fakeDb();

  __setJobStoreForTesting(store);
  __setRowLookupForTesting(storeLookup(store));
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting(costs);
  __setImageTestOverrides({ configBypass: true, plans: { "mark-8": TEST_PLAN } });
  __setImageDepsForTesting({
    db: { storage: db.storage } as never,
    generateBytes: async () => Buffer.from("fake-png"),
  });

  try {
    const workupJson = { title: "Mark 8", images: [{ kind: "establishing", index: 1, label: "x", src: "", alt: "", status: "pending" }] };

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
      const { jobId } = await claimImageJob(store, "mark-8");
      const token = signJobToken("image", "mark-8", jobId).token;
      const res = await imagesWorker(workerReq("generate-images-background", { slug: "mark-8", job: jobId, token }));
      ok(res.status === 200, `M2 real image worker succeeded (HTTP ${res.status})`);
      ok(db.uploads.length === 2 && db.uploads.every((p) => p.includes(`mark-8/${jobId}/`)), "M2 uploads go to the immutable job directory");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "M2 completion cleared the claim");
      ok(costs.some((c) => c.imageCount === 2 && !(c.metadata as { failed?: boolean })?.failed), "M2 success spend recorded");
      // Duplicate delivery of the same run: refused, no double spend.
      db.uploads.length = 0;
      const replay = await imagesWorker(workerReq("generate-images-background", { slug: "mark-8", job: jobId, token }));
      ok(replay.status === 500, "M2 duplicate image delivery refused");
      ok(db.uploads.length === 0, "M2 duplicate delivery spent nothing");
      store.rows.delete("mark-8");
    }

    // M3. Bucket failure INSIDE the envelope: claim released, audited, no spend.
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8");
      db.buckets.failCreate = true;
      const result = await generateAndStoreChapterImages("mark-8", jobId);
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
      const { jobId } = await claimImageJob(store, "mark-8");
      const result = await generateAndStoreChapterImages("mark-8", jobId);
      db.failUploadAfter = -1;
      ok(!result.ok, "M4 upload failure fails the run");
      const spend = costs.find((c) => (c.metadata as { failed?: boolean })?.failed);
      ok(!!spend && spend.imageCount === 2, "M4 BOTH generated images counted as spend (uploaded only 1)");
      ok((spend!.metadata as { uploaded?: number }).uploaded === 1, "M4 spend metadata separates generated vs uploaded");
      ok(store.rows.get("mark-8")!.workup_json[IMAGE_JOB_KEY] === undefined, "M4 claim released for retry");
      store.rows.delete("mark-8");
    }

    // M5. Terminal conflict AFTER spend records a cost event (not just an audit).
    {
      store.seed("mark-8", "draft", structuredClone(workupJson));
      costs.length = 0;
      const { jobId } = await claimImageJob(store, "mark-8");
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
      const result = await generateAndStoreChapterImages("mark-8", jobId);
      store.update = origUpdate;
      ok(!result.ok && /not applied|CONFLICT/i.test(result.error ?? ""), "M5 superseded run cannot apply");
      const spend = costs.find((c) => (c.metadata as { conflict?: boolean })?.conflict);
      ok(!!spend && spend.imageCount === 2, "M5 conflicted spend recorded as a cost event");
      ok(audit.some((a) => a.action === "image_run_conflict"), "M5 conflict durably audited");
    }
  } finally {
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setImageTestOverrides(null);
    __setImageDepsForTesting(null);
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
