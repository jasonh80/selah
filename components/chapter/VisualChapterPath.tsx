import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import { ExpandableImage } from "@/components/chapter/ExpandableImage";
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
  // scenes simply flow with their captions and attached checks.
  return (
    <section>
      <div className="space-y-s4">
        {scenes.map((scene, position) => (
          <PathScene
            key={scene.kind}
            scene={scene}
            position={position}
            title={getImageTitle(data.slug, scene.kind, scene.label)}
            check={checkByKind.get(scene.kind)}
          />
        ))}
      </div>
    </section>
  );
}

function PathScene({
  scene,
  position,
  title,
  check,
}: {
  scene: ChapterImage;
  position: number;
  title: string;
  check?: SceneCheck;
}) {
  return (
    <figure className="flex flex-col">
      <div className="relative overflow-hidden rounded-md border shadow-hair">
        <div className="aspect-[3/2] w-full bg-card-soft">
          <ExpandableImage src={scene.src} alt={scene.alt} className="h-full w-full object-cover" />
        </div>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.78)] via-[rgba(16,16,20,0.04)] to-transparent" />
        <figcaption className="absolute inset-x-s3 bottom-s3">
          <span className="block text-[13px] font-semibold leading-snug text-white sm:text-[14px]">{title}</span>
        </figcaption>
      </div>

      {/* Owner direction 2026-07-19: the scene check reads like an Instagram
          caption — always open, bigger, directly under its photo. */}
      {check && (
        <div className="mt-s2 rounded-md border bg-card px-s3 py-s3 shadow-hair" style={{ borderLeft: "3px solid var(--accent-strong)" }}>
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-accent-strong"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
            <span className="text-[15px] font-semibold leading-snug text-primary">{check.title}</span>
          </div>
          {/* visualAccuracyNotes are production guardrails — never rendered. */}
          <p className="mt-1.5 text-[14px] leading-relaxed text-secondary">{check.body}</p>
        </div>
      )}
    </figure>
  );
}
