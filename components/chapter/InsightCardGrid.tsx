"use client";

import { useEffect, useState } from "react";
import type { ChapterWorkup, Insight } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { useReadingMode } from "@/components/ReadingModeProvider";
import { getChapterMap } from "@/lib/maps/chapter-maps";

// One "Deep Dive" system (layout spec §15): the former "Deeper Study" cards
// and the former "Go Deeper" topic menu merged. A compact topic rail sits
// above the study cards; every pill links to a real section on this page.
type Topic = { icon: string; label: string; href: string; jesus?: boolean };

const TOPICS: Topic[] = [
  { icon: "📖", label: "Verse by Verse", href: "#chapter" },
  { icon: "🗺", label: "Maps & Places", href: "#maps" },
  { icon: "🕰", label: "Where It Fits", href: "#timeline" },
  { icon: "🔍", label: "What Most People Miss", href: "#most-people-miss" },
  { icon: "❒", label: "Related Chapters", href: "#chapters" },
];

export function InsightCardGrid({ data }: { data: ChapterWorkup }) {
  // Only advertise sections that actually RENDER for this chapter — the Maps
  // pill mirrors MapsSection's own config condition, never a dead link.
  const hasMap = Boolean(getChapterMap(data.slug));
  const topics = TOPICS.filter((topic) => {
    if (topic.label === "Maps & Places") return hasMap;
    if (topic.label === "What Most People Miss") return Boolean(data.modernReadersMiss?.trim());
    return true;
  });

  return (
    <section id="deeper-study" className="scroll-mt-20">
      <SectionHead title="Deep Dive" />
      <div className="mb-s3 flex flex-wrap gap-s2">
        {topics.map((topic) => (
          <a
            key={topic.label}
            href={topic.href}
            className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium text-secondary shadow-hair transition hover:border-accent/40 hover:text-primary"
          >
            <span aria-hidden>{topic.icon}</span>
            {topic.label}
          </a>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-s2">
        {data.insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const { mode } = useReadingMode();
  // Deep Dive opens every card; Quick Dive collapses them. Switching mode resets
  // all cards, but the user can still open/close individual cards within a mode.
  const [open, setOpen] = useState(mode === "deep");
  useEffect(() => {
    setOpen(mode === "deep");
  }, [mode]);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className={`flex flex-col rounded-md border bg-card p-3.5 text-left shadow-hair transition ${
        open ? "col-span-2" : ""
      } ${insight.jesus ? "ring-1 ring-[rgba(178,58,58,0.18)]" : ""}`}
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
