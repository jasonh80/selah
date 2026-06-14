"use client";

import { ReadingModeToggle } from "@/components/chapter/ReadingModeToggle";

// One clean control cluster near the top:
//   [ Read the Chapter ]   [ Quick Dive | Deep Dive ]
// "Read the Chapter" is an ACTION (smooth-scrolls to the Scripture section) — it
// is not a mode and never changes the saved Quick/Deep preference.
export function ChapterControls() {
  function readChapter() {
    document.getElementById("chapter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        onClick={readChapter}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-strong px-4 py-2.5 text-[13px] font-semibold text-white shadow-hair transition active:scale-[0.98]"
      >
        Read the Chapter
        <span aria-hidden className="text-white/80">↓</span>
      </button>
      <ReadingModeToggle />
    </div>
  );
}
