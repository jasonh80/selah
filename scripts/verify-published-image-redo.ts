// Offline safety gate for the PUBLISHED-chapter single-image redo lane
// (Codex APPROVE WITH CONDITIONS, board #29 2026-07-19). Runs in
// `npm run prebuild` — no network, no Supabase, no env secrets.
//
// It drives the REAL admin route and the REAL background worker against fake
// stores and proves every condition Codex named:
//   1. duplicate requests spend once            (D3, C5)
//   2. stale references refuse                  (C4, D4, E5)
//   3. exactly one source changes on apply      (E3)
//   4. no public 404 / invalid chapter can land (E6 — validation-refused apply)
//   5. Psalm 23 / Mark 6 remain protected       (B3, E7)
//   6. the live chapter row is untouched until the final conditional write
//      (D2, and every refusal path asserts byte-identical live state)
process.env.DEV_ADMIN_TOKEN = "verify-published-redo-offline-token";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://offline-selah.supabase.co";

import assert from "node:assert/strict";
import type { JobStorePort, JobRow, JobPredicates } from "../lib/server/generation-jobs";
import { __setJobStoreForTesting } from "../lib/server/generation-jobs";
import { decideMutation, __setRowLookupForTesting, type RowLookup } from "../lib/server/protected-chapters";
import { __setTriggerTransportForTesting } from "../lib/server/trigger-generation";
import {
  __setGenerationTestOverrides,
  type GenerationSettings,
} from "../lib/server/generation-settings";
import {
  __setCostCaptureForTesting,
  type CostEventInput,
} from "../lib/server/cost-events-repository";
import { __setImageTestOverrides, __setImageDepsForTesting } from "../lib/server/images";
import { MARK_8_IMAGE_MODEL } from "../lib/server/mark8-image-plan";
import { __setStoredSetupApprovalStoreForTesting } from "../lib/server/chapter-setup-approvals";
import { __setVersionSnapshotForTesting } from "../lib/server/chapter-versions-repository";
import {
  __setPublishedRedoStoreForTesting,
  type PublishedRedoStore,
  type PublishedRedoLookup,
  type PublishedRedoStatus,
} from "../lib/server/published-image-redo";
import { POST as adminPost } from "../app/api/admin/generation/route";
import publishedRedoWorker from "../netlify/functions/published-redo-image-background.mts";
import type { ChapterWorkup } from "../lib/types";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

const ADMIN = process.env.DEV_ADMIN_TOKEN!;
const SLUG = "mark-7";
const RUN_JOB_ID = "44444444-4444-4444-8444-444444444444";
const ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const NOTES = "Give the deaf man an unfocused gaze; keep everything else about the scene unchanged.";

const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: true,
  allowed_slugs: [SLUG, "psalm-23", "mark-6"],
  selected_text_model: "offline-test-model",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: false,
  updated_at: "T0",
};

// ---------------- fakes ----------------

class FakeJobStore implements JobStorePort {
  rows = new Map<string, { status: string; updated_at: string | null; workup_json: Record<string, unknown> }>();
  failNextRead = false; // simulates an unreadable live row on the next read
  private tick = 0;
  now(): string {
    return `T${++this.tick}`;
  }
  seed(slug: string, status: string, json: Record<string, unknown>): void {
    this.rows.set(slug, { status, updated_at: this.now(), workup_json: json });
  }
  async read(slug: string): Promise<JobRow | null | { error: string }> {
    if (this.failNextRead) {
      this.failNextRead = false;
      return { error: "simulated read failure" };
    }
    const r = this.rows.get(slug);
    return r ? { status: r.status, updatedAt: r.updated_at, workupJson: r.workup_json } : null;
  }
  async insert(): Promise<"ok" | "duplicate" | { error: string }> {
    return { error: "insert unused in this gate" };
  }
  async update(slug: string, p: JobPredicates, next: Record<string, unknown>): Promise<number | { error: string }> {
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
    // Mirror the real adapter: `next` is applied verbatim, so a written
    // updated_at IS the row's new revision (applied_revision binding).
    r.updated_at = "updated_at" in next ? String(next.updated_at) : this.now();
    return 1;
  }
}

function storeLookup(store: FakeJobStore) {
  return async (slug: string): Promise<RowLookup> => {
    const r = store.rows.get(slug);
    return r
      ? ({ kind: "row", row: { status: r.status, updatedAt: r.updated_at } } as const)
      : ({ kind: "missing" } as const);
  };
}

