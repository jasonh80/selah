"use client";

import { useEffect, useState } from "react";
import { ExpandableImage } from "@/components/chapter/ExpandableImage";
import { useReadingMode } from "@/components/ReadingModeProvider";
import type { SceneCheck } from "@/lib/content/chapter-content";

/**
 * Photo with its scene check attached as a caption BELOW the picture, inside
 * ONE shared frame — "think an Instagram photo with caption below, but Selah
 * style" (owner direction 2026-07-20). Deliberately distinct from every other
 * section: no standalone card, no accent side-bar — the caption belongs to
 * the photo, separated only by a hairline.
 *
 * Reading-mode rule (owner): Quick Study compacts — only the caption's title
 * line shows, tap for the full check. Deep Study reads without clicks — the
 * caption arrives open. Users can still toggle any caption within a mode.
 */
export function CaptionedImage({
  src,
  alt,
  overlayTitle,
  checks,
  frameClassName = "overflow-hidden rounded-md border shadow-hair",
}: {
  src: string;
  alt: string;
  /** Short scene title shown over the photo's lower edge (path scenes). */
  overlayTitle?: string;
  /** Scene checks attached below the photo, in order. */
  checks: SceneCheck[];
  frameClassName?: string;
}) {
  const primary = checks[0];
  return (
    <figure className={frameClassName}>
      <div className="relative">
        <div className="aspect-[3/2] w-full bg-card-soft">
          <ExpandableImage
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            caption={primary ? { title: primary.title, body: primary.body } : undefined}
          />
        </div>
        {overlayTitle && (
          <>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.78)] via-[rgba(16,16,20,0.04)] to-transparent" />
            <figcaption className="pointer-events-none absolute inset-x-s3 bottom-s3">
              <span className="block text-[13px] font-semibold leading-snug text-white sm:text-[14px]">
                {overlayTitle}
              </span>
            </figcaption>
          </>
        )}
      </div>
      {checks.map((check, i) => (
        <CaptionBlock key={i} check={check} />
      ))}
    </figure>
  );
}

function CaptionBlock({ check }: { check: SceneCheck }) {
  const { mode } = useReadingMode();
  // Deep Study opens every caption (zero-click reading); Quick Study shows
  // the title line only. Mode switches reset the caption; taps still work
  // within a mode. Server render + first client paint use the provider's
  // "quick" default, so hydration never mismatches (IQ-009 lesson).
  const [open, setOpen] = useState(mode === "deep");
  useEffect(() => {
    setOpen(mode === "deep");
  }, [mode]);

  return (
    <div className="border-t bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-s3 py-2.5 text-left"
      >
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
        <span className="flex-1 text-[15px] font-semibold leading-snug text-primary">{check.title}</span>
        <span aria-hidden className="text-secondary">
          {open ? "⌃" : "›"}
        </span>
      </button>
      {open && (
        <div className="px-s3 pb-s3">
          {/* visualAccuracyNotes are image-generation production guardrails
              (owner/reviewer-facing). Never render them to readers — owner
              direction 2026-07-15. */}
          <p className="text-[14px] leading-relaxed text-secondary">{check.body}</p>
          {check.relatedVerses && check.relatedVerses.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {check.relatedVerses.map((v) => (
                <span
                  key={v}
                  className="rounded-full bg-tint px-2 py-0.5 text-[10px] font-medium text-accent-strong"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
