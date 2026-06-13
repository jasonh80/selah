import type { ChapterWorkup } from "@/lib/types";

export function HeroImage({ data }: { data: ChapterWorkup }) {
  const establishing = data.images.find((i) => i.kind === "establishing")!;
  return (
    <section className="relative overflow-hidden rounded-lg border shadow-soft">
      <div className="aspect-[16/11] w-full bg-card-soft">
        <img src={establishing.src} alt={establishing.alt} className="h-full w-full object-cover" />
      </div>

      {/* Metadata chips overlaid on the bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(16,16,20,0.72)] via-[rgba(16,16,20,0.25)] to-transparent p-2.5 pt-10">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {data.metaChips.map((chip) => (
            <span
              key={chip.text}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-[rgba(16,16,20,0.5)] px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-md"
            >
              <span className={chip.jesus ? "text-jesus-red" : "text-white/80"} aria-hidden>
                {chip.icon}
              </span>
              {chip.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
