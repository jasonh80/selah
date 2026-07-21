// SERVER-ONLY. Model Day (printing-press plan, standing monthly ritual):
// a PRIVATE A/B — the same chapter's workup prompt run against the incumbent
// text model and one challenger, judged BLIND by Codex against the Voice
// brief and the owner's workup. First run: GPT-5.5 vs GPT-5.6 Sol (Part 9).
//
// WHAT THIS LANE CAN NEVER DO (the whole point): it never writes
// chapter_workups or chapter_workup_versions, never publishes, never changes
// the selected models, never touches images. Upgrades are a decision, never a
// drift: the winner is selected deliberately in Studio by the owner,
// afterwards, through the existing settings action.
//
// Storage is the dedicated immutable table model_day_runs (see
// supabase/model-day-runs.sql — owner runs the DDL once; until then this
// lane fails closed). The single-use claim IS a row insert (status
// 'generating', one live run per slug via partial unique index), atomically
// CONSUMED by the worker (generating→running) BEFORE any model dispatch —
// exactly the prepare-proposals discipline.
//
// SPEND DISCIPLINE (owner cap: under $0.30 total, structurally enforced):
// each call is hard-bounded (prompt char bound pre-dispatch + completion
// token cap), the incumbent runs FIRST, and the challenger dispatches ONLY if
// the incumbent's recorded actual cost plus the challenger's conservative
// ceiling still fits inside MODEL_DAY_TOTAL_CAP_USD. One request per model,
// maxRetries 0, every outcome durably in the cost ledger (IQ-006 standard).
//
// BLIND SEAL: the two outputs are stored as candidates A/B by coin flip;
// label_map (which letter is which model) lives only in the row and is
// EXCLUDED from the judge packet. Reveal is a separate explicit action.
import { getSupabaseAdmin } from "./supabase";
import { getOpenAI, CHAPTER_WORKUP_TEXT_MODEL } from "./openai";
import { buildChapterWorkupPrompt } from "../ai/prompts/chapter-workup-prompt";
import { parseChapterWorkupJson } from "../ai/schemas/chapter-workup-schema";
import { estimateChapterWorkupCost } from "../ai/costs";
import { sha256Canonical } from "./generation-manifest";
import { recordCostEventStrict } from "./cost-events-repository";
import { logGenerationAudit, getGenerationSettings } from "./generation-settings";
import { selectRulesForGeneration, getChapterReviewNoteTexts } from "./selah-brain";
import { getRelevantExamples, TEXT_EXAMPLE_TYPES } from "./selah-examples";
import { parseSlug } from "./generate-chapter-workup";

const TABLE = "model_day_runs";
export const MODEL_DAY_SCHEMA_VERSION = "model-day.v1";

// Past the 20-min job-token TTL + the worker's model budget + margin: no live
// worker can still exist for a claim this old (two sequential 8-min calls).
const STALE_CLAIM_MS = 45 * 60 * 1000;

// ---------------------------------------------------------------------------
// Bounded spend. The owner's Model Day budget is a TOTAL cap; both calls are
// hard-bounded so the recorded ledger can never exceed it.
// ---------------------------------------------------------------------------
export const MODEL_DAY_TOTAL_CAP_USD = 0.3;
// The chapter-workup prompt carries no ESV text (schema + rules + examples),
// so real prompts sit far below this; the bound exists to make the disclosed
// per-call ceiling enforced, never assumed (same ~4 chars/token stated
// assumption as the Prepare lane — an estimate, not a tokenizer).
export const MODEL_DAY_PROMPT_MAX_CHARS = 40_000;
const MODEL_DAY_INPUT_TOKEN_CEILING = Math.ceil(MODEL_DAY_PROMPT_MAX_CHARS / 4);
// Launch-quality Mark text runs observe ~3k completion tokens (~$0.11 total,
// Mark 7 cross-check in lib/ai/costs.ts); 4000 caps the worst case while
// leaving headroom. A truncated output fails schema validation and the run
// fails honestly — spend recorded, nothing owner-facing.
export const MODEL_DAY_MAX_COMPLETION_TOKENS = 4_000;

