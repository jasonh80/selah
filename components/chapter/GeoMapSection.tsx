"use client";

// Real-map Maps & Places (owner decision 2026-07-17): MapLibre GL over free
// Esri World Imagery tiles with the Esri boundaries/places reference layer,
// free AWS Terrarium elevation for 3-D terrain, a guided journey tour, and a
// Today/Terrain swipe compare. No API keys, no metered services.
//
// Overlays render ONLY the digest-bound Prepare location entries via
// lib/maps/geo-chapter-maps.ts (verify:maps-honesty enforces the two-axis
// model: pins for known points, soft areas for regions, a broad corridor for
// probable routes, nothing for unknown/text-only).

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ChapterWorkup } from "@/lib/types";
import {
  getGeoChapterMap,
  type GeoChapterMap,
  type GeoPin,
} from "@/lib/maps/geo-chapter-maps";

const IMAGERY_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const REFERENCE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const TERRAIN_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ATTRIBUTION =
  "Imagery © Esri, Maxar, Earthstar Geographics · Terrain © Mapzen/AWS";

type Mode = "today" | "terrain";

/** Catmull-Rom smoothing through corridor waypoints so the sweep reads as a
 * broad gesture, never a surveyed road line. */
function smoothLine(points: [number, number][], per = 12): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let t = 0; t < per; t++) {
      const s = t / per;
      const s2 = s * s;
      const s3 = s2 * s;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function baseStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: { type: "raster", tiles: [IMAGERY_TILES], tileSize: 256, attribution: ATTRIBUTION, maxzoom: 18 },
      reference: { type: "raster", tiles: [REFERENCE_TILES], tileSize: 256, maxzoom: 12 },
      dem: { type: "raster-dem", tiles: [TERRAIN_TILES], encoding: "terrarium", tileSize: 256, maxzoom: 13 },
    },
    layers: [
      { id: "imagery", type: "raster", source: "imagery" },
      { id: "hillshade", type: "hillshade", source: "dem", layout: { visibility: "none" }, paint: { "hillshade-exaggeration": 0.45 } },
      { id: "reference", type: "raster", source: "reference", paint: { "raster-opacity": 0.92 } },
    ],
  };
}

function pinElement(pin: GeoPin): HTMLElement {
  const left = pin.labelSide === "left";
  const el = document.createElement("div");
  el.setAttribute("aria-label", pin.label);
  el.style.cssText = "position:relative;width:30px;height:41px;filter:drop-shadow(0 5px 3px rgba(0,0,0,.45));";
  const gid = `selah-pin-${Math.random().toString(36).slice(2, 9)}`;
  const ctx = pin.context === true;
  el.innerHTML = `
    <svg width="30" height="41" viewBox="0 0 30 42" style="display:block;overflow:visible" aria-hidden="true">
      <defs><radialGradient id="${gid}" cx="35%" cy="28%" r="80%">
        <stop offset="0%" stop-color="${ctx ? "#9aa9b8" : "#ff8a70"}"/>
        <stop offset="45%" stop-color="${ctx ? "#5d7185" : "#e0594a"}"/>
        <stop offset="100%" stop-color="${ctx ? "#3c4c5c" : "#9c2f24"}"/>
      </radialGradient></defs>
      <path d="M15 1 C7.3 1 1.5 7 1.5 14.4 C1.5 24 15 38 15 38 C15 38 28.5 24 28.5 14.4 C28.5 7 22.7 1 15 1 Z"
        fill="url(#${gid})" stroke="rgba(255,255,255,.9)" stroke-width="1.4"/>
      <circle cx="15" cy="13.6" r="4.6" fill="#fff"/>
      <ellipse cx="10.5" cy="6.5" rx="4" ry="2.4" fill="rgba(255,255,255,.35)" transform="rotate(-28 10.5 6.5)"/>
    </svg>
    <span style="position:absolute;${left ? "right:34px" : "left:34px"};top:3px;white-space:nowrap;font-size:11px;font-weight:${ctx ? 600 : 700};
      color:${ctx ? "rgba(255,255,255,.85)" : "#fff"};background:rgba(12,14,20,.72);padding:2px 8px;border-radius:999px;
      text-shadow:0 1px 2px rgba(0,0,0,.8)">${pin.label}</span>`;
  return el;
}

