"use client";

import { useRef, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { getChapterMap, type ContextMode, type MapOverlay } from "@/lib/maps/chapter-maps";

// One strong satellite primary that answers "where is this place today?", with
// zoom/pan and Selah overlays. The image AND every overlay live inside ONE
// transform layer, so pins/regions/borders never drift while zooming. Pins and
// labels counter-scale so they stay readable; geographic shapes scale naturally.
const MIN_ZOOM = 1;
const MAX_ZOOM = 3.5;

export function MapsSection({ data }: { data: ChapterWorkup }) {
  const cfg = getChapterMap(data.slug);
  const [mode, setMode] = useState<ContextMode>("today");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  if (!cfg) return null;
  const overlay: MapOverlay = cfg.modes[mode];
  const inv = 1 / zoom;

  function clamp(p: { x: number; y: number }, z: number) {
    const el = viewport.current;
    if (!el) return { x: 0, y: 0 };
    const mx = ((z - 1) * el.clientWidth) / 2;
    const my = ((z - 1) * el.clientHeight) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  }
  function zoomTo(z: number) {
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    setZoom(nz);
    setPan((p) => clamp(p, nz));
  }
  function reset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  function onPointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setGrabbing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPan(
      clamp(
        { x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) },
        zoom,
      ),
    );
  }
  function onPointerUp() {
    drag.current = null;
    setGrabbing(false);
  }

  // Adaptive scale bar: largest of 10/3/1 mi that fits ≤ ~42% of the view.
  const milesPctAtZoom = (mi: number) => (mi / cfg.milesAcross) * 100 * zoom;
  const scaleMi = [10, 3, 1].find((mi) => milesPctAtZoom(mi) <= 42) ?? 1;
  const scalePct = milesPctAtZoom(scaleMi);

  return (
    <section id="maps" className="scroll-mt-20">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-section text-primary">Maps &amp; Places</h2>
        <div className="inline-flex shrink-0 gap-1 rounded-full border bg-card p-1 shadow-hair">
          {(["today", "biblical"] as ContextMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                mode === m ? "bg-accent-strong text-white" : "text-secondary"
              }`}
            >
              {m === "today" ? "Today" : "Biblical Context"}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-md border bg-card"
        style={{ boxShadow: "0 0 0 1px var(--line), 0 14px 40px -20px var(--accent)" }}
      >
        <div
          ref={viewport}
          className={`relative aspect-[17/11] w-full overflow-hidden bg-card-soft ${
            zoom > 1 ? (grabbing ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={() => zoomTo(zoom >= MAX_ZOOM ? 1 : zoom + 1)}
        >
          {/* TRANSFORM LAYER — image + all geographic overlays move together */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: drag.current ? "none" : "transform 0.16s ease-out",
            }}
          >
            <img
              src={cfg.primaryMapImage}
              alt={`Satellite map of the ${data.reference} region`}
              className="h-full w-full select-none object-cover"
              draggable={false}
              loading="lazy"
            />
            <span className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 70px 12px rgba(0,0,0,0.34)" }} />

            {/* geographic shapes (regions / territories / paths) scale with the map */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              {overlay.regions.map((r, i) =>
                r.variant === "territory" ? (
                  // Modern regional border (approx:false) reads more defined/cool;
                  // biblical territory (approx:true) is softer + dashed + warm.
                  <ellipse
                    key={`t${i}`}
                    cx={r.cx}
                    cy={r.cy}
                    rx={r.rx}
                    ry={r.ry}
                    fill={r.approx ? "rgba(255,221,128,0.15)" : "rgba(130,210,255,0.12)"}
                    stroke={r.approx ? "rgba(255,224,138,0.92)" : "rgba(150,225,255,0.95)"}
                    strokeWidth={r.approx ? 2 : 2.25}
                    strokeDasharray={r.approx ? "6 4" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <ellipse
                    key={`g${i}`}
                    cx={r.cx}
                    cy={r.cy}
                    rx={r.rx}
                    ry={r.ry}
                    fill="rgba(120,200,255,0.22)"
                    stroke="rgba(180,225,255,0.85)"
                    strokeWidth={1.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
              {overlay.paths.map((p, i) => (
                <polyline
                  key={`p${i}`}
                  points={p.points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {/* region / territory / path text labels (counter-scaled) */}
            {overlay.regions
              .filter((r) => r.label)
              .map((r, i) => (
                <Overlay key={`rl${i}`} x={r.lx ?? r.cx} y={r.ly ?? r.cy} inv={inv}>
                  <span
                    className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                      r.variant === "territory" && r.approx ? "text-[#ffe08a]" : "text-[#bfe4ff]"
                    }`}
                    style={{ background: "rgba(12,14,20,0.6)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                  >
                    {r.label}
                  </span>
                </Overlay>
              ))}
            {overlay.paths
              .filter((p) => p.label)
              .map((p, i) => (
                <Overlay key={`pl${i}`} x={p.lx ?? (p.points[0][0] + p.points[1][0]) / 2} y={p.ly ?? (p.points[0][1] + p.points[1][1]) / 2} inv={inv}>
                  <span
                    className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ background: "rgba(12,14,20,0.7)" }}
                  >
                    {p.label}
                  </span>
                </Overlay>
              ))}

            {/* area / water labels */}
            {overlay.labels.map((l) => (
              <Overlay key={l.text} x={l.x} y={l.y} inv={inv}>
                <span
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] ${
                    l.tone === "water" ? "italic text-[#bfe4ff]" : "text-white"
                  }`}
                  style={{ background: "rgba(12,14,20,0.55)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                >
                  {l.text}
                </span>
              </Overlay>
            ))}

            {/* pins (specific places) */}
            {overlay.pins.map((p) => (
              <Overlay key={p.label} x={p.x} y={p.y} inv={inv}>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)] ring-[3px] ring-[var(--accent-strong)]" />
                  <span
                    className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white"
                    style={{ background: "rgba(12,14,20,0.72)", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                  >
                    {p.label}
                  </span>
                </span>
              </Overlay>
            ))}
          </div>

          {/* ---- viewport-fixed UI (do not transform) ---- */}
          {/* mode chip */}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(12,14,20,0.66)] px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {mode === "today" ? "Modern view" : "Biblical context"}
          </span>

          {/* compass (always north-up) */}
          <span
            className="absolute right-2.5 top-2.5 flex h-9 w-9 flex-col items-center justify-center rounded-full bg-[rgba(12,14,20,0.66)] text-white shadow backdrop-blur-sm"
            aria-label="North is up"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M12 3 L16 14 L12 11.5 L8 14 Z" fill="#ffffff" />
              <path d="M12 3 L12 11.5 L8 14 Z" fill="#e0594a" />
            </svg>
            <span className="-mt-0.5 text-[8px] font-bold leading-none">N</span>
          </span>

          {/* zoom controls */}
          <div className="absolute bottom-2.5 right-2.5 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-[rgba(12,14,20,0.62)] text-white shadow backdrop-blur-sm">
            <button onClick={() => zoomTo(zoom + 0.5)} aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center text-lg leading-none hover:bg-white/10">+</button>
            <button onClick={() => zoomTo(zoom - 0.5)} aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center border-t border-white/15 text-lg leading-none hover:bg-white/10">−</button>
            <button onClick={reset} aria-label="Reset view" className="flex h-8 w-8 items-center justify-center border-t border-white/15 text-[10px] font-semibold hover:bg-white/10">⟳</button>
          </div>

          {/* distance scale bar (zoom-aware) */}
          <div className="absolute bottom-3 left-2.5 select-none">
            <div className="relative h-2 border-x border-b border-white" style={{ width: `${scalePct}%`, minWidth: 26 }}>
              <span className="absolute -top-4 left-0 whitespace-nowrap text-[10px] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                {scaleMi} mi
              </span>
            </div>
          </div>

          {/* attribution */}
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-[rgba(12,14,20,0.5)] px-1.5 py-0.5 text-[9px] leading-none text-white/85 backdrop-blur-sm">
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

// Anchored overlay element that counter-scales so it stays a readable size while
// the map zooms. Positioned by % within the transform layer, centered on its point.
function Overlay({ x, y, inv, children }: { x: number; y: number; inv: number; children: React.ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scale(${inv})` }}
    >
      {children}
    </span>
  );
}
