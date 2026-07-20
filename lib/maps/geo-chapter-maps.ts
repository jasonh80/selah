// Real-map (MapLibre) chapter geography — the owner-approved maps engine
// (2026-07-17): live satellite tiles, genuine borders/city labels, 3-D
// terrain, a guided journey tour, and a Today/Terrain swipe compare.
//
// Every overlay derives from the digest-bound Prepare location entries in
// mark-sprint-acceptance.v1.json under the two-axis model
// (lib/prepare-locations.ts) — enforced by verify:maps-honesty:
//   point (known)      → 3-D pin at the real coordinate
//   region             → soft area with its certainty qualifier in the label
//   route (known)      → precise drawn path
//   route (probable)   → broad stylized CORRIDOR between the text-given
//                        waypoints — obviously not a road line
//   route (unknown) / text-only → nothing drawn; named in captions
// Coordinates are real WGS84 lng/lat.

export interface GeoPin {
  lng: number;
  lat: number;
  label: string;
  /** Digest-bound Prepare entry this pin renders (event or context role). */
  locationName?: string;
  /** Background orientation pin — never an approved location's name. */
  context?: true;
  /** Render the label left of the pin (for close-together coastal pins). */
  labelSide?: "left";
}

export interface GeoArea {
  locationName: string;
  label: string;
  /** Polygon ring, [lng, lat][] (closed or open — renderer closes it). */
  polygon: [number, number][];
  labelAt: [number, number];
}

export interface GeoCorridor {
  locationName: string;
  label: string;
  /** Text-given waypoints; the renderer sweeps a broad smoothed band
   * through them — never a precise road line. */
  waypoints: [number, number][];
  labelAt: [number, number];
}

export interface GeoView {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export interface GeoTourStop {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  title: string;
  caption: string;
}

export interface GeoChapterMap {
  views: { big: GeoView; local: GeoView };
  pins: GeoPin[];
  areas: GeoArea[];
  corridors: GeoCorridor[];
  tour: GeoTourStop[];
  caption: string;
}

/** Circle polygon around a point, radius in km. */
export function circlePolygon(
  lng: number,
  lat: number,
  km: number,
  steps = 48,
): [number, number][] {
  const kx = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const ky = km / 110.57;
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push([lng + Math.cos(a) * kx, lat + Math.sin(a) * ky]);
  }
  return pts;
}

// Real places (WGS84): Capernaum 32.8807N 35.5758E · Gennesaret plain
// 32.8657N 35.5203E · Tyre 33.2705N 35.2038E · Sidon 33.5615N 35.3690E ·
// Caesarea Philippi (Banias) 33.2486N 35.6944E · Bethsaida candidates
// et-Tell 32.9097N 35.6310E and el-Araj 32.8894N 35.6178E.
const CAPERNAUM: [number, number] = [35.5758, 32.8807];

