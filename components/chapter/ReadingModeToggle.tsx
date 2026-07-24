"use client";

import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";

// Segmented Quick Study / Deep Study control (returned 2026-07-20, owner
// direction). Deep Study expands every study card and scene-check caption for
// a zero-click continuous read; Quick Study compacts them to their authored
// title/preview lines. It never affects the theme/version selectors, the
// Read control, or FAQs (always collapsed).
export function ReadingModeToggle() {
  const { mode, setMode } = useReadingMode();
  // The Read control moved onto the Scripture pane, so this toggle owns the
  // row and keeps its full labels at every width.
  const options: { id: ReadingMode; label: string }[] = [
    { id: "quick", label: "Quick Study" },
    { id: "deep", label: "Deep Study" },
  ];
  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-full border bg-card p-0.5 shadow-hair">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setMode(o.id)}
          aria-pressed={mode === o.id}
          className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12.5px] font-medium transition sm:px-3 sm:text-[13px] ${
            mode === o.id ? "bg-accent-strong text-white" : "text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
