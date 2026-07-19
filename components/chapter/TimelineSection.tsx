import type { ChapterWorkup } from "@/lib/types";
import { getTimelineNote } from "@/lib/content/chapter-content";
import { chapterYear } from "@/lib/chapter-year";

// "Where It Fits" — the Big Story rail. Markers are evenly spaced for a clean,
// compact, mobile-friendly rail (no huge empty gaps); the chapter PIN is placed
// by date math, interpolated between the two markers its estimated year falls
// between. Only the pin moves per chapter.
type Marker = { key: string; label: string; year: number; cross?: boolean };

const MARKERS: Marker[] = [
  { key: "creation", label: "Creation", year: -4000 },
  { key: "ark", label: "Ark", year: -2500 },
  { key: "commandments", label: "10 Commandments", year: -1446 },
  { key: "temple", label: "1st Temple", year: -960 },
  { key: "jesus", label: "Jesus", year: 30, cross: true },
  { key: "today", label: "Today", year: 2026 },
];

function posForIndex(i: number): number {
  return 8 + (i / (MARKERS.length - 1)) * 84;
}

// Pin position by estimated year, interpolated between surrounding markers.
function pinPosForYear(year: number): number {
  if (year <= MARKERS[0].year) return posForIndex(0);
  for (let i = 0; i < MARKERS.length - 1; i++) {
    const a = MARKERS[i];
    const b = MARKERS[i + 1];
    if (year >= a.year && year <= b.year) {
      const f = (year - a.year) / (b.year - a.year);
      return posForIndex(i) + f * (posForIndex(i + 1) - posForIndex(i));
    }
  }
  return posForIndex(MARKERS.length - 1);
}

const fmtYear = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

export function TimelineSection({ data }: { data: ChapterWorkup }) {
  const bt = data.biblicalTimeline;
  const range = bt?.dateRange;
  const year = chapterYear(data);
  const pinPos = year != null ? pinPosForYear(year) : null;
  const rangeText = range
    ? `${fmtYear(range.startYear)} – ${fmtYear(range.endYear)}`
    : data.estimatedDate ?? bt?.estimatedYearLabel ?? "";
  // Primary copy is concise + CONFIDENT: a curated line when we have one, else the
  // date range. The generated uncertaintyNote is NEVER shown here — dating nuance
  // lives only in the Transparency drawer.
  const headline = getTimelineNote(data.slug) ?? rangeText;

  return (
    <section id="timeline" className="scroll-mt-20 rounded-md border bg-card p-3.5 shadow-hair">
      <h2 className="text-section text-primary">Where It Fits</h2>

      {/* Owner decision A3 (2026-07-16): no horizontal swipe anywhere — the
          rail fits the container on every phone width. */}
      <div className="mt-3">
        <div className="relative h-[78px]">
          <div className="absolute inset-x-0 top-[40px] h-0.5 bg-line" />

          {MARKERS.map((m, i) => (
            <div
              key={m.key}
              className="absolute top-[34px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${posForIndex(i)}%` }}
            >
              {m.cross ? (
                <span className="text-[13px] leading-none text-jesus-red">✝</span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full border-2 border-line bg-card" />
              )}
              <span className="mt-1.5 max-w-[60px] whitespace-normal text-center text-[9px] font-medium leading-tight text-secondary">
                {m.label}
              </span>
            </div>
          ))}

          {pinPos != null && (
            <div
              className="absolute top-[2px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pinPos}%` }}
            >
              <span className="whitespace-nowrap rounded-full bg-accent-strong px-2 py-0.5 text-[9px] font-semibold text-white shadow-hair">
                {data.reference}
              </span>
              <span className="h-[14px] w-px bg-accent-strong" />
              <span className="-mt-px h-2.5 w-2.5 rounded-full bg-accent-strong ring-4 ring-accent/20" />
            </div>
          )}
        </div>
      </div>

      {headline && (
        <div className="mt-1.5">
          <span className="text-[12px] font-semibold text-primary">{headline}</span>
        </div>
      )}
    </section>
  );
}
