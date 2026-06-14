"use client";

import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";

// Segmented Quick Dive / Deep Dive control. Deep Dive expands the study cards
// for a continuous read; it does not force open Transparency or affect the
// theme/version selectors or the Read tab.
export function ReadingModeToggle() {
  const { mode, setMode } = useReadingMode();
  const options: { id: ReadingMode; label: string }[] = [
    { id: "quick", label: "Quick Dive" },
    { id: "deep", label: "Deep Dive" },
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
