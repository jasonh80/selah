import type { ChapterWorkup } from "../types";
import { getSupabaseAdmin, warnSupabaseMissing } from "./supabase";

/**
 * The ONLY place that knows about the chapter_workups table.
 *
 * Safe by design: when Supabase isn't configured, every function no-ops (read
 * functions return null/[]), so the registry can fall back to the local
 * fixture/registry without crashing. The registry will call these later.
 */

const TABLE = "chapter_workups";

export type WorkupStatus = "draft" | "generating" | "ready" | "failed" | "reviewed";

export interface CreateGeneratingInput {
  book: string;
  chapter: number;
  slug: string;
  title: string;
  subtitle?: string;
  source?: string; // e.g. "generated", "generated-fixture", "hand-authored"
  bibleVersion?: string;
}

export interface SaveReadyInput {
  slug: string;
  workup: ChapterWorkup;
  status?: "ready" | "reviewed";
  version?: string;
  bibleVersion?: string;
}

/**
 * Returns the stored render workup for a chapter when a ready/reviewed row
 * exists, else null (caller falls back to the local source).
 */
export async function getChapterWorkupBySlug(slug: string): Promise<ChapterWorkup | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getChapterWorkupBySlug");
    return null;
  }

  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,status")
    .eq("slug", slug)
    .in("status", ["ready", "reviewed"])
    .maybeSingle();

  if (error) {
    console.error(`[selah] getChapterWorkupBySlug(${slug}) failed:`, error.message);
    return null;
  }
  return (data?.workup_json as ChapterWorkup | undefined) ?? null;
}

/** Insert a placeholder row with status 'generating' on first request. */
export async function createGeneratingChapterWorkup(input: CreateGeneratingInput): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("createGeneratingChapterWorkup");
    return;
  }

  const { error } = await db.from(TABLE).upsert(
    {
      book: input.book,
      chapter: input.chapter,
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      status: "generating" satisfies WorkupStatus,
      source: input.source ?? "generated",
      bible_version: input.bibleVersion ?? null,
      workup_json: {},
      generation_started_at: new Date().toISOString(),
    },
    { onConflict: "slug" },
  );

  if (error) console.error(`[selah] createGeneratingChapterWorkup(${input.slug}) failed:`, error.message);
}

/** Store the completed workup and mark it ready (or reviewed). */
export async function saveReadyChapterWorkup(input: SaveReadyInput): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("saveReadyChapterWorkup");
    return;
  }

  const { error } = await db
    .from(TABLE)
    .update({
      workup_json: input.workup,
      status: (input.status ?? "ready") satisfies WorkupStatus,
      version: input.version ?? null,
      bible_version: input.bibleVersion ?? null,
      generation_completed_at: new Date().toISOString(),
      generation_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", input.slug);

  if (error) console.error(`[selah] saveReadyChapterWorkup(${input.slug}) failed:`, error.message);
}

/** Mark a chapter's generation as failed so it can be retried/reviewed. */
export async function markChapterWorkupFailed(slug: string, errorMessage: string): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("markChapterWorkupFailed");
    return;
  }

  const { error } = await db
    .from(TABLE)
    .update({
      status: "failed" satisfies WorkupStatus,
      generation_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  if (error) console.error(`[selah] markChapterWorkupFailed(${slug}) failed:`, error.message);
}

/** All published workups (for browsing/sitemaps). Empty when unconfigured. */
export async function listReadyChapterWorkups(): Promise<ChapterWorkup[]> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("listReadyChapterWorkups");
    return [];
  }

  const { data, error } = await db
    .from(TABLE)
    .select("workup_json")
    .in("status", ["ready", "reviewed"])
    .order("chapter", { ascending: true });

  if (error) {
    console.error("[selah] listReadyChapterWorkups failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.workup_json as ChapterWorkup);
}