// Honors the same predicate + partial-unique-index semantics the real table has.
class FakeLaneStore implements PublishedRedoStore {
  rows = new Map<string, Record<string, unknown>>();
  failNextLatest = false; // simulates a storage outage on the next latest() read
  async latest(slug: string): Promise<PublishedRedoLookup> {
    if (this.failNextLatest) {
      this.failNextLatest = false;
      return { kind: "error", message: "simulated lane outage" };
    }
    const all = [...this.rows.values()].filter((r) => r.slug === slug);
    if (!all.length) return { kind: "missing" };
    return { kind: "row", row: all[all.length - 1] };
  }
  async byId(id: string): Promise<PublishedRedoLookup> {
    const r = this.rows.get(id);
    return r ? { kind: "row", row: r } : { kind: "missing" };
  }
  async insert(row: Record<string, unknown>): Promise<"ok" | "conflict" | { error: string }> {
    const active = [...this.rows.values()].some(
      (r) => r.slug === row.slug && ["queued", "running", "candidate", "blocked"].includes(String(r.status)),
    );
    if (active) return "conflict"; // partial unique index semantics
    this.rows.set(String(row.id), {
      candidate_url: null,
      error_code: null,
      spent_count: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      ...row,
    });
    return "ok";
  }
  async conditionalUpdate(
    id: string,
    expectedStatus: PublishedRedoStatus,
    next: Record<string, unknown>,
    extraEquals?: Record<string, string>,
  ): Promise<number | { error: string }> {
    const r = this.rows.get(id);
    if (!r || r.status !== expectedStatus) return 0;
    for (const [column, value] of Object.entries(extraEquals ?? {})) {
      if (r[column] !== value) return 0;
    }
    Object.assign(r, next);
    return 1;
  }
}

function fakeDb() {
  const uploads: string[] = [];
  return {
    uploads,
    storage: {
      createBucket: async () => ({ error: null }),
      from: () => ({
        upload: async (path: string) => {
          if (uploads.includes(path)) return { error: { message: `duplicate upload refused: ${path}` } };
          uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `${ORIGIN}/storage/v1/object/public/chapter-images/${path}` },
        }),
      }),
    },
  };
}

function publishedWorkup(slug = SLUG): ChapterWorkup {
  const images = [
    { kind: "washing-dispute", index: 1, label: "The Washing Dispute", prompt: "Pharisees questioning Jesus about unwashed hands.", caption: "Tradition meets the heart.", alt: "A dispute over ritual washing.", status: "complete" },
    { kind: "syrophoenician-mother", index: 2, label: "A Mother's Plea", prompt: "A Gentile mother pleading for her daughter near Tyre.", caption: "Mercy beyond borders.", alt: "A mother pleading with Jesus.", status: "complete" },
    { kind: "ephphatha", index: 3, label: "Ephphatha", prompt: "Jesus taking a deaf man aside in the Decapolis.", caption: "Be opened.", alt: "Jesus with the deaf man, apart from the crowd.", status: "complete" },
  ].map((image) => ({
    ...image,
    src: `${ORIGIN}/storage/v1/object/public/chapter-images/${slug}/${RUN_JOB_ID}/${image.kind}.png`,
  }));
  return {
    slug,
    title: "Mark 7",
    book: "Mark",
    chapter: 7,
    heroKind: "washing-dispute",
    images,
  } as unknown as ChapterWorkup;
}

