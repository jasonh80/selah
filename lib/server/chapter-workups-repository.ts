import type { ChapterWorkup } from "../types";
import { getSupabaseAdmin, warnSupabaseMissing } from "./supabase";
import { assertChapterMutable, chapterMutationDecision } from "./protected-chapters";

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
  status?: "ready" | "reviewed" | "draft";
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

  // Issue #8 invariant 1: ONLY published ("reviewed") chapters are public.
  // Legacy "ready" rows are quarantined until they pass the publish gate.
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,status")
    .eq("slug", slug)
    .eq("status", "reviewed")
    .maybeSingle();

  if (error) {
    console.error(`[selah] getChapterWorkupBySlug(${slug}) failed:`, error.message);
    return null;
  }
  return (data?.workup_json as ChapterWorkup | undefined) ?? null;
}

/** Fetch a workup at ANY status (incl. draft) — for admin preview only. */
export async function getDraftWorkup(
  slug: string,
): Promise<{ workup: ChapterWorkup; status: string } | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getDraftWorkup");
    return null;
  }
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,status")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data?.workup_json) return null;
  return { workup: data.workup_json as ChapterWorkup, status: (data.status as string) ?? "unknown" };
}

/** Promote a draft to published (status → reviewed). Returns the new status. */
export async function publishChapter(slug: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("publishChapter");
    return null;
  }
  // Published chapters are immutable — re-publishing is refused (fail closed on
  // ambiguity). Legacy "ready" rows may still pass through this gate once.
  const current = await db.from(TABLE).select("status").eq("slug", slug).maybeSingle();
  if (current.error) {
    console.error(`[selah] publishChapter(${slug}) status check failed:`, current.error.message);
    return null;
  }
  if ((current.data?.status as string | undefined) === "reviewed") {
    console.error(`[selah] publishChapter(${slug}) refused: already published`);
    return null;
  }
  const { error } = await db.from(TABLE).update({ status: "reviewed" }).eq("slug", slug).neq("status", "reviewed");
  if (error) {
    console.error(`[selah] publishChapter(${slug}) failed:`, error.message);
    return null;
  }
  return "reviewed";
}

/**
 * Update ONLY workup_json on an existing row, leaving status/version untouched.
 * Used by image generation to swap placeholder images for stored ones without
 * touching the (already-reviewed) text. Never creates a row.
 */
export async function updateChapterWorkupJson(slug: string, workup: ChapterWorkup): Promise<void> {
  await assertChapterMutable(slug, "updateChapterWorkupJson");
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("updateChapterWorkupJson");
    return;
  }
  const { error } = await db.from(TABLE).update({ workup_json: workup }).eq("slug", slug);
  if (error) console.error(`[selah] updateChapterWorkupJson(${slug}) failed:`, error.message);
}

/** Raw status of a chapter row (any status), or null. */
export async function getChapterStatus(slug: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("getChapterStatus");
    return null;
  }
  const { data, error } = await db
    .from(TABLE)
    .select("status,generation_started_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return (data?.status as string | undefined) ?? null;
}

/** Insert a placeholder row with status 'generating' on first request. */
export async function createGeneratingChapterWorkup(input: CreateGeneratingInput): Promise<void> {
  await assertChapterMutable(input.slug, "createGeneratingChapterWorkup");
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
      generation_error: null,
    },
    { onConflict: "slug" },
  );

  if (error) console.error(`[selah] createGeneratingChapterWorkup(${input.slug}) failed:`, error.message);
}

/** Store the completed workup and mark it ready (or reviewed). */
export async function saveReadyChapterWorkup(input: SaveReadyInput): Promise<void> {
  await assertChapterMutable(input.slug, "saveReadyChapterWorkup");
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
  // Non-throwing guard: failure bookkeeping must never overwrite a protected or
  // published row, but refusing it should not mask the original error either.
  const decision = await chapterMutationDecision(slug, "markChapterWorkupFailed");
  if (!decision.allowed) {
    console.error(`[selah] mutation guard: ${decision.reason}`);
    return;
  }
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
    .eq("status", "reviewed")
    .order("chapter", { ascending: true });

  if (error) {
    console.error("[selah] listReadyChapterWorkups failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.workup_json as ChapterWorkup);
}
