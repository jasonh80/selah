import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChapterWorkupPrompt } from "../lib/ai/prompts/chapter-workup-prompt";
import {
  parseChapterWorkupJson,
  type GeneratedChapterWorkup,
} from "../lib/ai/schemas/chapter-workup-schema";
import { generatedToRenderWorkup } from "../lib/ai/adapters/generated-to-workup";
import {
  evaluateMarkSprintDraft,
  getMarkSprintChapterContract,
} from "../lib/ai/quality/mark-sprint-quality";
import guidance from "../lib/server/mark-sprint-guidance.v1.json";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  "../lib/ai/fixtures/exodus-27-generated.json",
);
const legacyFixture = parseChapterWorkupJson(
  readFileSync(fixturePath, "utf8"),
);

function prose(label: string, detail: string): string {
  return `${label} is synthetic validation copy, not publishable chapter content. ${detail} It exists only to prove that the strict authoring contract preserves substantive, distinct fields and fails safely when required evidence disappears.`;
}

function passingDraft(slug: string): GeneratedChapterWorkup {
  const expected = getMarkSprintChapterContract(slug);
  assert.ok(expected, `missing contract for ${slug}`);
  const chapter = expected.chapter;
  const coreTypes: NonNullable<GeneratedChapterWorkup["sections"]>[number]["type"][] = [
    "big_idea",
    "chapter_flow",
    "historical_world",
    "what_most_people_miss",
    "jesus_connection",
    "theology",
    "application",
    "prayer",
  ];

  return {
    ...legacyFixture,
    book: "Mark",
    chapter,
    slug,
    title: `Mark ${chapter}`,
    subtitle: `A Fresh Synthetic Editorial Title for Mark ${chapter}`,
    status: "draft",
    version: "quality-fixture-1",
    reviewedAt: undefined,
    theme: "Synthetic chapter-specific validation theme",
    estimatedDate: "Around AD 30",
    estimatedLocation: "Galilee and Judea with uncertainty retained",
    modernLocationNote:
      "Synthetic modern-location note that preserves the difference between ancient regions and modern borders.",
    primaryCharacters: ["Jesus", "The disciples"],
    summary: prose(
      `${slug} summary`,
      "The summary names the chapter's movements without quoting Scripture or collapsing the whole chapter into one scene.",
    ),
    sceneSetter: prose(
      `${slug} scene setter`,
      "The scene setter orients the reader to people, movement, and place while keeping uncertain details visibly uncertain.",
    ),
    historicalContext: prose(
      `${slug} historical context`,
      "The historical field distinguishes text, reconstruction, interpretation, and unknowns in accessible language.",
    ),
    whatHappens: prose(
      `${slug} chapter movement`,
      "The movement field follows every required scene in order and retains the chapter's breadth.",
    ),
    whatPeopleMiss: prose(
      `${slug} overlooked detail`,
      "The overlooked-detail field corrects a common assumption without inventing motives, geography, or parallel-Gospel facts.",
    ),
    jesusConnection: {
      short: "Jesus at the center",
      full: prose(
        `${slug} Jesus connection`,
        "The connection grows from Mark's own narrative and does not use forced typology or erase the passage's first meaning.",
      ),
      relatedPassages: ["Mark 1:1", "Mark 8:29"],
    },
    theologyPrinciple: {
      name: "Discipleship",
      level: "beginner",
      explanation: prose(
        `${slug} theology`,
        "The principle begins plainly and keeps narrative claims distinct from later theological synthesis.",
      ),
    },
    application: prose(
      `${slug} application`,
      "The application is invitational and chapter-shaped without guarantees, blame, coercion, or unsafe counsel.",
    ),
    prayer: prose(
      `${slug} prayer`,
      "The prayer responds to this chapter in natural language without manipulating God or promising a particular outcome.",
    ),
    timeline: {
      label: "Synthetic Mark journey",
      items: [
        { title: "Before", description: "Earlier movement", active: false },
        { title: `Mark ${chapter}`, description: "Current chapter", active: true },
        { title: "After", description: "Following movement", active: false },
      ],
    },
    maps: {
      modern: {
        title: "Modern orientation",
        description: prose(
          `${slug} modern map`,
          "The map separates present-day labels from ancient political regions and avoids false precision.",
        ),
        uncertaintyNote: "Representative geography; no exact route is claimed.",
      },
      historic: {
        title: "Historic orientation",
        description: prose(
          `${slug} historic map`,
          "The map uses ancient regions and certainty labels to explain movement without fabricating coordinates.",
        ),
        uncertaintyNote: "Ancient boundaries and event sites remain approximate.",
      },
    },
    keyObjects: [
      { title: "Synthetic object one", description: "Distinct teaching object." },
      { title: "Synthetic place two", description: "Distinct geographic context." },
    ],
    keyPeople: [
      {
        name: "Jesus",
        role: "Central figure",
        description: "A preserved description for adapter validation.",
      },
      {
        name: "The disciples",
        role: "Learners in the narrative",
        description: "A second preserved description.",
      },
    ],
    generatedImages: [
      {
        type: "establishing",
        title: "Synthetic establishing concept",
        description: prose(
          `${slug} establishing description`,
          "This broad scene establishes only the reviewed people, place, and scale for this Mark chapter.",
        ),
        prompt: prose(
          `${slug} establishing prompt`,
          "Create a people-first, historically responsible wide composition with no imported parallel-Gospel details.",
        ),
        alt: `Synthetic accessible establishing image description for ${slug}.`,
        caption: `Synthetic reviewed establishing caption for ${slug}.`,
        status: "placeholder",
      },
      {
        type: "detail",
        title: "Synthetic detail concept",
        description: prose(
          `${slug} detail description`,
          "This detail teaches one chapter-specific object or setting without false precision.",
        ),
        prompt: prose(
          `${slug} detail prompt`,
          "Create a historically grounded close view with accurate materials and no pseudo-readable sacred text.",
        ),
        alt: `Synthetic accessible detail image description for ${slug}.`,
        caption: `Synthetic reviewed detail caption for ${slug}.`,
        status: "placeholder",
      },
      {
        type: "human",
        title: "Synthetic human concept",
        description: prose(
          `${slug} human description`,
          "This human moment centers dignity and observable action without inventing interior psychology.",
        ),
        prompt: prose(
          `${slug} human prompt`,
          "Create a restrained people-centered moment with historically credible clothing, setting, and emotion.",
        ),
        alt: `Synthetic accessible human image description for ${slug}.`,
        caption: `Synthetic reviewed human-moment caption for ${slug}.`,
        status: "placeholder",
      },
    ],
    verseByVerse: expected.required_movements.map((movement) => ({
      startVerse: movement.startVerse,
      endVerse: movement.endVerse,
      rangeLabel:
        movement.startVerse === movement.endVerse
          ? String(movement.startVerse)
          : `${movement.startVerse}–${movement.endVerse}`,
      title: `Movement ${movement.id}`,
      explanation: prose(
        `${slug} ${movement.id}`,
        `This entry covers verses ${movement.startVerse} through ${movement.endVerse} as one reviewed natural movement.`,
      ),
    })),
    whatPeopleAsk: Array.from({ length: 5 }, (_, index) => ({
      question: `What is the chapter-specific synthetic question number ${index + 1}?`,
      answer: prose(
        `${slug} FAQ ${index + 1}`,
        "The answer addresses a real interpretive or pastoral concern accurately and without quoting a Bible translation.",
      ),
    })),
    goDeeper: {
      learnMore: [1, 2].map((index) => ({
        title: `Learn more ${index}`,
        description: `Synthetic ${slug} historical learning direction ${index}.`,
      })),
      diveDeeper: [1, 2].map((index) => ({
        title: `Dive deeper ${index}`,
        description: `Synthetic ${slug} interpretive study direction ${index}.`,
      })),
      growCloser: [1, 2].map((index) => ({
        title: `Grow closer ${index}`,
        description: `Synthetic ${slug} prayer and practice direction ${index}.`,
      })),
    },
    chapterSpecificTopics: Array.from({ length: 3 }, (_, index) => ({
      title: `Synthetic topic ${index + 1}`,
      reason: `This topic proves ${slug} topic ${index + 1} survives the authoring adapter.`,
      priority: index + 1,
    })),
    sections: coreTypes.map((type, index) => ({
      id: `${type}-${index + 1}`,
      title: `Synthetic ${type.replaceAll("_", " ")} section`,
      type,
      priority: index + 1,
      isCore: true,
      cardSummary: `A distinct chapter-specific summary for ${type} in ${slug}.`,
      fullContent: prose(
        `${slug} ${type} section`,
        `This unique body tests the ${type} requirement and contains enough structured material for a meaningful owner review.`,
      ),
    })),
    biblicalTimeline: {
      era: "Life of Jesus",
      estimatedYear: 30,
      estimatedYearLabel: "Around AD 30, in Jesus' ministry world",
      dateRange: { startYear: 29, endYear: 31 },
      confidence: "medium",
      chronologyBasis: "Narrative event placement",
      uncertaintyNote: "The exact event date is not stated in Mark.",
      placementReason: "The chapter belongs to Jesus' public ministry.",
    },
    sceneChecks: [
      {
        title: "Synthetic visual correction",
        body: prose(
          `${slug} Scene Check`,
          "This correction distinguishes a text-explicit visual detail from a popular but unsupported mental picture.",
        ),
        relatedVerses: [`Mark ${chapter}:1`],
        visualAccuracyNotes: ["Use only text-supported people, objects, and geography."],
      },
    ],
    behindTheChapter: {
      author: {
        title: "Authorship and tradition",
        body: prose(
          `${slug} author card`,
          "This card distinguishes the Gospel's internal anonymity from early Christian attribution.",
        ),
      },
      firstAudience: {
        title: "First audience",
        body: prose(
          `${slug} audience card`,
          "This card names plausible audience evidence without presenting a debated city or community as certain.",
        ),
      },
      historicalWorld: {
        title: "Historical world",
        body: prose(
          `${slug} world card`,
          "This card grounds the chapter in first-century Jewish life under Roman and Herodian power.",
        ),
      },
      evidence: {
        title: "Evidence and artifacts",
        body: prose(
          `${slug} evidence card`,
          "This card names only relevant manuscript, archaeological, or geographic evidence and states its limits.",
        ),
      },
    },
    bibleText: { version: "ESV" },
  };
}

