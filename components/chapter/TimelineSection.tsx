import type { ChapterWorkup } from "@/lib/types";

// One timeline: where this chapter fits in the full biblical story.
// Eras are evenly spaced along a line; the chapter is pinned at its era.
type Era = {
  key: string;
  label: string;
  dateLabel: string;
  lo: number; // year range used to place a chapter (negative = BC)
  hi: number;
  match: RegExp;
  cross?: boolean;
};

const ERAS: Era[] = [
  { key: "creation", label: "Creation", dateLabel: "date debated", lo: -6000, hi: -3000, match: /creation|adam|eden|garden/ },
  { key: "patriarchs", label: "Patriarchs", dateLabel: "c. 2000 BC", lo: -2200, hi: -1500, match: /patriarch|abraham|isaac|jacob|joseph/ },
  { key: "exodus", label: "Exodus", dateLabel: "c. 1446 BC", lo: -1500, hi: -1100, match: /exodus|wilderness|sinai|moses|tabernacle|commandment|law/ },
  { key: "kingdom", label: "David / Kingdom", dateLabel: "c. 1000 BC", lo: -1100, hi: -586, match: /david|kingdom|monarchy|solomon|psalm|temple/ },
  { key: "exile", label: "Exile", dateLabel: "c. 586 BC", lo: -605, hi: -430, match: /exile|babylon|captivity/ },
  { key: "jesus", label: "Jesus", dateLabel: "c. AD 30", lo: -6, hi: 36, match: /jesus|christ|ministry|gospel/, cross: true },
  { key: "church", label: "Early Church", dateLabel: "c. AD 33–100", lo: 37, hi: 400, match: /church|apostl|acts|epistle|paul|revelation/ },
  { key: "today", label: "Today", dateLabel: "present", lo: 1000, hi: 3000, match: /today|present|modern/ },
];

// Evenly space the eras across 6%–94% of the line.
function posForIndex(i: number): number {
  return 6 + (i / (ERAS.length - 1)) * 88;
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

function eraIndexForYear(year: number): number {
  const idx = ERAS.findIndex((e) => year >= e.lo && year <= e.hi);
  if (idx >= 0) return idx;
  let best = 0;
  let bestD = Infinity;
  ERAS.forEach((e, i) => {
    const d = Math.abs(year - (e.lo + e.hi) / 2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function TimelineSection({ data }: { data: ChapterWorkup }) {
  const bt = data.biblicalTimeline;
  const eraStr = bt?.era?.toLowerCase();
  const year = bt?.estimatedYear ?? parseYear(data.estimatedDate);

  let activeIndex = -1;
  if (eraStr) activeIndex = ERAS.findIndex((e) => e.match.test(eraStr));
  if (activeIndex < 0 && year != null) activeIndex = eraIndexForYear(year);

  const range = bt?.dateRange;
  const dateLabel = bt?.estimatedYearLabel ?? data.estimatedDate ?? "uncertain";
  const note = bt?.uncertaintyNote;

  return (
    <section id="timeline" className="scroll-mt-20 rounded-md border bg-card p-4 shadow-hair">
      <p className="text-eyebrow">Where it fits</p>
      <h2 className="text-section mt-0.5 text-primary">Timeline</h2>

      <div className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4">
        <div className="relative h-[96px] min-w-[680px]">
          <div className="absolute inset-x-0 top-[46px] h-0.5 bg-line" />

          {ERAS.map((era, i) => {
            const active = i === activeIndex;
            const lowered = i % 2 === 1;
            return (
              <div
                key={era.key}
                className="absolute top-[40px] flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${posForIndex(i)}%` }}
              >
                {era.cross ? (
                  <span className="text-[15px] leading-none text-jesus-red">✝</span>
                ) : (
                  <span
                    className={`h-3 w-3 rounded-full ${
                      active ? "bg-accent-strong ring-4 ring-accent/20" : "border-2 border-line bg-card"
                    }`}
                  />
                )}
                {lowered && <span className="mt-0.5 h-3 w-px bg-line" />}
                <span
                  className={`whitespace-nowrap text-[10px] font-medium leading-tight ${
                    active ? "text-accent-strong" : "text-secondary"
                  } ${lowered ? "mt-0.5" : "mt-1.5"}`}
                >
                  {era.label}
                </span>
              </div>
            );
          })}

          {/* Chapter pin above its era */}
          {activeIndex >= 0 && (
            <div
              className="absolute top-[2px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${posForIndex(activeIndex)}%` }}
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
