// verify:model-day — the Model Day blind A/B acceptance test, hermetic and
// offline (printing-press plan standing ritual; Part 9 first run: GPT-5.5 vs
// GPT-5.6 Sol). Updated for the Codex #103 exact-head review corrections:
//   P1 quote binding — the server quote (exact model pair + every price
//      assumption) is digest-bound; create refuses without the echo; models
//      outside the priced allowlist refuse; the input bound is an EXACT
//      o200k token count, not a chars/token assumption.
//   P1 partial usage — either token field absent/invalid = usage missing:
//      conservative ceiling recorded, challenger never authorized.
//   P2 sealed reveal — the reveal refuses until a digest-bound verdict is
//      durably recorded; verdicts are write-once.
//
// Drives the REAL admin route and the REAL background worker through injected
// seams only — no network, no Supabase, no OpenAI. HONESTY NOTE: the real
// Supabase adapter is NOT executed here; the fake mirrors its contract.
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
  modelDayQuoteFor,
  modelDayCallCeilingUsd,
  modelDayCostUsd,
  modelDayInputTokenCount,
  validModelId,
  pricedModel,
  MODEL_DAY_PRICED_MODELS,
  MODEL_DAY_TOTAL_CAP_USD,
  MODEL_DAY_MAX_INPUT_TOKENS,
  MODEL_DAY_SCHEMA_VERSION,
  modelDayRequestBody,
  MODEL_DAY_REQUEST_EXCEPTIONS,
  ModelDayClaimError,
  type ModelDayStore,
  type ModelDayStatus,
  type ModelDayLatest,
} from "../lib/server/model-day";
import { buildChapterWorkupRequestBody } from "../lib/server/generate-chapter-workup";
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
  async conditionalUpdate(
    id: string,
    expectedStatus: ModelDayStatus,
    next: Record<string, unknown>,
    extraIsNull?: readonly string[],
  ) {
    if (this.failReads) return { error: "simulated outage" };
    const row = this.rows.find(
      (r) =>
        r.id === id &&
        r.status === expectedStatus &&
        (extraIsNull ?? []).every((col) => r[col] === undefined || r[col] === null),
    );
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
const CHALLENGER = "gpt-5.6-sol";

async function main(): Promise<void> {
  const store = new FakeModelDayStore();
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  const mdCosts = () => costs.filter((c) => c.requestType === "model_day_text");
  let lastTrigger: { url: string; body: Record<string, unknown> } | null = null;
  let modelCalls: Array<{ model: string; prompt: string }> = [];
  let modelBehavior: (model: string) => {
    content: string;
    inputTokens: number | null;
    cachedInputTokens?: number | null;
    outputTokens: number | null;
  } = () => ({
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

  // Quote + create helpers: the honest client path — quote the exact pair,
  // echo its digest.
  async function statusFor(slug: string, challengerModel = CHALLENGER) {
    return adminPost({ action: "model_day_status", slug, challengerModel });
  }
  async function createRun(slug: string, challengerModel = CHALLENGER, overrides: Record<string, unknown> = {}) {
    const s = await statusFor(slug, challengerModel);
    const digest = (s.json.quote as Record<string, unknown> | null)?.quoteDigest;
    return adminPost({
      action: "model_day_create",
      slug,
      challengerModel,
      quoteDigest: digest,
      confirm: true,
      ...overrides,
    });
  }
  async function runWorker(slug: string) {
    return modelDayWorker(
      workerReq({ slug, job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }),
    );
  }

  // A. Auth + free reads + the pair-bound quote.
  ok((await adminPost({ action: "model_day_status", slug: "mark-9" }, "wrong")).status === 401, "A1 wrong admin token refused");
  const emptyStatus = await statusFor("mark-9");
  ok(emptyStatus.status === 200 && emptyStatus.json.status === "none", "A2 no-run status reads as none");
  const quote = emptyStatus.json.quote as Record<string, unknown>;
  ok(
    quote !== null &&
      quote.totalCapUsd === MODEL_DAY_TOTAL_CAP_USD &&
      quote.incumbentModel === "gpt-5.5" &&
      quote.challengerModel === CHALLENGER &&
      typeof quote.quoteDigest === "string" &&
      quote.quoteDigest === modelDayQuoteFor("mark-9", "gpt-5.5", CHALLENGER)!.quoteDigest,
    "A3 the quote is server-computed for the EXACT pair and digest-bound",
  );
  ok(modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.5"]) < MODEL_DAY_TOTAL_CAP_USD, "A4 one bounded call always fits the cap");
  // Cache-write-aware ceilings (Codex re-review P1): 5.6 Sol's ceiling prices
  // input at its 1.25× cache-write rate, so it exceeds 5.5's.
  ok(
    modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.6-sol"]) > modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.5"]),
    "A4b the challenger ceiling prices cache-write input, not plain input",
  );
  ok((await adminPost({ action: "model_day_status", slug: "not a slug!" })).status === 400, "A5 unparseable slug refused");
  const unpricedQuote = await statusFor("mark-9", "gpt-4o");
  ok(unpricedQuote.json.quote === null && /priced allowlist/.test(String(unpricedQuote.json.quoteError)), "A6 an unpriced model cannot be quoted");
  ok(modelDayQuoteFor("mark-9", "gpt-5.5", "made-up-model") === null && pricedModel("made-up-model") === null, "A7 quoteFor refuses unpriced pairs");

  // B. Create-side gates.
  ok((await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: CHALLENGER, confirm: true })).status === 400, "B1 create without the echoed quote digest refused");
  ok((await createRun("mark-9", CHALLENGER, { confirm: undefined })).status === 400, "B2 missing confirmation refused");
  ok((await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "not a model!!", quoteDigest: "a".repeat(64), confirm: true })).status === 400, "B3 invalid challenger id refused");
  const unpricedCreate = await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: "gpt-4o", quoteDigest: "a".repeat(64), confirm: true });
  ok(unpricedCreate.status === 403 && /priced allowlist/.test(String(unpricedCreate.json.error)), "B4 an unpriced/unsupported model refuses at create");
  const staleDigest = await adminPost({ action: "model_day_create", slug: "mark-9", challengerModel: CHALLENGER, quoteDigest: "b".repeat(64), confirm: true });
  ok(staleDigest.status === 403 && /re-quote/.test(String(staleDigest.json.error)), "B5 a wrong/stale quote digest refuses — confirm binds the shown numbers");
  // Incumbent changed AFTER the quote: quote under gpt-5.5, flip settings to
  // the other priced model, then confirm with the old digest.
  const oldPairQuote = await statusFor("mark-9");
  __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, selected_text_model: "gpt-5.6-sol" }, captureAudit: audit });
  const flipped = await adminPost({
    action: "model_day_create",
    slug: "mark-9",
    challengerModel: "gpt-5.5", // differs from the NEW incumbent, so only the digest can catch the change
    quoteDigest: (oldPairQuote.json.quote as Record<string, unknown>).quoteDigest,
    confirm: true,
  });
  ok(flipped.status === 403 && /re-quote/.test(String(flipped.json.error)), "B6 an incumbent changed after the quote stales the digest — refused");
  __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
  ok((await createRun("mark-9")).status === 403, "B7 Text Generation OFF refuses Model Day spends");
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  await (async () => {
    try {
      await claimModelDayRun("mark-9", "job-x", "gpt-5.5", "gpt-5.5", modelDayQuoteFor("mark-9", "gpt-5.5", "gpt-5.5") ? "" : "c".repeat(64));
      ok(false, "B8 an A/A claim must throw");
    } catch (e) {
      ok(e instanceof ModelDayClaimError && e.code === "REFUSED", "B8 an A/A run (challenger == incumbent) is refused");
    }
  })();
  ok(store.rows.length === 0 && modelCalls.length === 0 && mdCosts().length === 0, "B9 every refused create left storage, models, and the ledger untouched");

  // C. Happy path: quote → create → claim row → authenticated worker → done.
  const created = await createRun("mark-9");
  ok(created.status === 200 && created.json.ok === true, "C1 confirmed create (with the echoed digest) starts a run");
  ok(lastTrigger !== null && String(lastTrigger!.url).includes("model-day-background"), "C2 the dedicated worker was triggered");
  const claimRow = store.rows[0];
  ok(claimRow.status === "generating" && claimRow.incumbent_model === "gpt-5.5" && claimRow.challenger_model === CHALLENGER, "C3 the claim row pins both models (incumbent from Studio settings)");
  const badToken = await modelDayWorker(workerReq({ slug: "mark-9", job: String(lastTrigger!.body.job), token: "tampered" }));
  ok(badToken.status === 401 && modelCalls.length === 0, "C4 a tampered worker token dispatches nothing");
  ok((await modelDayWorker(workerReq({}, "GET"))).status === 405, "C5 the worker refuses non-POST");
  const done = await runWorker("mark-9");
  ok(done.status === 200, "C6 the authenticated worker completes");
  ok(modelCalls.length === 2 && modelCalls[0].model === "gpt-5.5" && modelCalls[1].model === CHALLENGER, "C7 incumbent dispatches first, challenger second, one request each");
  ok(modelCalls[0].prompt === modelCalls[1].prompt, "C8 both models receive the IDENTICAL prompt");
  ok(/Accuracy over flourish/.test(modelCalls[0].prompt) && /verse 30/.test(modelCalls[0].prompt), "C9 the prompt carries the production rules + chapter notes (representative A/B)");
  const doneRow = await readLatestModelDayRun("mark-9");
  ok(doneRow?.status === "done" && doneRow.candidate_a_json !== null && doneRow.candidate_b_json !== null, "C10 the run stored both candidates");
  ok(doneRow!.label_map !== null && [doneRow!.label_map!.A, doneRow!.label_map!.B].sort().join(",") === `gpt-5.5,${CHALLENGER}`, "C11 the sealed label map covers exactly both models");
  ok(typeof doneRow!.cost_usd === "number" && doneRow!.cost_usd! <= MODEL_DAY_TOTAL_CAP_USD, "C12 total recorded cost is inside the cap");
  ok(mdCosts().length === 2, "C13 both dispatches landed in the cost ledger");

  // D. Blindness: packet is blind; reveal is verdict-gated and digest-bound.
  const packet = await adminPost({ action: "model_day_packet", slug: "mark-9" });
  ok(packet.status === 200, "D1 the judge packet is served");
  const packetText = JSON.stringify(packet.json.packet);
  ok(!/gpt-5\.5|gpt-5\.6|incumbent|challenger|labelMap|label_map|verdict/i.test(packetText), "D2 the packet never names a model, role, or verdict — blind");
  const p = packet.json.packet as { slug: string; packetDigest: string; candidateA: Record<string, unknown>; candidateB: Record<string, unknown>; schemaVersion: string };
  ok(p.schemaVersion === MODEL_DAY_SCHEMA_VERSION && p.packetDigest === packetDigestOf("mark-9", p.candidateA, p.candidateB), "D3 the packet digest binds exactly what the judge sees");
  const earlyReveal = await adminPost({ action: "model_day_reveal", slug: "mark-9", packetDigest: p.packetDigest });
  ok(earlyReveal.status === 403 && /verdict is not recorded/.test(String(earlyReveal.json.error)), "D4 the reveal REFUSES before a verdict exists — storage-enforced blindness");
  ok((await adminPost({ action: "model_day_verdict", slug: "mark-9", packetDigest: "a".repeat(64), verdict: "A" })).status === 404, "D5 a verdict with the wrong digest lands nowhere");
  ok((await adminPost({ action: "model_day_verdict", slug: "mark-9", packetDigest: p.packetDigest, verdict: "C" })).status === 400, "D6 an invalid verdict value refuses");
  const verdictOk = await adminPost({ action: "model_day_verdict", slug: "mark-9", packetDigest: p.packetDigest, verdict: "B", note: "blind ruling from the judge" });
  ok(verdictOk.status === 200, "D7 the digest-bound verdict records");
  ok((await adminPost({ action: "model_day_verdict", slug: "mark-9", packetDigest: p.packetDigest, verdict: "A" })).status === 409, "D8 verdicts are write-once — a second verdict refuses");
  ok((await adminPost({ action: "model_day_reveal", slug: "mark-9", packetDigest: "a".repeat(64) })).status === 404, "D9 a reveal with the wrong digest unseals nothing");
  const reveal = await adminPost({ action: "model_day_reveal", slug: "mark-9", packetDigest: p.packetDigest });
  ok(reveal.status === 200 && (reveal.json.labelMap as Record<string, string>).A === doneRow!.label_map!.A && reveal.json.verdict === "B", "D10 after the verdict, the digest-bound reveal returns the sealed mapping");
  ok((await statusFor("mark-9")).json.verdictRecorded === true, "D11 status reports the verdict as recorded (still no mapping)");

  // E. Duplicate delivery: the consumed claim refuses a replay, no new spend.
  const replay = await runWorker("mark-9");
  ok(replay.status === 500 && modelCalls.length === 2 && mdCosts().length === 2, "E1 a replayed delivery dispatches nothing and spends nothing");

  // F. Concurrent dispatch under ONE shared deadline (Codex #103 correction 1).
  // The cap is guaranteed STRUCTURALLY by full two-call pre-reservation before
  // any dispatch — there is no mid-run recheck because both calls run together.
  ok(
    modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.5"]) + modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.6-sol"]) <= MODEL_DAY_TOTAL_CAP_USD,
    "F0 both calls' full worst case fits the cap BEFORE any dispatch (structural pre-reservation)",
  );
  modelCalls = [];
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 });
  const costsBeforeF = mdCosts().length;
  lastTrigger = null;
  await createRun("mark-10");
  await runWorker("mark-10");
  const bothRan = await readLatestModelDayRun("mark-10");
  ok(bothRan?.status === "done", "F1 concurrent dispatch: the run completes with both candidates settled");
  ok(modelCalls.length === 2 && new Set(modelCalls.map((c) => c.model)).size === 2, "F2 both models dispatched concurrently — exactly one call each");
  ok(mdCosts().length - costsBeforeF === 2, "F3 both candidates' spend is durably recorded before the run turns terminal");

  // F4/F5/F6 — usage missing OR PARTIAL fails the gate closed (Codex #103
  // P1): each variant records the conservative ceiling and never authorizes
  // the challenger.
  for (const [i, variant] of (
    [
      { name: "fully missing", inputTokens: null, outputTokens: null },
      { name: "prompt count missing", inputTokens: null, outputTokens: 1_000 },
      { name: "completion count missing", inputTokens: 5_000, outputTokens: null },
    ] as const
  ).entries()) {
    modelCalls = [];
    const before = mdCosts().length;
    modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: variant.inputTokens, outputTokens: variant.outputTokens });
    lastTrigger = null;
    const slug = `mark-1${3 + i}`;
    await createRun(slug);
    await runWorker(slug);
    const row = await readLatestModelDayRun(slug);
    ok(
      row?.status === "failed" && /absent or partial usage|failing closed/.test(row.error ?? "") && modelCalls.length === 2,
      `F${4 + i} usage ${variant.name} fails closed (both dispatched concurrently, no judgeable A/B)`,
    );
    const recorded = mdCosts().slice(before);
    const ceilings: Record<string, number> = {
      "gpt-5.5": modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.5"]),
      "gpt-5.6-sol": modelDayCallCeilingUsd(MODEL_DAY_PRICED_MODELS["gpt-5.6-sol"]),
    };
    ok(
      recorded.length === 2 &&
        recorded.every(
          (r) =>
            r.estimatedCostUsd === ceilings[String(r.model)] &&
            (r.metadata as { billingUncertain?: boolean })?.billingUncertain === true,
        ),
      `F${4 + i}b both usage-missing calls record their conservative ceiling, never zero`,
    );
  }
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 });

  // G. Invalid model output: spend recorded, run failed, no packet.
  modelCalls = [];
  const beforeG = mdCosts().length;
  modelBehavior = (model) =>
    model === CHALLENGER
      ? { content: "{\"not\":\"a workup\"}", inputTokens: 5_000, outputTokens: 100 }
      : { content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 };
  lastTrigger = null;
  await createRun("mark-16");
  await runWorker("mark-16");
  const invalid = await readLatestModelDayRun("mark-16");
  ok(invalid?.status === "failed" && /did not return a valid chapter workup/.test(invalid.error ?? ""), "G1 an invalid candidate fails the run honestly");
  ok(mdCosts().length === beforeG + 2, "G2 both dispatches (including the invalid one) are in the ledger");
  ok((await adminPost({ action: "model_day_packet", slug: "mark-16" })).status === 404, "G3 a failed run serves no judge packet");
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 });

  // H. Worker-side kill switch recheck.
  modelCalls = [];
  lastTrigger = null;
  await createRun("luke-9");
  __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
  await runWorker("luke-9");
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  const switched = await readLatestModelDayRun("luke-9");
  ok(switched?.status === "failed" && /turned OFF before dispatch — nothing was spent/.test(switched.error ?? "") && modelCalls.length === 0, "H1 the worker's live recheck stops a queued job with no spend");

  // I. Prompt-context outage: refuse before spend.
  __setModelDayPromptContextForTesting(async () => {
    throw new Error("brain outage");
  });
  modelCalls = [];
  lastTrigger = null;
  await createRun("luke-10");
  await runWorker("luke-10");
  const noContext = await readLatestModelDayRun("luke-10");
  ok(noContext?.status === "failed" && /unrepresentative/.test(noContext.error ?? "") && modelCalls.length === 0, "I1 a prompt-context outage refuses before any dispatch");

  // J. The input bound is a COUNTED token bound, not a chars assumption: a
  // token-dense prompt (CJK ≈ 1+ token/char) under the coarse char limit
  // still refuses BEFORE dispatch.
  __setModelDayPromptContextForTesting(async () => ({
    globalRules: ["道".repeat(30_000)], // 30k chars ≪ 60k char limit; ≫ 12k o200k tokens
    chapterNotes: [],
    examples: [],
  }));
  modelCalls = [];
  lastTrigger = null;
  await createRun("luke-11");
  await runWorker("luke-11");
  const dense = await readLatestModelDayRun("luke-11");
  ok(dense?.status === "failed" && /o200k tokens, over the enforced/.test(dense.error ?? "") && modelCalls.length === 0, "J1 a token-dense prompt is refused by the COUNTED bound before dispatch");
  ok(modelDayInputTokenCount("道".repeat(30_000)) > MODEL_DAY_MAX_INPUT_TOKENS, "J2 the counter itself proves the density (sanity)");
  __setModelDayPromptContextForTesting(async () => ({
    globalRules: ["Accuracy over flourish; state uncertainty plainly."],
    chapterNotes: [],
    examples: [],
  }));

  // K. Failed trigger: the claim never strands as generating.
  __setTriggerTransportForTesting(async () => ({ ok: false, error: "simulated network failure" }));
  const failedTrigger = await createRun("john-3");
  ok(failedTrigger.status === 502, "K1 a failed trigger reports honestly");
  const cleared = await readLatestModelDayRun("john-3");
  ok(cleared?.status === "failed" && /trigger failed/.test(cleared.error ?? ""), "K2 the claim was marked failed (nothing spent)");
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = { url: req.url, body: req.body as unknown as Record<string, unknown> };
    return { ok: true, status: 202 };
  });

  // L. Stale-claim unstick records conservative possible spend first.
  store.rows.push({
    id: "stale-row-1",
    slug: "john-4",
    status: "running",
    job_id: "dead-job",
    incumbent_model: "gpt-5.5",
    challenger_model: CHALLENGER,
    schema_version: MODEL_DAY_SCHEMA_VERSION,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const unstuck = await claimModelDayRun("john-4", "fresh-job", "gpt-5.5", CHALLENGER, modelDayQuoteFor("john-4", "gpt-5.5", CHALLENGER)!.quoteDigest);
  ok(typeof unstuck === "string", "L1 a fresh claim proceeds past the stale one");
  const staleRow = store.rows.find((r) => r.id === "stale-row-1")!;
  ok(staleRow.status === "failed" && /possible spend was recorded/.test(String(staleRow.error)), "L2 the stale CONSUMED claim failed with honest possible-spend wording");
  ok(costs.some((c) => (c.metadata as { staleRecovery?: boolean })?.staleRecovery === true && c.estimatedCostUsd === MODEL_DAY_TOTAL_CAP_USD), "L3 the conservative possible spend (the full cap) is in the ledger");

  // M. Storage outage fails closed everywhere.
  store.failReads = true;
  ok((await statusFor("mark-9")).status === 503, "M1 a storage outage never reads as 'no run'");
  ok((await adminPost({ action: "model_day_create", slug: "mark-12", challengerModel: CHALLENGER, quoteDigest: modelDayQuoteFor("mark-12", "gpt-5.5", CHALLENGER)!.quoteDigest, confirm: true })).status === 500, "M2 a storage outage refuses new claims");
  store.failReads = false;

  // O. Run identity (Codex re-review P1).
  // O1/O2 — one UNRESOLVED run per chapter: a completed run without a verdict
  // blocks a new paid run; recording the verdict unblocks.
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, cachedInputTokens: 4_000, outputTokens: 1_000 });
  lastTrigger = null;
  await createRun("mark-2");
  await runWorker("mark-2");
  const unjudged = await readLatestModelDayRun("mark-2");
  ok(unjudged?.status === "done" && unjudged.verdict === null, "O0 a completed run starts unjudged");
  const blocked = await createRun("mark-2");
  ok(blocked.status === 403 && /no recorded verdict/.test(String(blocked.json.error)), "O1 a new run is refused while the latest completed run is unjudged");
  await adminPost({ action: "model_day_verdict", slug: "mark-2", packetDigest: unjudged!.packet_digest!, verdict: "tie" });
  const unblocked = await createRun("mark-2");
  ok(unblocked.status === 200, "O2 recording the verdict unblocks the next run");
  // O3 — cached input priced at the cached rate (bucket pricing): the mark-2
  // run's incumbent cost must equal the bucket formula, well under the
  // all-uncached price.
  const rates55 = MODEL_DAY_PRICED_MODELS["gpt-5.5"];
  const bucketCost = modelDayCostUsd(rates55, 5_000, 4_000, 1_000);
  const flatCost = modelDayCostUsd(rates55, 5_000, 0, 1_000);
  const mark2Incumbent = mdCosts().find((c) => (c.metadata as { slug?: string })?.slug === "mark-2" && c.model === "gpt-5.5");
  ok(mark2Incumbent?.estimatedCostUsd === bucketCost && bucketCost < flatCost, "O3 cached input tokens bill at the cached rate, never the full rate");
  ok(mark2Incumbent?.cachedInputTokens === 4_000, "O3b the cached bucket is recorded in the ledger row");
  // O4 — pricing drift between claim and worker refuses BEFORE dispatch: the
  // stored snapshot no longer matching the live table means the confirmed
  // numbers are no longer true.
  modelCalls = [];
  lastTrigger = null;
  await createRun("mark-3");
  const driftRow = store.rows.find((r) => r.slug === "mark-3" && r.status === "generating")!;
  (driftRow.pricing_json as { ratesUsdPerM: { challenger: { inputUsdPerM: number } } }).ratesUsdPerM.challenger.inputUsdPerM = 4;
  await runWorker("mark-3");
  const drifted = await readLatestModelDayRun("mark-3");
  ok(
    drifted?.status === "failed" && /snapshot does not match current pricing/.test(drifted.error ?? "") && modelCalls.length === 0,
    "O4 a drifted pricing snapshot refuses before any dispatch",
  );
  // O5 — the claim persists the accepted quote digest + snapshot.
  const mark2Row = store.rows.find((r) => r.slug === "mark-2" && r.status === "generating");
  ok(
    typeof mark2Row?.quote_digest === "string" && mark2Row.pricing_json !== undefined,
    "O5 the claim row carries the accepted quote digest and pricing snapshot",
  );
  modelBehavior = () => ({ content: VALID_WORKUP, inputTokens: 5_000, outputTokens: 1_000 });

  // N. Sanity of the exported guards.
  ok(buildJudgePacket({ ...(await readLatestModelDayRun("luke-9"))! }) === null, "N1 a failed run yields no packet");
  ok(validModelId(CHALLENGER) && !validModelId("two words"), "N2 model id validation is plain");
  ok(modelDayQuoteFor("mark-9", "gpt-5.5", CHALLENGER)!.expectedUsd < MODEL_DAY_TOTAL_CAP_USD, "N3 the shown expectation sits under the cap");

  __setModelDayStoreForTesting(null);
  __setModelDayModelForTesting(null);
  __setModelDayPromptContextForTesting(null);
  __setGenerationTestOverrides({ settings: null, captureAudit: null });
  __setCostCaptureForTesting(null);
  __setTriggerTransportForTesting(null);

  // ===== Codex #103 correction 2: byte-equality regression =====
  // Model Day's request is byte-for-byte the production chapter-writing request
  // (same shared builder) EXCEPT the model id and the two declared spend-safety
  // exceptions. Proven directly on the pure builders so they can never drift.
  {
    const prompt = "SHARED PROMPT BODY — identical inputs must yield identical requests.";
    const prod = buildChapterWorkupRequestBody({ model: "gpt-5.5", prompt });
    const md = modelDayRequestBody({ model: "gpt-5.5", prompt });
    const { service_tier, prompt_cache_options, ...mdBase } = md as Record<string, unknown>;
    ok(JSON.stringify(mdBase) === JSON.stringify(prod), "BE1 Model Day request base equals the production request byte-for-byte");
    ok(service_tier === "default", "BE2 service_tier pinned to default");
    ok(JSON.stringify(prompt_cache_options) === JSON.stringify({ mode: "explicit" }), "BE3 prompt_cache_options is explicit mode");
    ok(JSON.stringify(MODEL_DAY_REQUEST_EXCEPTIONS) === JSON.stringify({ service_tier: "default", prompt_cache_options: { mode: "explicit" } }), "BE4 declared exceptions are exactly the two spend-safety fields");
    // Two candidate models differ in NOTHING but the model id.
    const a = modelDayRequestBody({ model: "gpt-5.5", prompt });
    const b = modelDayRequestBody({ model: CHALLENGER, prompt });
    ok(a.model === "gpt-5.5" && b.model === CHALLENGER, "BE5 each request carries its own model id");
    ok(JSON.stringify({ ...a, model: "X" }) === JSON.stringify({ ...b, model: "X" }), "BE6 the two requests are byte-equal except the model id");
  }

  console.log(`verify:model-day OK (${checks} checks)`);
}

main().catch((e) => {
  console.error("verify:model-day CRASHED:", e);
  process.exit(1);
});