export const GEO_CHAPTER_MAPS: Record<string, GeoChapterMap> = {
  "mark-7": {
    views: {
      local: { center: [35.62, 32.83], zoom: 10.2 },
      big: { center: [35.42, 33.1], zoom: 7.8 },
    },
    pins: [
      { lng: 35.5203, lat: 32.8657, label: "Gennesaret", locationName: "Gennesaret" },
      { lng: 35.2038, lat: 33.2705, label: "Tyre", locationName: "Tyre" },
      { lng: 35.369, lat: 33.5615, label: "Sidon", locationName: "Sidon", labelSide: "left" },
      { lng: CAPERNAUM[0], lat: CAPERNAUM[1], label: "Capernaum", context: true },
    ],
    areas: [
      {
        locationName: "Decapolis",
        label: "Decapolis · approx.",
        polygon: [
          [35.65, 32.82], [35.86, 32.88], [36.02, 32.62],
          [35.92, 32.38], [35.68, 32.5], [35.645, 32.68],
        ],
        labelAt: [35.83, 32.63],
      },
    ],
    corridors: [
      {
        locationName: "Route Tyre to Sidon to Decapolis",
        label: "Approx. route",
        waypoints: [
          [35.2038, 33.2705], [35.369, 33.5615], [35.72, 33.28],
          [35.78, 32.98], [35.8, 32.7],
        ],
        labelAt: [35.62, 33.32],
      },
    ],
    tour: [
      {
        center: [35.5203, 32.8657], zoom: 12, pitch: 50,
        title: "Gennesaret",
        caption: "The chapter opens on the crowded northwest shore — the dispute over clean hands finds Jesus right where the boats landed (6:53–7:1).",
      },
      {
        center: [35.2038, 33.2705], zoom: 11.5, pitch: 45,
        title: "The region of Tyre",
        caption: "Jesus withdraws roughly 35 miles northwest into Gentile territory (7:24). The city is known; the house he entered is not — so no pin marks it.",
      },
      {
        center: [35.369, 33.5615], zoom: 11, pitch: 45,
        title: "Through Sidon",
        caption: "The return route runs north through Sidon before turning back southeast (7:31) — famously the long way around.",
      },
      {
        center: [35.6, 33.1], zoom: 8.6, pitch: 30,
        title: "The roundabout way",
        caption: "The broad sweep shows the direction of travel the text gives — Tyre, Sidon, then down toward the lake. The exact road is unrecorded, so no precise line is drawn.",
      },
      {
        center: [35.83, 32.63], zoom: 9.8, pitch: 45,
        title: "Into the Decapolis",
        caption: "The deaf man is healed somewhere in the Decapolis, the league of Greek cities southeast of the lake (7:31–37). The region is real; the exact spot is not given.",
      },
    ],
    caption:
      "Mark 7 crosses into Gentile territory — the coast at Tyre and Sidon, then back to the Decapolis. Known cities carry pins; the healing site is shown as a region; the roundabout route of 7:31 appears only as a broad sweep because the exact road is unrecorded.",
  },

  "mark-8": {
    views: {
      local: { center: [35.66, 32.85], zoom: 10.4 },
      big: { center: [35.62, 33.0], zoom: 8.4 },
    },
    pins: [
      { lng: 35.6944, lat: 33.2486, label: "Caesarea Philippi", locationName: "Caesarea Philippi" },
      { lng: CAPERNAUM[0], lat: CAPERNAUM[1], label: "Capernaum", context: true },
    ],
    areas: [
      {
        locationName: "Bethsaida",
        label: "Bethsaida · debated",
        polygon: circlePolygon(35.6244, 32.8995, 1.7),
        labelAt: [35.665, 32.93],
      },
      {
        locationName: "Feeding of the 4,000",
        label: "Feeding of 4,000 · probable",
        polygon: circlePolygon(35.66, 32.77, 4.2),
        labelAt: [35.725, 32.72],
      },
    ],
    corridors: [],
    tour: [
      {
        center: [35.66, 32.77], zoom: 11, pitch: 50,
        title: "Feeding of the 4,000",
        caption: "On the eastern, Decapolis side of the lake, Jesus feeds four thousand (8:1–9). The area is probable; no exact spot is given.",
      },
      {
        // WIDE whole-lake frame — Dalmanutha is unidentified, so the camera
        // must not assert a spot for it (PR #43 review, P1-2). The caption
        // carries the honesty.
        center: [35.59, 32.82], zoom: 9.4, pitch: 0,
        title: "The district of Dalmanutha",
        caption: "The boat crosses to 'the district of Dalmanutha' (8:10) — a place no one has securely identified to this day. It is named honestly, never pinned.",
      },
      {
        center: [35.6244, 32.8995], zoom: 12.2, pitch: 50,
        title: "Bethsaida",
        caption: "The blind man is healed in stages at Bethsaida (8:22–26). The town is certain in the text; which of two nearby ruins it is remains debated — the area covers both.",
      },
      {
        center: [35.6944, 33.2486], zoom: 11, pitch: 55, bearing: 20,
        title: "Toward Caesarea Philippi",
        caption: "Twenty-five miles north, at the foot of Mount Hermon, Peter answers the question of the whole Gospel: 'You are the Christ' (8:27–30) — on the road, in the villages around the city.",
      },
    ],
    caption:
      "Mark 8 moves from the lake's eastern shore to the far north. Dalmanutha stays unpinned (unidentified), Bethsaida shows as an area covering both candidate ruins, and Caesarea Philippi anchors Peter's confession country.",
  },

  // Mark 9 uses the owner-approved legacy entries (bound byte-identical):
  // Capernaum known point; the Transfiguration mountain and the passage
  // through Galilee are no-pin entries — captions only.
  "mark-9": {
    views: {
      local: { center: [35.6, 32.95], zoom: 9.6 },
      big: { center: [35.62, 33.0], zoom: 8.4 },
    },
    pins: [
      { lng: CAPERNAUM[0], lat: CAPERNAUM[1], label: "Capernaum", locationName: "Capernaum" },
    ],
    areas: [],
    corridors: [],
    tour: [
      {
        // WIDE northern-region frame — Mark leaves the mountain unnamed, so
        // the camera frames the whole candidate country (Tabor to Hermon)
        // without asserting a summit (PR #43 review, P1-2).
        center: [35.5, 33.0], zoom: 7.8, pitch: 30, bearing: 0,
        title: "A high mountain",
        caption: "Jesus is transfigured on 'a high mountain' Mark leaves unnamed (9:2). Tabor is the tradition; the Hermon country fits the journey — the uncertainty is stated, not painted over. No pin claims the summit.",
      },
      {
        center: [35.45, 32.85], zoom: 9.4, pitch: 40,
        title: "Passing through Galilee",
        caption: "They pass through Galilee by an unrecorded way, and Jesus does not want anyone to know (9:30) — teaching his disciples about the cross. No route is drawn.",
      },
      {
        center: CAPERNAUM, zoom: 12.5, pitch: 50,
        title: "Capernaum",
        caption: "Back in the house at Capernaum (9:33), the argument about who is greatest meets a child in the middle of the room.",
      },
    ],
    caption:
      "Mark 9 runs from an unnamed high mountain down through Galilee to a house in Capernaum. Only Capernaum earns a pin — the mountain and the route are honestly uncertain and stay unpinned.",
  },

  // Mark 10 renders its owner-approved fixture entries (owner report
  // 2026-07-19: published Mark 10 had no map because configs were hand-built
  // only through Mark 9; IQ-018 automates this later). Real places (WGS84):
  // Jericho (Tell es-Sultan) 31.8711N 35.4442E · Jerusalem Old City
  // 31.7784N 35.2354E. The chapter moves south: Judea and beyond the Jordan
  // (10:1), the road up to Jerusalem (10:32), Bartimaeus at Jericho (10:46).
  "mark-10": {
    views: {
      local: { center: [35.34, 31.83], zoom: 10.2 },
      big: { center: [35.45, 31.72], zoom: 8.2 },
    },
    pins: [
      { lng: 35.4442, lat: 31.8711, label: "Jericho", locationName: "Jericho" },
      { lng: 35.2354, lat: 31.7784, label: "Jerusalem", locationName: "Jerusalem", labelSide: "left" },
    ],
    areas: [
      {
        locationName: "Judea and beyond the Jordan",
        label: "Judea & beyond the Jordan · approx.",
        polygon: [
          [35.05, 31.95], [35.45, 32.08], [35.75, 32.02],
          [35.85, 31.65], [35.6, 31.35], [35.15, 31.45],
        ],
        labelAt: [35.66, 31.85],
      },
    ],
    corridors: [
      {
        locationName: "Road up to Jerusalem",
        label: "Approx. road up",
        waypoints: [
          [35.4442, 31.8711], [35.38, 31.845], [35.31, 31.815], [35.2354, 31.7784],
        ],
        labelAt: [35.36, 31.87],
      },
    ],
    tour: [
      {
        center: [35.55, 31.8], zoom: 8.6, pitch: 30,
        title: "Judea and beyond the Jordan",
        caption: "Jesus leaves Galilee for the region of Judea and beyond the Jordan (10:1), teaching the crowds again. The region is real; its boundary is approximate, and no teaching scene gets a pin.",
      },
      {
        center: [35.34, 31.83], zoom: 10.8, pitch: 55, bearing: -35,
        title: "The road up to Jerusalem",
        caption: "They were on the road, going up to Jerusalem, Jesus walking ahead (10:32). From Jericho the climb rises about 3,400 feet — the sequence is given, the exact road is not, so only a broad sweep is shown.",
      },
      {
        center: [35.4442, 31.8711], zoom: 12, pitch: 50,
        title: "Jericho",
        caption: "As Jesus leaves Jericho, blind Bartimaeus calls out from the roadside and follows him on the way (10:46–52). The city is certain; the roadside spot is not pinned.",
      },
      {
        center: [35.2354, 31.7784], zoom: 11.5, pitch: 55, bearing: 15,
        title: "Jerusalem ahead",
        caption: "The destination Jesus has named three times now (10:33–34) — where the Son of Man came not to be served but to serve, and to give his life as a ransom for many (10:45). Nothing in this chapter happens there yet.",
      },
    ],
    caption:
      "Mark 10 turns south: Judea and beyond the Jordan, then the climb from Jericho toward Jerusalem. The two cities carry pins; the region's boundary is approximate; the road appears only as a broad sweep because the exact route is unrecorded.",
  },
  // Mark 6 (owner request 2026-07-20: bring the pre-sprint benchmark chapter
  // onto the real-map engine). Locations are the CURATED entries below
  // (GEO_CURATED_LOCATIONS) — same two-axis honesty model, enforced by
  // verify:maps-honesty exactly like the digest-bound sprint chapters.
  "mark-6": {
    views: {
      local: { center: [35.56, 32.83], zoom: 10.2 },
      big: { center: [35.48, 32.25], zoom: 7.2 },
    },
    pins: [
      { lng: 35.3027, lat: 32.7019, label: "Nazareth", locationName: "Nazareth", labelSide: "left" },
    ],
    areas: [
      {
        locationName: "Feeding of the five thousand",
        label: "Feeding of the 5,000 · site debated",
        polygon: circlePolygon(35.585, 32.885, 4),
        labelAt: [35.585, 32.905],
      },
      {
        locationName: "Bethsaida",
        label: "Bethsaida · site debated",
        polygon: circlePolygon(35.626, 32.899, 2),
        labelAt: [35.655, 32.899],
      },
      {
        locationName: "Gennesaret",
        label: "Gennesaret plain · approx.",
        polygon: circlePolygon(35.535, 32.855, 3),
        labelAt: [35.5, 32.838],
      },
      {
        locationName: "Machaerus",
        label: "Machaerus · per Josephus, debated",
        polygon: circlePolygon(35.6244, 31.5672, 2.5),
        labelAt: [35.66, 31.567],
      },
    ],
    corridors: [
      {
        locationName: "Night crossing",
        label: "Approx. night crossing",
        waypoints: [
          [35.6, 32.88], [35.575, 32.868], [35.548, 32.858],
        ],
        labelAt: [35.578, 32.845],
      },
    ],
    tour: [
      {
        center: [35.3027, 32.7019], zoom: 12, pitch: 50,
        title: "Nazareth",
        caption: "Jesus teaches in His hometown synagogue and is dismissed by the people who know His family best (6:1–6). The village site is certain.",
      },
      {
        center: [35.45, 32.8], zoom: 9, pitch: 30,
        title: "The village circuit",
        caption: "The Twelve go out two by two through the Galilean villages, preaching and healing (6:7–13). No itinerary is recorded, so no route is drawn.",
      },
      {
        center: [35.6244, 31.5672], zoom: 10.5, pitch: 45,
        title: "Machaerus — far from Galilee",
        caption: "While the Twelve preach, Mark tells John's death (6:14–29). Mark names no place; Josephus places John's imprisonment and execution at Machaerus, east of the Dead Sea — the banquet's setting is debated, so the fortress shows as a soft area.",
      },
      {
        center: [35.585, 32.885], zoom: 11.5, pitch: 45,
        title: "A desolate place",
        caption: "The feeding of the five thousand happens in a remote spot by the lake (6:31–44). Tradition points to Tabgha or the northeast shore; the exact place is debated.",
      },
      {
        center: [35.575, 32.865], zoom: 11, pitch: 55, bearing: -20,
        title: "The night crossing",
        caption: "The disciples strain at the oars against the wind while Jesus comes to them on the water (6:45–52). The crossing toward Bethsaida is text-given; the drawn band is approximate.",
      },
      {
        center: [35.535, 32.855], zoom: 12, pitch: 50,
        title: "Gennesaret",
        caption: "The boat lands at Gennesaret and the whole region carries its sick to Jesus — even the fringe of His garment heals (6:53–56). The fertile plain is a known region with an approximate boundary.",
      },
    ],
    caption:
      "Mark 6 moves from Nazareth's rejection through the village circuit (no route recorded), to a debated feeding site by the lake, a night crossing shown only as a broad band, and the Gennesaret plain — with John's death far south at Machaerus, per Josephus. Only Nazareth is certain enough for a pin.",
  },
};

