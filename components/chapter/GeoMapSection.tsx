"use client";

// Real-map Maps & Places (owner decision 2026-07-17; simplified per the owner
// review 2026-07-18): MapLibre GL over free Esri World Imagery tiles with the
// Esri boundaries/places reference layer, free AWS Terrarium elevation for
// 3-D terrain, and a guided journey tour. No API keys, no metered services.
//
// Owner review decisions (2026-07-18) shaping this component:
// - ONE view: the default frame fits the WHOLE scene (every pin, area, and
//   corridor) — Big Picture/Local is gone; "Reset view" returns to the scene.
// - Place names live in a LEGEND below the map, not as on-map overlays, with
//   pin colors coordinated to the active theme.
// - Compare and the Terrain style toggle are removed (Compare queued for a
//   future rethink); Borders & cities is a default-checked checkbox.
// - Pins are native symbol layers (terrain-aware), never HTML markers — the
//   old markers anchored at sea level, so with 3-D on they visibly detached
//   from their coordinates while dragging (the owner's reported bug).
//
// Overlays render ONLY the digest-bound Prepare location entries via
// lib/maps/geo-chapter-maps.ts (verify:maps-honesty enforces the two-axis
// model: pins for known points, soft areas for regions, a broad corridor for
// probable routes, nothing for unknown/text-only). The honesty qualifiers in
// every label ("· debated", "unidentified", …) move verbatim into the legend.

import { useEffect, useRef, useState } from "react";
import { useReadingMode } from "@/components/ReadingModeProvider";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ChapterWorkup } from "@/lib/types";
import { getGeoChapterMap, type GeoChapterMap } from "@/lib/maps/geo-chapter-maps";
import { SectionCard } from "@/components/chapter/SectionCard";

const IMAGERY_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const REFERENCE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const TERRAIN_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ATTRIBUTION =
  "Imagery © Esri, Maxar, Earthstar Geographics · Terrain © Mapzen/AWS";

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
      { id: "reference", type: "raster", source: "reference", paint: { "raster-opacity": 0.92 } },
    ],
  };
}

/** The theme's colors for map overlays, read from the live CSS custom
 * properties so the pins coordinate with whatever theme is active. */
function themeColors(): { event: string; context: string } {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent-strong").trim() || "#e0594a";
  return { event: accent, context: "#8b98a7" };
}

/** Owner ruling 2026-07-23: markers must differ by SHAPE and HUE, not shade —
 * a reader should know instantly which marker is which without decoding the
 * legend. Where-it-happened = solid teardrop pin (accent); nearby landmark =
 * hollow ring (slate); debated area = amber dashed; travel = purple band. */
const AREA_FILL = "rgba(245,171,74,.18)";
const AREA_LINE = "#f5ab4a";

/** Draw one pin bitmap on a canvas in the given color (device-pixel scaled).
 * Native map images are terrain-aware through the symbol layer, unlike HTML
 * markers, so pins stay glued to their coordinates in every camera state. */
function ringImage(color: string, num: number): { data: ImageData; pixelRatio: number } {
  const ratio = Math.min(3, Math.ceil(window.devicePixelRatio || 1));
  const size = 28 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  ctx.arc(14, 14, 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16,18,26,.82)";
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), 14, 14.5);
  return { data: ctx.getImageData(0, 0, size, size), pixelRatio: ratio };
}

/** A numbered disc for an AREA or CORRIDOR — square-ish (areas) or pill
 * (corridors) so shape alone separates them from point markers. */
function badgeImage(color: string, num: number, shape: "square" | "pill"): { data: ImageData; pixelRatio: number } {
  const ratio = Math.min(3, Math.ceil(window.devicePixelRatio || 1));
  const w = 28 * ratio;
  const h = 28 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  const r = shape === "square" ? 4 : 11;
  ctx.beginPath();
  ctx.roundRect(3, 6, 22, 16, r);
  ctx.fillStyle = "rgba(16,18,26,.85)";
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = color;
  ctx.setLineDash(shape === "square" ? [3, 2] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), 14, 14.5);
  return { data: ctx.getImageData(0, 0, w, h), pixelRatio: ratio };
}

