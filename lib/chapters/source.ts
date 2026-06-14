import type { ChapterWorkup } from "@/lib/types";
import { exodus27 } from "@/lib/chapters/exodus-27";
import { parseChapterWorkupJson } from "@/lib/ai/schemas/chapter-workup-schema";
import { generatedToRenderWorkup } from "@/lib/ai/adapters/generated-to-workup";
import fixture from "@/lib/ai/fixtures/exodus-27-generated.json";

// Temporary dogfood switch:
// Used to compare the hand-authored workup against the generated contract output
// before wiring live AI generation. Default ON (dogfood the generated fixture).
// Set NEXT_PUBLIC_USE_GENERATED_FIXTURE=false to fall back to hand-authored.
//
// NOTE: keep this module SERVER-side only — it pulls in the Zod schema/adapter.
// Pass the resolved source down as a plain string prop to client components.
export const USE_GENERATED_FIXTURE =
  process.env.NEXT_PUBLIC_USE_GENERATED_FIXTURE !== "false";

export type ChapterSource = "Supabase" | "generated fixture" | "hand-authored";

// The LOCAL source used when Supabase has no ready/reviewed workup.
export const LOCAL_SOURCE: ChapterSource = USE_GENERATED_FIXTURE
  ? "generated fixture"
  : "hand-authored";

// Build the generated workup once (validate → adapt) and reuse it.
let cached: ChapterWorkup | null = null;
function generatedExodus27(): ChapterWorkup {
  if (!cached) {
    cached = generatedToRenderWorkup(parseChapterWorkupJson(JSON.stringify(fixture)));
  }
  return cached;
}

/** The active Exodus 27 workup for the chosen source. */
export function exodus27Workup(): ChapterWorkup {
  return USE_GENERATED_FIXTURE ? generatedExodus27() : exodus27;
}
