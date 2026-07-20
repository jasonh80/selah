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
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ChapterWorkup } from "@/lib/types";
import { getGeoChapterMap, type GeoChapterMap } from "@/lib/maps/geo-chapter-maps";

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

/** Draw one pin bitmap on a canvas in the given color (device-pixel scaled).
 * Native map images are terrain-aware through the symbol layer, unlike HTML
 * markers, so pins stay glued to their coordinates in every camera state. */
function pinImage(color: string): { data: ImageData; pixelRatio: number } {
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
  ctx.arc(15, 13.6, 4.6, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  return { data: ctx.getImageData(0, 0, w, h), pixelRatio: ratio };
}

/** All overlay geometry as native layers — areas, corridors, and pins. No
 * HTML markers and no on-map text: names live in the legend below. */
function addOverlays(map: maplibregl.Map, cfg: GeoChapterMap): void {
  const colors = themeColors();
  const eventPin = pinImage(colors.event);
  const contextPin = pinImage(colors.context);
  map.addImage("selah-pin-event", eventPin.data, { pixelRatio: eventPin.pixelRatio });
  map.addImage("selah-pin-context", contextPin.data, { pixelRatio: contextPin.pixelRatio });

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
  // deliberately nothing like a surveyed road line. Purple core over a dark
  // neutral halo (owner request, 2026-07-18): clearly visible on satellite
  // greens/tans while the blur/width keep the uncertainty styling.
  map.addLayer({ id: "corridor-halo", type: "line", source: "corridors", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1c1a24", "line-width": 30, "line-opacity": 0.38, "line-blur": 12 } });
  map.addLayer({ id: "corridor-core", type: "line", source: "corridors", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#a78bfa", "line-width": 8, "line-opacity": 0.7, "line-blur": 3 } });

  const pins = {
    type: "FeatureCollection" as const,
    features: cfg.pins.map((p) => ({
      type: "Feature" as const,
      properties: { icon: p.context === true ? "selah-pin-context" : "selah-pin-event" },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
  map.addSource("pins", { type: "geojson", data: pins });
  map.addLayer({
    id: "pins",
    type: "symbol",
    source: "pins",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": "bottom",
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

export function GeoMapSection({ data }: { data: ChapterWorkup }) {
  const cfg = getGeoChapterMap(data.slug);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [borders, setBorders] = useState(true);
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
      const colors = themeColors();
      const eventPin = pinImage(colors.event);
      const contextPin = pinImage(colors.context);
      if (map.hasImage("selah-pin-event")) map.removeImage("selah-pin-event");
      if (map.hasImage("selah-pin-context")) map.removeImage("selah-pin-context");
      map.addImage("selah-pin-event", eventPin.data, { pixelRatio: eventPin.pixelRatio });
      map.addImage("selah-pin-context", contextPin.data, { pixelRatio: contextPin.pixelRatio });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [ready]);

  // borders & cities (default on)
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;
    map.setLayoutProperty("reference", "visibility", borders ? "visible" : "none");
  }, [borders, ready]);

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
    `inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[13px] font-medium ${on ? "text-primary" : "text-secondary"}`;
  const activeTour = tourIdx !== null ? cfg.tour[tourIdx] : null;
  const resetView = () => {
    setTourIdx(null);
    const map = mapObj.current;
    if (!map || !cfg) return;
    map.fitBounds(sceneBounds(cfg), { padding: 56, maxZoom: 11, pitch: threeD ? 55 : 0, bearing: 0, duration: 1100 });
  };

  return (
    <section id="maps" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section text-primary">Maps &amp; Places</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${chip(borders)} cursor-pointer select-none`}>
            <input
              type="checkbox"
              checked={borders}
              onChange={(e) => setBorders(e.target.checked)}
              className="accent-[var(--accent-strong)]"
            />
            Borders &amp; cities
          </label>
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
            Reset view
          </button>
        </div>
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
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-4 py-2.5" style={{ borderColor: "var(--line)" }}>
            {cfg.pins.map((p) => (
              <li key={p.label} className="inline-flex items-center gap-1.5 text-[12px] text-secondary">
                <svg width="11" height="15" viewBox="0 0 30 42" aria-hidden="true">
                  <path
                    d="M15 1 C7.3 1 1.5 7 1.5 14.4 C1.5 24 15 38 15 38 C15 38 28.5 24 28.5 14.4 C28.5 7 22.7 1 15 1 Z"
                    fill={p.context === true ? "#8b98a7" : "var(--accent-strong)"}
                    stroke="rgba(255,255,255,.6)"
                    strokeWidth="2"
                  />
                  <circle cx="15" cy="13.6" r="5.5" fill="#fff" />
                </svg>
                <span className={p.context === true ? "" : "font-medium text-primary"}>{p.label}</span>
              </li>
            ))}
            {cfg.areas.map((a) => (
              <li key={a.label} className="inline-flex items-center gap-1.5 text-[12px] italic text-secondary">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-[3px]"
                  style={{ background: "rgba(120,200,255,.16)", border: "1.5px dashed #b4e1ff" }}
                />
                {a.label}
              </li>
            ))}
            {cfg.corridors.map((c) => (
              <li key={c.label} className="inline-flex items-center gap-1.5 text-[12px] italic text-secondary">
                <span
                  aria-hidden="true"
                  className="inline-block h-[5px] w-4 rounded-full"
                  style={{ background: "linear-gradient(90deg, rgba(28,26,36,.55), rgba(167,139,250,.85))" }}
                />
                {c.label}
              </li>
            ))}
          </ul>
        )}

        <div className="p-4">
          <p className="text-[12px] leading-relaxed text-secondary">{cfg.caption}</p>
        </div>
      </div>
    </section>
  );
}
