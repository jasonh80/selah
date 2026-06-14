import type { ChapterWorkup } from "@/lib/types";

// Static summary card — the summary is shown in full, so there's nothing to
// open. No button/chevron affordance.
export function QuickSummaryCard({ data }: { data: ChapterWorkup }) {
  return (
    <div className="flex w-full items-center gap-3.5 rounded-md border bg-card p-4 text-left shadow-hair">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-xl">
        📜
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold tracking-[-0.01em] text-primary">Quick Summary</p>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">{data.quickSummary}</p>
      </div>
    </div>
  );
}
