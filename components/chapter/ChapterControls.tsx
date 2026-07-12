"use client";

import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";

// Three calm, equally-sized controls on one line, right-aligned on desktop:
//   [ Read <reference> ]  [ Quick Dive ]  [ Deep Dive ]
// Read <reference> is a DISCLOSURE toggle (opens Scripture inline directly
// beneath the controls) when the coordinator passes toggle props; without them
// it falls back to the original smooth-scroll action. Quick/Deep is the
// reading-mode toggle (active one filled). All share the same pill size.
export function ChapterControls({
  reference,
  scriptureOpen,
  onToggleScripture,
}: {
  reference?: string;
  scriptureOpen?: boolean;
  onToggleScripture?: () => void;
}) {
  const { mode, setMode } = useReadingMode();

  function readChapter() {
    if (onToggleScripture) {
      onToggleScripture();
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("chapter")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  const base =
    "flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition";

  const modeBtn = (m: ReadingMode) =>
    `${base} ${mode === m ? "bg-accent-strong text-white shadow-hair" : "border bg-card text-secondary hover:text-primary"}`;

  const isToggle = Boolean(onToggleScripture);
  const readLabel = reference ? `Read ${reference}` : "Read the Chapter";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={readChapter}
        aria-expanded={isToggle ? Boolean(scriptureOpen) : undefined}
        aria-controls={isToggle ? "chapter" : undefined}
        className={`${base} border bg-card text-primary hover:border-accent/40`}
      >
        {isToggle && scriptureOpen ? `Close ${reference ?? "the Chapter"}` : readLabel}
        <span aria-hidden className="text-secondary">
          {isToggle ? (scriptureOpen ? "⌃" : "⌄") : "↓"}
        </span>
      </button>
      <button type="button" onClick={() => setMode("quick")} aria-pressed={mode === "quick"} className={modeBtn("quick")}>
        Quick Dive
      </button>
      <button type="button" onClick={() => setMode("deep")} aria-pressed={mode === "deep"} className={modeBtn("deep")}>
        Deep Dive
      </button>
    </div>
  );
}
