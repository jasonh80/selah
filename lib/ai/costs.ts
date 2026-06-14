// Cost estimation for a global chapter workup generation.
//
// ⚠️ PLACEHOLDER PRICING. These rates are NOT real. Update them from the
// provider's pricing page before production, and prefer logging actual usage
// from API responses over estimates.

// USD per 1,000 tokens / per image — replace before production.
const TEXT_INPUT_USD_PER_1K = 0.003;
const TEXT_OUTPUT_USD_PER_1K = 0.012;
const IMAGE_USD_EACH = 0.04;

export interface CostEstimateInput {
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
}

export interface CostEstimate {
  textEstimateUsd: number;
  imageEstimateUsd: number;
  totalEstimateUsd: number;
}

export function estimateChapterWorkupCost(input: CostEstimateInput): CostEstimate {
  const { inputTokens = 0, outputTokens = 0, imageCount = 0 } = input;

  const textEstimateUsd =
    (inputTokens / 1000) * TEXT_INPUT_USD_PER_1K + (outputTokens / 1000) * TEXT_OUTPUT_USD_PER_1K;
  const imageEstimateUsd = imageCount * IMAGE_USD_EACH;

  const round = (n: number) => Math.round(n * 10000) / 10000;

  return {
    textEstimateUsd: round(textEstimateUsd),
    imageEstimateUsd: round(imageEstimateUsd),
    totalEstimateUsd: round(textEstimateUsd + imageEstimateUsd),
  };
}
