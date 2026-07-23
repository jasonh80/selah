"use client";

import type { ChapterWorkup } from "@/lib/types";
import { SectionCard } from "@/components/chapter/SectionCard";
import { getChapterContext, insightTypeOf, distinctText, type ContextMedia } from "@/lib/content/chapter-content";

type AAECard = { category: string; title: string; body: string; media?: ContextMedia };

// Author, Audience & Evidence — who wrote it, who first heard it, the world they
// lived in, and the manuscripts/inscriptions/landscape that ground it.
// Single-column, full-width cards (Quick/Deep retired 2026-07-19).
// Media renders only when a real asset exists — never an empty placeholder.
export function AuthorAudienceEvidence({
  data,
  headless,
}: {
  data: ChapterWorkup;
  /** Render the cards only — the Behind-the-Chapter wrapper (UI-cleanup
   * brief) supplies its own collapsed header. */
  headless?: boolean;
}) {
  // Prefer generated cards; fall back to static config (e.g. Psalm 23).
  // Every DISTINCT authored layer survives in the same full-width card
  // (Codex #64 final round): the Behind-the-Chapter body stays, and the
  // removed historical_world insight's summary/full text append when they
  // carry material the body doesn't already contain.
  const worldInsight = data.insights?.find((i) => insightTypeOf(i) === "historical_world");
  const enrich = (card: AAECard): AAECard => {
    const isWorld = /historical world|world behind/i.test(`${card.category} ${card.title}`);
    if (!isWorld || !worldInsight) return card;
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

  const cardStack = (
    <div className="space-y-2.5">
      {cards.map((c, i) => (
        <Card key={i} card={enrich(c)} />
      ))}
    </div>
  );
  if (headless) return cardStack;
  return (
    <SectionCard id="author-audience-evidence" icon="🏛" title="Behind the Chapter">
      {cardStack}
    </SectionCard>
  );
}

function Card({ card }: { card: AAECard }) {
  return (
    <div className="flex flex-col border-t pt-2.5 first:border-0 first:pt-0">
      <p className="text-eyebrow">{card.category}</p>
      <p className="text-card-title mt-1 text-primary">{card.title}</p>

      {card.media && (
        <figure className="mt-3 overflow-hidden rounded-sm border">
          <img src={card.media.src} alt={card.media.alt} className="h-full w-full object-cover" loading="lazy" />
          <figcaption className="bg-card-soft px-2.5 py-1.5 text-[11px] leading-snug text-secondary">
            {card.media.caption}
            {card.media.attribution ? ` · ${card.media.attribution}` : ""}
          </figcaption>
        </figure>
      )}

      <p className={"mt-2 whitespace-pre-line text-[13px] leading-relaxed text-secondary"}>
        {card.body}
      </p>
    </div>
  );
}
