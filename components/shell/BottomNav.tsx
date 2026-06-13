"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/components/shell/nav";

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition ${
                active ? "text-accent-strong" : "text-secondary"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
