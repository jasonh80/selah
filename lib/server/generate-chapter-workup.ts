// SERVER-ONLY. Text-only generation of a global chapter workup on first request.
// No image generation. Gated behind a flag + allowlist so it never runs by
// accident. Generate once → validate → adapt → save → record cost → serve.
import type { ChapterWorkup } from "../types";
import { parseChapterWorkupJson } from "../ai/schemas/chapter-workup-schema";
import { buildChapterWorkupPrompt } from "../ai/prompts/chapter-workup-prompt";
import { generatedToRenderWorkup } from "../ai/adapters/generated-to-workup";
import { estimateChapterWorkupCost } from "../ai/costs";
import { getOpenAI, isOpenAIConfigured, CHAPTER_WORKUP_TEXT_MODEL } from "./openai";
import { isSupabaseConfigured } from "./supabase";
import {
  verifyGenerationClaim,
  completeGenerationJob,
  failGenerationJob,
  requireJobStore,
} from "./generation-jobs";
import { isChapterMutationError } from "./protected-chapters";
import { recordCostEvent } from "./cost-events-repository";
import { snapshotVersion } from "./chapter-versions-repository";
import { getGenerationSettings, logGenerationAudit } from "./generation-settings";
import { selectRulesForGeneration, getChapterReviewNoteTexts } from "./selah-brain";
import { getRelevantExamples, TEXT_EXAMPLE_TYPES } from "./selah-examples";

// Routine generation control now lives in Supabase (generation_settings), so it
// changes from /admin/generation without a redeploy. Fail-CLOSED: needs OpenAI +
// Supabase configured AND text_generation_enabled AND the slug allowlisted there.
export async function generationAllowed(slug: string): Promise<boolean> {
  if (!isOpenAIConfigured() || !isSupabaseConfigured()) return false;
  const s = await getGenerationSettings();
  return s.text_generation_enabled && s.allowed_slugs.includes(slug);
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
  content: string; // raw model JSON (parsed by the orchestrator, so we can log cost first)
  inputTokens: number;
  outputTokens: number;
}

export async function generateChapterWorkup(input: {
  book: string;
  chapter: number;
  slug: string;
  bibleVersion?: string;
  bibleText?: string;
  model?: string;
  globalRules?: string[];
  chapterNotes?: string[];
  examples?: { title: string; exampleType: string; content: string }[];
}): Promise<GenOutput> {
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  const model = input.model || CHAPTER_WORKUP_TEXT_MODEL;

  const prompt = buildChapterWorkupPrompt({
    book: input.book,
    chapter: input.chapter,
    bibleVersion: input.bibleVersion,
    bibleText: input.bibleText,
    globalRules: input.globalRules,
    chapterNotes: input.chapterNotes,
    examples: input.examples,
  });

  // Reasoning models (GPT-5 / o-series) need low reasoning effort here — this is
  // content writing, not hard reasoning — or they burn minutes of reasoning on
  // the large prompt. Cap output tokens to avoid runaway. Built as a loose object
  // + cast so it compiles across SDK versions that may not type these fields yet.
  const isReasoningModel = /^(gpt-5|o\d)/i.test(model);
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You output ONLY valid JSON matching the requested schema. No markdown, no code fences, no commentary. Do not include copyrighted Bible verse text.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 12000,
    // GPT-5 series only support the default temperature, so we don't set it.
    // "low" reasoning keeps the call inside the window (gpt-5.5 rejects "minimal";
    // it accepts none/low/medium/high/xhigh). Low suits content writing.
    ...(isReasoningModel ? { reasoning_effort: "low" } : {}),
  };

  // HARD wall-clock abort — the SDK timeout alone didn't reliably stop a slow
  // reasoning call, which once left a job zombied past the function limit.
  // Raised from 150s to 10min for the gpt-5.5 authorship test (reasoning models
  // blew past 150s). Runs inside a Netlify background function (15min budget).
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 600_000);
  let resp: {
    choices: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    resp = (await client.chat.completions.create(body as never, {
      signal: controller.signal,
    })) as typeof resp;
  } finally {
    clearTimeout(abortTimer);
  }

  const content = resp.choices[0]?.message?.content ?? "";
  return {
    content,
    inputTokens: resp.usage?.prompt_tokens ?? 0,
    outputTokens: resp.usage?.completion_tokens ?? 0,
  };
}

