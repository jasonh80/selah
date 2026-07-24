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
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import { buildChapterWorkupPrompt } from "../ai/prompts/chapter-workup-prompt";
import {
  buildChapterWorkupRequestBody,
  CHAPTER_WORKUP_SYSTEM_MESSAGE,
} from "./generate-chapter-workup";
import { loadProposalGuidanceOrFail } from "./prepare-proposals";
import { parseChapterWorkupJson } from "../ai/schemas/chapter-workup-schema";
import { sha256Canonical } from "./generation-manifest";
import { recordCostEventStrict } from "./cost-events-repository";
import { logGenerationAudit, getGenerationSettings } from "./generation-settings";
import { selectRulesForGeneration, getChapterReviewNoteTexts } from "./selah-brain";
import { getRelevantExamples, TEXT_EXAMPLE_TYPES } from "./selah-examples";
import { parseSlug } from "./generate-chapter-workup";

const TABLE = "model_day_runs";
export const MODEL_DAY_SCHEMA_VERSION = "model-day.v1";

// The exact system message both calls send — part of the counted input bound.
// Aliased to the shared production constant (Codex #103 correction 2) so the
// counted bound and the dispatched request can never drift from the press.
export const MODEL_DAY_SYSTEM_MESSAGE = CHAPTER_WORKUP_SYSTEM_MESSAGE;

// Past the 20-min job-token TTL + the worker's model budget + margin: no live
// worker can still exist for a claim this old.
const STALE_CLAIM_MS = 45 * 60 * 1000;

// ONE shared wall-clock deadline for the worker's concurrent model calls,
// safely below Netlify's 15-minute background-function limit (Codex #103
// correction 1): both calls are aborted together so the worker cannot be killed
// mid-settlement past the platform ceiling.
export const MODEL_DAY_WORKER_DEADLINE_MS = 13 * 60 * 1000;

// ---------------------------------------------------------------------------
// Bounded spend. The owner's Model Day budget is a TOTAL cap; both calls are
// hard-bounded so the recorded ledger can never exceed it.
// ---------------------------------------------------------------------------
// PRODUCTION-QUALITY Model Day (owner choice "A", 2026-07-21, per Codex's
// correction shape): the A/B mirrors the production request budget, so the
// worst-case ceiling is $0.90 — BOTH calls' full worst case is reserved
// before call one ever dispatches. Expected actual stays far lower (~$0.22).
export const MODEL_DAY_TOTAL_CAP_USD = 0.9;
// Coarse pre-check only — the ENFORCED input bound is the exact token count
// below (Codex #103 P1: a chars/token assumption is an estimate, not a
// ceiling; the incumbent alone must never be able to cross the cap).
export const MODEL_DAY_PROMPT_MAX_CHARS = 60_000;
// Exact o200k token bound on (system + user) message content, counted with
// the same encoding family the GPT-5 series uses, BEFORE any dispatch.
// 12k input tokens = $0.06 at the priced rates; with the provider-enforced
// completion cap that makes one call's worst case $0.18 < the $0.30 cap.
export const MODEL_DAY_MAX_INPUT_TOKENS = 12_000;
// Small allowance for the provider's per-message/e.g. role framing overhead
// beyond raw content tokens — counted INTO the bound, never on top of it.
const MODEL_DAY_TOKEN_OVERHEAD = 50;
// PRODUCTION PARITY (owner choice "A"): the exact completion budget the
// production writing request uses (generateChapterWorkup) — reasoning tokens
// count inside this limit, so a smaller cap could truncate a model here that
// would succeed in production and crown the wrong writer (Codex re-review).
export const MODEL_DAY_MAX_COMPLETION_TOKENS = 12_000;

