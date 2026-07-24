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
import { labelsForView, type GeoLabelKind } from "@/lib/maps/geo-labels";
import { MARK_TERRITORY, MARK_RULERS, territoryCities, MODERN_COUNTRIES, MODERN_BORDER_COLOR, type RulerId } from "@/lib/maps/territories";
import { SectionCard } from "@/components/chapter/SectionCard";

// The "biblical world (Levant)" clamp — [[west,south],[east,north]]. Generous
// enough for every Mark scene (and Judea/Sinai), tight enough that a reader
// can never pan out to the whole planet.
const BIBLICAL_WORLD_BOUNDS: [[number, number], [number, number]] = [
  [32.0, 28.5],
  [40.0, 35.6],
];

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
      // OWNER RULING 2026-07-23: the Esri "Boundaries and Places" raster is
      // OFF. Its words were burned into someone else's tiles — blurry at our
      // zooms, half in Hebrew, and naming modern Israeli towns (Almagor,
      // Ramot, Kahal) that have nothing to do with the chapter. Our own
      // labels replace it: crisp, ours, and chosen per view.
      // The source is left declared so the layer can be restored in one line
      // if we ever want its road/border reference back.
    ],
  };
}

/** Draw one authored place label as a bitmap. Canvas rather than a MapLibre
 * text layer on purpose: text layers need a glyph server (an external font
 * dependency we do not have), while an image label needs nothing, renders
 * crisply at device pixel ratio, and rides the same terrain-aware symbol
 * machinery the numbered pins already use. */
function labelImage(text: string, kind: GeoLabelKind): { data: ImageData; pixelRatio: number } {
  const ratio = Math.min(3, Math.ceil(window.devicePixelRatio || 1));
  const style = LABEL_STYLES[kind];
  const pad = 6;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = style.font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = style.size + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.font = style.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // A dark halo so the label survives both bright desert and dark water.
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(12,14,20,.85)";
  ctx.lineJoin = "round";
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = style.color;
  ctx.fillText(text, w / 2, h / 2);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: ratio };
}

const LABEL_STYLES: Record<GeoLabelKind, { font: string; size: number; color: string }> = {
  water: { font: "italic 600 13px system-ui, -apple-system, sans-serif", size: 13, color: "#bcd9ef" },
  river: { font: "italic 500 11px system-ui, -apple-system, sans-serif", size: 11, color: "#bcd9ef" },
  region: { font: "600 11px system-ui, -apple-system, sans-serif", size: 11, color: "#f0e6d2" },
  city: { font: "600 12px system-ui, -apple-system, sans-serif", size: 12, color: "#ffffff" },
};

/** Every place this map already names with a numbered marker. Authored
 * labels skip these so one place never appears twice under two treatments. */
function markerNames(cfg: GeoChapterMap): string[] {
  return [
    ...cfg.pins.map((p) => p.label),
    ...cfg.areas.map((a) => a.label),
    ...cfg.corridors.map((c) => c.label),
  ].map((l) => l.split("·")[0].trim());
}

/** Authored place names for the active view. Replaces the retired Esri
 * reference raster. Rebuilt whenever the view changes. */
function addLabels(map: maplibregl.Map, view: MapView, markerNames: string[]): void {
  const labels = labelsForView(view, markerNames);
  labels.forEach((l, i) => {
    const id = `selah-label-${i}`;
    if (map.hasImage(id)) map.removeImage(id);
    const img = labelImage(l.name, l.kind);
    map.addImage(id, img.data, { pixelRatio: img.pixelRatio });
  });
  // Placement priority (symbol-sort-key: LOWER places first, so it wins the
  // collision). Cities are what a reader looks for, so they rank above the
  // big region names; water sits between. Without this, region labels (first
  // in the list) claimed all the room at a zoomed-out scene view and every
  // city was dropped.
  const pri: Record<GeoLabelKind, number> = { city: 0, water: 1, river: 1, region: 2 };
  const data = {
    type: "FeatureCollection" as const,
    features: labels.map((l, i) => ({
      type: "Feature" as const,
      properties: { icon: `selah-label-${i}`, minz: l.minzoom ?? 0, maxz: l.maxzoom ?? 22, pri: pri[l.kind] },
      geometry: { type: "Point" as const, coordinates: l.at },
    })),
  };
  const src = map.getSource("place-labels") as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource("place-labels", { type: "geojson", data });
  map.addLayer({
    id: "place-labels",
    type: "symbol",
    source: "place-labels",
    layout: {
      "icon-image": ["get", "icon"],
      // Labels declutter by collision, not by a paint expression: a `zoom`
      // expression nested inside `case` is INVALID in a paint property and
      // makes addLayer throw — which silently killed the entire label layer
      // (no labels, and Then/Today updating a source nothing rendered). Zoom
      // windowing is applied per-feature via setFilter in applyLabelZoom(),
      // where the current zoom is baked in as a literal.
      "icon-allow-overlap": false,
      "icon-ignore-placement": false,
      "icon-anchor": "center",
      "symbol-sort-key": ["get", "pri"],
    },
  });
  applyLabelZoom(map);
  map.on("zoom", () => applyLabelZoom(map));
}

