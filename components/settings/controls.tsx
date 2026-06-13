"use client";

import { useState } from "react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { VERSIONS, useVersion } from "@/components/VersionProvider";

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
