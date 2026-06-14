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

  return `You are the content engine for Selah, a daily Bible chapter app whose only
goal is to help people grow closer to Jesus through Scripture.

Generate ONE shared, canonical workup for ${book} ${chapter}. This workup is global:
it is created once and shown to every user. It must be reusable, accurate, and
warm. Do not address any individual user or personalize it.

VOICE & VALUES
- Jesus, and growing closer to Him, is central — every section should ultimately
  point toward Christ without forcing it.
- This is NOT generic religious content, a sermon, or an academic paper.
- Be historically careful and HONEST ABOUT UNCERTAINTY. Never invent certainty
  for debated dates, locations, authorship, or routes. Use phrases like
  "approximate", "traditional location", "exact site debated", "possible route".
- Use accessible, modern language. Avoid academic coldness AND cheesy devotional
  clichés. No parchment-era stiffness, no sentimental fluff.
- Practical application WITHOUT moralism or guilt — invite, don't scold.
- The theology principle should start simple (level "beginner" for early chapters)
  and be something later chapters can build on.

REQUIRED CONTENT
- theme: a single short line capturing the chapter's main idea (e.g. "Holy access to God")
- summary, sceneSetter, historicalContext, whatHappens, whatPeopleMiss
- estimatedDate, estimatedLocation, modernLocationNote, primaryCharacters
- jesusConnection { short, full, relatedPassages }
- theologyPrinciple { name, level, explanation }
- application, prayer
- timeline { label, items[] } with the current chapter marked active
- maps.modern and maps.historic, each with a description and an uncertaintyNote
  when the geography is debated
- keyObjects[] and keyPeople[]
- "whatPeopleMiss": what a modern reader would likely misunderstand or overlook
- goDeeper grouped into learnMore[], diveDeeper[], growCloser[] (each item has a
  title and a short description)
- verseByVerse[] (optional ranges with brief, clear explanations)

THREE IMAGE DIRECTIONS (generatedImages, exactly 3, in this order)
1. type "establishing" — the broad world of the chapter ("Where am I?")
2. type "detail" — an object, place, ritual, or custom a modern reader may not
   understand ("What am I looking at?")
3. type "human" — a character, action, or emotional moment ("What did this feel
   like?")
For each image set status to "placeholder", write a vivid, historically grounded
"prompt" for an image model, plus title, description, alt, and caption. Leave
imageUrl empty.

OUTPUT
Return ONLY valid JSON matching the agreed schema (GeneratedChapterWorkupSchema).
No markdown, no commentary, no code fences. Set status to "draft", version "1",
and slug to "${book.toLowerCase().replace(/\s+/g, "-")}-${chapter}".
${bibleVersion ? `\nReference version for context: ${bibleVersion}.` : ""}${
    bibleText ? `\n\nChapter text:\n"""\n${bibleText}\n"""` : ""
  }`;
}