function hasCode(report: ReturnType<typeof evaluateMarkSprintDraft>, code: string) {
  return report.blockers.some((finding) => finding.code === code);
}

for (const slug of ["mark-8", "mark-9", "mark-10", "mark-11"]) {
  const parsed = parseChapterWorkupJson(JSON.stringify(passingDraft(slug)));
  const report = evaluateMarkSprintDraft(parsed, slug);
  const expected = getMarkSprintChapterContract(slug);
  assert.ok(expected);
  assert.equal(
    report.machineVerdict,
    "pass",
    `${slug}: ${JSON.stringify(report.blockers)}`,
  );
  assert.equal(report.overallStatus, "needs_owner_review");
  assert.deepEqual(report.manualChecks.guardrails, expected.manual_guardrails);
  assert.deepEqual(report.manualChecks.textualVariants, expected.textual_variants);
  assert.ok(report.manualChecks.guardrails.length > 0);
  assert.equal(report.blockers.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.deepEqual(
    report,
    evaluateMarkSprintDraft(parsed, slug),
    `${slug} quality result must be deterministic`,
  );
}

const base = passingDraft("mark-8");

const wrongIdentity = { ...base, slug: "mark-9" };
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(wrongIdentity)),
      "mark-8",
    ),
    "STR-002 OUTPUT_IDENTITY_MISMATCH",
  ),
);