/** Conservative per-call ceiling (both models bill the same published rates —
 * challenger pricing equality is a stated premise from the pricing research,
 * estimated at the incumbent's rates like every estimate in costs.ts). */
export function modelDayCallCeilingUsd(): number {
  const est = estimateChapterWorkupCost({
    inputTokens: MODEL_DAY_INPUT_TOKEN_CEILING,
    cachedInputTokens: 0,
    outputTokens: MODEL_DAY_MAX_COMPLETION_TOKENS,
  });
  return Math.ceil(est.textEstimateUsd * 100) / 100;
}

/** What Studio shows before the confirm: expected (two observed-typical
 * runs) and the structural total cap. */
export function modelDayQuote(): { expectedUsd: number; perCallCeilingUsd: number; totalCapUsd: number } {
  return {
    expectedUsd: 0.22, // 2 × the observed ~$0.11 Mark text run (costs.ts cross-check)
    perCallCeilingUsd: modelDayCallCeilingUsd(),
    totalCapUsd: MODEL_DAY_TOTAL_CAP_USD,
  };
}

// Model ids are provider identifiers, not prose: short, plain, one token.
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
export function validModelId(value: unknown): value is string {
  return typeof value === "string" && MODEL_ID.test(value);
}

// ---------------------------------------------------------------------------
// Store port + test seam (mirrors PrepareProposalStore).
// ---------------------------------------------------------------------------
export type ModelDayStatus = "generating" | "running" | "done" | "failed";

export type ModelDayLatest =
  | { kind: "row"; row: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export interface ModelDayStore {
  latest(slug: string): Promise<ModelDayLatest>;
  insert(row: Record<string, unknown>): Promise<"ok" | "conflict" | { error: string }>;
  conditionalUpdate(
    id: string,
    expectedStatus: ModelDayStatus,
    next: Record<string, unknown>,
  ): Promise<number | { error: string }>;
}

let storeForTesting: ModelDayStore | null = null;
export function __setModelDayStoreForTesting(store: ModelDayStore | null): void {
  storeForTesting = store;
}

function productionStore(): ModelDayStore | null {
  if (storeForTesting) return storeForTesting;
  const db = getSupabaseAdmin();
  if (!db) return null;
  return {
    async latest(slug: string): Promise<ModelDayLatest> {
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error(`[selah] model day read failed (${slug})`);
        return { kind: "error", message: error.message };
      }
      return data ? { kind: "row", row: data as Record<string, unknown> } : { kind: "missing" };
    },
    async insert(row: Record<string, unknown>) {
      const { error } = await db.from(TABLE).insert(row);
      if (!error) return "ok";
      if (String(error.code) === "23505") return "conflict";
      console.error(`[selah] model day insert failed (${String(row.slug)})`);
      return { error: error.message };
    },
    async conditionalUpdate(id, expectedStatus, next) {
      const { data, error } = await db
        .from(TABLE)
        .update(next)
        .eq("id", id)
        .eq("status", expectedStatus)
        .select("id");
      if (error) {
        console.error(`[selah] model day update failed (${id})`);
        return { error: error.message };
      }
      return (data ?? []).length;
    },
  };
}

// ---------------------------------------------------------------------------
// Row reading, strictly validated (fail-closed).
// ---------------------------------------------------------------------------
function rowStatus(raw: Record<string, unknown>): ModelDayStatus | null {
  const s = raw.status;
  return s === "generating" || s === "running" || s === "done" || s === "failed" ? s : null;
}

export interface ModelDayRow {
  id: string;
  slug: string;
  status: ModelDayStatus;
  job_id: string;
  incumbent_model: string;
  challenger_model: string;
  candidate_a_json: Record<string, unknown> | null;
  candidate_b_json: Record<string, unknown> | null;
  label_map: Record<string, string> | null;
  packet_digest: string | null;
  error: string | null;
  cost_usd: number | null;
  created_at: string;
}

export class ModelDayStoreError extends Error {}

/** Latest run row, strictly validated. Returns null ONLY for a genuinely
 * missing row; a database error THROWS (an outage never reads as "no run"). */
