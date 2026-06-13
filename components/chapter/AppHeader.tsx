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
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-2 px-4 py-3 lg:px-6">
        {/* Brand has the presence */}
        <Logo className="text-[17px] text-accent-strong" />

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