const missingFaq = { ...base, whatPeopleAsk: undefined };
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(missingFaq)),
      "mark-8",
    ),
    "STR-004 EMPTY_REQUIRED_CONTENT",
  ),
);

const missingMovement = {
  ...base,
  verseByVerse: base.verseByVerse.slice(0, -1),
};
const missingMovementReport = evaluateMarkSprintDraft(
  parseChapterWorkupJson(JSON.stringify(missingMovement)),
  "mark-8",
);
assert.ok(hasCode(missingMovementReport, "COV-002 VERSE_COVERAGE_GAP"));
assert.ok(hasCode(missingMovementReport, "COV-003 MOVEMENT_RANGE_UNCOVERED"));

const storedScripture = {
  ...base,
  bibleText: {
    version: "ESV",
    verses: [{ number: 1, text: "synthetic stored verse text" }],
  },
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(storedScripture)),
      "mark-8",
    ),
    "SAFE-001 STORED_SCRIPTURE_TEXT",
  ),
);

const wrongReaderVersion = {
  ...base,
  bibleText: { version: "OEB" },
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(wrongReaderVersion)),
      "mark-8",
    ),
    "MNF-005 SOURCE_METADATA_INCOMPLETE",
  ),
);

const modelAuthoredProvenance = {
  ...base,
  bibleText: { version: "ESV", source: "model-authored source claim" },
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(modelAuthoredProvenance)),
      "mark-8",
    ),
    "SAFE-004 PROMPT_RULE_ADMIN_LEAKAGE",
  ),
);

