// SERVER-ONLY. Append-only draft version archive. The chapter_workups row is the
// single working draft (preview/publish read it); this preserves each saved draft
// so a new generation never overwrites an earlier one. Fails soft.
import type { ChapterWorkup } from "../types";
import { getSupabaseAdmin } from "./supabase";

const TABLE = "chapter_workup_versions";

export interface VersionMeta {
  version: number;
  label: string | null;
  status: string | null;
  created_at?: string;
}

// Snapshot the CURRENT working draft (chapter_workups) as the next version.
// Returns the new version number, or null if there's nothing to snapshot.
export async function snapshotVersion(slug: string, label?: string): Promise<number | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const cur = await db.from("chapter_workups").select("workup_json,status").eq("slug", slug).maybeSingle();
  if (cur.error || !cur.data?.workup_json) return null;
  // Don't snapshot an empty placeholder (status 'generating' with {} json).
  const json = cur.data.workup_json as Record<string, unknown>;
  if (!json || Object.keys(json).length === 0) return null;

  const last = await db
    .from(TABLE)
    .select("version")
    .eq("slug", slug)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = ((last.data?.version as number | undefined) ?? 0) + 1;

  const ins = await db.from(TABLE).insert({
    slug,
    version: next,
    label: label ?? null,
    status: (cur.data.status as string | null) ?? null,
    workup_json: cur.data.workup_json,
  });
  if (ins.error) {
    console.error(`[selah] snapshotVersion(${slug}) failed:`, ins.error.message);
    return null;
  }
  return next;
}

export async function listVersions(slug: string): Promise<VersionMeta[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from(TABLE)
    .select("version,label,status,created_at")
    .eq("slug", slug)
    .order("version", { ascending: true });
  if (error || !data) return [];
  return data as VersionMeta[];
}

export async function getVersionWorkup(slug: string, version: number): Promise<ChapterWorkup | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from(TABLE)
    .select("workup_json")
    .eq("slug", slug)
    .eq("version", version)
    .maybeSingle();
  if (error || !data?.workup_json) return null;
  return data.workup_json as ChapterWorkup;
}

// Restore an existing archived version as the working draft (kept 'draft').
// Does NOT create a new version — the archive is unchanged. Never publishes.
export async function restoreVersion(slug: string, version: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const workup = await getVersionWorkup(slug, version);
  if (!workup) return false;
  const { error } = await db
    .from("chapter_workups")
    .update({ workup_json: workup, status: "draft", updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) {
    console.error(`[selah] restoreVersion(${slug},${version}) failed:`, error.message);
    return false;
  }
  return true;
}

// Write a chosen/merged workup to the working draft (kept as 'draft' — never
// published) and snapshot it as a new version for traceability.
export async function applyMergedDraft(
  slug: string,
  workup: ChapterWorkup,
  label?: string,
): Promise<{ ok: boolean; version: number | null }> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, version: null };
  const up = await db
    .from("chapter_workups")
    .update({ workup_json: workup, status: "draft", updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (up.error) {
    console.error(`[selah] applyMergedDraft(${slug}) failed:`, up.error.message);
    return { ok: false, version: null };
  }
  const version = await snapshotVersion(slug, label ?? "selected merge");
  return { ok: true, version };
}
