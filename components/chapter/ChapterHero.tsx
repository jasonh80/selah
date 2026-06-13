import type { ChapterWorkup } from "@/lib/types";

export function ChapterHero({ data }: { data: ChapterWorkup }) {
  const establishing = data.images.find((i) => i.kind === "establishing")!;
  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent-strong">
          Today · {data.reference}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-primary md:text-6xl">
          {data.title}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-secondary">{data.theme}</p>
      </div>

      {/* Large establishing image */}
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-card border shadow-card">
        <img
          src={establishing.src}
          alt={establishing.alt}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-almost-black/55 to-transparent p-4 md:p-5">
          <p className="text-sm text-white/90">{establishing.caption}</p>
        </div>
      </div>
    </section>
  );
}