const prefilledImageUrl = {
  ...base,
  generatedImages: [
    { ...base.generatedImages[0], imageUrl: " " },
    ...base.generatedImages.slice(1),
  ],
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(prefilledImageUrl)),
      "mark-8",
    ),
    "STR-008 IMAGE_CONCEPT_CONTRACT_INVALID",
  ),
);

const emptyReviewTimestamp = { ...base, reviewedAt: "" };
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(emptyReviewTimestamp)),
      "mark-8",
    ),
    "STR-003 INVALID_DRAFT_STATUS",
  ),
);

const duplicateSection = {
  ...base,
  sections: [
    ...base.sections,
    { ...base.sections[0], priority: 99 },
  ],
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(duplicateSection)),
      "mark-8",
    ),
    "STR-006 DUPLICATE_SECTION_ID",
  ),
);

const duplicateImageKinds = {
  ...base,
  generatedImages: base.generatedImages.map((image) => ({
    ...image,
    type: "establishing" as const,
  })),
};
assert.throws(
  () => parseChapterWorkupJson(JSON.stringify(duplicateImageKinds)),
  /exactly one detail/,
);

const swappedImageOrder = {
  ...base,
  generatedImages: [
    base.generatedImages[1],
    base.generatedImages[0],
    base.generatedImages[2],
  ],
};
const parsedSwappedImages = parseChapterWorkupJson(
  JSON.stringify(swappedImageOrder),
);
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(parsedSwappedImages, "mark-8"),
    "STR-008 IMAGE_CONCEPT_CONTRACT_INVALID",
  ),
);
assert.deepEqual(
  generatedToRenderWorkup(parsedSwappedImages).images.map((image) => image.kind),
  ["establishing", "detail", "human"],
  "legacy unique image kinds may parse out of order, but the adapter normalizes them",
);

const partialNumericRange = {
  ...base,
  verseByVerse: [
    { ...base.verseByVerse[0], endVerse: undefined, range: "1-10" },
    ...base.verseByVerse.slice(1),
  ],
};
assert.throws(
  () => parseChapterWorkupJson(JSON.stringify(partialNumericRange)),
  /Provide both startVerse and endVerse/,
);

const malformedLegacyRange = {
  ...base,
  verseByVerse: [
    {
      range: "not-a-range",
      title: "Malformed legacy range fixture",
      explanation:
        "This synthetic explanation is long enough to isolate validation of the malformed range value itself.",
    },
  ],
};
assert.throws(
  () => parseChapterWorkupJson(JSON.stringify(malformedLegacyRange)),
  /Legacy range must be a verse number/,
);

const mixedCompleteRange = {
  ...base,
  verseByVerse: [
    { ...base.verseByVerse[0], range: "1-10" },
    ...base.verseByVerse.slice(1),
  ],
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(mixedCompleteRange)),
      "mark-8",
    ),
    "COV-001 VERSE_RANGE_INVALID",
  ),
);

