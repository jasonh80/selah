// WHO RULED WHERE — the Mark-era "borders" map data (owner's word: "borders").
//
// AD 29-30, the world of Mark. Codex audit (2026-07-24) governs every rule
// here; the honest limits are the point:
//   · Ancient sources name cities, regions, and rulers — NOT survey-grade
//     boundary lines. Administration DID have regions; we just don't have the
//     lines. So regions render as broad soft washes, never hard borders, and
//     every city is labeled by how we know its ruler.
//   · No unified Decapolis territory or fade — its cities were self-governing
//     Greek cities under Roman Syria, so each is an individual pin.
//   · Tyre and Sidon are separate Phoenician cities under Roman Syria, not a
//     bloc.
//   · Bethsaida: Philip's jurisdiction is secure, the exact site is disputed —
//     shown as a candidate area, not a false-precision pin.
//   · Titles are exact: Antipas and Philip are TETRARCHS (not kings); Pilate
//     is PREFECT (AD 26-36). Galilee and Perea are SEPARATE shapes.
//   · Tiberius (emperor) and Caiaphas (high priest) are named as authorities
//     of the period, NOT as territorial rulers on the map.

export type RulerId =
  | "antipas"
  | "philip"
  | "prefect"
  | "roman-syria"; // the Decapolis + Phoenician free cities' overarching province

export interface Ruler {
  id: RulerId;
  /** Exact title — never inflated. */
  name: string;
  /** One-line reader gloss. */
  blurb: string;
  /** Region wash color (soft fill; NEVER a hard boundary stroke). */
  color: string;
}

export const MARK_RULERS: Record<RulerId, Ruler> = {
  antipas: {
    id: "antipas",
    name: "Herod Antipas — tetrarch of Galilee & Perea",
    blurb: "A son of Herod the Great, ruling Galilee and Perea for Rome (4 BC – AD 39). Not a king — a tetrarch.",
    color: "#5aa9e6",
  },
  philip: {
    id: "philip",
    name: "Philip the Tetrarch",
    blurb: "Antipas's half-brother, tetrarch of the territories north and east of the Sea of Galilee (4 BC – AD 34).",
    color: "#8e7dd8",
  },
  prefect: {
    id: "prefect",
    name: "Pontius Pilate — Roman prefect of Judea",
    blurb: "Judea, Samaria and Idumea were a Roman province under a prefect; Pilate held the post AD 26–36.",
    color: "#d98a4a",
  },
  "roman-syria": {
    id: "roman-syria",
    name: "Roman province of Syria",
    blurb: "The Greek cities of the Decapolis and the Phoenician coast were self-governing under the wider province of Syria.",
    color: "#6bbf8a",
  },
};

/** How we know a city's ruler — Codex requirement: every city labeled. */
export type Provenance = "direct" | "regional-inference";

export interface TerritoryCity {
  name: string;
  at: [number, number];
  ruler: RulerId;
  /** "direct" = an ancient source assigns this city to this ruler; "regional-
   * inference" = we place it by the region's known jurisdiction. */
  provenance: Provenance;
  /** A one-line source/qualifier shown in the key. */
  note: string;
  /** Regional-context only (Codex): kept OFF the Mark-only primary view. */
  contextOnly?: boolean;
  /** Disputed exact site → render as a candidate area, not a precise pin. */
  disputedSite?: boolean;
}

/** Broad region washes — soft fills over the territory a ruler is known to
 * have governed. Deliberately loose polygons: they say "this general area,"
 * never "the border ran exactly here." Galilee and Perea are SEPARATE. */
export interface RegionWash {
  ruler: RulerId;
  name: string;
  /** Loose polygon [lon,lat]; intentionally not a claimed frontier. */
  polygon: [number, number][];
}

export interface TerritoryMap {
  dateLabel: string;
  cities: TerritoryCity[];
  regions: RegionWash[];
  /** Named authorities of the period who are NOT territorial rulers. */
  authorities: { name: string; blurb: string }[];
}

