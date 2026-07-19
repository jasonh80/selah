"use client";

import type { ChapterWorkup } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { getChapterContext, type ContextMedia } from "@/lib/content/chapter-content";

type AAECard = { category: string; title: string; body: string; media?: ContextMedia };

// Author, Audience & Evidence — who wrote it, who first heard it, the world they
// lived in, and the manuscripts/inscriptions/landscape that ground it.
// Quick Dive: compact, skimmable cards. Deep Dive: fuller, roomier paragraphs.
// Media renders only when a real asset exists — never an empty placeholder.
export function AuthorAudienceEvidence({ data }: { data: ChapterWorkup }) {
  // Prefer generated cards; fall back to static config (e.g. Psalm 23).
  const cards: AAECard[] =
    data.behindTheChapter && data.behindTheChapter.length > 0
      ? data.behindTheChapter
      : getChapterContext(data.slug) ?? [];
  if (cards.length === 0) return null;

  return (
    <section id="author-audience-evidence" className="scroll-mt-20">
      <SectionHead title="Behind the Chapter" />
      <div className="space-y-2.5">
        {cards.map((c, i) => (
          <Card key={i} card={c} />
        ))}
      </div>
    </section>
  );
}

function Card({ card }: { card: AAECard }) {
  return (
    <div className="flex flex-col rounded-md border bg-card p-3.5 shadow-hair">
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

      <p className={"mt-2 text-[13px] leading-relaxed text-secondary"}>
        {card.body}
      </p>
    </div>
  );
}
