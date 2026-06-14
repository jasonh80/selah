// SERVER-ONLY. Text-only generation of a global chapter workup on first request.
// No image generation. Gated behind a flag + allowlist so it never runs by
// accident. Generate once → validate → adapt → save → record cost → serve.
import type { ChapterWorkup } from "../types";
import {
  parseChapterWorkupJson,
  type GeneratedChapterWorkup,
} from "../ai/schemas/chapter-workup-schema";
import { buildChapterWorkupPrompt } from "../ai/prompts/chapter-workup-prompt";
import { generatedToRenderWorkup } from "../ai/adapters/generated-to-workup";
import { estimateChapterWorkupCost } from "../ai/costs";
import { getOpenAI, isOpenAIConfigured, CHAPTER_WORKUP_TEXT_MODEL } from "./openai";
import { isSupabaseConfigured } from "./supabase";
import {
  createGeneratingChapterWorkup,
  saveReadyChapterWorkup,
  markChapterWorkupFailed,
} from "./chapter-workups-repository";
import { recordCostEvent } from "./cost-events-repository";

// Only generate when explicitly enabled AND the slug is on the test allowlist —
// prevents random URLs from spending money / mass-generating the Bible.
export const GENERATION_ENABLED = process.env.ENABLE_CHAPTER_GENERATION === "true";
const TEST_GENERATION_ALLOWED_SLUGS = ["psalm-23", "mark-2"];

export function generationAllowed(slug: string): boolean {
  return (
    GENERATION_ENABLED &&
    isOpenAIConfigured() &&
    isSupabaseConfigured() &&
    TEST_GENERATION_ALLOWED_SLUGS.includes(slug)
  );
}

// "psalm-23" -> { book: "Psalm", chapter: 23 }
export function parseSlug(slug: string): { book: string; chapter: number } | null {
  const m = slug.match(/^(.+)-(\d+)$/);
  if (!m) return null;
  const book = m[1]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { book, chapter: Number(m[2]) };
}

interface GenOutput {
  workup: GeneratedChapterWorkup;
  inputTokens: number;
  outputTokens: number;
}

export async function generateChapterWorkup(input: {
  book: string;
  chapter: number;
  slug: string;
  bibleVersion?: string;
  bibleText?: string;
}): Promise<GenOutput> {
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");

  const prompt = buildChapterWorkupPrompt({
    book: input.book,
    chapter: input.chapter,
    bibleVersion: input.bibleVersion,
    bibleText: input.bibleText,
  });

  const resp = await client.chat.completions.create({
    model: CHAPTER_WORKUP_TEXT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You output ONLY valid JSON matching the requested schema. No markdown, no code fences, no commentary. Do not include copyrighted Bible verse text.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = resp.choices[0]?.message?.content ?? "";
  const workup = parseChapterWorkupJson(content);
  return {
    workup,
    inputTokens: resp.usage?.prompt_tokens ?? 0,
    outputTokens: resp.usage?.completion_tokens ?? 0,
  };
}

/**
 * Full missing-chapter flow (Option A, server-side blocking). Returns the
 * render-ready workup (now saved as "ready"), or null on failure (→ 404).
 */
export async function generateAndStoreChapter(slug: string): Promise<ChapterWorkup | null> {
  const parsed = parseSlug(slug);
  if (!parsed) return null;
  const { book, chapter } = parsed;
  const bibleVersion = "ESV";

  try {
    await createGeneratingChapterWorkup({
      book,
      chapter,
      slug,
      title: `${book} ${chapter}`,
      source: "generated",
      bibleVersion,
    });

    const { workup: generated, inputTokens, outputTokens } = await generateChapterWorkup({
      book,
      chapter,
      slug,
      bibleVersion,
    });

    const render = generatedToRenderWorkup(generated);
    // Saved as "ready" (not "reviewed") — an admin can promote it later.
    await saveReadyChapterWorkup({
      slug,
      workup: render,
      status: "ready",
      version: generated.version,
      bibleVersion,
    });

    const est = estimateChapterWorkupCost({ inputTokens, outputTokens, imageCount: 0 });
    await recordCostEvent({
      requestType: "chapter_workup_text",
      provider: "openai",
      model: CHAPTER_WORKUP_TEXT_MODEL,
      inputTokens,
      outputTokens,
      estimatedCostUsd: est.totalEstimateUsd,
      metadata: { slug, book, chapter, estimated: true },
    });

    return render;
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error(`[selah] generation failed for ${slug}:`, msg);
    await markChapterWorkupFailed(slug, msg);
    return null;
  }
}
