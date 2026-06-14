"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { getChapterMap, type ContextMode } from "@/lib/maps/chapter-maps";

// One strong primary map (real satellite/terrain imagery) that answers "where is
// this place today?", with Selah overlays. A visual-only Today | Biblical Context
// toggle swaps the overlay set. No forced ancient map.
export function MapsSection({ data }: { data: ChapterWorkup }) {
  const cfg = getChapterMap(data.slug);
  const [mode, setMode] = useState<ContextMode>("today");
  if (!cfg) return null;

  const overlay = cfg.modes[mode];
  const modes: { id: ContextMode; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "biblical", label: "Biblical Context" },
  ];

  return (
    <section id="maps" className="scroll-mt-20">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">Where it happened</p>
          <h2 className="text-section mt-0.5 text-primary">Maps &amp; Places</h2>
        </div>
        <div className="inline-flex shrink-0 gap-1 rounded-full border bg-card p-1 shadow-hair">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                mode === m.id ? "bg-accent-strong text-white" : "text-secondary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-md border bg-card"
        style={{ boxShadow: "0 0 0 1px var(--line), 0 14px 40px -20px var(--accent)" }}
      >
        <div className="relative aspect-[17/11] w-full overflow-hidden bg-card-soft">
          <img
            src={cfg.primaryMapImage}
            alt={`Satellite map of the ${data.reference} region`}
            className="h-full w-full object-cover"
            loading="lazy"
          />

          {/* soft vignette for premium framing + label legibility */}
          <span
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: "inset 0 0 70px 12px rgba(0,0,0,0.34)" }}
          />

          {/* soft boundary highlights (e.g. David's shepherding world) */}
          {overlay.boundaries && overlay.boundaries.length > 0 && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {overlay.boundaries.map((b, i) => (
                <ellipse
                  key={i}
                  cx={b.cx}
                  cy={b.cy}
                  rx={b.rx}
                  ry={b.ry}
                  fill="rgba(255,255,255,0.07)"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          )}

          {/* region labels */}
          {overlay.labels.map((l) => (
            <span
              key={l.text}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[rgba(16,16,20,0.42)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/95 backdrop-blur-[1px]"
              style={{ left: `${l.x}%`, top: `${l.y}%`, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
            >
              {l.text}
            </span>
          ))}

          {/* pins */}
          {overlay.pins.map((p) => (
            <span
              key={p.label}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white shadow ring-2 ring-[var(--accent-strong)]" />
                <span className="whitespace-nowrap rounded-full bg-[rgba(16,16,20,0.66)] px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  {p.label}
                </span>
              </span>
            </span>
          ))}

          {/* mode chip + attribution */}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(16,16,20,0.62)] px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {mode === "today" ? "Modern view" : "Biblical context"}
          </span>
          <span className="absolute bottom-1.5 right-2 rounded bg-[rgba(16,16,20,0.5)] px-1.5 py-0.5 text-[9px] leading-none text-white/85 backdrop-blur-sm">
            {cfg.attribution}
          </span>
        </div>

        <div className="p-4">
          <p className="text-[12px] leading-relaxed text-secondary">{cfg.caption}</p>
        </div>
      </div>
    </section>
  );
}
