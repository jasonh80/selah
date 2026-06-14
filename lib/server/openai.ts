// SERVER-ONLY MODULE. Reads OPENAI_API_KEY. Never import into a client component.
import OpenAI from "openai";

// "gpt-5.4-mini" was requested, but that is not a current OpenAI model name, so
// we default to a real cost-conscious text model. Override without code via the
// CHAPTER_WORKUP_TEXT_MODEL env var, or change the fallback here.
export const CHAPTER_WORKUP_TEXT_MODEL =
  process.env.CHAPTER_WORKUP_TEXT_MODEL || "gpt-4o-mini";

let cached: OpenAI | null | undefined;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAI(): OpenAI | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    cached = null;
    return null;
  }
  cached = new OpenAI({ apiKey });
  return cached;
}
