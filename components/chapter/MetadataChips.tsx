import type { ChapterWorkup } from "@/lib/types";
import { confident } from "@/lib/voice";
import { getChipOverride } from "@/lib/content/chapter-content";

export function MetadataChips({ data }: { data: ChapterWorkup }) {
  return (
    <div className="flex flex-wrap gap-2">
      {data.metaChips.map((chip, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
            chip.jesus
              ? "border-[rgba(178,58,58,0.2)] bg-jesus-red-soft text-jesus-red"
              : "bg-card-soft text-primary"
          }`}
        >
          <span aria-hidden className={chip.jesus ? "" : "text-secondary"}>
            {chip.icon}
          </span>
          {getChipOverride(data.slug, i) ?? confident(chip.text)}
        </span>
      ))}
    </div>
  );
}
