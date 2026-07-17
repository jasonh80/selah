import type { GeneratedChapterWorkup } from "../schemas/chapter-workup-schema";
import contractJson from "./mark-sprint-acceptance.v1.json";

type Movement = { id: string; startVerse: number; endVerse: number };
type ChapterContract = {
  book: string;
  chapter: number;
  expected_verse_count: number;
  required_movements: Movement[];
  manual_guardrails: string[];
  textual_variants: string[];
};

type AcceptanceContract = {
  contract_version: string;
  artifact: string;
  stage: string;
  expected_reader_display_version: string;
  required_core_section_types: string[];
  chapters: Record<string, ChapterContract>;
};

const contract = contractJson as AcceptanceContract;

export type QualitySeverity = "blocker" | "warning";

/**
 * SINGLE SOURCE OF TRUTH for the machine-checked bounds the prompt states to
 * the model (PR #46, correction 4): the checker sites below and the prompt's
 * completeness block both read these, so they cannot drift apart.
 */
export const MARK_SPRINT_PROMPT_MINIMA = Object.freeze({
  sectionCardSummaryMin: 30,
  sectionFullContentMin: 160,
  sceneChecksMin: 1,
  sceneChecksMax: 3,
  sceneTitleMin: 8,
  sceneBodyMin: 80,
  sceneNoteMin: 15,
});

export interface QualityFinding {
  code: string;
  severity: QualitySeverity;
  message: string;
  evidencePaths: string[];
  expected?: unknown;
  actual?: unknown;
}

export interface MarkSprintQualityReport {
  contractVersion: string;
  artifact: "chapter_workup";
  stage: "copy_review";
  slug: string;
  machineVerdict: "pass" | "block";
  overallStatus: "blocked" | "needs_owner_review";
  blockers: QualityFinding[];
  warnings: QualityFinding[];
  manualChecks: {
    guardrails: string[];
    textualVariants: string[];
  };
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPlaceholder(value: string): boolean {
  const text = value.trim();
  return (
    !text ||
    /^<.*>$/.test(text) ||
    /\b(?:todo|tbd|lorem ipsum|placeholder)\b/i.test(text)
  );
}

const SAFE_IMAGE_KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LEGACY_GENERIC_IMAGE_KINDS = new Set([
  "establishing",
  "detail",
  "human",
]);

function canonicalRangeLabel(startVerse: number, endVerse: number): string {
  return startVerse === endVerse
    ? String(startVerse)
    : `${startVerse}–${endVerse}`;
}

function parsedRangeLabel(value?: string): {
  startVerse: number;
  endVerse: number;
} | null {
  const match = value?.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!match) return null;
  return {
    startVerse: Number(match[1]),
    endVerse: Number(match[2] ?? match[1]),
  };
}

function stableFindings(findings: QualityFinding[]): QualityFinding[] {
  return [...findings].sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.evidencePaths.join("|").localeCompare(b.evidencePaths.join("|")),
  );
}

export function getMarkSprintChapterContract(
  slug: string,
): ChapterContract | null {
  return contract.chapters[slug] ?? null;
}

