import type { ChapterWorkup } from "@/lib/types";

// The big biblical story, as eras (Creation → Today). Dates are rough anchors
// for placement only — labels stay honest about uncertainty.
type Era = {
  key: string;
  label: string;
  dateLabel: string;
  lo: number; // year bounds (negative = BC) used to place a chapter
  hi: number;
  match: RegExp; // keywords to match a generated era string
  debated?: boolean;
};

const ERAS: Era[] = [
  { key: "creation", label: "Creation", dateLabel: "date debated", lo: -6000, hi: -3000, match: /creation|adam|eden|garden/, debated: true },
  { key: "patriarchs", label: "Patriarchs", dateLabel: "c. 2000 BC", lo: -2200, hi: -1500, match: /patriarch|abraham|isaac|jacob|joseph/ },
  { key: "exodus", label: "Exodus", dateLabel: "c. 1446 / 1260 BC", lo: -1500, hi: -1200, match: /exodus|wilderness|sinai|moses|tabernacle/ },
  { key: "kingdom", label: "David / Kingdom", dateLabel: "c. 1050–586 BC", lo: -1100, hi: -586, match: /david|kingdom|monarchy|solomon|psalm|temple/ },
  { key: "exile", label: "Exile", dateLabel: "c. 586–538 BC", lo: -605, hi: -500, match: /exile|babylon|captivity/ },
  { key: "jesus", label: "Jesus", dateLabel: "c. 4 BC–AD 33", lo: -6, hi: 36, match: /jesus|christ|ministry|gospel|incarnation/ },
  { key: "church", label: "Early Church", dateLabel: "c. AD 33–100", lo: 37, hi: 200, match: /church|apostl|acts|epistle|paul/ },
  { key: "today", label: "Today", dateLabel: "present", lo: 1500, hi: 3000, match: /today|present|modern/ },
];

// Pull a rough year from a label like "c. 1446 BC", "AD 27–30", "5th century BC".
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

function eraForYear(year: number): string {
  const inside = ERAS.find((e) => year >= e.lo && year <= e.hi);
  if (inside) return inside.key;
  // nearest by midpoint
  let best = ERAS[0];
  let bestD = Infinity;
  for (const e of ERAS) {
    const d = Math.abs(year - (e.lo + e.hi) / 2);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best.key;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "well dated",
  medium: "approximate",
  low: "approximate",
  debated: "debated",
};

export function BiblicalTimelineCard({ data }: { data: ChapterWorkup }) {
  const bt = data.biblicalTimeline;
  const year = bt?.estimatedYear ?? parseYear(data.estimatedDate);
  const eraStr = bt?.era?.toLowerCase();
  const activeKey =
    (eraStr ? ERAS.find((e) => e.match.test(eraStr))?.key : undefined) ||
    (year != null ? eraForYear(year) : null);

  const dateLabel = bt?.estimatedYearLabel ?? data.estimatedDate ?? "date uncertain";
  const confidence = bt?.confidence ?? (year != null ? "low" : "debated");
  const note =
    bt?.uncertaintyNote ?? (confidence === "debated" ? "Exact date is debated." : "Approximate placement.");

  return (
    <section className="rounded-md border bg-card p-4 shadow-hair">
      <p className="text-eyebrow">The Big Story</p>
      <h2 className="text-section mt-0.5 text-primary">Biblical Timeline</h2>

      {/* Era rail */}
      <div className="no-scrollbar -mx-4 mt-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {ERAS.map((era, i) => {
          const active = era.key === activeKey;
          return (
            <div key={era.key} className="flex items-center">
              <div className="flex w-[78px] shrink-0 flex-col items-center text-center">
                <span
                  className={`h-3 w-3 rounded-full ${
                    active
                      ? "bg-accent-strong ring-4 ring-accent/20"
                      : era.debated
                        ? "border border-dashed border-line bg-card"
                        : "bg-line"
                  }`}
                />
                <span
                  className={`mt-1.5 text-[10px] font-semibold leading-tight ${
                    active ? "text-accent-strong" : "text-primary"
                  }`}
                >
                  {era.label}
                </span>
                <span className="text-[9px] leading-tight text-secondary">{era.dateLabel}</span>
              </div>
              {i < ERAS.length - 1 && <span className="h-px w-3 shrink-0 bg-line" />}
            </div>
          );
        })}
      </div>

      {/* Placement callout */}
      <div className="mt-3 rounded-sm bg-tint px-3 py-2.5">
        <p className="text-[13px] text-primary">
          <span className="font-semibold">{data.reference}</span> —{" "}
          {activeKey ? ERAS.find((e) => e.key === activeKey)!.label : "placement uncertain"} ·{" "}
          {dateLabel}
          <span className="ml-1 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium text-secondary">
            {CONFIDENCE_LABEL[confidence] ?? confidence}
          </span>
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-secondary">{note}</p>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-secondary">
        Creation / Adam &amp; Eve — date debated. Traditional biblical chronologies place it roughly
        5500–3760 BC, depending on the chronology used.
      </p>
    </section>
  );
}
