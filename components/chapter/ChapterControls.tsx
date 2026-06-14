"use client";

import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";

// Three calm, equally-sized controls on one line, right-aligned on desktop:
//   [ Read the Chapter ]  [ Quick Dive ]  [ Deep Dive ]
// Read the Chapter is an ACTION (smooth-scrolls to Scripture). Quick/Deep is the
// reading-mode toggle (active one filled). All share the same pill size.
export function ChapterControls() {
  const { mode, setMode } = useReadingMode();

  function readChapter() {
    document.getElementById("chapter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const base =
    "flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition";

  const modeBtn = (m: ReadingMode, label: string) =>
    `${base} ${mode === m ? "bg-accent-strong text-white shadow-hair" : "border bg-card text-secondary hover:text-primary"}`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button onClick={readChapter} className={`${base} border bg-card text-primary hover:border-accent/40`}>
        Read the Chapter
        <span aria-hidden className="text-secondary">↓</span>
      </button>
      <button onClick={() => setMode("quick")} aria-pressed={mode === "quick"} className={modeBtn("quick", "Quick Dive")}>
        Quick Dive
      </button>
      <button onClick={() => setMode("deep")} aria-pressed={mode === "deep"} className={modeBtn("deep", "Deep Dive")}>
        Deep Dive
      </button>
    </div>
  );
}