function pinImage(color: string, num: number): { data: ImageData; pixelRatio: number } {
  const ratio = Math.min(3, Math.ceil(window.devicePixelRatio || 1));
  const w = 30 * ratio;
  const h = 42 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  ctx.moveTo(15, 1);
  ctx.bezierCurveTo(7.3, 1, 1.5, 7, 1.5, 14.4);
  ctx.bezierCurveTo(1.5, 24, 15, 38, 15, 38);
  ctx.bezierCurveTo(15, 38, 28.5, 24, 28.5, 14.4);
  ctx.bezierCurveTo(28.5, 7, 22.7, 1, 15, 1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(15, 13.6, 6.4, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), 15, 14);
  return { data: ctx.getImageData(0, 0, w, h), pixelRatio: ratio };
}

// ---- Legend glyphs: SVG twins of the canvas markers above ---------------
// Owner ruling 2026-07-23: "make it the same down in the legend as it is on
// the map." Each of these mirrors its canvas counterpart — same silhouette,
// same colour source, same number inside — so the legend entry IS the marker
// rather than a generic symbol with a number typed beside it.

/** Twin of `pinImage` — the where-it-happened teardrop. */
function NumberedPin({ n }: { n: number }) {
  return (
    <svg width="15" height="21" viewBox="0 0 30 42" aria-hidden="true" className="shrink-0">
      <path
        d="M15 1 C7.3 1 1.5 7 1.5 14.4 C1.5 24 15 38 15 38 C15 38 28.5 24 28.5 14.4 C28.5 7 22.7 1 15 1 Z"
        fill="var(--accent-strong)"
        stroke="rgba(255,255,255,.9)"
        strokeWidth="1.4"
      />
      <circle cx="15" cy="13.6" r="6.4" fill="#fff" />
      <text
        x="15"
        y="14"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="bold"
        fill="var(--accent-strong)"
      >
        {n}
      </text>
    </svg>
  );
}

/** Twin of `ringImage` — the nearby-landmark ring. */
function NumberedRing({ n }: { n: number }) {
  return (
    <svg width="17" height="17" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <circle cx="14" cy="14" r="10" fill="rgba(16,18,26,.82)" stroke="#cfd8e3" strokeWidth="2.6" />
      <text x="14" y="14.5" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill="#cfd8e3">
        {n}
      </text>
    </svg>
  );
}

/** Twin of `badgeImage(…, "square")` — the debated-area dashed badge. */
function NumberedArea({ n }: { n: number }) {
  return (
    <svg width="17" height="17" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect x="3" y="6" width="22" height="16" rx="4" fill="rgba(16,18,26,.85)" stroke={AREA_LINE} strokeWidth="2.2" strokeDasharray="3 2" />
      <text x="14" y="14.5" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill={AREA_LINE}>
        {n}
      </text>
    </svg>
  );
}

/** Twin of `badgeImage(…, "pill")` — the travel-corridor pill. */
function NumberedCorridor({ n }: { n: number }) {
  return (
    <svg width="17" height="17" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect x="3" y="6" width="22" height="16" rx="11" fill="rgba(16,18,26,.85)" stroke="#a78bfa" strokeWidth="2.2" />
      <text x="14" y="14.5" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill="#a78bfa">
        {n}
      </text>
    </svg>
  );
}

/** All overlay geometry as native layers — areas, corridors, and pins. No
 * HTML markers and no on-map text: names live in the legend below. */
