"use client";

import { useState } from "react";
import type { ChapterWorkup, Insight } from "@/lib/types";

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
  titles,
  exclude,
}: {
  data: ChapterWorkup;
  titles?: string[];
  exclude?: string[];
}) {
  const norm = (t: string) => t.trim().toLowerCase();
  let cards = data.insights;
  if (titles) {
    const order = titles.map(norm);
    cards = cards
      .filter((i) => order.includes(norm(i.title)))
      .sort((a, b) => order.indexOf(norm(a.title)) - order.indexOf(norm(b.title)));
  } else if (exclude) {
    const drop = exclude.map(norm);
    // Owner tail order: theology → original language → live it → prayer;
    // anything unrecognized keeps data order after these.
    const hint = ["theology principle", "original language", "live it", "practical application", "prayer"];
    cards = cards
      .filter((i) => !drop.includes(norm(i.title)))
      .map((card, dataIndex) => ({ card, dataIndex }))
      .sort((a, b) => {
        const ai = hint.indexOf(norm(a.card.title));
        const bi = hint.indexOf(norm(b.card.title));
        return (ai === -1 ? hint.length + a.dataIndex : ai) - (bi === -1 ? hint.length + b.dataIndex : bi);
      })
      .map((x) => x.card);
  }
  if (cards.length === 0) return null;
  return (
    <div className="space-y-s2">
      {cards.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  // Owner decision 2026-07-19: every study card starts EXPANDED (one
  // scrollable page); a tap still collapses it. FAQs stay collapsed.
  const [open, setOpen] = useState(true);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className={`flex w-full flex-col rounded-md border bg-card p-3.5 text-left shadow-hair transition ${insight.jesus ? "ring-1 ring-[rgba(178,58,58,0.18)]" : ""}`}
    >
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

      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-secondary">
        {open ? insight.body : insight.preview}
      </p>

      <span className="mt-2 self-end text-secondary">{open ? "⌃" : "›"}</span>
    </button>
  );
}
