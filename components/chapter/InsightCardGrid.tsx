"use client";

import { useEffect, useState } from "react";
import type { ChapterWorkup, Insight } from "@/lib/types";
import { insightTypeOf, distinctText } from "@/lib/content/chapter-content";
import { useReadingMode } from "@/components/ReadingModeProvider";
import { SectionCard } from "@/components/chapter/SectionCard";

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

/** True when `preview` carries authored words the body does not already say.
 * Uses the project's canonical containment test, after stripping a truncation
 * ellipsis so "first sentence…" still proves equivalence with a body that
 * opens on that sentence. */
function isDistinctPreview(preview: string | undefined, body: string | undefined): boolean {
  const trimEllipsis = (t: string | undefined) => (t ?? "").replace(/(?:…|\.\.\.)\s*$/u, "").trim();
  return distinctText(trimEllipsis(preview), body);
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
  // One section frame for every card (SectionCard), one expand affordance —
  // the same inline "More ⌄" language the photos and the map use.
  const { mode } = useReadingMode();
  const [open, setOpen] = useState(mode === "deep");
  useEffect(() => {
    setOpen(mode === "deep");
  }, [mode]);
  const showBody = alwaysOpen || open;
  // Authored `preview` is not always a truncation of `body` — some cards carry
  // a distinct authored line there. Swapping preview→body on expand (or on
  // alwaysOpen) silently dropped it (Codex #104 review, 2026-07-23). Keep BOTH
  // whenever they differ, and dedupe only on proven equivalence: the body
  // already contains the preview's words.
  const keepPreview = showBody && isDistinctPreview(insight.preview, insight.body);
  const lead =
    leadLine &&
    ![insight.title, insight.subtitle ?? "", insight.body, insight.preview].some((t) =>
      t.toLowerCase().includes(leadLine.toLowerCase()),
    )
      ? leadLine
      : undefined;
  return (
    <SectionCard
      icon={insight.icon}
      title={insight.title}
      subtitle={insight.subtitle}
      tone={insight.jesus ? "jesus" : "default"}
    >
      {lead && (
        <p className={`mb-1.5 text-[13px] font-medium leading-relaxed ${insight.jesus ? "text-jesus-red" : "text-primary"}`}>
          {lead}
        </p>
      )}
      {keepPreview && (
        <p className="mb-1.5 text-[13px] leading-relaxed text-secondary">{insight.preview}</p>
      )}
      <p className="text-[13px] leading-relaxed text-secondary">
        {showBody ? insight.body : insight.preview}
        {!alwaysOpen && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="whitespace-nowrap text-[12px] font-medium text-accent-strong"
            >
              {open ? "Less ⌃" : "More ⌄"}
            </button>
          </>
        )}
      </p>
    </SectionCard>
  );
}
