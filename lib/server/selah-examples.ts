// SERVER-ONLY. Approved Examples layer for Selah Brain: a small set of approved
// exemplars retrieved 1–2 at a time (by genre) to demonstrate the desired voice.
// Examples teach REGISTER, not content. All reads fail soft.
import { getSupabaseAdmin } from "./supabase";
import { genreForSlug } from "./selah-brain";

const TABLE = "selah_approved_examples";

export type ExampleType = "voice" | "structure" | "scene_check" | "application" | "image_direction";

export interface ApprovedExample {
  id: string;
  title: string;
  source_title: string | null;
  genre: string;
  example_type: string;
  content?: string;
  active: boolean;
  created_at?: string;
}

export async function addExample(input: {
  title: string;
  genre: string;
  example_type: string;
  content: string;
  source_title?: string;
}): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { error } = await db.from(TABLE).insert({
    title: input.title,
    genre: input.genre,
    example_type: input.example_type,
    content: input.content,
    source_title: input.source_title ?? null,
    active: true,
  });
  if (error) {
    console.error("[selah] addExample failed:", error.message);
    return false;
  }
  return true;
}

export async function listExamples(): Promise<ApprovedExample[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from(TABLE)
    .select("id,title,source_title,genre,example_type,active,created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as ApprovedExample[];
}

export async function setExampleActive(id: string, active: boolean): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db || !id) return false;
  const { error } = await db.from(TABLE).update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  return !error;
}

export async function deleteExample(id: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db || !id) return false;
  const { error } = await db.from(TABLE).delete().eq("id", id);
  return !error;
}

// Example types that belong in the TEXT (copy) prompt — image_direction is for
// the image stage and is deliberately excluded here.
export const TEXT_EXAMPLE_TYPES = ["voice", "structure", "application", "scene_check"];

// Sentinel genre for voice packs that apply to EVERY chapter. Voice retrieval
// falls back to this when a chapter's genre has no voice pack — or has no
// genre at all (e.g. exodus-34 today), which previously meant NO exemplar
// (Codex #73 source-audit handoff, board #29, 2026-07-20).
export const GLOBAL_VOICE_GENRE = "global";

export interface RetrievedExample {
  title: string;
  exampleType: string;
  content: string;
}

interface CandidateRow {
  title: string;
  genre: string;
  example_type: string;
  content: string;
  created_at?: string;
}

/**
 * Pure selection core (offline-provable, see verify:example-library).
 * Prompt-load budget is FIXED (board #29 owner baton, 2026-07-20):
 *   - at most ONE global voice pack (the reliable every-chapter fallback),
 *   - at most ONE genre voice companion,
 *   - at most ONE genre form example (form is never global — shape is
 *     genre-specific by nature).
 * Rows must arrive newest-first; ties keep the first seen.
 */
export function selectRelevantExamples(
  rows: CandidateRow[],
  genre: string | null,
  opts: { types?: string[] } = {},
): RetrievedExample[] {
  const allowed = (r: CandidateRow) =>
    !opts.types || opts.types.length === 0 || opts.types.includes(r.example_type);
  const globalVoice = rows.find(
    (r) => r.example_type === "voice" && r.genre === GLOBAL_VOICE_GENRE && allowed(r),
  );
  const genreVoice = genre
    ? rows.find((r) => r.example_type === "voice" && r.genre === genre && allowed(r))
    : undefined;
  const genreForm = genre
    ? rows.find((r) => r.example_type !== "voice" && r.genre === genre && allowed(r))
    : undefined;
  return [globalVoice, genreVoice, genreForm]
    .filter((r): r is CandidateRow => Boolean(r))
    .map((r) => ({ title: r.title, exampleType: r.example_type, content: r.content }));
}

// Relevant approved examples for a chapter: global voice fallback + at most
// one genre voice companion + at most one genre form example. Reads fail soft.
export async function getRelevantExamples(
  slug: string,
  opts: { types?: string[] } = {},
): Promise<RetrievedExample[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const genre = genreForSlug(slug);
  const genres = genre ? [genre, GLOBAL_VOICE_GENRE] : [GLOBAL_VOICE_GENRE];
  let q = db
    .from(TABLE)
    .select("title,genre,example_type,content,created_at")
    .eq("active", true)
    .in("genre", genres);
  if (opts.types && opts.types.length) q = q.in("example_type", opts.types);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(30);
  if (error || !data) return [];
  return selectRelevantExamples(data as CandidateRow[], genre, opts);
}
