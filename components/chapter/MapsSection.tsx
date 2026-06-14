import type { ChapterWorkup } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

// Single Maps & Places section. Two image-based panels (real cartography):
//   Ancient World  — public-domain biblical atlas plate (Shepherd, 1911)
//   Modern Region  — OpenStreetMap static render of the Bethlehem/Jerusalem area
// Both are stored local assets in /public/img/maps with proper attribution.
// Selah styling (frame, overlay label, pins, vignette, caption) sits on top.
// Side by side on desktop, stacked on mobile.

type Pin = { x: number; y: number; label: string };

export function MapsSection({ data }: { data: ChapterWorkup }) {
  return (
    <section id="maps" className="scroll-mt-20">
      <SectionHead eyebrow="Where it happened" title="Maps & Places" />
      <div className="space-y-2.5">
        <div className="grid gap-2.5 md:grid-cols-2">
          <MapPanel
            title="Ancient World"
            src="/img/maps/ancient-judah.jpg"
            objectPosition="50% 84%"
            caption={data.historicMap.caption}
            attribution="Public domain · Shepherd Historical Atlas, 1911"
          />
          <MapPanel
            title="Modern Region"
            src="/img/maps/modern-judah.png"
            srcSet="/img/maps/modern-judah.png 1x, /img/maps/modern-judah@2x.png 2x"
            objectPosition="50% 50%"
            caption={data.modernMap.caption}
            attribution="© OpenStreetMap contributors"
            pins={[
              { x: 52, y: 34, label: "Jerusalem" },
              { x: 48, y: 64, label: "Bethlehem" },
            ]}
          />
        </div>

        <div className="rounded-md border bg-card p-4 shadow-hair">
          <p className="text-label text-secondary">Location Notes</p>
          <ul className="mt-2 space-y-1.5">
            <li className="text-[12px] leading-relaxed text-secondary">
              Psalm 23 does not name a single event location. This map shows the representative world of
              David’s shepherding life in Judah, especially the Bethlehem hill country.
            </li>
            {[data.historicMap.note, data.modernMap.note]
              .filter(Boolean)
              .map((n) => (
                <li key={n as string} className="text-[12px] leading-relaxed text-secondary">
                  {n}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function MapPanel({
  title,
  src,
  srcSet,
  objectPosition,
  caption,
  attribution,
  pins = [],
}: {
  title: string;
  src: string;
  srcSet?: string;
  objectPosition: string;
  caption: string;
  attribution: string;
  pins?: Pin[];
}) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border bg-card"
      style={{ boxShadow: "0 0 0 1px var(--line), 0 12px 34px -18px var(--accent)" }}
    >
      <div className="relative aspect-[17/11] w-full overflow-hidden bg-card-soft">
        <img
          src={src}
          srcSet={srcSet}
          alt={`${title} map of the Judah / Bethlehem region`}
          className="h-full w-full object-cover"
          style={{ objectPosition }}
          loading="lazy"
        />

        {/* soft vignette + bottom gradient for legibility */}
        <span
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 56px 8px rgba(0,0,0,0.26)" }}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

        {/* pins */}
        {pins.map((p) => (
          <span
            key={p.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="relative flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white ring-2 ring-[var(--accent-strong)] shadow" />
              <span className="whitespace-nowrap rounded-full bg-[rgba(16,16,20,0.62)] px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {p.label}
              </span>
            </span>
          </span>
        ))}

        {/* overlay title */}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(16,16,20,0.62)] px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {title}
        </span>

        {/* attribution */}
        <span className="absolute bottom-1.5 right-2 rounded bg-[rgba(16,16,20,0.5)] px-1.5 py-0.5 text-[9px] leading-none text-white/85 backdrop-blur-sm">
          {attribution}
        </span>
      </div>

      <div className="flex-1 p-3.5">
        <p className="text-[12px] leading-relaxed text-secondary">{caption}</p>
      </div>
    </div>
  );
}
