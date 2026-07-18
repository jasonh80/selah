import type { ChapterWorkup } from "@/lib/types";
import { exodus27Workup, LOCAL_SOURCE, type ChapterSource } from "@/lib/chapters/source";
import { isSupabaseConfigured } from "@/lib/server/supabase";
import {
  getChapterWorkupBySlug,
  listReviewedSlugsNewestFirst,
} from "@/lib/server/chapter-workups-repository";

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

// Guaranteed local fallback when nothing published is servable (Supabase
// unconfigured, unreachable, or empty). NOT the default any more — /today
// serves the newest published chapter first (owner decision, 2026-07-17).
const FALLBACK_SLUG = "exodus-27";

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

  // 3) Not found here — the chapter route handles lazy async generation.
  return null;
}

export async function resolveTodaysChapter(): Promise<ResolvedChapter> {
  // Newest published chapter first ("newest" = greatest reviewed_at). Every
  // candidate resolves through resolveChapter → getChapterWorkupBySlug, which
  // enforces the protected-chapter serve guard — an unservable row is skipped,
  // never served. Any failure falls through to the guaranteed local chapter.
  if (isSupabaseConfigured()) {
    try {
      for (const slug of await listReviewedSlugsNewestFirst()) {
        const resolved = await resolveChapter(slug);
        if (resolved) return resolved;
      }
    } catch (e) {
      console.warn(
        "[selah] newest-published lookup failed, falling back:",
        (e as Error).message,
      );
    }
  }
  // Exodus 27 always exists locally, so this never returns null.
  return (await resolveChapter(FALLBACK_SLUG))!;
}

/** Back-compat: workup only (used where the source isn't needed). */
export async function loadGlobalChapterWorkup(slug: string): Promise<ChapterWorkup | null> {
  const resolved = await resolveChapter(slug);
  return resolved?.workup ?? null;
}
