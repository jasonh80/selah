import type { ChapterWorkup, NavCard } from "@/lib/types";

export function VisualDashboardGrid({ data }: { data: ChapterWorkup }) {
  const obj = data.navCards.find((c) => c.id === "key-object")!;
  const person = data.navCards.find((c) => c.id === "key-person")!;
  const jesus = data.navCards.find((c) => c.id === "jesus")!;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <TimelineCard data={data} />
      <MapCard title="Modern Map" caption={data.modernMap.caption} src={data.modernMap.src} alt={data.modernMap.alt} />
      <MapCard title="Historic Map" caption={data.historicMap.caption} src={data.historicMap.src} alt={data.historicMap.alt} />
      <ThumbCard card={obj} />
      <ThumbCard card={person} />
      <JesusCard card={jesus} />
    </div>
  );
}

function CardShell({
  children,
  span = 1,
  jesus = false,
}: {
  children: React.ReactNode;
  span?: 1 | 2;
  jesus?: boolean;
}) {
  return (
    <button
      className={`overflow-hidden rounded-md border bg-card text-left shadow-hair transition active:scale-[0.98] ${
        span === 2 ? "col-span-2" : "col-span-1"
      } ${jesus ? "ring-1 ring-[rgba(178,58,58,0.18)]" : ""}`}
    >
      {children}
    </button>
  );
}

function TimelineCard({ data }: { data: ChapterWorkup }) {
  const { labels, activeIndex } = data.timelineMini;
  return (
    <CardShell span={2}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-label text-secondary">Timeline</p>
          <span className="text-secondary">›</span>
        </div>
        <div className="relative mt-4 flex items-center justify-between">
          <span className="absolute left-1 right-1 top-1.5 h-0.5 bg-line" />
          {labels.map((label, i) => (
            <span
              key={label}
              className={`relative z-10 h-3 w-3 rounded-full ${
                i <= activeIndex ? "bg-accent-strong" : "border-2 border-line bg-card"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          {labels.map((label, i) => (
            <span
              key={label}
              className={`w-[24%] text-center text-[10px] ${
                i === activeIndex ? "font-semibold text-accent-strong" : "text-secondary"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

function MapCard({
  title,
  caption,
  src,
  alt,
}: {
  title: string;
  caption: string;
  src: string;
  alt: string;
}) {
  return (
    <CardShell>
      <div className="relative aspect-[5/3] w-full bg-card-soft">
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-[rgba(16,16,20,0.55)] px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {title}
        </span>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-[11px] text-secondary">{caption}</p>
        <span className="text-xs text-secondary">›</span>
      </div>
    </CardShell>
  );
}

function ThumbCard({ card }: { card: NavCard }) {
  return (
    <CardShell>
      <div className="flex items-center gap-3 p-3">
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-card-soft">
          <img src={card.thumb} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-card-title text-primary">{card.label}</span>
          <span className="block truncate text-[11px] text-secondary">{card.support}</span>
        </span>
        <span className="text-secondary">›</span>
      </div>
    </CardShell>
  );
}

function JesusCard({ card }: { card: NavCard }) {
  return (
    <CardShell span={2} jesus>
      <div className="flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jesus-red-soft text-jesus-red">
          ✝
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-card-title text-jesus-red">{card.label}</span>
          <span className="block text-[12px] text-primary">{card.support}</span>
        </span>
        <span className="text-jesus-red/70">›</span>
      </div>
    </CardShell>
  );
}