function adminReq(body: Record<string, unknown>, token = ADMIN): Request {
  return new Request("http://localhost/api/admin/generation", {
    method: "POST",
    headers: { "x-admin-token": token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function workerReq(body: Record<string, unknown>, method = "POST"): Request {
  return new Request("http://localhost/.netlify/functions/published-redo-image-background", {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const snapshotOf = (store: FakeJobStore, slug: string): string =>
  JSON.stringify(store.rows.get(slug) ?? null);

const main = async () => {
  // ---------------- Harness ----------------
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  const store = new FakeJobStore();
  const lane = new FakeLaneStore();
  const db = fakeDb();
  let generateCalls = 0;
  let lastTrigger: { url: string; body: Record<string, unknown> } | null = null;
  let triggerOk = true;
  let snapshotCalls = 0;
  let snapshotResult: number | null = 7;

  __setJobStoreForTesting(store);
  __setRowLookupForTesting(storeLookup(store));
  __setPublishedRedoStoreForTesting(lane);
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setStoredSetupApprovalStoreForTesting({
    async read() { return null; },
    async upsert(): Promise<void> { throw new Error("offline approval store is read-only"); },
  });
  __setCostCaptureForTesting(costs);
  __setImageTestOverrides({ configBypass: true, modelProbe: async (model) => ({ ok: true, model }) });
  let generateGate: Promise<void> | null = null;
  __setImageDepsForTesting({
    db: db as never,
    generateBytes: async () => {
      generateCalls++;
      if (generateGate) await generateGate;
      return Buffer.from("fake-png-bytes");
    },
  });
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = req as never;
    return triggerOk ? { ok: true, status: 202 } : { ok: false, status: 502, error: "trigger down" };
  });
  __setVersionSnapshotForTesting(async () => {
    snapshotCalls++;
    return snapshotResult;
  });

  try {
    // ---------------- A. Guard shape (dedicated action only) ----------------
    {
      const reviewed: RowLookup = { kind: "row", row: { status: "reviewed", updatedAt: "T1" } };
      ok(decideMutation("applyPublishedImageRedo", SLUG, reviewed).allowed, "A1 dedicated action acts on reviewed");
      ok(!decideMutation("updateChapterWorkupJson", SLUG, reviewed).allowed, "A1 generic draft action still refuses reviewed");
      ok(!decideMutation("publishChapter", SLUG, reviewed).allowed, "A1 publish still refuses reviewed");
    }

    // ---------------- B. FREE preflight through the REAL route ----------------
    store.seed(SLUG, "reviewed", publishedWorkup() as unknown as Record<string, unknown>);
    let bindingDigest = "";
    {
      const res = await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES }));
      const body = await json(res);
      const redo = body.redo as Record<string, unknown>;
      ok(res.status === 200 && body.ok === true, "B1 preflight succeeds on a live reviewed chapter");
      ok(redo.model === MARK_8_IMAGE_MODEL && redo.size === "1536x1024", "B1 preflight names the exact model and landscape size");
      ok(typeof redo.estimatedCostUsd === "number" && (redo.estimatedCostUsd as number) > 0, "B1 exact max price shown before any spend");
      ok(typeof redo.baseRevision === "string" && (redo.baseRevision as string).length > 0, "B1 binding pinned to the live revision");
      bindingDigest = String(redo.bindingDigest);
      ok(/^[a-f0-9]{64}$/u.test(bindingDigest), "B1 binding digest shape");
    }
    {
      // Protected chapters refuse the whole lane, on every step.
      for (const slug of ["psalm-23", "mark-6"]) {
        store.seed(slug, "reviewed", publishedWorkup(slug) as unknown as Record<string, unknown>);
        const res = await adminPost(adminReq({ action: "published_redo_preflight", slug, kind: "ephphatha", notes: NOTES }));
        ok(res.status === 403, `B3 ${slug} preflight refused (protected)`);
      }
      // A draft chapter refuses the published lane (it has the draft lane).
      store.seed("mark-9", "draft", publishedWorkup("mark-9") as unknown as Record<string, unknown>);
      const res = await adminPost(adminReq({ action: "published_redo_preflight", slug: "mark-9", kind: "ephphatha", notes: NOTES }));
      ok(res.status === 403, "B4 draft chapter refuses the published lane");
    }

    // ---------------- C. Paid claim through the REAL route ----------------
    let jobId = "";
    {
      const noConfirm = await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest }));
      ok(noConfirm.status === 400, "C1 create without confirm refuses");
      const badDigest = await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: "a".repeat(64), confirm: true }));
      ok(badDigest.status === 409, "C2 stale/foreign binding digest refuses before any claim");
      const before = snapshotOf(store, SLUG);
      const res = await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest, confirm: true }));
      const body = await json(res);
      ok(res.status === 200 && body.ok === true && body.triggered === true, "C3 confirmed create claims and triggers");
      jobId = String(body.jobId);
      ok(lane.rows.get(jobId)?.status === "queued", "C3 lane row queued");
      ok(snapshotOf(store, SLUG) === before, "C3 the LIVE chapter row is byte-identical after claim (candidate never touches it)");
      ok(String((lastTrigger!.url as unknown as string)).includes("published-redo-image-background"), "C3 dedicated worker triggered");
      const dup = await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest, confirm: true }));
      ok(dup.status === 409, "C5 second create while one is live refuses (single-use claim)");
    }
    {
      // Failed trigger closes the claim with provably zero spend.
      lane.rows.delete(jobId); // clear the active claim for this sub-case
      triggerOk = false;
      const res = await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest, confirm: true }));
      const body = await json(res);
      ok(res.status === 502 && /trigger failed/.test(String(body.error)), "C6 failed trigger reported truthfully");
      const failedRow = [...lane.rows.values()].find((r) => r.status === "failed" && r.error_code === "trigger_failed");
      ok(Boolean(failedRow) && failedRow!.spent_count === 0, "C6 claim closed, zero spend recorded");
      ok(costs.length === 0, "C6 no cost event exists yet");
      triggerOk = true;
      for (const [id, r] of [...lane.rows]) if (r.status === "failed") lane.rows.delete(id);
      const again = await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest, confirm: true }));
      jobId = String((await json(again)).jobId);
      ok(again.status === 200 && lane.rows.get(jobId)?.status === "queued", "C7 fresh confirmed claim after the failure");
    }

    // ---------------- D. REAL worker: spend once, live row untouched ----------------
    let candidateUrl = "";
    {
      const trigBody = lastTrigger!.body as Record<string, unknown>;
      const liveBefore = snapshotOf(store, SLUG);
      const res = await publishedRedoWorker(workerReq(trigBody));
      const body = await json(res);
      ok(res.status === 200 && body.ok === true, "D1 worker generates the candidate");
      ok(generateCalls === 1 && costs.length === 1, "D1 exactly one model request, exactly one cost row");
      const row = lane.rows.get(jobId)!;
      candidateUrl = String(row.candidate_url);
      ok(row.status === "candidate" && candidateUrl.includes(`${SLUG}/${jobId}/ephphatha.png`), "D1 candidate stored in the job's own immutable directory");
      ok(snapshotOf(store, SLUG) === liveBefore, "D2 the LIVE chapter row is byte-identical after the candidate exists");
      ok((costs[0].metadata as Record<string, unknown>).published === true, "D1 spend row is marked as the published lane");
      const dup = await publishedRedoWorker(workerReq(trigBody));
      ok(dup.status === 500, "D3 duplicated delivery refuses");
      ok(generateCalls === 1 && costs.length === 1, "D3 duplicate delivery spent NOTHING (spend once)");
      ok(auth401(await publishedRedoWorker(workerReq({ ...trigBody, token: "forged" }))), "D5 forged token refused");
    }
    {
      // Stale claim: live row changed after confirm → worker dies pre-spend.
      const res0 = await adminPost(adminReq({ action: "published_redo_reject", slug: SLUG })); // clear current candidate
      ok(res0.status === 200, "D4 setup: candidate rejected (lane-only write)");
      const pf = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digest2 = String((pf.redo as Record<string, unknown>).bindingDigest);
      const created = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digest2, confirm: true })));
      const staleJob = String(created.jobId);
      // The live row moves AFTER the claim (bump revision only).
      const r = store.rows.get(SLUG)!;
      r.updated_at = store.now();
      const trigBody = lastTrigger!.body as Record<string, unknown>;
      const res = await publishedRedoWorker(workerReq(trigBody));
      ok(res.status === 500, "D4 stale claim refused by the worker");
      ok(generateCalls === 1 && costs.length === 1, "D4 stale claim spent NOTHING");
      ok(lane.rows.get(staleJob)?.status === "failed" && lane.rows.get(staleJob)?.error_code === "stale_binding", "D4 stale claim terminally closed");
    }

    // ---------------- E. Apply: second confirmation, one src, revalidated ----------------
    {
      // Recreate a clean candidate against the CURRENT live revision.
      const pf = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digest3 = String((pf.redo as Record<string, unknown>).bindingDigest);
      const created = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digest3, confirm: true })));
      jobId = String(created.jobId);
      await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      candidateUrl = String(lane.rows.get(jobId)!.candidate_url);
      ok(generateCalls === 2 && costs.length === 2, "E0 fresh candidate spent exactly once");

      const noConfirm = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId, kind: "ephphatha", candidateUrl }));
      ok(noConfirm.status === 400, "E1 apply without the SECOND confirmation refuses");
      const wrongUrl = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId, kind: "ephphatha", candidateUrl: `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/${RUN_JOB_ID}/ephphatha.png`, confirm: true }));
      ok(wrongUrl.status === 409, "E2 apply bound to the EXACT candidate URL reviewed");

      const beforeJson = store.rows.get(SLUG)!.workup_json as Record<string, unknown>;
      const beforeImages = JSON.parse(JSON.stringify(beforeJson.images)) as Record<string, unknown>[];
      const snapshotsBefore = snapshotCalls;
      const res = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId, kind: "ephphatha", candidateUrl, confirm: true }));
      const body = await json(res);
      ok(res.status === 200 && body.ok === true && body.alreadyApplied === false, "E3 second confirmation applies");
      ok(snapshotCalls === snapshotsBefore + 1, "E3 rollback snapshot saved before the write");
      const afterRow = store.rows.get(SLUG)!;
      const afterImages = (afterRow.workup_json as Record<string, unknown>).images as Record<string, unknown>[];
      ok(afterRow.status === "reviewed", "E3 the row stays published");
      ok(afterImages.find((i) => i.kind === "ephphatha")!.src === candidateUrl, "E3 the target src is the candidate");
      const untouched = afterImages.filter((i) => i.kind !== "ephphatha");
      ok(
        JSON.stringify(untouched) === JSON.stringify(beforeImages.filter((i) => i.kind !== "ephphatha")),
        "E3 every OTHER image is byte-identical (exactly one source changed)",
      );
      const target = afterImages.find((i) => i.kind === "ephphatha")!;
      const beforeTarget = beforeImages.find((i) => i.kind === "ephphatha")!;
      ok(
        JSON.stringify({ ...target, src: null }) === JSON.stringify({ ...beforeTarget, src: null }),
        "E3 the target's label/prompt/caption/alt/status are unchanged — only src moved",
      );
      ok(!("imageRedoJobId" in (afterRow.workup_json as Record<string, unknown>)), "E3 no transient keys leak into the live row");
      ok(lane.rows.get(jobId)?.status === "applied", "E3 lane row settled as applied");

      const dupApply = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId, kind: "ephphatha", candidateUrl, confirm: true }));
      const dupBody = await json(dupApply);
      ok(dupApply.status === 409 || dupBody.alreadyApplied === true, "E4 duplicate apply settles idempotently or refuses — never a second write");
    }
    {
      // E5/E6: a candidate whose live base has since changed refuses, and a
      // validation-failing next workup refuses — live row untouched both times.
      const pf = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "washing-dispute", notes: NOTES })));
      const digest4 = String((pf.redo as Record<string, unknown>).bindingDigest);
      const created = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "washing-dispute", notes: NOTES, bindingDigest: digest4, confirm: true })));
      const job2 = String(created.jobId);
      await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      const cand2 = String(lane.rows.get(job2)!.candidate_url);
      // Foreign change lands on the live target AFTER the candidate exists:
      const live = store.rows.get(SLUG)!;
      const mutated = JSON.parse(JSON.stringify(live.workup_json)) as Record<string, unknown>;
      (mutated.images as Record<string, unknown>[]).find((i) => i.kind === "washing-dispute")!.src =
        `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/55555555-5555-4555-8555-555555555555/washing-dispute.png`;
      live.workup_json = mutated;
      live.updated_at = store.now();
      const beforeState = snapshotOf(store, SLUG);
      const res = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId: job2, kind: "washing-dispute", candidateUrl: cand2, confirm: true }));
      ok(res.status === 409, "E5 apply refuses when the live image is no longer the candidate's base");
      ok(snapshotOf(store, SLUG) === beforeState, "E5 the live row is untouched by the refused apply");
      // Validation failure: break the live workup (2 images = invalid plan)
      // WITHOUT moving updated_at — the revision must still equal the
      // candidate's base_revision so ONLY validation can be the refuser.
      const baseRevision = String((lane.rows.get(job2) as Record<string, unknown>).base_revision);
      const broken = JSON.parse(JSON.stringify(live.workup_json)) as Record<string, unknown>;
      (broken.images as unknown[]).pop();
      (broken.images as Record<string, unknown>[]).find((i) => i.kind === "washing-dispute")!.src =
        (lane.rows.get(job2) as Record<string, unknown>).base_src as string;
      live.workup_json = broken;
      live.updated_at = baseRevision;
      const beforeBroken = snapshotOf(store, SLUG);
      const res2 = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId: job2, kind: "washing-dispute", candidateUrl: cand2, confirm: true }));
      const body2 = await json(res2);
      ok(res2.status === 403 && /validation|final review/.test(String(body2.error)), "E6 a next-workup that fails full public validation refuses");
      ok(snapshotOf(store, SLUG) === beforeBroken, "E6 the live row is untouched (no public 404 can land)");
      // restore a valid live chapter for the remaining checks
      store.seed(SLUG, "reviewed", publishedWorkup() as unknown as Record<string, unknown>);
      lane.rows.get(job2)!.status = "rejected";
    }
    {
      const res = await adminPost(adminReq({ action: "published_redo_apply", slug: "psalm-23", jobId: RUN_JOB_ID, kind: "x", candidateUrl: `${ORIGIN}/x.png`, confirm: true }));
      ok(res.status === 403, "E7 protected chapter apply refused");
    }

    // ---------------- F. Rollback: owner-confirmed, revision-bound, revalidated ----------------
    {
      const pf = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digest5 = String((pf.redo as Record<string, unknown>).bindingDigest);
      const created = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digest5, confirm: true })));
      const job3 = String(created.jobId);
      await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      const cand3 = String(lane.rows.get(job3)!.candidate_url);
      const baseSrc = String(lane.rows.get(job3)!.base_src);
      const applied = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId: job3, kind: "ephphatha", candidateUrl: cand3, confirm: true }));
      ok(applied.status === 200, "F0 applied for the rollback case");
      const noConfirm = await adminPost(adminReq({ action: "published_redo_rollback", slug: SLUG, jobId: job3 }));
      ok(noConfirm.status === 400, "F1 rollback without confirm refuses");
      const snapshotsBefore = snapshotCalls;
      const res = await adminPost(adminReq({ action: "published_redo_rollback", slug: SLUG, jobId: job3, confirm: true }));
      ok(res.status === 200, "F2 confirmed rollback succeeds");
      ok(snapshotCalls === snapshotsBefore + 1, "F2 rollback snapshots first");
      const images = (store.rows.get(SLUG)!.workup_json as Record<string, unknown>).images as Record<string, unknown>[];
      ok(images.find((i) => i.kind === "ephphatha")!.src === baseSrc, "F2 the pre-redo source is restored exactly");
      ok(lane.rows.get(job3)?.status === "rolled_back", "F2 lane row settled as rolled_back");
    }

    // ---------------- H. Adversarial-review repairs (2026-07-19) ----------------
    {
      // H1. Duplicate delivery DURING the winner's generation window must not
      // touch the winner's running claim (the mid-spend clobber finding).
      const pf = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digestH = String((pf.redo as Record<string, unknown>).bindingDigest);
      const created = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digestH, confirm: true })));
      const jobH = String(created.jobId);
      const trigBody = lastTrigger!.body as Record<string, unknown>;
      const generateBefore = generateCalls;
      const costsBefore = costs.length;
      let releaseGate!: () => void;
      generateGate = new Promise<void>((resolve) => (releaseGate = resolve));
      const winner = publishedRedoWorker(workerReq(trigBody));
      while (generateCalls === generateBefore) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      ok(lane.rows.get(jobH)?.status === "running", "H1 winner consumed the claim and is mid-generation");
      const loser = await publishedRedoWorker(workerReq(trigBody));
      ok(loser.status === 500, "H1 duplicate delivery refuses");
      ok(lane.rows.get(jobH)?.status === "running", "H1 the winner's RUNNING claim is untouched by the duplicate");
      ok(costs.length === costsBefore, "H1 the duplicate spent nothing");
      releaseGate();
      generateGate = null;
      const winnerRes = await winner;
      ok(winnerRes.status === 200, "H1 the winner completes normally after the duplicate");
      const rowH = lane.rows.get(jobH)!;
      ok(rowH.status === "candidate" && rowH.spent_count === 1, "H1 winner's candidate recorded with its real spend");
      ok(generateCalls === generateBefore + 1 && costs.length === costsBefore + 1, "H1 exactly one model request, one cost row");
      // H2. A reject that races (or follows a lost settle of) an apply heals
      // the lane row to the truth instead of stranding the rollback path.
      const candH = String(rowH.candidate_url);
      const applied = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId: jobH, kind: "ephphatha", candidateUrl: candH, confirm: true }));
      ok(applied.status === 200, "H2 setup: candidate applied to the live chapter");
      lane.rows.get(jobH)!.status = "candidate"; // simulate the lost/raced settle
      const rejectRes = await adminPost(adminReq({ action: "published_redo_reject", slug: SLUG }));
      const rejectBody = await json(rejectRes);
      ok(rejectRes.status === 409 && /already on the live chapter/.test(String(rejectBody.error)), "H2 reject refuses a live candidate with the honest explanation");
      ok(lane.rows.get(jobH)?.status === "applied", "H2 lane bookkeeping healed to applied — the rollback path survives");
      // H3. Rollback is idempotent when its own lane settle was lost.
      const rolledBack = await adminPost(adminReq({ action: "published_redo_rollback", slug: SLUG, jobId: jobH, confirm: true }));
      ok(rolledBack.status === 200, "H3 setup: rollback restored the pre-redo source");
      lane.rows.get(jobH)!.status = "applied"; // simulate the lost settle
      const liveBefore = snapshotOf(store, SLUG);
      const again = await adminPost(adminReq({ action: "published_redo_rollback", slug: SLUG, jobId: jobH, confirm: true }));
      const againBody = await json(again);
      ok(again.status === 200 && againBody.alreadyRolledBack === true, "H3 duplicate rollback settles idempotently");
      ok(snapshotOf(store, SLUG) === liveBefore, "H3 no second chapter write");
      ok(lane.rows.get(jobH)?.status === "rolled_back", "H3 lane row settled as rolled_back");
      // H4. The FREE status poll never writes durable audit rows on a lane
      // outage (the audit-flood finding).
      const auditBefore = audit.length;
      lane.failNextLatest = true;
      const outage = await adminPost(adminReq({ action: "published_redo_status", slug: SLUG }));
      ok(outage.status === 503, "H4 lane outage answers 503");
      ok(audit.length === auditBefore, "H4 the failed poll wrote NO durable audit rows");
    }

    // ---------------- I. Codex #66 exact-head fixes (198cbff review) ----------------
    {
      // I1 (P1-1): apply is bound to the candidate's BASE revision — an
      // unrelated live-row change that leaves the target image untouched
      // still refuses the apply.
      const pf = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digestI = String((pf.redo as Record<string, unknown>).bindingDigest);
      const created = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digestI, confirm: true })));
      const jobI = String(created.jobId);
      await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      const candI = String(lane.rows.get(jobI)!.candidate_url);
      const liveI = store.rows.get(SLUG)!;
      liveI.updated_at = store.now(); // unrelated revision bump; target src unchanged
      const beforeI1 = snapshotOf(store, SLUG);
      const res1 = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId: jobI, kind: "ephphatha", candidateUrl: candI, confirm: true }));
      const body1 = await json(res1);
      ok(res1.status === 409 && /changed after this candidate was created/.test(String(body1.error)), "I1 apply refuses when the live revision drifted, even with the target image unchanged");
      ok(snapshotOf(store, SLUG) === beforeI1, "I1 the live row is untouched by the refused apply");
      const rejI = await adminPost(adminReq({ action: "published_redo_reject", slug: SLUG }));
      ok(rejI.status === 200, "I1 cleanup: stale candidate rejected");

      // I2 (P1-2): rollback is bound to the exact revision the apply wrote —
      // a later live-row change (candidate src still in place) refuses.
      const pf2 = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digestI2 = String((pf2.redo as Record<string, unknown>).bindingDigest);
      const created2 = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digestI2, confirm: true })));
      const jobI2 = String(created2.jobId);
      await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      const candI2 = String(lane.rows.get(jobI2)!.candidate_url);
      const applied2 = await adminPost(adminReq({ action: "published_redo_apply", slug: SLUG, jobId: jobI2, kind: "ephphatha", candidateUrl: candI2, confirm: true }));
      ok(applied2.status === 200, "I2 setup: applied");
      ok(typeof lane.rows.get(jobI2)!.applied_revision === "string", "I2 lane row records the exact applied revision");
      const liveI2 = store.rows.get(SLUG)!;
      liveI2.updated_at = store.now(); // unrelated post-apply change; candidate still live
      const beforeI2 = snapshotOf(store, SLUG);
      const res2 = await adminPost(adminReq({ action: "published_redo_rollback", slug: SLUG, jobId: jobI2, confirm: true }));
      const body2 = await json(res2);
      ok(res2.status === 409 && /changed after this redo was applied/.test(String(body2.error)), "I2 rollback refuses when the live revision moved after apply");
      ok(snapshotOf(store, SLUG) === beforeI2, "I2 the live row is untouched by the refused rollback");
      // restore for later sections: put the applied revision back and roll back cleanly
      liveI2.updated_at = String(lane.rows.get(jobI2)!.applied_revision);
      const rb2 = await adminPost(adminReq({ action: "published_redo_rollback", slug: SLUG, jobId: jobI2, confirm: true }));
      ok(rb2.status === 200, "I2 cleanup: rollback lands once the revision matches again");

      // I3 (P1-3): a post-consume binding read failure closes the running
      // claim (zero spend) instead of stranding the one-active-per-slug lock.
      const pf3 = await json(await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES })));
      const digestI3 = String((pf3.redo as Record<string, unknown>).bindingDigest);
      const created3 = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digestI3, confirm: true })));
      const jobI3 = String(created3.jobId);
      const genBefore3 = generateCalls;
      const costsBefore3 = costs.length;
      store.failNextRead = true; // the consume-time live re-derive fails
      const res3 = await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      ok(res3.status === 500, "I3 worker refuses when the post-consume read fails");
      ok(generateCalls === genBefore3 && costs.length === costsBefore3, "I3 no model request, no cost row");
      const rowI3 = lane.rows.get(jobI3)!;
      ok(rowI3.status === "failed" && rowI3.spent_count === 0 && rowI3.error_code === "post_consume_refusal", "I3 running claim closed with zero spend — never stranded");
      const pf3b = await adminPost(adminReq({ action: "published_redo_preflight", slug: SLUG, kind: "ephphatha", notes: NOTES }));
      ok(pf3b.status === 200, "I3 the lane is immediately usable again");

      // I4 (P1-4): rejecting a candidate FAILS CLOSED when the live row is
      // unreadable — only an authoritative not-live read permits rejection.
      const digestI4 = String(((await json(pf3b)).redo as Record<string, unknown>).bindingDigest);
      const created4 = await json(await adminPost(adminReq({ action: "published_redo", slug: SLUG, kind: "ephphatha", notes: NOTES, bindingDigest: digestI4, confirm: true })));
      const jobI4 = String(created4.jobId);
      await publishedRedoWorker(workerReq(lastTrigger!.body as Record<string, unknown>));
      ok(lane.rows.get(jobI4)?.status === "candidate", "I4 setup: candidate exists");
      store.failNextRead = true;
      const rej4 = await adminPost(adminReq({ action: "published_redo_reject", slug: SLUG }));
      ok(rej4.status === 409, "I4 reject refuses while the live row is unreadable (fail closed)");
      ok(lane.rows.get(jobI4)?.status === "candidate", "I4 the candidate row is untouched by the refused reject");
      const rej4b = await adminPost(adminReq({ action: "published_redo_reject", slug: SLUG }));
      ok(rej4b.status === 200 && lane.rows.get(jobI4)?.status === "rejected", "I4 reject lands once an authoritative read proves the candidate is not live");
    }

    // ---------------- G. Reject + blocked stay-locked ----------------
    {
      lane.rows.set("99999999-9999-4999-8999-999999999999", {
        id: "99999999-9999-4999-8999-999999999999",
        slug: SLUG,
        status: "blocked",
        kind: "ephphatha",
        notes: NOTES,
        binding_digest: "b".repeat(64),
        base_revision: "T1",
        base_src: `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/${RUN_JOB_ID}/ephphatha.png`,
        model: MARK_8_IMAGE_MODEL,
        candidate_url: null,
        spent_count: 1,
        error_code: "cost_record_failed",
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      });
      const res = await adminPost(adminReq({ action: "published_redo_reject", slug: SLUG }));
      ok(res.status === 409, "G1 blocked (unrecorded spend) stays locked — reject refuses");
      lane.rows.delete("99999999-9999-4999-8999-999999999999");
    }

    console.log(`verify:published-redo ✓ ${checks} checks passed (dedicated lane: claim/worker/apply/rollback with the live row untouched until the final conditional write)`);
  } finally {
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
    __setPublishedRedoStoreForTesting(null);
    __setGenerationTestOverrides(null);
    __setStoredSetupApprovalStoreForTesting(null);
    __setCostCaptureForTesting(null);
    __setImageTestOverrides(null);
    __setImageDepsForTesting(null);
    __setTriggerTransportForTesting(null);
    __setVersionSnapshotForTesting(null);
  }
};

function auth401(res: Response): boolean {
  return res.status === 401;
}

main().catch((e) => {
  console.error("verify:published-redo FAILED:", e?.message ?? e);
  process.exit(1);
});
