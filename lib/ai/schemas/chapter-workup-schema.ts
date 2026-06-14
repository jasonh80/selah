import { z } from "zod";

/**
 * Canonical GLOBAL chapter workup — the strict contract the AI must return.
 * One shared workup per chapter. This is the *content* model (what is generated
 * and stored). It is intentionally separate from the render/view model in
 * `lib/types.ts` (`ChapterWorkup`); a thin adapter maps this → that at pipeline
 * time (see lib/ai/adapters/generated-to-workup.ts).
 *
 * Personalized user content is NEVER part of this object — see
 * lib/personalization/types.ts.
 */

export const GeneratedImageSchema = z.object({
  type: z.enum(["establishing", "detail", "human"]),
  title: z.string(),
  description: z.string(),
  prompt: z.string(),
  imageUrl: z.string().optional(), // filled after image generation/storage
  alt: z.string(),
  caption: z.string(),
  status: z.enum(["placeholder", "generating", "complete", "failed"]),
});
export type GeneratedImage = z.infer<typeof GeneratedImageSchema>;

const MapSchema = z.object({
  title: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
  // Be honest about debated places: "Approximate region", "Traditional
  // location", "Exact site debated", "Possible route".
  uncertaintyNote: z.string().optional(),
});

const KeyObjectSchema = z.object({
  title: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
});

const KeyPersonSchema = z.object({
  name: z.string(),
  role: z.string(),
  estimatedAge: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
});

const TimelineSchema = z.object({
  label: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      active: z.boolean().optional(),
    }),
  ),
});

const TheologyPrincipleSchema = z.object({
  name: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  explanation: z.string(),
});

const JesusConnectionSchema = z.object({
  short: z.string(),
  full: z.string(),
  relatedPassages: z.array(z.string()),
});

const GoDeeperItemSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const GoDeeperSchema = z.object({
  learnMore: z.array(GoDeeperItemSchema),
  diveDeeper: z.array(GoDeeperItemSchema),
  growCloser: z.array(GoDeeperItemSchema),
});

const VerseByVerseSchema = z.object({
  range: z.string(),
  title: z.string(),
  explanation: z.string(),
  jesusConnection: z.string().optional(),
  application: z.string().optional(),
});

// Rich daily-rundown sections: a short card summary + the full expanded content,
// revealed progressively in the UI. The model chooses chapter-specific topics
// first, then writes these.
export const SECTION_TYPES = [
  "big_idea",
  "chapter_flow",
  "historical_world",
  "verse_by_verse",
  "what_most_people_miss",
  "original_language",
  "jesus_connection",
  "theology",
  "application",
  "prayer",
  "map_notes",
  "image_plan",
  "custom",
] as const;

const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(SECTION_TYPES),
  priority: z.number(),
  cardSummary: z.string(), // short, polished, for the UI card
  fullContent: z.string(), // the complete expanded daily-rundown section
  verseRefs: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  isCore: z.boolean(),
});
export type WorkupSection = z.infer<typeof SectionSchema>;

const ChapterTopicSchema = z.object({
  title: z.string(),
  reason: z.string(),
  priority: z.number(),
});

// Honest placement in the big biblical story. Uncertain dates stay uncertain.
const BiblicalTimelineSchema = z.object({
  era: z.string(),
  estimatedYear: z.number().optional(), // negative = BC/BCE
  estimatedYearLabel: z.string(),
  dateRange: z.object({ startYear: z.number(), endYear: z.number() }).optional(),
  confidence: z.enum(["high", "medium", "low", "debated"]),
  chronologyBasis: z.string(),
  uncertaintyNote: z.string(),
  placementReason: z.string(),
});

const BibleTextSchema = z.object({
  // Placeholder/source metadata only — Selah does not store licensed text yet.
  version: z.string(),
  source: z.string().optional(),
  note: z.string().optional(),
  // Optional placeholder selected verses for the prototype (real text comes
  // from a licensed Bible source later).
  verses: z
    .array(
      z.object({
        number: z.number().int(),
        text: z.string(),
        redLetter: z.boolean().optional(),
      }),
    )
    .optional(),
});

const CostSchema = z
  .object({
    textEstimateUsd: z.number().optional(),
    imageEstimateUsd: z.number().optional(),
    totalEstimateUsd: z.number().optional(),
    cached: z.boolean().optional(),
  })
  .optional();

export const GeneratedChapterWorkupSchema = z.object({
  // identity + record
  book: z.string(),
  chapter: z.number().int().positive(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  status: z.enum(["draft", "generating", "ready", "failed", "reviewed"]),
  version: z.string(),
  reviewedAt: z.string().optional(),
  theme: z.string(), // one-line theme, e.g. "Holy access to God"

  // setting
  estimatedDate: z.string(),
  estimatedLocation: z.string(),
  modernLocationNote: z.string().optional(),
  primaryCharacters: z.array(z.string()),

  // narrative
  summary: z.string(),
  sceneSetter: z.string(),
  historicalContext: z.string(),
  whatHappens: z.string(),
  whatPeopleMiss: z.string(),

  // Jesus-centered
  jesusConnection: JesusConnectionSchema,
  theologyPrinciple: TheologyPrincipleSchema,
  application: z.string(),
  prayer: z.string(),

  // structured blocks
  timeline: TimelineSchema,
  maps: z.object({ modern: MapSchema, historic: MapSchema }),
  keyObjects: z.array(KeyObjectSchema),
  keyPeople: z.array(KeyPersonSchema),
  generatedImages: z
    .array(GeneratedImageSchema)
    .length(3, "Exactly 3 images: establishing, detail, human"),
  verseByVerse: z.array(VerseByVerseSchema),
  goDeeper: GoDeeperSchema,

  // Rich two-layer content (optional so older fixtures still validate; required
  // for newly generated chapters via the prompt).
  chapterSpecificTopics: z.array(ChapterTopicSchema).optional(),
  sections: z.array(SectionSchema).optional(),
  biblicalTimeline: BiblicalTimelineSchema.optional(),

  // metadata placeholders
  bibleText: BibleTextSchema,
  cost: CostSchema,
});

export type GeneratedChapterWorkup = z.infer<typeof GeneratedChapterWorkupSchema>;

/**
 * Parse + validate a raw model response. Throws a clear, path-annotated error
 * if the JSON is malformed or does not match the schema. Calls no API.
 */
export function parseChapterWorkupJson(raw: string): GeneratedChapterWorkup {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Chapter workup is not valid JSON: ${(e as Error).message}`);
  }

  const result = GeneratedChapterWorkupSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Chapter workup failed schema validation:\n${issues}`);
  }
  return result.data;
}
