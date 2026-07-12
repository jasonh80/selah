// SERVER-ONLY. Issue #8 PR 1: single-use generation job claims.
//
// ONE atomic claim (unique collision-resistant job ID) is taken by the ROUTE;
// the WORKER verifies that exact claim and every terminal write (save/fail)
// re-asserts it. An older worker can never overwrite or fail a newer run:
// its job ID no longer matches, so its conditional writes change zero rows.
//
// The job ID lives inside workup_json (jsonb) — no schema change. Storage is
// abstracted behind JobStorePort so the offline integration tests exercise the
// REAL claim → worker → save/fail orchestration against a fake store.
import { randomUUID } from "node:crypto";
import type { ChapterWorkup } from "../types";
import { getSupabaseAdmin } from "./supabase";
import {
  decideMutation,
  ChapterMutationError,
  type RowLookup,
} from "./protected-chapters";

export const TEXT_JOB_KEY = "generationJobId";
export const IMAGE_JOB_KEY = "imageJobId";

export interface JobRow {
  status: string;
  updatedAt: string | null;
  workupJson: Record<string, unknown>;
}

export interface JobPredicates {
  status: string;
  updatedAt?: string | null; // when provided non-null, asserted on the write
  jsonKey?: string; // e.g. TEXT_JOB_KEY
  jsonEquals?: string | null; // required value (null = key must be absent)
}

export interface JobStorePort {
  read(slug: string): Promise<JobRow | null | { error: string }>;
  insert(slug: string, payload: Record<string, unknown>): Promise<"ok" | "duplicate" | { error: string }>;
  /** Conditional UPDATE honoring ALL predicates; returns changed-row count. */
  update(slug: string, predicates: JobPredicates, next: Record<string, unknown>): Promise<number | { error: string }>;
}

function toLookup(row: JobRow | null | { error: string }): RowLookup {
  if (row === null) return { kind: "missing" };
  if (typeof row === "object" && "error" in row) return { kind: "error", message: row.error };
  return { kind: "row", row: { status: row.status, updatedAt: row.updatedAt } };
}

export function newJobId(): string {
  return randomUUID(); // collision-resistant, never a timestamp
}

export interface ClaimMeta {
  book: string;
  chapter: number;
  title: string;
  source?: string;
  bibleVersion?: string;
}

/**
 * Atomic single claim for TEXT generation (route-side; the worker never
 * re-claims). Missing row → INSERT (duplicate = conflict). Existing draft/
 * failed row → conditional update pinned to status + updated_at. The claim
 * stamps status="generating" + workup_json[TEXT_JOB_KEY]=jobId.
 */
export async function claimGenerationJob(
  store: JobStorePort,
  slug: string,
  meta: ClaimMeta,
): Promise<string> {
  const row = await store.read(slug);
  const decision = decideMutation("createGeneratingChapterWorkup", slug, toLookup(row));
  if (!decision.allowed) throw new ChapterMutationError("REFUSED", "claimGenerationJob", slug, decision.reason);

  const jobId = newJobId();
  const now = new Date().toISOString();
  const base = {
    status: "generating",
    generation_started_at: now,
    generation_error: null,
    updated_at: now,
  };

  if (decision.expected === null) {
    const inserted = await store.insert(slug, {
      ...base,
      slug,
      book: meta.book,
      chapter: meta.chapter,
      title: meta.title,
      subtitle: null,
      source: meta.source ?? "generated",
      bible_version: meta.bibleVersion ?? null,
      workup_json: { [TEXT_JOB_KEY]: jobId },
    });
    if (inserted === "duplicate") {
      throw new ChapterMutationError("CONFLICT", "claimGenerationJob", slug, "another claim won the insert race");
    }
    if (typeof inserted === "object") {
      throw new ChapterMutationError("WRITE_FAILED", "claimGenerationJob", slug, inserted.error);
    }
    return jobId;
  }

  // Existing draft/failed row: preserve its content, stamp the claim.
  const existingJson = (row && !("error" in row) && row.workupJson) || {};
  const changed = await store.update(
    slug,
    { status: decision.expected.status, updatedAt: decision.expected.updatedAt },
    { ...base, workup_json: { ...existingJson, [TEXT_JOB_KEY]: jobId } },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "claimGenerationJob", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "claimGenerationJob", slug, "row changed during claim (zero-row write)");
  }
  return jobId;
}

/** Worker-side: verify THIS worker still owns the live claim. No spend before this. */
export async function verifyGenerationClaim(store: JobStorePort, slug: string, jobId: string): Promise<void> {
  if (!jobId) throw new ChapterMutationError("REFUSED", "verifyGenerationClaim", slug, "missing job id");
  const row = await store.read(slug);
  if (!row || (typeof row === "object" && "error" in row)) {
    throw new ChapterMutationError("REFUSED", "verifyGenerationClaim", slug, "cannot verify claim (row unreadable)");
  }
  if (row.status !== "generating" || row.workupJson?.[TEXT_JOB_KEY] !== jobId) {
    throw new ChapterMutationError("CONFLICT", "verifyGenerationClaim", slug, "claim is not owned by this worker");
  }
}

/** Terminal SUCCESS: pinned to status="generating" AND this exact job ID. */
export async function completeGenerationJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  result: { workup: ChapterWorkup; version?: string; bibleVersion?: string },
): Promise<void> {
  const changed = await store.update(
    slug,
    { status: "generating", jsonKey: TEXT_JOB_KEY, jsonEquals: jobId },
    {
      workup_json: result.workup,
      status: "draft",
      version: result.version ?? null,
      bible_version: result.bibleVersion ?? null,
      generation_completed_at: new Date().toISOString(),
      generation_error: null,
      updated_at: new Date().toISOString(),
    },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "completeGenerationJob", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "completeGenerationJob", slug, "stale worker: a newer run owns this chapter");
  }
}

