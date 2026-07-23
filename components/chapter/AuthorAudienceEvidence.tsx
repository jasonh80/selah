"use client";

import { useEffect, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { SectionCard } from "@/components/chapter/SectionCard";
import { useReadingMode } from "@/components/ReadingModeProvider";
import {
  getChapterContext,
  insightTypeOf,
  distinctText,
  isWorldCard,
  type ContextMedia,
} from "@/lib/content/chapter-content";

type AAECard = { category: string; title: string; body: string; media?: ContextMedia };

/**
 * Author · First Audience · Historical World · Evidence & Artifacts.
 *
 * OWNER RULING 2026-07-23: these are FIVE SEPARATE SECTIONS, not one big
 * "Behind the Chapter" box with sub-sections inside it. His rule for the whole
 * page: every block looks the same, and the only difference between blocks is
 * that some expand and some are fixed. A box containing four more boxes broke
 * that, so the wrapper is gone — each part now stands in the same frame as
 * every other section on the page and expands the same way.
 */
export function AuthorAudienceEvidence({ data }: { data: ChapterWorkup }) {
  // Prefer generated cards; fall back to static config (e.g. Psalm 23).
  // Every DISTINCT authored layer survives (Codex #64 final round): the
  // Behind-the-Chapter body stays, and the removed historical_world insight's
  // summary/full text append when they carry material the body doesn't
  // already contain.
  const worldInsight = data.insights?.find((i) => insightTypeOf(i) === "historical_world");
  const enrich = (card: AAECard): AAECard => {
    if (!isWorldCard(card) || !worldInsight) return card;
    const layers = [card.body];
    if (distinctText(worldInsight.preview, card.body)) layers.push(worldInsight.preview);
    if (distinctText(worldInsight.body, card.body) && distinctText(worldInsight.body, worldInsight.preview)) {
      layers.push(worldInsight.body);
    }
    return { ...card, body: layers.join("\n\n") };
  };
  const cards: AAECard[] =
    data.behindTheChapter && data.behindTheChapter.length > 0
      ? data.behindTheChapter
      : getChapterContext(data.slug) ?? [];
  if (cards.length === 0) return null;

  return (
    <>
      {cards.map((c, i) => (
        <ContextSection key={i} card={enrich(c)} />
      ))}
    </>
  );
}

/** One context section: the category IS the section title, the authored
 * headline is its one-line subtitle, and the body expands — exactly the shape
 * every other expanding section on the page uses. */
function ContextSection({ card }: { card: AAECard }) {
  const { mode } = useReadingMode();
  const [open, setOpen] = useState(mode === "deep");
  useEffect(() => {
    setOpen(mode === "deep");
  }, [mode]);
  return (
    // IDENTICAL shape to every other expanding section (owner: "I don't want
    // the reader wondering why we treated these sections differently"):
    // section title, one paragraph that swaps its authored headline for the
    // full body, and the same inline More/Less at the end of that paragraph.
    <SectionCard id={sectionId(card.category)} icon="" title={titleCase(card.category)}>
      {card.media && (
        <figure className="mb-2 overflow-hidden rounded-sm border">
          <img src={card.media.src} alt={card.media.alt} className="h-full w-full object-cover" loading="lazy" />
          <figcaption className="bg-card-soft px-2.5 py-1.5 text-[11px] leading-snug text-secondary">
            {card.media.caption}
            {card.media.attribution ? ` · ${card.media.attribution}` : ""}
          </figcaption>
        </figure>
      )}
      <p className="whitespace-pre-line text-[13px] leading-relaxed text-secondary">
        {open ? card.body : card.title}{" "}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="whitespace-nowrap text-[12px] font-medium text-accent-strong"
        >
          {open ? "Less ⌃" : "More ⌄"}
        </button>
      </p>
    </SectionCard>
  );
}

/** "FIRST AUDIENCE" → "First Audience"; authored casing wins when it is
 * already mixed. */
function titleCase(s: string): string {
  const t = s.trim();
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|\s|&\s)([a-z])/g, (_, pre, ch) => `${pre}${ch.toUpperCase()}`);
}

function sectionId(category: string): string {
  return `context-${category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
