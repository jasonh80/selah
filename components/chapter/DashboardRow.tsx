import type { ChapterWorkup } from "@/lib/types";

export function DashboardRow({ data }: { data: ChapterWorkup }) {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      <TimelineCard data={data} />
      <MapCard caption={data.modernMap.caption} src={data.modernMap.src} alt={data.modernMap.alt} title="Modern Map" />
      <MapCard caption={data.historicMap.caption} src={data.historicMap.src} alt={data.historicMap.alt} title="Historic Map" />
    </div>
  );
}

function TimelineCard({ data }: { data: ChapterWorkup }) {
  const { labels, activeIndex } = data.timelineMini;
  return (
    <div className="col-span-2 rounded-md border bg-card p-4 shadow-hair">
      <p className="text-sm font-semibold text-primary">Timeline</p>
      <div className="relative mt-5 flex items-center justify-between">
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
    <button className="col-span-1 overflow-hidden rounded-md border bg-card text-left shadow-hair transition active:scale-[0.98]">
      <div className="relative aspect-[4/3] w-full bg-card-soft">
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <span className="absolute left-1.5 top-1.5 rounded-full bg-[rgba(16,16,20,0.55)] px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {title}
        </span>
      </div>
      <p className="px-2.5 py-2 text-[10px] text-secondary">{caption}</p>
    </button>
  );
}
