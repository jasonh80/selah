import type { ChapterWorkup } from "@/lib/types";
import { RailHeader } from "@/components/chapter/RailHeader";

export function GoDeeperSection({ data }: { data: ChapterWorkup }) {
  return (
    <section className="space-y-3">
      <RailHeader icon="➤" title="Keep Going" action="Go Deeper" />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {data.deeperPills.map((pill) => (
          <button
            key={pill.label}
            className="flex shrink-0 items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-sm font-medium text-primary shadow-hair transition active:scale-95"
          >
            <span aria-hidden>{pill.icon}</span>
            {pill.label}
          </button>
        ))}
      </div>
    </section>
  );
}
