"use client";

import { useMemo, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { chapterYear } from "@/lib/chapter-year";

// THE BIG STORY — the true-time rail (owner-approved design, iterated live
// 2026-07-22/23 on the playground preview and ratified "let's put it out
// there"). Principles, all owner-ruled:
//   · Equal distance = equal years. No telescope, no even spacing — the
//     empty stretches are honest time and they teach.
//   · Dots sit at TRUE positions always; when two icons would crowd, the
//     ICONS nudge apart and a hairline tick ties each back to its dot.
//     Every icon carries a tick to its dot so the rail reads as one piece.
//   · Jesus is not an icon in the row — He is a large bold red cross planted
//     through the line at His true position: the center of the story.
//   · Today is a target ring ON the rail under its own purple bubble; after
//     it, plain dots trail into the unwritten future (no arrow, no symbol).
//   · The chapter's purple bubble carries the DATE ONLY ("AD 29" — the "c."
//     scholarly hedge is retired; the count-back line's plain-English
//     "About …" carries the honesty).
//   · The count-back bracket beneath ties the chapter to Today: "About
//     1,997 years ago", recomputed per chapter and per calendar year.
//   · Tap any icon for name, date, and one sentence — a popover that
//     overlays the card and never grows it.

type Anchor = {
  id: string;
  year: number; // negative = BC
  name: string;
  dateLabel: string;
  blurb: string;
};

// Owner-approved anchor set (2026-07-22 session; Joseph, Exile, and Second
// Temple removed by owner ruling — add nothing without his approval).
const ANCHORS: Anchor[] = [
  { id: "adam", year: -4000, name: "Adam & Eve", dateLabel: "c. 4000 BC", blurb: "The first people, made in God's image — where the whole story begins." },
  { id: "ark", year: -2300, name: "Noah's Ark", dateLabel: "c. 2300 BC", blurb: "God preserves one family through the flood and starts again." },
  { id: "commandments", year: -1446, name: "Commandments", dateLabel: "c. 1446 BC", blurb: "God frees Israel from Egypt and gives His law at Sinai." },
  { id: "david", year: -1025, name: "David & Goliath", dateLabel: "c. 1025 BC", blurb: "The shepherd who felled a giant becomes Israel's greatest king." },
  { id: "jesus", year: 30, name: "Jesus", dateLabel: "c. 5 BC – AD 30", blurb: "God's Son lives, dies, and rises — the center of the whole line." },
  { id: "nt", year: 95, name: "New Testament completed", dateLabel: "c. AD 95", blurb: "The last apostolic writings are finished; the Bible's story is told." },
  { id: "gutenberg", year: 1455, name: "Gutenberg Bible", dateLabel: "AD 1455", blurb: "The press puts Scripture on the road to every language and home." },
];

const START = -4000;
// The dated rail uses the left 88% of the card; the right 12% is the dot
// trail into the unwritten future.
const RAIL_SPAN = 88;
const INSET = 3;

function fmtYear(y: number): string {
  return y > 0 ? `AD ${y}` : `${Math.abs(y)} BC`;
}

// 19px line glyphs on a 16 grid, currentColor only — never color-alone.
function AnchorIcon({ id }: { id: string }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "adam": // two simple people (owner reference)
      return <svg width="19" height="19" viewBox="0 0 16 16"><circle cx="5.3" cy="4.6" r="2" {...s} /><circle cx="10.7" cy="4.6" r="2" {...s} /><path d="M2.2 13.5c0-2.6 1.4-4.2 3.1-4.2s3.1 1.6 3.1 4.2M7.6 13.5c0-2.6 1.4-4.2 3.1-4.2s3.1 1.6 3.1 4.2" {...s} /></svg>;
    case "ark": // hull under a double rainbow (owner reference)
      return <svg width="19" height="19" viewBox="0 0 16 16"><path d="M2.5 10.5h11L12 13.5H4L2.5 10.5Z" {...s} /><path d="M3.8 8a4.2 4.2 0 0 1 8.4 0" {...s} /><path d="M5.7 8a2.3 2.3 0 0 1 4.6 0" {...s} strokeWidth={1.1} /></svg>;
    case "commandments":
      return <svg width="19" height="19" viewBox="0 0 16 16"><path d="M3 13V5a2.5 2.5 0 0 1 5 0v8H3ZM8 13V5a2.5 2.5 0 0 1 5 0v8H8Z" {...s} /></svg>;
    case "david": // sling: cords to a pouch cradling the stone
      return <svg width="19" height="19" viewBox="0 0 16 16"><circle cx="3.2" cy="2.2" r="0.8" {...s} /><circle cx="12.8" cy="2.2" r="0.8" {...s} /><path d="M3.5 3c1 3.6 2.4 6 4.5 7.6M12.5 3c-1 3.6-2.4 6-4.5 7.6" {...s} /><path d="M5.2 10.6c0 1.6 1.2 2.8 2.8 2.8s2.8-1.2 2.8-2.8" {...s} /><circle cx="8" cy="11" r="1.3" fill="currentColor" stroke="none" /></svg>;
    case "nt": // open codex + subtle check
      return <svg width="19" height="19" viewBox="0 0 16 16"><path d="M8 4C6.5 2.8 4 2.8 2 3.5v9c2-.7 4.5-.7 6 .5 1.5-1.2 4-1.2 6-.5v-9C12 2.8 9.5 2.8 8 4Zm0 0v9" {...s} /><path d="M10.5 6.5l1 1 1.8-2" {...s} strokeWidth={1.1} /></svg>;
    case "gutenberg": // one bold printed Bible, cross on the cover
      return <svg width="19" height="19" viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="1.2" {...s} /><path d="M5.2 2v12" {...s} strokeWidth={1.1} /><path d="M9.2 5.2v4M7.4 6.6h3.6" {...s} strokeWidth={1.8} /></svg>;
    default:
      return null;
  }
}

