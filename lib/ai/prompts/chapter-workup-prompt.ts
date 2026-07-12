// Builds the prompt that asks the model for ONE shared global Selah chapter
// workup. No API call here — this only assembles the instruction string.

export const CHAPTER_WORKUP_PROMPT_REVISION = "chapter-workup-json-v3";

export type GenerationSourceSectionRole =
  | "context_before"
  | "primary"
  | "context_after";

export interface ChapterWorkupGenerationSource {
  label: string;
  sections: Array<{
    role: GenerationSourceSectionRole;
    reference: string;
    text: string;
  }>;
}

export interface ChapterWorkupPromptInput {
  book: string;
  chapter: number;
  bibleVersion?: string;
  // Active Selah Brain rules (apply to every chapter) and review notes specific
  // to THIS chapter. Both come from the dedicated Selah Brain tables.
  globalRules?: string[];
  chapterNotes?: string[];
  // 1–2 approved exemplars demonstrating the desired voice for this genre.
  examples?: { title: string; exampleType: string; content: string }[];
}

export type ProtectedChapterWorkupPromptInput = ChapterWorkupPromptInput & {
  // This input is for the future protected composition root only. The ordinary
  // generator deliberately has no source-bearing API.
  generationSource: ChapterWorkupGenerationSource;
};

type InternalChapterWorkupPromptInput = ChapterWorkupPromptInput & {
  generationSource?: ChapterWorkupGenerationSource;
};

