"use client";

import { useState } from "react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { VERSIONS, useVersion } from "@/components/VersionProvider";
import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";

// Study mode preference (owner direction 2026-07-20: default Quick; the user
// chooses their own default here). Writes the SAME persisted mode the chapter
// pills use — one source of truth, effective immediately everywhere.
export function StudyModePicker() {
  const { mode, setMode } = useReadingMode();
  const options: { id: ReadingMode; label: string; hint: string }[] = [
    { id: "quick", label: "Quick Study", hint: "the essentials, tap to go deeper" },
    { id: "deep", label: "Deep Study", hint: "everything open, just scroll" },
  ];
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setMode(o.id)}
          aria-pressed={mode === o.id}
          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition ${
            mode === o.id ? "bg-tint text-primary" : "bg-card text-secondary hover:text-primary"
          }`}
        >
          <span className={`text-sm ${mode === o.id ? "font-medium" : ""}`}>{o.label}</span>
          <span className="text-[11px] text-secondary">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

// Theme picker: reuse the inline 6-swatch switcher.
export function ThemePicker() {
  return <ThemeSwitcher inline />;
}

// Version preference (UI-only; no Bible API).
export function VersionPicker() {
  const { version, setVersion } = useVersion();
  return (
    <div className="flex flex-wrap gap-2">
      {VERSIONS.map((v) => (
        <button
          key={v}
          onClick={() => setVersion(v)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            v === version ? "bg-tint font-medium text-accent-strong" : "bg-card text-secondary hover:text-primary"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// Placeholder toggle — visual only, not yet connected to anything.
export function TransparencyToggle() {
  const [on, setOn] = useState(false);
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent-strong" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
