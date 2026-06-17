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

// ---- Scene (image) titles --------------------------------------------------
// Short, useful scene titles instead of generic "Detail Shot" / "Human Moment".
export const CHAPTER_IMAGE_TITLES: Record<string, Record<string, string>> = {
  "psalm-23": {
    establishing: "The Shepherd’s World",
    detail: "Still Waters",
    human: "Through the Valley",
  },
};

export function getImageTitle(slug: string, kind: string, fallback: string): string {
  return CHAPTER_IMAGE_TITLES[slug]?.[kind] ?? fallback;
}

// ---- Verse-by-verse notes --------------------------------------------------
// Brief, static, Selah-voiced explanations per verse. No generated content.
export const CHAPTER_VERSE_NOTES: Record<string, Record<number, string>> = {
  "psalm-23": {
    1: "David names the Lord as his shepherd — the one who leads, feeds, and protects. Under that care, he lacks nothing that truly matters.",
    2: "Green pastures and still waters: the Shepherd brings rest and refreshment, not endless striving.",
    3: "God revives what is worn down and guides onto the right path — for the honor of His own name.",
    4: "Even through danger and grief, the Shepherd is present. His rod and staff mean protection and comfort, not distance.",
    5: "A table set in the open, in full view of enemies: God honors, provides, and overflows His grace even amid threat.",
    6: "Confident hope — God’s goodness and covenant love pursue David all his days, leading him home to dwell with the Lord forever.",
  },
};

export function getVerseNotes(slug: string): Record<number, string> | null {
  return CHAPTER_VERSE_NOTES[slug] ?? null;
}

// ---- Scene Checks ("how to picture this accurately") -----------------------
// Short, warm, visual callouts that correct common mental-image mistakes. The
// visualAccuracyNotes also serve as guardrails for future image generation.
export interface SceneCheck {
  label?: string; // "Scene Check" (default) | "Selah Note" | "What It Really Looked Like"
  title: string;
  body: string;
  relatedVerses?: string[];
  visualAccuracyNotes?: string[];
}

export const CHAPTER_SCENE_CHECKS: Record<string, SceneCheck[]> = {
  "psalm-23": [
    {
      label: "Scene Check",
      title: "Not a gentle English meadow",
      body:
        "Don’t picture a soft green lawn and a fluffy lamb. Picture dry Judean hills, scarce water, real predators, and a shadowed ravine. The shepherd carries a club and a staff because the danger is real — which is exactly why “I will fear no evil” means something.",
      relatedVerses: ["Psalm 23:1–2", "Psalm 23:4"],
      visualAccuracyNotes: [
        "Dry, golden hill country and wilderness — not a lush, manicured pasture.",
        "The “rod” is a club/weapon for defense; the “staff” is a crook for guiding — two different tools.",
        "The “valley of the shadow” is a real shadowed ravine, not a soft metaphor floating in mist.",
      ],
    },
  ],

  "exodus-29": [
    {
      label: "Scene Check",
      title: "Picture a desert courtyard, not a stone temple",
      body:
        "Don’t picture a polished stone temple or English words on Aaron’s forehead. Picture a desert courtyard, linen curtains about seven and a half feet high, smoke in the air, bronze tools, woven colors, and a priest wearing a gold plate that marked him as belonging to Yahweh. Holy doesn’t always look sterile.",
      relatedVerses: ["Exodus 29:5–7", "Exodus 28:36–38"],
      visualAccuracyNotes: [
        "This is the tabernacle — a portable desert tent — not Solomon’s stone temple (centuries later).",
        "Courtyard curtains stood about 5 cubits (~7.5 ft): taller than a man, but not a towering fortress wall.",
        "Aaron wears a wrapped linen turban / mitre — not a crown, helmet, or modern hat.",
        "The gold plate (the “frontlet”) is tied on with a blue cord.",
        "Its inscription is Hebrew — קֹדֶשׁ לַיהוָה (Qodesh LaYHWH, “Holy to the LORD”) — never English lettering.",
        "Sinai-era writing likely looked like early Hebrew / ancient Semitic script, not later square-Hebrew block letters.",
      ],
    },
  ],

  "mark-6": [
    {
      label: "Scene Check",
      title: "A small hometown and a deceptively dangerous lake",
      body:
        "Don’t picture Nazareth as a grand city — it was a small Galilean hometown, the kind of place where everyone knew Jesus as “the carpenter.” And the Sea of Galilee is a lake, but a big one, low and ringed by hills, where sudden squalls turn deadly fast. The fear in the boat was not exaggerated.",
      relatedVerses: ["Mark 6:1–3", "Mark 6:47–51"],
      visualAccuracyNotes: [
        "Nazareth ≈ a modest village of a few hundred people, not a city skyline.",
        "The Sea of Galilee is a freshwater lake (~13 mi long), but storms off the hills are real and dangerous.",
        "First-century fishing boats were small wooden working craft — not a large ship.",
      ],
    },
    {
      label: "Scene Check",
      title: "Not a tidy picnic, and not a glamorous feast",
      body:
        "Feeding the five thousand wasn’t a neat church potluck — it was a huge, hungry crowd in a remote place with no food for miles. And Herod’s banquet wasn’t simply glamorous; it was a tense, politically dangerous world where a dancer’s request could cost a prophet his head.",
      relatedVerses: ["Mark 6:34–44", "Mark 6:21–28"],
      visualAccuracyNotes: [
        "Five thousand men (plus women and children) — a massive crowd on open ground, not rows of pews.",
        "Herod’s court should feel politically charged and uneasy, not merely opulent for its own sake.",
      ],
    },
  ],
};

export function getSceneChecks(slug: string): SceneCheck[] | null {
  return CHAPTER_SCENE_CHECKS[slug] ?? null;
}
