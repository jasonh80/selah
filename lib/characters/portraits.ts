// PORTRAIT REGISTRY — the seam between the chapter text and the visual cast.
//
// Chapters name their people in free text ("Peter", "The father", "James").
// The cast lives as approved portraits with stable ids. This maps one to the
// other, and it is deliberately the ONLY place that mapping exists, so when
// the cast is ported into this repo the People strip fills in without touching
// any component.
//
// Today it is nearly empty on purpose: no portraits have been ported yet, so
// every person renders as a labelled placeholder. Nothing here fabricates a
// face — an unmapped name gets a placeholder, never a stand-in portrait of
// somebody else.

export interface CastEntry {
  /** Stable character id (matches the Kelly repo's profile ids). */
  id: string;
  /** Portrait path under /public once ported; omit until one exists. */
  portrait?: string;
}

/** Name as a chapter writes it (lowercased) → cast entry. Aliases are
 * expected: "James", "James son of Zebedee", and "James the son of Zebedee"
 * all point at the same man. */
export const CAST_BY_NAME: Record<string, CastEntry> = {
  jesus: { id: "jesus", portrait: "/img/characters/jesus/portrait.jpg" },
  peter: { id: "peter", portrait: "/img/characters/peter/portrait.jpg" },
  "simon peter": { id: "peter", portrait: "/img/characters/peter/portrait.jpg" },
  andrew: { id: "andrew", portrait: "/img/characters/andrew/portrait.jpg" },
  james: { id: "james-zebedee", portrait: "/img/characters/james-zebedee/portrait.jpg" },
  "james son of zebedee": { id: "james-zebedee", portrait: "/img/characters/james-zebedee/portrait.jpg" },
  john: { id: "john-apostle" },
  "john son of zebedee": { id: "john-apostle" },
  "john the baptist": { id: "john-the-baptist", portrait: "/img/characters/john-the-baptist/portrait.jpg" },
  matthew: { id: "matthew", portrait: "/img/characters/matthew/portrait.jpg" },
  levi: { id: "matthew", portrait: "/img/characters/matthew/portrait.jpg" },
  thomas: { id: "thomas", portrait: "/img/characters/thomas/portrait.jpg" },
  philip: { id: "philip", portrait: "/img/characters/philip/portrait.jpg" },
  bartholomew: { id: "bartholomew", portrait: "/img/characters/bartholomew/portrait.jpg" },
  nathanael: { id: "bartholomew", portrait: "/img/characters/bartholomew/portrait.jpg" },
  "james son of alphaeus": { id: "james-alphaeus", portrait: "/img/characters/james-alphaeus/portrait.jpg" },
  thaddaeus: { id: "thaddaeus", portrait: "/img/characters/thaddaeus/portrait.jpg" },
  "simon the zealot": { id: "simon-zealot", portrait: "/img/characters/simon-zealot/portrait.jpg" },
  "judas iscariot": { id: "judas-iscariot" },
  "herod antipas": { id: "herod-antipas", portrait: "/img/characters/herod-antipas/portrait.jpg" },
  herod: { id: "herod-antipas", portrait: "/img/characters/herod-antipas/portrait.jpg" },
  herodias: { id: "herodias", portrait: "/img/characters/herodias/portrait.jpg" },
  mary: { id: "mary", portrait: "/img/characters/mary/portrait.jpg" },
  moses: { id: "moses", portrait: "/img/characters/moses/portrait.jpg" },
  elijah: { id: "elijah" },
};

/** The cast entry for a chapter's person name, or null when this person is not
 * a recurring cast member (crowds, unnamed figures, "the father"). */
export function castFor(name: string): CastEntry | null {
  return CAST_BY_NAME[name.trim().toLowerCase()] ?? null;
}

/** The portrait to render, or null — which means "draw the placeholder". */
export function portraitFor(name: string): string | null {
  return castFor(name)?.portrait ?? null;
}
