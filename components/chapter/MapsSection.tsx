import type { ChapterWorkup, ChapterMap } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

// The single place for location content. No maps are repeated elsewhere.
export function MapsSection({ data }: { data: ChapterWorkup }) {
  const notes = [data.historicMap.note, data.modernMap.note].filter(Boolean) as string[];

  return (
    <section id="maps" className="scroll-mt-20">
      <SectionHead eyebrow="Where it happened" title="Maps & Places" />
      <div className="space-y-2.5">
        <BigMap title="Ancient World" map={data.historicMap} />
        <BigMap title="Modern Location" map={data.modernMap} />

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

        <div className="flex items-center justify-between rounded-md border border-dashed bg-card-soft px-4 py-3">
          <span className="text-[13px] text-secondary">Standing there today</span>
          <span className="rounded-full bg-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-strong">
            Coming later
          </span>
        </div>
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
      </div>
    </div>
  );
}