export async function readLatestModelDayRun(slug: string): Promise<ModelDayRow | null> {
  const store = productionStore();
  if (!store) return null;
  const latest = await store.latest(slug);
  if (latest.kind === "error") {
    throw new ModelDayStoreError(`model day storage read failed: ${latest.message}`);
  }
  if (latest.kind === "missing") return null;
  const raw = latest.row;
  const status = rowStatus(raw);
  if (
    !status ||
    raw.slug !== slug ||
    typeof raw.id !== "string" ||
    typeof raw.job_id !== "string" ||
    !validModelId(raw.incumbent_model) ||
    !validModelId(raw.challenger_model)
  ) {
    return null;
  }
  const objOrNull = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  let labelMap: Record<string, string> | null = null;
  const rawMap = objOrNull(raw.label_map);
  if (rawMap && validModelId(rawMap.A) && validModelId(rawMap.B)) {
    labelMap = { A: String(rawMap.A), B: String(rawMap.B) };
  }
  if (status === "done") {
    // A done row must be complete and internally consistent or it is no run.
    const a = objOrNull(raw.candidate_a_json);
    const b = objOrNull(raw.candidate_b_json);
    if (!a || !b || !labelMap) return null;
    const models = [labelMap.A, labelMap.B].sort();
    const expected = [String(raw.incumbent_model), String(raw.challenger_model)].sort();
    if (models[0] !== expected[0] || models[1] !== expected[1]) return null;
    const digest = typeof raw.packet_digest === "string" ? raw.packet_digest : "";
    if (digest !== packetDigestOf(slug, a, b)) return null;
  }
  return {
    id: raw.id,
    slug,
    status,
    job_id: raw.job_id,
    incumbent_model: String(raw.incumbent_model),
    challenger_model: String(raw.challenger_model),
    candidate_a_json: objOrNull(raw.candidate_a_json),
    candidate_b_json: objOrNull(raw.candidate_b_json),
    label_map: labelMap,
    packet_digest: typeof raw.packet_digest === "string" ? raw.packet_digest : null,
    error: typeof raw.error === "string" ? raw.error : null,
    cost_usd: typeof raw.cost_usd === "number" ? raw.cost_usd : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
  };
}

export function packetDigestOf(
  slug: string,
  candidateA: Record<string, unknown>,
  candidateB: Record<string, unknown>,
): string {
  return sha256Canonical({ schemaVersion: MODEL_DAY_SCHEMA_VERSION, slug, candidateA, candidateB });
}

/** The BLIND judge packet: candidates only, no model names, no label map.
 * Null unless the latest run is done and intact. */
export function buildJudgePacket(row: ModelDayRow): {
  schemaVersion: string;
  slug: string;
  packetDigest: string;
  candidateA: Record<string, unknown>;
  candidateB: Record<string, unknown>;
} | null {
  if (row.status !== "done" || !row.candidate_a_json || !row.candidate_b_json || !row.packet_digest) {
    return null;
  }
  return {
    schemaVersion: MODEL_DAY_SCHEMA_VERSION,
    slug: row.slug,
    packetDigest: row.packet_digest,
    candidateA: row.candidate_a_json,
    candidateB: row.candidate_b_json,
  };
}

// ---------------------------------------------------------------------------
// Claim (insert-as-claim) + worker run.
// ---------------------------------------------------------------------------
export class ModelDayClaimError extends Error {
  constructor(
    public readonly code: "CONFLICT" | "WRITE_FAILED" | "REFUSED",
    message: string,
  ) {
    super(message);
  }
}