// AD 29-30. Verified against the Codex ruler audit (2026-07-24).
export const MARK_TERRITORY: TerritoryMap = {
  dateLabel: "c. AD 29–30 · Selah's best estimate",
  regions: [
    {
      ruler: "antipas",
      name: "Galilee",
      polygon: [
        [35.1, 33.08], [35.62, 33.02], [35.72, 32.72], [35.55, 32.5],
        [35.2, 32.55], [35.0, 32.78],
      ],
    },
    {
      ruler: "antipas",
      name: "Perea",
      polygon: [
        [35.55, 32.15], [35.9, 32.1], [35.85, 31.55], [35.62, 31.5],
        [35.5, 31.8],
      ],
    },
    {
      ruler: "philip",
      name: "Philip's tetrarchy",
      polygon: [
        [35.6, 33.3], [36.2, 33.25], [36.25, 32.75], [35.72, 32.72],
        [35.62, 33.02],
      ],
    },
    {
      ruler: "prefect",
      name: "Judea & Samaria (Roman province)",
      polygon: [
        [34.9, 32.4], [35.35, 32.4], [35.5, 31.7], [35.4, 31.35],
        [34.95, 31.5], [34.9, 31.9],
      ],
    },
  ],
  cities: [
    // Antipas — Galilee (direct where the sources place his cities)
    { name: "Tiberias", at: [35.53, 32.79], ruler: "antipas", provenance: "direct", note: "Antipas's capital, which he founded (Josephus)." },
    { name: "Sepphoris", at: [35.28, 32.75], ruler: "antipas", provenance: "direct", note: "Antipas's earlier seat (Josephus)." },
    { name: "Capernaum", at: [35.575, 32.88], ruler: "antipas", provenance: "regional-inference", note: "A frequent Mark setting, in Antipas's Galilee." },
    { name: "Nazareth", at: [35.3, 32.7], ruler: "antipas", provenance: "regional-inference", note: "In Antipas's Galilee." },
    // Antipas — Perea
    { name: "Machaerus", at: [35.62, 31.57], ruler: "antipas", provenance: "direct", note: "Josephus's site for John the Baptist's imprisonment and death, in Antipas's Perea." },
    // Philip — his tetrarchy (Bethsaida site disputed → area)
    { name: "Caesarea Philippi", at: [35.69, 33.25], ruler: "philip", provenance: "direct", note: "Rebuilt by Philip; the confession country of Mark 8." },
    { name: "Bethsaida", at: [35.63, 32.91], ruler: "philip", provenance: "direct", note: "Philip's jurisdiction is secure; the exact site is disputed (et-Tell / el-Araj), so shown as an area.", disputedSite: true },
    // Roman prefect — Judea/Samaria
    { name: "Jerusalem", at: [35.23, 31.78], ruler: "prefect", provenance: "regional-inference", note: "In the Roman province under the prefect; the high priest led temple authority." },
    { name: "Caesarea Maritima", at: [34.9, 32.5], ruler: "prefect", provenance: "direct", note: "The Roman prefect's actual seat (Josephus)." },
    { name: "Jericho", at: [35.44, 31.87], ruler: "prefect", provenance: "regional-inference", note: "In the Roman province of Judea." },
    // Roman Syria — Decapolis cities (individual pins, NEVER a bloc/fade)
    { name: "Gadara", at: [35.68, 32.65], ruler: "roman-syria", provenance: "direct", note: "Decapolis city · Roman Syria." },
    { name: "Hippos", at: [35.66, 32.78], ruler: "roman-syria", provenance: "direct", note: "Decapolis city · Roman Syria." },
    { name: "Scythopolis", at: [35.5, 32.5], ruler: "roman-syria", provenance: "direct", note: "Decapolis city · Roman Syria (the only one west of the Jordan)." },
    { name: "Pella", at: [35.62, 32.45], ruler: "roman-syria", provenance: "direct", note: "Decapolis city · Roman Syria." },
    { name: "Gerasa", at: [35.9, 32.28], ruler: "roman-syria", provenance: "direct", note: "Decapolis city · Roman Syria." },
    { name: "Canatha", at: [36.61, 32.75], ruler: "roman-syria", provenance: "direct", note: "Decapolis city · Roman Syria.", contextOnly: true },
    // Roman Syria — Phoenician coast (separate cities, not a bloc)
    { name: "Tyre", at: [35.2, 33.27], ruler: "roman-syria", provenance: "direct", note: "A Phoenician city under Roman Syria; Mark 7 goes to its region." },
    { name: "Sidon", at: [35.37, 33.56], ruler: "roman-syria", provenance: "direct", note: "A Phoenician city under Roman Syria." },
  ],
  authorities: [
    { name: "Tiberius", blurb: "Roman emperor over the whole map — not a local territorial ruler." },
    { name: "Caiaphas", blurb: "High priest in Jerusalem — religious authority, not a territorial ruler." },
  ],
};

/** Cities to draw for a view. The Mark-only primary view omits the regional-
 * context-only cities (Codex: keep the primary view Mark-focused). */
export function territoryCities(includeContext: boolean): TerritoryCity[] {
  return MARK_TERRITORY.cities.filter((c) => includeContext || !c.contextOnly);
}
