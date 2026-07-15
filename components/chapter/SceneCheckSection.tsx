"use client";

import type { ChapterWorkup } from "@/lib/types";
import { useReadingMode } from "@/components/ReadingModeProvider";
import { getSceneChecks, type SceneCheck } from "@/lib/content/chapter-content";

// Recurring "Scene Check" callouts — warm, visual nudges that correct common
// mental-image mistakes. Quick Dive: compact (label + title + body). Deep Dive:
// adds the visual-accuracy notes and related verses.
export function SceneCheckSection({ data }: { data: ChapterWorkup }) {
  const { mode } = useReadingMode();
  // Prefer generated scene checks; fall back to static config (e.g. Psalm 23).
  const checks: SceneCheck[] =
    data.sceneChecks && data.sceneChecks.length > 0 ? data.sceneChecks : getSceneChecks(data.slug) ?? [];
  if (checks.length === 0) return null;
  const deep = mode === "deep";

  return (
    <section className="space-y-2.5">
      {checks.map((c, i) => (
        <SceneCheckCard key={i} c={c} deep={deep} />
      ))}
    </section>
  );
}

function SceneCheckCard({ c, deep }: { c: SceneCheck; deep: boolean }) {
  return (
    <div
      className="rounded-md border bg-card p-4 shadow-hair"
      style={{ borderLeft: "3px solid var(--accent-strong)" }}
    >
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-accent-strong" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        <p className="text-eyebrow">{c.label ?? "Scene Check"}</p>
      </div>

      <p className="text-card-title mt-1 text-primary">{c.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{c.body}</p>

      {/* visualAccuracyNotes are image-generation production guardrails
          (owner/reviewer-facing). Never render them to readers — owner
          direction 2026-07-15. */}

      {deep && c.relatedVerses && c.relatedVerses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
