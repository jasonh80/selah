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
  /** Name of the digest-bound Prepare location entry this pin renders
   * (mark-sprint-acceptance fixture). Verified by verify:maps-honesty:
   * only "known" locations may carry a pin. */
  locationName?: string;
  /** Marks a background/context pin (not a chapter event location). In
   * chapters with approved location entries, EVERY pin must be classified —
   * locationName or context — and a context pin may never use an approved
   * location's name. Enforced by verify:maps-honesty. */
  context?: boolean;
  /** Which side of the dot the label renders on (default "right"). Use
   * "left" to keep close-together pins readable. */
  labelSide?: "left" | "right";
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
  /** Name of the digest-bound Prepare location entry this area renders.
   * Verified by verify:maps-honesty: only "debated" locations may carry a
   * glow area, and it must be marked approx. */
  locationName?: string;
  /** Marks a background/context area. Same classification rule as MapPin. */
  context?: boolean;
}
export interface MapPath {
  points: [number, number][];
  label?: string;
  lx?: number;
  ly?: number;
  /** Name of the digest-bound Prepare location entry this movement touches.
   * In chapters with approved location entries, EVERY path must reference a
   * "known" location — a drawn line may never render a "none" route (e.g.
   * Mark 7:31) or a "debated" area. Enforced by verify:maps-honesty. */
  locationName?: string;
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

// Owner-approved certainty → map treatment (docs/selah/maps-config-lane.md).
// Event locations on a map DERIVE their visual treatment from the chapter's
// digest-bound Prepare certainty — a map may never contradict an approved
// "no pin". Enforced by verify:maps-honesty.
//   known   → pin at the real place
//   debated → glow area, no pin, labelled "· debated"
//   none    → text-only: no pin, no glow — named in captions only
export type PrepareMapTreatment = "pin" | "area" | "text-only";
export function prepareCertaintyToMapTreatment(
  certainty: "known" | "debated" | "none",
): PrepareMapTreatment {
  switch (certainty) {
    case "known":
      return "pin";
    case "debated":
      return "area";
    case "none":
      return "text-only";
  }
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

  // Mark 7 — the chapter that crosses into Gentile territory. Tyre and Sidon
  // sit ~35 mi northwest of the 35-mi Galilee frame, so their KNOWN pins live
  // on the Big Picture map; the local map carries Gennesaret (known) and the
  // Decapolis (debated glow). The 7:31 route is certainty "none" — per the
  // chapter guardrail it is never drawn as a line; captions carry it.
  "mark-7": {
    bigPicture: {
      baseMapImage: "/img/maps/levant-region.jpg",
      attribution: ESRI,
      caption:
        "Mark 7 leaves Galilee for the Phoenician coast — Tyre and Sidon, Gentile territory northwest of the Sea of Galilee — and returns toward the Decapolis. The exact road is unrecorded, so no route is drawn.",
      pins: [
        // Sidon's label renders to the LEFT (over the sea) so the two
        // close-together coastal pins never collide on narrow viewports.
        { x: 39.7, y: 40.8, label: "Tyre", locationName: "Region of Tyre" },
        { x: 40.3, y: 37.6, label: "Sidon", locationName: "Sidon", labelSide: "left" },
      ],
      labels: [
        { x: 18, y: 25, text: "Mediterranean Sea", tone: "water" },
        { x: 36, y: 33, text: "Phoenicia", tone: "region" },
        { x: 44, y: 46.5, text: "Galilee", tone: "region" },
        { x: 34, y: 50, text: "Israel · Judah", tone: "region" },
        { x: 44, y: 58, text: "Dead Sea", tone: "water" },
      ],
      regions: [],
    },

    local: {
      baseMapImage: "/img/maps/galilee-satellite.jpg",
      attribution: ESRI,
      caption:
        "The dispute over clean hands unfolds after the Gennesaret landing (6:53–7:1). Tyre and Sidon lie well beyond this frame to the northwest (see Big Picture); the healing of the deaf man happens in the Decapolis region — an area southeast of the lake, with no exact spot given.",
      milesAcross: 35,
      modes: {
        today: {
          pins: [
            { x: 61.7, y: 45.6, label: "Gennesaret", locationName: "Gennesaret" },
            { x: 70.8, y: 37.6, label: "Capernaum", context: true },
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
            { x: 61.7, y: 45.6, label: "Gennesaret", locationName: "Gennesaret" },
            { x: 70.8, y: 37.6, label: "Capernaum", context: true },
          ],
          labels: [{ x: 74, y: 55, text: "Sea of Galilee", tone: "water" }],
          regions: [
            {
              cx: 87,
              cy: 72,
              rx: 11,
              ry: 13,
              variant: "glow",
              label: "Decapolis · debated area",
              lx: 72,
              ly: 87,
              approx: true,
              locationName: "Decapolis",
            },
          ],
          paths: [],
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
      location: { lat: 32.8663, lng: 35.5271 }, // representative — Gennesaret plain, NW shore
      caption:
        "Representative modern view on the Gennesaret plain, northwest shore of the Sea of Galilee — not an exact Mark 7 event site.",
      attribution: "Google Street View (official API, planned)",
    },
  },

  // Mark 8 — Dalmanutha (8:10) has never been securely identified, so it is
  // certainty "none": named in the caption, never pinned. Caesarea Philippi
  // sits ~25 mi north of the frame at the foot of Mount Hermon, so its KNOWN
  // pin lives on the Big Picture map. The feeding of the 4,000 is a debated
  // area on the Decapolis side.
  "mark-8": {
    bigPicture: {
      baseMapImage: "/img/maps/levant-region.jpg",
      attribution: ESRI,
      caption:
        "Mark 8 moves from the lake district north to Caesarea Philippi at the foot of Mount Hermon, where Peter's confession comes on the road. The district of Dalmanutha (8:10) has never been securely identified — it is named here, not pinned.",
      // The contextual Galilee marker is a LABEL, offset below-left, so the
      // Caesarea Philippi pin stays readable on narrow viewports (Codex P2).
      // Mount Hermon lives in the caption for the same reason.
      pins: [
        { x: 42.6, y: 42.3, label: "Caesarea Philippi", locationName: "Caesarea Philippi" },
      ],
      labels: [
        { x: 18, y: 25, text: "Mediterranean Sea", tone: "water" },
        { x: 41, y: 47, text: "Galilee", tone: "region" },
        { x: 34, y: 51, text: "Israel · Judah", tone: "region" },
        { x: 44, y: 58, text: "Dead Sea", tone: "water" },
      ],
      regions: [],
    },

    local: {
      baseMapImage: "/img/maps/galilee-satellite.jpg",
      attribution: ESRI,
      caption:
        "The feeding of the 4,000 happens on the Decapolis side of the lake — a general area, no exact spot given. Dalmanutha (8:10) is unidentified, so it is not pinned. The blind man is healed at Bethsaida; from there the road runs north, beyond this frame, to Caesarea Philippi (see Big Picture).",
      milesAcross: 35,
      modes: {
        today: {
          pins: [
            { x: 80.2, y: 31.1, label: "Bethsaida", locationName: "Bethsaida" },
            { x: 70.8, y: 37.6, label: "Capernaum", context: true },
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
            { x: 80.2, y: 31.1, label: "Bethsaida", locationName: "Bethsaida" },
            { x: 70.8, y: 37.6, label: "Capernaum", context: true },
          ],
          labels: [{ x: 74, y: 55, text: "Sea of Galilee", tone: "water" }],
          regions: [
            {
              cx: 85,
              cy: 62,
              rx: 10,
              ry: 11,
              variant: "glow",
              label: "Feeding of the 4,000 · debated area",
              lx: 66,
              ly: 76,
              approx: true,
              locationName: "Feeding of the 4,000",
            },
          ],
          paths: [],
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
      location: { lat: 32.9106, lng: 35.6306 }, // representative — near et-Tell/Bethsaida, NE of the lake
      caption:
        "Representative modern view near Bethsaida, northeast of the Sea of Galilee — not an exact Mark 8 event site.",
      attribution: "Google Street View (official API, planned)",
    },
  },
};

export function getChapterMap(slug: string): ChapterMapConfig | null {
  return CHAPTER_MAPS[slug] ?? null;
}
