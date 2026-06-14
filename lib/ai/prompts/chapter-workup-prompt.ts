// Builds the prompt that asks the model for ONE shared global Selah chapter
// workup. No API call here — this only assembles the instruction string.

export interface ChapterWorkupPromptInput {
  book: string;
  chapter: number;
  bibleVersion?: string;
  bibleText?: string;
}

export function buildChapterWorkupPrompt(input: ChapterWorkupPromptInput): string {
  const { book, chapter, bibleVersion, bibleText } = input;
  const slug = `${book.toLowerCase().replace(/\s+/g, "-")}-${chapter}`;

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
  "subtitle": "<short evocative subtitle>",
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
    "modern": { "title": "Modern Map", "description": "<what it shows today>", "uncertaintyNote": "<optional>" },
    "historic": { "title": "Historic Map", "description": "<the biblical-world view>", "uncertaintyNote": "<optional>" }
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
    { "range": "<e.g. '1-6'>", "title": "<short>", "explanation": "<brief, no quoted verse text>" }
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
    "estimatedYearLabel": "<honest label, e.g. 'traditionally c. 1000 BC' — never a false-precise date>",
    "dateRange": { "startYear": -1100, "endYear": -900 },
    "confidence": "<high | medium | low | debated>",
    "chronologyBasis": "<e.g. 'traditional/event date' or 'likely composition date'>",
    "uncertaintyNote": "<what is uncertain and why>",
    "placementReason": "<why you placed it here>"
  },
  "bibleText": { "version": "${bibleVersion ?? "ESV"}" }
}

DATES — BE HONEST
- estimatedYear is internal (negative = BC). The visible label (estimatedYearLabel)
  must NOT pretend uncertain dates are certain — use "traditionally c. ...",
  "approximate", or "debated".
- Narrative chapters: place the marker at the EVENT date. Psalms/Proverbs/epistles/
  poetry: place at the likely COMPOSITION/context date and say it's uncertain.
  Prophecy: use the date spoken/written, and note fulfillment separately in prose.
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

RULES
- "generatedImages" MUST have exactly 3 entries in this order: establishing, detail, human, each with status "placeholder".
- "primaryCharacters" is an array of strings; "keyObjects", "keyPeople", "sections", "chapterSpecificTopics" are arrays of OBJECTS.
- Provide 2-4 items for timeline.items, keyObjects, keyPeople, verseByVerse, and each goDeeper group; 3-7 chapterSpecificTopics.
- Mark the timeline item for THIS chapter with "active": true.
- Be honest about uncertainty for dates/locations; do not overreach historically or theologically.${
    bibleText ? `\n\nUse this chapter text as your source (do not quote it verbatim in output):\n"""\n${bibleText}\n"""` : ""
  }`;
}
