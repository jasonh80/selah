// Per-chapter map configuration — a guided geography journey across 3 levels:
//   bigPicture  → where is this in the wider biblical world?
//   local       → the chapter's immediate geography (interactive satellite)
//   streetView  → what would it look like standing there today? (gated/roadmap)
//
// All imagery is licensed/official (Esri World Imagery; Street View only via the
// official API when a key is provided). Overlays use CERTAINTY TYPES so we never
// imply false precision: pin (specific place), glow (general area), territory
// (kingdom/region, may be approximate), path (movement/distance).
// Coordinates are percentages of the base image (x across, y down).

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
  lx?: number;
  ly?: number;
  approx?: boolean;
}
export interface MapPath {
  points: [number, number][];
  label?: string;
  lx?: number;
  ly?: number;
}
// Curated boundary/territory layer. Coordinates are authored in IMAGE space
// (percent of the base image) for now; the same shape maps cleanly to GeoJSON
// lat/lng later (a geo→image projection using the map's bbox is all that's
// needed to move these to a Google/Mapbox/Esri Data Layer).
export type BoundaryCertainty = "known" | "approximate" | "traditional" | "representative";
export type BoundaryStyle =
  | "modern-border" // crisp cool line — modern regional context
  | "biblical-territory" // warm dashed/glowing line — kingdom/region (approx.)
  | "tribal-allotment" // thin dotted line
  | "empire" // broad translucent region
  | "soft-region"; // soft translucent area

export interface BoundaryOverlay {
  id: string;
  label: string;
  era?: string;
  certainty: BoundaryCertainty;
  geometryType: "polygon" | "line" | "region";
  /** Authored as [x%, y%] of the base image. (Swap for GeoJSON lat/lng later.) */
  coordinates: Array<[number, number]>;
  style: BoundaryStyle;
  labelAt?: [number, number];
  caption?: string;
}

export interface MapOverlay {
  pins: MapPin[];
  labels: MapLabel[];
  regions: MapRegion[];
  paths: MapPath[];
  boundaries?: BoundaryOverlay[];
}

export interface BigPictureConfig {
  baseMapImage: string;
  attribution: string;
  caption: string;
  pins: MapPin[];
  labels: MapLabel[];
  regions: MapRegion[];
}

export interface LocalConfig {
  baseMapImage: string;
  attribution: string;
  caption: string;
  milesAcross: number;
  modes: Record<ContextMode, MapOverlay>;
}

export interface StreetViewConfig {
  status: "roadmap" | "available" | "unavailable";
  provider: "google-street-view";
  location: { lat: number; lng: number };
  heading?: number;
  pitch?: number;
  caption: string;
  attribution?: string;
}

export interface ChapterMapConfig {
  bigPicture?: BigPictureConfig;
  local?: LocalConfig;
  streetView?: StreetViewConfig;
}

const ESRI = "Imagery © Esri, Maxar, Earthstar Geographics";

// Bethlehem↔Jerusalem path reused in both local modes (≈ 6 mi).
const BETHLEHEM: [number, number] = [48.9, 60.2];
const JERUSALEM: [number, number] = [52.2, 41.7];
const SIX_MILE: MapPath = { points: [BETHLEHEM, JERUSALEM], label: "≈ 6 mi", lx: 57, ly: 50 };

