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

console.log(`verify:studio-safety ✓ ${checks} checks passed (pure decision core + conditional-write semantics)`);
