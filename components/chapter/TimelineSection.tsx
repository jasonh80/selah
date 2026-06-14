"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";

// Linear big-story axis from Creation to Today. Years are rough anchors for
// positioning; labels stay honest about uncertainty.
const AXIS_MIN = -4000; // Creation (debated; used only for placement)
const AXIS_MAX = 2026; // Today

type Anchor = { label: string; year: number; cross?: boolean };
const ANCHORS: Anchor[] = [
  { label: "Creation", year: -4000 },
  { label: "Commandments", year: -1446 },
  { label: "1st Temple", year: -957 },
  { label: "Jesus", year: 30, cross: true },
  { label: "Today", year: 2026 },
];

// Map a year onto 6%–94% of the axis (leaves room for edge labels).
function pos(year: number): number {
  const p = (year - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
  return 6 + Math.max(0, Math.min(1, p)) * 88;
}

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
  const confidence = bt?.confidence ?? (year != null ? "low" : "debated");
  const range = bt?.dateRange ?? null;
  const dateLabel = bt?.estimatedYearLabel ?? data.estimatedDate ?? "uncertain";

  // Visual band: explicit range, or a soft uncertainty band for estimated dates.
  let bandStart: number | null = null;
  let bandEnd: number | null = null;
  if (range) {
    bandStart = range.startYear;
    bandEnd = range.endYear;
  } else if (year != null && (confidence === "low" || confidence === "debated")) {
    bandStart = year - 150;
    bandEnd = year + 150;
  }
  const markerYear = year ?? (range ? Math.round((range.startYear + range.endYear) / 2) : null);

  return (
    <div className="mt-4">
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <div className="relative h-[86px] min-w-[560px]">
          {/* axis line */}
          <div className="absolute inset-x-0 top-[46px] h-0.5 bg-line" />

          {/* chapter date band (range / estimate) */}
          {bandStart != null && bandEnd != null && (
            <div
              className="absolute top-[43px] h-[6px] rounded-full bg-accent/30"
              style={{ left: `${pos(bandStart)}%`, width: `${Math.max(1.5, pos(bandEnd) - pos(bandStart))}%` }}
            />
          )}

          {/* anchor markers */}
          {ANCHORS.map((a) => (
            <div
              key={a.label}
              className="absolute top-[40px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pos(a.year)}%` }}
            >
              {a.cross ? (
                <span className="text-[15px] leading-none text-jesus-red">✝</span>
              ) : (
                <span className="h-3 w-3 rounded-full border-2 border-line bg-card" />
              )}
              <span className="mt-1.5 whitespace-nowrap text-[10px] font-medium text-secondary">
                {a.label}
              </span>
            </div>
          ))}

          {/* chapter key marker (pill + pointer + dot on the line) */}
          {markerYear != null && (
            <div
              className="absolute top-[2px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pos(markerYear)}%` }}
            >
              <span className="whitespace-nowrap rounded-full bg-accent-strong px-2 py-0.5 text-[10px] font-semibold text-white shadow-hair">
                {data.reference}
              </span>
              <span className="h-[18px] w-px bg-accent-strong" />
              <span className="-mt-px h-3 w-3 rounded-full bg-accent-strong ring-4 ring-accent/20" />
            </div>
          )}
        </div>
      </div>

      {/* honest date callout */}
      <div className="mt-3 rounded-sm bg-tint px-3 py-2.5">
        <p className="text-[12px] text-secondary">
          {range
            ? `Estimated date range: ${fmtYear(range.startYear)} – ${fmtYear(range.endYear)}`
            : `Estimated date: ${dateLabel}`}
        </p>
        {bt?.uncertaintyNote && (
          <p className="mt-1 text-[11px] leading-relaxed text-secondary">{bt.uncertaintyNote}</p>
        )}
      </div>
    </div>
  );
}
