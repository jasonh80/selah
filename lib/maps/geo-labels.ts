// AUTHORED map labels (owner ruling 2026-07-23: "replace it with our own
// text").
//
// The satellite basemap used to carry Esri's "World Boundaries and Places"
// raster on top of it. That layer is why the map read blurry and half-Hebrew:
// the words were burned into someone else's tiles at their resolution, in
// their language, naming MODERN Israeli towns — Almagor, Ramot, Kahal — that
// have nothing to do with the chapter. It is now off, and these labels take
// its place.
//
// Rules for this list:
//   · Only names that belong to the world of the text — seas, rivers, and
//     the regions the Gospels actually name.
//   · NO modern settlements. NO national borders.
//   · NO chapter places: those are the numbered markers, and duplicating them
//     here would put the same place on the map twice under two treatments.
//   · A region label is a NAME DROPPED IN AN AREA, never a boundary. We do
//     not know where Galilee stopped and the Decapolis began, and this list
//     must never imply that we do. Positions are unremarkable interior points,
//     chosen to sit away from the edges for exactly that reason.

export type GeoLabelKind = "water" | "river" | "region" | "city";

export interface GeoLabel {
  name: string;
  /** [lon, lat] — an interior point, not a centroid claim. */
  at: [number, number];
  kind: GeoLabelKind;
  /** Hide below this zoom (regions read at a distance, water up close). */
  minzoom?: number;
  /** Hide above this zoom — region names get out of the way when the reader
   * zooms into a specific place. */
  maxzoom?: number;
}

export const GEO_LABELS: GeoLabel[] = [
  // Water — the features the Gospels cross, fish, and preach beside.
  { name: "Sea of Galilee", at: [35.59, 32.8], kind: "water", maxzoom: 13 },
  { name: "Mediterranean Sea", at: [34.6, 32.7], kind: "water", maxzoom: 11 },
  { name: "Dead Sea", at: [35.47, 31.5], kind: "water", maxzoom: 11 },
  { name: "Jordan River", at: [35.56, 32.25], kind: "river", minzoom: 7, maxzoom: 12 },

  // Regions — named in the Gospels, placed as names, never as territories.
  { name: "GALILEE", at: [35.33, 32.88], kind: "region", maxzoom: 10 },
  { name: "DECAPOLIS", at: [35.98, 32.52], kind: "region", maxzoom: 10 },
  { name: "SAMARIA", at: [35.24, 32.24], kind: "region", maxzoom: 10 },
  { name: "JUDEA", at: [35.08, 31.62], kind: "region", maxzoom: 10 },
  { name: "PEREA", at: [35.72, 31.95], kind: "region", maxzoom: 10 },
  { name: "PHOENICIA", at: [35.32, 33.3], kind: "region", maxzoom: 10 },
];

// MODERN view (owner ruling 2026-07-23: "still want to see those in there, or
// at least some cities to know, kind of a frame of reference… modern-day
// cities on one view and the chapter cities in the other").
//
// Same principle, opposite list: today's cities, so a reader who knows the
// modern map can orient themselves. Authored by us for the same reason — the
// imported raster labels were blurry and half in Hebrew. Kept short: enough
// to anchor, not a road atlas.
export const MODERN_LABELS: GeoLabel[] = [
  { name: "Sea of Galilee", at: [35.59, 32.8], kind: "water", maxzoom: 13 },
  { name: "Mediterranean Sea", at: [34.6, 32.7], kind: "water", maxzoom: 11 },
  { name: "Dead Sea", at: [35.47, 31.5], kind: "water", maxzoom: 11 },
  { name: "Jordan River", at: [35.56, 32.25], kind: "river", minzoom: 7, maxzoom: 12 },

  { name: "Tiberias", at: [35.53, 32.79], kind: "city" },
  { name: "Nazareth", at: [35.3, 32.7], kind: "city" },
  { name: "Haifa", at: [34.99, 32.79], kind: "city", maxzoom: 11 },
  { name: "Safed", at: [35.5, 32.96], kind: "city" },
  { name: "Tel Aviv", at: [34.78, 32.08], kind: "city", maxzoom: 10 },
  { name: "Jerusalem", at: [35.21, 31.78], kind: "city", maxzoom: 11 },
  { name: "Amman", at: [35.93, 31.95], kind: "city", maxzoom: 10 },
  { name: "Beirut", at: [35.5, 33.89], kind: "city", maxzoom: 9 },
  { name: "Damascus", at: [36.29, 33.51], kind: "city", maxzoom: 9 },
];

/** The label set for a view. "chapter" = the world of the text; "today" = a
 * modern frame of reference. */
export function labelsForView(view: "chapter" | "today", markerNames: string[]): GeoLabel[] {
  const taken = new Set(markerNames.map((n) => n.trim().toLowerCase()));
  const list = view === "today" ? MODERN_LABELS : GEO_LABELS;
  // One place, one treatment: never label a spot the numbered markers own.
  return list.filter((l) => !taken.has(l.name.trim().toLowerCase()));
}
