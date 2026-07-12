import type { ChapterWorkup } from "../types";
import { getSupabaseAdmin, warnSupabaseMissing } from "./supabase";
import { assertChapterMutable, ChapterMutationError } from "./protected-chapters";

// NOTE (issue #8): the generation lifecycle (claim → verify → complete/fail)
// lives EXCLUSIVELY in generation-jobs.ts with single-use job ids. This module
// deliberately exposes no generating/save/fail mutators — there is no direct-
// repository path around the job claim.

/**
 * The ONLY place that knows about the chapter_workups table.
 *
 * Safe by design: when Supabase isn't configured, every function no-ops (read
 * functions return null/[]), so the registry can fall back to the local
 * fixture/registry without crashing. The registry will call these later.
 */

const TABLE = "chapter_workups";

// TEMPORARY (issue #8 PR 1 → remove in PR 3): protected legacy chapters stored
// as "ready" that remain publicly served until the validated PR 3 publisher
// migrates them to "reviewed". Mutation is blocked by PROTECTED_SLUGS anyway.
const LEGACY_PUBLIC_READY_EXCEPTIONS: readonly string[] = ["psalm-23"];

export type WorkupStatus = "draft" | "generating" | "ready" | "failed" | "reviewed";

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
  //
  // TEMPORARY, NAMED EXCEPTION (remove in PR 3): psalm-23 predates the publish
  // flow and is stored as legacy "ready". Publishing it through the CURRENT
  // publisher was rejected in review (it is the browser-trusting path PR 3
  // replaces), so this explicitly protected, immutable chapter stays served
  // until the validated PR 3 publisher migrates it. It cannot be mutated (the
  // guard protects it regardless of status), and no OTHER ready row is served.
  const servable = LEGACY_PUBLIC_READY_EXCEPTIONS.includes(slug)
    ? ["reviewed", "ready"]
    : ["reviewed"];
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,status")
    .eq("slug", slug)
    .in("status", servable)
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
export async function publishChapter(slug: string): Promise<string> {
  // Publishing promotes exactly a DRAFT (per-action transition). Legacy "ready"
  // rows and re-publishes are refused; the write is conditioned on the exact
  // expected revision, selects the changed row, and sets reviewed_at.
  const expected = await assertChapterMutable(slug, "publishChapter");
  const db = getSupabaseAdmin();
  if (!db) {
    throw new ChapterMutationError("WRITE_FAILED", "publishChapter", slug, "storage is not configured");
  }
  const now = new Date().toISOString();
  let query = db
    .from(TABLE)
    .update({ status: "reviewed" satisfies WorkupStatus, reviewed_at: now, updated_at: now })
    .eq("slug", slug)
    .eq("status", expected?.status ?? "draft");
  if (expected?.updatedAt) query = query.eq("updated_at", expected.updatedAt);
  const { data, error } = await query.select("slug,status");
  if (error) throw new ChapterMutationError("WRITE_FAILED", "publishChapter", slug, error.message);
  if (!data || data.length === 0) {
    throw new ChapterMutationError(
      "CONFLICT", "publishChapter", slug,
      "row changed between validation and publish (zero-row conditional write)",
    );
  }
  return "reviewed";
}

/**
 * Update ONLY workup_json on an existing row, leaving status/version untouched.
 * Used by image generation to swap placeholder images for stored ones without
 * touching the (already-reviewed) text. Never creates a row.
 */

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



/** Mark a chapter's generation as failed so it can be retried/reviewed. */

/** All published workups (for browsing/sitemaps). Empty when unconfigured. */
export async function listReadyChapterWorkups(): Promise<ChapterWorkup[]> {
  const db = getSupabaseAdmin();
  if (!db) {
    warnSupabaseMissing("listReadyChapterWorkups");
    return [];
  }

  // Same temporary psalm-23 exception as getChapterWorkupBySlug (PR 3 removes).
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json,slug,status")
    .or(`status.eq.reviewed,and(status.eq.ready,slug.in.(${LEGACY_PUBLIC_READY_EXCEPTIONS.join(",")}))`)
    .order("chapter", { ascending: true });

  if (error) {
    console.error("[selah] listReadyChapterWorkups failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.workup_json as ChapterWorkup);
}