function areaLabelElement(text: string, warm = false): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `white-space:nowrap;font-size:10.5px;font-weight:600;font-style:italic;color:${warm ? "#ffe4a8" : "#dbeeff"};background:rgba(12,14,20,.6);padding:2px 8px;border-radius:999px;`;
  el.textContent = text;
  return el;
}

function addOverlays(map: maplibregl.Map, cfg: GeoChapterMap): maplibregl.Marker[] {
  const markers: maplibregl.Marker[] = [];
  const areas = {
    type: "FeatureCollection" as const,
    features: cfg.areas.map((a) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [[...a.polygon, a.polygon[0]]] },
    })),
  };
  map.addSource("areas", { type: "geojson", data: areas });
  map.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": "#78c8ff", "fill-opacity": 0.16 } });
  map.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": "#b4e1ff", "line-width": 2, "line-dasharray": [2, 1.6] } });

  const corridors = {
    type: "FeatureCollection" as const,
    features: cfg.corridors.map((c) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: smoothLine(c.waypoints) },
    })),
  };
  map.addSource("corridors", { type: "geojson", data: corridors });
  // A broad, soft, blurred band — reads as "they moved this general way",
  // deliberately nothing like a surveyed road line.
  map.addLayer({ id: "corridor-halo", type: "line", source: "corridors", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffd98a", "line-width": 30, "line-opacity": 0.3, "line-blur": 12 } });
  map.addLayer({ id: "corridor-core", type: "line", source: "corridors", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffe4a8", "line-width": 8, "line-opacity": 0.55, "line-blur": 3 } });

  for (const a of cfg.areas) {
    markers.push(new maplibregl.Marker({ element: areaLabelElement(a.label), anchor: "center" }).setLngLat(a.labelAt).addTo(map));
  }
  for (const c of cfg.corridors) {
    markers.push(new maplibregl.Marker({ element: areaLabelElement(c.label, true), anchor: "center" }).setLngLat(c.labelAt).addTo(map));
  }
  for (const p of cfg.pins) {
    markers.push(new maplibregl.Marker({ element: pinElement(p), anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
  }
  return markers;
}

function applyMode(map: maplibregl.Map, mode: Mode, borders: boolean): void {
  // "Terrain" is honest: today's satellite imagery with hillshade emphasis
  // and reduced saturation so the LANDFORM reads — it is not (and never
  // claims to be) a biblical-era map (PR #43 review, P1-3).
  const terrain = mode === "terrain";
  map.setLayoutProperty("reference", "visibility", !terrain && borders ? "visible" : "none");
  map.setLayoutProperty("hillshade", "visibility", terrain ? "visible" : "none");
  map.setPaintProperty("imagery", "raster-saturation", terrain ? -0.45 : 0);
}

export function GeoMapSection({ data }: { data: ChapterWorkup }) {
  const cfg = getGeoChapterMap(data.slug);
  const mapRef = useRef<HTMLDivElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const compareObj = useRef<maplibregl.Map | null>(null);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mode, setMode] = useState<Mode>("today");
  const [view, setView] = useState<"big" | "local">("local");
  const [borders, setBorders] = useState(true);
  const [threeD, setThreeD] = useState(false);
  const [compare, setCompare] = useState(false);
  const [swipe, setSwipe] = useState(0.5);
  const [tourIdx, setTourIdx] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // init main map
  useEffect(() => {
    if (!cfg || !mapRef.current || mapObj.current) return;
    const container = mapRef.current;
    const localView = cfg.views.local;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: baseStyle(),
        center: localView.center,
        zoom: localView.zoom,
        // One-finger page scrolling stays with the PAGE; the map asks for two
        // fingers (touch) or ctrl+scroll (desktop) — no scroll trap on a
        // full-width mobile map (PR #43 review, P1-4).
        cooperativeGestures: true,
        // Attribution renders as a permanent pill overlay (never clipped by
        // compare mode) — see below (PR #43 review, P1-1).
        attributionControl: false,
      });
    } catch {
      // No WebGL (or map init failed): show the honest fallback panel
      // instead of a dead black frame (PR #43, P2).
      setFailed(true);
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    map.on("error", (e) => console.warn("[selah-map] error:", e.error?.message ?? e));
    map.on("load", () => {
      addOverlays(map, cfg);
      applyMode(map, "today", true);
      map.resize();
      setReady(true);
    });
    // The section mounts inside a page that is still laying out — keep the
    // canvas matched to its container.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    mapObj.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapObj.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.slug]);

  // mode / borders
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;
    applyMode(map, compare ? "today" : mode, borders);
  }, [mode, borders, ready, compare]);

  // 3-D terrain
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;
    if (threeD) {
      map.setTerrain({ source: "dem", exaggeration: 1.4 });
      map.easeTo({ pitch: 55, duration: 700 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  }, [threeD, ready]);

  // big/local view
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready || !cfg || tourIdx !== null) return;
    const v = cfg.views[view];
    map.flyTo({ center: v.center, zoom: v.zoom, pitch: threeD ? 55 : (v.pitch ?? 0), bearing: v.bearing ?? 0, duration: 1100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, ready]);

  // journey tour
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready || !cfg || tourIdx === null) return;
    const stop = cfg.tour[tourIdx];
    if (!stop) {
      setTourIdx(null);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opts = { center: stop.center, zoom: stop.zoom, pitch: stop.pitch ?? 0, bearing: stop.bearing ?? 0 };
    if (reduced) map.jumpTo(opts);
    else map.flyTo({ ...opts, duration: 2600 });
    tourTimer.current = setTimeout(() => setTourIdx((i) => (i === null ? null : i + 1)), reduced ? 4500 : 7000);
    return () => {
      if (tourTimer.current) clearTimeout(tourTimer.current);
    };
  }, [tourIdx, ready, cfg]);

  // compare: second (biblical) map underneath, synced to the main one
  useEffect(() => {
    const main = mapObj.current;
    if (!compare || !main || !compareRef.current || !cfg) return;
    const under = new maplibregl.Map({
      container: compareRef.current,
      style: baseStyle(),
      center: main.getCenter(),
      zoom: main.getZoom(),
      pitch: main.getPitch(),
      bearing: main.getBearing(),
      interactive: false,
      attributionControl: false,
    });
    under.on("load", () => {
      addOverlays(under, cfg);
      applyMode(under, "terrain", false);
      // Keep elevation aligned across the two layers when 3-D is on, so the
      // swipe seam never shows two different ground heights (PR #43, P2).
      if (threeD) under.setTerrain({ source: "dem", exaggeration: 1.4 });
      under.resize();
    });
    const sync = () => {
      under.jumpTo({
        center: main.getCenter(),
        zoom: main.getZoom(),
        pitch: main.getPitch(),
        bearing: main.getBearing(),
      });
    };
    main.on("move", sync);
    const ro = new ResizeObserver(() => under.resize());
    ro.observe(compareRef.current);
    compareObj.current = under;
    return () => {
      ro.disconnect();
      main.off("move", sync);
      under.remove();
      compareObj.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, cfg, threeD]);

  if (!cfg) return null;

  const seg = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[12px] font-medium transition ${on ? "bg-accent-strong text-white" : "text-secondary"}`;
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium ${on ? "text-primary" : "text-secondary"}`;
  const activeTour = tourIdx !== null ? cfg.tour[tourIdx] : null;

  return (
    <section id="maps" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-section text-primary">Maps &amp; Places</h2>
        <div className="inline-flex shrink-0 gap-1 rounded-full border bg-card p-1 shadow-hair">
          <button className={seg(view === "big")} aria-pressed={view === "big"} onClick={() => { setTourIdx(null); setView("big"); }}>
            Big Picture
          </button>
          <button className={seg(view === "local")} aria-pressed={view === "local"} onClick={() => { setTourIdx(null); setView("local"); }}>
            Local
          </button>
        </div>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {!compare && (
          <div className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-hair">
            <button className={seg(mode === "today")} aria-pressed={mode === "today"} onClick={() => setMode("today")}>
              Today
            </button>
            <button className={seg(mode === "terrain")} aria-pressed={mode === "terrain"} onClick={() => setMode("terrain")}>
              Terrain
            </button>
          </div>
        )}
        <button className={chip(borders)} aria-pressed={borders} onClick={() => setBorders((b) => !b)}>
          Borders &amp; cities
        </button>
        <button className={chip(threeD)} aria-pressed={threeD} onClick={() => setThreeD((t) => !t)}>
          3-D terrain
        </button>
        <button className={chip(compare)} aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
          Compare
        </button>
        <button
          className={chip(tourIdx !== null)}
          aria-pressed={tourIdx !== null}
          onClick={() => setTourIdx(tourIdx === null ? 0 : null)}
        >
          {tourIdx === null ? "▶ Journey" : "■ Stop"}
        </button>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-md border bg-card"
        style={{ boxShadow: "0 0 0 1px var(--line), 0 14px 40px -20px var(--accent)" }}
      >
        {failed && (
          <div className="flex items-center justify-center p-8 text-center" style={{ aspectRatio: "4 / 3" }}>
            <p className="max-w-[40ch] text-[13px] leading-relaxed text-secondary">
              The interactive map needs graphics support your browser did not
              provide. The chapter's places are described in the caption below.
            </p>
          </div>
        )}
        <div className="relative w-full" style={failed ? { display: "none" } : { aspectRatio: "4 / 3" }}>
          {/* maplibre-gl.css forces position:relative on map containers, so
              position them with inline styles (which win over the stylesheet). */}
          {compare && (
            <div ref={compareRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true" />
          )}
          <div
            ref={mapRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              ...(compare ? { clipPath: `inset(0 ${100 - swipe * 100}% 0 0)` } : {}),
            }}
            aria-label={`Interactive map of ${data.reference}`}
          />
          {compare && (
            <>
              <div
                className="pointer-events-none absolute bottom-0 top-0 w-[2px] bg-white/90"
                style={{ left: `${swipe * 100}%` }}
                aria-hidden="true"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={swipe * 100}
                onChange={(e) => setSwipe(Number(e.target.value) / 100)}
                aria-label="Swipe between today and terrain views"
                className="absolute left-3 right-3 top-2 z-10 accent-[var(--accent-strong)]"
              />
              <span className="absolute left-2.5 bottom-2.5 rounded-full bg-[rgba(12,14,20,0.66)] px-2.5 py-0.5 text-[11px] font-semibold text-white">Today</span>
              <span className="absolute right-2.5 bottom-6 rounded-full bg-[rgba(12,14,20,0.66)] px-2.5 py-0.5 text-[11px] font-semibold text-white">Terrain</span>
            </>
          )}
          <span
            className="pointer-events-none absolute bottom-1.5 right-2 z-20 rounded bg-[rgba(12,14,20,0.55)] px-1.5 py-0.5 text-[9px] leading-none text-white/85"
            aria-hidden="true"
          >
            {ATTRIBUTION}
          </span>
          {activeTour && (
            <div role="status" aria-live="polite" className="absolute inset-x-3 bottom-8 z-10 rounded-md bg-[rgba(12,14,20,0.78)] px-3.5 py-2.5 text-white backdrop-blur-sm">
              <p className="text-[12px] font-semibold">
                {tourIdx! + 1} / {cfg.tour.length} · {activeTour.title}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/85">{activeTour.caption}</p>
            </div>
          )}
        </div>
        <div className="p-4">
          <p className="text-[12px] leading-relaxed text-secondary">{cfg.caption}</p>
        </div>
      </div>
    </section>
  );
}
