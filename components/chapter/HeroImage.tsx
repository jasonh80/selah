import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import {
  getHeroKindOverride,
  getSceneChecks,
  assignSceneChecks,
  type SceneCheck,
} from "@/lib/content/chapter-content";
import { CaptionedImage, imageCaptionCard } from "@/components/chapter/CaptionedImage";

// New generated chapters explicitly choose their most meaningful scene. Older
// chapters keep the established establishing → first fallback unchanged.
// Protected published chapters can re-anchor via a render-level override
// (layout spec §1) without touching the stored workup.
export function heroImageFor(data: ChapterWorkup): ChapterImage | undefined {
  const heroKind = getHeroKindOverride(data.slug) ?? data.heroKind;
  if (heroKind) {
    const selected = data.images.find((image) => image.kind === heroKind);
    if (selected) return selected;
  }
  return data.images.find((i) => i.kind === "establishing") ?? data.images[0];
}

export function supportingImagesFor(data: ChapterWorkup): ChapterImage[] {
  const hero = heroImageFor(data);
  return hero ? data.images.filter((image) => image.kind !== hero.kind) : [];
}

/** Scene checks NOT bound to a Visual Chapter Path scene — the hero's check
 * plus any unmatched extras. Computed over the SAME scene set the path
 * renders so nothing is ever dropped or shown twice. */
export function standaloneChecksFor(data: ChapterWorkup): SceneCheck[] {
  const allChecks: SceneCheck[] =
    data.sceneChecks && data.sceneChecks.length > 0 ? data.sceneChecks : getSceneChecks(data.slug) ?? [];
  const { standalone } = assignSceneChecks(
    data.slug,
    allChecks,
    supportingImagesFor(data).map((image) => image.kind),
  );
  return standalone;
}

export function HeroImage({ data }: { data: ChapterWorkup }) {
  const hero = heroImageFor(data);
  if (!hero) return null;
  // Owner decision A1 (2026-07-16): every chapter image is uniform 3:2, full
  // column width — the hero included. Owner direction 2026-07-20: the hero's
  // scene check(s) attach BELOW the photo inside the same frame, Instagram
  // caption style, with Quick Summary following as its own card.
  return (
    <CaptionedImage
      src={hero.src}
      alt={hero.alt}
      captionCard={imageCaptionCard(hero)}
      checks={standaloneChecksFor(data)}
      frameClassName="overflow-hidden rounded-lg border shadow-soft"
    />
  );
}
