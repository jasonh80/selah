// SERVER-ONLY. Pure protected-sprint image-plan validation and binding
// helpers (Mark 8 originally; now slug-parameterized for later connected
// chapters). No database, network, model, storage, or environment access.
// The digest domains embed the slug, so Mark 8's historical digests are
// unchanged by this generalization.
import type { ChapterImage, ChapterWorkup, ImageKind } from "../types";
import { sha256Canonical } from "./generation-manifest";
import { GPT_IMAGE_2_ESTIMATED_USD_EACH } from "../ai/costs";
// Both imports are pure data/config modules (no I/O) — this file stays
// side-effect free as documented above.
import { getHeroKindOverride } from "../content/chapter-content";
import { isRedoUnlockedProtectedSlug } from "../studio-mark8-preflight";

export const MARK_8_IMAGE_SLUG = "mark-8";
export const MARK_8_IMAGE_MODEL = "gpt-image-2";
// Documented high-quality 1024x1536 / 1536x1024 output estimate. Text-input
// tokens are additional, so Studio labels this as an estimate rather than a cap.
export const MARK_8_IMAGE_ESTIMATED_COST_USD = GPT_IMAGE_2_ESTIMATED_USD_EACH;

const SAFE_KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function chapterLabel(slug: string): string {
  const match = /^mark-(\d+)$/u.exec(slug);
  return match ? `Mark ${match[1]}` : slug;
}

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
  slug: string;
  heroKind: ImageKind;
  images: readonly Mark8ImagePlanItem[];
  digest: string;
}