export async function claimModelDayRun(
  slug: string,
  jobId: string,
  incumbentModel: string,
  challengerModel: string,
): Promise<string> {
  if (!parseSlug(slug)) throw new ModelDayClaimError("REFUSED", "not a recognizable chapter slug");
  if (!validModelId(incumbentModel) || !validModelId(challengerModel)) {
    throw new ModelDayClaimError("REFUSED", "model ids must be plain provider identifiers");
  }
  if (incumbentModel === challengerModel) {
    throw new ModelDayClaimError("REFUSED", "the challenger must differ from the incumbent — an A/A run spends twice for nothing");
  }
  const store = productionStore();
  if (!store) throw new ModelDayClaimError("WRITE_FAILED", "model day storage is not available (fail-closed)");
  const latest = await store.latest(slug);
  if (latest.kind === "error") {
    throw new ModelDayClaimError("WRITE_FAILED", "model day storage could not be read — refusing to claim blind (fail-closed)");
  }
  const raw = latest.kind === "row" ? latest.row : null;
  const rawStatusValue = raw ? rowStatus(raw) : null;
  if (raw && (rawStatusValue === "generating" || rawStatusValue === "running")) {
    // Stale-claim unstick, prepare-proposals discipline: a hard-died worker
    // may strand its claim. Past the worker's maximum lifetime the row may be
    // conditionally failed; a consumed ('running') claim first records its
    // conservative possible spend — refusing entirely if that durable row
    // cannot be written (a ledgerless paid run is never silently unlocked).
    const createdAt = typeof raw.created_at === "string" ? Date.parse(raw.created_at) : NaN;
    const stale = Number.isNaN(createdAt) ? false : Date.now() - createdAt > STALE_CLAIM_MS;
    if (!stale) {
      throw new ModelDayClaimError("CONFLICT", "a Model Day run is already live for this chapter");
    }
    if (rawStatusValue === "running") {
      try {
        await recordCostEventStrict({
          requestType: "model_day_text",
          provider: "openai",
          model: String(raw.incumbent_model ?? CHAPTER_WORKUP_TEXT_MODEL),
          estimatedCostUsd: MODEL_DAY_TOTAL_CAP_USD,
          metadata: {
            slug,
            jobId: String(raw.job_id ?? ""),
            failed: true,
            billingUncertain: true,
            staleRecovery: true,
            note: "worker died after consuming the Model Day claim; the run's total cap is recorded as conservative possible spend (may duplicate rows the worker logged before dying)",
          },
        });
      } catch {
        throw new ModelDayClaimError(
          "WRITE_FAILED",
          "the stale run's possible spend could not be durably recorded — refusing to unlock a possibly-paid claim (fail-closed)",
        );
      }
    }
    const cleared = await store.conditionalUpdate(String(raw.id), rawStatusValue, {
      status: "failed",
      error:
        rawStatusValue === "running"
          ? "stale consumed claim cleared after its worker's maximum lifetime; its conservative possible spend was recorded just now (billingUncertain)"
          : "stale queued claim cleared after its worker's maximum lifetime; the claim was never consumed, so nothing was dispatched",
    });
    if (typeof cleared !== "number" || cleared !== 1) {
      throw new ModelDayClaimError("CONFLICT", "the previous Model Day run finished just now — check its result first");
    }
  }
  const id = crypto.randomUUID();
  const inserted = await store.insert({
    id,
    slug,
    status: "generating",
    job_id: jobId,
    incumbent_model: incumbentModel,
    challenger_model: challengerModel,
    schema_version: MODEL_DAY_SCHEMA_VERSION,
  });
  if (inserted === "conflict") {
    throw new ModelDayClaimError("CONFLICT", "a Model Day run is already live for this chapter");
  }
  if (inserted !== "ok") {
    throw new ModelDayClaimError("WRITE_FAILED", "the Model Day claim could not be recorded (fail-closed)");
  }
  return id;
}

/** Clear a claimed run after a FAILED TRIGGER (the worker was provably never
 * invoked). Conditional on the exact job id still holding the claim. */
export async function failClaimedModelDayRun(slug: string, jobId: string, reason: string): Promise<boolean> {
  const store = productionStore();
  if (!store) return false;
  const latest = await store.latest(slug);
  if (latest.kind !== "row") return false;
  const raw = latest.row;
  if (raw.job_id !== jobId || rowStatus(raw) !== "generating" || typeof raw.id !== "string") return false;
  const moved = await store.conditionalUpdate(raw.id, "generating", {
    status: "failed",
    error: reason.slice(0, 300),
  });
  return typeof moved === "number" && moved === 1;
}

// ---------------------------------------------------------------------------
// Model call seam + the worker body.
// ---------------------------------------------------------------------------
type ModelDayModelCall = (input: {
  model: string;
  prompt: string;
}) => Promise<{ content: string; inputTokens: number; outputTokens: number | null }>;
let modelCallForTesting: ModelDayModelCall | null = null;
export function __setModelDayModelForTesting(fn: ModelDayModelCall | null): void {
  modelCallForTesting = fn;
}