/** Show each label only inside its own [minz, maxz] window. Recomputed on
 * zoom with the current zoom baked in as a literal — the correct pattern,
 * since `zoom` cannot appear inside a filter or a non-interpolate paint
 * expression. */
function applyLabelZoom(map: maplibregl.Map): void {
  if (!map.getLayer("place-labels")) return;
  const z = map.getZoom();
  map.setFilter("place-labels", ["all", ["<=", ["get", "minz"], z], [">=", ["get", "maxz"], z]]);
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
/** Which world the labels describe: the chapter's, or today's.
 * Owner ruling 2026-07-23: "modern-day cities on one view and the chapter
 * cities … in the other view". */
export type MapView = "chapter" | "today";

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

/** A free-form text label bitmap in an arbitrary color, with an optional
 * filled color dot to its left. Used by the Borders overlay so a city NAME
 * carries its ruler's color (no anonymous dots to decode) and region names
 * read in the ruler hue. */
function textLabelImage(
  text: string,
  opts: { color: string; size: number; weight: number; upper?: boolean; dot?: string },
): { data: ImageData; pixelRatio: number } {
  const ratio = Math.min(3, Math.ceil(window.devicePixelRatio || 1));
  const label = opts.upper ? text.toUpperCase() : text;
  const font = `${opts.weight} ${opts.size}px system-ui, -apple-system, sans-serif`;
  const pad = 6;
  const dotW = opts.dot ? opts.size * 0.7 + 4 : 0;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const textW = Math.ceil(measure.measureText(label).width);
  const w = textW + dotW + pad * 2;
  const h = opts.size + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.font = font;
  ctx.textBaseline = "middle";
  if (opts.dot) {
    const r = opts.size * 0.32;
    ctx.beginPath();
    ctx.arc(pad + r, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = opts.dot;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.stroke();
  }
  const tx = pad + dotW;
  ctx.textAlign = "left";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(12,14,20,.9)";
  ctx.lineJoin = "round";
  ctx.strokeText(label, tx, h / 2);
  ctx.fillStyle = opts.color;
  ctx.fillText(label, tx, h / 2);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: ratio };
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

/** The Borders key: rulers with their exact titles, the cities colored to each
 * (labeled direct vs regional-inference), and the honest limit up top. */
function TerritoryKey({ view }: { view: MapView }) {
  const byRuler = (id: RulerId) => territoryCities(false).filter((c) => c.ruler === id);
  if (view === "today") {
    return (
      <div className="border-t px-3.5 py-3" style={{ borderColor: "var(--line)" }}>
        <p className="text-[13px] font-semibold text-primary">Today&rsquo;s countries</p>
        <p className="mt-1 text-[12px] leading-relaxed text-secondary">
          The dashed lines are the modern international borders (simplified),
          shown to orient the same ground you see in the chapter:{" "}
          {MODERN_COUNTRIES.map((c) => c.name.charAt(0) + c.name.slice(1).toLowerCase()).join(" · ")}.
          Contested areas are left unlabeled rather than taking a side. Switch
          to <b>Then</b> for who ruled this land in Jesus&rsquo; day.
        </p>
      </div>
    );
  }
  return (
    <div className="border-t px-3.5 py-3" style={{ borderColor: "var(--line)" }}>
      <p className="text-[13px] font-semibold text-primary">Who ruled where · {MARK_TERRITORY.dateLabel}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-secondary">
        Ancient sources name the cities, regions, and rulers — not survey-grade
        boundary lines. Each ruler has a color; a city&rsquo;s name is printed in
        its ruler&rsquo;s color, and the soft wash shows that ruler&rsquo;s general
        territory — never an exact frontier. Decapolis and Phoenician cities were
        self-governing under Roman Syria. Switch to <b>Today</b> for modern
        country borders.
      </p>
      <ul className="mt-2.5 space-y-2">
        {(Object.keys(MARK_RULERS) as RulerId[]).map((id) => {
          const r = MARK_RULERS[id];
          const cities = byRuler(id);
          if (cities.length === 0) return null;
          return (
            <li key={id} className="text-[12.5px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: r.color }} aria-hidden />
                <span className="font-semibold text-primary">{r.name}</span>
              </span>
              <span className="text-secondary">
                {" — "}
                {cities
                  .map((c) => `${c.name}${c.disputedSite ? " (area — site disputed)" : ""}${c.provenance === "regional-inference" ? " (by region)" : ""}`)
                  .join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[12px] leading-relaxed text-secondary">
        <span className="font-medium text-primary">All under Rome:</span> every
        territory on this map answered to Rome — the provinces directly, the
        tetrarchies through client rulers. (This is the Rome of the region
        shown, not the whole empire, which stretched around the Mediterranean.)
      </p>
      <p className="mt-2.5 text-[12px] leading-relaxed text-secondary">
        <span className="font-medium text-primary">Named, but not territorial rulers:</span>{" "}
        {MARK_TERRITORY.authorities.map((a) => `${a.name} — ${a.blurb}`).join("  ")}
      </p>
      <p className="mt-1 text-[11px] text-secondary">
        &ldquo;By region&rdquo; = placed from the region&rsquo;s known jurisdiction rather than a
        direct ancient assignment of that city.
      </p>
    </div>
  );
}

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

// ---- "Borders" overlay (owner's word) — who ruled where, c. AD 29-30 -------
// Codex ruler audit (2026-07-24): regions render as broad soft WASHES, never
// hard boundary strokes; Decapolis and Phoenician cities are individual pins
// under Roman Syria, never a bloc or a fade; the disputed Bethsaida site is an
// area, not a precise pin. Everything is added once (hidden) and toggled.
// Ancient (Then) borders and modern (Today) borders are separate layer sets;
// only one shows, and only while Borders is on.
const ANCIENT_LAYERS = ["territory-wash", "territory-outline-casing", "territory-outline", "territory-disputed", "territory-labels"];
const MODERN_LAYERS = ["modern-borders-casing", "modern-borders", "modern-labels"];

function addTerritory(map: maplibregl.Map): void {
  if (map.getSource("territory-regions")) return;

  // ---- Ancient: region washes + soft matching outlines ----
  const regions = {
    type: "FeatureCollection" as const,
    features: MARK_TERRITORY.regions.map((r) => ({
      type: "Feature" as const,
      properties: { color: MARK_RULERS[r.ruler].color },
      geometry: { type: "Polygon" as const, coordinates: [[...r.polygon, r.polygon[0]]] },
    })),
  };
  map.addSource("territory-regions", { type: "geojson", data: regions });
  map.addLayer({
    id: "territory-wash",
    type: "fill",
    source: "territory-regions",
    layout: { visibility: "none" },
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.24 },
  });
  // A dark casing under a BOLD colored outline — the outline is the primary
  // identity signal, so a region still reads even where its wash washes out
  // on tan desert (owner: "orange overlay does not work on desert scenes").
  map.addLayer({
    id: "territory-outline-casing",
    type: "line",
    source: "territory-regions",
    layout: { visibility: "none" },
    paint: { "line-color": "rgba(12,14,20,.55)", "line-width": 4.5 },
  });
  map.addLayer({
    id: "territory-outline",
    type: "line",
    source: "territory-regions",
    layout: { visibility: "none" },
    paint: { "line-color": ["get", "color"], "line-width": 2.4, "line-opacity": 1 },
  });

  // Disputed exact site (Bethsaida) → a dashed ring: an area, not a point.
  const disputed = territoryCities(false).filter((c) => c.disputedSite);
  map.addSource("territory-disputed", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: disputed.map((c) => ({
        type: "Feature" as const,
        properties: { color: MARK_RULERS[c.ruler].color },
        geometry: { type: "Point" as const, coordinates: c.at },
      })),
    },
  });
  map.addLayer({
    id: "territory-disputed",
    type: "circle",
    source: "territory-disputed",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": 12,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.18,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": ["get", "color"],
    },
  });

  // ---- Ancient: labels — region NAMES + city NAMES colored by ruler.
  // The color IS the key: a name in blue is Antipas's, in teal is Roman Syria.
  // No anonymous dots to decode, and the names replace them entirely.
  const labelFeatures: GeoJSON.Feature[] = [];
  MARK_TERRITORY.regions.forEach((r, i) => {
    const id = `terr-region-${i}`;
    const img = textLabelImage(r.name, { color: MARK_RULERS[r.ruler].color, size: 12, weight: 800, upper: true });
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, img.data, { pixelRatio: img.pixelRatio });
    labelFeatures.push({ type: "Feature", properties: { icon: id, pri: 0 }, geometry: { type: "Point", coordinates: r.labelAt } });
  });
  territoryCities(false).forEach((c, i) => {
    const id = `terr-city-${i}`;
    const img = textLabelImage(c.name, { color: MARK_RULERS[c.ruler].color, size: 12, weight: 700, dot: MARK_RULERS[c.ruler].color });
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, img.data, { pixelRatio: img.pixelRatio });
    labelFeatures.push({ type: "Feature", properties: { icon: id, pri: 1 }, geometry: { type: "Point", coordinates: c.at } });
  });
  map.addSource("territory-labels", { type: "geojson", data: { type: "FeatureCollection", features: labelFeatures } });
  map.addLayer({
    id: "territory-labels",
    type: "symbol",
    source: "territory-labels",
    layout: {
      visibility: "none",
      "icon-image": ["get", "icon"],
      "icon-allow-overlap": false,
      "icon-anchor": "center",
      "symbol-sort-key": ["get", "pri"],
    },
  });

  // (The "all under Rome" point is a FOOTNOTE in the key text, not a drawn
  // frame — owner ruling 2026-07-24. See TerritoryKey.)

  // ---- Modern (Today): real country boundary lines + country names ----
  map.addSource("modern-borders", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: MODERN_COUNTRIES.flatMap((c) =>
        c.borders.map((line) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } })),
      ),
    },
  });
  // Dashed border: a DASHED dark casing (so gaps show terrain and it reads as
  // a dashed line, not a solid one) with a white dash on top for contrast.
  const dash: [number, number] = [2.4, 1.9];
  map.addLayer({
    id: "modern-borders-casing",
    type: "line",
    source: "modern-borders",
    layout: { visibility: "none", "line-cap": "butt", "line-join": "round" },
    paint: { "line-color": "rgba(12,14,20,.8)", "line-width": 5, "line-dasharray": dash.map((d) => d * 0.92) as [number, number] },
  });
  map.addLayer({
    id: "modern-borders",
    type: "line",
    source: "modern-borders",
    layout: { visibility: "none", "line-cap": "butt", "line-join": "round" },
    paint: { "line-color": MODERN_BORDER_COLOR, "line-width": 2.4, "line-opacity": 1, "line-dasharray": dash },
  });
  MODERN_COUNTRIES.forEach((c, i) => {
    const id = `modern-label-${i}`;
    const img = textLabelImage(c.name, { color: "#ffffff", size: 13, weight: 800, upper: true });
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, img.data, { pixelRatio: img.pixelRatio });
  });
  map.addSource("modern-labels", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: MODERN_COUNTRIES.map((c, i) => ({ type: "Feature" as const, properties: { icon: `modern-label-${i}` }, geometry: { type: "Point" as const, coordinates: c.labelAt } })),
    },
  });
  map.addLayer({
    id: "modern-labels",
    type: "symbol",
    source: "modern-labels",
    layout: { visibility: "none", "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-anchor": "center" },
  });
}

