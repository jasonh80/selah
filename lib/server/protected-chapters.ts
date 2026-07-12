// SERVER-ONLY. Issue #8 (PR 1 of 3): the mutation guard for published and
// explicitly protected chapters.
//
// Invariants enforced here (fail CLOSED):
//   - Explicitly protected slugs can never be mutated, regardless of stored
//     status — even if their row were somehow downgraded.
//   - Chapters whose stored status is "reviewed" (published) are immutable
//     through every mutation path (regenerate, save, image-write, restore,
//     merge). Revising published content requires the separately designed
//     "clone published to a new draft" workflow — never a force flag.
//   - Missing configuration, database errors, and ambiguous state REFUSE the
//     mutation. A guard that cannot verify safety does not grant it.
import { getSupabaseAdmin } from "./supabase";

// Protected regardless of stored status (issue #8 recommended default).
export const PROTECTED_SLUGS: readonly string[] = ["psalm-23", "mark-6"];

export function isProtectedSlug(slug: string): boolean {
  return PROTECTED_SLUGS.includes(slug);
}

export interface MutationDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Decide whether a chapter row may be mutated. `action` is used only for
 * logging/messages. Fail-closed: any inability to verify refuses.
 */
export async function chapterMutationDecision(
  slug: string,
  action: string,
): Promise<MutationDecision> {
  if (!slug || typeof slug !== "string") {
    return { allowed: false, reason: `refused ${action}: missing slug` };
  }
  if (isProtectedSlug(slug)) {
    return {
      allowed: false,
      reason: `refused ${action}: "${slug}" is an explicitly protected chapter`,
    };
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return {
      allowed: false,
      reason: `refused ${action}: storage is not configured, cannot verify "${slug}"`,
    };
  }
  const { data, error } = await db
    .from("chapter_workups")
    .select("status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    return {
      allowed: false,
      reason: `refused ${action}: could not verify "${slug}" (${String(error.message).slice(0, 120)})`,
    };
  }
  const status = (data?.status as string | undefined) ?? null;
  if (status === "reviewed") {
    return {
      allowed: false,
      reason: `refused ${action}: "${slug}" is published (reviewed) and immutable`,
    };
  }
  // No row (new chapter) or an unpublished status → mutable.
  return { allowed: true, reason: "ok" };
}

/** Throwing form for repository choke points. */
export async function assertChapterMutable(slug: string, action: string): Promise<void> {
  const decision = await chapterMutationDecision(slug, action);
  if (!decision.allowed) {
    console.error(`[selah] mutation guard: ${decision.reason}`);
    throw new Error(decision.reason);
  }
}
