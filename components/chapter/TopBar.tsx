import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export function TopBar({ reference }: { reference: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-page items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Logo className="text-lg" />
          <span className="hidden h-4 w-px bg-line sm:block" />
          <span className="hidden text-sm text-secondary sm:block">{reference}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border bg-card px-3 py-1.5 text-sm text-secondary shadow-soft transition hover:text-primary">
            Chapters
          </button>
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
