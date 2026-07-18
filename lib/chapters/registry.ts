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

/**
 * Injectable core of /today resolution, so the offline verifier can prove the
 * search order without Supabase. The REAL wiring is resolveTodaysChapter below.
 */
export interface TodaysChapterDeps {
  supabaseConfigured(): boolean;
  listReviewedSlugsNewestFirst(): Promise<string[]>;
  /** GUARDED, DATABASE-ONLY published read: null = unservable/missing. */
  readPublishedChapter(slug: string): Promise<ChapterWorkup | null>;
  /** Guaranteed non-null final fallback (local Exodus 27). */
  localFallback(): Promise<ResolvedChapter>;
}

export async function resolveTodaysChapterWith(
  deps: TodaysChapterDeps,
): Promise<ResolvedChapter> {
  // Newest published chapter first ("newest" = greatest reviewed_at). The
  // candidate walk is DATABASE-ONLY (Codex review, PR #49 P1): each candidate
  // resolves through the GUARDED published reader, so an unservable or failing
  // candidate is SKIPPED and the search continues to the next-newest published
  // chapter — the local fallback can never truncate the search early. Only
  // after every reviewed candidate is exhausted does the local chapter serve.
  if (deps.supabaseConfigured()) {
    let slugs: string[] = [];
    try {
      slugs = await deps.listReviewedSlugsNewestFirst();
    } catch (e) {
      console.warn(
        "[selah] newest-published lookup failed, falling back:",
        (e as Error).message,
      );
    }
    for (const slug of slugs) {
      try {
        const workup = await deps.readPublishedChapter(slug);
        if (workup) return { workup, source: "Supabase" };
      } catch (e) {
        // A single unreadable candidate must not end the search.
        console.warn(
          `[selah] published candidate ${slug} unreadable, trying the next:`,
          (e as Error).message,
        );
      }
    }
  }
  return deps.localFallback();
}

export async function resolveTodaysChapter(): Promise<ResolvedChapter> {
  return resolveTodaysChapterWith({
    supabaseConfigured: isSupabaseConfigured,
    listReviewedSlugsNewestFirst,
    readPublishedChapter: getChapterWorkupBySlug,
    // Exodus 27 always exists locally, so this never returns null.
    localFallback: async () => (await resolveChapter(FALLBACK_SLUG))!,
  });
}

/** Back-compat: workup only (used where the source isn't needed). */
export async function loadGlobalChapterWorkup(slug: string): Promise<ChapterWorkup | null> {
  const resolved = await resolveChapter(slug);
  return resolved?.workup ?? null;
}