function addOverlays(map: maplibregl.Map, cfg: GeoChapterMap): void {
  const colors = themeColors();
  // ONE numbering across pins → areas → corridors, matching the legend order
  // below (owner ruling 2026-07-23: a reader must know instantly which marker
  // is which). Numbers are the key; shape and hue carry the role.
  let n = 0;
  const pinNums = cfg.pins.map(() => ++n);
  const areaNums = cfg.areas.map(() => ++n);
  const corridorNums = cfg.corridors.map(() => ++n);

  cfg.pins.forEach((p, i) => {
    const img = p.context === true ? ringImage("#cfd8e3", pinNums[i]) : pinImage(colors.event, pinNums[i]);
    map.addImage(`selah-pin-${i}`, img.data, { pixelRatio: img.pixelRatio });
  });
  cfg.areas.forEach((_, i) => {
    const img = badgeImage(AREA_LINE, areaNums[i], "square");
    map.addImage(`selah-area-${i}`, img.data, { pixelRatio: img.pixelRatio });
  });
  cfg.corridors.forEach((_, i) => {
    const img = badgeImage("#c4b5fd", corridorNums[i], "pill");
    map.addImage(`selah-corridor-${i}`, img.data, { pixelRatio: img.pixelRatio });
  });

  const areas = {
    type: "FeatureCollection" as const,
    features: cfg.areas.map((a) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [[...a.polygon, a.polygon[0]]] },
    })),
  };
  map.addSource("areas", { type: "geojson", data: areas });
  map.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": AREA_FILL, "fill-opacity": 1 } });
  map.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": AREA_LINE, "line-width": 2, "line-dasharray": [2, 1.6] } });

  const corridors = {
    type: "FeatureCollection" as const,
    features: cfg.corridors.map((c) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: smoothLine(c.waypoints) },
    })),
  };
  map.addSource("corridors", { type: "geojson", data: corridors });
  map.addLayer({ id: "corridor-halo", type: "line", source: "corridors", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1c1a24", "line-width": 30, "line-opacity": 0.38, "line-blur": 12 } });
  map.addLayer({ id: "corridor-core", type: "line", source: "corridors", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#a78bfa", "line-width": 8, "line-opacity": 0.7, "line-blur": 3 } });

  // numbered markers: pins at their point, area badges at the polygon's
  // centroid, corridor badges at the middle waypoint.
  const centroid = (poly: [number, number][]): [number, number] => {
    const s = poly.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1]] as [number, number], [0, 0] as [number, number]);
    return [s[0] / poly.length, s[1] / poly.length];
  };
  const markers = {
    type: "FeatureCollection" as const,
    features: [
      ...cfg.pins.map((p, i) => ({
        type: "Feature" as const,
        properties: { icon: `selah-pin-${i}`, anchor: p.context === true ? "center" : "bottom" },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
      ...cfg.areas.map((a, i) => ({
        type: "Feature" as const,
        properties: { icon: `selah-area-${i}`, anchor: "center" },
        geometry: { type: "Point" as const, coordinates: centroid(a.polygon as [number, number][]) },
      })),
      ...cfg.corridors.map((c, i) => ({
        type: "Feature" as const,
        properties: { icon: `selah-corridor-${i}`, anchor: "center" },
        geometry: { type: "Point" as const, coordinates: c.waypoints[Math.floor(c.waypoints.length / 2)] },
      })),
    ],
  };
  map.addSource("pins", { type: "geojson", data: markers });
  map.addLayer({
    id: "pins",
    type: "symbol",
    source: "pins",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": ["get", "anchor"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

/** The frame that shows the ENTIRE scene: every pin, area vertex, and
 * corridor waypoint, padded. This is the default view and "Reset view". */
function sceneBounds(cfg: GeoChapterMap): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  for (const p of cfg.pins) bounds.extend([p.lng, p.lat]);
  for (const a of cfg.areas) for (const v of a.polygon) bounds.extend(v);
  for (const c of cfg.corridors) for (const w of c.waypoints) bounds.extend(w);
  return bounds;
}

export function GeoMapSection({
  data,
  notes,
}: {
  data: ChapterWorkup;
  /** The chapter's Map Notes — rendered INSIDE this block under the key as a
   * "Dive deeper" disclosure (owner ruling 2026-07-23), never as a separate
   * card floating below the map. */
  notes?: { title: string; body: string };
}) {
  const { mode } = useReadingMode();
  const [notesOpen, setNotesOpen] = useState(mode === "deep");
  useEffect(() => {
    setNotesOpen(mode === "deep");
  }, [mode]);
  const cfg = getGeoChapterMap(data.slug);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [threeD, setThreeD] = useState(false);
  const [tourIdx, setTourIdx] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // init main map — framed on the whole scene
  useEffect(() => {
    if (!cfg || !mapRef.current || mapObj.current) return;
    const container = mapRef.current;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: baseStyle(),
        bounds: sceneBounds(cfg),
        fitBoundsOptions: { padding: 56, maxZoom: 11 },
        // One-finger page scrolling stays with the PAGE; the map asks for two
        // fingers (touch) or ctrl+scroll (desktop) — no scroll trap on a
        // full-width mobile map (PR #43 review, P1-4).
        cooperativeGestures: true,
        // Attribution renders as a permanent pill overlay (PR #43, P1-1).
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

  // Pin colors follow the ACTIVE theme: when <html data-theme> changes, the
  // pin bitmaps are rebuilt from the new --accent-strong so the map and the
  // legend can never disagree (Codex #59 review).
  useEffect(() => {
    if (!ready) return;
    const observer = new MutationObserver(() => {
      const map = mapObj.current;
      if (!map) return;
      // Theme change: redraw every NUMBERED marker so the map and the legend
      // can never disagree (Codex #59 review), numbering preserved.
      if (!cfg) return;
      const colors = themeColors();
      cfg.pins.forEach((pin, i) => {
        const id = `selah-pin-${i}`;
        const img = pin.context === true ? ringImage("#cfd8e3", i + 1) : pinImage(colors.event, i + 1);
        if (map.hasImage(id)) map.removeImage(id);
        map.addImage(id, img.data, { pixelRatio: img.pixelRatio });
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [ready]);


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

  if (!cfg) return null;

  // 13px chips (owner direction 2026-07-20: the 12px row read too small), and
  // "3-D" instead of "3-D terrain" — the owner's own trim so Reset view keeps
  // its spot on one row on phones.
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-[12px] font-medium ${on ? "text-primary" : "text-secondary"}`;
  const activeTour = tourIdx !== null ? cfg.tour[tourIdx] : null;
  const resetView = () => {
    setTourIdx(null);
    const map = mapObj.current;
    if (!map || !cfg) return;
    map.fitBounds(sceneBounds(cfg), { padding: 56, maxZoom: 11, pitch: threeD ? 55 : 0, bearing: 0, duration: 1100 });
  };

  return (
    <SectionCard
      id="maps"
      icon="🗺"
      title="Maps &amp; Places"
      bleed
      headerRight={
        <div className="flex items-center gap-1.5">
          <button className={chip(threeD)} aria-pressed={threeD} aria-label="3-D terrain" onClick={() => setThreeD((t) => !t)}>
            3-D
          </button>
          <button
            className={chip(tourIdx !== null)}
            aria-pressed={tourIdx !== null}
            onClick={() => setTourIdx(tourIdx === null ? 0 : null)}
          >
            {tourIdx === null ? "▶ Journey" : "■ Stop"}
          </button>
          <button className={chip(false)} onClick={resetView}>
            Reset
          </button>
        </div>
      }
    >
      <div className="flex flex-col">
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
          <div
            ref={mapRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            aria-label={`Interactive map of ${data.reference}`}
          />
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

        {/* Legend: names + honesty qualifiers live HERE, not on the map.
            Every label string (including "· debated" style qualifiers) renders
            verbatim from the digest-bound config. */}
        {!failed && (cfg.pins.length > 0 || cfg.areas.length > 0 || cfg.corridors.length > 0) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-3.5 py-2.5" style={{ borderColor: "var(--line)" }}>
            {/* Owner ruling 2026-07-23: the legend glyph must BE the map
                marker — the same numbered pin, not a blank pin followed by a
                separate "1.". One symbol, carrying its own number, in both
                places, so the eye matches them without translating. */}
            {cfg.pins.map((p, i) => (
              <li key={p.label} className="inline-flex items-center gap-1.5 text-[13.5px] text-secondary">
                {p.context === true ? (
                  <NumberedRing n={i + 1} />
                ) : (
                  <NumberedPin n={i + 1} />
                )}
                <span className={p.context === true ? "" : "font-medium text-primary"}>
                  {p.label}
                  {p.context === true ? " · nearby landmark" : " · where it happened"}
                </span>
              </li>
            ))}
            {cfg.areas.map((a, i) => (
              <li key={a.label} className="inline-flex items-center gap-1.5 text-[13.5px] italic text-secondary">
                <NumberedArea n={cfg.pins.length + i + 1} />
                <span>{a.label} · area, not a spot</span>
              </li>
            ))}
            {cfg.corridors.map((c, i) => (
              <li key={c.label} className="inline-flex items-center gap-1.5 text-[13.5px] italic text-secondary">
                <NumberedCorridor n={cfg.pins.length + cfg.areas.length + i + 1} />
                <span>{c.label} · the way they traveled</span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t px-3.5 py-2" style={{ borderColor: "var(--line)" }}>
          <p className="text-[13.5px] leading-snug text-secondary">{cfg.caption}</p>
        </div>
        {notes && (
          <>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className="flex w-full items-center border-t px-3.5 py-2 text-left text-[13px] font-medium text-accent-strong"
              style={{ borderColor: "var(--line)" }}
            >
              Dive deeper
              <span aria-hidden className="ml-auto text-[11px]">{notesOpen ? "⌃" : "⌄"}</span>
            </button>
            {notesOpen && (
              <div className="border-t bg-tint px-3.5 py-2.5" style={{ borderColor: "var(--line)", borderLeft: "3px solid var(--accent-strong)" }}>
                <p className="text-[13.5px] font-semibold leading-snug text-primary">{notes.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-secondary">{notes.body}</p>
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