function buildChapterWorkupPromptInternal(
  input: InternalChapterWorkupPromptInput,
): string {
  const {
    book,
    chapter,
    bibleVersion,
    generationSource,
    globalRules,
    chapterNotes,
    examples,
  } = input;
  if (generationSource) {
    if (!generationSource.label.trim()) {
      throw new Error("A server-owned generation source label is required");
    }
    const roles: GenerationSourceSectionRole[] = [
      "context_before",
      "primary",
      "context_after",
    ];
    if (
      generationSource.sections.length !== roles.length ||
      generationSource.sections.some(
        (section, index) =>
          section.role !== roles[index] ||
          !section.reference.trim() ||
          !section.text.trim(),
      )
    ) {
      throw new Error(
        "Generation source must contain non-empty context-before, primary, and context-after sections in order",
      );
    }
  }
  const slug = `${book.toLowerCase().replace(/\s+/g, "-")}-${chapter}`;
  const rulesBlock =
    globalRules && globalRules.length
      ? `\n\nWHAT SELAH HAS LEARNED (active rules — apply to EVERY section)\n${globalRules
          .map((r) => `- ${r}`)
          .join("\n")}\nHonor these in tone, depth, specificity, and accuracy.`
      : "";
  const chapterBlock =
    chapterNotes && chapterNotes.length
      ? `\n\nCHAPTER-SPECIFIC REVIEW NOTES FOR ${book} ${chapter} (apply directly to this chapter)\n${chapterNotes
          .map((n) => `- ${n}`)
          .join("\n")}`
      : "";
  const examplesBlock =
    examples && examples.length
      ? `\n\nAPPROVED VOICE EXAMPLE — THE GOLD STANDARD FOR HOW THIS SHOULD SOUND\nMatch the warmth, rhythm, directness, short punchy interpretive lines, restrained wit, wise-friend tone, and practical Jesus-centered clarity of the example(s) below. Write Selah's structured fields in THIS register — not generic, academic, or "Bible-app" phrasing. Capture the voice and the kind of insight; do not copy the wording verbatim.\n${examples
          .map((e) => `--- EXAMPLE: ${e.title} (${e.exampleType}) ---\n${e.content}\n--- END EXAMPLE ---`)
          .join("\n\n")}`
      : "";
  const generationSourceBlock = generationSource
    ? `\n\nSERVER-SUPPLIED GENERATION SOURCE (${generationSource.label.trim()})
Use PRIMARY CHAPTER for this workup. CONTEXT BEFORE and CONTEXT AFTER may only
ground surrounding-chapter Book Flow. Do not blend their events into the
primary chapter. Do not quote or reproduce source wording in the output.
Footnote callouts and bodies, when present, are translator/editorial notes—not
verse text. They may inform an explicitly labeled textual note but must never be
silently presented as the words of Scripture.
The protected runner must bind source handling, API options, references, text
digests, ordered bundle digest, and owner decision in the fail-closed generation
manifest before sending this request, even when reader display also uses ESV.

--- CONTEXT BEFORE (${generationSource.sections[0].reference.trim()}; BOOK FLOW ONLY) ---
${generationSource.sections[0].text.trim()}
--- END CONTEXT BEFORE ---

--- PRIMARY CHAPTER (${generationSource.sections[1].reference.trim()}) ---
${generationSource.sections[1].text.trim()}
--- END PRIMARY CHAPTER ---

--- CONTEXT AFTER (${generationSource.sections[2].reference.trim()}; BOOK FLOW ONLY) ---
${generationSource.sections[2].text.trim()}
--- END CONTEXT AFTER ---`
    : "";

  return `You are the content engine for Selah, a daily Bible chapter app whose only
goal is to help people grow closer to Jesus through Scripture.

Generate ONE shared, canonical workup for ${book} ${chapter}. It is global (created
once, shown to every user) — do not personalize or address any individual.

VOICE & VALUES
- Jesus, and growing closer to Him, is central — every section should ultimately
  point toward Christ without forcing it.
- Historically careful and HONEST ABOUT UNCERTAINTY. Never invent certainty for
  debated dates, locations, authorship, or routes ("approximate", "traditional
  location", "exact site debated", "possible route").
- Accessible, modern language. Not academic coldness, not cheesy devotional
  clichés. Practical application WITHOUT moralism. Theology principle starts
  simple (level "beginner" for foundational chapters).
- Do NOT include copyrighted Bible verse text anywhere.

OUTPUT
Return ONE JSON object and NOTHING else (no markdown, no code fences, no prose).
Use EXACTLY these keys and this structure — every key is required unless marked
optional. Fill every string with real, specific content for ${book} ${chapter}:

{
  "book": "${book}",
  "chapter": ${chapter},
  "slug": "${slug}",
  "title": "${book} ${chapter}",
  "subtitle": "<fresh, chapter-specific editorial title; do not copy example wording>",
  "status": "draft",
  "version": "1",
  "theme": "<one short line, e.g. 'Holy access to God'>",
  "estimatedDate": "<e.g. 'c. 1010 BC' or 'unknown'>",
  "estimatedLocation": "<place>",
  "modernLocationNote": "<optional; modern-day note + uncertainty>",
  "primaryCharacters": ["<name>", "<name>"],
  "summary": "<2-3 sentences>",
  "sceneSetter": "<sets the scene>",
  "historicalContext": "<historical + cultural background>",
  "whatHappens": "<what happens in the chapter>",
  "whatPeopleMiss": "<what a modern reader misunderstands or overlooks>",
  "jesusConnection": {
    "short": "<one short phrase>",
    "full": "<a full paragraph connecting the chapter to Jesus>",
    "relatedPassages": ["<Book c:v>", "<Book c:v>"]
  },
  "theologyPrinciple": {
    "name": "<one or two words>",
    "level": "beginner",
    "explanation": "<plain explanation>"
  },
  "application": "<practical, invitational, no moralism>",
  "prayer": "<a short prayer>",
  "timeline": {
    "label": "<label for this timeline>",
    "items": [
      { "title": "<step>", "description": "<short>", "active": false },
      { "title": "<step>", "description": "<short>", "active": true }
    ]
  },
  "maps": {
    "modern": { "title": "Modern Map", "description": "<what it shows today>", "uncertaintyNote": "<required scope/precision note>" },
    "historic": { "title": "Historic Map", "description": "<the biblical-world view>", "uncertaintyNote": "<required scope/precision note>" }
  },
  "keyObjects": [
    { "title": "<object/place>", "description": "<short>" }
  ],
  "keyPeople": [
    { "name": "<name>", "role": "<role>", "description": "<short>" }
  ],
  "generatedImages": [
    { "type": "establishing", "title": "Establishing Shot", "description": "<the broad world: Where am I?>", "prompt": "<vivid, historically grounded image-generation prompt>", "alt": "<alt text>", "caption": "<caption>", "status": "placeholder" },
    { "type": "detail", "title": "Detail Shot", "description": "<an object/ritual a modern reader may not understand: What am I looking at?>", "prompt": "<vivid prompt>", "alt": "<alt>", "caption": "<caption>", "status": "placeholder" },
    { "type": "human", "title": "Human Moment", "description": "<a character/emotional moment: What did this feel like?>", "prompt": "<vivid prompt>", "alt": "<alt>", "caption": "<caption>", "status": "placeholder" }
  ],
  "verseByVerse": [
    { "startVerse": 1, "endVerse": 6, "rangeLabel": "1–6", "title": "<short>", "explanation": "<brief, no quoted verse text>" }
  ],
  "whatPeopleAsk": [
    { "question": "<a real question readers ask about THIS chapter>", "answer": "<warm, accurate, useful answer; no quoted verse text>" }
  ],
  "goDeeper": {
    "learnMore": [ { "title": "<short>", "description": "<short>" } ],
    "diveDeeper": [ { "title": "<short>", "description": "<short>" } ],
    "growCloser": [ { "title": "<short>", "description": "<short>" } ]
  },
  "chapterSpecificTopics": [
    { "title": "<a topic THIS chapter is really about>", "reason": "<why it matters here>", "priority": 1 }
  ],
  "sections": [
    { "id": "big-idea", "title": "Big Idea", "type": "big_idea", "priority": 1, "isCore": true, "cardSummary": "<1-2 sentence hook>", "fullContent": "<2-4 rich paragraphs>" },
    { "id": "chapter-flow", "title": "Chapter Flow", "type": "chapter_flow", "priority": 2, "isCore": true, "cardSummary": "<short>", "fullContent": "<walk the movement of the chapter, verse by verse where helpful>", "verseRefs": ["<c:v>"] },
    { "id": "historical-world", "title": "The World Behind It", "type": "historical_world", "priority": 3, "isCore": true, "cardSummary": "<short>", "fullContent": "<historical imagination, customs, setting>" },
    { "id": "what-most-miss", "title": "What Most People Miss", "type": "what_most_people_miss", "priority": 4, "isCore": true, "cardSummary": "<short>", "fullContent": "<the overlooked detail doing real work>" },
    { "id": "jesus", "title": "Jesus at the Center", "type": "jesus_connection", "priority": 5, "isCore": true, "cardSummary": "<short>", "fullContent": "<rich, careful Christ connection>" },
    { "id": "theology", "title": "Theology Principle", "type": "theology", "priority": 6, "isCore": true, "cardSummary": "<short>", "fullContent": "<the principle, started simple>" },
    { "id": "application", "title": "Live It", "type": "application", "priority": 7, "isCore": true, "cardSummary": "<short>", "fullContent": "<practical, invitational, no moralism>" },
    { "id": "prayer", "title": "Prayer", "type": "prayer", "priority": 8, "isCore": true, "cardSummary": "<short>", "fullContent": "<a fuller prayer>" },
    { "id": "image-plan", "title": "Image Plan", "type": "image_plan", "priority": 20, "isCore": false, "cardSummary": "<short>", "fullContent": "<describe the 3 images: establishing, detail, human>" }
  ],
  "biblicalTimeline": {
    "era": "<one of: Creation/Adam & Eve, Patriarchs, Exodus & Wilderness, David/Kingdom, Exile, Life of Jesus, Early Church, Today>",
    "estimatedYear": -1000,
    "estimatedYearLabel": "<CONFIDENT, concise VISIBLE timeline copy — no hedge words ('traditionally', 'approximate', 'debated', 'not pinpointed'). Place the scene like a wise friend, e.g. 'Around AD 30, in Galilee under Herod Antipas' or 'Around 1000 BC, in David's world'>",
    "dateRange": { "startYear": -1100, "endYear": -900 },
    "confidence": "<high | medium | low | debated>",
    "chronologyBasis": "<e.g. 'traditional/event date' or 'likely composition date'>",
    "uncertaintyNote": "<dating nuance for the Transparency drawer ONLY — never shown as headline copy. Here (and only here) you may say what is approximate/debated and why>",
    "placementReason": "<why you placed it here>"
  },
  "sceneChecks": [
    { "title": "<short, vivid>", "body": "<warm, conversational correction of a common WRONG mental image — confident, lightly witty when it fits, never academic>", "relatedVerses": ["<c:v>"], "visualAccuracyNotes": ["<a concrete visual correction that will steer future image generation, e.g. 'tabernacle tent, not a stone temple' or 'wrapped linen turban, not a crown'>"] }
  ],
  "behindTheChapter": {
    "author": { "title": "<who likely wrote it>", "body": "<short, confident, honest about debate where real>" },
    "firstAudience": { "title": "<who first heard / read / sang it>", "body": "<short>" },
    "historicalWorld": { "title": "<the world they lived in>", "body": "<short, vivid>" },
    "evidence": { "title": "<manuscripts / inscriptions / archaeology that ground it>", "body": "<short, honest — name real artifacts/sources where they exist>" }
  },
  "bibleText": { "version": "${bibleVersion ?? "ESV"}" }
}

SCENE CHECKS (picture it accurately)
- Include 1-3 "sceneChecks" ONLY where this chapter has a visual-historical detail
  people commonly imagine wrongly (wrong building, wrong clothing, wrong scale,
  English text on objects, a tidy scene that was really chaotic/dangerous, etc.).
  Do not force them. Tone: warm, visual, confident, historically grounded, lightly
  witty when it fits — like a wise friend, not a textbook. When supplied chapter
  review notes identify real visual corrections, include at least one; otherwise
  an empty array is better than a forced card.
- "visualAccuracyNotes" are crisp, concrete corrections that will later be fed to
  image generation as guardrails. Be specific (materials, scale in feet, no English
  lettering, era-appropriate script, etc.).

BEHIND THE CHAPTER
- Fill "behindTheChapter" with four short, confident cards: who likely wrote it,
  who first heard/read/sang it, the world they lived in, and the manuscripts /
  inscriptions / archaeology that ground it. Name real evidence where it exists;
  stay honest about uncertainty without sounding like a disclaimer.

DATES — CONFIDENT IN FRONT, HONEST IN DETAIL
- estimatedYear is internal (negative = BC).
- estimatedYearLabel is the VISIBLE main-timeline copy: keep it CONCISE and CONFIDENT.
  Do NOT put hedge words there ("traditionally", "approximate", "exact dating is
  debated", "not pinpointed"). Write it like a wise friend placing the scene:
  "Around AD 30, in Galilee under Herod Antipas."
- Put real dating uncertainty in uncertaintyNote ONLY. That text appears solely in the
  Transparency drawer / expanded historical detail — never as headline copy.
- Narrative chapters: place the marker at the EVENT date. Psalms/Proverbs/epistles/
  poetry: place at the likely COMPOSITION/context date (note the nuance in
  uncertaintyNote). Prophecy: use the date spoken/written, note fulfillment in prose.
- Never claim a precise Creation year.

CHOOSING TOPICS FIRST
Before writing, identify in "chapterSpecificTopics" what THIS chapter is actually
about (e.g. for Psalm 23: shepherding world, green pastures & still waters, valley
of the shadow, rod & staff, table before enemies, goodness & mercy, the Good
Shepherd). Let those topics shape the sections. Do NOT fill the same generic
sections for every chapter.

SECTION DEPTH (this is the heart of Selah)
- Include all 8 core sections above (isCore true). Also add helpful non-core
  sections when the passage warrants: "verse_by_verse" (movement through the
  chapter), "original_language" (only when a Hebrew/Greek word genuinely
  illuminates), "map_notes" (when geography matters), "custom" (a chapter-specific
  topic from your list).
- "cardSummary" is short and polished (1-2 sentences). "fullContent" is the real
  daily-rundown: multiple paragraphs, specific to THIS chapter, with historical
  imagination, verse-by-verse movement, and a warm, accurate Jesus connection.
- Be specific, not generic. If a section could apply to almost any chapter, rewrite it.

PASSAGE FLOW & QUESTIONS
- "verseByVerse" is the machine-checkable chapter spine. Use one entry for every
  natural scene or argument movement. Keep entries ordered and cover the whole
  chapter from verse 1 through the final verse with no gaps or overlaps. Narrative
  chapters commonly need 5-10 entries; do not compress a broad chapter into an
  arbitrary 2-4 items. "startVerse" and "endVerse" are inclusive integers;
  "rangeLabel" is display copy only.
- "whatPeopleAsk" must contain 5-8 questions people genuinely ask about THIS
  chapter. Answer the real concern beneath each question in Selah's warm,
  plainspoken voice. Include difficult historical, theological, textual, or
  pastoral questions when the chapter raises them. Never invent certainty,
  promise an automatic outcome, blame suffering, or use an answer to bypass
  safety, medical care, justice, or wise pastoral care.

RULES
- "generatedImages" MUST have exactly 3 entries in this order: establishing, detail, human, each with status "placeholder".
- "primaryCharacters" is an array of strings; "keyObjects", "keyPeople", "sections", "chapterSpecificTopics" are arrays of OBJECTS.
- Provide 2-4 items for timeline.items and each goDeeper group; 2-6 keyObjects
  and keyPeople; 3-7 chapterSpecificTopics; 5-8 whatPeopleAsk items. Passage-flow
  length is determined by complete chapter coverage, not a fixed small count.
- Mark the timeline item for THIS chapter with "active": true.
- "bibleText.version" records the reader-display version only. Generation
  provenance is server-owned and bound separately even when both use ESV.
- Be honest about uncertainty for dates/locations; do not overreach historically or theologically.${rulesBlock}${chapterBlock}${examplesBlock}${
    generationSourceBlock
  }`;
}

/** Build the ordinary source-free prompt used by the existing generator. */
export function buildChapterWorkupPrompt(
  input: ChapterWorkupPromptInput,
): string {
  return buildChapterWorkupPromptInternal({
    book: input.book,
    chapter: input.chapter,
    bibleVersion: input.bibleVersion,
    globalRules: input.globalRules,
    chapterNotes: input.chapterNotes,
    examples: input.examples,
  });
}

/**
 * Build a source-framed prompt for the future protected runner.
 *
 * This pure formatter does not authorize generation. The runner must first
 * prove that this exact source bundle and final request are manifest-bound.
 */
export function buildProtectedChapterWorkupPrompt(
  input: ProtectedChapterWorkupPromptInput,
): string {
  return buildChapterWorkupPromptInternal(input);
}
