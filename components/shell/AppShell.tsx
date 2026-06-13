import type { ReactNode } from "react";
import { AppHeader } from "@/components/chapter/AppHeader";
import { BottomNav } from "@/components/shell/BottomNav";

// The app frame: top header (with desktop nav) + mobile bottom nav, wrapped
// around any page content. Nav lives here, not inside ChapterView, so the
// chapter template stays focused on rendering a ChapterWorkup.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      {/* room for the fixed bottom nav on mobile */}
      <div className="pb-24 lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  );
}
