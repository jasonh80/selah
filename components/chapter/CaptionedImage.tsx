"use client";

import { useEffect, useState } from "react";
import { ExpandableImage } from "@/components/chapter/ExpandableImage";
import { useReadingMode } from "@/components/ReadingModeProvider";
import type { SceneCheck } from "@/lib/content/chapter-content";

/**
 * Photo card, the ratified one-headline treatment (owner, iterated live on
 * the playground and approved 2026-07-23 — "let's turn all that on"):
 *
 *   · The photo is ALWAYS clean — no burned-in overlay text, ever. The
 *     double-headline bug (overlay + card repeating each other) dies here.
 *   · ONE headline row under the photo: the editorial headline card when the
 *     chapter has one, else the scene's title. The only loud thing.
 *   · "Dive deeper ⌄" rides the headline row (spaced, no emoji — owner) and
 *     opens ONE tinted panel carrying every scene check for this photo:
 *     each check's title leads in bold, its teaching follows. Three checks
 *     no longer stack as three fake headlines — they are one dive.
 *   · Reading-mode rule (owner): Deep Study opens the dive by itself; Quick
 *     Study is one tap. Server render + first client paint use the
 *     provider's "quick" default so hydration never mismatches (IQ-009).
 */
export function CaptionedImage({
  src,
  alt,
  overlayTitle,
  captionCard,
  checks,
  frameClassName = "overflow-hidden rounded-md border shadow-hair",
}: {
  src: string;
  alt: string;
  /** The scene's short title — the headline FALLBACK when no editorial
      headline card exists for this photo. Never burned into the photo. */
  overlayTitle?: string;
  /** One-line editorial headline (the approved Mark headline captions). */
  captionCard?: string;
  /** Scene checks for this photo — rendered inside the single dive panel. */
  checks: SceneCheck[];
  frameClassName?: string;
}) {
  const { mode } = useReadingMode();
  const [open, setOpen] = useState(mode === "deep");
  useEffect(() => {
    setOpen(mode === "deep");
  }, [mode]);

  const headline = captionCard ?? overlayTitle;
  const hasDive = checks.length > 0;
  const primary = checks[0];
  // Full-size viewer caption: the accuracy note wins when present; otherwise
  // the headline repeats there for orientation (Codex ruling).
  const viewerCaption = primary
    ? { title: primary.title, body: primary.body }
    : headline
      ? { title: headline }
      : undefined;

  return (
    <figure className={frameClassName}>
      <div className="aspect-[3/2] w-full bg-card-soft">
        <ExpandableImage src={src} alt={alt} className="h-full w-full object-cover" caption={viewerCaption} />
      </div>

      {headline && (
        <div className="border-t bg-card px-s3 py-2">
          <p className="text-[15px] font-semibold leading-tight text-primary">
            {headline}
            {hasDive && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="ml-3 whitespace-nowrap align-middle text-[12px] font-medium text-accent-strong"
              >
                Dive deeper {open ? "⌃" : "⌄"}
              </button>
            )}
          </p>
        </div>
      )}
      {/* A photo with checks but no headline still needs its dive handle. */}
      {!headline && hasDive && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center border-t bg-card px-s3 py-2 text-left text-[12px] font-medium text-accent-strong"
        >
          Dive deeper
          <span aria-hidden className="ml-auto text-[11px]">{open ? "⌃" : "⌄"}</span>
        </button>
      )}

      {hasDive && open && (
        <div className="border-t bg-tint px-s3 py-2.5" style={{ borderLeft: "3px solid var(--accent-strong)" }}>
          {checks.map((check, i) => (
            <div key={i} className={i > 0 ? "mt-2.5 border-t pt-2.5" : ""}>
              <p className="text-[12.5px] font-semibold leading-snug text-primary">{check.title}</p>
              {/* visualAccuracyNotes are image-generation production
                  guardrails (owner/reviewer-facing) — never rendered. */}
              <p className="mt-1 text-[12px] leading-relaxed text-secondary">{check.body}</p>
              {check.relatedVerses && check.relatedVerses.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {check.relatedVerses.map((v) => (
                    <span key={v} className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-accent-strong">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
