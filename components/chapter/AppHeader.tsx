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

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-2 px-4 py-3 lg:px-6">
        {/* Brand has the presence */}
        <Logo className="text-[17px] text-accent-strong" />

        {/* Quiet controls */}
        <div className="flex items-center gap-1.5">
          <button className="rounded-full px-2.5 py-1.5 text-[13px] text-secondary transition hover:bg-card-soft hover:text-primary">
            Chapters
          </button>

          <label className="relative">
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="appearance-none rounded-full bg-card-soft py-1.5 pl-3 pr-6 text-[13px] font-medium text-primary"
              aria-label="Bible version"
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-secondary">
              ⌄
            </span>
          </label>

          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
