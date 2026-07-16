// Cost estimation for a global chapter workup generation.
//
// Real published rates (issue #29, Codex pricing research 2026-07-15, from
// the official OpenAI pricing page). Estimates remain estimates: prefer
// logging actual usage from API responses, and treat per-image numbers as
// documented output-token approximations rather than caps.

// GPT-5.5 standard, short context — USD per 1M tokens.
export const GPT_5_5_TEXT_RATES_USD_PER_1M = Object.freeze({
  input: 5.0,
  cachedInput: 0.5,
  output: 30.0,
});

// GPT Image 2 standard — USD per 1M tokens by modality.
export const GPT_IMAGE_2_RATES_USD_PER_1M = Object.freeze({
  textInput: 5.0,
  cachedTextInput: 1.25,
  imageInput: 8.0,
  cachedImageInput: 2.0,
  imageOutput: 30.0,
});

// Documented high-quality 1024x1536 / 1536x1024 output-token estimate at the
// $30/1M image-output rate. Text-input tokens are additional, so this is an
// estimate, not a cap. Mark 7 launch cross-check (2026-07-15): one gpt-5.5
// text run (~$0.11) + 3 of these (~$0.495) ≈ the observed ~$0.61 total.
export const GPT_IMAGE_2_ESTIMATED_USD_EACH = 0.165;
// gpt-image-1 legacy sets (psalm-23 era) keep their historical estimate.
export const GPT_IMAGE_1_ESTIMATED_USD_EACH = 0.04;

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Per-image estimate for the given image model. Unknown models use the
 * gpt-image-2 rate — the conservative (higher) choice, never an undercount.
 */
export function estimateImageCostUsd(model: string, imageCount: number): number {
  const each =
    model === "gpt-image-1"
      ? GPT_IMAGE_1_ESTIMATED_USD_EACH
      : GPT_IMAGE_2_ESTIMATED_USD_EACH;
  return round(Math.max(0, imageCount) * each);
}

export interface CostEstimateInput {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  imageModel?: string;
}

export interface CostEstimate {
  textEstimateUsd: number;
  imageEstimateUsd: number;
  totalEstimateUsd: number;
}

/**
 * Text tokens are priced at the gpt-5.5 rates above. Launch-quality runs use
 * gpt-5.5; cheaper models estimated at these rates read slightly high, which
 * is the safe direction for a spend estimate. Cached input tokens, when the
 * caller reports them, are the portion of inputTokens billed at the cached
 * rate.
 */
export function estimateChapterWorkupCost(input: CostEstimateInput): CostEstimate {
  const { inputTokens = 0, cachedInputTokens = 0, outputTokens = 0, imageCount = 0 } = input;
  const cached = Math.min(Math.max(0, cachedInputTokens), Math.max(0, inputTokens));
  const freshInput = Math.max(0, inputTokens) - cached;

  const rates = GPT_5_5_TEXT_RATES_USD_PER_1M;
  const textEstimateUsd =
    (freshInput / 1_000_000) * rates.input +
    (cached / 1_000_000) * rates.cachedInput +
    (Math.max(0, outputTokens) / 1_000_000) * rates.output;
  const imageEstimateUsd = estimateImageCostUsd(input.imageModel ?? "gpt-image-2", imageCount);

  return {
    textEstimateUsd: round(textEstimateUsd),
    imageEstimateUsd: round(imageEstimateUsd),
    totalEstimateUsd: round(textEstimateUsd + imageEstimateUsd),
  };
}
