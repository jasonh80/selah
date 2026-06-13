import type { ChapterWorkup } from "@/lib/types";

export function ChapterHero({ data }: { data: ChapterWorkup }) {
  return (
    <section className="pt-1">
      <div className="flex items-center gap-1.5 text-accent-strong">
        <span aria-hidden>☀︎</span>
        <p className="text-label">Today&rsquo;s Chapter</p>
      </div>

      <h1 className="text-title mt-1.5 text-primary">{data.title}</h1>
      <p className="text-subtitle mt-2 text-primary">{data.subtitle}</p>
      <p className="text-body mt-2 text-secondary">{data.tagline}</p>

      {/* Read / Listen / Verse by Verse */}
      <div className="mt-4 flex gap-2">
        <a
          href="#chapter"
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white shadow-hair"
        >
          📖 Read
        </a>
        <a
          href="#chapter"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium text-primary"
        >
          🎧 Listen
        </a>
        <a
          href="#chapter"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium text-primary"
        >
          ☰ Verse
        </a>
      </div>
    </section>
  );
}
