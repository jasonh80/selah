import type { ChapterWorkup } from "@/lib/types";
import revised from "@/lib/ai/fixtures/mark-6-mega-revision.json";

/**
 * Mega Mark 6 REVIEW-ONLY preview (board #29 spec, 2026-07-20).
 *
 * The revised workup keeps `slug: "mark-6"` so the artifact diffs cleanly
 * against the live base (docs/selah/mark-6-revision/). Serving it under the
 * live slug is never acceptable — the preview re-keys it to its own slug and
 * labels the title so nobody can mistake it for published Mark 6.
 *
 * Registration is fail-closed to non-production contexts (see registry.ts):
 * the production site can never serve this candidate. Applying the revision
 * to the protected mark-6 row stays a separate owner-approved step outside
 * this codebase's write paths (the mutation guard refuses protected slugs).
 */
export const MARK_6_REVISION_PREVIEW_SLUG = "mark-6-revision-preview";

let cached: ChapterWorkup | null = null;

export function mark6RevisionPreviewWorkup(): ChapterWorkup {
  if (!cached) {
    const workup = revised as unknown as ChapterWorkup;
    cached = {
      ...workup,
      slug: MARK_6_REVISION_PREVIEW_SLUG,
      title: "Mark 6 — Proposed Revision",
    };
  }
  return cached;
}

/** True only where the review preview may serve: local dev and Netlify
 * deploy/branch previews. Unknown contexts (including a missing CONTEXT in
 * production) stay CLOSED. */
export function mark6RevisionPreviewEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "development") return true;
  return env.CONTEXT === "deploy-preview" || env.CONTEXT === "branch-deploy";
}
