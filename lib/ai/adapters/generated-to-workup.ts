import type { GeneratedChapterWorkup } from "@/lib/ai/schemas/chapter-workup-schema";
import type { ChapterWorkup } from "@/lib/types";

/**
 * Seam between the canonical generated content and the render/view model.
 *
 * The AI returns a `GeneratedChapterWorkup` (validated by Zod). The UI renders
 * a `ChapterWorkup` (`lib/types.ts`), which also carries a few view-derived
 * fields (metaChips, navCards, timelineMini, insights, deeperGroups). This
 * function will map one to the other when the pipeline is wired, so the page
 * never changes shape.
 *
 * Not implemented in the contract phase — no AI is connected yet. The current
 * Exodus 27 page renders from a hand-authored `ChapterWorkup` in the registry.
 */
export function generatedToRenderWorkup(_generated: GeneratedChapterWorkup): ChapterWorkup {
  // TODO(phase-1): derive the render model (chips/nav/timelineMini/insights/
  // deeperGroups) from the canonical fields here.
  throw new Error("generatedToRenderWorkup is not implemented yet (contract phase only).");
}
