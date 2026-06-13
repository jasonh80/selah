"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export function AppHeader({
  versions,
  defaultVersion,
}: {
  versions: string[];
  defaultVersion: string;
}) {
  const [version, setVersion] = useState(defaultVersion);
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto grid max-w-app grid-cols-3 items-center px-4 py-3">
        {/* Left: menu + theme */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label="Menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-card-soft"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Center: wordmark */}
        <div className="flex justify-center">
          <Logo className="text-base text-accent-strong" />
        </div>

        {/* Right: version selector */}
        <div className="flex items-center justify-end gap-2">
          <label className="relative">
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="appearance-none rounded-full border bg-card py-1.5 pl-3 pr-7 text-sm font-medium text-primary shadow-hair"
              aria-label="Bible version"
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary">
              ⌄
            </span>
          </label>
        </div>
      </div>

      {menu && (
        <div className="border-t bg-card px-4 py-3">
          <div className="mx-auto max-w-app">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-secondary">
              Theme
            </p>
            <ThemeSwitcher inline />
          </div>
        </div>
      )}
    </header>
  );
}
