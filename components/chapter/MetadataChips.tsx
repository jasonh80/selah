import type { ChapterWorkup } from "@/lib/types";
import { confident } from "@/lib/voice";
import { getChipOverride, insightTypeOf } from "@/lib/content/chapter-content";
import { chapterYear } from "@/lib/chapter-year";
import { getChapterMap } from "@/lib/maps/chapter-maps";
import { getGeoChapterMap } from "@/lib/maps/geo-chapter-maps";

type ResolvedChip = { icon: string; text: string; jesus?: boolean };

/** Stored chips with per-slug overrides + voice applied — the ONE resolution
 * every consumer shares. Overrides key on the ORIGINAL stored index, so they
 * resolve BEFORE any filtering and removals can never shift targets. */
export function resolvedChips(data: ChapterWorkup): ResolvedChip[] {
  return data.metaChips
    .map((chip, originalIndex) => ({
      ...chip,
      text: getChipOverride(data.slug, originalIndex) ?? confident(chip.text),
    }))
    .map((chip) =>
      chip.jesus ? { ...chip, text: chip.text.replace(/^\s*Jesus:\s*/u, "") } : chip,
    );
}

/** The former red Jesus/theme chip's line — absorbed into the Jesus-at-the-
 * Center card (UI-cleanup brief, board #29 2026-07-21: one entry point per
 * idea; the standalone chip is gone). */
export function jesusChipLine(data: ChapterWorkup): string | undefined {
  return resolvedChips(data).find((chip) => chip.jesus)?.text;
}

/** The date + location facts — absorbed into the Where-It-Fits timeline as
 * its one clean context line (brief: the timeline owns date and ruler; the
 * stale "about N years ago" suffix is retired with the chip). */
export function timelineContextLine(data: ChapterWorkup): string | undefined {
  const chips = resolvedChips(data);
  const parts = [
    chips.find((chip) => chip.icon === "📅")?.text,
    chips.find((chip) => chip.icon === "📍")?.text,
  ].filter((text): text is string => Boolean(text && text.trim()));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** A chip is removed ONLY when the section that absorbs it actually renders
 * for this chapter (Codex #104 review, 2026-07-23: filtering by icon alone
 * silently deleted content on chapters whose destination is missing). Each
 * predicate mirrors the destination component's own render condition:
 *   📅 date     → The Big Story date bubble, drawn only when the chapter has a year
 *   📍 location → the map block, drawn only when a geo/illustrated map exists
 *   ✦ theme    → the Big Idea card
 *   red Jesus   → Jesus at the Center (as its lead line)
 * Anything without a live destination keeps its chip rather than vanishing. */
function absorbed(data: ChapterWorkup, chip: ResolvedChip): boolean {
  const types = new Set((data.insights ?? []).map((i) => insightTypeOf(i)));
  if (chip.jesus) return types.has("jesus_connection");
  if (chip.icon === "✦") return types.has("big_idea");
  if (chip.icon === "📅") return chapterYear(data) != null;
  if (chip.icon === "📍")
    return Boolean(getGeoChapterMap(data.slug) ?? getChapterMap(data.slug));
  return false;
}

// UI-cleanup brief (board #29, 2026-07-21): the date chip, the location chip,
// the ✦ theme chip, and the red Jesus chip are absorbed elsewhere — timeline,
// maps, Big Idea, and Jesus at the Center own those ideas now. On a typical
// chapter this renders nothing and no stranded chip row takes up space; on a
// legacy or incomplete chapter the un-absorbed chip survives here.
export function MetadataChips({ data }: { data: ChapterWorkup }) {
  const chips = resolvedChips(data).filter((chip) => !absorbed(data, chip));
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card-soft px-3 py-1.5 text-[12px] font-medium text-primary"
        >
          <span aria-hidden className="text-secondary">
            {chip.icon}
          </span>
          {chip.text}
        </span>
      ))}
    </div>
  );
}
