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
  "bibleText": { "version": "${bibleVersion ?? "ESV"}" }
}

RULES
- "generatedImages" MUST have exactly 3 entries in this order: establishing, detail, human, each with status "placeholder".
- "primaryCharacters" is an array of strings; "keyObjects" and "keyPeople" are arrays of OBJECTS.
- Provide 2-4 items for timeline.items, keyObjects, keyPeople, verseByVerse, and each goDeeper group.
- Mark the timeline item for THIS chapter with "active": true.${
    bibleText ? `\n\nChapter text for reference:\n"""\n${bibleText}\n"""` : ""
  }`;
}
