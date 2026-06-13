import type { ChapterWorkup } from "@/lib/types";
import { Chip } from "@/components/ui/primitives";

export function MetadataChips({ data }: { data: ChapterWorkup }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip>📅 {data.estimatedDate}</Chip>
      <Chip>📍 {data.estimatedLocation}</Chip>
      <Chip tone="accent">✦ {data.theme}</Chip>
      <Chip tone="jesus">✝ {data.jesusConnectionShort}</Chip>
    </div>
  );
}
