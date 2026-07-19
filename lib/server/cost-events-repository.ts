import { getSupabaseAdmin, warnSupabaseMissing } from "./supabase";

/**
 * The ONLY place that knows about the cost_events table. Safe no-op when
 * Supabase isn't configured. Every AI request should record one event here.
 */

const TABLE = "cost_events";

export type CostRequestType =
  | "chapter_workup_text"
  | "prepare_proposal"
  | "image_prompt_generation"
  | "image_generation"
  | "chapter_image_generation"
  | "personalized_reflection"
  | "user_question";

export interface CostEventInput {
  chapterWorkupId?: string | null;
  userId?: string | null;
  requestType: CostRequestType;
  provider: string;
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  imageSize?: string;
  imageQuality?: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface CostEventRow {
  id: string;
  request_type: string;
  provider: string;
  model: string;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  created_at: string;
}

/** Read-only spend-history row for Selah Studio (issue #29 cost ledger). */
export interface CostHistoryRow extends CostEventRow {
  image_count: number | null;
  metadata: Record<string, unknown> | null;
}

// TEST SEAM (offline safety gate only): capture cost events in memory so the
// verify script can assert failed/conflicted spend is recorded. Never set in
// production code paths.
let costCapture: CostEventInput[] | null = null;
export function __setCostCaptureForTesting(capture: CostEventInput[] | null): void {
  costCapture = capture;
}

// Offline-only failure seam for proving the strict protected-worker adapter.
let costWriteFailureForTesting: "unconfigured" | "insert_failed" | null = null;
export function __setCostWriteFailureForTesting(
  failure: "unconfigured" | "insert_failed" | null,
): void {
  costWriteFailureForTesting = failure;
}

type CostWriteOutcome =
  | { ok: true }
  | { ok: false; kind: "unconfigured" | "insert_failed"; message?: string };

function rowFor(input: CostEventInput): Record<string, unknown> {
  return {
    chapter_workup_id: input.chapterWorkupId ?? null,
    user_id: input.userId ?? null,
    request_type: input.requestType,
    provider: input.provider,
    model: input.model,
    input_tokens: input.inputTokens ?? null,
    cached_input_tokens: input.cachedInputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    image_count: input.imageCount ?? null,
    image_size: input.imageSize ?? null,
    image_quality: input.imageQuality ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    actual_cost_usd: input.actualCostUsd ?? null,
    metadata: input.metadata ?? null,
  };
}

async function writeCostEvent(input: CostEventInput): Promise<CostWriteOutcome> {
  if (costCapture) {
    costCapture.push({ ...input });
    return { ok: true };
  }
  if (costWriteFailureForTesting) {
    return { ok: false, kind: costWriteFailureForTesting };
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return { ok: false, kind: "unconfigured" };
  }

  const { error } = await db.from(TABLE).insert(rowFor(input));
  return error
    ? { ok: false, kind: "insert_failed", message: error.message }
    : { ok: true };
}

/** Existing callers remain best-effort and never throw. */
export async function recordCostEvent(input: CostEventInput): Promise<void> {
  const outcome = await writeCostEvent(input);
  if (outcome.ok) return;
  if (outcome.kind === "unconfigured") {
    warnSupabaseMissing("recordCostEvent");
  } else {
    console.error("[selah] recordCostEvent failed:", outcome.message ?? "write failed");
  }
}

/** Protected paid work must prove its cost row was durably accepted. */
export async function recordCostEventStrict(input: CostEventInput): Promise<void> {
  const outcome = await writeCostEvent(input);
  if (!outcome.ok) {
    // Deliberately omit database/provider detail from the thrown error.
    throw new Error(
      outcome.kind === "unconfigured"
        ? "cost event storage is not configured"
        : "cost event write failed",
    );
  }
}

// TEST SEAM (offline verify only): feed fake spend-history rows (or a
// simulated outage) so the read-only Studio ledger can be asserted without
// Supabase.
let costHistoryForTesting: CostHistoryRow[] | "unavailable" | null = null;
export function __setCostHistoryForTesting(
  rows: CostHistoryRow[] | "unavailable" | null,
): void {
  costHistoryForTesting = rows;
}

/**
 * Most-recent-first spend history for the Studio ledger. Read-only. Returns
 * null when the read fails or Supabase isn't configured — a failed read must
 * never look like the true fact "$0 spent" (PR #36 review, P1-2). Callers
 * must NOT expose raw metadata to the browser — it can hold error text and
 * digests. Pick allowlisted fields only.
 */
export async function listRecentCostEvents(limit = 50): Promise<CostHistoryRow[] | null> {
  if (costHistoryForTesting === "unavailable") return null;
  if (costHistoryForTesting) return costHistoryForTesting.slice(0, limit);
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("listRecentCostEvents");
    return null;
  }

  const { data, error } = await db
    .from(TABLE)
    .select("id,request_type,provider,model,image_count,estimated_cost_usd,actual_cost_usd,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[selah] listRecentCostEvents failed:", error.message);
    return null;
  }
  return (data ?? []) as CostHistoryRow[];
}

export async function listCostEventsForChapter(chapterWorkupId: string): Promise<CostEventRow[]> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("listCostEventsForChapter");
    return [];
  }

  const { data, error } = await db
    .from(TABLE)
    .select("id,request_type,provider,model,estimated_cost_usd,actual_cost_usd,created_at")
    .eq("chapter_workup_id", chapterWorkupId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[selah] listCostEventsForChapter failed:", error.message);
    return [];
  }
  return (data ?? []) as CostEventRow[];
}
