"use client";

import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";

// Segmented Quick Study / Deep Study control (returned 2026-07-20, owner
// direction). Deep Study expands every study card and scene-check caption for
// a zero-click continuous read; Quick Study compacts them to their authored
// title/preview lines. It never affects the theme/version selectors, the
// Read control, or FAQs (always collapsed).
export function ReadingModeToggle() {
  const { mode, setMode } = useReadingMode();
  const options: { id: ReadingMode; label: string }[] = [
    { id: "quick", label: "Quick Study" },
    { id: "deep", label: "Deep Study" },
  ];
  return (
    <div className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-hair">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setMode(o.id)}
          aria-pressed={mode === o.id}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
            mode === o.id ? "bg-accent-strong text-white" : "text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
