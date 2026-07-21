import type { ChapterWorkup } from "@/lib/types";
import { getTimelineNote } from "@/lib/content/chapter-content";
import { chapterYear } from "@/lib/chapter-year";
import { timelineContextLine } from "@/components/chapter/MetadataChips";

// "Where It Fits" — the Big Story rail. Markers are evenly spaced for a clean,
// compact, mobile-friendly rail (no huge empty gaps); the chapter PIN is placed
// by date math, interpolated between the two markers its estimated year falls
// between. Only the pin moves per chapter.
type Marker = { key: string; label: string; year: number; cross?: boolean };

// Owner marker set (2026-07-19): Adam & Eve · Ark · 10 Commandments ·
// David & Goliath (owner pick over 1st Temple / Promised Land — the story
// everyone knows on sight) · Jesus · Today. Years drive only the pin
// interpolation between neighbors; spacing stays even.
const MARKERS: Marker[] = [
  { key: "adam-eve", label: "Adam & Eve", year: -4000 },
  { key: "ark", label: "Ark", year: -2500 },
  { key: "commandments", label: "10 Commandments", year: -1446 },
  { key: "david-goliath", label: "David & Goliath", year: -1025 },
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
  // Owner look fix (2026-07-19 phone screenshot): when the chapter's year IS
  // a marker's year — every Mark chapter sits exactly on Jesus (AD 30) — the
  // badge points at the marker itself and the marker lights up; nothing
  // covers it. EXACT year match only (Codex #74 P1: a proximity snap lit a
  // marker published Psalm 23 does not actually sit on — nearby dates keep
  // their honest interpolated pin instead).
  const activeMarkerIndex = (() => {
    if (year == null) return null;
    const i = MARKERS.findIndex((m) => m.year === year);
    return i === -1 ? null : i;
  })();
  const badgePos = activeMarkerIndex != null ? posForIndex(activeMarkerIndex) : pinPos;
  const rangeText = range
    ? `${fmtYear(range.startYear)} – ${fmtYear(range.endYear)}`
    : data.estimatedDate ?? bt?.estimatedYearLabel ?? "";
  // Primary copy is concise + CONFIDENT: a curated line when we have one, else the
  // date range. The generated uncertaintyNote is NEVER shown here — dating nuance
  // lives only in the Transparency drawer.
  const headline = getTimelineNote(data.slug) ?? rangeText;

  // UI-cleanup brief (board #29, 2026-07-21): the timeline owns the chapter's
  // date/place facts — the standalone chips are gone, and this one clean line
  // ("Around AD 30 · Galilee") carries them here.
  const contextLine = timelineContextLine(data);
  return (
    <section id="timeline" className="scroll-mt-20 rounded-md border bg-card p-3.5 shadow-hair">
      <h2 className="text-section text-primary">Where It Fits in the Story</h2>
      {contextLine && (
        <p className="mt-1 text-[12px] font-medium text-secondary">{contextLine}</p>
      )}

      {/* Owner decision A3 (2026-07-16): no horizontal swipe anywhere — the
          rail fits the container on every phone width. Owner direction
          2026-07-19 ("combo of A & B" after the ideas review): the rail FILLS
          with accent up to the chapter's place in the story — the canonical
          progress-line pattern for readable timelines — and the current
          marker is strongly lit while everything else stays quiet. */}
      <div className="mt-3">
        <div className="relative h-[78px]">
          <div className="absolute top-[40px] h-[3px] rounded-full bg-line" style={{ left: "4%", right: "4%" }} />
          {(badgePos ?? null) != null && (
            <div
              className="absolute top-[40px] h-[3px] rounded-full bg-accent-strong"
              style={{ left: "4%", width: `${Math.max(0, (badgePos as number) - 4)}%` }}
            />
          )}

          {MARKERS.map((m, i) => {
            const active = i === activeMarkerIndex;
            // Markers the story has already passed sit on the filled rail and
            // pick up a quiet accent border; future markers stay muted.
            const passed = badgePos != null && posForIndex(i) < badgePos && !active;
            return (
              <div
                key={m.key}
                className="absolute top-[34px] flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${posForIndex(i)}%` }}
              >
                {m.cross ? (
                  <span className={`leading-none text-jesus-red ${active ? "text-[17px]" : "text-[13px]"}`}>✝</span>
                ) : (
                  <span
                    className={
                      active
                        ? "h-3 w-3 rounded-full border-2 border-accent-strong bg-accent-strong"
                        : "h-2.5 w-2.5 rounded-full border-2 bg-card"
                    }
                    style={
                      active
                        ? { boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent-strong) 22%, transparent)" }
                        : { borderColor: passed ? "var(--accent-strong)" : "var(--line)" }
                    }
                  />
                )}
                <span
                  className={`mt-1.5 max-w-[64px] whitespace-normal text-center text-[9px] font-medium leading-tight ${
                    active ? "text-primary" : "text-secondary"
                  }`}
                >
                  {m.label}
                </span>
              </div>
            );
          })}

          {badgePos != null && (
            <div
              className="absolute top-[4px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${badgePos}%` }}
            >
              <span className="whitespace-nowrap rounded-full bg-accent-strong px-2 py-0.5 text-[9px] font-semibold text-white shadow-hair">
                {data.reference}
              </span>
              {/* Thin stem pointing at the rail; the dot exists ONLY when the
                  pin sits between markers — on a marker, the marker itself is
                  the anchor and nothing covers it. */}
              <span className={`w-px bg-accent-strong ${activeMarkerIndex != null ? "h-[10px]" : "h-[14px]"}`} />
              {activeMarkerIndex == null && (
                <span
                  className="-mt-px h-2 w-2 rounded-full bg-accent-strong"
                  style={{ boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent-strong) 22%, transparent)" }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* One entry point per fact: the curated note renders only when it says
          something the context line above doesn't already carry. */}
      {headline && !(contextLine && (contextLine.includes(headline) || headline.includes(contextLine))) && (
        <p className="mt-2 text-center text-[12px] font-medium text-secondary">{headline}</p>
      )}
    </section>
  );
}
