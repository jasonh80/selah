import type { ChapterWorkup } from "@/lib/types";
import { CaptionedImage } from "@/components/chapter/CaptionedImage";
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
export function VisualChapterPath({ data }: { data: ChapterWorkup }) {
  // The hero already anchors the top of the page — the path carries the
  // REMAINING scenes in narrative order, so no image ever appears twice.
  const scenes = [...supportingImagesFor(data)].sort((a, b) => a.index - b.index);
  if (scenes.length === 0) return null;

  const checks: SceneCheck[] =
    data.sceneChecks && data.sceneChecks.length > 0 ? data.sceneChecks : getSceneChecks(data.slug) ?? [];
  const { forScene: checkByKind } = assignSceneChecks(
    data.slug,
    checks,
    scenes.map((scene) => scene.kind),
  );

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
              checks={check ? [check] : []}
            />
          );
        })}
      </div>
    </section>
  );
}