// Collision rule: dots never move; icons within ~20px slide apart and the
// tick from icon to dot bends to keep pointing true.
function nudgedIconPositions(pts: { id: string; x: number }[], widthPx: number): Map<string, number> {
  const MIN = (20 / widthPx) * 100;
  const xs = pts.map((p) => ({ ...p }));
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i].x - xs[i - 1].x;
      if (gap < MIN) {
        const push = (MIN - gap) / 2;
        xs[i - 1].x -= push;
        xs[i].x += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return new Map(xs.map((p) => [p.id, p.x]));
}

export function TimelineSection({ data }: { data: ChapterWorkup }) {
  const [open, setOpen] = useState<string | null>(null);
  const year = chapterYear(data);
  // Recomputed each render so Today and every count stay correct in any
  // calendar year (established rule from the retired date chip).
  const nowYear = new Date().getFullYear();

  const xPct = (y: number) => INSET + ((y - START) / (nowYear - START)) * (RAIL_SPAN - INSET);

  const iconRow = ANCHORS.filter((a) => a.id !== "jesus");
  const iconX = useMemo(
    () => nudgedIconPositions(iconRow.map((a) => ({ id: a.id, x: xPct(a.year) })), 375),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nowYear],
  );

  const hasYear = year != null;
  const chapterX = hasYear ? xPct(year) : null;
  // No year zero: 10 BC to AD 10 is 19 years, not 20.
  const yearsAgo = hasYear ? (year > 0 ? nowYear - year : nowYear + Math.abs(year) - 1) : null;

  const active = ANCHORS.find((a) => a.id === open);
  const todayOpen = open === "today";

  return (
    <section
      id="timeline"
      className="relative scroll-mt-20 rounded-md border bg-card p-3.5 shadow-hair"
      onClick={() => setOpen(null)}
    >
      <h2 className="text-section text-primary">The Big Story</h2>

      <div className="relative mt-9 h-[64px]">
        {/* chapter bubble — date only, riding high and clear of the cross */}
        {hasYear && chapterX != null && (
          <div className="absolute top-[-22px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${chapterX}%` }}>
            <span className="whitespace-nowrap rounded-full bg-accent-strong px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-hair">
              {fmtYear(year)}
            </span>
            <span className="h-[30px] w-px bg-accent-strong" />
          </div>
        )}

        {/* TODAY bubble — twin of the chapter bubble */}
        <div className="absolute top-[-22px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${xPct(nowYear)}%` }}>
          <span className="whitespace-nowrap rounded-full bg-accent-strong px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-hair">
            Today
          </span>
          <span className="h-[26px] w-px bg-accent-strong" />
        </div>

        {/* the dated rail + accent fill to the chapter's true position */}
        <div className="absolute top-[26px] h-[2px] rounded-full bg-line" style={{ left: `${INSET}%`, width: `${RAIL_SPAN - INSET}%` }} />
        {hasYear && chapterX != null && (
          <div className="absolute top-[26px] h-[2px] rounded-full bg-accent-strong" style={{ left: `${INSET}%`, width: `${chapterX - INSET}%` }} />
        )}

        {/* the future: plain dots, nothing more */}
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={`trail-${i}`}
            className="absolute top-[25px] h-[4px] w-[4px] rounded-full"
            style={{ left: `${RAIL_SPAN + i * 2.1}%`, background: "var(--line)" }}
          />
        ))}

        {/* JESUS — the bold cross planted through the line, true position */}
        <button
          type="button"
          aria-label="Jesus, c. 5 BC – AD 30"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(open === "jesus" ? null : "jesus");
          }}
          className="absolute z-[5] -translate-x-1/2 text-jesus-red"
          style={{ left: `${xPct(30)}%`, top: "8px" }}
        >
          <svg width="20" height="34" viewBox="0 0 22 38" aria-hidden>
            <path d="M11 4v30M4 12.5h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </button>

        {/* TODAY — the target ring planted on the rail */}
        <button
          type="button"
          aria-label={`Today, ${nowYear}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(todayOpen ? null : "today");
          }}
          className="absolute z-[5] -translate-x-1/2 text-primary"
          style={{ left: `${xPct(nowYear)}%`, top: "18px" }}
        >
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="6" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="0.7" fill="currentColor" />
          </svg>
        </button>

        {/* dots at TRUE positions */}
        {iconRow.map((a) => (
          <span
            key={`dot-${a.id}`}
            className="absolute top-[24px] h-[6px] w-[6px] -translate-x-1/2 rounded-full"
            style={{
              left: `${xPct(a.year)}%`,
              background: hasYear && year != null && a.year <= year ? "var(--accent-strong)" : "var(--line)",
            }}
          />
        ))}

        {/* icons, ticked to their dots; nudged apart only when crowded */}
        {iconRow.map((a) => {
          const ix = iconX.get(a.id) ?? xPct(a.year);
          const dx = xPct(a.year);
          return (
            <span key={`icon-${a.id}`}>
              <span
                className="absolute top-[30px] h-[9px] w-px origin-top"
                style={{
                  left: `${dx}%`,
                  background: "var(--line)",
                  transform: `translateX(-50%) rotate(${Math.atan2((ix - dx) * 3.75, 10)}rad)`,
                }}
              />
              <button
                type="button"
                aria-label={`${a.name}, ${a.dateLabel}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(open === a.id ? null : a.id);
                }}
                className={`absolute top-[36px] flex h-[32px] w-[32px] -translate-x-1/2 items-center justify-center rounded-full ${open === a.id ? "text-primary" : "text-secondary"}`}
                style={{ left: `${ix}%` }}
              >
                <AnchorIcon id={a.id} />
              </button>
            </span>
          );
        })}
      </div>

      {/* count-back bracket: Today back to this chapter */}
      {hasYear && chapterX != null && yearsAgo != null && (
        <div className="relative mt-3 h-[30px]">
          <div className="absolute top-[5px] h-[2px] rounded-full" style={{ left: `${chapterX}%`, width: `${RAIL_SPAN - chapterX}%`, background: "var(--accent-strong)", opacity: 0.9 }} />
          <span className="absolute top-[0px] h-[12px] w-[2px] rounded-full" style={{ left: `${chapterX}%`, background: "var(--accent-strong)", opacity: 0.9 }} />
          <span className="absolute top-[0px] h-[12px] w-[2px] rounded-full" style={{ left: `${RAIL_SPAN}%`, background: "var(--accent-strong)", opacity: 0.9 }} />
          <p
            className="absolute top-[13px] -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold text-primary"
            style={{ left: `${chapterX + (RAIL_SPAN - chapterX) / 2}%` }}
          >
            About {yearsAgo.toLocaleString()} years ago
          </p>
        </div>
      )}

      {/* anchored popover — overlays the card, never grows it */}
      {(active || todayOpen) && (
        <div
          className="absolute z-10 w-[210px] -translate-x-1/2 rounded-md border bg-card p-2.5 shadow-soft"
          style={{
            left: `clamp(110px, ${todayOpen ? xPct(nowYear) : iconX.get(open!) ?? (open === "jesus" ? xPct(30) : 50)}%, calc(100% - 110px))`,
            top: 44,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[12px] font-semibold text-primary">{todayOpen ? "Today" : active?.name}</p>
          <p className="text-[10px] text-secondary">{todayOpen ? String(nowYear) : active?.dateLabel}</p>
          <p className="mt-1 text-[11px] leading-snug text-secondary">
            {todayOpen
              ? "You are here — reading the same story, roughly 6,000 years in."
              : active?.blurb}
          </p>
        </div>
      )}
    </section>
  );
}
