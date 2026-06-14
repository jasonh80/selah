import type { ChapterWorkup } from "@/lib/types";

// One Big Story timeline: Creation → Today, with a fixed set of milestone
// markers. Only the chapter PIN moves — it floats to its year, interpolated
// between the two surrounding markers (so e.g. David-era Psalm 23 lands between
// the 10 Commandments and the 1st Temple).
type Marker = { key: string; label: string; year: number; cross?: boolean };

// Fixed markers (negative = BC). Years are representative anchors used only to
// place the moving pin; the labels themselves never change between chapters.
const MARKERS: Marker[] = [
  { key: "creation", label: "Creation", year: -4000 },
  { key: "ark", label: "Ark", year: -2500 },
  { key: "commandments", label: "10 Commandments", year: -1446 },
  { key: "temple", label: "1st Temple", year: -957 },
  { key: "jesus", label: "Jesus", year: 30, cross: true },
  { key: "today", label: "Today", year: 2025 },
];

// Evenly space the markers across 6%–94% of the line.
function posForIndex(i: number): number {
  return 6 + (i / (MARKERS.length - 1)) * 88;
}

// Continuous position for a year, interpolated between the surrounding markers.
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

export function TimelineSection({ data }: { data: ChapterWorkup }) {
  const bt = data.biblicalTimeline;

  // Pin year: explicit estimate → midpoint of a date range → parsed estimate.
  const year =
    bt?.estimatedYear ??
    (bt?.dateRange ? Math.round((bt.dateRange.startYear + bt.dateRange.endYear) / 2) : null) ??
    parseYear(data.estimatedDate);

  const pinPos = year != null ? pinPosForYear(year) : null;

  const range = bt?.dateRange;
  const dateLabel = bt?.estimatedYearLabel ?? data.estimatedDate ?? "uncertain";
  const note = bt?.uncertaintyNote;

  return (
    <section id="timeline" className="scroll-mt-20 rounded-md border bg-card p-4 shadow-hair">
      <p className="text-eyebrow">Where it fits</p>
      <h2 className="text-section mt-0.5 text-primary">Timeline</h2>

      <div className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4">
        <div className="relative h-[96px] min-w-[560px]">
          <div className="absolute inset-x-0 top-[46px] h-0.5 bg-line" />

          {MARKERS.map((m, i) => {
            const lowered = i % 2 === 1;
            return (
              <div
                key={m.key}
                className="absolute top-[40px] flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${posForIndex(i)}%` }}
              >
                {m.cross ? (
                  <span className="text-[15px] leading-none text-jesus-red">✝</span>
                ) : (
                  <span className="h-3 w-3 rounded-full border-2 border-line bg-card" />
                )}
                {lowered && <span className="mt-0.5 h-3 w-px bg-line" />}
                <span
                  className={`whitespace-nowrap text-[10px] font-medium leading-tight text-secondary ${
                    lowered ? "mt-0.5" : "mt-1.5"
                  }`}
                >
                  {m.label}
                </span>
              </div>
            );
          })}

          {/* Moving chapter pin — the only thing that changes per chapter */}
          {pinPos != null && (
            <div
              className="absolute top-[2px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pinPos}%` }}
            >
              <span className="whitespace-nowrap rounded-full bg-accent-strong px-2 py-0.5 text-[10px] font-semibold text-white shadow-hair">
                {data.reference}
              </span>
              <span className="h-[18px] w-px bg-accent-strong" />
              <span className="-mt-px h-3 w-3 rounded-full bg-accent-strong ring-4 ring-accent/20" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-sm bg-tint px-3 py-2.5">
        <p className="text-[12px] text-secondary">
          {range
            ? `Estimated date range: ${range.startYear < 0 ? `${-range.startYear} BC` : `AD ${range.startYear}`} – ${range.endYear < 0 ? `${-range.endYear} BC` : `AD ${range.endYear}`}`
            : `Estimated date: ${dateLabel}`}
        </p>
        {note && <p className="mt-1 text-[11px] leading-relaxed text-secondary">{note}</p>}
      </div>
    </section>
  );
}
