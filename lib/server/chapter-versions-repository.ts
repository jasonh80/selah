// SERVER-ONLY. Append-only draft version archive. The chapter_workups row is the
// single working draft (preview/publish read it); this preserves each saved draft
// so a new generation never overwrites an earlier one. Fails soft.
import type { ChapterWorkup } from "../types";
import { getSupabaseAdmin } from "./supabase";
import { chapterMutationDecision } from "./protected-chapters";
import type { ChapterRowSnapshot } from "./protected-chapters";
import {
  requireJobStore,
  stripTransientJobControlKeys,
  TRANSIENT_JOB_CONTROL_KEYS,
} from "./generation-jobs";

const TABLE = "chapter_workup_versions";

export interface VersionMeta {
  version: number;
  label: string | null;
  status: string | null;
  created_at?: string;
}

// Snapshot the CURRENT working draft (chapter_workups) as the next version.
// Returns the new version number, or null if there's nothing to snapshot.
// TEST SEAM (offline safety gates only): lets a hermetic verify script prove
// snapshot-before-mutation behavior without Supabase. Never set in production.
let snapshotOverrideForTesting:
  | ((slug: string, label?: string) => Promise<number | null>)
  | null = null;
export function __setVersionSnapshotForTesting(
  fn: ((slug: string, label?: string) => Promise<number | null>) | null,
): void {
  snapshotOverrideForTesting = fn;
}

// TEST SEAM (offline safety gates only): archived-version reads without
// Supabase, so the verifier can drive the REAL restore path end to end.
let versionWorkupOverrideForTesting:
  | ((slug: string, version: number) => Promise<ChapterWorkup | null>)
  | null = null;
export function __setVersionWorkupForTesting(
  fn: ((slug: string, version: number) => Promise<ChapterWorkup | null>) | null,
): void {
  versionWorkupOverrideForTesting = fn;
}

export async function snapshotVersion(slug: string, label?: string): Promise<number | null> {
  if (snapshotOverrideForTesting) return snapshotOverrideForTesting(slug, label);
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
    // Job-control keys (text/image/redo claims) describe the LIVE row, never
    // an archived draft — archiving them would let a later restore resurrect
    // a dead claim or an already-decided redo candidate.
    workup_json: stripTransientJobControlKeys(json),
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
  if (versionWorkupOverrideForTesting) return versionWorkupOverrideForTesting(slug, version);
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
  const decision = await chapterMutationDecision(slug, "restoreVersion");
  if (!decision.allowed) {
    console.error(`[selah] mutation guard: ${decision.reason}`);
    return false;
  }
  const workup = await getVersionWorkup(slug, version);
  if (!workup) return false;
  const error = await conditionalDraftWrite(slug, workup, decision.expected);
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
  const decision = await chapterMutationDecision(slug, "applyMergedDraft");
  if (!decision.allowed) {
    console.error(`[selah] mutation guard: ${decision.reason}`);
    return { ok: false, version: null };
  }
  const error = await conditionalDraftWrite(slug, workup, decision.expected);
  if (error) {
    console.error(`[selah] applyMergedDraft(${slug}) failed:`, error.message);
    return { ok: false, version: null };
  }
  const version = await snapshotVersion(slug, label ?? "selected merge");
  return { ok: true, version };
}

// Conditional draft write shared by restore/merge, routed through the SAME
// JobStorePort the claim lifecycle uses so its predicate semantics match
// exactly. The write re-asserts the decision's revision token AND — in the
// same conditional write, not a separate read — the ABSENCE of every
// transient job-control key (Codex review, PR #51 P1): a claim landing
// between any earlier check and this write makes the predicates match zero
// rows, so a whole-workup write can never erase a live paid claim or an
// unresolved redo candidate.
async function conditionalDraftWrite(
  slug: string,
  workup: ChapterWorkup,
  expected: ChapterRowSnapshot | null,
): Promise<{ message: string } | null> {
  // Restored archives (written before snapshot-time stripping landed) and
  // browser-supplied merged drafts must never carry job-control keys into
  // the live row — they could resurrect a dead claim or a decided candidate.
  const cleaned = stripTransientJobControlKeys(
    workup as unknown as Record<string, unknown>,
  );
  let store;
  try {
    store = requireJobStore(slug, "conditionalDraftWrite");
  } catch (e) {
    return { message: String((e as Error).message) };
  }
  const changed = await store.update(
    slug,
    {
      status: expected?.status ?? "draft",
      ...(expected?.updatedAt ? { updatedAt: expected.updatedAt } : {}),
      json: TRANSIENT_JOB_CONTROL_KEYS.map((key) => ({ key, equals: null })),
    },
    {
      workup_json: cleaned,
      status: "draft",
      updated_at: new Date().toISOString(),
    },
  );
  if (typeof changed === "object") return { message: changed.error };
  if (changed !== 1) {
    return {
      message: `conflict: "${slug}" changed since the mutability check, or a job/redo is active (zero rows written)`,
    };
  }
  return null;
}
