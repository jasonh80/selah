import type { ChapterWorkup } from "@/lib/types";
import { exodus27 } from "@/lib/chapters/exodus-27";

/**
 * Global, shared chapter workups — one canonical Selah workup per chapter.
 * Product rule: Generate once. Save forever. Personalize only when needed.
 *
 * MVP: workups are local typed objects. In Phase 1+ this becomes a read-through
 * cache over a `chapter_workups` table — but callers (pages) won't change,
 * because they already go through the loaders below.
 */
const REGISTRY: Record<string, ChapterWorkup> = {
  [exodus27.slug]: exodus27,
};

export function getChapterBySlug(slug: string): ChapterWorkup | null {
  return REGISTRY[slug] ?? null;
}

export function listChapterSlugs(): string[] {
  return Object.keys(REGISTRY);
}

/** Today's chapter. MVP: fixed sample. Later: driven by a reading plan + date. */
export function getTodaysChapter(): ChapterWorkup {
  return exodus27;
}

/**
 * Production loading behavior (kept as the single entry point so the UI never
 * changes when the backend arrives):
 *   1. Check for the global chapter workup.
 *   2. If it exists, load it.            ← MVP returns here
 *   3. If not, generate it once (OpenAI).      ┐ Phase 1+ hook —
 *   4. Store it (Supabase chapter_workups).    │ intentionally not built yet.
 *   5. Serve the same global workup to future users.
 *   6. Personalized content (user_chapter_layers) resolves separately, on demand.
 */
export async function loadGlobalChapterWorkup(slug: string): Promise<ChapterWorkup | null> {
  const existing = getChapterBySlug(slug);
  if (existing) return existing;
  // TODO(phase-1): generate → store → return. Not built in MVP.
  return null;
}
