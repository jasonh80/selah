import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageBody, ComingLater } from "@/components/shell/PageBody";

export default function ChaptersPage() {
  return (
    <AppShell>
      <PageBody eyebrow="Read" title="Chapters" sub="Choose where to read. The full Bible browser is on the way.">
        {/* Search (placeholder) */}
        <input
          disabled
          placeholder="Search the Bible — coming soon"
          className="w-full cursor-not-allowed rounded-full border bg-card-soft px-4 py-2.5 text-sm text-secondary"
        />

        {/* Book / chapter selector (placeholder) */}
        <div className="mt-3 flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-full border bg-card-soft px-3.5 py-2 text-sm text-secondary">
            Book: Exodus <span className="text-[10px]">▾</span>
          </span>
          <span className="flex items-center gap-2 rounded-full border bg-card-soft px-3.5 py-2 text-sm text-secondary">
            Chapter: 27 <span className="text-[10px]">▾</span>
          </span>
          <ComingLater />
        </div>

        {/* Reading list */}
        <div className="mt-6 overflow-hidden rounded-md border bg-card shadow-hair">
          <ChapterRow label="Exodus 26" sub="The Tabernacle" tag="Previous" />
          <ChapterRow label="Exodus 27" sub="The Bronze Altar, the Courtyard, and the Lamp" tag="Newest" href="/chapter/exodus-27" active />
          <ChapterRow label="Exodus 28" sub="The Priestly Garments" tag="Next" />
        </div>
      </PageBody>
    </AppShell>
  );
}

function ChapterRow({
  label,
  sub,
  tag,
  href,
  active = false,
}: {
  label: string;
  sub: string;
  tag: string;
  href?: string;
  active?: boolean;
}) {
  const inner = (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0 ${
        active ? "bg-tint" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-card-title ${active ? "text-accent-strong" : "text-primary"}`}>{label}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">{tag}</span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-secondary">{sub}</p>
      </div>
      <span className={active ? "text-accent-strong" : "text-secondary"}>
        {href ? "›" : <span className="text-[10px] uppercase tracking-[0.1em]">soon</span>}
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:bg-card-soft">
      {inner}
    </Link>
  ) : (
    <div className="opacity-70">{inner}</div>
  );
}
