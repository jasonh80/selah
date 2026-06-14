// Per-chapter map configuration. PRIMARY map is real modern satellite/terrain
// imagery (answering "where is this place today?"). Selah adds overlays using
// CERTAINTY TYPES so we never imply false precision:
//   pin       = a known specific place
//   glow      = a general area (soft translucent region)
//   territory = a kingdom / region (soft shaded outline, may be approximate)
//   path      = movement / distance between places (dotted line)
//
// A visual-only Today | Biblical Context mode swaps the overlay set while the
// satellite base, crop, zoom, orientation and compass stay identical.
// Coordinates are percentages of the image (x = across, y = down).

export type MapType = "satellite" | "terrain" | "atlas";
export type ContextMode = "today" | "biblical";

export interface MapPin {
  x: number;
  y: number;
  label: string;
}
export interface MapLabel {
  x: number;
  y: number;
  text: string;
  tone?: "region" | "water";
}
export interface MapRegion {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  variant: "glow" | "territory";
  label?: string;
  lx?: number; // label position (defaults to cx/cy)
  ly?: number;
  approx?: boolean;
}
export interface MapPath {
  points: [number, number][];
  label?: string;
  lx?: number;
  ly?: number;
}
export interface MapOverlay {
  pins: MapPin[];
  labels: MapLabel[];
  regions: MapRegion[];
  paths: MapPath[];
}

export interface ChapterMapConfig {
  primaryMapImage: string;
  primaryMapType: MapType;
  attribution: string;
  caption: string;
  milesAcross: number; // real-world width of the image, for the scale bar
  modes: Record<ContextMode, MapOverlay>;
}

// Bethlehem↔Jerusalem path reused in both modes (≈ 6 mi).
const BETHLEHEM: [number, number] = [48.9, 60.2];
const JERUSALEM: [number, number] = [52.2, 41.7];
const SIX_MILE: MapPath = { points: [BETHLEHEM, JERUSALEM], label: "≈ 6 mi", lx: 57, ly: 50 };

export const CHAPTER_MAPS: Record<string, ChapterMapConfig> = {
  "psalm-23": {
    primaryMapImage: "/img/maps/judah-satellite.jpg",
    primaryMapType: "satellite",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    // image spans ~0.526° lon at ~31.7°N ≈ 31 miles across
    milesAcross: 31,
    caption:
      "Psalm 23 does not name one exact event site. This map shows the representative landscape of David’s shepherding world in Judah.",
    modes: {
      today: {
        pins: [
          { x: JERUSALEM[0], y: JERUSALEM[1], label: "Jerusalem" },
          { x: BETHLEHEM[0], y: BETHLEHEM[1], label: "Bethlehem" },
        ],
        labels: [
          { x: 86, y: 48, text: "Wilderness / valley", tone: "region" },
          { x: 88, y: 86, text: "Dead Sea", tone: "water" },
        ],
        regions: [
          {
            cx: 42,
            cy: 55,
            rx: 34,
            ry: 33,
            variant: "territory",
            label: "Judean Hills region",
            lx: 21,
            ly: 30,
            approx: false,
          },
        ],
        paths: [SIX_MILE],
      },
      biblical: {
        pins: [
          { x: JERUSALEM[0], y: JERUSALEM[1], label: "Jerusalem" },
          { x: BETHLEHEM[0], y: BETHLEHEM[1], label: "Bethlehem" },
        ],
        labels: [{ x: 86, y: 48, text: "Wilderness / valley", tone: "region" }],
        regions: [
          {
            cx: 46,
            cy: 60,
            rx: 42,
            ry: 37,
            variant: "territory",
            label: "Judah (approx.)",
            lx: 67,
            ly: 82,
            approx: true,
          },
          {
            cx: 33,
            cy: 64,
            rx: 22,
            ry: 17,
            variant: "glow",
            label: "David’s shepherding world",
            lx: 30,
            ly: 80,
          },
        ],
        paths: [SIX_MILE],
      },
    },
  },
};

export function getChapterMap(slug: string): ChapterMapConfig | null {
  return CHAPTER_MAPS[slug] ?? null;
}
