import type { ChapterWorkup } from "@/lib/types";
import { SectionTitle } from "@/components/ui/primitives";

export function GeneratedImages({ data }: { data: ChapterWorkup }) {
  return (
    <section className="space-y-4">
      <SectionTitle eyebrow="Made visual" title="Three views of the chapter" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.images.map((img) => (
          <figure key={img.kind} className="overflow-hidden rounded-card border bg-card shadow-card">
            <div className="aspect-[4/5] w-full bg-tint">
              <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
            </div>
            <figcaption className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-accent-strong">
                {img.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">{img.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
