"use client";

import { useState } from "react";
import { THEMES, useTheme } from "@/components/ThemeProvider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm text-secondary shadow-soft transition hover:text-primary"
        aria-label="Change theme"
      >
        <span
          className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5"
          style={{ background: active.swatch }}
        />
        <span className="hidden sm:inline">{active.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border bg-card p-1.5 shadow-card">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  t.id === theme ? "bg-tint text-primary" : "text-secondary hover:bg-tint/60"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full ring-1 ring-black/5"
                  style={{ background: t.swatch }}
                />
                {t.label}
                {t.id === theme && <span className="ml-auto text-accent-strong">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