const conflictingRangeLabel = {
  ...base,
  verseByVerse: [
    { ...base.verseByVerse[0], rangeLabel: "99" },
    ...base.verseByVerse.slice(1),
  ],
};
const conflictingRangeReport = evaluateMarkSprintDraft(
  parseChapterWorkupJson(JSON.stringify(conflictingRangeLabel)),
  "mark-8",
);
assert.ok(hasCode(conflictingRangeReport, "COV-001 VERSE_RANGE_INVALID"));
assert.equal(
  generatedToRenderWorkup(
    parseChapterWorkupJson(JSON.stringify(conflictingRangeLabel)),
  ).verseByVerse?.[0]?.rangeLabel,
  "1–10",
  "numeric bounds must control visible passage-flow labels",
);

const emptyDashboardData = {
  ...base,
  primaryCharacters: [],
  keyObjects: [],
  keyPeople: [],
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(emptyDashboardData)),
      "mark-8",
    ),
    "STR-004 EMPTY_REQUIRED_CONTENT",
  ),
);

const missingMapUncertainty = {
  ...base,
  maps: {
    ...base.maps,
    modern: { ...base.maps.modern, uncertaintyNote: undefined },
  },
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(missingMapUncertainty)),
      "mark-8",
    ),
    "STR-004 EMPTY_REQUIRED_CONTENT",
  ),
);

const overlappingFlow = {
  ...base,
  verseByVerse: [
    base.verseByVerse[0],
    { ...base.verseByVerse[1], startVerse: 10, rangeLabel: "10–13" },
    ...base.verseByVerse.slice(2),
  ],
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(overlappingFlow)),
      "mark-8",
    ),
    "COV-001 VERSE_RANGE_INVALID",
  ),
);

const duplicateFaqAnswer = {
  ...base,
  whatPeopleAsk: base.whatPeopleAsk.map((item, index) =>
    index === 1 ? { ...item, answer: base.whatPeopleAsk[0].answer } : item,
  ),
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(duplicateFaqAnswer)),
      "mark-8",
    ),
    "STR-010 EXACT_DUPLICATE_CONTENT",
  ),
);

const invertedTimelineRange = {
  ...base,
  biblicalTimeline: {
    ...base.biblicalTimeline,
    dateRange: { startYear: 31, endYear: 29 },
  },
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(invertedTimelineRange)),
      "mark-8",
    ),
    "STR-004 EMPTY_REQUIRED_CONTENT",
  ),
);

const promptEchoTimeline = {
  ...base,
  biblicalTimeline: {
    ...base.biblicalTimeline,
    era: "<one of the listed biblical eras from the prompt>",
    estimatedYearLabel:
      "<confident visible timeline copy copied from the prompt template>",
    chronologyBasis: "<traditional event date or likely composition date>",
    uncertaintyNote:
      "<dating nuance for the transparency drawer only, copied placeholder>",
    placementReason:
      "<why you placed the chapter here, copied placeholder text>",
  },
};
assert.ok(
  hasCode(
    evaluateMarkSprintDraft(
      parseChapterWorkupJson(JSON.stringify(promptEchoTimeline)),
      "mark-8",
    ),
    "STR-004 EMPTY_REQUIRED_CONTENT",
  ),
);

const genericSubtitle = { ...base, subtitle: base.title };
const genericSubtitleReport = evaluateMarkSprintDraft(
  parseChapterWorkupJson(JSON.stringify(genericSubtitle)),
  "mark-8",
);
assert.ok(
  genericSubtitleReport.warnings.some(
    (finding) => finding.code === "EDT-001 LOW_CHAPTER_SPECIFICITY",
  ),
);

const renderedLegacy = generatedToRenderWorkup(legacyFixture);
assert.equal(renderedLegacy.verseByVerse?.[0]?.startVerse, 1);
assert.equal(renderedLegacy.verseByVerse?.[0]?.endVerse, 8);
assert.equal(renderedLegacy.verseByVerse?.[0]?.rangeLabel, "1-8");
assert.equal(renderedLegacy.verseByVerse?.[0]?.title, "The bronze altar");

