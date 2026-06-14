import type { ChapterWorkup } from "@/lib/types";

// One Big Story timeline: Creation → Today. Markers AND the chapter pin are all
// placed by ESTIMATED YEAR on a single linear time scale (not evenly spaced and
// never hand-nudged). Creation/Ark use traditional/debated anchor years purely
// for visual scale.
type Marker = { key: string; label: string; year: number; cross?: boolean };

const TODAY_YEAR = 2026;
const SCALE_START = -4000; // configured traditional/debated start (Creation) — visual scale only
const SCALE_END = TODAY_YEAR;

const MARKERS: Marker[] = [
  { key: "creation", label: "Creation", year: -4000 },
  { key: "ark", label: "Ark", year: -2500 },
  { key: "commandments", label: "10 Commandments", year: -1446 },
  { key: "temple", label: "1st Temple", year: -960 },
  { key: "jesus", label: "Jesus", year: 30, cross: true },
  { key: "today", label: "Today", year: TODAY_YEAR },
];

// Linear time → horizontal position, padded to 6%–94% so edge labels don't clip.
function posForYear(year: number): number {
  const f = (year - SCALE_START) / (SCALE_END - SCALE_START);
  return 6 + Math.max(0, Math.min(1, f)) * 88;
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
  const range = bt?.dateRange;

  // Pin year: explicit estimate → midpoint of a date range → parsed estimate.
  const year =
    bt?.estimatedYear ??
    (range ? Math.round((range.startYear + range.endYear) / 2) : null) ??
    parseYear(data.estimatedDate);

  const pinPos = year != null ? posForYear(year) : null;
  // Honest uncertainty band: the chapter's full estimated range, by date math.
  const bandStart = range ? posForYear(Math.min(range.startYear, range.endYear)) : null;
  const bandEnd = range ? posForYear(Math.max(range.startYear, range.endYear)) : null;

  const dateLabel = bt?.estimatedYearLabel ?? data.estimatedDate ?? "uncertain";
  const note = bt?.uncertaintyNote;

  return (
    <section id="timeline" className="scroll-mt-20 rounded-md border bg-card p-4 shadow-hair">
      <p className="text-eyebrow">Where it fits</p>
      <h2 className="text-section mt-0.5 text-primary">Timeline</h2>

      <div className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4">
        <div className="relative h-[96px] min-w-[600px]">
          <div className="absolute inset-x-0 top-[46px] h-0.5 bg-line" />

          {/* Chapter estimated-range band (date math, not hand-placed) */}
          {bandStart != null && bandEnd != null && bandEnd - bandStart > 0.4 && (
            <div
              className="absolute top-[42px] h-2 rounded-full bg-accent/25"
              style={{ left: `${bandStart}%`, width: `${bandEnd - bandStart}%` }}
            />
          )}

          {MARKERS.map((m, i) => {
            const lowered = i % 2 === 1;
            return (
              <div
                key={m.key}
                className="absolute top-[40px] flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${posForYear(m.year)}%` }}
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

          {/* Moving chapter pin — placed by its estimated year */}
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
        <p className="mt-1 text-[11px] leading-relaxed text-secondary">
          Placed by estimated date; Creation and Ark use traditional biblical chronology.
        </p>
      </div>
    </section>
  );
}
