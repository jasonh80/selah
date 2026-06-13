import type { ChapterWorkup, ChapterMap } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

// Expanded detail for the map previews in the dashboard above.
export function MapsSection({ data }: { data: ChapterWorkup }) {
  return (
    <section>
      <SectionHead eyebrow="Where it happened" title="Map Details" sub="Expanded from the previews above" />
      <div className="space-y-2.5">
        <BigMap title="Modern Map" map={data.modernMap} />
        <BigMap title="Historic Map" map={data.historicMap} />
      </div>
    </section>
  );
}

function BigMap({ title, map }: { title: string; map: ChapterMap }) {
  return (
    <div className="overflow-hidden rounded-md border bg-card shadow-hair">
      <div className="relative aspect-[16/9] w-full bg-card-soft">
        <img src={map.src} alt={map.alt} className="h-full w-full object-cover" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(16,16,20,0.55)] px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {title}
        </span>
      </div>
      <div className="p-3.5">
        <p className="text-card-title text-primary">{map.caption}</p>
        {map.note && <p className="mt-1 text-[12px] leading-relaxed text-secondary">{map.note}</p>}
      </div>
    </div>
  );
}