/** Terminal FAILURE: same pinning; an old worker can never fail a newer run. Never throws. */
export async function failGenerationJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  message: string,
): Promise<boolean> {
  const changed = await store.update(
    slug,
    { status: "generating", jsonKey: TEXT_JOB_KEY, jsonEquals: jobId },
    { status: "failed", generation_error: message.slice(0, 300), updated_at: new Date().toISOString() },
  );
  if (typeof changed === "object" || changed !== 1) {
    console.error(`[selah] failGenerationJob(${slug}): claim not owned; newer run left untouched`);
    return false;
  }
  return true;
}

// ---------------- image jobs (single-use; duplicates cannot double-spend) ----------------

/**
 * Atomic single-use IMAGE claim on a draft row. Refuses while another image
 * claim is active (no double spend). Error paths must release via
 * releaseImageJob; a crash-stranded claim requires PR 2's durable job cleanup.
 */
export async function claimImageJob(store: JobStorePort, slug: string): Promise<{ jobId: string; workup: ChapterWorkup }> {
  const row = await store.read(slug);
  const decision = decideMutation("updateChapterWorkupJson", slug, toLookup(row));
  if (!decision.allowed) throw new ChapterMutationError("REFUSED", "claimImageJob", slug, decision.reason);
  const json = (row && !("error" in row) && row.workupJson) || {};
  if (typeof json[IMAGE_JOB_KEY] === "string" && json[IMAGE_JOB_KEY]) {
    throw new ChapterMutationError("CONFLICT", "claimImageJob", slug, "an image job is already active for this chapter");
  }
  const jobId = newJobId();
  const changed = await store.update(
    slug,
    {
      status: decision.expected!.status,
      updatedAt: decision.expected!.updatedAt,
      jsonKey: IMAGE_JOB_KEY,
      jsonEquals: null, // key must still be absent at write time
    },
    { workup_json: { ...json, [IMAGE_JOB_KEY]: jobId }, updated_at: new Date().toISOString() },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "claimImageJob", slug, changed.error);
  if (changed !== 1) throw new ChapterMutationError("CONFLICT", "claimImageJob", slug, "another image claim won the race");
  return { jobId, workup: { ...(json as unknown as ChapterWorkup) } };
}

/** Terminal image SUCCESS: pinned to this claim; clears the claim key. */
export async function completeImageJob(
  store: JobStorePort,
  slug: string,
  jobId: string,
  finalWorkup: ChapterWorkup,
): Promise<void> {
  const json = { ...(finalWorkup as unknown as Record<string, unknown>) };
  delete json[IMAGE_JOB_KEY];
  const changed = await store.update(
    slug,
    { status: "draft", jsonKey: IMAGE_JOB_KEY, jsonEquals: jobId },
    { workup_json: json, updated_at: new Date().toISOString() },
  );
  if (typeof changed === "object") throw new ChapterMutationError("WRITE_FAILED", "completeImageJob", slug, changed.error);
  if (changed !== 1) {
    throw new ChapterMutationError("CONFLICT", "completeImageJob", slug, "stale image worker: claim superseded or row changed");
  }
}

/** Release a claim after a failed run (pinned; never throws). */
export async function releaseImageJob(store: JobStorePort, slug: string, jobId: string): Promise<boolean> {
  const row = await store.read(slug);
  if (!row || (typeof row === "object" && "error" in row)) return false;
  if (row.workupJson?.[IMAGE_JOB_KEY] !== jobId) return false;
  const json = { ...row.workupJson };
  delete json[IMAGE_JOB_KEY];
  const changed = await store.update(
    slug,
    { status: "draft", jsonKey: IMAGE_JOB_KEY, jsonEquals: jobId },
    { workup_json: json, updated_at: new Date().toISOString() },
  );
  return typeof changed === "number" && changed === 1;
}

// ---------------- real Supabase adapter ----------------

export function supabaseJobStore(): JobStorePort | null {
  const db = getSupabaseAdmin();
  if (!db) return null;
  return {
    async read(slug) {
      const { data, error } = await db
        .from("chapter_workups")
        .select("status, updated_at, workup_json")
        .eq("slug", slug)
        .maybeSingle();
      if (error) return { error: String(error.message) };
      if (!data) return null;
      return {
        status: (data.status as string) ?? "",
        updatedAt: (data.updated_at as string | null) ?? null,
        workupJson: (data.workup_json as Record<string, unknown>) ?? {},
      };
    },
    async insert(_slug, payload) {
      const { error } = await db.from("chapter_workups").insert(payload);
      if (!error) return "ok";
      const text = `${error.message} ${(error as { code?: string }).code ?? ""}`;
      return /duplicate|unique|23505/i.test(text) ? "duplicate" : { error: error.message };
    },
    async update(slug, predicates, next) {
      let query = db.from("chapter_workups").update(next).eq("slug", slug).eq("status", predicates.status);
      if (predicates.updatedAt !== undefined && predicates.updatedAt !== null) {
        query = query.eq("updated_at", predicates.updatedAt);
      }
      if (predicates.jsonKey) {
        query =
          predicates.jsonEquals === null
            ? query.is(`workup_json->>${predicates.jsonKey}`, null)
            : query.eq(`workup_json->>${predicates.jsonKey}`, predicates.jsonEquals as string);
      }
      const { data, error } = await query.select("slug");
      if (error) return { error: String(error.message) };
      return data?.length ?? 0;
    },
  };
}

export function requireJobStore(slug: string, action: string): JobStorePort {
  const store = supabaseJobStore();
  if (!store) throw new ChapterMutationError("WRITE_FAILED", action, slug, "storage is not configured");
  return store;
}
