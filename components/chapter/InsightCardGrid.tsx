"use client";

import { useEffect, useState } from "react";
import type { ChapterWorkup, Insight } from "@/lib/types";
import { insightTypeOf } from "@/lib/content/chapter-content";
import { useReadingMode } from "@/components/ReadingModeProvider";

// One "Deep Dive" system (layout spec §15): the former "Deeper Study" cards
// and the former "Go Deeper" topic menu merged. A compact topic rail sits
// above the study cards; every pill links to a real section on this page.
// Owner layout direction (2026-07-19): the "Deep Dive" section header and
// topic rail are gone (every pill duplicated a section already on the page),
// duplicate cards are removed, and the remaining study cards are placed
// individually through the page in the owner's order — all FULL WIDTH.
// InsightCards renders a chosen subset: `titles` = ordered include list;
// `exclude` = drop list with everything else rendering in data order.
export function InsightCards({
  data,
  types,
  excludeTypes,
  alwaysOpen,
  leadLine,
}: {
  data: ChapterWorkup;
  /** Ordered include list of stable section types. */
  types?: string[];
  /** Drop list; everything else renders in the canonical tail order. */
  excludeTypes?: string[];
  /** UI-cleanup brief (board #29, 2026-07-21): anchor sections render open
   * and full-width in BOTH study modes — no More/Less, no tap target. */
  alwaysOpen?: boolean;
  /** One short lead line merged INTO the card (e.g. the former red Jesus
   * chip absorbed into Jesus at the Center) — rendered only when it adds
   * text the card doesn't already contain. */
  leadLine?: string;
}) {
  // image_plan is production guidance, never a reader card.
  let cards = data.insights.filter((i) => insightTypeOf(i) !== "image_plan");
  if (types) {
    cards = cards
      .filter((i) => types.includes(insightTypeOf(i)))
      .sort((a, b) => types.indexOf(insightTypeOf(a)) - types.indexOf(insightTypeOf(b)));
  } else if (excludeTypes) {
    // Owner tail order by TYPE: theology → original language → live it →
    // disciple it → prayer; unrecognized types keep data order after these.
    const hint = ["theology", "original_language", "application", "discipleship", "prayer"];
    cards = cards
      .filter((i) => !excludeTypes.includes(insightTypeOf(i)))
      .map((card, dataIndex) => ({ card, dataIndex }))
      .sort((a, b) => {
        const ai = hint.indexOf(insightTypeOf(a.card));
        const bi = hint.indexOf(insightTypeOf(b.card));
        return (ai === -1 ? hint.length + a.dataIndex : ai) - (bi === -1 ? hint.length + b.dataIndex : bi);
      })
      .map((x) => x.card);
  }
  if (cards.length === 0) return null;
  return (
    <div className="space-y-s2">
      {cards.map((insight, i) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          alwaysOpen={alwaysOpen}
          leadLine={i === 0 ? leadLine : undefined}
        />
      ))}
    </div>
  );
}

function InsightCard({
  insight,
  alwaysOpen,
  leadLine,
}: {
  insight: Insight;
  alwaysOpen?: boolean;
  leadLine?: string;
}) {
  // Quick/Deep Study returned (owner direction 2026-07-20): Deep Study opens
  // every card — the zero-click scroll #64 established; Quick Study compacts
  // each card to its authored PREVIEW line (two-copy mechanic, never CSS
  // truncation). Switching mode resets all cards; a tap still toggles one
  // card in place. FAQs stay collapsed either way.
  const { mode } = useReadingMode();
  const [open, setOpen] = useState(mode === "deep");
  useEffect(() => {
    setOpen(mode === "deep");
  }, [mode]);
  // Anchor sections (UI-cleanup brief): always open, no toggle affordance —
  // one guided journey, not a stack of equally-tappable database cards.
  const showBody = alwaysOpen || open;
  // The absorbed lead line renders only when it carries material the card's
  // own text doesn't already contain (one entry point per idea, no repeats).
  const lead =
    leadLine &&
    ![insight.title, insight.subtitle ?? "", insight.body, insight.preview].some((t) =>
      t.toLowerCase().includes(leadLine.toLowerCase()),
    )
      ? leadLine
      : undefined;
  const inner = (
    <>
      <div className="flex items-start gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${
            insight.jesus ? "bg-jesus-red-soft text-jesus-red" : "bg-tint text-accent-strong"
          }`}
          aria-hidden
        >
          {insight.icon}
        </span>
        <p className={`text-card-title pt-0.5 ${insight.jesus ? "text-jesus-red" : "text-primary"}`}>
          {insight.title}
        </p>
      </div>

      {insight.subtitle && (
        <p className="mt-2 font-display text-lg font-semibold tracking-[-0.01em] text-primary">
          {insight.subtitle}
        </p>
      )}

      {lead && (
        <p className={`mt-1.5 text-[13px] font-medium leading-relaxed ${insight.jesus ? "text-jesus-red" : "text-primary"}`}>
          {lead}
        </p>
      )}

      {/* Owner ask (2026-07-20, live Mark 9 review): the lone "›" hid that a
          full explanation exists AND cost a whole padded row. The cue now
          flows INLINE at the end of the text — labeled, accent-colored, same
          affordance as "Read <ref> ⌄" — and the card gets shorter. */}
      <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
        {showBody ? insight.body : insight.preview}
        {!alwaysOpen && (
          <>
            {" "}
            <span aria-hidden className="whitespace-nowrap text-[11px] font-medium text-accent-strong">
              {open ? "Less ⌃" : "More ⌄"}
            </span>
          </>
        )}
      </p>
    </>
  );
  const frame = `flex w-full flex-col rounded-md border bg-card p-3.5 text-left shadow-hair transition ${insight.jesus ? "ring-1 ring-[rgba(178,58,58,0.18)]" : ""}`;
  return alwaysOpen ? (
    <div className={frame}>{inner}</div>
  ) : (
    <button onClick={() => setOpen((v) => !v)} className={frame}>
      {inner}
    </button>
  );
}
