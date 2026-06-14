import type { ChapterWorkup } from "@/lib/types";
import { getTimelineNote } from "@/lib/content/chapter-content";

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

function parseYear(raw?: string): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const isBC = /\bb\.?c\.?(e)?\b/.test(s);
  const cent = s.match(/(\d+)(?:st|nd|rd|th)\s+century/);
  if (cent) {
    const mid = (parseInt(cent[1], 10) - 1) * 100 + 50;
    return isBC ? -mid : mid;
  }
  const nums = s.match(/\d{1,4}/g);
  if (!nums) return null;
  const avg = Math.round(nums.map(Number).reduce((a, b) => a + b, 0) / nums.length);
  return isBC ? -avg : avg;
}

const fmtYear = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

export function TimelineSection({ data }: { data: ChapterWorkup }) {
  const bt = data.biblicalTimeline;
  const range = bt?.dateRange;
  const year =
    bt?.estimatedYear ??
    (range ? Math.round((range.startYear + range.endYear) / 2) : null) ??
    parseYear(data.estimatedDate);
  const pinPos = year != null ? pinPosForYear(year) : null;
  const note = getTimelineNote(data.slug) ?? bt?.uncertaintyNote;
  const rangeText = range
    ? `${fmtYear(range.startYear)} – ${fmtYear(range.endYear)}`
    : bt?.estimatedYearLabel ?? data.estimatedDate ?? "";

  return (
    <section id="timeline" className="scroll-mt-20 rounded-md border bg-card p-4 shadow-hair">
      <h2 className="text-section text-primary">Where It Fits</h2>

      <div className="no-scrollbar -mx-1 mt-3 overflow-x-auto px-1">
        <div className="relative h-[78px] min-w-[360px]">
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

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        {rangeText && <span className="text-[12px] font-semibold text-primary">{rangeText}</span>}
        {note && <span className="text-[11px] leading-relaxed text-secondary">{note}</span>}
      </div>
    </section>
  );
}
