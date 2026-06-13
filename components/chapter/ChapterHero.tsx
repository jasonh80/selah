import type { ChapterWorkup } from "@/lib/types";

export function ChapterHero({ data }: { data: ChapterWorkup }) {
  return (
    <section className="pt-2">
      <div className="flex items-center gap-1.5 text-accent-strong">
        <span aria-hidden>☀︎</span>
        <p className="text-label">Today&rsquo;s Chapter</p>
      </div>

      <h1 className="text-title mt-2.5 text-primary lg:text-[48px]">{data.title}</h1>
      <p className="text-subtitle mt-2.5 text-primary">{data.subtitle}</p>

      {/* Read / Listen / Verse by Verse */}
      <div className="mt-5 flex gap-2.5">
        <a
          href="#chapter"
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-accent-strong px-3 py-2.5 text-[13px] font-semibold text-white shadow-hair"
        >
          Read
        </a>
        <a
          href="#chapter"
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-3 py-2.5 text-[13px] font-medium text-primary"
        >
          Listen
        </a>
        <a
          href="#chapter"
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-3 py-2.5 text-[13px] font-medium text-primary"
        >
          Verse by Verse
        </a>
      </div>
    </section>
  );
}
