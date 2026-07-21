import type { ChapterWorkup } from "@/lib/types";
import mark7Revision from "@/lib/ai/fixtures/mark-7-mega-revision.json";
import mark8Revision from "@/lib/ai/fixtures/mark-8-mega-revision.json";
import mark9Revision from "@/lib/ai/fixtures/mark-9-mega-revision.json";
import mark10Revision from "@/lib/ai/fixtures/mark-10-mega-revision.json";

/**
 * Mega revision previews (the generalized #77 pattern — the Mark 6 lane
 * proved it, this makes it reusable for the 7→8→9→10 queue).
 *
 * Each revision fixture keeps its REAL slug so it diffs cleanly against its
 * base snapshot (docs/selah/<slug>-revision/); serving re-keys it to
 * "<slug>-revision-preview" and labels the title so nobody can mistake it
 * for the published chapter. Registration is FAIL-CLOSED to non-production
 * contexts; applying to the live row stays a separate owner-approved step.
 */
const REVISIONS: { fixture: unknown }[] = [
  { fixture: mark7Revision },
  { fixture: mark8Revision },
  { fixture: mark9Revision },
  { fixture: mark10Revision },
];

export function revisionPreviewWorkups(): ChapterWorkup[] {
  return REVISIONS.map(({ fixture }) => {
    const workup = fixture as ChapterWorkup;
    return {
      ...workup,
      slug: `${workup.slug}-revision-preview`,
      title: `${workup.title} — Proposed Revision`,
    };
  });
}

/** Netlify's CONTEXT baked at build (next.config.mjs env). MUST stay a
 * literal `process.env.<KEY>` expression — the bundler only inlines literal
 * reads; dynamic lookups stay undefined at runtime (learned the hard way on
 * the Mark 6 lane: the preview 404'd until the read was literal). */
const BAKED_DEPLOY_CONTEXT = process.env.SELAH_DEPLOY_CONTEXT || "";

/** True only where revision previews may serve: local dev and Netlify
 * deploy/branch previews. Production and unknown contexts stay CLOSED. */
export function revisionPreviewsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "development") return true;
  const context = env.SELAH_DEPLOY_CONTEXT || env.CONTEXT || BAKED_DEPLOY_CONTEXT;
  return context === "deploy-preview" || context === "branch-deploy";
}