function nonEmpty(value: unknown, label: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} image ${field} is missing`);
  }
  return value.trim();
}

function planContent(
  slug: string,
  heroKind: ImageKind,
  images: readonly Mark8ImagePlanItem[],
) {
  return {
    domain: `selah-${slug}-image-plan`,
    slug,
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
 * Derive the exact paid-image plan from the stored protected draft. The array
 * order is authoritative. Nothing is sorted or filled from a static plan.
 */
export function deriveMarkSprintImagePlan(
  slug: string,
  workup: ChapterWorkup,
): Mark8ImagePlan {
  const label = chapterLabel(slug);
  if (workup.slug !== slug) {
    throw new Error(`expected ${slug} workup`);
  }
  if (workup.images.length !== 3 && workup.images.length !== 5) {
    throw new Error(`${label} must have exactly 3 or 5 planned images`);
  }
  // Mark 6's hero is a render-level override — its stored workup predates
  // heroKind (owner authorization 2026-07-20, board #29). Sprint workups all
  // store heroKind and have NO override (CHAPTER_HERO_OVERRIDES is mark-6
  // only; verify:published-redo asserts that), so this resolution order
  // cannot change any sprint chapter's derived plan digest.
  const heroKind = nonEmpty(
    getHeroKindOverride(slug) ?? workup.heroKind,
    label,
    "heroKind",
  ) as ImageKind;
  const seen = new Set<string>();
  const images = workup.images.map((source, position): Mark8ImagePlanItem => {
    const kind = nonEmpty(source.kind, label, `kind ${position + 1}`) as ImageKind;
    if (!SAFE_KIND.test(kind)) throw new Error(`${label} image kind "${kind}" must be kebab-case`);
    if (seen.has(kind)) throw new Error(`${label} image kind "${kind}" is duplicated`);
    seen.add(kind);
    if (source.index !== position + 1) {
      throw new Error(`${label} image indexes must match their exact plan order`);
    }
    return Object.freeze({
      kind,
      index: source.index,
      label: nonEmpty(source.label, label, `${kind} label`),
      ...(typeof source.description === "string" && source.description.trim() !== ""
        ? { description: source.description.trim() }
        : {}),
      prompt: nonEmpty(source.prompt, label, `${kind} prompt`),
      caption: nonEmpty(source.caption, label, `${kind} caption`),
      alt: nonEmpty(source.alt, label, `${kind} alt text`),
      // Every chapter image renders in the uniform 3:2 LANDSCAPE layout
      // (owner layout decision, PR #39) — so every image generates landscape,
      // not only the hero. Portrait outputs were being letterboxed/cropped.
      wide: true,
    });
  });
  if (!seen.has(heroKind)) throw new Error(`${label} heroKind must match one planned image`);
  const digest = sha256Canonical(planContent(slug, heroKind, images));
  return Object.freeze({
    slug,
    heroKind,
    images: Object.freeze(images),
    digest,
  });
}

export function deriveMark8ImagePlan(workup: ChapterWorkup): Mark8ImagePlan {
  return deriveMarkSprintImagePlan(MARK_8_IMAGE_SLUG, workup);
}

/** A fresh protected paid run may replace only the generated draft placeholders. */
export function assertMarkSprintImagesArePlaceholders(
  slug: string,
  workup: ChapterWorkup,
): void {
  deriveMarkSprintImagePlan(slug, workup);
  if (
    !workup.images.every(
      (image) => image.status === "placeholder" && image.src.startsWith("/img/placeholder/"),
    )
  ) {
    throw new Error(
      `${chapterLabel(slug)} image generation requires the exact untouched placeholder set`,
    );
  }
}

export function assertMark8ImagesArePlaceholders(workup: ChapterWorkup): void {
  assertMarkSprintImagesArePlaceholders(MARK_8_IMAGE_SLUG, workup);
}

// ---------------- single-image redo (owner decision, board #29 2026-07-17) ----------------

// Transient workup_json keys for an in-flight redo candidate. Mirrors the
// imageJob* keys: no schema change, cleared on apply/reject, and excluded
// from (in fact, nulling) the final-review identity while unresolved.
export const IMAGE_REDO_TRANSIENT_KEYS = [
  "imageRedoJobId",
  "imageRedoState",
  "imageRedoKind",
  "imageRedoNotes",
  "imageRedoBindingDigest",
  "imageRedoCandidateUrl",
  "imageRedoSpentCount",
  "imageRedoErrorCode",
] as const;

// 1200 (owner decision 2026-07-20): his shot-list direction is the
// differentiator — but longer isn't automatically better; past ~200 words
// image models drop competing directives. Selection still wins.
export const IMAGE_REDO_NOTES_MAX_CHARS = 1200;

export interface MarkSprintImageRedoPlan {
  slug: string;
  kind: ImageKind;
  index: number;
  label: string;
  caption: string;
  alt: string;
  basePrompt: string;
  revisedPrompt: string;
  notes: string;
  currentSrc: string;
  model: string;
  wide: true;
  digest: string;
}

/**
 * Derive the exact ONE-image redo request from the stored draft: the target's
 * frozen prompt plus the owner's revision notes. Requires a COMPLETED stored
 * image set (a redo replaces one finished image; it never substitutes for the
 * full paid run). The digest binds slug, target, current bytes URL, base
 * prompt, and the exact notes — any drift between preflight and spend refuses.
 */
export function deriveMarkSprintImageRedoPlan(
  slug: string,
  workup: ChapterWorkup,
  kind: string,
  notes: string,
): MarkSprintImageRedoPlan {
  const label = chapterLabel(slug);
  const plan = deriveMarkSprintImagePlan(slug, workup);
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  if (trimmedNotes === "") {
    throw new Error(`${label} image redo requires a "what should change" note`);
  }
  if (trimmedNotes.length > IMAGE_REDO_NOTES_MAX_CHARS) {
    throw new Error(
      `${label} image redo notes must stay within ${IMAGE_REDO_NOTES_MAX_CHARS} characters`,
    );
  }
  if (
    !workup.images.every(
      (image) => image.status === "complete" && isStoredMarkSprintImageUrl(slug, image),
    )
  ) {
    throw new Error(
      `${label} image redo requires a fully completed stored image set`,
    );
  }
  const target = plan.images.find((image) => image.kind === kind);
  const source = workup.images.find((image) => image.kind === kind);
  if (!target || !source) {
    throw new Error(`${label} has no image "${kind}" to redo`);
  }
  const revisedPrompt =
    `${target.prompt}\n\nOWNER REVISION REQUEST — change exactly this and keep ` +
    `everything else about the scene, style, and composition unchanged: ${trimmedNotes}`;
  const digest = sha256Canonical({
    domain: `selah-${slug}-image-redo`,
    slug,
    kind: target.kind,
    index: target.index,
    currentSrc: source.src,
    basePrompt: target.prompt,
    notes: trimmedNotes,
    model: MARK_8_IMAGE_MODEL,
  });
  return Object.freeze({
    slug,
    kind: target.kind,
    index: target.index,
    label: target.label,
    caption: target.caption,
    alt: target.alt,
    basePrompt: target.prompt,
    revisedPrompt,
    notes: trimmedNotes,
    currentSrc: source.src,
    model: MARK_8_IMAGE_MODEL,
    wide: true,
    digest,
  });
}

/** True while an unresolved redo candidate (any redo key) is on the workup. */
export function markSprintImageRedoUnresolved(workup: ChapterWorkup): boolean {
  const raw = workup as unknown as Record<string, unknown>;
  return IMAGE_REDO_TRANSIENT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(raw, key),
  );
}

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// Sentinel for a valid LEGACY stored path (no job directory). Only ever
// compared against null — never used as a real job id.
const LEGACY_STABLE_PATH_JOB_ID = "legacy-stable-path";

function storedJobId(slug: string, image: ChapterImage): string | null {
  if (image.status !== "complete") return null;
  try {
    const url = new URL(image.src);
    if (url.protocol !== "https:" || url.search || url.hash) return null;
    const prefix = `/storage/v1/object/public/chapter-images/${slug}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const rest = url.pathname.slice(prefix.length);
    const parts = rest.split("/");
    // Mark 6's launch images predate job directories and live at the stable
    // legacy path "chapter-images/mark-6/<kind>.png" (owner authorization
    // 2026-07-20, board #29). Accept exactly that shape for the redo-unlocked
    // slug only; every sprint chapter still requires a job-id directory.
    if (parts.length === 1 && isRedoUnlockedProtectedSlug(slug)) {
      return parts[0] === `${image.kind}.png` ? LEGACY_STABLE_PATH_JOB_ID : null;
    }
    if (parts.length !== 2 || !JOB_ID.test(parts[0])) return null;
    return parts[1] === `${image.kind}.png` ? parts[0] : null;
  } catch {
    return null;
  }
}

