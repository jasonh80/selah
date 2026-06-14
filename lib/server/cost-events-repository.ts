import { getSupabaseAdmin, warnSupabaseMissing } from "@/lib/server/supabase";

/**
 * The ONLY place that knows about the cost_events table. Safe no-op when
 * Supabase isn't configured. Every AI request should record one event here.
 */

const TABLE = "cost_events";

export type CostRequestType =
  | "chapter_workup_text"
  | "image_prompt_generation"
  | "image_generation"
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

export async function recordCostEvent(input: CostEventInput): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("recordCostEvent");
    return;
  }

  const { error } = await db.from(TABLE).insert({
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
  });

  if (error) console.error("[selah] recordCostEvent failed:", error.message);
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
