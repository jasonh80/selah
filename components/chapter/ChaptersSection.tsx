import Link from "next/link";
import type { ChapterWorkup } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

// Previous / current / next, derived from the current chapter. Neighbours link
// normally; if a neighbour hasn't been generated yet (generation off), it 404s —
// which is acceptable for now. No auto-generation.
export function ChaptersSection({ data }: { data: ChapterWorkup }) {
  const base = data.slug.replace(/-\d+$/, "");
  const ch = data.chapter;

  const rows: { label: string; sub: string; href?: string; active?: boolean }[] = [];
  if (ch > 1) rows.push({ label: `${data.book} ${ch - 1}`, sub: "Previous", href: `/chapter/${base}-${ch - 1}` });
  rows.push({ label: `${data.book} ${ch}`, sub: data.subtitle || "Current chapter", active: true });
  rows.push({ label: `${data.book} ${ch + 1}`, sub: "Next", href: `/chapter/${base}-${ch + 1}` });

  return (
    <section id="chapters" className="scroll-mt-20">
      <SectionHead eyebrow="Browse" title="Chapters" />
      <div className="overflow-hidden rounded-md border bg-card shadow-hair">
        {rows.map((r) => (
          <Row key={r.label} {...r} />
        ))}
      </div>
    </section>
  );
}

function Row({
  label,
  sub,
  href,
  active = false,
}: {
  label: string;
  sub: string;
  href?: string;
  active?: boolean;
}) {
  const inner = (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 ${
        active ? "bg-tint" : "transition hover:bg-card-soft"
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-card-title ${active ? "text-accent-strong" : "text-primary"}`}>
          {label}
        </span>
        <span className="block truncate text-[12px] text-secondary">{sub}</span>
      </span>
      <span className={`shrink-0 ${active ? "text-accent-strong" : "text-secondary"}`}>
        {active ? "●" : "›"}
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}
