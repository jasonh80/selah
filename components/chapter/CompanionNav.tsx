import type { ChapterWorkup } from "@/lib/types";
import { RailHeader } from "@/components/chapter/RailHeader";

// Desktop companion rail. Hidden on mobile (where the dashboard already
// carries maps + nav inline). Gives the larger canvas a purpose.
export function CompanionNav({ data }: { data: ChapterWorkup }) {
  return (
    <div className="hidden space-y-5 lg:block">
      {/* Chapter navigation */}
      <section className="space-y-3">
        <RailHeader icon="❒" title="Chapters" />
        <div className="overflow-hidden rounded-md border bg-card shadow-hair">
          <NavRow label="Exodus 26" sub="The Tabernacle" muted />
          <NavRow label="Exodus 27" sub="Today" active />
          <NavRow label="Exodus 28" sub="The Priestly Garments" muted />
        </div>
      </section>

      {/* Enlarged maps with honest notes */}
      <section className="space-y-3">
        <RailHeader icon="🗺" title="Maps" />
        <BigMap title="Modern Map" caption={data.modernMap.caption} note={data.modernMap.note} src={data.modernMap.src} alt={data.modernMap.alt} />
        <BigMap title="Historic Map" caption={data.historicMap.caption} note={data.historicMap.note} src={data.historicMap.src} alt={data.historicMap.alt} />
      </section>
    </div>
  );
}

function NavRow({
  label,
  sub,
  active = false,
  muted = false,
}: {
  label: string;
  sub: string;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-b-0 transition ${
        active ? "bg-tint" : "hover:bg-card-soft"
      }`}
    >
      <span>
        <span className={`block text-card-title ${active ? "text-accent-strong" : "text-primary"}`}>
          {label}
        </span>
        <span className="text-[12px] text-secondary">{sub}</span>
      </span>
      {muted && <span className="text-secondary">›</span>}
      {active && <span className="text-accent-strong">●</span>}
    </button>
  );
}

function BigMap({
  title,
  caption,
  note,
  src,
  alt,
}: {
  title: string;
  caption: string;
  note?: string;
  src: string;
  alt: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-card shadow-hair">
      <div className="relative aspect-[16/10] w-full bg-card-soft">
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-[rgba(16,16,20,0.55)] px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {title}
        </span>
      </div>
      <div className="p-3">
        <p className="text-card-title text-primary">{caption}</p>
        {note && <p className="mt-1 text-[12px] leading-relaxed text-secondary">{note}</p>}
      </div>
    </div>
  );
}
