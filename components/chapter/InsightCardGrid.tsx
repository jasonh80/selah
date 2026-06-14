"use client";

import { useState } from "react";
import type { ChapterWorkup, Insight } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

export function InsightCardGrid({ data }: { data: ChapterWorkup }) {
  return (
    <section id="deeper-study" className="scroll-mt-20">
      <SectionHead eyebrow="Understand" title="Deeper Study" />
      <div className="grid grid-cols-2 gap-2.5">
        {data.insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
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
