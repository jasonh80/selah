import type { ChapterWorkup } from "@/lib/types";
import {
  getSceneChecks,
  assignSceneChecks,
  type SceneCheck,
} from "@/lib/content/chapter-content";
import { supportingImagesFor } from "@/components/chapter/HeroImage";

// Recurring "Scene Check" callouts — warm, visual nudges that correct common
// mental-image mistakes. Quick Dive: compact (label + title + body). Deep Dive:
// adds the visual-accuracy notes and related verses.
export function SceneCheckSection({ data }: { data: ChapterWorkup }) {
  // Prefer generated scene checks; fall back to static config (e.g. Psalm 23).
  const allChecks: SceneCheck[] =
    data.sceneChecks && data.sceneChecks.length > 0 ? data.sceneChecks : getSceneChecks(data.slug) ?? [];
  // EXACTLY the checks rendered on the Visual Chapter Path are excluded here
  // — computed over the SAME scene set the path renders (supporting images
  // only; the hero is not on the path). A check bound to the hero scene, or
  // a second check bound to an already-integrated scene, keeps its standalone
  // card so nothing is ever dropped.
  const { standalone: checks } = assignSceneChecks(
    data.slug,
    allChecks,
    supportingImagesFor(data).map((image) => image.kind),
  );
  if (checks.length === 0) return null;

  return (
    <section className="space-y-2.5">
      {checks.map((c, i) => (
        <SceneCheckCard key={i} c={c} />
      ))}
    </section>
  );
}

function SceneCheckCard({ c }: { c: SceneCheck }) {
  // Owner direction 2026-07-19: photo-and-caption style — always open,
  // bigger, sitting directly under the image it corrects (the hero).
  return (
    <div
      className="rounded-md border bg-card px-3.5 py-3.5 shadow-hair"
      style={{ borderLeft: "3px solid var(--accent-strong)" }}
    >
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent-strong" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        <span className="text-[15px] font-semibold leading-snug text-primary">{c.title}</span>
      </div>
      <p className="mt-1.5 text-[14px] leading-relaxed text-secondary">{c.body}</p>
      {/* visualAccuracyNotes are image-generation production guardrails
          (owner/reviewer-facing). Never render them to readers — owner
          direction 2026-07-15. */}
      {c.relatedVerses && c.relatedVerses.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {c.relatedVerses.map((v) => (
            <span key={v} className="rounded-full bg-tint px-2 py-0.5 text-[10px] font-medium text-accent-strong">
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
