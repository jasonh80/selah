// Offline safety gate for SINGLE-IMAGE REDO (board #29 owner decision,
// 2026-07-17; Codex spec 2026-07-18). Runs in `npm run prebuild` — every local
// and Netlify build fails unless these invariants hold.
//
// No network, no Supabase, no OpenAI, no secrets: drives the REAL admin route
// (app/api/admin/generation) and the REAL redo worker
// (netlify/functions/redo-image-background) end-to-end against a fake store,
// fake trigger transport, fake storage, and a zero-spend fake generator.
//
// The Codex spec's must-prove list, mapped:
//   1. Two clicks/deliveries still produce one paid call   → D2, E2
//   2. Before approval, chapter data is unchanged          → E5
//   3. Approval changes only the chosen image; reject
//      changes nothing                                     → G3, G4
//   4. Refresh recovers progress (status carries redo)     → F1
//   5. Candidate stays private; approved file never
//      overwrites an old file                              → E5, E6, G3
//   6. Published chapter regeneration refuses              → C2
//   7. 320/375/390px interaction checks                    → live QA (Codex),
//      not provable offline — see the PR notes.
process.env.DEV_ADMIN_TOKEN = "verify-image-redo-offline-token";

import assert from "node:assert/strict";
import type { JobStorePort, JobRow, JobPredicates } from "../lib/server/generation-jobs";
import {
  claimGenerationJob,
  claimImageJob,
  claimImageRedoJob,
  rejectImageRedoCandidate,
  stripTransientJobControlKeys,
  hasTransientJobControlKeys,
  JOB_TOKEN_TTL_MS,
  __setJobStoreForTesting,
  IMAGE_JOB_KEY,
  IMAGE_JOB_STATE_KEY,
  IMAGE_REDO_JOB_KEY,
  IMAGE_REDO_STATE_KEY,
  IMAGE_REDO_KIND_KEY,
  IMAGE_REDO_NOTES_KEY,
  IMAGE_REDO_BINDING_DIGEST_KEY,
  IMAGE_REDO_CANDIDATE_URL_KEY,
  IMAGE_REDO_SPENT_COUNT_KEY,
  IMAGE_REDO_ERROR_CODE_KEY,
  TEXT_JOB_KEY,
} from "../lib/server/generation-jobs";
import { isChapterMutationError, __setRowLookupForTesting } from "../lib/server/protected-chapters";
import { __setTriggerTransportForTesting } from "../lib/server/trigger-generation";
import {
  __setGenerationTestOverrides,
  type GenerationSettings,
} from "../lib/server/generation-settings";
import {
  __setCostCaptureForTesting,
  __setCostWriteFailureForTesting,
  type CostEventInput,
} from "../lib/server/cost-events-repository";
import { __setImageTestOverrides, __setImageDepsForTesting } from "../lib/server/images";
import {
  deriveMarkSprintImagePlan,
  deriveMarkSprintImageRedoPlan,
  markSprintFinalReviewDigest,
  IMAGE_REDO_NOTES_MAX_CHARS,
  MARK_8_IMAGE_MODEL,
} from "../lib/server/mark8-image-plan";
import { validateMarkSprintPublishCandidate } from "../lib/server/chapter-workups-repository";
import { __setStoredSetupApprovalStoreForTesting } from "../lib/server/chapter-setup-approvals";
import { __setConnectedReceiptOverridesForTesting } from "../lib/server/mark-sprint-setup-contracts";
import { __setVersionSnapshotForTesting } from "../lib/server/chapter-versions-repository";
import { POST as adminPost } from "../app/api/admin/generation/route";
import redoWorker from "../netlify/functions/redo-image-background.mts";
import type { ChapterWorkup } from "../lib/types";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

const ADMIN = process.env.DEV_ADMIN_TOKEN!;
const SLUG = "mark-8";
const RUN_JOB_ID = "44444444-4444-4444-8444-444444444444";
const ORIGIN = "https://offline-selah.supabase.co";
const NOTES = "The boat should sit lower in the water and the loaf should be plainly visible.";

const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: true,
  allowed_slugs: [SLUG],
  selected_text_model: "offline-test-model",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: false,
  updated_at: "T0",
};

// ---------------- fakes ----------------

class FakeJobStore implements JobStorePort {
  rows = new Map<string, { status: string; updated_at: string | null; workup_json: Record<string, unknown> }>();
  private tick = 0;
  now(): string { return `T${++this.tick}`; }
  seed(slug: string, status: string, json: Record<string, unknown>): void {
    this.rows.set(slug, { status, updated_at: this.now(), workup_json: json });
  }
  async read(slug: string): Promise<JobRow | null | { error: string }> {
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
    r.updated_at = this.now();
    return 1;
  }
}

