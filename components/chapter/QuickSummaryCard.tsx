import type { ChapterWorkup } from "@/lib/types";

export function QuickSummaryCard({ data }: { data: ChapterWorkup }) {
  return (
    <button className="flex w-full items-center gap-3.5 rounded-md border bg-card p-4 text-left shadow-hair transition active:scale-[0.99]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-xl">
        📜
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold text-primary">Quick Summary</p>
        <p className="mt-0.5 text-[13px] leading-snug text-secondary">{data.quickSummary}</p>
      </div>
      <span className="shrink-0 text-secondary">›</span>
    </button>
  );
}