/**
 * Full missing-chapter flow (Option A, server-side blocking). Returns the
 * render-ready workup (now saved as "ready"), or null on failure (→ 404).
 */
export async function generateAndStoreChapter(slug: string, jobId: string): Promise<ChapterWorkup | null> {
  const parsed = parseSlug(slug);
  if (!parsed) return null;
  const { book, chapter } = parsed;
  const bibleVersion = "ESV";
  let costLogged = false;
  // The ROUTE took the single atomic claim; this worker only verifies it owns
  // that exact claim. No re-claim, no spend before verification.
  const store = requireJobStore(slug, "generateAndStoreChapter");
  await verifyGenerationClaim(store, slug, jobId);

  // Admin-selected model from Supabase settings (falls back to the Netlify default).
  const settings = await getGenerationSettings();
  const model = settings.selected_text_model || CHAPTER_WORKUP_TEXT_MODEL;
  // Selectively retrieved Selah Brain rules (core + capped contextual by genre/
  // stage; QA + governance excluded) + this chapter's own review notes. Fail soft.
  const selection = await selectRulesForGeneration(slug, "copy_generation");
  const globalRules = selection.texts;
  const chapterNotes = await getChapterReviewNoteTexts(slug);
  // 1–2 approved TEXT exemplars (voice/structure/application) for this genre —
  // image_direction examples are excluded from the copy prompt. Fail soft.
  const examples = await getRelevantExamples(slug, { types: TEXT_EXAMPLE_TYPES });
  await logGenerationAudit({ action: "generate_text", slug, model, status: "started" });

  try {
    // OpenAI call (tokens spent here).
    const { content, inputTokens, outputTokens } = await generateChapterWorkup({
      book,
      chapter,
      slug,
      bibleVersion,
      model,
      globalRules,
      chapterNotes,
      examples,
    });

    // Log the text cost immediately — tokens are spent regardless of whether the
    // JSON parses. This is what was missing before (failed runs cost money but
    // weren't recorded).
    const est = estimateChapterWorkupCost({ inputTokens, outputTokens, imageCount: 0 });
    await recordCostEvent({
      requestType: "chapter_workup_text",
      provider: "openai",
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: est.totalEstimateUsd,
      metadata: { slug, book, chapter, estimated: true },
    });
    costLogged = true;

    const generated = parseChapterWorkupJson(content);
    const render = generatedToRenderWorkup(generated);
    // Terminal save is pinned to status="generating" AND this exact job ID —
    // an older worker can never overwrite a newer run (zero rows = CONFLICT).
    await completeGenerationJob(store, slug, jobId, {
      workup: render,
      version: generated.version,
      bibleVersion,
    });

    // Archive this draft as a new version (V1 is preserved; this becomes V2, …).
    await snapshotVersion(slug, "generated draft");

    await logGenerationAudit({
      action: "generate_text",
      slug,
      model,
      estimatedCost: est.totalEstimateUsd,
      status: "succeeded",
      message: "saved as draft",
    });
    return render;
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error(`[selah] generation failed for ${slug}:`, msg);
    // Terminal failure is pinned to this job ID; a newer run is never failed by
    // an old worker. Conflicts get their own audit trail (terminal outcome).
    const marked = await failGenerationJob(store, slug, jobId, msg);
    const kind = isChapterMutationError(e) && e.code === "CONFLICT" ? "generate_text_conflict" : "generate_text";
    await logGenerationAudit({
      action: kind,
      slug,
      model,
      status: "failed",
      message: marked ? msg : `${msg} (claim not owned; newer run untouched)`,
    });
    // If we never logged usage (OpenAI threw before returning, e.g. quota/timeout),
    // record an error event so failed spend/issues are still visible.
    if (!costLogged) {
      await recordCostEvent({
        requestType: "chapter_workup_text",
        provider: "openai",
        model,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        metadata: { slug, book, chapter, failed: true, error: msg },
      });
    }
    return null;
  }
}
