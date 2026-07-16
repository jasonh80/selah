// Shared (client + server) shaping for the read-only Studio per-chapter info
// panel (issue #29). Pure: no network, storage, or environment access.

export interface StudioChapterInfo {
  /** ISO timestamp of the last publish (reviewed_at), or null if never. */
  reviewedAt: string | null;
  /** Selah BUILD_ID serving Studio right now. */
  buildId: string;
  /** Text model launches currently use (selected_text_model). */
  textModel: string;
  /** Image model for this chapter (protected chapters pin gpt-image-2). */
  imageModel: string;
}

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T/u;

/** Server-side response shaping — keeps the payload to allowlisted fields. */
export function buildStudioChapterInfoResponse(
  slug: string,
  info: StudioChapterInfo,
): Record<string, unknown> {
  return {
    ok: true,
    slug,
    reviewedAt: info.reviewedAt,
    buildId: info.buildId,
    textModel: info.textModel,
    imageModel: info.imageModel,
  };
}

/** Client-side strict parse of the chapter_info response. */
export function readStudioChapterInfo(value: unknown): StudioChapterInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true) return null;
  if (typeof row.buildId !== "string" || row.buildId.trim() === "") return null;
  if (typeof row.textModel !== "string" || row.textModel.trim() === "") return null;
  if (typeof row.imageModel !== "string" || row.imageModel.trim() === "") return null;
  const reviewedAt =
    typeof row.reviewedAt === "string" && ISO_PREFIX.test(row.reviewedAt)
      ? row.reviewedAt
      : null;
  return {
    reviewedAt,
    buildId: row.buildId,
    textModel: row.textModel,
    imageModel: row.imageModel,
  };
}
