import Link from "next/link";
import type { ChapterWorkup } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { chapterLinkable } from "@/lib/chapters/registry";
import { chapterCount } from "@/lib/bible/books";

// Previous / current / next, derived from the current chapter — but a
// neighbour renders ONLY when its page actually exists (servable published
// row or local fixture). Published Mark 10 must never advertise a 404
// "Next: Mark 11" (IQ-012, Codex post-launch audit 2026-07-18). Server
// component: the two existence checks run at render time.
export async function ChaptersSection({ data }: { data: ChapterWorkup }) {
  const base = data.slug.replace(/-\d+$/, "");
  const ch = data.chapter;
  const lastChapter = chapterCount(data.book) || Number.MAX_SAFE_INTEGER;

  const prevSlug = ch > 1 ? `${base}-${ch - 1}` : null;
  const nextSlug = ch < lastChapter ? `${base}-${ch + 1}` : null;
  const [prevOk, nextOk] = await Promise.all([
    prevSlug ? chapterLinkable(prevSlug) : Promise.resolve(false),
    nextSlug ? chapterLinkable(nextSlug) : Promise.resolve(false),
  ]);

  const rows: { label: string; sub: string; href?: string; active?: boolean }[] = [];
  if (prevSlug && prevOk) rows.push({ label: `${data.book} ${ch - 1}`, sub: "Previous", href: `/chapter/${prevSlug}` });
  rows.push({ label: `${data.book} ${ch}`, sub: data.subtitle || "Current chapter", active: true });
  if (nextSlug && nextOk) rows.push({ label: `${data.book} ${ch + 1}`, sub: "Next", href: `/chapter/${nextSlug}` });

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
