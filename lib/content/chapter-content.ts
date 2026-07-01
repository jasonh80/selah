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
  "mark-6": "Around AD 30, in Galilee under Herod Antipas.",
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
  "mark-6": {
    establishing: "The World of Mark 6: Galilee",
    detail: "Five Barley Loaves and Two Fish",
    human: "A Wilderness Full of People, Fed",
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
  // Section-anchored notes (each sits at the first verse of its scene).
  "mark-6": {
    1: "Rejected at home: familiarity closes its eyes. The people who watched Jesus grow up can’t get past “the carpenter.” Knowing about Jesus is not the same as receiving Him.",
    7: "Sending the Twelve: two by two, with almost nothing — training dependence, not glorifying poverty. Ordinary, unpolished people start carrying His mission.",
    14: "Herod’s court: Mark cuts away to show what worldly power looks like — a king who fears his guests more than doing wrong. John dies because Herod protected his image over the truth.",
    30: "The wilderness banquet: Jesus sees a crowd like sheep without a shepherd, and feeds them. Herod’s feast ended in death; Jesus’ ends in leftovers — twelve baskets full.",
    45: "Walking on the water: Jesus “means to pass by” — Old Testament language for God revealing His glory. He does what only God does. Yet the disciples are terrified; they had not understood the loaves.",
    53: "Gennesaret: the chapter that began with a hometown refusing Jesus ends with strangers desperate just to touch the edge of His cloak.",
  },
};

export function getVerseNotes(slug: string): Record<number, string> | null {
  return CHAPTER_VERSE_NOTES[slug] ?? null;
}

// ---- What People Ask (static, approved FAQ — not a live Ask tool yet) -------
export interface FaqItem {
  question: string;
  answer: string;
}

export const CHAPTER_FAQ: Record<string, FaqItem[]> = {
  "mark-6": [
    {
      question: "Why could Jesus do no mighty work in Nazareth?",
      answer:
        "It wasn’t that Jesus lost His power at the town line. Mark says He “could do no mighty work there” because of their unbelief — not because their doubt overpowered Him, but because miracles were never meant for people who had already decided not to trust Him. He still healed a few sick people. But Nazareth wanted a hometown boy they could explain, not a Messiah they had to follow. Unbelief doesn’t handcuff Jesus; it just refuses what He offers.",
    },
    {
      question: "Why did Jesus send the Twelve with almost nothing?",
      answer:
        "No bread, no bag, no money — just a staff and sandals. That sounds harsh until you see what He was doing. He wasn’t glorifying poverty; He was training dependence. If He sent them, He would sustain them, through the hospitality of others and the provision of God. Traveling light also kept the mission about the message, not their supplies. They had to trust before they could see how it would work out.",
    },
    {
      question: "Why was John the Baptist killed?",
      answer:
        "On the surface: a girl danced, a king made a drunken promise, and a grudge got its moment. Underneath: Herod feared looking weak in front of powerful guests more than he feared killing an innocent man. He knew John was righteous. He even liked listening to him. But when the moment came, he protected his image instead of the truth. John died because a ruler had power and no backbone.",
    },
    {
      question: "Why does Mark count 5,000 men?",
      answer:
        "Mark gives the counted category — 5,000 men — the way ancient crowds were often numbered. Matthew adds that women and children were there too. So the real crowd was larger, probably much larger. The safest way to say it: more than 5,000 people, with 5,000 men counted, plus women and children present. The point isn’t the exact headcount; it’s that Jesus fed a wilderness full of hungry people from a boy’s lunch — and had leftovers.",
    },
    {
      question: "What does it mean that Jesus intended to pass by the disciples?",
      answer:
        "It’s a strange line — “He meant to pass by them.” It doesn’t mean He was going to ignore them. In the Old Testament, “passing by” is how God reveals His glory; He “passed by” Moses and Elijah. Mark is borrowing that same language. Jesus walking on the sea and “passing by” is a quiet claim that the One out on the water is doing what only God does. He wasn’t abandoning them; He was showing them who He is.",
    },
    {
      question: "Why did the disciples not understand the loaves?",
      answer:
        "Mark says their hearts were hardened — not evil, just slow and scared. They had just watched Jesus feed thousands from almost nothing, but when the storm hit, they panicked as if they’d never seen Him provide. The feeding was meant to teach them who He was, and they missed the lesson. It’s a warning we can feel: you can benefit from Jesus’ power and still not grasp His person. You can hold the leftovers and miss the point.",
    },
    {
      question: "Where is Gennesaret?",
      answer:
        "Gennesaret is a small, fertile plain on the northwest shore of the Sea of Galilee, just south of Capernaum — less a single town than a rich stretch of farmland and villages. When the boat lands there, the whole region recognizes Jesus and rushes the sick to Him. The chapter that opened with a hometown refusing Him ends with strangers desperate just to touch the edge of His cloak.",
    },
  ],
};

