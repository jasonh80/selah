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

export const GeneratedImageKindSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Image kind must be a lowercase kebab-case ID",
  );

export const GeneratedImageSchema = z.object({
  // `type` is the stored image-kind ID. The field name stays unchanged so
  // legacy establishing/detail/human workups remain readable.
  type: GeneratedImageKindSchema,
  title: z.string(),
  description: z.string(),
  prompt: z.string(),
  imageUrl: z.string().optional(), // filled after image generation/storage
  alt: z.string(),
  caption: z.string(),
  status: z.enum(["placeholder", "generating", "complete", "failed"]),
});
export type GeneratedImage = z.infer<typeof GeneratedImageSchema>;

const GeneratedImagesSchema = z
  .array(GeneratedImageSchema)
  .refine((images) => images.length === 3 || images.length === 5, {
    message: "Choose exactly 3 or 5 chapter-specific images",
  })
  .superRefine((images, ctx) => {
    const firstIndexByType = new Map<string, number>();
    images.forEach((image, index) => {
      const firstIndex = firstIndexByType.get(image.type);
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "type"],
          message: `Image kinds must be unique; ${image.type} also appears at index ${firstIndex}`,
        });
      } else {
        firstIndexByType.set(image.type, index);
      }
    });
  });

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

const VerseByVerseSchema = z
  .object({
    // New drafts use numeric inclusive bounds so coverage can be verified.
    // `range` remains optional for legacy fixtures created before this contract.
    startVerse: z.number().int().positive().optional(),
    endVerse: z.number().int().positive().optional(),
    rangeLabel: z.string().optional(),
    range: z.string().optional(),
    title: z.string(),
    explanation: z.string(),
    jesusConnection: z.string().optional(),
    application: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasStart = value.startVerse !== undefined;
    const hasEnd = value.endVerse !== undefined;
    const hasNumericRange =
      hasStart && hasEnd;
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide both startVerse and endVerse, or neither",
      });
    }
    if (!hasNumericRange && !value.range?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide startVerse/endVerse or a legacy range",
      });
    }
    if (
      value.range?.trim() &&
      !/^\d+(?:\s*[-–]\s*\d+)?$/.test(value.range.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "Legacy range must be a verse number or inclusive number range",
      });
    }
    if (
      hasNumericRange &&
      (value.startVerse as number) > (value.endVerse as number)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startVerse must be less than or equal to endVerse",
      });
    }
  });

const WhatPeopleAskSchema = z.object({
  question: z.string(),
  answer: z.string(),
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

// Scene Check — corrects a common wrong mental image; visualAccuracyNotes also
// guard future image generation.
const SceneCheckGenSchema = z.object({
  title: z.string(),
  body: z.string(),
  relatedVerses: z.array(z.string()).optional(),
  visualAccuracyNotes: z.array(z.string()).optional(),
});

// Behind the Chapter — author / first audience / historical world / evidence.
const BehindCardSchema = z.object({ title: z.string(), body: z.string() });
const BehindTheChapterSchema = z.object({
  author: BehindCardSchema,
  firstAudience: BehindCardSchema,
  historicalWorld: BehindCardSchema,
  evidence: BehindCardSchema,
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
  // Reader-display metadata only. Generation-source provenance is server-owned
  // and belongs in the fail-closed manifest, not in model-authored output.
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

export const GeneratedChapterWorkupSchema = z
  .object({
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
  // Optional only so workups created before chapter-selected heroes still
  // parse. New Mark drafts must provide it through the quality gate.
  heroKind: GeneratedImageKindSchema.optional(),
  generatedImages: GeneratedImagesSchema,
  verseByVerse: z.array(VerseByVerseSchema),
  // Optional only for legacy fixtures. The generation-only quality gate requires
  // 5-8 complete items before a new draft can become Preview Ready.
  whatPeopleAsk: z.array(WhatPeopleAskSchema).optional(),
  goDeeper: GoDeeperSchema,

  // Rich two-layer content (optional so older fixtures still validate; required
  // for newly generated chapters via the prompt).
  chapterSpecificTopics: z.array(ChapterTopicSchema).optional(),
  sections: z.array(SectionSchema).optional(),
  biblicalTimeline: BiblicalTimelineSchema.optional(),
  sceneChecks: z.array(SceneCheckGenSchema).optional(),
  behindTheChapter: BehindTheChapterSchema.optional(),

  // metadata placeholders
  bibleText: BibleTextSchema,
  cost: CostSchema,
  })
  .superRefine((workup, ctx) => {
    if (
      workup.heroKind !== undefined &&
      !workup.generatedImages.some((image) => image.type === workup.heroKind)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["heroKind"],
        message: "heroKind must match one generatedImages type",
      });
    }
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