/** Show the right border set for the current view, and get the base map out of
 * its own way while borders are on. */
function setTerritoryVisible(map: maplibregl.Map, on: boolean, view: MapView): void {
  const ancientOn = on && view === "chapter";
  const modernOn = on && view === "today";
  for (const id of ANCIENT_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", ancientOn ? "visible" : "none");
  for (const id of MODERN_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", modernOn ? "visible" : "none");
  // The chapter's own place-labels would double up with the ancient ruler
  // labels — hide them while ancient borders show. Dim the numbered pins so
  // the borders read as the foreground.
  if (map.getLayer("place-labels")) map.setLayoutProperty("place-labels", "visibility", ancientOn ? "none" : "visible");
  if (map.getLayer("pins")) map.setPaintProperty("pins", "icon-opacity", on ? 0.35 : 1);
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
  const [threeD, setThreeD] = useState(false);
  const [view, setView] = useState<MapView>("chapter");
  const [borders, setBorders] = useState(false);
  // Only chapters in the Mark era carry the territory data for now (owner
  // scoped borders to Mark first). getGeoChapterMap already base-resolves
  // revision-preview slugs.
  const hasBorders = /^mark-/.test(data.slug.replace(/-revision-preview$/u, ""));
  // The map's load handler runs once; it reads the CURRENT view through a
  // ref so a toggle before first paint is never lost.
  const viewRef = useRef<MapView>("chapter");
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
        // Owner ruling 2026-07-24: never let the map wander to the whole globe.
        // Clamp to the "biblical world (Levant)" box — Cyprus/coast to the
        // Syrian desert, Lebanon to Sinai. Widens per testament later.
        maxBounds: BIBLICAL_WORLD_BOUNDS,
        minZoom: 5.2,
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
    // Scale reference (owner: "a scaled reference of miles or kilometers…").
    // Both units so the reader gets a real sense of distance.
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 96, unit: "imperial" }), "bottom-left");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 96, unit: "metric" }), "bottom-left");
    map.on("error", (e) => console.warn("[selah-map] error:", e.error?.message ?? e));
    map.on("load", () => {
      addOverlays(map, cfg);
      addLabels(map, viewRef.current, markerNames(cfg));
      if (hasBorders) addTerritory(map);
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

  // Then / Today: swap the authored label set in place. The map itself does
  // not reload — only which names it carries.
  useEffect(() => {
    viewRef.current = view;
    const map = mapObj.current;
    if (!map || !ready || !cfg) return;
    addLabels(map, view, markerNames(cfg));
  }, [view, ready, cfg]);

  // Borders: show/hide the who-ruled-where washes and ruler-colored city dots.
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready || !hasBorders) return;
    setTerritoryVisible(map, borders, view);
  }, [borders, view, ready, hasBorders]);

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
    // Owner ruling 2026-07-24: the Journey is SELF-PACED — it flies to each
    // stop and waits. The reader taps Next/Back to move; no auto-advance.
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
          <button
            className={chip(view === "today")}
            aria-pressed={view === "today"}
            aria-label="Show today's cities instead of the chapter's places"
            onClick={() => setView((v) => (v === "chapter" ? "today" : "chapter"))}
          >
            {view === "today" ? "Today" : "Then"}
          </button>
          {hasBorders && (
            <button
              className={chip(borders)}
              aria-pressed={borders}
              aria-label="Show who ruled where, around AD 29-30"
              onClick={() => setBorders((b) => !b)}
            >
              Borders
            </button>
          )}
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
            <div role="status" aria-live="polite" className="absolute inset-x-3 bottom-8 z-10 rounded-md bg-[rgba(12,14,20,0.82)] px-3.5 py-2.5 text-white backdrop-blur-sm">
              <p className="text-[12px] font-semibold">
                {tourIdx! + 1} / {cfg.tour.length} · {activeTour.title}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/85">{activeTour.caption}</p>
              {/* Self-paced controls — the reader advances the Journey. */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTourIdx((i) => (i === null || i <= 0 ? i : i - 1))}
                  disabled={tourIdx === 0}
                  className="rounded-full border border-white/30 px-3 py-1 text-[12px] font-medium text-white disabled:opacity-40"
                >
                  ‹ Back
                </button>
                {tourIdx! < cfg.tour.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setTourIdx((i) => (i === null ? null : i + 1))}
                    className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[rgba(12,14,20,1)]"
                  >
                    Next ›
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTourIdx(null)}
                    className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[rgba(12,14,20,1)]"
                  >
                    Done
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTourIdx(null)}
                  className="ml-auto text-[12px] font-medium text-white/70"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scale reference (owner request): the scale bar sits bottom-left on
            the map; this line turns it into human terms. A day's walk in the
            ancient world is usually put near 20 miles on level ground — less
            in hills, with a family, or in heat. */}
        {!failed && (
          <p className="border-t px-3.5 py-2 text-[12px] leading-relaxed text-secondary" style={{ borderColor: "var(--line)" }}>
            <span className="font-medium text-primary">Scale:</span> the bar at
            the map&rsquo;s lower-left shows miles and kilometers. A day&rsquo;s
            walk was roughly <span className="font-medium text-primary">20 miles (32 km)</span> on
            level ground — less through hills, with children, or in heat.
          </p>
        )}

        {/* Borders key — who ruled where, with every city labeled by how we
            know its ruler (Codex audit). Renders only while Borders is on. */}
        {hasBorders && borders && !failed && <TerritoryKey view={view} />}

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
