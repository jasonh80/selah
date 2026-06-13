import type { ChapterWorkup } from "@/lib/types";
import { RailHeader } from "@/components/chapter/RailHeader";

export function GeneratedImagesSection({ data }: { data: ChapterWorkup }) {
  return (
    <section className="space-y-3">
      <RailHeader icon="✦" title="Generated Images" action="View All" />
      <div className="grid grid-cols-3 gap-2.5">
        {data.images.map((img) => (
          <button
            key={img.kind}
            className="group relative aspect-[3/4] overflow-hidden rounded-md border text-left shadow-hair transition active:scale-[0.98]"
          >
            <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.78)] via-transparent to-[rgba(16,16,20,0.2)]" />
            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(16,16,20,0.55)] text-[10px] font-bold text-white backdrop-blur-sm">
              {img.index}
            </span>
            <span className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold leading-tight text-white">{img.label}</span>
              <span className="text-white/80">›</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
