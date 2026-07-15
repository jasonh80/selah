"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { VersionSelect } from "@/components/chapter/VersionSelect";
import { VERSIONS, useVersion } from "@/components/VersionProvider";
import { useReadingMode } from "@/components/ReadingModeProvider";
import { NAV, isActive } from "@/components/shell/nav";

export function AppHeader() {
  const { version, setVersion } = useVersion();
  const { focus, setFocus } = useReadingMode();
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
        {/* Brand + tagline: under logo on mobile, inline on desktop */}
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <Logo className="text-[17px] text-accent-strong" />
          <span className="flex items-baseline gap-2 text-[11px] text-secondary">
            <span className="hidden text-secondary/50 sm:inline">·</span>
            Pause. Reflect. Elevate.
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="selah-chrome hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                  active ? "bg-tint font-medium text-accent-strong" : "text-secondary hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Quiet controls. Selah Focus sits OUTSIDE the dimmed .selah-chrome
            wrapper so it stays visible and tappable while focus is on —
            otherwise the reader could never turn it off. */}
        <div className="flex items-center gap-1.5">
          <span className="selah-chrome flex items-center gap-1.5">
            <VersionSelect versions={[...VERSIONS]} value={version} onChange={(v) => setVersion(v as typeof version)} />
            <ThemeSwitcher />
          </span>
          <button
            onClick={() => setFocus(!focus)}
            aria-pressed={focus}
            aria-label="Selah Focus — dim everything except the chapter"
            title="Selah Focus"
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition ${
              focus ? "bg-accent-strong text-white shadow-hair" : "bg-card-soft text-secondary hover:text-primary"
            }`}
          >
            <span aria-hidden className="text-[10px]">◉</span>
            <span className="hidden sm:inline">Focus</span>
          </button>
        </div>
      </div>
    </header>
  );
}
