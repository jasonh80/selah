import type { ChapterWorkup } from "@/lib/types";
import { getChapterMap } from "@/lib/maps/chapter-maps";
import { getGeoChapterMap } from "@/lib/maps/geo-chapter-maps";

// Compact top previews (layout spec §13; owner trim 2026-07-19: the
// Where-It-Fits one-liner is gone — the large timeline below carries it):
// People · Maps & Places as one-line cards. Only previews with real content
// render, and the People value clamps to one line.
export function CompactPreviewRow({ data }: { data: ChapterWorkup }) {
  const previews: { icon: string; label: string; value: string; href?: string }[] = [];

  const people = data.characters?.length
    ? data.characters
    : (data.primaryCharacters ?? []).map((name) => ({ name }));
  if (people.length > 0) {
    // Production-QA fix (2026-07-19): no #people section exists since the
    // dashboard grid / Key Person card were retired, so this is an INFO card,
    // not a link — a dead anchor scrolled nowhere on every chapter.
    previews.push({
      icon: "👥",
      label: `People in ${data.reference}`,
      value: people
        .slice(0, 3)
        .map((person) => person.name)
        .join(" · ") + (people.length > 3 ? " · …" : ""),
    });
  }

  // The Maps preview exists ONLY when a maps section itself will render —
  // EITHER map engine (production-QA fix: geo chapters like Mark 7–10 lost
  // their chip because only the static config was checked) — never a dead
  // #maps link.
  if (getChapterMap(data.slug) || getGeoChapterMap(data.slug)) {
    previews.push({
      icon: "🗺",
      label: "Maps & Places",
      value: data.modernMap?.caption ?? "See where this chapter happens",
      href: "#maps",
    });
  }

  if (previews.length === 0) return null;

  // Owner fix (2026-07-20, live Mark 6 review): these previews were rendering
  // as FULL-WIDTH bars ("chips are too wide. their size should be
  // restricted") — they are chips, so they size to their content with a hard
  // cap and truncate, wrapping side by side wherever they fit.
  const cardClass =
    "inline-flex min-w-0 max-w-[260px] flex-col gap-1 rounded-md border bg-card px-s3 py-2 shadow-hair transition";

  return (
    <div className="flex flex-wrap gap-s2">
      {previews.map((preview) =>
        preview.href ? (
          <a key={preview.label} href={preview.href} className={`${cardClass} hover:border-accent/40`}>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-eyebrow">
              <span aria-hidden>{preview.icon}</span>
              {preview.label}
            </span>
            <span className="truncate text-[12px] leading-snug text-secondary">{preview.value}</span>
          </a>
        ) : (
          <div key={preview.label} className={cardClass}>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-eyebrow">
              <span aria-hidden>{preview.icon}</span>
              {preview.label}
            </span>
            <span className="truncate text-[12px] leading-snug text-secondary">{preview.value}</span>
          </div>
        ),
      )}
    </div>
  );
}