// The ONLY models this lane may quote or dispatch (Codex #103 P1: "allow only
// models with known pricing/capability"). Published USD-per-1M-token rates in
// ALL THREE input buckets (Codex re-review P1: GPT-5.6 Sol bills cache WRITES
// at 1.25× input — a quote that prices every prompt token at the plain input
// rate is not a ceiling). Adding a model here is a reviewed code change,
// never a free-text field.
export interface ModelDayRates {
  inputUsdPerM: number;
  cachedInputUsdPerM: number;
  /** What a prompt token can cost when the provider writes it to the prompt
   * cache. Ceilings and conservative actuals price uncached input HERE. */
  cacheWriteInputUsdPerM: number;
  outputUsdPerM: number;
}
export const MODEL_DAY_PRICED_MODELS: Readonly<Record<string, ModelDayRates>> = Object.freeze({
  "gpt-5.5": { inputUsdPerM: 5, cachedInputUsdPerM: 0.5, cacheWriteInputUsdPerM: 5, outputUsdPerM: 30 },
  "gpt-5.6-sol": { inputUsdPerM: 5, cachedInputUsdPerM: 0.5, cacheWriteInputUsdPerM: 6.25, outputUsdPerM: 30 },
});

export function pricedModel(id: unknown): ModelDayRates | null {
  return typeof id === "string" ? (MODEL_DAY_PRICED_MODELS[id] ?? null) : null;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const ceilCents = (n: number) => Math.ceil(n * 100) / 100;

/** Conservative ACTUAL cost from usage buckets at the given rates snapshot.
 * The provider's usage reports cached READS but never says whether uncached
 * tokens incurred a cache WRITE — so uncached input is priced at the cache-
 * write rate (the only honest direction: the ledger may overstate by the
 * write premium, never understate). */
export function modelDayCostUsd(
  rates: ModelDayRates,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const cached = Math.min(Math.max(0, cachedInputTokens), Math.max(0, inputTokens));
  const uncached = Math.max(0, inputTokens) - cached;
  return round4(
    (uncached / 1_000_000) * rates.cacheWriteInputUsdPerM +
      (cached / 1_000_000) * rates.cachedInputUsdPerM +
      (Math.max(0, outputTokens) / 1_000_000) * rates.outputUsdPerM,
  );
}

/** Conservative per-call ceiling at a rates snapshot: the full input-token
 * bound priced at the cache-write rate + the full completion cap. */
export function modelDayCallCeilingUsd(rates: ModelDayRates): number {
  return ceilCents(modelDayCostUsd(rates, MODEL_DAY_MAX_INPUT_TOKENS, 0, MODEL_DAY_MAX_COMPLETION_TOKENS));
}

/** Exact input-token count for the messages this lane sends (o200k — the
 * GPT-5 series encoding), including the fixed system message and a small
 * framing overhead. This is the ENFORCED pre-dispatch bound. */
export function modelDayInputTokenCount(prompt: string): number {
  return countTokens(MODEL_DAY_SYSTEM_MESSAGE) + countTokens(prompt) + MODEL_DAY_TOKEN_OVERHEAD;
}

export interface ModelDayQuote {
  incumbentModel: string;
  challengerModel: string;
  ratesUsdPerM: { incumbent: ModelDayRates; challenger: ModelDayRates };
  expectedUsd: number;
  perCallCeilingUsd: number;
  totalCapUsd: number;
  maxInputTokens: number;
  maxCompletionTokens: number;
  quoteDigest: string;
}

/** The immutable pricing snapshot a claim persists (Codex re-review P1: run
 * identity — the accepted quote's every price assumption rides the row into
 * the worker, which refuses on ANY drift from the live table). */
export type ModelDayPricingSnapshot = {
  schemaVersion: string;
  slug: string;
  incumbentModel: string;
  challengerModel: string;
  ratesUsdPerM: { incumbent: ModelDayRates; challenger: ModelDayRates };
  maxInputTokens: number;
  maxCompletionTokens: number;
  totalCapUsd: number;
};

export function quoteBodyFor(
  slug: string,
  incumbentModel: string,
  challengerModel: string,
): ModelDayPricingSnapshot | null {
  const incumbentRates = pricedModel(incumbentModel);
  const challengerRates = pricedModel(challengerModel);
  if (!incumbentRates || !challengerRates) return null;
  return {
    schemaVersion: MODEL_DAY_SCHEMA_VERSION,
    slug,
    incumbentModel,
    challengerModel,
    ratesUsdPerM: { incumbent: incumbentRates, challenger: challengerRates },
    maxInputTokens: MODEL_DAY_MAX_INPUT_TOKENS,
    maxCompletionTokens: MODEL_DAY_MAX_COMPLETION_TOKENS,
    totalCapUsd: MODEL_DAY_TOTAL_CAP_USD,
  };
}

/** The server-side quote for ONE exact (slug, incumbent, challenger) pair.
 * Its digest binds the pair AND every price assumption; create must echo it
 * and the claim recomputes it — a model changed after the quote was shown
 * (either side) makes the digest stale and the create refuses (Codex #103
 * P1). Returns null when either model is unpriced. */
export function modelDayQuoteFor(
  slug: string,
  incumbentModel: string,
  challengerModel: string,
): ModelDayQuote | null {
  const body = quoteBodyFor(slug, incumbentModel, challengerModel);
  if (!body) return null;
  const perCallCeilingUsd = Math.max(
    modelDayCallCeilingUsd(body.ratesUsdPerM.incumbent),
    modelDayCallCeilingUsd(body.ratesUsdPerM.challenger),
  );
  return {
    incumbentModel,
    challengerModel,
    ratesUsdPerM: body.ratesUsdPerM,
    // 2 × the observed ~$0.11 Mark text run (costs.ts cross-check).
    expectedUsd: 0.22,
    perCallCeilingUsd,
    totalCapUsd: MODEL_DAY_TOTAL_CAP_USD,
    maxInputTokens: MODEL_DAY_MAX_INPUT_TOKENS,
    maxCompletionTokens: MODEL_DAY_MAX_COMPLETION_TOKENS,
    quoteDigest: sha256Canonical(body),
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
  /** Conditional write: only a row matching (id, expected status, and every
   * extraIsNull column still null) moves. 0 = the predicate lost. */
  conditionalUpdate(
    id: string,
    expectedStatus: ModelDayStatus,
    next: Record<string, unknown>,
    extraIsNull?: readonly string[],
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
    async conditionalUpdate(id, expectedStatus, next, extraIsNull) {
      let query = db.from(TABLE).update(next).eq("id", id).eq("status", expectedStatus);
      for (const column of extraIsNull ?? []) {
        query = query.is(column, null);
      }
      const { data, error } = await query.select("id");
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

export type ModelDayVerdict = "A" | "B" | "tie";

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
  verdict: ModelDayVerdict | null;
  verdict_note: string | null;
  verdict_recorded_at: string | null;
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
    verdict: raw.verdict === "A" || raw.verdict === "B" || raw.verdict === "tie" ? raw.verdict : null,
    verdict_note: typeof raw.verdict_note === "string" ? raw.verdict_note : null,
    verdict_recorded_at: typeof raw.verdict_recorded_at === "string" ? raw.verdict_recorded_at : null,
    error: typeof raw.error === "string" ? raw.error : null,
    cost_usd: typeof raw.cost_usd === "number" ? raw.cost_usd : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
  };
}

/** Record the judge's verdict on the EXACT completed run (digest-bound),
 * exactly once — the reveal action requires it (Codex #103 P2: blindness
 * until verdict is enforced in storage, not by procedure). */
export async function recordModelDayVerdict(
  slug: string,
  packetDigest: string,
  verdict: ModelDayVerdict,
  note: string,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "WRITE_FAILED"; reason: string }> {
  let row: ModelDayRow | null;
  try {
    row = await readLatestModelDayRun(slug);
  } catch {
    return { ok: false, code: "WRITE_FAILED", reason: "model day storage could not be read — try again (fail-closed)" };
  }
  if (!row || row.status !== "done" || row.packet_digest !== packetDigest) {
    return { ok: false, code: "NOT_FOUND", reason: "no completed run matches that packet digest" };
  }
  if (row.verdict !== null) {
    return { ok: false, code: "CONFLICT", reason: `a verdict (${row.verdict}) is already recorded for this run — verdicts are immutable` };
  }
  const store = productionStore();
  if (!store) return { ok: false, code: "WRITE_FAILED", reason: "model day storage unavailable" };
  // The verdict-still-null predicate is IN the write: two racing verdicts
  // cannot both land — the loser matches zero rows.
  const moved = await store.conditionalUpdate(
    row.id,
    "done",
    {
      verdict,
      verdict_note: note.slice(0, 500),
      verdict_recorded_at: new Date().toISOString(),
    },
    ["verdict"],
  );
  if (typeof moved !== "number" || moved !== 1) {
    return { ok: false, code: "CONFLICT", reason: "the run changed while recording the verdict — check its state" };
  }
  return { ok: true };
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
  echoedQuoteDigest: string,
): Promise<string> {
  if (!parseSlug(slug)) throw new ModelDayClaimError("REFUSED", "not a recognizable chapter slug");
  if (!validModelId(incumbentModel) || !validModelId(challengerModel)) {
    throw new ModelDayClaimError("REFUSED", "model ids must be plain provider identifiers");
  }
  if (!pricedModel(incumbentModel) || !pricedModel(challengerModel)) {
    throw new ModelDayClaimError(
      "REFUSED",
      "both models must be in the priced allowlist — an unpriced model cannot be quoted honestly, so it cannot run",
    );
  }
  if (incumbentModel === challengerModel) {
    throw new ModelDayClaimError("REFUSED", "the challenger must differ from the incumbent — an A/A run spends twice for nothing");
  }
  // The create action must echo the EXACT server quote for THIS pair — a
  // challenger edited after the quote, or an incumbent that changed in
  // settings since, makes the digest stale and the claim refuses (Codex #103
  // P1: the shown price is bound to the run, never a stale constant).
  const expectedQuote = modelDayQuoteFor(slug, incumbentModel, challengerModel);
  if (!expectedQuote || echoedQuoteDigest !== expectedQuote.quoteDigest) {
    throw new ModelDayClaimError(
      "REFUSED",
      "the confirmed quote does not match this exact model pair — re-quote and confirm the shown numbers again",
    );
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
  // One UNRESOLVED run per chapter (Codex re-review P1, run identity): a
  // completed run whose blind verdict is not recorded yet must stay the
  // accountable "latest" — a new paid run may not shadow it. Record the
  // verdict (unlocking its reveal) before spending again.
  if (raw && rawStatusValue === "done" && (raw.verdict === undefined || raw.verdict === null)) {
    throw new ModelDayClaimError(
      "REFUSED",
      "the previous completed run has no recorded verdict — record the blind ruling first; a new run may not replace an unjudged one",
    );
  }
  const id = crypto.randomUUID();
  const inserted = await store.insert({
    id,
    slug,
    status: "generating",
    job_id: jobId,
    incumbent_model: incumbentModel,
    challenger_model: challengerModel,
    // Run identity (Codex re-review P1): the ACCEPTED quote — digest and full
    // pricing snapshot — rides the row; the worker prices from THIS snapshot
    // and refuses on any drift from the live table.
    quote_digest: expectedQuote.quoteDigest,
    pricing_json: quoteBodyFor(slug, incumbentModel, challengerModel),
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
}) => Promise<{
  content: string;
  inputTokens: number | null;
  cachedInputTokens?: number | null;
  outputTokens: number | null;
}>;
let modelCallForTesting: ModelDayModelCall | null = null;
export function __setModelDayModelForTesting(fn: ModelDayModelCall | null): void {
  modelCallForTesting = fn;
}

/** A usable token count is a finite non-negative number — anything else is
 * MISSING (Codex #103 P1: a partially missing usage object must never read
 * as zero cost or authorize the second dispatch). */
function usableTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// The TWO declared Model-Day-only exceptions to byte-equality with the press
// (Codex #103 correction 2/3): `service_tier: "default"` pins the priced tier
// (an omitted tier means "auto", which Project settings could reprice), and
// `prompt_cache_options: { mode: "explicit" }` disables the implicit cache-write
// breakpoint so no unbudgeted cache-write can undermine the cap.
export const MODEL_DAY_REQUEST_EXCEPTIONS = Object.freeze({
  service_tier: "default" as const,
  prompt_cache_options: Object.freeze({ mode: "explicit" as const }),
});

/** The EXACT chat-completions body Model Day sends: the shared production
 * request body (byte-equal to the press except model id) plus the two declared
 * spend-safety exceptions. Pure — used by callModel AND by the byte-equality
 * regression, so the two can never drift. */
export function modelDayRequestBody(input: { model: string; prompt: string }): Record<string, unknown> {
  return {
    ...buildChapterWorkupRequestBody({ model: input.model, prompt: input.prompt }),
    ...MODEL_DAY_REQUEST_EXCEPTIONS,
  };
}

async function callModel(input: { model: string; prompt: string; signal?: AbortSignal }): Promise<{
  content: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
}> {
  if (modelCallForTesting) {
    const canned = await modelCallForTesting(input);
    return { ...canned, cachedInputTokens: canned.cachedInputTokens ?? null };
  }
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  // The worker owns ONE shared deadline for both concurrent calls (Codex #103
  // correction 1). If no signal is supplied, fall back to a local per-call
  // timer so a direct caller is still bounded.
  const local = input.signal ? null : new AbortController();
  const timer = local ? setTimeout(() => local.abort(), 8 * 60 * 1000) : null;
  const signal = input.signal ?? local!.signal;
  try {
    const resp = await client.chat.completions.create(
      modelDayRequestBody({ model: input.model, prompt: input.prompt }) as never,
      // maxRetries 0: "one request per model" must be literally true.
      { signal, maxRetries: 0 },
    );
    const r = resp as {
      choices: { message?: { content?: string | null } }[];
      service_tier?: unknown;
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        prompt_tokens_details?: { cached_tokens?: unknown };
      };
    };
    // Validate the served tier before any cost is priced (Codex #103): if the
    // provider echoes a tier other than the pinned "default", the price
    // assumptions are void — fail so the caller records the conservative
    // ceiling as possible spend rather than pricing against the wrong tier.
    const servedTier = typeof r.service_tier === "string" ? r.service_tier : undefined;
    if (servedTier !== undefined && servedTier !== "default") {
      throw new Error(`provider served tier "${servedTier}", not the pinned "default" — pricing assumptions void`);
    }
    return {
      content: r.choices[0]?.message?.content ?? "",
      // Each REQUIRED field independently: absent/invalid = null, never zero.
      inputTokens: usableTokenCount(r.usage?.prompt_tokens),
      // Cached reads are a discount — absent reads as null and the caller
      // treats it as 0 (never assume a discount happened).
      cachedInputTokens: usableTokenCount(r.usage?.prompt_tokens_details?.cached_tokens),
      outputTokens: usableTokenCount(r.usage?.completion_tokens),
    };
  } finally {
    if (timer) clearTimeout(timer);
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

  // Run identity (Codex re-review P1): the worker prices ONLY from the row's
  // accepted snapshot, and refuses pre-dispatch when that snapshot no longer
  // matches the live allowlist/table — a rate or bound changed between the
  // owner's confirm and this dispatch means the confirmed numbers are no
  // longer true, so nothing may be spent under them.
  const expectedBody = quoteBodyFor(slug, incumbent, challenger);
  if (!expectedBody) {
    return failRow("a claimed model is no longer in the priced allowlist — refusing before dispatch (nothing was spent); re-quote");
  }
  const expectedDigest = sha256Canonical(expectedBody);
  const storedDigest = typeof row.quote_digest === "string" ? row.quote_digest : "";
  const storedSnapshotDigest = row.pricing_json ? sha256Canonical(row.pricing_json) : "";
  if (storedDigest !== expectedDigest || storedSnapshotDigest !== expectedDigest) {
    return failRow(
      "the run's accepted pricing snapshot does not match current pricing — the confirmed numbers drifted, refusing before dispatch (nothing was spent); re-quote and confirm again",
    );
  }
  const ratesFor = (model: string): ModelDayRates =>
    model === incumbent ? expectedBody.ratesUsdPerM.incumbent : expectedBody.ratesUsdPerM.challenger;

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

  // The press folds the chapter's APPROVED preparation proposal into its notes
  // (generate-chapter-workup). Model Day must too, or it compares under
  // different instructions than the printing path (Codex #103 correction 2).
  // Fail-closed exactly as production does — a prepared chapter with a
  // missing/unapproved/drifted proposal must not run an unrepresentative A/B.
  let proposalGuidance: string[];
  try {
    proposalGuidance = promptContextForTesting ? [] : await loadProposalGuidanceOrFail(slug);
  } catch (e) {
    return failRow(
      `the approved preparation proposal could not be loaded (${String((e as Error).message).slice(0, 160)}) — refusing an unrepresentative A/B (nothing was spent)`,
    );
  }

  const prompt = buildChapterWorkupPrompt({
    book: identity.book,
    chapter: identity.chapter,
    bibleVersion: "ESV",
    globalRules: context.globalRules,
    chapterNotes: [...context.chapterNotes, ...proposalGuidance],
    examples: context.examples,
  });
  // Coarse char pre-check, then the ENFORCED bound: an EXACT o200k token
  // count of exactly what will be sent (system + prompt + framing overhead),
  // BEFORE any dispatch (Codex #103 P1: counted, not assumed — the incumbent
  // alone can never cross the cap: 12k in + 4k out = $0.18 worst case).
  if (prompt.length > MODEL_DAY_PROMPT_MAX_CHARS) {
    return failRow(
      `the assembled prompt (${prompt.length} chars) exceeds the coarse maximum (${MODEL_DAY_PROMPT_MAX_CHARS}) — refusing before dispatch`,
    );
  }
  const inputTokenCount = modelDayInputTokenCount(prompt);
  if (inputTokenCount > MODEL_DAY_MAX_INPUT_TOKENS) {
    return failRow(
      `the assembled input counts ${inputTokenCount} o200k tokens, over the enforced ${MODEL_DAY_MAX_INPUT_TOKENS}-token bound — refusing before dispatch so the quoted ceiling is never exceeded`,
    );
  }

  // FULL PRE-RESERVATION (owner choice "A" + Codex correction shape): BOTH
  // calls' complete worst case must fit the cap before the FIRST dispatch —
  // no cross-model estimates, no discovering the budget mid-run.
  const incumbentCeilingUsd = modelDayCallCeilingUsd(ratesFor(incumbent));
  const challengerCeilingUsd = modelDayCallCeilingUsd(ratesFor(challenger));
  if (incumbentCeilingUsd + challengerCeilingUsd > MODEL_DAY_TOTAL_CAP_USD) {
    return failRow(
      `both calls' reserved worst case ($${incumbentCeilingUsd.toFixed(2)} + $${challengerCeilingUsd.toFixed(2)}) exceeds the $${MODEL_DAY_TOTAL_CAP_USD.toFixed(2)} cap — nothing was dispatched`,
    );
  }

  // ONE bounded request per model. Any post-dispatch failure records its
  // possible spend durably before the row fails, so each candidate's outcome is
  // settled before the run turns terminal. All costs at the MODEL'S OWN priced
  // rates (never another model's). Both calls share ONE deadline (below).
  const runOne = async (
    model: string,
    signal: AbortSignal,
  ): Promise<
    | { ok: true; workup: Record<string, unknown>; costUsd: number; inputTokens: number | null }
    | { ok: false; reason: string; costUsd: number }
  > => {
    const rates = ratesFor(model);
    let dispatched = false;
    let contentText = "";
    let usage: { inputTokens: number | null; cachedInputTokens: number; outputTokens: number | null } = {
      inputTokens: null,
      cachedInputTokens: 0,
      outputTokens: null,
    };
    try {
      if (!modelCallForTesting && !getOpenAI()) throw new Error("OpenAI not configured");
      dispatched = true;
      const result = await callModel({ model, prompt, signal });
      contentText = result.content;
      usage = {
        inputTokens: usableTokenCount(result.inputTokens),
        // Cached READS are a discount, absent = 0 (that direction is the
        // conservative one — never assume a discount happened).
        cachedInputTokens: usableTokenCount(result.cachedInputTokens) ?? 0,
        outputTokens: usableTokenCount(result.outputTokens),
      };
    } catch (e) {
      const msg = String((e as Error).message).slice(0, 200);
      if (!dispatched) return { ok: false, reason: `failed before the ${model} request was dispatched (no spend): ${msg}`, costUsd: 0 };
      const ceiling = modelDayCallCeilingUsd(rates);
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
    // EITHER required token field absent/invalid = usage missing (Codex #103
    // P1): the conservative ceiling is recorded and the measured gate below
    // cannot authorize the challenger.
    const usageMissing = usage.inputTokens === null || usage.outputTokens === null;
    // Bucket-priced actual at the SNAPSHOT rates: uncached input at the
    // cache-write rate (the provider never reports whether a write happened,
    // so the ledger may overstate by the write premium, never understate).
    const cost = usageMissing
      ? modelDayCallCeilingUsd(rates)
      : modelDayCostUsd(rates, usage.inputTokens ?? 0, usage.cachedInputTokens, usage.outputTokens ?? 0);
    try {
      await recordCostEventStrict({
        requestType: "model_day_text",
        provider: "openai",
        model,
        ...(usageMissing
          ? {}
          : {
              inputTokens: usage.inputTokens ?? 0,
              cachedInputTokens: usage.cachedInputTokens,
              outputTokens: usage.outputTokens ?? 0,
            }),
        estimatedCostUsd: cost,
        metadata: usageMissing
          ? { slug, jobId, billingUncertain: true, note: "provider usage was absent or partial; conservative per-call ceiling recorded" }
          : rates.cacheWriteInputUsdPerM > rates.inputUsdPerM
            ? { slug, jobId, inputPricedConservatively: true, note: "uncached input priced at the cache-write rate (provider does not report writes) — may overstate, never understates" }
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

  // CONCURRENT DISPATCH under ONE shared deadline safely below Netlify's 15-min
  // background limit (Codex #103 correction 1). Both calls' full worst case is
  // already reserved (above), so there is no mid-run cap recheck to do — the two
  // requests run together and the worker settles each outcome durably (each
  // runOne records its own cost) before the run turns terminal. runOne never
  // throws (it catches and records), so Promise.all cannot reject.
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), MODEL_DAY_WORKER_DEADLINE_MS);
  let first: Awaited<ReturnType<typeof runOne>>;
  let second: Awaited<ReturnType<typeof runOne>>;
  try {
    [first, second] = await Promise.all([
      runOne(incumbent, deadline.signal),
      runOne(challenger, deadline.signal),
    ]);
  } finally {
    clearTimeout(deadlineTimer);
  }
  const totalCost = Math.round((first.costUsd + second.costUsd) * 10000) / 10000;

  // Either candidate failing (error, invalid workup, or a cost-record failure)
  // fails the whole run — both possible spends are already recorded.
  if (!first.ok || !second.ok) {
    const reasons = [first.ok ? null : `incumbent: ${first.reason}`, second.ok ? null : `challenger: ${second.reason}`]
      .filter(Boolean)
      .join(" | ");
    return failRow(reasons, totalCost);
  }
  // Missing/partial usage on EITHER candidate fails closed (Codex #103): with no
  // trustworthy actual there is no judgeable A/B; both reserved maxima are in the
  // ledger, and BOTH ledger entries are preserved.
  if (first.inputTokens === null || second.inputTokens === null) {
    const which = [first.inputTokens === null ? incumbent : null, second.inputTokens === null ? challenger : null]
      .filter(Boolean)
      .join(" and ");
    return failRow(
      `absent or partial usage from ${which} — failing closed with both reserved maxima recorded; no judgeable A/B under uncertainty`,
      totalCost,
    );
  }

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
