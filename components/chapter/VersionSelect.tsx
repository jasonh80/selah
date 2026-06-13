"use client";

import { useState } from "react";

// Compact version popover — shows only the selected version, never the full list inline.
export function VersionSelect({
  versions,
  value,
  onChange,
  prefix = false,
}: {
  versions: string[];
  value: string;
  onChange: (v: string) => void;
  prefix?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full bg-card-soft px-2.5 py-1.5 text-[13px] font-medium text-primary"
        aria-label="Bible version"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {prefix && <span className="font-normal text-secondary">Version:</span>}
        {value}
        <span className="text-[10px] text-secondary">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-2xl border bg-card p-1.5 shadow-soft"
          >
            {versions.map((v) => (
              <button
                key={v}
                role="option"
                aria-selected={v === value}
                onClick={() => {
                  onChange(v);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                  v === value ? "bg-tint text-primary" : "text-secondary hover:bg-tint/60"
                }`}
              >
                {v}
                {v === value && <span className="text-accent-strong">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