const rendered = generatedToRenderWorkup(
  parseChapterWorkupJson(JSON.stringify(base)),
);
assert.equal(rendered.whatPeopleAsk?.length, 5, "FAQ must survive the adapter");
assert.equal(
  rendered.verseByVerse?.length,
  base.verseByVerse.length,
  "passage flow must survive the adapter",
);
assert.equal(rendered.whatHappens, base.whatHappens);
assert.equal(
  rendered.chapterSpecificTopics?.length,
  base.chapterSpecificTopics?.length,
);
assert.equal(rendered.modernMap.title, base.maps.modern.title);
assert.equal(rendered.characters[0]?.description, base.keyPeople[0]?.description);

const mark8Notes = guidance.chapters["mark-8"].notes.map((note) => note.text);
const prompt = buildChapterWorkupPrompt({
  book: "Mark",
  chapter: 8,
  bibleVersion: "ESV",
  bibleText: "[rights-cleared source fixture omitted]",
  generationSourceLabel: "OEB 2025.6 synthetic verification label",
  globalRules: ["Synthetic active rule for contract verification."],
  chapterNotes: mark8Notes,
});
assert.throws(
  () =>
    buildChapterWorkupPrompt({
      book: "Mark",
      chapter: 8,
      bibleVersion: "ESV",
      bibleText: "[unlabeled source fixture]",
    }),
  /generation source label is required/i,
);
assert.throws(
  () =>
    buildChapterWorkupPrompt({
      book: "Mark",
      chapter: 8,
      bibleText: "   ",
      generationSourceLabel: "OEB 2025.6 synthetic verification label",
    }),
  /source text cannot be empty/i,
);
assert.match(prompt, /"whatPeopleAsk"/);
assert.match(prompt, /"startVerse"/);
assert.match(prompt, /5-8 questions/);
assert.match(prompt, /no gaps or overlaps/i);
assert.match(prompt, /SERVER-SUPPLIED GENERATION SOURCE \(OEB 2025\.6/);
assert.match(prompt, /rights, version, and digest must be authorized/i);
assert.match(prompt, /reader-display version/i);

for (const slug of ["mark-8", "mark-9", "mark-10", "mark-11"] as const) {
  const expected = getMarkSprintChapterContract(slug);
  assert.ok(expected);
  const movementNote = guidance.chapters[slug].notes[0]?.text ?? "";
  for (const movement of expected.required_movements) {
    const label =
      movement.startVerse === movement.endVerse
        ? `(${movement.startVerse})`
        : `(${movement.startVerse}-${movement.endVerse})`;
    assert.ok(
      movementNote.includes(label),
      `${slug} guidance and acceptance movement disagree at ${label}`,
    );
  }
}
const comparisonOnlyPhrases = [
  "Learning to See Jesus Clearly",
  "Glory and Failure, Side by Side",
  "Open Hands on the Way",
  "The King Who Looks for Fruit",
  "When Jesus Looks Around",
];
for (const slug of ["mark-8", "mark-9", "mark-10", "mark-11"] as const) {
  const chapter = Number(slug.split("-")[1]);
  const chapterPrompt = buildChapterWorkupPrompt({
    book: "Mark",
    chapter,
    globalRules: ["Synthetic active rule for contract verification."],
    chapterNotes: guidance.chapters[slug].notes.map((note) => note.text),
  });
  for (const comparisonOnly of comparisonOnlyPhrases) {
    assert.ok(
      !chapterPrompt.includes(comparisonOnly),
      `${slug} comparison-only wording leaked into prompt: ${comparisonOnly}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: "mark-sprint-copy-review-v1.0",
      passingSlugs: ["mark-8", "mark-9", "mark-10", "mark-11"],
      failureCases: [
        "identity mismatch",
        "missing FAQ",
        "missing movement/coverage gap",
        "stored Scripture text",
        "duplicate section ID",
        "duplicate image kinds",
        "partial/conflicting passage ranges",
        "empty dashboard data",
        "missing map uncertainty",
        "overlapping passage flow",
        "duplicate FAQ answers",
        "inverted timeline range",
        "prompt-placeholder echo",
        "unlabeled generation source",
      ],
      adapterPreserves: [
        "FAQ",
        "passage flow",
        "whatHappens",
        "chapter topics",
        "map titles",
        "person descriptions",
      ],
    },
    null,
    2,
  ),
);
