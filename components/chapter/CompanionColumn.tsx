import type { ChapterWorkup } from "@/lib/types";
import { CostDrawer } from "@/components/chapter/CostDrawer";

// Desktop-only companion. Scrolls with the page. Summary card + transparency
// only — maps and Go Deeper live once in the main column (no duplicates).
export function CompanionColumn({ data, source }: { data: ChapterWorkup; source?: string }) {
  return (
    <div className="space-y-4">
      <TodayCard data={data} />
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

