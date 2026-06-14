import type { ChapterWorkup } from "@/lib/types";
import { GoDeeperSection } from "@/components/chapter/GoDeeperSection";
import { CostDrawer } from "@/components/chapter/CostDrawer";

// Desktop-only companion. Scrolls with the page. Summary/preview cards only.
export function CompanionColumn({ data, source }: { data: ChapterWorkup; source?: string }) {
  return (
    <div className="space-y-4">
      <TodayCard data={data} />
      <MiniMaps data={data} />
      <GoDeeperSection data={data} />
      <CostDrawer source={source} />
    </div>
  );
}

function TodayCard({ data }: { data: ChapterWorkup }) {
  return (
    <div className="rounded-md border bg-card p-4 shadow-hair">
      <p className="text-eyebrow">Today</p>
      <p className="text-section mt-0.5 text-primary">{data.reference}</p>
      <p className="mt-0.5 text-[13px] text-secondary">{data.subtitle}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {data.metaChips.map((chip) => (
          <span
            key={chip.text}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              chip.jesus ? "bg-jesus-red-soft text-jesus-red" : "bg-tint text-primary"
            }`}
          >
            <span aria-hidden>{chip.icon}</span>
            {chip.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniMaps({ data }: { data: ChapterWorkup }) {
  const maps = [
    { title: "Modern Map", ...data.modernMap },
    { title: "Historic Map", ...data.historicMap },
  ];
  return (
    <div>
      <p className="text-eyebrow mb-2">Maps</p>
      <div className="grid grid-cols-2 gap-2.5">
        {maps.map((m) => (
          <div key={m.title} className="overflow-hidden rounded-md border bg-card shadow-hair">
            <div className="relative aspect-[4/3] w-full bg-card-soft">
              <img src={m.src} alt={m.alt} className="h-full w-full object-cover" />
            </div>
            <p className="px-2.5 py-2 text-[11px] text-secondary">{m.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
