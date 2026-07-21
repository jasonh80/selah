// verify:model-day — the Model Day blind A/B acceptance test, hermetic and
// offline (printing-press plan standing ritual; Part 9 first run: GPT-5.5 vs
// GPT-5.6 Sol).
//
// Drives the REAL admin route and the REAL background worker through injected
// seams only (in-memory run store, canned model, canned prompt context,
// captured triggers, captured audit/cost) — no network, no Supabase, no
// OpenAI, no secrets beyond a dummy admin token. HONESTY NOTE: the real
// Supabase adapter (productionStore in model-day.ts) is NOT executed here;
// the fake mirrors its contract. Codex's post-merge look at a live run covers
// the adapter.
//
// The acceptance claims, verbatim from the plan + owner mission order:
//  1. Private: a run writes ONLY model_day_runs rows + cost events + audit —
//     never chapter data, never a publish, never a model switch.
//  2. Blind: the judge packet carries candidates A/B only; the mapping is
//     sealed in the row and revealed only by the explicit digest-bound action.
//  3. Under the cap, structurally: each call is hard-bounded; the challenger
//     dispatches only if incumbent-actual + challenger-ceiling fits the cap.
//  4. Spend honesty (IQ-006): every dispatch outcome lands in the ledger;
//     kill switch and confirmation gate every spend path.
process.env.DEV_ADMIN_TOKEN = "verify-model-day-offline-token";

import { POST as routePost } from "../app/api/admin/generation/route";
import modelDayWorker from "../netlify/functions/model-day-background.mts";
import {
  __setModelDayStoreForTesting,
  __setModelDayModelForTesting,
  __setModelDayPromptContextForTesting,
  readLatestModelDayRun,
  claimModelDayRun,
  buildJudgePacket,
  packetDigestOf,
  modelDayCallCeilingUsd,
  modelDayQuote,
  validModelId,
  MODEL_DAY_TOTAL_CAP_USD,
  MODEL_DAY_PROMPT_MAX_CHARS,
  MODEL_DAY_SCHEMA_VERSION,
  type ModelDayStore,
  type ModelDayStatus,
  type ModelDayLatest,
} from "../lib/server/model-day";
import { passingDraft } from "./verify-mark-authoring-contract";
import {
  __setGenerationTestOverrides,
  type GenerationSettings,
} from "../lib/server/generation-settings";
import { __setCostCaptureForTesting, type CostEventInput } from "../lib/server/cost-events-repository";
import { __setTriggerTransportForTesting } from "../lib/server/trigger-generation";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    console.error(`verify:model-day FAILED: ${label}`);
    process.exit(1);
  }
}

