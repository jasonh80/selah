import type { ChapterWorkup } from "@/lib/types";
import { exodus27 } from "@/lib/chapters/exodus-27";

/**
 * Global, shared chapter workups — one canonical Selah workup per chapter.
 * Product rule: Generate once. Save forever. Personalize only when needed.
 *
 * Generation is LAZY: we never pre-generate or batch all chapters. A chapter's
 * workup is created the first time someone opens it, then cached forever and
 * served to every future user. MVP ships Exodus 27 as a seeded workup; the
 * generate-on-first-request branch is stubbed until Phase 1.
 */

// Workups that already exist (seeded + anything generated this runtime).
// In Phase 1+ this read-through cache sits over a `chapter_workups` table.
const CACHE = new Map<string, ChapterWorkup>([[exodus27.slug, exodus27]]);

export function getChapterBySlug(slug: string): ChapterWorkup | null {
  return CACHE.get(slug) ?? null;
}

export function listChapterSlugs(): string[] {
  return Array.from(CACHE.keys());
}

/** Today's chapter. MVP: fixed sample. Later: driven by a reading plan + date. */
export function getTodaysChapter(): ChapterWorkup {
  return exodus27;
}

/**
 * The single entry point pages use to open a chapter. Loading behavior:
 *   1. If the global workup is already cached, serve it.            ← MVP path
 *   2. Otherwise this is the FIRST request for this chapter:
 *        generate it ONCE, cache it (save forever), then serve it.  ← Phase 1+
 *   3. Future users get the cached workup — no regeneration.
 *
 * We never generate chapters ahead of time; generation is on demand only.
 * Personalized content (user_chapter_layers) resolves separately, on request.
 */
export async function loadGlobalChapterWorkup(slug: string): Promise<ChapterWorkup | null> {
  const cached = CACHE.get(slug);
  if (cached) return cached;

  // MVP: missing chapters return null (the route renders 404).
  // Production: this branch should
  //   - create a generation job,
  //   - persist a "generating" global workup record (status: "generating"),
  //   - render <GeneratingChapterState/> to the user while it runs,
  //   - call the AI generation pipeline ONCE for this chapter,
  //   - store the completed result (status: "ready" → later "reviewed"),
  //   - and serve the cached global workup to all future users.
  const generated = await generateChapterWorkup(slug);
  if (generated) CACHE.set(slug, generated); // save forever
  return generated;
}

/**
 * Generate one chapter's global workup on first request (OpenAI structured
 * output + 3 images, persisted to Supabase). Not built in MVP — unknown
 * chapters simply 404 for now. This is the ONLY place generation happens, and
 * it runs per-chapter, on demand — never in bulk.
 */
async function generateChapterWorkup(_slug: string): Promise<ChapterWorkup | null> {
  // TODO(phase-1): generate → store → return.
  return null;
}
