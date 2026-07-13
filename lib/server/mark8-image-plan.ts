// SERVER-ONLY. Pure Mark 8 image-plan validation and binding helpers.
// No database, network, model, storage, or environment access.
import type { ChapterImage, ChapterWorkup, ImageKind } from "../types";
import { sha256Canonical } from "./generation-manifest";

export const MARK_8_IMAGE_SLUG = "mark-8";
export const MARK_8_IMAGE_MODEL = "gpt-image-2";
// Documented high-quality 1024x1536 / 1536x1024 output estimate. Text-input
// tokens are additional, so Studio labels this as an estimate rather than a cap.
export const MARK_8_IMAGE_ESTIMATED_COST_USD = 0.165;

const SAFE_KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface Mark8ImagePlanItem {
  kind: ImageKind;
  index: number;
  label: string;
  description?: string;
  prompt: string;
  caption: string;
  alt: string;
  wide: boolean;
}

export interface Mark8ImagePlan {
  slug: typeof MARK_8_IMAGE_SLUG;
  heroKind: ImageKind;
  images: readonly Mark8ImagePlanItem[];
  digest: string;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Mark 8 image ${field} is missing`);
  }
  return value.trim();
}

function planContent(heroKind: ImageKind, images: readonly Mark8ImagePlanItem[]) {
  return {
    domain: "selah-mark-8-image-plan",
    slug: MARK_8_IMAGE_SLUG,
    heroKind,
    images: images.map((image) => ({
      kind: image.kind,
      index: image.index,
      label: image.label,
      ...(image.description === undefined ? {} : { description: image.description }),
      prompt: image.prompt,
      caption: image.caption,
      alt: image.alt,
      wide: image.wide,
    })),
  };
}

/**
 * Derive the exact paid-image plan from the stored Mark 8 draft. The array
 * order is authoritative. Nothing is sorted or filled from a static plan.
 */
export function deriveMark8ImagePlan(workup: ChapterWorkup): Mark8ImagePlan {
  if (workup.slug !== MARK_8_IMAGE_SLUG) {
    throw new Error(`expected ${MARK_8_IMAGE_SLUG} workup`);
  }
  if (workup.images.length !== 3 && workup.images.length !== 5) {
    throw new Error("Mark 8 must have exactly 3 or 5 planned images");
  }
  const heroKind = nonEmpty(workup.heroKind, "heroKind") as ImageKind;
  const seen = new Set<string>();
  const images = workup.images.map((source, position): Mark8ImagePlanItem => {
    const kind = nonEmpty(source.kind, `kind ${position + 1}`) as ImageKind;
    if (!SAFE_KIND.test(kind)) throw new Error(`Mark 8 image kind "${kind}" must be kebab-case`);
    if (seen.has(kind)) throw new Error(`Mark 8 image kind "${kind}" is duplicated`);
    seen.add(kind);
    if (source.index !== position + 1) {
      throw new Error("Mark 8 image indexes must match their exact plan order");
    }
    return Object.freeze({
      kind,
      index: source.index,
      label: nonEmpty(source.label, `${kind} label`),
      ...(typeof source.description === "string" && source.description.trim() !== ""
        ? { description: source.description.trim() }
        : {}),
      prompt: nonEmpty(source.prompt, `${kind} prompt`),
      caption: nonEmpty(source.caption, `${kind} caption`),
      alt: nonEmpty(source.alt, `${kind} alt text`),
      wide: kind === heroKind,
    });
  });
  if (!seen.has(heroKind)) throw new Error("Mark 8 heroKind must match one planned image");
  const digest = sha256Canonical(planContent(heroKind, images));
  return Object.freeze({
    slug: MARK_8_IMAGE_SLUG,
    heroKind,
    images: Object.freeze(images),
    digest,
  });
}

/** A fresh Mark 8 paid run may replace only the generated draft placeholders. */
export function assertMark8ImagesArePlaceholders(workup: ChapterWorkup): void {
  deriveMark8ImagePlan(workup);
  if (
    !workup.images.every(
      (image) => image.status === "placeholder" && image.src.startsWith("/img/placeholder/"),
    )
  ) {
    throw new Error("Mark 8 image generation requires the exact untouched placeholder set");
  }
}

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function storedJobId(image: ChapterImage): string | null {
  if (image.status !== "complete") return null;
  try {
    const url = new URL(image.src);
    if (url.protocol !== "https:" || url.search || url.hash) return null;
    const prefix = `/storage/v1/object/public/chapter-images/${MARK_8_IMAGE_SLUG}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const rest = url.pathname.slice(prefix.length);
    const parts = rest.split("/");
    if (parts.length !== 2 || !JOB_ID.test(parts[0])) return null;
    return parts[1] === `${image.kind}.png` ? parts[0] : null;
  } catch {
    return null;
  }
}

/** Minimum public-storage path check; publishing will also pin the origin. */
export function isStoredMark8ImageUrl(image: ChapterImage): boolean {
  return storedJobId(image) !== null;
}

/**
 * Owner-review identity for the exact final Mark 8 image set. Returns null
 * until all planned images are stored and complete. Publishing can later
 * recompute this same digest without trusting a browser-supplied summary.
 */
export function mark8FinalReviewDigest(workup: ChapterWorkup): string | null {
  try {
    deriveMark8ImagePlan(workup);
  } catch {
    return null;
  }
  const storedJobIds = workup.images.map(storedJobId);
  if (storedJobIds.some((jobId) => jobId === null)) return null;
  if (new Set(storedJobIds).size !== 1) return null;
  // Bind the complete final render workup, not only the pictures. Transient
  // job-control keys are deliberately excluded so the digest is stable after
  // completion and can be recomputed by a future server-side publish check.
  const {
    imageJobId: _jobId,
    imageJobState: _jobState,
    imageJobPlanDigest: _planDigest,
    imageJobModel: _model,
    ...finalWorkup
  } = workup as unknown as Record<string, unknown>;
  const storedJsonShape = JSON.parse(JSON.stringify(finalWorkup)) as Record<string, unknown>;
  return sha256Canonical({
    domain: "selah-mark-8-final-review",
    workup: storedJsonShape,
  });
}