/** Minimum public-storage path check; publishing will also pin the origin. */
export function isStoredMarkSprintImageUrl(
  slug: string,
  image: ChapterImage,
): boolean {
  return storedJobId(slug, image) !== null;
}

export function isStoredMark8ImageUrl(image: ChapterImage): boolean {
  return isStoredMarkSprintImageUrl(MARK_8_IMAGE_SLUG, image);
}

/**
 * Owner-review identity for the exact final protected image set. Returns null
 * until all planned images are stored and complete. Publishing can later
 * recompute this same digest without trusting a browser-supplied summary.
 */
export function markSprintFinalReviewDigest(
  slug: string,
  workup: ChapterWorkup,
): string | null {
  try {
    deriveMarkSprintImagePlan(slug, workup);
  } catch {
    return null;
  }
  // An unresolved redo candidate has no final identity: the owner must Use or
  // Reject it before the set can be reviewed or published.
  if (markSprintImageRedoUnresolved(workup)) return null;
  const storedJobIds = workup.images.map((image) => storedJobId(slug, image));
  if (storedJobIds.some((jobId) => jobId === null)) return null;
  // Multiple job directories are legitimate: an owner-approved single-image
  // redo stores its replacement under its own immutable job directory. The
  // digest below binds the exact src set, so any unapproved mix still changes
  // the identity the owner must re-approve and publish re-verifies.
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
    domain: `selah-${slug}-final-review`,
    workup: storedJsonShape,
  });
}

export function mark8FinalReviewDigest(workup: ChapterWorkup): string | null {
  return markSprintFinalReviewDigest(MARK_8_IMAGE_SLUG, workup);
}
