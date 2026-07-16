// Pure guards for Selah Studio's remembered review state (PR #36 review,
// P1-1). A remembered "previewed / Ready" approval may only survive a chapter
// switch when the stored draft provably did NOT change while the owner was
// away — including out-of-band writes (another tab, a version restore, an
// image completion). Clean drafts carry no wording-review digest, so the
// binding uses the server's draft revision (updated_at), which changes on
// every draft write.

/** Strict read of the status response's draft revision. Null = unproven. */
export function readStudioDraftRevision(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const revision = row.draftRevision;
  return typeof revision === "string" && revision.trim() !== "" ? revision : null;
}

/**
 * Whether restored review approvals may stand. Fail-closed: an unknown or
 * unproven fresh revision, an unremembered revision, or ANY drift means the
 * text must be re-read and re-approved.
 */
export function restoredReviewStillValid(
  rememberedRevision: string,
  freshRevision: string | null,
): boolean {
  return (
    freshRevision !== null &&
    rememberedRevision !== "" &&
    rememberedRevision === freshRevision
  );
}
