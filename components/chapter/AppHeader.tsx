"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { VersionSelect } from "@/components/chapter/VersionSelect";
import { VERSIONS, useVersion } from "@/components/VersionProvider";
import { NAV, isActive } from "@/components/shell/nav";

export function AppHeader() {
  const { version, setVersion } = useVersion();
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
        <nav className="hidden items-center gap-1 lg:flex">
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

        {/* Quiet controls */}
        <div className="flex items-center gap-1.5">
          <VersionSelect versions={[...VERSIONS]} value={version} onChange={(v) => setVersion(v as typeof version)} />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