export const CHAPTER_MAPS: Record<string, ChapterMapConfig> = {
  "psalm-23": {
    bigPicture: {
      baseMapImage: "/img/maps/levant-region.jpg",
      attribution: ESRI,
      caption:
        "Israel and Judah sit at the crossroads of the biblical world — between Egypt and the Nile to the southwest, the Mediterranean to the west, and Mesopotamia and the Arabian wilderness to the east.",
      pins: [{ x: 40, y: 54, label: "Jerusalem" }],
      labels: [
        { x: 18, y: 25, text: "Mediterranean Sea", tone: "water" },
        { x: 12, y: 73, text: "Egypt · Nile", tone: "region" },
        { x: 31, y: 78, text: "Sinai", tone: "region" },
        { x: 34, y: 48, text: "Israel · Judah", tone: "region" },
        { x: 44, y: 58, text: "Dead Sea", tone: "water" },
        { x: 42, y: 44, text: "Sea of Galilee", tone: "water" },
        { x: 79, y: 36, text: "→ Mesopotamia", tone: "region" },
        { x: 67, y: 85, text: "Arabian wilderness", tone: "region" },
      ],
      regions: [],
    },

    local: {
      baseMapImage: "/img/maps/judah-satellite.jpg",
      attribution: ESRI,
      caption:
        "Psalm 23 does not name one exact event site. This map shows the representative landscape of David’s shepherding world in Judah.",
      milesAcross: 31,
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
          regions: [],
          paths: [SIX_MILE],
          boundaries: [
            {
              id: "judean-highlands",
              label: "Judean Highlands",
              certainty: "representative",
              geometryType: "region",
              style: "modern-border",
              labelAt: [22, 28],
              coordinates: [
                [26, 30], [52, 24], [64, 34], [66, 58], [54, 76], [30, 78], [18, 54],
              ],
            },
          ],
        },
        biblical: {
          pins: [
            { x: JERUSALEM[0], y: JERUSALEM[1], label: "Jerusalem" },
            { x: BETHLEHEM[0], y: BETHLEHEM[1], label: "Bethlehem" },
          ],
          labels: [{ x: 86, y: 48, text: "Wilderness / valley", tone: "region" }],
          // soft filled circle — David's shepherding world (distinct from territory)
          regions: [
            { cx: 33, cy: 64, rx: 22, ry: 17, variant: "glow", label: "David’s shepherding world", lx: 30, ly: 81 },
          ],
          paths: [SIX_MILE],
          boundaries: [
            {
              id: "davidic-judah",
              label: "Davidic Judah · approx.",
              era: "c. 1000 BC",
              certainty: "approximate",
              geometryType: "polygon",
              style: "biblical-territory",
              labelAt: [63, 27],
              coordinates: [
                [28, 28], [50, 22], [66, 30], [72, 55], [66, 82], [45, 92], [22, 84], [14, 55],
              ],
            },
          ],
        },
      },
    },

    streetView: {
      status: "roadmap",
      provider: "google-street-view",
      location: { lat: 31.7054, lng: 35.2042 }, // representative — Bethlehem hill country
      caption:
        "Representative modern view near the Bethlehem hill country — not an exact Psalm 23 event site.",
      attribution: "Google Street View (official API, planned)",
    },
  },

  "mark-6": {
    bigPicture: {
      baseMapImage: "/img/maps/levant-region.jpg",
      attribution: ESRI,
      caption:
        "Mark 6 unfolds in Galilee — the northern region around the inland Sea of Galilee, Jesus’ home turf for much of His ministry.",
      pins: [
        { x: 42, y: 44, label: "Galilee" },
        { x: 40, y: 54, label: "Jerusalem" },
      ],
      labels: [
        { x: 18, y: 25, text: "Mediterranean Sea", tone: "water" },
        { x: 34, y: 48, text: "Israel · Judah", tone: "region" },
        { x: 44, y: 58, text: "Dead Sea", tone: "water" },
        { x: 79, y: 36, text: "→ Mesopotamia", tone: "region" },
      ],
      regions: [],
    },

    local: {
      baseMapImage: "/img/maps/galilee-satellite.jpg",
      attribution: ESRI,
      caption:
        "The chapter moves around the Sea of Galilee: Nazareth in the hills, the wilderness feeding on the shore, a night crossing toward Bethsaida, and a landing at Gennesaret. The feeding site is shown as an approximate area, not an exact pin.",
      milesAcross: 35,
      modes: {
        today: {
          pins: [
            { x: 24.7, y: 77.3, label: "Nazareth" },
            { x: 70.8, y: 37.6, label: "Capernaum" },
            { x: 61.7, y: 45.6, label: "Gennesaret" },
            { x: 80.2, y: 31.1, label: "Bethsaida" },
          ],
          labels: [{ x: 74, y: 55, text: "Sea of Galilee", tone: "water" }],
          regions: [],
          paths: [],
          boundaries: [
            {
              id: "galilee-region",
              label: "Galilee",
              certainty: "representative",
              geometryType: "region",
              style: "modern-border",
              labelAt: [30, 18],
              coordinates: [
                [12, 22], [86, 20], [93, 50], [74, 82], [30, 86], [9, 52],
              ],
            },
          ],
        },
        biblical: {
          pins: [
            { x: 24.7, y: 77.3, label: "Nazareth" },
            { x: 70.8, y: 37.6, label: "Capernaum" },
            { x: 61.7, y: 45.6, label: "Gennesaret" },
            { x: 80.2, y: 31.1, label: "Bethsaida" },
          ],
          labels: [{ x: 74, y: 55, text: "Sea of Galilee", tone: "water" }],
          regions: [
            {
              cx: 66,
              cy: 40,
              rx: 9,
              ry: 7,
              variant: "glow",
              label: "Feeding of the 5,000 · approx.",
              lx: 52,
              ly: 31,
              approx: true,
            },
          ],
          paths: [
            { points: [[66, 41], [80, 32]], label: "set out for Bethsaida", lx: 88, ly: 28 },
            { points: [[80, 32], [62, 46]], label: "blown to Gennesaret", lx: 48, ly: 52 },
          ],
          boundaries: [
            {
              id: "galilee-ministry",
              label: "Galilee · Jesus’ ministry world",
              certainty: "representative",
              geometryType: "region",
              style: "biblical-territory",
              labelAt: [30, 18],
              coordinates: [
                [12, 22], [86, 20], [93, 50], [74, 82], [30, 86], [9, 52],
              ],
            },
          ],
        },
      },
    },

    streetView: {
      status: "roadmap",
      provider: "google-street-view",
      location: { lat: 32.8807, lng: 35.5758 }, // representative — NW shore near Capernaum
      caption:
        "Representative modern view on the northwest shore of the Sea of Galilee — not an exact Mark 6 event site.",
      attribution: "Google Street View (official API, planned)",
    },
  },
};

export function getChapterMap(slug: string): ChapterMapConfig | null {
  return CHAPTER_MAPS[slug] ?? null;
}
