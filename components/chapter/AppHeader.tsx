"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { VersionSelect } from "@/components/chapter/VersionSelect";

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
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
        {/* Brand + tagline: under logo on mobile, inline on desktop */}
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <Logo className="text-[17px] text-accent-strong" />
          <span className="flex items-baseline gap-2 text-[11px] text-secondary">
            <span className="hidden text-secondary/50 sm:inline">·</span>
            Pause. Reflect. Lift up.
          </span>
        </div>

        {/* Quiet controls */}
        <div className="flex items-center gap-1.5">
          <button className="rounded-full px-2.5 py-1.5 text-[13px] text-secondary transition hover:bg-card-soft hover:text-primary">
            Chapters
          </button>

          <VersionSelect versions={versions} value={version} onChange={setVersion} />

          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
