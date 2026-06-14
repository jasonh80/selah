// Per-chapter map configuration. The PRIMARY map is usually a real modern
// satellite/terrain image (answering "where is this place today?"). Selah adds
// overlays (pins, labels, soft boundaries). An optional "biblical" context mode
// swaps the overlay set. Ancient/atlas maps are opt-in per chapter, never forced.
//
// Designed so future chapters can declare a satellite/terrain map (Bethlehem,
// Galilee, Sinai…) or an atlas map (Exodus route, Paul's journeys…) as needed.

export type MapType = "satellite" | "terrain" | "atlas";
export type ContextMode = "today" | "biblical";

export interface MapPin {
  x: number; // % across the image
  y: number; // % down the image
  label: string;
}
export interface MapLabel {
  x: number;
  y: number;
  text: string;
}
export interface MapBoundary {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface MapOverlay {
  pins: MapPin[];
  labels: MapLabel[];
  boundaries?: MapBoundary[];
}

export interface ChapterMapConfig {
  primaryMapImage: string;
  primaryMapImage2x?: string;
  primaryMapType: MapType;
  attribution: string;
  caption: string;
  modes: Record<ContextMode, MapOverlay>;
}

export const CHAPTER_MAPS: Record<string, ChapterMapConfig> = {
  "psalm-23": {
    primaryMapImage: "/img/maps/judah-satellite.jpg",
    primaryMapType: "satellite",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    caption:
      "Psalm 23 is rooted in David’s shepherding world in Judah, especially the Bethlehem hill country. The psalm does not name one exact event site, so this map shows the representative landscape behind the imagery.",
    modes: {
      today: {
        pins: [
          { x: 52, y: 42, label: "Jerusalem" },
          { x: 49, y: 60, label: "Bethlehem" },
        ],
        labels: [
          { x: 24, y: 49, text: "Judean hill country" },
          { x: 84, y: 50, text: "Wilderness / valley" },
        ],
      },
      biblical: {
        pins: [{ x: 49, y: 60, label: "Bethlehem" }],
        labels: [
          { x: 31, y: 80, text: "Judah" },
          { x: 30, y: 64, text: "David’s shepherding world" },
          { x: 84, y: 50, text: "Wilderness / valley" },
        ],
        boundaries: [{ cx: 33, cy: 58, rx: 27, ry: 23 }],
      },
    },
  },
};

export function getChapterMap(slug: string): ChapterMapConfig | null {
  return CHAPTER_MAPS[slug] ?? null;
}
