import type { ChapterWorkup } from "@/lib/types";
import { exodus27Workup, LOCAL_SOURCE, type ChapterSource } from "@/lib/chapters/source";
import { isSupabaseConfigured } from "@/lib/server/supabase";
import { getChapterWorkupBySlug } from "@/lib/server/chapter-workups-repository";
import { generationAllowed, generateAndStoreChapter } from "@/lib/server/generate-chapter-workup";

/**
 * Resolves a global chapter workup with this priority:
 *   1. Supabase, if configured and a ready/reviewed workup exists.
 *   2. Local source (generated fixture or hand-authored) for known chapters.
 *   3. null → the route 404s (lazy generation comes later).
 *
 * Safe by design: Supabase being unconfigured or erroring never crashes the
 * app — it falls back to the local source and only logs a server warning.
 * No OpenAI / generation here yet.
 */

const TODAY_SLUG = "exodus-27";

// Known local chapters (seed for fallback + chapter listing).
const seed = exodus27Workup();
const LOCAL = new Map<string, ChapterWorkup>([[seed.slug, seed]]);

export function localChapterBySlug(slug: string): ChapterWorkup | null {
  return LOCAL.get(slug) ?? null;
}

export function listChapterSlugs(): string[] {
  return Array.from(LOCAL.keys());
}

export interface ResolvedChapter {
  workup: ChapterWorkup;
  source: ChapterSource;
}

export async function resolveChapter(slug: string): Promise<ResolvedChapter | null> {
  // 1) Supabase read-through (ready/reviewed only).
  if (isSupabaseConfigured()) {
    try {
      const fromDb = await getChapterWorkupBySlug(slug);
      if (fromDb) return { workup: fromDb, source: "Supabase" };
    } catch (e) {
      console.warn(`[selah] Supabase read failed for ${slug}, falling back:`, (e as Error).message);
    }
  }

  // 2) Local fallback.
  const local = localChapterBySlug(slug);
  if (local) return { workup: local, source: LOCAL_SOURCE };

  // 3) Generate on first request (gated by flag + allowlist; text only).
  if (generationAllowed(slug)) {
    const generated = await generateAndStoreChapter(slug);
    if (generated) return { workup: generated, source: "Supabase" };
  }

  // 4) Not found (yet).
  return null;
}

export async function resolveTodaysChapter(): Promise<ResolvedChapter> {
  // Exodus 27 always exists locally, so this never returns null.
  return (await resolveChapter(TODAY_SLUG))!;
}

/** Back-compat: workup only (used where the source isn't needed). */
export async function loadGlobalChapterWorkup(slug: string): Promise<ChapterWorkup | null> {
  const resolved = await resolveChapter(slug);
  return resolved?.workup ?? null;
}
