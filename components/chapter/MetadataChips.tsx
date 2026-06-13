import type { ChapterWorkup } from "@/lib/types";

export function MetadataChips({ data }: { data: ChapterWorkup }) {
  return (
    <div className="flex flex-wrap gap-2">
      {data.metaChips.map((chip) => (
        <span
          key={chip.text}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
            chip.jesus
              ? "border-[rgba(178,58,58,0.2)] bg-jesus-red-soft text-jesus-red"
              : "bg-card-soft text-primary"
          }`}
        >
          <span aria-hidden className={chip.jesus ? "" : "text-secondary"}>
            {chip.icon}
          </span>
          {chip.text}
        </span>
      ))}
    </div>
  );
}
