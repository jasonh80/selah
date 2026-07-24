import type { ChapterWorkup } from "@/lib/types";
import { CaptionedImage } from "@/components/chapter/CaptionedImage";
import { imageCaptionCard } from "@/lib/chapters/caption-cards";
import { supportingImagesFor } from "@/components/chapter/HeroImage";
import {
  getImageTitle,
  getSceneChecks,
  assignSceneChecks,
  type SceneCheck,
} from "@/lib/content/chapter-content";

// Visual Chapter Path (layout spec §7/§8/§10; owner direction 2026-07-15:
// NO carousel, no swiping; owner decision A1, 2026-07-16: ONE uniform image
// treatment). The chapter's scenes in narrative order as a photo essay on
// every breakpoint: each scene 3:2, full column width, one per row — the
// varied-size desktop mosaic is retired ("mixed sizes feel weird").
// Scene Checks that belong to a scene render with it, photo-and-caption
// style: always open, directly under the picture (owner direction
// 2026-07-19) — never paragraphs over the picture itself.
export function VisualChapterPath({
  data,
  bank = "all",
}: {
  data: ChapterWorkup;
  /** UI-cleanup brief (board #29, 2026-07-21): the approved order carries
   * THREE image banks — the hero is bank one; the remaining scenes split in
   * narrative order into a "second" bank (first half, after People) and a
   * "third" bank (rest, after What's-Easy-to-Miss). "all" keeps the whole
   * path for layouts that render it once. */
  bank?: "all" | "second" | "third";
}) {
  // The hero already anchors the top of the page — the path carries the
  // REMAINING scenes in narrative order, so no image ever appears twice.
  const allScenes = [...supportingImagesFor(data)].sort((a, b) => a.index - b.index);
  // Check assignment ALWAYS runs over the full supporting set — the same set
  // standaloneChecksFor(hero) complements — so splitting into banks can never
  // drop or double-render a check.
  const checks: SceneCheck[] =
    data.sceneChecks && data.sceneChecks.length > 0 ? data.sceneChecks : getSceneChecks(data.slug) ?? [];
  const { forScene: checkByKind } = assignSceneChecks(
    data.slug,
    checks,
    allScenes.map((scene) => scene.kind),
  );
  const splitAt = Math.ceil(allScenes.length / 2);
  const scenes =
    bank === "all" ? allScenes : bank === "second" ? allScenes.slice(0, splitAt) : allScenes.slice(splitAt);
  if (scenes.length === 0) return null;

  // Owner decision 2026-07-19: no "Path" header and no number badges — the
  // scenes simply flow with their captions and attached checks. Owner
  // direction 2026-07-20: each check is an Instagram-style caption INSIDE the
  // photo's frame (see CaptionedImage) — title line in Quick Study, full body
  // in Deep Study.
  return (
    <section>
      <div className="space-y-s4">
        {scenes.map((scene) => {
          const check = checkByKind.get(scene.kind);
          return (
            <CaptionedImage
              key={scene.kind}
              src={scene.src}
              alt={scene.alt}
              overlayTitle={getImageTitle(data.slug, scene.kind, scene.label)}
              captionCard={imageCaptionCard(data.slug, scene)}
              checks={check ? [check] : []}
            />
          );
        })}
      </div>
    </section>
  );
}
