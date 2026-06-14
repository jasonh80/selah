import type { ChapterWorkup, ChapterMap } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { StylizedMap } from "@/components/chapter/StylizedMap";

// The single place for location content. Real visual maps are drawn as elegant,
// theme-aware inline SVG (StylizedMap) — never placeholder image files. There is
// only ONE Maps & Places section; no map previews live anywhere else.
export function MapsSection({ data }: { data: ChapterWorkup }) {
  const notes = [data.historicMap.note, data.modernMap.note].filter(Boolean) as string[];

  return (
    <section id="maps" className="scroll-mt-20">
      <SectionHead eyebrow="Where it happened" title="Maps & Places" />
      <div className="space-y-2.5">
        <div className="grid gap-2.5 md:grid-cols-2">
          <MapCard
            title="Ancient World"
            variant="ancient"
            regionLabel="Judah"
            tag="Representative region"
            map={data.historicMap}
          />
          <MapCard
            title="Modern Region"
            variant="modern"
            regionLabel="Judean Hill Country"
            tag="Not exact event site"
            map={data.modernMap}
          />
        </div>

        <div className="rounded-md border bg-card p-4 shadow-hair">
          <p className="text-label text-secondary">Location Notes</p>
          <ul className="mt-2 space-y-1.5">
            {notes.map((n) => (
              <li key={n} className="text-[12px] leading-relaxed text-secondary">
                {n}
              </li>
            ))}
            <li className="text-[12px] leading-relaxed text-secondary">
              Representative location, not an exact event site — Psalm 23 does not name a specific
              place; these maps show David’s traditional shepherding world near Bethlehem and Judah.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function MapCard({
  title,
  variant,
  regionLabel,
  tag,
  map,
}: {
  title: string;
  variant: "ancient" | "modern";
  regionLabel: string;
  tag: string;
  map: ChapterMap;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border bg-card shadow-hair">
      <div className="relative">
        <StylizedMap variant={variant} regionLabel={regionLabel} tag={tag} />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(16,16,20,0.6)] px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {title}
        </span>
      </div>
      <div className="flex-1 p-3.5">
        <p className="text-[12px] leading-relaxed text-secondary">{map.caption}</p>
      </div>
    </div>
  );
}
