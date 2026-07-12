// SERVER-ONLY. Issue #8 (PR 1 of 3): the mutation guard for published and
// explicitly protected chapters.
//
// Design (per Codex review of 3104055):
//   - The DECISION CORE IS PURE (`decideMutation`) so the offline safety gate
//     (`npm run verify:studio-safety`) can test every path without a database.
//   - A decision alone never authorizes a write. It returns an EXPECTED
//     status/revision token, and every mutation must re-assert that token as a
//     predicate ON THE WRITE ITSELF. A zero-row conditional write is a
//     CONFLICT, never success.
//   - Explicit per-action transitions. Everything not allowed is refused —
//     including legacy "ready" rows (quarantined until the PR 3 publish gate).
//   - Failures are TYPED (`ChapterMutationError`) so callers can neither
//     swallow them nor return success-shaped responses after an unverified
//     state, and so refusals can be durably audited at the API layer.
import { getSupabaseAdmin } from "./supabase";

// Protected regardless of stored status (issue #8 recommended default).
export const PROTECTED_SLUGS: readonly string[] = ["psalm-23", "mark-6"];

export function isProtectedSlug(slug: string): boolean {
  return PROTECTED_SLUGS.includes(slug);
}

export type MutationAction =
  | "createGeneratingChapterWorkup"
  | "saveReadyChapterWorkup"
  | "updateChapterWorkupJson"
  | "markChapterWorkupFailed"
  | "restoreVersion"
  | "applyMergedDraft"
  | "publishChapter";

// What each mutation may act on. `allowMissing` = the action may create the row.
const TRANSITIONS: Record<MutationAction, { allowed: readonly string[]; allowMissing: boolean }> = {
  // "generating" excluded → duplicate-run protection. "ready" excluded → quarantine.
  createGeneratingChapterWorkup: { allowed: ["draft", "failed"], allowMissing: true },
  // Generation may only complete a run it started.
  saveReadyChapterWorkup: { allowed: ["generating"], allowMissing: false },
  // Image/JSON wiring only ever touches an unpublished working draft.
  updateChapterWorkupJson: { allowed: ["draft"], allowMissing: false },
  // Failure bookkeeping may only close out a live run.
  markChapterWorkupFailed: { allowed: ["generating"], allowMissing: false },
  restoreVersion: { allowed: ["draft", "failed"], allowMissing: false },
  applyMergedDraft: { allowed: ["draft", "failed"], allowMissing: false },
  // Publishing promotes exactly a draft. Legacy "ready" rows deliberately do NOT
  // pass here — their path is the PR 3 validated publisher.
  publishChapter: { allowed: ["draft"], allowMissing: false },
};

export interface ChapterRowSnapshot {
  status: string;
  updatedAt: string | null;
}

export type RowLookup =
  | { kind: "row"; row: ChapterRowSnapshot }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export interface MutationDecision {
  allowed: boolean;
  reason: string;
  /** Revision token the write MUST re-assert. null = the row must not exist. */
  expected: ChapterRowSnapshot | null;
}

/** PURE decision core — no I/O. Tested exhaustively by verify:studio-safety. */
export function decideMutation(action: MutationAction, slug: string, lookup: RowLookup): MutationDecision {
  const refuse = (reason: string): MutationDecision => ({
    allowed: false,
    reason: `refused ${action}: ${reason}`,
    expected: null,
  });
  if (!slug || typeof slug !== "string" || !slug.trim()) return refuse("missing slug");
  if (isProtectedSlug(slug)) return refuse(`"${slug}" is an explicitly protected chapter`);
  if (lookup.kind === "unconfigured") return refuse(`storage is not configured, cannot verify "${slug}"`);
  if (lookup.kind === "error") return refuse(`could not verify "${slug}" (${lookup.message.slice(0, 120)})`);

  const transition = TRANSITIONS[action];
  if (!transition) return refuse("unknown mutation action");

  if (lookup.kind === "missing") {
    if (transition.allowMissing) return { allowed: true, reason: "ok", expected: null };
    return refuse(`"${slug}" has no stored row to act on`);
  }

  const status = lookup.row.status;
  if (status === "reviewed") return refuse(`"${slug}" is published (reviewed) and immutable`);
  if (status === "ready") {
    return refuse(`"${slug}" is a quarantined legacy "ready" row — it must pass the validated publish gate first`);
  }
  if (!transition.allowed.includes(status)) {
    return refuse(`"${slug}" is "${status}" — ${action} only acts on: ${transition.allowed.join(", ")}`);
  }
  return { allowed: true, reason: "ok", expected: { status, updatedAt: lookup.row.updatedAt } };
}

export type MutationErrorCode = "REFUSED" | "CONFLICT" | "WRITE_FAILED";

export class ChapterMutationError extends Error {
  code: MutationErrorCode;
  slug: string;
  action: string;
  constructor(code: MutationErrorCode, action: string, slug: string, message: string) {
    super(message);
    this.name = "ChapterMutationError";
    this.code = code;
    this.slug = slug;
    this.action = action;
  }
}

export function isChapterMutationError(e: unknown): e is ChapterMutationError {
  return e instanceof ChapterMutationError;
}

/** Fetch the row snapshot for the decision. Any failure maps to a refusing lookup. */
export async function lookupChapterRow(slug: string): Promise<RowLookup> {
  const db = getSupabaseAdmin();
  if (!db) return { kind: "unconfigured" };
  const { data, error } = await db
    .from("chapter_workups")
    .select("status, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { kind: "error", message: String(error.message) };
  if (!data) return { kind: "missing" };
  return {
    kind: "row",
    row: { status: (data.status as string) ?? "", updatedAt: (data.updated_at as string | null) ?? null },
  };
}

/** Async convenience: lookup + pure decision. */
export async function chapterMutationDecision(slug: string, action: MutationAction): Promise<MutationDecision> {
  return decideMutation(action, slug, await lookupChapterRow(slug));
}

/** Throwing form for repository choke points. Returns the revision token. */
export async function assertChapterMutable(
  slug: string,
  action: MutationAction,
): Promise<ChapterRowSnapshot | null> {
  const decision = await chapterMutationDecision(slug, action);
  if (!decision.allowed) {
    console.error(`[selah] mutation guard: ${decision.reason}`);
    throw new ChapterMutationError("REFUSED", action, slug, decision.reason);
  }
  return decision.expected;
}
