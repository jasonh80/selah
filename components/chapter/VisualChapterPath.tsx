import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { ExpandableImage } from "@/components/chapter/ExpandableImage";
import {
  getImageTitle,
  getSceneCheckImageKind,
  getSceneChecks,
  type SceneCheck,
} from "@/lib/content/chapter-content";

// Visual Chapter Path (layout spec §7/§8/§10): the chapter's scenes in
// narrative order — a walk through the story, not an equal-card dashboard.
// Mobile: horizontal snap carousel, one full card with a deliberate partial
// preview of the next. Desktop: an asymmetric grid that leads with the
// opening scene. Scene Checks that belong to a scene render with it
// (short title, tap-to-expand body — never paragraphs over the image).
export function VisualChapterPath({ data }: { data: ChapterWorkup }) {
  const scenes = [...data.images].sort((a, b) => a.index - b.index);
  if (scenes.length === 0) return null;

  const checks: SceneCheck[] =
    data.sceneChecks && data.sceneChecks.length > 0 ? data.sceneChecks : getSceneChecks(data.slug) ?? [];
  const checkByKind = new Map<string, SceneCheck>();
  for (const check of checks) {
    const kind = getSceneCheckImageKind(data.slug, check.title);
    if (kind && !checkByKind.has(kind)) checkByKind.set(kind, check);
  }

  // Desktop spans on a 12-column grid: the opening scene leads, the rest form
  // a refined rail beneath it.
  const spanFor = (position: number): string =>
    position === 0 ? "md:col-span-7" : position === 1 ? "md:col-span-5" : "md:col-span-4";

  return (
    <section>
      <SectionHead title={`The Path Through ${data.reference}`} />
      <div className="flex snap-x snap-mandatory gap-s3 overflow-x-auto pb-s2 no-scrollbar md:grid md:grid-cols-12 md:overflow-visible md:pb-0">
        {scenes.map((scene, position) => (
          <PathCard
            key={scene.kind}
            scene={scene}
            position={position}
            title={getImageTitle(data.slug, scene.kind, scene.label)}
            check={checkByKind.get(scene.kind)}
            className={`w-[78%] shrink-0 snap-start md:w-auto ${spanFor(position)}`}
            layout={position === 0 ? "lead" : position === 1 ? "fill" : "rail"}
          />
        ))}
      </div>
    </section>
  );
}

// Desktop card behavior: the lead scene sets the first row's height (3/2);
// its "fill" neighbor stretches to match so the opening row reads as one
// composed band; rail cards keep the 4/5 portrait rhythm beneath.
function PathCard({
  scene,
  position,
  title,
  check,
  className,
  layout,
}: {
  scene: ChapterImage;
  position: number;
  title: string;
  check?: SceneCheck;
  className: string;
  layout: "lead" | "fill" | "rail";
}) {
  return (
    <figure className={`flex flex-col ${className}`}>
      <div
        className={`relative overflow-hidden rounded-md border shadow-hair ${
          layout === "fill" ? "md:min-h-0 md:flex-1" : ""
        }`}
      >
        <div
          className={`aspect-[4/5] w-full bg-card-soft ${
            layout === "lead" ? "md:aspect-[3/2]" : layout === "fill" ? "md:aspect-auto md:h-full" : "md:aspect-[4/5]"
          }`}
        >
          <ExpandableImage src={scene.src} alt={scene.alt} className="h-full w-full object-cover" />
        </div>
        <span
          aria-hidden
          className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(16,16,20,0.55)] text-[11px] font-semibold text-white backdrop-blur"
        >
          {position + 1}
        </span>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.78)] via-[rgba(16,16,20,0.04)] to-transparent" />
        <figcaption className="absolute inset-x-s3 bottom-s3">
          <span className="block text-[13px] font-semibold leading-snug text-white">{title}</span>
        </figcaption>
      </div>

      {check && (
        <details className="group mt-s2 rounded-md border bg-card shadow-hair" style={{ borderLeft: "3px solid var(--accent-strong)" }}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-s3 py-s2">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 text-accent-strong"
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
            <span className="flex-1 text-[12px] font-semibold leading-snug text-primary">{check.title}</span>
            <span aria-hidden className="text-secondary transition group-open:rotate-180">⌄</span>
          </summary>
          {/* visualAccuracyNotes are production guardrails — never rendered. */}
          <p className="border-t px-s3 py-s2 text-[13px] leading-relaxed text-secondary">{check.body}</p>
        </details>
      )}
    </figure>
  );
}