function storeLookup(store: FakeJobStore) {
  return async (slug: string) => {
    const r = store.rows.get(slug);
    return r
      ? ({ kind: "row", row: { status: r.status, updatedAt: r.updated_at } } as const)
      : ({ kind: "missing" } as const);
  };
}

// Fake storage that REFUSES overwrites (upsert:false semantics) — proving the
// no-overwrite invariant instead of assuming it.
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

function completedWorkup(): ChapterWorkup {
  const images = [
    { kind: "bread-in-the-boat", index: 1, label: "Bread in the Boat", prompt: "A first-century Galilean fishing boat with the disciples and one loaf.", caption: "One loaf was in the boat.", alt: "The disciples in a fishing boat with one loaf.", status: "complete" },
    { kind: "peter-confession", index: 2, label: "You Are the Christ", prompt: "Peter answering Jesus near Caesarea Philippi.", caption: "Peter sees truly.", alt: "Peter answering Jesus.", status: "complete" },
    { kind: "take-up-the-cross", index: 3, label: "Take Up Your Cross", prompt: "Jesus teaching a crowd on a rugged northern road.", caption: "Following Jesus is costly.", alt: "Jesus teaching a crowd.", status: "complete" },
  ].map((image) => ({
    ...image,
    src: `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/${RUN_JOB_ID}/${image.kind}.png`,
  }));
  return {
    slug: SLUG,
    title: "Mark 8",
    book: "Mark",
    chapter: 8,
    heroKind: "peter-confession",
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
  return new Request("http://localhost/.netlify/functions/redo-image-background", {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const main = async () => {
  // ---------------- A. Pure redo-plan derivation ----------------
  {
    const workup = completedWorkup();
    const plan = deriveMarkSprintImageRedoPlan(SLUG, workup, "bread-in-the-boat", NOTES);
    ok(plan.kind === "bread-in-the-boat" && plan.index === 1, "A1 redo plan targets the exact image");
    ok(plan.revisedPrompt.includes(plan.basePrompt) && plan.revisedPrompt.includes(NOTES), "A1 revised prompt = frozen prompt + owner notes");
    ok(plan.model === MARK_8_IMAGE_MODEL && plan.wide === true, "A1 model and landscape pinned");
    ok(/^[a-f0-9]{64}$/.test(plan.digest), "A1 binding digest shape");
    assert.throws(() => deriveMarkSprintImageRedoPlan(SLUG, workup, "bread-in-the-boat", "  "), /what should change/, "A2 empty notes refuse");
    assert.throws(
      () => deriveMarkSprintImageRedoPlan(SLUG, workup, "bread-in-the-boat", "x".repeat(IMAGE_REDO_NOTES_MAX_CHARS + 1)),
      /characters/,
      "A2 over-long notes refuse",
    );
    assert.throws(() => deriveMarkSprintImageRedoPlan(SLUG, workup, "no-such-kind", NOTES), /no image/, "A2 unknown target refuses");
    const placeholders = completedWorkup();
    placeholders.images = placeholders.images.map((image) => ({ ...image, status: "placeholder" as const, src: "/img/placeholder/establishing.svg" }));
    assert.throws(() => deriveMarkSprintImageRedoPlan(SLUG, placeholders, "bread-in-the-boat", NOTES), /completed stored image set/, "A2 placeholder set refuses (redo needs a finished run)");
    const otherNotes = deriveMarkSprintImageRedoPlan(SLUG, workup, "bread-in-the-boat", `${NOTES} And darker sky.`);
    ok(otherNotes.digest !== plan.digest, "A3 different notes → different binding digest");
    const drifted = completedWorkup();
    drifted.images[0].src = `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/55555555-5555-4555-8555-555555555555/bread-in-the-boat.png`;
    ok(deriveMarkSprintImageRedoPlan(SLUG, drifted, "bread-in-the-boat", NOTES).digest !== plan.digest, "A3 changed current src → different binding digest");
  }

  // ---------------- B. Final-review identity vs the redo lifecycle ----------------
  {
    const workup = completedWorkup();
    const before = markSprintFinalReviewDigest(SLUG, workup);
    ok(before !== null, "B1 completed set has a review identity");
    const withRedo = { ...(workup as unknown as Record<string, unknown>), [IMAGE_REDO_JOB_KEY]: "j", [IMAGE_REDO_STATE_KEY]: "candidate" } as unknown as ChapterWorkup;
    ok(markSprintFinalReviewDigest(SLUG, withRedo) === null, "B2 unresolved redo nulls the review identity (cannot approve or publish through it)");
    const applied = completedWorkup();
    applied.images = applied.images.map((image, i) =>
      i === 0
        ? { ...image, src: `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/55555555-5555-4555-8555-555555555555/${image.kind}.png` }
        : image,
    );
    const after = markSprintFinalReviewDigest(SLUG, applied);
    ok(after !== null && after !== before, "B3 an applied redo (two job dirs) has a NEW review identity the owner must re-approve");
    const foreign = completedWorkup();
    foreign.images[0].src = "https://evil.example/storage/v1/object/public/chapter-images/mark-8/x/bread-in-the-boat.png";
    ok(markSprintFinalReviewDigest(SLUG, foreign) === null, "B3 a non-stored src still nulls the identity");
    const publish = validateMarkSprintPublishCandidate(
      SLUG,
      withRedo,
      "a".repeat(64),
      ORIGIN,
    );
    ok(!publish.ok, "B4 publish validation refuses while a redo is unresolved");
  }

  // ---------------- Harness for route + worker ----------------
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  const store = new FakeJobStore();
  const db = fakeDb();
  let generateCalls = 0;
  let lastTrigger: { url: string; body: Record<string, unknown> } | null = null;
  let triggerOk = true;
  let snapshotResult: number | null = 7;
  let snapshotCalls = 0;

  __setJobStoreForTesting(store);
  __setRowLookupForTesting(storeLookup(store));
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setStoredSetupApprovalStoreForTesting({
    async read() { return null; },
    async upsert(): Promise<void> { throw new Error("offline approval store is read-only"); },
  });
  __setCostCaptureForTesting(costs);
  __setImageTestOverrides({
    configBypass: true,
    modelProbe: async (model) => ({ ok: true, model }),
  });
  __setImageDepsForTesting({
    db: db as never,
    generateBytes: async () => {
      generateCalls++;
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
    // ---------------- C. Free preflight through the REAL route ----------------
    {
      store.seed(SLUG, "draft", completedWorkup() as unknown as Record<string, unknown>);
      const res = await adminPost(adminReq({ action: "redo_image_preflight", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES }));
      const body = await json(res);
      const redo = body.redo as Record<string, unknown>;
      ok(res.status === 200 && body.ok === true, "C1 preflight succeeds on a completed draft");
      ok(redo.model === MARK_8_IMAGE_MODEL && redo.size === "1536x1024", "C1 preflight names the exact model and landscape size");
      ok(typeof redo.estimatedCostUsd === "number" && (redo.estimatedCostUsd as number) > 0, "C1 preflight names the maximum charge");
      ok(typeof redo.bindingDigest === "string" && /^[a-f0-9]{64}$/.test(redo.bindingDigest as string), "C1 preflight returns the binding digest");
      ok(generateCalls === 0 && costs.length === 0, "C1 preflight is free — no model call, no cost event");

      store.seed(SLUG, "reviewed", completedWorkup() as unknown as Record<string, unknown>);
      const published = await adminPost(adminReq({ action: "redo_image_preflight", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES }));
      ok(published.status === 403, "C2 PUBLISHED chapter redo preflight → 403 (published chapters stay locked)");
      const publishedPaid = await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES, bindingDigest: "a".repeat(64), confirm: true }));
      ok(publishedPaid.status === 403, "C2 PUBLISHED chapter paid redo → 403");
      const publishedApply = await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl: `${ORIGIN}/x`, confirm: true }));
      ok(publishedApply.status === 403, "C2 PUBLISHED chapter apply → 403");

      const busyJson = { ...(completedWorkup() as unknown as Record<string, unknown>), [IMAGE_JOB_KEY]: "some-job", [IMAGE_JOB_STATE_KEY]: "running" };
      store.seed(SLUG, "draft", busyJson);
      ok((await adminPost(adminReq({ action: "redo_image_preflight", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES }))).status === 409, "C3 active full image job → 409");

      __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, image_generation_enabled: false }, captureAudit: audit });
      store.seed(SLUG, "draft", completedWorkup() as unknown as Record<string, unknown>);
      ok((await adminPost(adminReq({ action: "redo_image_preflight", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES }))).status === 403, "C4 image kill switch OFF → 403");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });

      __setConnectedReceiptOverridesForTesting({ [SLUG]: false });
      ok((await adminPost(adminReq({ action: "redo_image_preflight", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES }))).status === 403, "C5 missing/drifted owner receipt → 403");
      __setConnectedReceiptOverridesForTesting(null);
      ok(generateCalls === 0 && costs.length === 0, "C refusals spend nothing");
    }

    // ---------------- D. Paid redo claim through the REAL route ----------------
    let redoJobId = "";
    let bindingDigest = "";
    {
      store.seed(SLUG, "draft", completedWorkup() as unknown as Record<string, unknown>);
      bindingDigest = deriveMarkSprintImageRedoPlan(SLUG, completedWorkup(), "bread-in-the-boat", NOTES).digest;

      ok((await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES, bindingDigest }))).status === 400, "D1 missing confirm → 400");
      ok((await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "bread-in-the-boat", notes: `${NOTES} drifted`, bindingDigest, confirm: true }))).status === 409, "D1 notes drift vs digest → 409");
      ok(!(IMAGE_REDO_JOB_KEY in store.rows.get(SLUG)!.workup_json), "D1 refusals never leave a claim");

      lastTrigger = null;
      const res = await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES, bindingDigest, confirm: true }));
      const body = await json(res);
      ok(res.status === 200 && body.ok === true && typeof body.jobId === "string", "D2 owner-confirmed redo queues");
      redoJobId = body.jobId as string;
      const row = store.rows.get(SLUG)!;
      ok(row.workup_json[IMAGE_REDO_JOB_KEY] === redoJobId && row.workup_json[IMAGE_REDO_STATE_KEY] === "queued", "D2 claim stamped queued");
      ok(lastTrigger !== null && (lastTrigger as { body: Record<string, unknown> }).body.redoBindingDigest === bindingDigest, "D2 authenticated trigger carries the binding");

      const second = await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "peter-confession", notes: NOTES, bindingDigest: deriveMarkSprintImageRedoPlan(SLUG, completedWorkup(), "peter-confession", NOTES).digest, confirm: true }));
      ok(second.status === 409, "D2 SECOND redo while one is active → 409 (one candidate per chapter)");
      ok(generateCalls === 0, "D2 route-side duplicate lost BEFORE any model spend");

      await (async () => {
        try {
          await claimImageJob(store, SLUG, { planDigest: "f".repeat(64), model: MARK_8_IMAGE_MODEL });
          ok(false, "D3 full image claim must refuse while a redo is active");
        } catch (e) {
          ok(isChapterMutationError(e) && e.code === "CONFLICT", "D3 full image claim while redo active → CONFLICT");
        }
      })();
      await (async () => {
        try {
          await claimGenerationJob(store, SLUG, { book: "Mark", chapter: 8, title: "Mark 8" });
          ok(false, "D3 text claim must refuse while a redo is active");
        } catch (e) {
          ok(isChapterMutationError(e), "D3 text claim while redo active → refused (paid candidate protected)");
        }
      })();
    }

    // ---------------- E. REAL worker: one spend, private candidate ----------------
    {
      ok((await redoWorker(workerReq({}, "GET"))).status === 405, "E1 non-POST → 405");
      ok((await redoWorker(workerReq({ slug: SLUG, job: redoJobId, token: "junk", redoBindingDigest: bindingDigest, imageModel: MARK_8_IMAGE_MODEL }))).status === 401, "E1 bad token → 401");
      ok((await redoWorker(workerReq({ slug: SLUG, job: redoJobId, token: "x" }))).status === 400, "E1 missing binding → 400");
      ok(generateCalls === 0, "E1 refused workers spend nothing");

      const imagesBefore = JSON.stringify(store.rows.get(SLUG)!.workup_json.images);
      const trigger = (lastTrigger as unknown as { body: Record<string, unknown> }).body;
      const delivery = { slug: SLUG, job: redoJobId, token: trigger.token, redoBindingDigest: bindingDigest, imageModel: MARK_8_IMAGE_MODEL };

      const first = await redoWorker(workerReq(delivery));
      ok(first.status === 200, "E2 first delivery produces the candidate");
      const dup = await redoWorker(workerReq(delivery));
      ok(dup.status === 500, "E2 duplicated delivery loses at the atomic consume");
      ok(generateCalls === 1, "E2 EXACTLY ONE paid model call across both deliveries");

      const row = store.rows.get(SLUG)!;
      ok(row.workup_json[IMAGE_REDO_STATE_KEY] === "candidate", "E3 redo state is candidate");
      const candidateUrl = row.workup_json[IMAGE_REDO_CANDIDATE_URL_KEY] as string;
      ok(candidateUrl === `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/${redoJobId}/bread-in-the-boat.png`, "E3 candidate lives in its OWN immutable job directory");
      ok(db.uploads.length === 1 && db.uploads[0] === `${SLUG}/${redoJobId}/bread-in-the-boat.png`, "E3 one upload, new path — the original run's files were never touched");
      ok(costs.length === 1 && costs[0].imageCount === 1 && costs[0].metadata?.redo === true, "E4 spend recorded strictly: one image, marked as a redo");
      ok(JSON.stringify(store.rows.get(SLUG)!.workup_json.images) === imagesBefore, "E5 chapter images are BYTE-FOR-BYTE unchanged while the candidate waits");
      ok(!imagesBefore.includes(candidateUrl), "E6 candidate is private — nothing in the chapter references it");
    }

    // ---------------- F. Refresh recovery via images_status ----------------
    {
      const res = await adminPost(adminReq({ action: "images_status", slug: SLUG }));
      const body = await json(res);
      const redo = body.redo as Record<string, unknown>;
      ok(res.status === 200 && redo?.state === "candidate" && redo?.kind === "bread-in-the-boat", "F1 status poll carries the redo state (refresh recovers progress)");
      ok(typeof redo?.candidateUrl === "string" && redo?.notes === NOTES, "F1 status carries candidate url + the owner's exact notes");
      const images = body.images as Array<Record<string, unknown>>;
      ok(images.every((image) => typeof image.src === "string" && (image.src as string).startsWith("https://")), "F1 per-image src powers the Studio thumbnails");
      ok(body.reviewDigest === undefined, "F1 no review identity while the candidate is unresolved");
    }

    // ---------------- G. Owner decision: apply / reject ----------------
    {
      const candidateUrl = store.rows.get(SLUG)!.workup_json[IMAGE_REDO_CANDIDATE_URL_KEY] as string;

      ok((await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl }))).status === 400, "G1 apply without confirm → 400");
      ok((await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl: `${ORIGIN}/other.png`, confirm: true }))).status === 409, "G1 apply with a different url than reviewed → 409");

      snapshotResult = null;
      const noSnapshot = await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl, confirm: true }));
      ok(noSnapshot.status === 500, "G2 apply REFUSES when the rollback snapshot cannot be saved");
      ok(store.rows.get(SLUG)!.workup_json[IMAGE_REDO_STATE_KEY] === "candidate", "G2 failed snapshot leaves everything unchanged");
      snapshotResult = 7;

      // A refused apply must never append a version row — and never write a
      // post-apply state under the rollback label (adversarial review P2).
      const snapsBefore = snapshotCalls;
      ok((await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl: `${ORIGIN}/never-reviewed.png`, confirm: true }))).status === 409, "G2b wrong-url apply refuses");
      ok(snapshotCalls === snapsBefore, "G2b refused apply took NO snapshot (no junk/mislabeled version rows)");

      const workupBefore = JSON.parse(JSON.stringify(store.rows.get(SLUG)!.workup_json)) as Record<string, unknown>;
      const applied = await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl, confirm: true }));
      ok(applied.status === 200 && snapshotCalls > 0, "G3 apply succeeds after a rollback snapshot");
      const after = store.rows.get(SLUG)!.workup_json;
      const afterImages = after.images as Array<Record<string, unknown>>;
      const beforeImages = workupBefore.images as Array<Record<string, unknown>>;
      ok(afterImages[0].src === candidateUrl, "G3 the chosen image now uses the approved candidate");
      ok(
        JSON.stringify({ ...afterImages[0], src: "" }) === JSON.stringify({ ...beforeImages[0], src: "" }),
        "G3 every other field of the chosen image is unchanged (label/prompt/caption/alt fixed in v1)",
      );
      ok(JSON.stringify(afterImages.slice(1)) === JSON.stringify(beforeImages.slice(1)), "G3 the other images are byte-for-byte unchanged");
      ok(
        [IMAGE_REDO_JOB_KEY, IMAGE_REDO_STATE_KEY, IMAGE_REDO_KIND_KEY, IMAGE_REDO_NOTES_KEY, IMAGE_REDO_BINDING_DIGEST_KEY, IMAGE_REDO_CANDIDATE_URL_KEY, IMAGE_REDO_SPENT_COUNT_KEY, IMAGE_REDO_ERROR_CODE_KEY].every((key) => !(key in after)),
        "G3 apply clears every redo key",
      );
      const newDigest = markSprintFinalReviewDigest(SLUG, after as unknown as ChapterWorkup);
      ok(newDigest !== null, "G3 the applied set has a review identity again (owner re-approves, publish re-verifies)");

      // Duplicate click AFTER success (stale tab): refuse WITHOUT a snapshot,
      // so no post-apply state ever lands under the rollback label.
      const snapsAfterApply = snapshotCalls;
      ok((await adminPost(adminReq({ action: "redo_image_apply", slug: SLUG, kind: "bread-in-the-boat", candidateUrl, confirm: true }))).status === 409, "G3b duplicate apply after success → 409");
      ok(snapshotCalls === snapsAfterApply, "G3b duplicate apply took NO snapshot (rollback label stays truthful)");

      // Reject on a fresh candidate: chapter unchanged, identity restored.
      const pristine = completedWorkup();
      const originalDigest = markSprintFinalReviewDigest(SLUG, pristine);
      store.seed(SLUG, "draft", {
        ...(pristine as unknown as Record<string, unknown>),
        [IMAGE_REDO_JOB_KEY]: "66666666-6666-4666-8666-666666666666",
        [IMAGE_REDO_STATE_KEY]: "candidate",
        [IMAGE_REDO_KIND_KEY]: "peter-confession",
        [IMAGE_REDO_NOTES_KEY]: NOTES,
        [IMAGE_REDO_BINDING_DIGEST_KEY]: "b".repeat(64),
        [IMAGE_REDO_CANDIDATE_URL_KEY]: `${ORIGIN}/storage/v1/object/public/chapter-images/${SLUG}/66666666-6666-4666-8666-666666666666/peter-confession.png`,
      });
      const imagesBeforeReject = JSON.stringify(store.rows.get(SLUG)!.workup_json.images);
      const rejected = await adminPost(adminReq({ action: "redo_image_reject", slug: SLUG }));
      ok(rejected.status === 200, "G4 reject succeeds");
      const afterReject = store.rows.get(SLUG)!.workup_json;
      ok(JSON.stringify(afterReject.images) === imagesBeforeReject, "G4 reject changes NOTHING in the chapter");
      ok(!(IMAGE_REDO_JOB_KEY in afterReject), "G4 reject clears the redo keys");
      ok(markSprintFinalReviewDigest(SLUG, afterReject as unknown as ChapterWorkup) === originalDigest, "G4 the original review identity is restored after reject");
      ok((await adminPost(adminReq({ action: "redo_image_reject", slug: SLUG }))).status === 409, "G4 double-reject → 409 (nothing pending)");

      // A FAILED redo (spend recorded) can be dismissed; BLOCKED stays locked.
      store.seed(SLUG, "draft", {
        ...(completedWorkup() as unknown as Record<string, unknown>),
        [IMAGE_REDO_JOB_KEY]: "77777777-7777-4777-8777-777777777777",
        [IMAGE_REDO_STATE_KEY]: "failed",
        [IMAGE_REDO_KIND_KEY]: "peter-confession",
        [IMAGE_REDO_NOTES_KEY]: NOTES,
        [IMAGE_REDO_BINDING_DIGEST_KEY]: "b".repeat(64),
        [IMAGE_REDO_SPENT_COUNT_KEY]: 1,
        [IMAGE_REDO_ERROR_CODE_KEY]: "image_run_failed",
      });
      ok((await adminPost(adminReq({ action: "redo_image_reject", slug: SLUG }))).status === 200, "G5 a failed redo (spend recorded) can be dismissed");
      store.seed(SLUG, "draft", {
        ...(completedWorkup() as unknown as Record<string, unknown>),
        [IMAGE_REDO_JOB_KEY]: "88888888-8888-4888-8888-888888888888",
        [IMAGE_REDO_STATE_KEY]: "blocked",
        [IMAGE_REDO_KIND_KEY]: "peter-confession",
        [IMAGE_REDO_NOTES_KEY]: NOTES,
        [IMAGE_REDO_BINDING_DIGEST_KEY]: "b".repeat(64),
      });
      ok((await adminPost(adminReq({ action: "redo_image_reject", slug: SLUG }))).status === 409, "G5 a BLOCKED redo (cost not recorded) cannot be dismissed — needs attention");
      ok(!(await rejectImageRedoCandidate(store, SLUG)), "G5 direct reject also refuses blocked");
    }

    // ---------------- H. Worker fail-closed paths ----------------
    {
      // Kill switch flips OFF between claim and worker: release, zero spend.
      store.seed(SLUG, "draft", completedWorkup() as unknown as Record<string, unknown>);
      const digest = deriveMarkSprintImageRedoPlan(SLUG, completedWorkup(), "take-up-the-cross", NOTES).digest;
      lastTrigger = null;
      const queued = await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "take-up-the-cross", notes: NOTES, bindingDigest: digest, confirm: true }));
      const queuedBody = await json(queued);
      ok(queued.status === 200, "H1 redo queued for the kill-switch drill");
      const generateBefore = generateCalls;
      __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, image_generation_enabled: false }, captureAudit: audit });
      const trigger = (lastTrigger as unknown as { body: Record<string, unknown> }).body;
      const refused = await redoWorker(workerReq({ slug: SLUG, job: queuedBody.jobId, token: trigger.token, redoBindingDigest: digest, imageModel: MARK_8_IMAGE_MODEL }));
      ok(refused.status === 500 && generateCalls === generateBefore, "H1 switch OFF before spend → refused with ZERO model calls");
      ok(!(IMAGE_REDO_JOB_KEY in store.rows.get(SLUG)!.workup_json), "H1 pre-spend refusal releases the claim entirely");
      __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });

      // Cost-record failure AFTER generation: candidate never appears; blocked.
      store.seed(SLUG, "draft", completedWorkup() as unknown as Record<string, unknown>);
      const digest2 = deriveMarkSprintImageRedoPlan(SLUG, completedWorkup(), "peter-confession", NOTES).digest;
      lastTrigger = null;
      const queued2 = await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "peter-confession", notes: NOTES, bindingDigest: digest2, confirm: true }));
      const queued2Body = await json(queued2);
      ok(queued2.status === 200, "H2 redo queued for the cost-failure drill");
      // The capture seam takes precedence over the failure seam — disable
      // capture so the strict write genuinely fails.
      __setCostCaptureForTesting(null);
      __setCostWriteFailureForTesting("insert_failed");
      const trigger2 = (lastTrigger as unknown as { body: Record<string, unknown> }).body;
      const blockedRun = await redoWorker(workerReq({ slug: SLUG, job: queued2Body.jobId, token: trigger2.token, redoBindingDigest: digest2, imageModel: MARK_8_IMAGE_MODEL }));
      __setCostWriteFailureForTesting(null);
      __setCostCaptureForTesting(costs);
      ok(blockedRun.status === 500, "H2 unrecordable spend never becomes a candidate");
      const blockedRow = store.rows.get(SLUG)!.workup_json;
      ok(blockedRow[IMAGE_REDO_STATE_KEY] === "blocked" && !(IMAGE_REDO_CANDIDATE_URL_KEY in blockedRow), "H2 redo locks BLOCKED with no candidate url");
      ok(JSON.stringify((blockedRow.images as unknown[])) === JSON.stringify(completedWorkup().images), "H2 chapter images still untouched");

      // Trigger failure releases the queued claim.
      store.seed(SLUG, "draft", completedWorkup() as unknown as Record<string, unknown>);
      const digest3 = deriveMarkSprintImageRedoPlan(SLUG, completedWorkup(), "bread-in-the-boat", NOTES).digest;
      triggerOk = false;
      const failedTrigger = await adminPost(adminReq({ action: "redo_image", slug: SLUG, kind: "bread-in-the-boat", notes: NOTES, bindingDigest: digest3, confirm: true }));
      triggerOk = true;
      ok(failedTrigger.status === 502, "H3 failed trigger → 502");
      ok(!(IMAGE_REDO_JOB_KEY in store.rows.get(SLUG)!.workup_json), "H3 failed trigger releases the claim");

      // A queued redo may be claimed by exactly one worker even under races:
      const raced = await claimImageRedoJob(store, SLUG, { kind: "bread-in-the-boat", notes: NOTES, bindingDigest: digest3 }).catch(() => null);
      ok(raced !== null, "H4 fresh claim works after release");
      const raced2 = await claimImageRedoJob(store, SLUG, { kind: "bread-in-the-boat", notes: NOTES, bindingDigest: digest3 }).catch((e) => (isChapterMutationError(e) ? e.code : "?"));
      ok(raced2 === "CONFLICT", "H4 concurrent second claim → CONFLICT");
    }

    // ---------------- I. Adversarial-review fixes (versions × redo, stale claims) ----------------
    {
      // I1. Whole-workup version writes refuse while ANY job state is live —
      // a restore/merge must never erase a paid claim or an unresolved
      // candidate, and must never clear a blocked (unrecorded-spend) lock.
      for (const seededState of ["queued", "running", "candidate", "blocked"]) {
        store.seed(SLUG, "draft", {
          ...(completedWorkup() as unknown as Record<string, unknown>),
          [IMAGE_REDO_JOB_KEY]: "99999999-9999-4999-8999-999999999999",
          [IMAGE_REDO_STATE_KEY]: seededState,
          [IMAGE_REDO_KIND_KEY]: "peter-confession",
          [IMAGE_REDO_NOTES_KEY]: NOTES,
          [IMAGE_REDO_BINDING_DIGEST_KEY]: "b".repeat(64),
        });
        ok(
          (await adminPost(adminReq({ action: "version_restore", slug: SLUG, version: 1 }))).status === 409,
          `I1 version_restore refuses while redo is ${seededState}`,
        );
        ok(
          (await adminPost(adminReq({ action: "version_apply", slug: SLUG, workup: completedWorkup(), label: "merge" }))).status === 409,
          `I1 version_apply refuses while redo is ${seededState}`,
        );
        ok(
          store.rows.get(SLUG)!.workup_json[IMAGE_REDO_STATE_KEY] === seededState,
          `I1 refused version write left the ${seededState} redo intact`,
        );
      }
      store.seed(SLUG, "draft", {
        ...(completedWorkup() as unknown as Record<string, unknown>),
        [IMAGE_JOB_KEY]: "job",
        [IMAGE_JOB_STATE_KEY]: "running",
      });
      ok(
        (await adminPost(adminReq({ action: "version_restore", slug: SLUG, version: 1 }))).status === 409,
        "I1 version_restore also refuses while a FULL image job is live",
      );

      // I2. The strip helper removes every job-control key and nothing else —
      // snapshot/restore/merge route through it, so archives can never carry
      // or resurrect live claims.
      const dirty = {
        title: "Mark 8",
        images: [],
        [TEXT_JOB_KEY]: "t",
        [IMAGE_JOB_KEY]: "i",
        [IMAGE_JOB_STATE_KEY]: "queued",
        [IMAGE_REDO_JOB_KEY]: "r",
        [IMAGE_REDO_STATE_KEY]: "candidate",
        [IMAGE_REDO_CANDIDATE_URL_KEY]: "https://x",
      };
      ok(hasTransientJobControlKeys(dirty), "I2 dirty workup detected");
      const stripped = stripTransientJobControlKeys(dirty);
      ok(!hasTransientJobControlKeys(stripped), "I2 strip removes every job-control key");
      ok(stripped.title === "Mark 8" && Array.isArray(stripped.images), "I2 strip keeps real content");
      ok(dirty[IMAGE_REDO_JOB_KEY] === "r", "I2 strip is a copy — the input is untouched");

      // I3. Stale-queued dismissal: a queued claim whose row revision predates
      // the worker-token TTL is provably unconsumable (token expired, consume
      // is the only path to spend) and may be owner-dismissed. A LIVE queued
      // claim refuses. This closes the dropped-Netlify-invocation wedge.
      const staleJson = {
        ...(completedWorkup() as unknown as Record<string, unknown>),
        [IMAGE_REDO_JOB_KEY]: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        [IMAGE_REDO_STATE_KEY]: "queued",
        [IMAGE_REDO_KIND_KEY]: "peter-confession",
        [IMAGE_REDO_NOTES_KEY]: NOTES,
        [IMAGE_REDO_BINDING_DIGEST_KEY]: "b".repeat(64),
      };
      const staleIso = new Date(Date.now() - JOB_TOKEN_TTL_MS - 60_000).toISOString();
      store.rows.set(SLUG, { status: "draft", updated_at: staleIso, workup_json: staleJson });
      ok(await rejectImageRedoCandidate(store, SLUG), "I3 STALE queued claim (token provably expired) can be dismissed");
      ok(!(IMAGE_REDO_JOB_KEY in store.rows.get(SLUG)!.workup_json), "I3 dismissal cleared the stale claim");

      const liveIso = new Date().toISOString();
      store.rows.set(SLUG, { status: "draft", updated_at: liveIso, workup_json: { ...staleJson } });
      ok(!(await rejectImageRedoCandidate(store, SLUG)), "I3 LIVE queued claim refuses dismissal");
      store.rows.set(SLUG, { status: "draft", updated_at: "T-unparseable", workup_json: { ...staleJson } });
      ok(!(await rejectImageRedoCandidate(store, SLUG)), "I3 unparseable revision is never stale (fail closed)");
      const staleRunning = { ...staleJson, [IMAGE_REDO_STATE_KEY]: "running" };
      store.rows.set(SLUG, { status: "draft", updated_at: staleIso, workup_json: staleRunning });
      ok(!(await rejectImageRedoCandidate(store, SLUG)), "I3 running claims stay locked even when old (may hide un-recorded spend — needs attention, not dismissal)");
    }
  } finally {
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
    __setGenerationTestOverrides(null);
    __setStoredSetupApprovalStoreForTesting(null);
    __setCostCaptureForTesting(null);
    __setCostWriteFailureForTesting(null);
    __setImageTestOverrides(null);
    __setImageDepsForTesting(null);
    __setTriggerTransportForTesting(null);
    __setConnectedReceiptOverridesForTesting(null);
    __setVersionSnapshotForTesting(null);
  }

  console.log(`verify:image-redo ✓ ${checks} checks passed (one candidate, one spend, owner decides; published chapters and unrecorded spend fail closed)`);
};

main().catch((error) => {
  console.error("verify:image-redo FAILED:", error.message ?? error);
  process.exit(1);
});
