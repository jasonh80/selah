import type { ChapterWorkup, DeeperGroup } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

export function GoDeeperSection({ data }: { data: ChapterWorkup }) {
  return (
    <section>
      <SectionHead eyebrow="Keep Going" title="Go Deeper" />
      <div className="space-y-2.5">
        {data.deeperGroups.map((group) => (
          <GroupCard key={group.label} group={group} />
        ))}
      </div>
    </section>
  );
}

function GroupCard({ group }: { group: DeeperGroup }) {
  return (
    <div className="overflow-hidden rounded-md border bg-card shadow-hair">
      <p className="text-label border-b px-4 py-2.5 text-accent-strong">{group.label}</p>
      {group.rows.map((row) => (
        <button
          key={row.title}
          className="flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 transition hover:bg-card-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-card-title text-primary">{row.title}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-secondary">{row.desc}</span>
          </span>
          <span className="shrink-0 text-secondary">›</span>
        </button>
      ))}
    </div>
  );
}
