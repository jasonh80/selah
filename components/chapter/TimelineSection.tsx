"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";

// ---- Big-story eras (Creation → Today). Years are rough anchors for placement;
//      labels stay honest about uncertainty. ----
type Era = {
  key: string;
  label: string;
  dateLabel: string;
  lo: number; // negative = BC
  hi: number;
  match: RegExp;
  debated?: boolean;
};

const ERAS: Era[] = [
  { key: "creation", label: "Creation", dateLabel: "est. debated", lo: -6000, hi: -3000, match: /creation|adam|eden|garden/, debated: true },
  { key: "patriarchs", label: "Patriarchs", dateLabel: "c. 2000 BC", lo: -2200, hi: -1500, match: /patriarch|abraham|isaac|jacob|joseph/ },
  { key: "exodus", label: "Exodus", dateLabel: "c. 1446 / 1260 BC", lo: -1500, hi: -1200, match: /exodus|wilderness|sinai|moses|tabernacle/ },
  { key: "kingdom", label: "David / Kingdom", dateLabel: "c. 1050–586 BC", lo: -1100, hi: -586, match: /david|kingdom|monarchy|solomon|psalm|temple/ },
  { key: "exile", label: "Exile", dateLabel: "c. 586–538 BC", lo: -605, hi: -500, match: /exile|babylon|captivity/ },
  { key: "jesus", label: "Jesus", dateLabel: "c. 4 BC–AD 33", lo: -6, hi: 36, match: /jesus|christ|ministry|gospel|incarnation/ },
  { key: "church", label: "Early Church", dateLabel: "c. AD 33–100", lo: 37, hi: 200, match: /church|apostl|acts|epistle|paul/ },
  { key: "today", label: "Today", dateLabel: "present", lo: 1500, hi: 3000, match: /today|present|modern/ },
];

function parseYear(raw?: string): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const isBC = /\bb\.?c\.?(e)?\b/.test(s);
  const cent = s.match(/(\d+)(?:st|nd|rd|th)\s+century/);
  if (cent) {
    const mid = (parseInt(cent[1], 10) - 1) * 100 + 50;
    return isBC ? -mid : mid;
  }
  const nums = s.match(/\d{1,4}/g);
  if (!nums) return null;
  const avg = Math.round(nums.map(Number).reduce((a, b) => a + b, 0) / nums.length);
  return isBC ? -avg : avg;
}

function eraForYear(year: number): string {
  const inside = ERAS.find((e) => year >= e.lo && year <= e.hi);
  if (inside) return inside.key;
  let best = ERAS[0];
  let bestD = Infinity;
  for (const e of ERAS) {
    const d = Math.abs(year - (e.lo + e.hi) / 2);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best.key;
}

function fmtYear(y: number): string {
  return y < 0 ? `${-y} BC` : `AD ${y}`;
}

export function TimelineSection({ data }: { data: ChapterWorkup }) {
  const [tab, setTab] = useState<"chapter" | "story">("chapter");

  return (
    <section className="rounded-md border bg-card p-4 shadow-hair">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-eyebrow">Where it fits</p>
          <h2 className="text-section mt-0.5 text-primary">Timeline</h2>
        </div>
        <div className="inline-flex shrink-0 rounded-full border bg-card-soft p-0.5 text-[12px]">
          {(["chapter", "story"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 transition ${
                tab === t ? "bg-accent-strong text-white" : "text-secondary"
              }`}
            >
              {t === "chapter" ? "Chapter" : "Big Story"}
            </button>
          ))}
        </div>
      </div>

      {tab === "chapter" ? <ChapterRail data={data} /> : <BigStoryRail data={data} />}
    </section>
  );
}

function ChapterRail({ data }: { data: ChapterWorkup }) {
  const { labels, activeIndex } = data.timelineMini;
  return (
    <div className="mt-5">
      <div className="relative flex items-center justify-between">
        <span className="absolute left-1 right-1 top-1.5 h-0.5 bg-line" />
        {labels.map((label, i) => (
          <span
            key={label}
            className={`relative z-10 h-3 w-3 rounded-full ${
              i <= activeIndex ? "bg-accent-strong" : "border-2 border-line bg-card"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {labels.map((label, i) => (
          <span
            key={label}
            className={`text-center text-[11px] ${
              i === activeIndex ? "font-semibold text-accent-strong" : "text-secondary"
            }`}
            style={{ width: `${100 / labels.length}%` }}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-secondary">Where this moment sits within the chapter.</p>
    </div>
  );
}

function BigStoryRail({ data }: { data: ChapterWorkup }) {
  const bt = data.biblicalTimeline;
  const year = bt?.estimatedYear ?? parseYear(data.estimatedDate);
  const eraStr = bt?.era?.toLowerCase();
  const activeKey =
    (eraStr ? ERAS.find((e) => e.match.test(eraStr))?.key : undefined) ||
    (year != null ? eraForYear(year) : null);
  const activeEra = ERAS.find((e) => e.key === activeKey);

  const range = bt?.dateRange;
  const rangeLabel = range ? `${fmtYear(range.startYear)} – ${fmtYear(range.endYear)}` : null;
  const dateLabel = bt?.estimatedYearLabel ?? data.estimatedDate ?? "uncertain";
  const note = bt?.uncertaintyNote;

  return (
    <div className="mt-4">
      <div className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1">
        {ERAS.map((era, i) => {
          const active = era.key === activeKey;
          return (
            <div key={era.key} className="flex items-center">
              <div className="flex w-[78px] shrink-0 flex-col items-center text-center">
                <span
                  className={`h-3 w-3 rounded-full ${
                    active
                      ? "bg-accent-strong ring-4 ring-accent/20"
                      : era.debated
                        ? "border border-dashed border-line bg-card"
                        : "bg-line"
                  }`}
                />
                <span
                  className={`mt-1.5 text-[10px] font-semibold leading-tight ${
                    active ? "text-accent-strong" : "text-primary"
                  }`}
                >
                  {era.label}
                </span>
                <span className="text-[9px] leading-tight text-secondary">{era.dateLabel}</span>
              </div>
              {i < ERAS.length - 1 && <span className="h-px w-3 shrink-0 bg-line" />}
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-sm bg-tint px-3 py-2.5">
        <p className="text-[13px] text-primary">
          <span className="font-semibold">{data.reference}</span>
          {activeEra ? ` — ${activeEra.label}` : ""}
        </p>
        <p className="mt-0.5 text-[12px] text-secondary">
          {rangeLabel ? `Estimated date range: ${rangeLabel}` : `Estimated date: ${dateLabel}`}
        </p>
        {note && <p className="mt-1 text-[11px] leading-relaxed text-secondary">{note}</p>}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-secondary">
        Creation / Adam &amp; Eve — estimated date is debated; traditional chronologies place it
        roughly 5500–3760 BC, depending on the chronology used.
      </p>
    </div>
  );
}