async function callModel(input: { model: string; prompt: string }): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number | null;
}> {
  if (modelCallForTesting) return modelCallForTesting(input);
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  const isReasoningModel = /^(gpt-5|o\d)/i.test(input.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);
  try {
    const resp = await client.chat.completions.create(
      {
        model: input.model,
        messages: [
          {
            role: "system",
            content:
              "You output ONLY valid JSON matching the requested schema. No markdown, no code fences, no commentary. Do not include copyrighted Bible verse text.",
          },
          { role: "user", content: input.prompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: MODEL_DAY_MAX_COMPLETION_TOKENS,
        ...(isReasoningModel ? { reasoning_effort: "low" } : {}),
      } as never,
      // maxRetries 0: "one request per model" must be literally true.
      { signal: controller.signal, maxRetries: 0 },
    );
    const r = resp as {
      choices: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      content: r.choices[0]?.message?.content ?? "",
      inputTokens: r.usage?.prompt_tokens ?? 0,
      // null usage = usage MISSING (billing uncertainty), never zero.
      outputTokens: r.usage ? (r.usage.completion_tokens ?? 0) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Prompt-context seams so the offline gate runs with no Supabase.
let promptContextForTesting:
  | ((slug: string) => Promise<{
      globalRules: string[];
      chapterNotes: string[];
      examples: { title: string; exampleType: string; content: string }[];
    }>)
  | null = null;
export function __setModelDayPromptContextForTesting(fn: typeof promptContextForTesting): void {
  promptContextForTesting = fn;
}

export interface ModelDayRunResult {
  ok: boolean;
  slug: string;
  status: "done" | "failed";
  reason?: string;
  packetDigest?: string;
}

/** Worker body for one claimed Model Day job. TWO bounded model requests at
 * most (incumbent first; challenger only inside the total cap), no automatic
 * retry, every outcome durably in the cost ledger. Writes ONLY model_day_runs
 * rows + cost events + audit lines — never chapter data. */
export async function runModelDayJob(slug: string, jobId: string): Promise<ModelDayRunResult> {
  const store = productionStore();
  if (!store) return { ok: false, slug, status: "failed", reason: "model day storage unavailable" };
  const latest = await store.latest(slug);
  if (latest.kind === "error") {
    return { ok: false, slug, status: "failed", reason: "model day storage could not be read — refusing to run blind (the claim is untouched)" };
  }
  const row = latest.kind === "row" ? latest.row : null;
  if (!row || row.job_id !== jobId || rowStatus(row) !== "generating" || typeof row.id !== "string") {
    return { ok: false, slug, status: "failed", reason: "no matching claimed Model Day job (duplicate or superseded delivery)" };
  }
  const id = row.id;
  const incumbent = String(row.incumbent_model ?? "");
  const challenger = String(row.challenger_model ?? "");
  if (!validModelId(incumbent) || !validModelId(challenger) || incumbent === challenger) {
    return { ok: false, slug, status: "failed", reason: "the claimed row's models are invalid — refusing (the claim is untouched)" };
  }
  // Atomic CONSUME before any spend: a duplicated delivery loses this write.
  const consumed = await store.conditionalUpdate(id, "generating", { status: "running" });
  if (typeof consumed !== "number" || consumed !== 1) {
    return { ok: false, slug, status: "failed", reason: "claim already consumed — refusing duplicate delivery (no spend)" };
  }
  const failRow = async (reason: string, costUsd?: number): Promise<ModelDayRunResult> => {
    const moved = await store.conditionalUpdate(id, "running", {
      status: "failed",
      error: reason.slice(0, 300),
      ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
    });
    if (typeof moved !== "number" || moved !== 1) {
      console.error(`[selah] model day fail-write lost (${slug}) — row may be stranded running`);
    }
    await logGenerationAudit({ action: "model_day_failed", slug, status: "failed", message: reason.slice(0, 300) });
    return { ok: false, slug, status: "failed", reason };
  };

  const identity = parseSlug(slug);
  if (!identity) return failRow("unparseable chapter slug (nothing was spent)");

  // Live kill-switch recheck immediately before any dispatch: turning Text
  // Generation OFF stops queued Model Day jobs too.
  try {
    if (!(await getGenerationSettings()).text_generation_enabled) {
      return failRow("Text Generation was turned OFF before dispatch — nothing was spent");
    }
  } catch {
    return failRow("the generation settings could not be read before dispatch — refusing to spend blind");
  }

  // The EXACT production prompt context (rules + chapter notes + examples):
  // Model Day measures what the press would actually print, not a bare
  // prompt. Fail-closed — a Brain outage must not silently produce an
  // unrepresentative A/B.
  let context: {
    globalRules: string[];
    chapterNotes: string[];
    examples: { title: string; exampleType: string; content: string }[];
  };
  try {
    context = promptContextForTesting
      ? await promptContextForTesting(slug)
      : {
          globalRules: (await selectRulesForGeneration(slug, "copy_generation")).texts,
          chapterNotes: await getChapterReviewNoteTexts(slug),
          examples: await getRelevantExamples(slug, { types: TEXT_EXAMPLE_TYPES }),
        };
  } catch {
    return failRow("the production prompt context (Brain rules / notes / examples) could not be loaded — an unrepresentative A/B is worthless, refusing (nothing was spent)");
  }
  if (context.globalRules.length === 0) {
    return failRow("the Selah Brain returned no rules — an A/B without the press's quality guidance is unrepresentative, refusing (nothing was spent)");
  }

  const prompt = buildChapterWorkupPrompt({
    book: identity.book,
    chapter: identity.chapter,
    bibleVersion: "ESV",
    globalRules: context.globalRules,
    chapterNotes: context.chapterNotes,
    examples: context.examples,
  });
  // Hard prompt bound BEFORE dispatch: the disclosed ceiling is enforced.
  if (prompt.length > MODEL_DAY_PROMPT_MAX_CHARS) {
    return failRow(
      `the assembled prompt (${prompt.length} chars) exceeds the bounded maximum (${MODEL_DAY_PROMPT_MAX_CHARS}) — refusing before dispatch so the shown ceiling is never exceeded`,
    );
  }

  // ONE bounded request per model, incumbent first. Any post-dispatch failure
  // records its possible spend durably before the row fails.
  const runOne = async (
    model: string,
  ): Promise<
    | { ok: true; workup: Record<string, unknown>; costUsd: number; inputTokens: number | null }
    | { ok: false; reason: string; costUsd: number }
  > => {
    let dispatched = false;
    let contentText = "";
    let usage: { inputTokens: number; outputTokens: number | null } = { inputTokens: 0, outputTokens: 0 };
    try {
      if (!modelCallForTesting && !getOpenAI()) throw new Error("OpenAI not configured");
      dispatched = true;
      const result = await callModel({ model, prompt });
      contentText = result.content;
      usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
    } catch (e) {
      const msg = String((e as Error).message).slice(0, 200);
      if (!dispatched) return { ok: false, reason: `failed before the ${model} request was dispatched (no spend): ${msg}`, costUsd: 0 };
      const ceiling = modelDayCallCeilingUsd();
      try {
        await recordCostEventStrict({
          requestType: "model_day_text",
          provider: "openai",
          model,
          estimatedCostUsd: ceiling,
          metadata: { slug, jobId, failed: true, billingUncertain: true, error: msg },
        });
      } catch {
        return { ok: false, reason: `the ${model} request failed after dispatch AND its possible spend could not be recorded — manual inspection required: ${msg}`, costUsd: ceiling };
      }
      return { ok: false, reason: `the ${model} request failed after dispatch (the one request MAY be billed; possible spend recorded): ${msg}`, costUsd: ceiling };
    }
    const usageMissing = usage.outputTokens === null;
    const cost = usageMissing
      ? modelDayCallCeilingUsd()
      : estimateChapterWorkupCost({
          inputTokens: usage.inputTokens,
          cachedInputTokens: 0,
          outputTokens: usage.outputTokens ?? 0,
        }).textEstimateUsd;
    try {
      await recordCostEventStrict({
        requestType: "model_day_text",
        provider: "openai",
        model,
        ...(usageMissing ? {} : { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens ?? 0 }),
        estimatedCostUsd: cost,
        metadata: usageMissing
          ? { slug, jobId, billingUncertain: true, note: "provider returned no usage data; conservative per-call ceiling recorded" }
          : { slug, jobId },
      });
    } catch {
      return { ok: false, reason: `the ${model} run's cost row could not be recorded — the spend happened, so the run stops here for manual inspection`, costUsd: cost };
    }
    let workup: Record<string, unknown>;
    try {
      const parsed = parseChapterWorkupJson(contentText);
      workup = parsed as unknown as Record<string, unknown>;
    } catch (e) {
      return { ok: false, reason: `${model} did not return a valid chapter workup: ${String((e as Error).message).slice(0, 200)}`, costUsd: cost };
    }
    return { ok: true, workup, costUsd: cost, inputTokens: usageMissing ? null : usage.inputTokens };
  };

  const first = await runOne(incumbent);
  if (!first.ok) return failRow(first.reason, first.costUsd);

  // Structural total-cap gate. Both calls send the IDENTICAL prompt, so the
  // challenger's input cost is bounded by the incumbent's MEASURED prompt
  // tokens (+10% cross-tokenizer margin) — not by the chars/token assumption
  // (adversarial review: a denser-than-4-chars/token prompt could otherwise
  // let the recorded total nick past the cap). The output side is provider-
  // enforced by max_completion_tokens. If the incumbent's usage was missing,
  // the measured bound does not exist — fall back to the static ceiling,
  // which then fails closed below (ceiling + ceiling > cap).
  const challengerCeilingUsd =
    first.inputTokens === null
      ? modelDayCallCeilingUsd()
      : Math.ceil(
          estimateChapterWorkupCost({
            inputTokens: Math.ceil(first.inputTokens * 1.1),
            cachedInputTokens: 0,
            outputTokens: MODEL_DAY_MAX_COMPLETION_TOKENS,
          }).textEstimateUsd * 100,
        ) / 100;
  if (first.costUsd + challengerCeilingUsd > MODEL_DAY_TOTAL_CAP_USD) {
    return failRow(
      `the incumbent run cost $${first.costUsd.toFixed(4)}; adding the challenger's ceiling ($${challengerCeilingUsd.toFixed(2)}) would risk exceeding the $${MODEL_DAY_TOTAL_CAP_USD.toFixed(2)} total cap — challenger NOT dispatched`,
      first.costUsd,
    );
  }
  const second = await runOne(challenger);
  if (!second.ok) return failRow(second.reason, first.costUsd + second.costUsd);
  const totalCost = Math.round((first.costUsd + second.costUsd) * 10000) / 10000;

  // BLIND coin flip: which model is candidate A is decided here, stored in
  // the row, and never included in the judge packet.
  const incumbentIsA = Math.random() < 0.5;
  const candidateA = incumbentIsA ? first.workup : second.workup;
  const candidateB = incumbentIsA ? second.workup : first.workup;
  const labelMap = incumbentIsA ? { A: incumbent, B: challenger } : { A: challenger, B: incumbent };
  const digest = packetDigestOf(slug, candidateA, candidateB);

  const moved = await store.conditionalUpdate(id, "running", {
    status: "done",
    candidate_a_json: candidateA,
    candidate_b_json: candidateB,
    label_map: labelMap,
    packet_digest: digest,
    cost_usd: totalCost,
  });
  if (typeof moved !== "number" || moved !== 1) {
    return failRow("the run row changed while generating (superseded); the spend is recorded", totalCost);
  }
  await logGenerationAudit({
    action: "model_day_done",
    slug,
    status: "succeeded",
    estimatedCost: totalCost,
    // The gate above makes an over-cap total improbable; if it ever happens
    // anyway (cross-tokenizer surprise beyond the margin), say so loudly —
    // the ledger stays honest either way.
    message: `blind A/B ready ${digest.slice(0, 12)}… (total $${totalCost.toFixed(4)}${totalCost > MODEL_DAY_TOTAL_CAP_USD ? " — OVER the cap; review the margin" : ""})`,
  });
  return { ok: true, slug, status: "done", packetDigest: digest };
}
