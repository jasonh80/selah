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

// 1–2 relevant approved examples for a chapter, matched by genre (voice first).
export async function getRelevantExamples(
  slug: string,
  limit = 2,
): Promise<{ title: string; exampleType: string; content: string }[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const genre = genreForSlug(slug);
  if (!genre) return [];
  const { data, error } = await db
    .from(TABLE)
    .select("title,example_type,content")
    .eq("active", true)
    .eq("genre", genre)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  const rows = data as { title: string; example_type: string; content: string }[];
  // Voice exemplars first, then the rest.
  rows.sort((a, b) => (b.example_type === "voice" ? 1 : 0) - (a.example_type === "voice" ? 1 : 0));
  return rows.slice(0, limit).map((r) => ({ title: r.title, exampleType: r.example_type, content: r.content }));
}
