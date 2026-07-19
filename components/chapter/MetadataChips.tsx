import type { ChapterWorkup } from "@/lib/types";
import { confident } from "@/lib/voice";
import { getChipOverride } from "@/lib/content/chapter-content";
import { yearsAgoLabel } from "@/lib/chapter-year";

export function MetadataChips({ data }: { data: ChapterWorkup }) {
  // Owner decision 2026-07-19: the date chip also says how long ago —
  // "· about 1,996 years ago" — derived from the workup's estimated year and
  // recomputed each render, so it stays correct every calendar year.
  const yearsAgo = yearsAgoLabel(data);
  // Owner decision 2026-07-19, applied to PUBLISHED chapters at render time
  // (content-based, never positional): the ✦ theme chip is dropped, and a
  // stored "Jesus:" prefix is stripped — the sentence names Him itself.
  const chips = data.metaChips
    .map((chip, originalIndex) => ({
      ...chip,
      // Per-slug overrides key on the ORIGINAL stored index — resolve them
      // BEFORE filtering so removals can never shift which chip they hit.
      text: getChipOverride(data.slug, originalIndex) ?? confident(chip.text),
    }))
    .filter((chip) => chip.icon !== "✦")
    .map((chip) =>
      chip.jesus ? { ...chip, text: chip.text.replace(/^\s*Jesus:\s*/u, "") } : chip,
    )
    .map((chip) =>
      chip.icon === "📅" && yearsAgo ? { ...chip, text: `${chip.text} · ${yearsAgo}` } : chip,
    );
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, i) => (
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
          {chip.text}
        </span>
      ))}
    </div>
  );
}
