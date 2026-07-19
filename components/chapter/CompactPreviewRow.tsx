import type { ChapterWorkup } from "@/lib/types";
import { getChapterMap } from "@/lib/maps/chapter-maps";

// Compact top previews (layout spec §13; owner trim 2026-07-19: the
// Where-It-Fits one-liner is gone — the large timeline below carries it):
// People · Maps & Places as one-line cards. Only previews with real content
// render, and the People value clamps to one line.
export function CompactPreviewRow({ data }: { data: ChapterWorkup }) {
  const previews: { icon: string; label: string; value: string; href: string }[] = [];

  const people = data.characters?.length
    ? data.characters
    : (data.primaryCharacters ?? []).map((name) => ({ name }));
  if (people.length > 0) {
    previews.push({
      icon: "👥",
      label: `People in ${data.reference}`,
      value: people
        .slice(0, 3)
        .map((person) => person.name)
        .join(" · ") + (people.length > 3 ? " · …" : ""),
      href: "#people",
    });
  }

  // The Maps preview exists ONLY when MapsSection itself will render (same
  // condition: a real per-slug map config) — never a dead #maps link.
  if (getChapterMap(data.slug)) {
    previews.push({
      icon: "🗺",
      label: "Maps & Places",
      value: data.modernMap?.caption ?? "See where this chapter happens",
      href: "#maps",
    });
  }

  if (previews.length === 0) return null;

  // No swipe strips anywhere (owner direction): stacked on mobile, a row on
  // small screens and up.
  return (
    <div className="grid gap-s2 sm:grid-cols-3">
      {previews.map((preview) => (
        <a
          key={preview.label}
          href={preview.href}
          className="flex flex-col gap-1 rounded-md border bg-card p-s3 shadow-hair transition hover:border-accent/40"
        >
          <span className="flex items-center gap-1.5 text-eyebrow">
            <span aria-hidden>{preview.icon}</span>
            {preview.label}
          </span>
          <span className="truncate text-[12px] leading-snug text-secondary">{preview.value}</span>
        </a>
      ))}
    </div>
  );
}
