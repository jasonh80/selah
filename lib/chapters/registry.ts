import type { ChapterWorkup } from "@/lib/types";
import { exodus27Workup, LOCAL_SOURCE, type ChapterSource } from "@/lib/chapters/source";
import {
  revisionPreviewsEnabled,
  revisionPreviewWorkups,
} from "@/lib/chapters/revision-previews";
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

// Mega revision previews (review-only artifacts for the 7→10 queue): served
// under their own "<slug>-revision-preview" slugs, dev + Netlify previews
// ONLY — fail-closed, production can never register them. Protects Jason:
// live rows stay untouched while Codex reviews proposed copy.
if (revisionPreviewsEnabled()) {
  for (const workup of revisionPreviewWorkups()) {
    LOCAL.set(workup.slug, workup);
  }
}

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

/** True when /chapter/<slug> would actually render (a servable published
 * row or a local fixture) — chapter navigation must only link PUBLISHED
 * neighbors (IQ-012: published Mark 10 linked a 404 "Next: Mark 11"). */
export async function chapterLinkable(slug: string): Promise<boolean> {
  return (await resolveChapter(slug)) !== null;
}

/**
 * Every slug the title-as-navigation dropdowns may LINK (owner approval,
 * 2026-07-19): published chapters, the legacy psalm-23 exception, and local
 * fixtures. EVERY database candidate — reviewed list included — passes
 * through the GUARDED public reader before it may link (Codex #67 P1: a
 * reviewed protected row whose serve receipt is missing/mismatched refuses
 * at /chapter/{slug}, so it must stay greyed here too). Fail-quiet: any
 * error just leaves that chapter greyed — nothing linkable can 404 (IQ-012).
 * Injectable core so verify:today can prove it without Supabase.
 */
export interface NavigableSlugsDeps {
  supabaseConfigured(): boolean;
  listReviewedSlugsNewestFirst(): Promise<string[]>;
  /** GUARDED, DATABASE-ONLY published read: null = unservable/missing. */
  readPublishedChapter(slug: string): Promise<ChapterWorkup | null>;
  localSlugs(): string[];
}

export async function listNavigableSlugsWith(deps: NavigableSlugsDeps): Promise<string[]> {
  const slugs = new Set<string>(deps.localSlugs());
  if (deps.supabaseConfigured()) {
    let reviewed: string[] = [];
    try {
      reviewed = await deps.listReviewedSlugsNewestFirst();
    } catch (e) {
      console.warn("[selah] navigable-slug lookup failed:", (e as Error).message);
    }
    for (const slug of [...reviewed, "psalm-23"]) {
      if (slugs.has(slug)) continue;
      try {
        if (await deps.readPublishedChapter(slug)) slugs.add(slug);
      } catch (e) {
        // quiet: this chapter simply stays greyed
        console.warn(`[selah] navigable candidate ${slug} unreadable:`, (e as Error).message);
      }
    }
  }
  return [...slugs];
}

export async function listNavigableSlugs(): Promise<string[]> {
  return listNavigableSlugsWith({
    supabaseConfigured: isSupabaseConfigured,
    listReviewedSlugsNewestFirst,
    readPublishedChapter: getChapterWorkupBySlug,
    localSlugs: listChapterSlugs,
  });
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