export function getChapterFaq(slug: string): FaqItem[] | null {
  return CHAPTER_FAQ[slug] ?? null;
}

// ---- Image plan (concepts only — NOT generated) ----------------------------
// The 3 Selah visual roles per chapter. Prompts are approved concepts staged for
// the image stage; image generation stays OFF until explicitly enabled.
export interface ImagePlanConcept {
  kind: "establishing" | "detail" | "human";
  role: "Orient Me" | "Reveal Something" | "Let Me Feel It";
  title: string;
  description: string;
  prompt: string;
}

export const CHAPTER_IMAGE_PLAN: Record<string, ImagePlanConcept[]> = {
  "mark-6": [
    {
      kind: "establishing",
      role: "Orient Me",
      title: "The World of Mark 6: Galilee",
      description: "The wider stage of the chapter — the Sea of Galilee, low hills, and small villages where two kingdoms collide.",
      prompt:
        "Wide photorealistic historical landscape of Galilee around AD 29 in late-afternoon light: the freshwater Sea of Galilee, low brown hills, a small stone village on a hillside, a single wooden fishing boat on the water, dry grass, dust in the air. Documentary realism, natural light, no modern objects, no text, no fantasy glow.",
    },
    {
      kind: "detail",
      role: "Reveal Something",
      title: "Five Barley Loaves and Two Fish",
      description: "What abundance from almost nothing actually looked like — the real food, not bakery bread.",
      prompt:
        "Honest close-up historical detail: small rough barley flatbreads and small dried fish in worn woven baskets, weathered first-century hands breaking a coarse loaf. Earthy, imperfect, real. Photorealistic documentary style, natural light, no modern bakery bread, no text, no fantasy glow.",
    },
    {
      kind: "human",
      role: "Let Me Feel It",
      title: "A Wilderness Full of People, Fed",
      description: "The feeding of the 5,000 — compassion for a crowd like sheep without a shepherd. Uses the approved Mark 6 feeding-of-the-5,000 image-direction example.",
      prompt:
        "Photorealistic historical scene from Mark 6, the feeding of the 5,000, set in Galilee around AD 29 on a remote grassy hillside above the Sea of Galilee. A massive crowd of ordinary first-century Jewish villagers — 5,000 adult men counted, with women and children also present — seated and reclining in loose, uneven family groups. Jesus appears as an ordinary first-century Galilean Jewish man in worn earth-toned clothing, not glowing, not idealized, near the center but naturally placed, quietly breaking rough barley flatbreads and handing pieces to the disciples, who move through the crowd with simple baskets of barley loaves and dried fish. Woven wool and linen garments, leather sandals, dusty feet, sun-worn faces, wind, dry grass, cloaks on the ground, children with families, the Sea of Galilee visible beyond. True photorealism, anamorphic 35mm film still, strong late-afternoon directional light, dust haze, warm rim light. No halos, no text, no modern objects, no Europeanized faces, no oversized bakery bread, no movie-poster posing.",
    },
  ],
};

export function getChapterImagePlan(slug: string): ImagePlanConcept[] | null {
  return CHAPTER_IMAGE_PLAN[slug] ?? null;
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
