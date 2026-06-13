import type { ChapterWorkup, DeeperGroup } from "@/lib/types";
import { SectionTitle } from "@/components/ui/primitives";

const GROUPS: { id: DeeperGroup; title: string; sub: string }[] = [
  { id: "learn-more", title: "Learn more", sub: "Understand the background" },
  { id: "dive-deeper", title: "Dive deeper", sub: "Trace it through Scripture" },
  { id: "grow-closer", title: "Grow closer to Jesus", sub: "Carry it into your day" },
];

export function DeeperStudy({ data }: { data: ChapterWorkup }) {
  return (
    <section className="space-y-4">
      <SectionTitle eyebrow="Keep going" title="Learn more · Dive deeper · Grow closer" />
      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.id} className="rounded-card border bg-tint/50 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-accent-strong">
              {g.title}
            </p>
            <p className="mt-0.5 text-xs text-secondary">{g.sub}</p>
            <ul className="mt-3 space-y-2">
              {data.deeper
                .filter((d) => d.group === g.id)
                .map((d) => (
                  <li key={d.title}>
                    <button className="group w-full rounded-xl border bg-card p-3 text-left shadow-soft transition hover:border-accent/40">
                      <p className="text-sm font-medium text-primary group-hover:text-accent-strong">
                        {d.title}
                      </p>
                      <p className="mt-0.5 text-xs text-secondary">{d.blurb}</p>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