export function getGeoChapterMap(slug: string): GeoChapterMap | null {
  return GEO_CHAPTER_MAPS[slug] ?? null;
}

/**
 * Curated two-axis location entries for geo chapters that PREDATE the Prepare
 * packet lane (no digest-bound entries in mark-sprint-acceptance.v1.json).
 * Same honesty model, same shapes, reviewed as data in the PR;
 * verify:maps-honesty enforces every overlay against these exactly as it
 * does against the digest-bound sprint entries.
 */
export const GEO_CURATED_LOCATIONS: Record<
  string,
  {
    name: string;
    featureKind: "point" | "region" | "route" | "text-only";
    certainty: "known" | "probable" | "debated" | "unknown";
    role: "event" | "context";
    display: string;
  }[]
> = {
  "mark-6": [
    {
      name: "Nazareth",
      featureKind: "point",
      certainty: "known",
      role: "event",
      display: "Jesus is dismissed in His hometown (6:1–6)",
    },
    {
      name: "Galilean village circuit",
      featureKind: "route",
      certainty: "unknown",
      role: "event",
      display: "The Twelve go out two by two among the villages (6:7–13) — no itinerary recorded",
    },
    {
      name: "Machaerus",
      featureKind: "region",
      certainty: "debated",
      role: "event",
      display:
        "John's imprisonment and death — Josephus names Machaerus; Mark names no place, and the banquet's setting is debated (6:14–29)",
    },
    {
      name: "Feeding of the five thousand",
      featureKind: "region",
      certainty: "debated",
      role: "event",
      display: "A desolate place by the lake (6:31–44) — traditional sites include Tabgha and the NE shore; the exact spot is debated",
    },
    {
      name: "Bethsaida",
      featureKind: "region",
      certainty: "debated",
      role: "event",
      display: "The crossing's stated destination (6:45) — the town's own site is debated (et-Tell vs. el-Araj)",
    },
    {
      name: "Night crossing",
      featureKind: "route",
      certainty: "probable",
      role: "event",
      display: "The boat fights the wind toward Bethsaida and lands at Gennesaret (6:45–53)",
    },
    {
      name: "Gennesaret",
      featureKind: "region",
      certainty: "known",
      role: "event",
      display: "The fertile plain where the sick are carried to Jesus (6:53–56)",
    },
  ],
};
