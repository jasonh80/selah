"use client";

import { useRef, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import {
  getChapterMap,
  type BigPictureConfig,
  type BoundaryStyle,
  type ContextMode,
  type LocalConfig,
  type MapOverlay,
  type StreetViewConfig,
} from "@/lib/maps/chapter-maps";

// Maps & Places as a guided geography journey:
//   Big Picture  → where Israel/Judah sits in the wider biblical world
//   Local Map    → the chapter's immediate geography (interactive satellite)
//   Standing There → a future street-level view (official API only; graceful now)
type Step = "big" | "local" | "street";

export function MapsSection({
  data,
  notes,
}: {
  data: ChapterWorkup;
  /** Rendered inside this block (owner ruling 2026-07-23). */
  notes?: { title: string; body: string };
}) {
  const cfg = getChapterMap(data.slug);
  const allSteps: { id: Step; label: string; show: boolean }[] = [
    { id: "big", label: "Big Picture", show: Boolean(cfg?.bigPicture) },
    { id: "local", label: "Local Map", show: Boolean(cfg?.local) },
    { id: "street", label: "Standing There", show: Boolean(cfg?.streetView) },
  ];
  const steps = allSteps.filter((s) => s.show);
  const [step, setStep] = useState<Step>(steps[0]?.id ?? "local");

  if (!cfg || steps.length === 0) return null;

  return (
    <section id="maps" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-section text-primary">Maps &amp; Places</h2>
        <div className="inline-flex shrink-0 gap-1 rounded-full border bg-card p-1 shadow-hair">
          {steps.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              aria-pressed={step === s.id}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                step === s.id ? "bg-accent-strong text-white" : "text-secondary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2.5 text-[11px] leading-relaxed text-secondary">
        Start wide, then open <span className="font-medium text-primary">Local Map</span> to compare
        today’s geography with the biblical-context overlays.
      </p>

      {step === "big" && cfg.bigPicture && <BigPicturePanel cfg={cfg.bigPicture} reference={data.reference} />}
      {step === "local" && cfg.local && <LocalMapPanel cfg={cfg.local} reference={data.reference} />}
      {step === "street" && cfg.streetView && <StreetViewPanel cfg={cfg.streetView} />}

      {/* Map Notes ride INSIDE this block (owner ruling 2026-07-23). */}
      {notes && <MapNotesDisclosure notes={notes} />}
    </section>
  );
}

function MapNotesDisclosure({ notes }: { notes: { title: string; body: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 overflow-hidden rounded-md border bg-card shadow-hair">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center px-3.5 py-2 text-left text-[12px] font-medium text-accent-strong"
      >
        Dive deeper
        <span aria-hidden className="ml-auto text-[11px]">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <div className="border-t bg-tint px-3.5 py-2.5" style={{ borderLeft: "3px solid var(--accent-strong)" }}>
          <p className="text-[12.5px] font-semibold leading-snug text-primary">{notes.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-secondary">{notes.body}</p>
        </div>
      )}
    </div>
  );
}

// ---- shared overlay pieces -------------------------------------------------
function Anchored({ x, y, inv, children }: { x: number; y: number; inv: number; children: React.ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scale(${inv})` }}
    >
      {children}
    </span>
  );
}

function Pin({ pin, inv }: { pin: { x: number; y: number; label: string; labelSide?: "left" | "right" }; inv: number }) {
  return (
    <Anchored x={pin.x} y={pin.y} inv={inv}>
      <span className={`flex items-center gap-1.5 ${pin.labelSide === "left" ? "flex-row-reverse" : ""}`}>
        <span className="h-3 w-3 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)] ring-[3px] ring-[var(--accent-strong)]" />
        <span
          className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white"
          style={{ background: "rgba(12,14,20,0.72)", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
        >
          {pin.label}
        </span>
      </span>
    </Anchored>
  );
}

function AreaLabel({ label, inv }: { label: { x: number; y: number; text: string; tone?: "region" | "water" }; inv: number }) {
  return (
    <Anchored x={label.x} y={label.y} inv={inv}>
      <span
        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] ${
          label.tone === "water" ? "italic text-[#bfe4ff]" : "text-white"
        }`}
        style={{ background: "rgba(12,14,20,0.55)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {label.text}
      </span>
    </Anchored>
  );
}

function Compass() {
  return (
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
  );
}

// Per-style boundary look. Each boundary is drawn twice (a wider translucent
// "glow" stroke behind + a crisp stroke in front) so it reads clearly on the
// satellite without a blur filter.
function boundaryStyle(style: BoundaryStyle) {
  switch (style) {
    case "biblical-territory":
      return { stroke: "rgba(255,224,138,0.96)", glow: "rgba(255,205,110,0.30)", fill: "rgba(255,221,128,0.13)", dash: "5 3.5", w: 2.6, gw: 6.5 };
    case "modern-border":
      return { stroke: "rgba(170,228,255,0.96)", glow: "rgba(150,220,255,0.28)", fill: "rgba(130,210,255,0.10)", dash: undefined, w: 2.6, gw: 6 };
    case "tribal-allotment":
      return { stroke: "rgba(255,255,255,0.9)", glow: "rgba(255,255,255,0.2)", fill: "rgba(255,255,255,0.04)", dash: "1.5 3", w: 1.8, gw: 4.5 };
    case "empire":
      return { stroke: "rgba(206,176,255,0.85)", glow: "rgba(200,170,255,0.22)", fill: "rgba(180,150,255,0.12)", dash: "8 5", w: 2.4, gw: 7.5 };
    default:
      return { stroke: "rgba(255,255,255,0.85)", glow: "rgba(255,255,255,0.18)", fill: "rgba(255,255,255,0.06)", dash: undefined, w: 2, gw: 5 };
  }
}

function LegendGlyph({ kind }: { kind: string }) {
  if (kind === "pin") return <span className="h-2.5 w-2.5 rounded-full bg-white ring-2 ring-[var(--accent-strong)]" />;
  if (kind === "circle")
    return <span className="h-3 w-3 rounded-full" style={{ background: "rgba(120,200,255,0.3)", border: "1px solid rgba(180,225,255,0.85)" }} />;
  return (
    <svg width="20" height="6" viewBox="0 0 20 6" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="3"
        x2="19"
        y2="3"
        stroke={kind === "dashed" ? "#ffe08a" : kind === "solid" ? "#9fdcff" : "currentColor"}
        strokeWidth="2"
        strokeDasharray={kind === "dashed" ? "4 3" : kind === "path" ? "2 2.5" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MapLegend({ mode }: { mode: ContextMode }) {
  const items =
    mode === "biblical"
      ? [
          { g: "pin", t: "Specific place" },
          { g: "circle", t: "General area" },
          { g: "dashed", t: "Approx. biblical territory" },
          { g: "path", t: "Journey / distance" },
        ]
      : [
          { g: "pin", t: "Specific place" },
          { g: "solid", t: "Modern region" },
          { g: "path", t: "Journey / distance" },
        ];
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {items.map((it) => (
        <span key={it.t} className="inline-flex items-center gap-1.5 text-[10px] text-secondary">
          <LegendGlyph kind={it.g} />
          {it.t}
        </span>
      ))}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border bg-card"
      style={{ boxShadow: "0 0 0 1px var(--line), 0 14px 40px -20px var(--accent)" }}
    >
      {children}
    </div>
  );
}

// ---- Big Picture (static wide regional view) -------------------------------
function BigPicturePanel({ cfg, reference }: { cfg: BigPictureConfig; reference: string }) {
  return (
    <Frame>
      <div className="relative w-full overflow-hidden bg-card-soft" style={{ aspectRatio: "1500 / 1030" }}>
        <img src={cfg.baseMapImage} alt={`Regional map placing ${reference} in the biblical world`} className="h-full w-full object-cover" loading="lazy" />
        <span className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 80px 14px rgba(0,0,0,0.34)" }} />
        {cfg.labels.map((l) => (
          <AreaLabel key={l.text} label={l} inv={1} />
        ))}
        {cfg.pins.map((p) => (
          <Pin key={p.label} pin={p} inv={1} />
        ))}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(12,14,20,0.66)] px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
          World context
        </span>
        <Compass />
        <span className="absolute bottom-1.5 right-2 rounded bg-[rgba(12,14,20,0.5)] px-1.5 py-0.5 text-[9px] leading-none text-white/85 backdrop-blur-sm">
          {cfg.attribution}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[12px] leading-relaxed text-secondary">{cfg.caption}</p>
      </div>
    </Frame>
  );
}

// ---- Local Map (interactive: zoom/pan, Today|Biblical, scale) ---------------
const MIN_ZOOM = 1;
const MAX_ZOOM = 3.5;

function LocalMapPanel({ cfg, reference }: { cfg: LocalConfig; reference: string }) {
  const [mode, setMode] = useState<ContextMode>("today");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
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
    setPan(clamp({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }, zoom));
  }
  function onPointerUp() {
    drag.current = null;
    setGrabbing(false);
  }

  const milesPctAtZoom = (mi: number) => (mi / cfg.milesAcross) * 100 * zoom;
  const scaleMi = [10, 3, 1].find((mi) => milesPctAtZoom(mi) <= 42) ?? 1;
  const scalePct = milesPctAtZoom(scaleMi);

  return (
    <Frame>
      <div className="mb-0 flex items-center justify-end gap-1 px-3 pt-3">
        <div className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-hair">
          {(["today", "biblical"] as ContextMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                mode === m ? "bg-accent-strong text-white" : "text-secondary"
              }`}
            >
              {m === "today" ? "Today" : "Biblical Context"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 pt-2">
        <div
          ref={viewport}
          className={`relative aspect-[17/11] w-full overflow-hidden rounded-sm bg-card-soft ${zoom > 1 ? (grabbing ? "cursor-grabbing" : "cursor-grab") : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={() => zoomTo(zoom >= MAX_ZOOM ? 1 : zoom + 1)}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: drag.current ? "none" : "transform 0.16s ease-out",
            }}
          >
            <img src={cfg.baseMapImage} alt={`Satellite map of the ${reference} region`} className="h-full w-full select-none object-cover" draggable={false} loading="lazy" />
            <span className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 70px 12px rgba(0,0,0,0.34)" }} />

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              {(overlay.boundaries ?? []).map((b, i) => {
                const pts = b.coordinates.map(([x, y]) => `${x},${y}`).join(" ");
                const s = boundaryStyle(b.style);
                return (
                  <g key={`b${i}`}>
                    <polygon points={pts} fill="none" stroke={s.glow} strokeWidth={s.gw} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <polygon points={pts} fill={s.fill} stroke={s.stroke} strokeWidth={s.w} strokeDasharray={s.dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
              {overlay.regions.map((r, i) =>
                r.variant === "territory" ? (
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
                  <ellipse key={`g${i}`} cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill="rgba(120,200,255,0.22)" stroke="rgba(180,225,255,0.85)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
                ),
              )}
              {overlay.paths.map((p, i) => (
                <polyline key={`p${i}`} points={p.points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>

            {overlay.regions.filter((r) => r.label).map((r, i) => (
              <Anchored key={`rl${i}`} x={r.lx ?? r.cx} y={r.ly ?? r.cy} inv={inv}>
                <span
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                    r.variant === "territory" && r.approx ? "text-[#ffe08a]" : "text-[#bfe4ff]"
                  }`}
                  style={{ background: "rgba(12,14,20,0.6)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                >
                  {r.label}
                </span>
              </Anchored>
            ))}
            {(overlay.boundaries ?? []).filter((b) => b.labelAt).map((b, i) => (
              <Anchored key={`bl${i}`} x={b.labelAt![0]} y={b.labelAt![1]} inv={inv}>
                <span
                  className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
                  style={{
                    color: b.style === "biblical-territory" ? "#ffe08a" : "#bfe4ff",
                    background: "rgba(12,14,20,0.62)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                  }}
                >
                  {b.label}
                </span>
              </Anchored>
            ))}
            {overlay.paths.filter((p) => p.label).map((p, i) => (
              <Anchored key={`pl${i}`} x={p.lx ?? (p.points[0][0] + p.points[1][0]) / 2} y={p.ly ?? (p.points[0][1] + p.points[1][1]) / 2} inv={inv}>
                <span className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: "rgba(12,14,20,0.7)" }}>
                  {p.label}
                </span>
              </Anchored>
            ))}
            {overlay.labels.map((l) => (
              <AreaLabel key={l.text} label={l} inv={inv} />
            ))}
            {overlay.pins.map((p) => (
              <Pin key={p.label} pin={p} inv={inv} />
            ))}
          </div>

          <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(12,14,20,0.66)] px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {mode === "today" ? "Modern view" : "Biblical context"}
          </span>
          <Compass />

          <div className="absolute bottom-2.5 right-2.5 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-[rgba(12,14,20,0.62)] text-white shadow backdrop-blur-sm">
            <button onClick={() => zoomTo(zoom + 0.5)} aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center text-lg leading-none hover:bg-white/10">+</button>
            <button onClick={() => zoomTo(zoom - 0.5)} aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center border-t border-white/15 text-lg leading-none hover:bg-white/10">−</button>
            <button onClick={reset} aria-label="Reset view" className="flex h-8 w-8 items-center justify-center border-t border-white/15 text-[10px] font-semibold hover:bg-white/10">⟳</button>
          </div>

          <div className="absolute bottom-3 left-2.5 select-none">
            <div className="relative h-2 border-x border-b border-white" style={{ width: `${scalePct}%`, minWidth: 26 }}>
              <span className="absolute -top-4 left-0 whitespace-nowrap text-[10px] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                {scaleMi} mi
              </span>
            </div>
          </div>

          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-[rgba(12,14,20,0.5)] px-1.5 py-0.5 text-[9px] leading-none text-white/85 backdrop-blur-sm">
            {cfg.attribution}
          </span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-secondary">{cfg.caption}</p>
        <MapLegend mode={mode} />
      </div>
    </Frame>
  );
}

// ---- Standing There Today (gated / graceful roadmap) -----------------------
function StreetViewPanel({ cfg }: { cfg: StreetViewConfig }) {
  const available = cfg.status === "available";
  return (
    <Frame>
      <div className="relative flex aspect-[17/11] w-full flex-col items-center justify-center bg-card-soft px-6 text-center">
        <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 0%, var(--tint), transparent 70%)" }} />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-card text-accent-strong shadow-hair">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <p className="relative mt-3 text-card-title text-primary">Standing There Today</p>
        <p className="relative mt-1.5 max-w-md text-[12px] leading-relaxed text-secondary">{cfg.caption}</p>
        {!available && (
          <p className="relative mt-2 max-w-md text-[11px] leading-relaxed text-secondary/80">
            A street-level view will appear here through the official Google Street View API. Coverage is
            checked first; it shows only where imagery actually exists, with attribution.
          </p>
        )}
      </div>
      {cfg.attribution && (
        <div className="px-4 py-3">
          <p className="text-[11px] text-secondary">{cfg.attribution}</p>
        </div>
      )}
    </Frame>
  );
}
