// Per-chapter supplemental content + targeted copy overrides. Lets us add
// confident, Selah-voiced UI content without regenerating the stored workup.

// ---- Author, Audience & Evidence cards -------------------------------------
// Each card may optionally carry a real media asset later. We ONLY render media
// when a real approved asset exists — never an empty placeholder box.
export interface ContextMedia {
  type: "image" | "artifact" | "map" | "manuscript" | "landscape";
  src: string;
  alt: string;
  caption: string;
  attribution?: string;
}

export interface ContextCard {
  key: string;
  category: string;
  title: string;
  body: string;
  media?: ContextMedia;
}

export const CHAPTER_CONTEXT: Record<string, ContextCard[]> = {
  "psalm-23": [
    {
      key: "author",
      category: "Author",
      title: "David, Israel’s shepherd-king",
      body:
        "Psalm 23 is tied to David, whose life moved from Bethlehem’s shepherd fields to the throne of Israel. The shepherd imagery fits his world naturally: sheep, danger, valleys, water, enemies, hospitality, and trust in the Lord.",
    },
    {
      key: "audience",
      category: "First Audience",
      title: "Israel’s worshiping community",
      body:
        "This psalm became worship language for God’s people — first in Israel’s prayer and song life, then across centuries of Jewish and Christian faith.",
    },
    {
      key: "world",
      category: "Historical World",
      title: "Judah’s hills, sheep, danger, and dependence",
      body:
        "The psalm comes from a real landscape: seasonal pasture, scarce water, shadowed valleys, predators, enemies, and the ancient duty of a host to protect and provide.",
    },
    {
      key: "evidence",
      category: "Evidence & Artifacts",
      title: "Manuscripts, inscriptions, and the land",
      body:
        "The Psalms are preserved through ancient Hebrew manuscript tradition, including psalm material among the Dead Sea Scrolls. Inscriptions such as the Tel Dan Stele also support the historical memory of David’s dynasty, placing David’s world in real history.",
    },
  ],
};

export function getChapterContext(slug: string): ContextCard[] | null {
  return CHAPTER_CONTEXT[slug] ?? null;
}

// ---- Targeted metaChip copy overrides --------------------------------------
// Keeps primary-UI wording confident and specific. Indexed to the stored chip
// order (date, location, theme, jesus). Falls back to the generic voice layer
// when no override exists.
export const CHAPTER_CHIP_OVERRIDES: Record<string, Record<number, string>> = {
  "psalm-23": {
    0: "Around 1000 BC, in David’s world",
    1: "Rooted in David’s shepherding world in Judah, especially the Bethlehem hill country",
  },
};

export function getChipOverride(slug: string, index: number): string | null {
  return CHAPTER_CHIP_OVERRIDES[slug]?.[index] ?? null;
}

// Confident main-view timeline note. Deeper authorship/manuscript nuance lives
// in the Author, Audience & Evidence section and Transparency, not here.
export const CHAPTER_TIMELINE_NOTE: Record<string, string> = {
  "psalm-23": "Psalm 23 belongs naturally in David’s world, around 1000 BC.",
};

export function getTimelineNote(slug: string): string | null {
  return CHAPTER_TIMELINE_NOTE[slug] ?? null;
}
