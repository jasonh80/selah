import type { ChapterWorkup, ChapterMap } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

// The single place for location content. We don't have real map art yet, so this
// is presented as polished text cards (Option B) rather than placeholder map
// imagery that looks like missing content. No "coming later" cards.
export function MapsSection({ data }: { data: ChapterWorkup }) {
  const notes = [data.historicMap.note, data.modernMap.note].filter(Boolean) as string[];

  return (
    <section id="maps" className="scroll-mt-20">
      <SectionHead eyebrow="Where it happened" title="Maps & Places" />
      <div className="space-y-2.5">
        <PlaceCard title="Ancient World" map={data.historicMap} />
        <PlaceCard title="Modern Location" map={data.modernMap} />

        {notes.length > 0 && (
          <div className="rounded-md border bg-card p-4 shadow-hair">
            <p className="text-label text-secondary">Location Notes</p>
            <ul className="mt-2 space-y-1.5">
              {notes.map((n) => (
                <li key={n} className="text-[12px] leading-relaxed text-secondary">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function PlaceCard({ title, map }: { title: string; map: ChapterMap }) {
  return (
    <div className="rounded-md border bg-card p-4 shadow-hair">
      <p className="text-eyebrow">{title}</p>
      <p className="text-card-title mt-1 text-primary">{map.caption}</p>
    </div>
  );
}
