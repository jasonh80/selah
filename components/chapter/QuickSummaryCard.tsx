import type { ChapterWorkup } from "@/lib/types";

// Clean, text-forward summary card — no icon. Matches the other content cards.
export function QuickSummaryCard({ data }: { data: ChapterWorkup }) {
  return (
    <div className="rounded-md border bg-card p-3.5 shadow-hair">
      <p className="text-eyebrow">Quick Summary</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{data.quickSummary}</p>
    </div>
  );
}
