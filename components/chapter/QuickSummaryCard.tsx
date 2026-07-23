import type { ChapterWorkup } from "@/lib/types";
import { SectionCard } from "@/components/chapter/SectionCard";

export function QuickSummaryCard({ data }: { data: ChapterWorkup }) {
  return (
    <SectionCard icon="📝" title="Quick Summary">
      <p className="text-[13px] leading-relaxed text-secondary">{data.quickSummary}</p>
    </SectionCard>
  );
}