const ADMIN = process.env.DEV_ADMIN_TOKEN!;
function adminReq(body: Record<string, unknown>, token = ADMIN): Request {
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
}
function workerReq(body: Record<string, unknown>, method = "POST"): Request {
  return new Request("http://localhost:3000/.netlify/functions/model-day-background", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

// In-memory run store with the production semantics: newest-first latest(),
// insert-as-claim with the one-live-run-per-slug partial unique, strictly
// conditional updates.
class FakeModelDayStore implements ModelDayStore {
  rows: Array<Record<string, unknown>> = [];
  failReads = false;
  async latest(slug: string): Promise<ModelDayLatest> {
    if (this.failReads) return { kind: "error", message: "simulated outage" };
    const mine = this.rows
      .filter((r) => r.slug === slug)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return mine.length > 0 ? { kind: "row", row: mine[0] } : { kind: "missing" };
  }
  async insert(row: Record<string, unknown>) {
    if (this.failReads) return { error: "simulated outage" };
    const live = this.rows.some(
      (r) => r.slug === row.slug && (r.status === "generating" || r.status === "running"),
    );
    if (live) return "conflict" as const;
    this.rows.push({ created_at: new Date().toISOString(), ...row });
    return "ok" as const;
  }
  async conditionalUpdate(id: string, expectedStatus: ModelDayStatus, next: Record<string, unknown>) {
    if (this.failReads) return { error: "simulated outage" };
    const row = this.rows.find((r) => r.id === id && r.status === expectedStatus);
    if (!row) return 0;
    Object.assign(row, next);
    return 1;
  }
}

const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: false,
  allowed_slugs: [],
  selected_text_model: "gpt-5.5",
  selected_image_model: "gpt-image-2",
  daily_budget_limit_usd: null,
  require_confirm: true,
  updated_at: new Date().toISOString(),
};

async function adminPost(body: Record<string, unknown>, token = ADMIN) {
  const res = await routePost(adminReq(body, token));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const VALID_WORKUP = JSON.stringify(passingDraft("mark-9"));

async function main(): Promise<void> {
  const store = new FakeModelDayStore();
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  let lastTrigger: { url: string; body: Record<string, unknown> } | null = null;
  let modelCalls: Array<{ model: string; prompt: string }> = [];
  // The canned model: valid workup JSON, plausible usage (~$0.055/call).
  let modelBehavior: (model: string) => { content: string; inputTokens: number; outputTokens: number | null } = () => ({
    content: VALID_WORKUP,
    inputTokens: 5_000,
    outputTokens: 1_000,
  });

  __setModelDayStoreForTesting(store);
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting(costs);
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = { url: req.url, body: req.body as unknown as Record<string, unknown> };
    return { ok: true, status: 202 };
  });
  __setModelDayModelForTesting(async ({ model, prompt }) => {
    modelCalls.push({ model, prompt });
    return modelBehavior(model);
  });
  __setModelDayPromptContextForTesting(async () => ({
    globalRules: ["Accuracy over flourish; state uncertainty plainly."],
    chapterNotes: ["Note: verse 30 is the hinge."],
    examples: [{ title: "Form example", exampleType: "structure", content: "Short, honest, concrete." }],
  }));

  // A. Auth + free reads.
  ok((await adminPost({ action: "model_day_status", slug: "mark-9" }, "wrong")).status === 401, "A1 wrong admin token refused");
  const emptyStatus = await adminPost({ action: "model_day_status", slug: "mark-9" });
  ok(emptyStatus.status === 200 && emptyStatus.json.status === "none", "A2 no-run status reads as none");
  const quote = (emptyStatus.json.quote ?? {}) as Record<string, number>;
  ok(quote.totalCapUsd === MODEL_DAY_TOTAL_CAP_USD && quote.perCallCeilingUsd === modelDayCallCeilingUsd(), "A3 the quote discloses the enforced cap and per-call ceiling");
  ok(modelDayCallCeilingUsd() < MODEL_DAY_TOTAL_CAP_USD, "A4 one bounded call always fits the cap (the second is gated on the first's actual)");
  ok((await adminPost({ action: "model_day_status", slug: "not a slug!" })).status === 400, "A5 unparseable slug refused");

  // B. Create-side gates: confirmation, kill switch, model validity.
  ok((await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "gpt-5.6-sol" })).status === 400, "B1 missing confirmation refused");
  ok((await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "not a model!!", confirm: true })).status === 400, "B2 invalid challenger id refused");
  __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
  ok((await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "gpt-5.6-sol", confirm: true })).status === 403, "B3 Text Generation OFF refuses Model Day spends");
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  ok((await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "gpt-5.5", confirm: true })).status === 403, "B4 an A/A run (challenger == incumbent) is refused");
  ok(store.rows.length === 0 && modelCalls.length === 0 && costs.length === 0, "B5 every refused create left storage, models, and the ledger untouched");

  // C. Happy path: create → claim row → authenticated worker → done row.
  const created = await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "gpt-5.6-sol", confirm: true });
  ok(created.status === 200 && created.json.ok === true, "C1 confirmed create starts a run");
  ok(lastTrigger !== null && String(lastTrigger!.url).includes("model-day-background"), "C2 the dedicated worker was triggered");
  const claimRow = store.rows[0];
  ok(claimRow.status === "generating" && claimRow.incumbent_model === "gpt-5.5" && claimRow.challenger_model === "gpt-5.6-sol", "C3 the claim row pins both models (incumbent from Studio settings)");

  // Unauthenticated / tampered worker calls do nothing.
  const badToken = await modelDayWorker(workerReq({ slug: "mark-9", job: String(lastTrigger!.body.job), token: "tampered" }));
  ok(badToken.status === 401 && modelCalls.length === 0, "C4 a tampered worker token dispatches nothing");
  ok((await modelDayWorker(workerReq({}, "GET"))).status === 405, "C5 the worker refuses non-POST");

  const done = await modelDayWorker(workerReq({ slug: "mark-9", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  ok(done.status === 200, "C6 the authenticated worker completes");
  ok(modelCalls.length === 2 && modelCalls[0].model === "gpt-5.5" && modelCalls[1].model === "gpt-5.6-sol", "C7 incumbent dispatches first, challenger second, one request each");
  ok(modelCalls[0].prompt === modelCalls[1].prompt, "C8 both models receive the IDENTICAL prompt");
  ok(/Accuracy over flourish/.test(modelCalls[0].prompt) && /verse 30/.test(modelCalls[0].prompt), "C9 the prompt carries the production rules + chapter notes (representative A/B)");
  const doneRow = await readLatestModelDayRun("mark-9");
  ok(doneRow?.status === "done" && doneRow.candidate_a_json !== null && doneRow.candidate_b_json !== null, "C10 the run stored both candidates");
  ok(doneRow!.label_map !== null && [doneRow!.label_map!.A, doneRow!.label_map!.B].sort().join(",") === "gpt-5.5,gpt-5.6-sol", "C11 the sealed label map covers exactly both models");
  ok(typeof doneRow!.cost_usd === "number" && doneRow!.cost_usd! <= MODEL_DAY_TOTAL_CAP_USD, "C12 total recorded cost is inside the cap");
  const modelDayCosts = costs.filter((c) => c.requestType === "model_day_text");
  ok(modelDayCosts.length === 2, "C13 both dispatches landed in the cost ledger");

  // D. Blindness: the packet carries candidates only; reveal is digest-bound.
  const packet = await adminPost({ action: "model_day_packet", slug: "mark-9" });
  ok(packet.status === 200, "D1 the judge packet is served");
  const packetText = JSON.stringify(packet.json.packet);
  // Blindness = no model ids, no role words, no label map. (The word "label"
  // alone may legitimately appear inside workup content, e.g. image labels.)
  ok(!/gpt-5\.5|gpt-5\.6|incumbent|challenger|labelMap|label_map/i.test(packetText), "D2 the packet never names a model or role — blind");
  const p = packet.json.packet as { slug: string; packetDigest: string; candidateA: Record<string, unknown>; candidateB: Record<string, unknown>; schemaVersion: string };
  ok(p.schemaVersion === MODEL_DAY_SCHEMA_VERSION && p.packetDigest === packetDigestOf("mark-9", p.candidateA, p.candidateB), "D3 the packet digest binds exactly what the judge sees");
  ok((await adminPost({ action: "model_day_reveal", slug: "mark-9", packetDigest: "a".repeat(64) })).status === 404, "D4 a reveal with the wrong digest unseals nothing");
  const reveal = await adminPost({ action: "model_day_reveal", slug: "mark-9", packetDigest: p.packetDigest });
  ok(reveal.status === 200 && (reveal.json.labelMap as Record<string, string>).A === doneRow!.label_map!.A, "D5 the digest-bound reveal returns the sealed mapping");

  // E. Duplicate delivery: the consumed claim refuses a replay, no new spend.
  const replay = await modelDayWorker(workerReq({ slug: "mark-9", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  ok(replay.status === 500 && modelCalls.length === 2 && costs.filter((c) => c.requestType === "model_day_text").length === 2, "E1 a replayed delivery dispatches nothing and spends nothing");

  // F. The structural cap gate: an expensive incumbent stops the challenger.
  modelCalls = [];
  modelBehavior = (model) =>
    model === "gpt-5.5"
      ? { content: VALID_WORKUP, inputTokens: 20_000, outputTokens: 4_000 } // ~$0.22 actual
      : { content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 };
  lastTrigger = null;
  await adminPost({ action: "model_day_create", slug: "mark-10", challengerModel: "gpt-5.6-sol", confirm: true });
  await modelDayWorker(workerReq({ slug: "mark-10", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  const capped = await readLatestModelDayRun("mark-10");
  ok(capped?.status === "failed" && /challenger NOT dispatched/.test(capped.error ?? ""), "F1 the cap gate stops the challenger when the incumbent ran hot");
  ok(modelCalls.length === 1 && modelCalls[0].model === "gpt-5.5", "F2 exactly one dispatch happened");
  ok(costs.filter((c) => c.requestType === "model_day_text").length === 3, "F3 the hot incumbent's real spend is in the ledger");
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 });

  // G. Invalid model output: spend recorded, run failed, nothing owner-facing.
  modelCalls = [];
  modelBehavior = (model) =>
    model === "gpt-5.6-sol"
      ? { content: "{\"not\":\"a workup\"}", inputTokens: 5_000, outputTokens: 100 }
      : { content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 };
  lastTrigger = null;
  await adminPost({ action: "model_day_create", slug: "mark-11", challengerModel: "gpt-5.6-sol", confirm: true });
  await modelDayWorker(workerReq({ slug: "mark-11", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  const invalid = await readLatestModelDayRun("mark-11");
  ok(invalid?.status === "failed" && /did not return a valid chapter workup/.test(invalid.error ?? ""), "G1 an invalid candidate fails the run honestly");
  ok(costs.filter((c) => c.requestType === "model_day_text").length === 5, "G2 both dispatches (including the invalid one) are in the ledger");
  ok((await adminPost({ action: "model_day_packet", slug: "mark-11" })).status === 404, "G3 a failed run serves no judge packet");
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 });

  // H. Worker-side kill switch recheck: a queued job stops with no spend.
  modelCalls = [];
  lastTrigger = null;
  await adminPost({ action: "model_day_create", slug: "luke-9", challengerModel: "gpt-5.6-sol", confirm: true });
  __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
  await modelDayWorker(workerReq({ slug: "luke-9", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  const switched = await readLatestModelDayRun("luke-9");
  ok(switched?.status === "failed" && /turned OFF before dispatch — nothing was spent/.test(switched.error ?? "") && modelCalls.length === 0, "H1 the worker's live recheck stops a queued job with no spend");

  // I. Prompt-context outage: refuse before spend (unrepresentative A/B).
  __setModelDayPromptContextForTesting(async () => {
    throw new Error("brain outage");
  });
  modelCalls = [];
  lastTrigger = null;
  await adminPost({ action: "model_day_create", slug: "luke-10", challengerModel: "gpt-5.6-sol", confirm: true });
  await modelDayWorker(workerReq({ slug: "luke-10", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  const noContext = await readLatestModelDayRun("luke-10");
  ok(noContext?.status === "failed" && /unrepresentative/.test(noContext.error ?? "") && modelCalls.length === 0, "I1 a prompt-context outage refuses before any dispatch");

  // J. Prompt hard bound: enforced pre-dispatch, never assumed.
  __setModelDayPromptContextForTesting(async () => ({
    globalRules: ["x".repeat(MODEL_DAY_PROMPT_MAX_CHARS + 10)],
    chapterNotes: [],
    examples: [],
  }));
  modelCalls = [];
  lastTrigger = null;
  await adminPost({ action: "model_day_create", slug: "luke-11", challengerModel: "gpt-5.6-sol", confirm: true });
  await modelDayWorker(workerReq({ slug: "luke-11", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
  const tooBig = await readLatestModelDayRun("luke-11");
  ok(tooBig?.status === "failed" && /exceeds the bounded maximum/.test(tooBig.error ?? "") && modelCalls.length === 0, "J1 an over-bound prompt refuses before dispatch");
  __setModelDayPromptContextForTesting(async () => ({
    globalRules: ["Accuracy over flourish; state uncertainty plainly."],
    chapterNotes: [],
    examples: [],
  }));

  // K. Failed trigger: the claim never strands as generating.
  __setTriggerTransportForTesting(async () => ({ ok: false, error: "simulated network failure" }));
  const failedTrigger = await adminPost({ action: "model_day_create", slug: "john-3", challengerModel: "gpt-5.6-sol", confirm: true });
  ok(failedTrigger.status === 502, "K1 a failed trigger reports honestly");
  const cleared = await readLatestModelDayRun("john-3");
  ok(cleared?.status === "failed" && /trigger failed/.test(cleared.error ?? ""), "K2 the claim was marked failed (nothing spent)");
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = { url: req.url, body: req.body as unknown as Record<string, unknown> };
    return { ok: true, status: 202 };
  });

  // L. Stale-claim unstick: a consumed claim past the worker lifetime records
  // its conservative possible spend before a fresh claim proceeds.
  store.rows.push({
    id: "stale-row-1",
    slug: "john-4",
    status: "running",
    job_id: "dead-job",
    incumbent_model: "gpt-5.5",
    challenger_model: "gpt-5.6-sol",
    schema_version: MODEL_DAY_SCHEMA_VERSION,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const unstuck = await claimModelDayRun("john-4", "fresh-job", "gpt-5.5", "gpt-5.6-sol");
  ok(typeof unstuck === "string", "L1 a fresh claim proceeds past the stale one");
  const staleRow = store.rows.find((r) => r.id === "stale-row-1")!;
  ok(staleRow.status === "failed" && /possible spend was recorded/.test(String(staleRow.error)), "L2 the stale CONSUMED claim failed with honest possible-spend wording");
  ok(costs.some((c) => (c.metadata as { staleRecovery?: boolean })?.staleRecovery === true && c.estimatedCostUsd === MODEL_DAY_TOTAL_CAP_USD), "L3 the conservative possible spend (the full cap) is in the ledger");

  // M. Storage outage fails closed everywhere.
  store.failReads = true;
  ok((await adminPost({ action: "model_day_status", slug: "mark-9" })).status === 503, "M1 a storage outage never reads as 'no run'");
  ok((await adminPost({ action: "model_day_create", slug: "mark-12", challengerModel: "gpt-5.6-sol", confirm: true })).status === 500, "M2 a storage outage refuses new claims");
  store.failReads = false;

  // N. Privacy claim, structurally: the whole exercise touched ONLY the fake
  // run store, the cost ledger, and the audit log. buildJudgePacket of a
  // non-done row is null (nothing to leak early).
  ok(buildJudgePacket({ ...(await readLatestModelDayRun("luke-9"))! }) === null, "N1 a failed run yields no packet");
  ok(validModelId("gpt-5.6-sol") && !validModelId("two words"), "N2 model id validation is plain");
  ok(modelDayQuote().expectedUsd < MODEL_DAY_TOTAL_CAP_USD, "N3 the shown expectation sits under the cap");

  __setModelDayStoreForTesting(null);
  __setModelDayModelForTesting(null);
  __setModelDayPromptContextForTesting(null);
  __setGenerationTestOverrides({ settings: null, captureAudit: null });
  __setCostCaptureForTesting(null);
  __setTriggerTransportForTesting(null);

  console.log(`verify:model-day OK (${checks} checks)`);
}

main().catch((e) => {
  console.error("verify:model-day CRASHED:", e);
  process.exit(1);
});