export function evaluateMarkSprintDraft(
  workup: GeneratedChapterWorkup,
  expectedSlug: string,
): MarkSprintQualityReport {
  const findings: QualityFinding[] = [];
  const expected = getMarkSprintChapterContract(expectedSlug);

  const add = (
    code: string,
    message: string,
    evidencePaths: string[],
    expectedValue?: unknown,
    actualValue?: unknown,
  ) => {
    findings.push({
      code,
      severity: "blocker",
      message,
      evidencePaths,
      ...(expectedValue === undefined ? {} : { expected: expectedValue }),
      ...(actualValue === undefined ? {} : { actual: actualValue }),
    });
  };
  const warn = (
    code: string,
    message: string,
    evidencePaths: string[],
  ) => {
    findings.push({
      code,
      severity: "warning",
      message,
      evidencePaths,
    });
  };

  if (!expected) {
    add(
      "MNF-003 REFERENCE_MISMATCH",
      "No Mark sprint acceptance contract exists for this slug.",
      ["workup:/slug"],
      Object.keys(contract.chapters),
      expectedSlug,
    );
  } else {
    const identityMatches =
      workup.slug === expectedSlug &&
      workup.book === expected.book &&
      workup.chapter === expected.chapter &&
      workup.title === `${expected.book} ${expected.chapter}`;
    if (!identityMatches) {
      add(
        "STR-002 OUTPUT_IDENTITY_MISMATCH",
        "Generated identity does not match the requested chapter.",
        ["workup:/book", "workup:/chapter", "workup:/slug", "workup:/title"],
        {
          book: expected.book,
          chapter: expected.chapter,
          slug: expectedSlug,
          title: `${expected.book} ${expected.chapter}`,
        },
        {
          book: workup.book,
          chapter: workup.chapter,
          slug: workup.slug,
          title: workup.title,
        },
      );
    }

    if (workup.status !== "draft") {
      add(
        "STR-003 INVALID_DRAFT_STATUS",
        "A newly authored workup must remain a draft.",
        ["workup:/status"],
        "draft",
        workup.status,
      );
    }
    if (workup.reviewedAt !== undefined) {
      add(
        "STR-003 INVALID_DRAFT_STATUS",
        "A newly authored draft cannot carry a prior review timestamp.",
        ["workup:/reviewedAt"],
        undefined,
        workup.reviewedAt,
      );
    }

    const requiredStrings: Array<[string, string, number]> = [
      ["workup:/version", workup.version, 1],
      ["workup:/subtitle", workup.subtitle, 8],
      ["workup:/theme", workup.theme, 8],
      ["workup:/estimatedDate", workup.estimatedDate, 4],
      ["workup:/estimatedLocation", workup.estimatedLocation, 4],
      ["workup:/summary", workup.summary, 80],
      ["workup:/sceneSetter", workup.sceneSetter, 80],
      ["workup:/historicalContext", workup.historicalContext, 120],
      ["workup:/whatHappens", workup.whatHappens, 120],
      ["workup:/whatPeopleMiss", workup.whatPeopleMiss, 100],
      ["workup:/jesusConnection/short", workup.jesusConnection.short, 8],
      ["workup:/jesusConnection/full", workup.jesusConnection.full, 120],
      ["workup:/theologyPrinciple/name", workup.theologyPrinciple.name, 3],
      [
        "workup:/theologyPrinciple/explanation",
        workup.theologyPrinciple.explanation,
        100,
      ],
      ["workup:/application", workup.application, 100],
      ["workup:/prayer", workup.prayer, 80],
    ];
    for (const [path, value, minimum] of requiredStrings) {
      if (isPlaceholder(value) || value.trim().length < minimum) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          `Required content at ${path} is empty, a placeholder, or below its minimum length.`,
          [path],
          `at least ${minimum} non-placeholder characters`,
          value.trim().length,
        );
      }
    }
    if (workup.jesusConnection.relatedPassages.length < 1) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "The Jesus connection needs at least one reviewed related passage.",
        ["workup:/jesusConnection/relatedPassages"],
      );
    }
    workup.jesusConnection.relatedPassages.forEach((passage, index) => {
      if (passage.trim().length < 4 || isPlaceholder(passage)) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Related passages must be non-placeholder references.",
          [`workup:/jesusConnection/relatedPassages/${index}`],
        );
      }
    });
    if (normalized(workup.subtitle) === normalized(workup.title)) {
      warn(
        "EDT-001 LOW_CHAPTER_SPECIFICITY",
        "The editorial subtitle must be more specific than the reference title.",
        ["workup:/subtitle", "workup:/title"],
      );
    }

    const primaryCharacters = workup.primaryCharacters;
    if (primaryCharacters.length < 1 || primaryCharacters.length > 8) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "A new draft needs 1-8 primary characters or people groups.",
        ["workup:/primaryCharacters"],
        "1-8",
        primaryCharacters.length,
      );
    }
    const seenPrimaryCharacters = new Set<string>();
    primaryCharacters.forEach((name, index) => {
      const key = normalized(name);
      if (name.trim().length < 2 || isPlaceholder(name)) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Primary-character labels must be substantive.",
          [`workup:/primaryCharacters/${index}`],
        );
      }
      if (key && seenPrimaryCharacters.has(key)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "Primary-character labels must be unique.",
          [`workup:/primaryCharacters/${index}`],
        );
      }
      seenPrimaryCharacters.add(key);
    });

    if (workup.keyObjects.length < 2 || workup.keyObjects.length > 6) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "A new draft needs 2-6 useful key objects or places.",
        ["workup:/keyObjects"],
        "2-6",
        workup.keyObjects.length,
      );
    }
    const seenObjects = new Set<string>();
    workup.keyObjects.forEach((item, index) => {
      const key = normalized(item.title);
      if (
        item.title.trim().length < 3 ||
        item.description.trim().length < 20 ||
        item.imageUrl !== undefined ||
        isPlaceholder(item.title) ||
        isPlaceholder(item.description)
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Key objects and places need a useful label and description.",
          [`workup:/keyObjects/${index}`],
        );
      }
      if (key && seenObjects.has(key)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "Key-object labels must be unique.",
          [`workup:/keyObjects/${index}/title`],
        );
      }
      seenObjects.add(key);
    });

    if (workup.keyPeople.length < 2 || workup.keyPeople.length > 6) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "A new draft needs 2-6 useful key people or people groups.",
        ["workup:/keyPeople"],
        "2-6",
        workup.keyPeople.length,
      );
    }
    const seenPeople = new Set<string>();
    workup.keyPeople.forEach((person, index) => {
      const key = normalized(person.name);
      if (
        person.name.trim().length < 2 ||
        person.role.trim().length < 8 ||
        (person.description?.trim().length ?? 0) < 20 ||
        person.imageUrl !== undefined ||
        isPlaceholder(person.name) ||
        isPlaceholder(person.role) ||
        isPlaceholder(person.description ?? "")
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Key people need a useful name, role, and description.",
          [`workup:/keyPeople/${index}`],
        );
      }
      if (key && seenPeople.has(key)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "Key-person labels must be unique.",
          [`workup:/keyPeople/${index}/name`],
        );
      }
      seenPeople.add(key);
    });

    const sections = workup.sections ?? [];
    const sectionIds = sections.map((section) => section.id);
    if (new Set(sectionIds).size !== sectionIds.length) {
      add(
        "STR-006 DUPLICATE_SECTION_ID",
        "Section IDs must be unique.",
        ["workup:/sections"],
      );
    }
    for (const requiredType of contract.required_core_section_types) {
      const matches = sections.filter(
        (section) => section.type === requiredType && section.isCore,
      );
      if (matches.length !== 1) {
        add(
          "STR-007 REQUIRED_CORE_SECTION_MISSING",
          `Exactly one core ${requiredType} section is required.`,
          ["workup:/sections"],
          1,
          matches.length,
        );
      }
    }
    const seenSectionBodies = new Map<string, string>();
    sections.forEach((section, index) => {
      const basePath = `workup:/sections/${index}`;
      if (
        isPlaceholder(section.id) ||
        isPlaceholder(section.title) ||
        isPlaceholder(section.cardSummary) ||
        isPlaceholder(section.fullContent) ||
        section.cardSummary.trim().length < MARK_SPRINT_PROMPT_MINIMA.sectionCardSummaryMin ||
        section.fullContent.trim().length < MARK_SPRINT_PROMPT_MINIMA.sectionFullContentMin
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Every authored section needs a useful title, card summary, and substantive body.",
          [`${basePath}/title`, `${basePath}/cardSummary`, `${basePath}/fullContent`],
        );
      }
      const bodyKey = normalized(section.fullContent);
      const prior = seenSectionBodies.get(bodyKey);
      if (bodyKey && prior) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "Two sections contain the same normalized body.",
          [prior, `${basePath}/fullContent`],
        );
      } else if (bodyKey) {
        seenSectionBodies.set(bodyKey, `${basePath}/fullContent`);
      }
    });

    const topics = workup.chapterSpecificTopics ?? [];
    if (topics.length < 3 || topics.length > 7) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "A new draft needs 3-7 chapter-specific topics.",
        ["workup:/chapterSpecificTopics"],
        "3-7",
        topics.length,
      );
    }
    const seenTopics = new Set<string>();
    const seenTopicPriorities = new Set<number>();
    topics.forEach((topic, index) => {
      const key = normalized(topic.title);
      if (
        topic.title.trim().length < 4 ||
        topic.reason.trim().length < 30 ||
        !Number.isFinite(topic.priority) ||
        isPlaceholder(topic.title) ||
        isPlaceholder(topic.reason)
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Chapter topics need a useful title, reason, and numeric priority.",
          [`workup:/chapterSpecificTopics/${index}`],
        );
      }
      if (key && seenTopics.has(key)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "Chapter-topic titles must be unique.",
          [`workup:/chapterSpecificTopics/${index}/title`],
        );
      }
      if (seenTopicPriorities.has(topic.priority)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "Chapter-topic priorities must be unique.",
          [`workup:/chapterSpecificTopics/${index}/priority`],
        );
      }
      seenTopics.add(key);
      seenTopicPriorities.add(topic.priority);
    });

    if (!workup.biblicalTimeline) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "Biblical timeline evidence is required for a new draft.",
        ["workup:/biblicalTimeline"],
      );
    } else {
      const timeline = workup.biblicalTimeline;
      if (
        timeline.era.trim().length < 4 ||
        timeline.estimatedYearLabel.trim().length < 12 ||
        timeline.chronologyBasis.trim().length < 8 ||
        timeline.uncertaintyNote.trim().length < 20 ||
        timeline.placementReason.trim().length < 20 ||
        isPlaceholder(timeline.era) ||
        isPlaceholder(timeline.estimatedYearLabel) ||
        isPlaceholder(timeline.chronologyBasis) ||
        isPlaceholder(timeline.uncertaintyNote) ||
        isPlaceholder(timeline.placementReason)
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Biblical Timeline fields must contain reviewable placement evidence.",
          ["workup:/biblicalTimeline"],
        );
      }
      if (
        timeline.dateRange &&
        timeline.dateRange.startYear > timeline.dateRange.endYear
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Biblical Timeline dateRange must run from the earlier to later year.",
          ["workup:/biblicalTimeline/dateRange"],
        );
      }
    }
    if (!workup.behindTheChapter) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "Behind the Chapter evidence is required for a new draft.",
        ["workup:/behindTheChapter"],
      );
    } else {
      Object.entries(workup.behindTheChapter).forEach(([key, card]) => {
        if (
          isPlaceholder(card.title) ||
          isPlaceholder(card.body) ||
          card.body.trim().length < 80
        ) {
          add(
            "STR-004 EMPTY_REQUIRED_CONTENT",
            `Behind the Chapter ${key} card is incomplete.`,
            [`workup:/behindTheChapter/${key}`],
          );
        }
      });
    }

    const sceneChecks = workup.sceneChecks ?? [];
    if (sceneChecks.length < MARK_SPRINT_PROMPT_MINIMA.sceneChecksMin || sceneChecks.length > MARK_SPRINT_PROMPT_MINIMA.sceneChecksMax) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "Each Mark sprint draft needs 1-3 relevant Scene Checks.",
        ["workup:/sceneChecks"],
        "1-3",
        sceneChecks.length,
      );
    }
    sceneChecks.forEach((scene, index) => {
      if (
        scene.title.trim().length < MARK_SPRINT_PROMPT_MINIMA.sceneTitleMin ||
        scene.body.trim().length < MARK_SPRINT_PROMPT_MINIMA.sceneBodyMin ||
        !scene.visualAccuracyNotes?.length ||
        scene.visualAccuracyNotes.some(
          (note) => note.trim().length < MARK_SPRINT_PROMPT_MINIMA.sceneNoteMin || isPlaceholder(note),
        ) ||
        isPlaceholder(scene.title) ||
        isPlaceholder(scene.body)
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "A Scene Check needs a useful title, substantive copy, and concrete visual guardrails.",
          [`workup:/sceneChecks/${index}`],
        );
      }
    });

    for (const mapName of ["modern", "historic"] as const) {
      const map = workup.maps[mapName];
      if (
        isPlaceholder(map.title) ||
        isPlaceholder(map.description) ||
        map.description.trim().length < 60 ||
        !map.uncertaintyNote?.trim() ||
        isPlaceholder(map.uncertaintyNote ?? "") ||
        map.imageUrl !== undefined
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          `${mapName} map completion guidance needs a title, useful description, and uncertainty note.`,
          [`workup:/maps/${mapName}`],
        );
      }
    }

    if (
      workup.timeline.label.trim().length < 8 ||
      isPlaceholder(workup.timeline.label) ||
      workup.timeline.items.length < 2 ||
      workup.timeline.items.length > 4
    ) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "The chapter timeline needs a useful label and 2-4 items.",
        ["workup:/timeline"],
      );
    }
    workup.timeline.items.forEach((item, index) => {
      if (
        item.title.trim().length < 3 ||
        (item.description?.trim().length ?? 0) < 8 ||
        isPlaceholder(item.title) ||
        isPlaceholder(item.description ?? "")
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Timeline items need useful titles and descriptions.",
          [`workup:/timeline/items/${index}`],
        );
      }
    });
    const activeTimelineItems = workup.timeline.items.filter(
      (item) => item.active,
    );
    if (activeTimelineItems.length !== 1) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "Exactly one timeline item must mark this chapter.",
        ["workup:/timeline/items"],
        1,
        activeTimelineItems.length,
      );
    }

    const faq = workup.whatPeopleAsk ?? [];
    if (faq.length < 5 || faq.length > 8) {
      add(
        "STR-004 EMPTY_REQUIRED_CONTENT",
        "A new draft needs 5-8 chapter-specific FAQ items.",
        ["workup:/whatPeopleAsk"],
        "5-8",
        faq.length,
      );
    }
    const faqQuestions = new Set<string>();
    const faqAnswers = new Set<string>();
    faq.forEach((item, index) => {
      const key = normalized(item.question);
      const answerKey = normalized(item.answer);
      if (
        item.question.trim().length < 15 ||
        item.answer.trim().length < 80 ||
        isPlaceholder(item.question) ||
        isPlaceholder(item.answer)
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "FAQ questions and answers must be substantive.",
          [`workup:/whatPeopleAsk/${index}`],
        );
      }
      if (faqQuestions.has(key)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "FAQ questions must be unique.",
          [`workup:/whatPeopleAsk/${index}/question`],
        );
      }
      if (answerKey && faqAnswers.has(answerKey)) {
        add(
          "STR-010 EXACT_DUPLICATE_CONTENT",
          "FAQ answers must not repeat the same normalized copy.",
          [`workup:/whatPeopleAsk/${index}/answer`],
        );
      }
      faqQuestions.add(key);
      faqAnswers.add(answerKey);
    });

    for (const [groupName, rows] of Object.entries(workup.goDeeper)) {
      if (rows.length < 2 || rows.length > 4) {
        add(
          "STR-009 EMPTY_DEEPER_ITEM",
          `${groupName} needs 2-4 useful rows.`,
          [`workup:/goDeeper/${groupName}`],
          "2-4",
          rows.length,
        );
      }
      rows.forEach((row, index) => {
        if (
          row.title.trim().length < 4 ||
          row.description.trim().length < 20 ||
          isPlaceholder(row.title) ||
          isPlaceholder(row.description)
        ) {
          add(
            "STR-009 EMPTY_DEEPER_ITEM",
            "Go Deeper rows cannot be empty or placeholder content.",
            [`workup:/goDeeper/${groupName}/${index}`],
          );
        }
      });
    }

    const imageKinds = workup.generatedImages.map((image) => image.type);
    const imageKindSet = new Set(imageKinds);
    if (
      (imageKinds.length !== 3 && imageKinds.length !== 5) ||
      imageKindSet.size !== imageKinds.length
    ) {
      add(
        "STR-008 IMAGE_CONCEPT_CONTRACT_INVALID",
        "A new Mark draft needs exactly 3 or 5 images with unique kinds.",
        ["workup:/generatedImages"],
        "3 or 5 unique image kinds",
        imageKinds,
      );
    }
    if (
      !workup.heroKind ||
      !SAFE_IMAGE_KIND.test(workup.heroKind) ||
      !imageKindSet.has(workup.heroKind)
    ) {
      add(
        "STR-008 IMAGE_CONCEPT_CONTRACT_INVALID",
        "heroKind must name one chapter-selected image as the chapter's most meaningful visual moment.",
        ["workup:/heroKind", "workup:/generatedImages"],
        imageKinds,
        workup.heroKind,
      );
    }
    workup.generatedImages.forEach((image, index) => {
      if (
        !SAFE_IMAGE_KIND.test(image.type) ||
        LEGACY_GENERIC_IMAGE_KINDS.has(image.type) ||
        image.status !== "placeholder" ||
        image.imageUrl !== undefined ||
        image.title.trim().length < 4 ||
        image.description.trim().length < 30 ||
        image.prompt.trim().length < 80 ||
        image.alt.trim().length < 20 ||
        image.caption.trim().length < 20 ||
        isPlaceholder(image.title) ||
        isPlaceholder(image.description) ||
        isPlaceholder(image.prompt) ||
        isPlaceholder(image.alt) ||
        isPlaceholder(image.caption)
      ) {
        add(
          "STR-008 IMAGE_CONCEPT_CONTRACT_INVALID",
          "Each new image needs a unique chapter-specific kebab ID, substantive fields, no URL, and placeholder status.",
          [`workup:/generatedImages/${index}`],
        );
      }
    });

    const flow = workup.verseByVerse;
    let previousEnd = 0;
    flow.forEach((item, index) => {
      const path = `workup:/verseByVerse/${index}`;
      const start = item.startVerse;
      const end = item.endVerse;
      if (
        start === undefined ||
        end === undefined ||
        start < 1 ||
        end < start ||
        end > expected.expected_verse_count
      ) {
        add(
          "COV-001 VERSE_RANGE_INVALID",
          "Passage-flow entries need valid numeric inclusive bounds.",
          [path],
        );
        return;
      }
      const labelBounds = parsedRangeLabel(item.rangeLabel);
      if (
        !labelBounds ||
        labelBounds.startVerse !== start ||
        labelBounds.endVerse !== end
      ) {
        add(
          "COV-001 VERSE_RANGE_INVALID",
          "The passage-flow display label must match its numeric bounds.",
          [`${path}/rangeLabel`],
          canonicalRangeLabel(start, end),
          item.rangeLabel,
        );
      }
      if (item.range !== undefined) {
        add(
          "COV-001 VERSE_RANGE_INVALID",
          "New drafts cannot mix legacy range with numeric passage bounds.",
          [`${path}/range`],
          undefined,
          item.range,
        );
      }
      if (start <= previousEnd) {
        add(
          "COV-001 VERSE_RANGE_INVALID",
          "Passage-flow ranges overlap or are out of order.",
          [path],
          previousEnd + 1,
          start,
        );
      } else if (start !== previousEnd + 1) {
        add(
          "COV-002 VERSE_COVERAGE_GAP",
          "Passage-flow ranges leave a coverage gap.",
          [path],
          previousEnd + 1,
          start,
        );
      }
      previousEnd = Math.max(previousEnd, end);
      if (
        isPlaceholder(item.title) ||
        isPlaceholder(item.explanation) ||
        item.explanation.trim().length < 60
      ) {
        add(
          "STR-004 EMPTY_REQUIRED_CONTENT",
          "Each passage-flow movement needs a useful title and explanation.",
          [`${path}/title`, `${path}/explanation`],
        );
      }
    });
    if (previousEnd < expected.expected_verse_count) {
      add(
        "COV-002 VERSE_COVERAGE_GAP",
        "Passage flow does not reach the final verse.",
        ["workup:/verseByVerse"],
        expected.expected_verse_count,
        previousEnd,
      );
    }
    for (const movement of expected.required_movements) {
      const found = flow.some(
        (item) =>
          item.startVerse === movement.startVerse &&
          item.endVerse === movement.endVerse,
      );
      if (!found) {
        add(
          "COV-003 MOVEMENT_RANGE_UNCOVERED",
          `Required movement ${movement.id} is not represented as its own passage-flow entry.`,
          [
            `fixture:/requiredMovements/${expectedSlug}/${movement.id}`,
            "workup:/verseByVerse",
          ],
          `${movement.startVerse}-${movement.endVerse}`,
        );
      }
    }

    if (workup.bibleText.verses?.length) {
      add(
        "SAFE-001 STORED_SCRIPTURE_TEXT",
        "A newly generated workup must not contain a populated bibleText.verses array.",
        ["workup:/bibleText/verses"],
        0,
        workup.bibleText.verses.length,
      );
    }
    if (workup.bibleText.version !== contract.expected_reader_display_version) {
      add(
        "MNF-005 SOURCE_METADATA_INCOMPLETE",
        "Reader-display version does not match the Mark sprint contract.",
        ["workup:/bibleText/version"],
        contract.expected_reader_display_version,
        workup.bibleText.version,
      );
    }
    if (
      workup.bibleText.source !== undefined ||
      workup.bibleText.note !== undefined
    ) {
      add(
        "SAFE-004 PROMPT_RULE_ADMIN_LEAKAGE",
        "Generation provenance is server-owned and cannot be supplied in model-authored bibleText metadata.",
        ["workup:/bibleText/source", "workup:/bibleText/note"],
      );
    }
  }

  const blockers = stableFindings(
    findings.filter((finding) => finding.severity === "blocker"),
  );
  const warnings = stableFindings(
    findings.filter((finding) => finding.severity === "warning"),
  );
  return {
    contractVersion: contract.contract_version,
    artifact: "chapter_workup",
    stage: "copy_review",
    slug: expectedSlug,
    machineVerdict: blockers.length ? "block" : "pass",
    overallStatus: blockers.length ? "blocked" : "needs_owner_review",
    blockers,
    warnings,
    manualChecks: {
      guardrails: expected?.manual_guardrails ?? [],
      textualVariants: expected?.textual_variants ?? [],
    },
  };
}
