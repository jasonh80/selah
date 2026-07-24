// IQ-019 "Disciple It" safety gate (Codex ruling, 2026-07-24; corrections
// 2026-07-24 exact-head review).
//
// Deterministic phrase checks that a Disciple It section is an INVITATION, not
// an assignment, is grounded in the chapter, and does not merely repeat Live
// It. A separate semantic editorial review (the generation model / Codex) is
// senior to this — this layer catches the unambiguous coercion patterns fast
// and cheaply, and MUST NOT flag a biblical command the card only quotes or
// explains.

export type DiscipleshipSection = {
  id?: string;
  type?: string;
  isCore?: boolean;
  title?: string;
  cardSummary?: string;
  fullContent?: string;
  verseRefs?: string[];
};

export type DiscipleshipInput = {
  /** The chapter's discipleship section, or null if none was produced. */
  section: DiscipleshipSection | null;
  /** How many discipleship-typed sections exist (for the duplicate check). */
  count: number;
  /** The chapter's Live It (application) full text, to check for duplication. */
  applicationText?: string;
  /** Chapter reference like "Mark 12" — verse refs must belong to it. */
  chapterRef: string;
  /** Other chapter prose (summary, what-happens, big idea) — lets genericity be
   * judged by grounding in THIS chapter's substance rather than by length. */
  chapterContext?: string;
  /** When true, a missing section is a violation (forward chapters, Mark 12+).
   * When false, absence is silent and only a present section is checked. */
  enforcePresence?: boolean;
};

export type DiscipleshipViolation = {
  code:
    | "MISSING"
    | "DUPLICATE_SECTION"
    | "WRONG_SECTION_SHAPE"
    | "ASSIGNMENT_LANGUAGE"
    | "QUOTA_OR_DEADLINE"
    | "GUILT_OR_SCORE"
    | "PERSON_AS_PROJECT"
    | "NO_VERSE_REF"
    | "VERSE_REF_OFF_CHAPTER"
    | "DUPLICATES_LIVE_IT"
    | "GENERIC_COPY";
  message: string;
  /** The offending phrase, when a phrase check fired. */
  evidence?: string;
};

// The outreach verbs the invitation-only law names: "Do not command the reader
// to contact, teach, share with, recruit, or report to anyone." An imperative
// built on one of these turns the invitation into an assignment.
const OUTREACH_VERB =
  "ask|tell|text|message|dm|email|call|contact|reach|reach out|invite|share|teach|disciple|recruit|confront|report|forward|post|bring|lead|witness|send|talk|speak|mention|introduce|evangeli[sz]e";

// Objects/targets that mark an outreach verb as pointed at another person
// (rather than, say, "share in the joy" or "ask yourself"). Includes bare
// person nouns AND prepositional targets ("talk WITH a friend", "send this TO
// a friend").
const OUTREACH_OBJECT =
  "someone|somebody|a friend|friends|a neighbou?r|people|them|others|anyone|everyone|your (?:friend|family|neighbou?r|co-?worker|colleague|group|kids|children|spouse|small group)|this (?:chapter|passage|with|to)|it (?:with|to)|the (?:gospel|good news|chapter|passage|word)|(?:with|to)\\s+(?:a\\s+)?(?:friend|friends|neighbou?r|someone|somebody|them|people|others|your\\s+\\w+)|three|3|two|2|four|4|five|5|back\\b";

// A command position: start of string/sentence, or after a joining connective
// ("and report back", "then tell three people"). An optional polite/lead word
// ("please …", "go tell", "go and share") is absorbed. Deliberately does NOT
// include a bare mid-sentence comma, so softened forms are never
// sentence-initial for their verb; softening is handled by the permission-modal
// exemption below.
const IMPERATIVE_ANCHOR =
  "(?:^|[.!?][\"')\\]]?\\s+|\\n\\s*|\\b(?:and|then|so|now|next|also|first|second|third|finally|today)\\s+,?\\s*)";
const IMPERATIVE_LEAD = "(?:please\\s+|kindly\\s+|go\\s+(?:and\\s+)?|be\\s+sure\\s+to\\s+|make\\s+sure\\s+to\\s+)?";

// Proper-name objects ("Teach Jordan", "Tell Sarah") — case-SENSITIVE so a real
// name is required, excluding the divine names a card legitimately addresses.
const NAME_OBJECT = "(?!Jesus|God|Christ|Lord|Him|Holy|Father|Spirit)[A-Z][a-z]+";

const ASSIGNMENT_PATTERNS: { re: RegExp; label: string }[] = [
  // Sentence-initial (or connector-led) outreach command with a person object.
  {
    re: new RegExp(
      `${IMPERATIVE_ANCHOR}${IMPERATIVE_LEAD}(${OUTREACH_VERB})\\b(?:\\s+\\S+){0,3}?\\s+(?:${OUTREACH_OBJECT})`,
      "i",
    ),
    label: "commanded outreach",
  },
  // Outreach command aimed at a named person ("Teach Jordan …"). Case-sensitive
  // object, so the leading verb match is case-sensitive too (no `i`).
  {
    re: new RegExp(
      `${IMPERATIVE_ANCHOR}${IMPERATIVE_LEAD}(?:[Aa]sk|[Tt]ell|[Tt]each|[Ii]nvite|[Cc]ontact|[Tt]ext|[Mm]essage|[Ee]mail|[Cc]all|[Bb]ring|[Ss]end|[Ww]arn|[Tt]alk to|[Ss]peak to|[Mm]ention (?:it |this )?to)\\s+${NAME_OBJECT}\\b`,
    ),
    label: "commanded outreach (named person)",
  },
  // "report back" / "reach out" as a bare imperative even without a later object.
  {
    re: new RegExp(`${IMPERATIVE_ANCHOR}${IMPERATIVE_LEAD}(report back|reach out|pass it on|spread the word)\\b`, "i"),
    label: "commanded outreach",
  },
  // Obligation on the reader, but ONLY when aimed at outreach — "you should
  // love your neighbour" (explaining the chapter) is NOT an assignment.
  {
    re: new RegExp(
      `\\byou\\s+(?:must|need to|needs? to|have to|has to|should|ought to|are (?:called|assigned|expected|supposed) to)\\s+(?:\\S+\\s+){0,3}?(?:${OUTREACH_VERB})\\b`,
      "i",
    ),
    label: "obligation to reach others",
  },
  { re: /\bthis\s+week\s+(you|,)/i, label: "weekly assignment" },
  { re: /\byour\s+(assignment|mission|homework|task|quota)\b/i, label: "assignment framing" },
  {
    re: /\bmake\s+(a\s+)?disciples?\s+(of|out of)\s+(three|3|someone|somebody|people|him|her|them)\b/i,
    label: "quota discipling",
  },
];

// A permission modal that GOVERNS a whole sentence turns a command into a
// genuine invitation ("If it would help, you MIGHT contact a friend AND share
// this chapter…"). When such a cue appears before an assignment match in the
// same sentence, the ASSIGNMENT check is exempted — but QUOTA/DEADLINE, GUILT,
// and PERSON_AS_PROJECT are NOT, so a softened quota still fails.
const PERMISSION_CUE =
  /\b(you\s+(?:might|may|could|can)|if\s+(?:it\s+would\s+help|it\s+helps|you\s+(?:want|wish|would\s+like|like|feel|choose)|helpful)|one\s+(?:gentle|good|simple|natural|quiet)?\s*way|feel\s+free|you(?:'re| are)\s+welcome\s+to|perhaps|maybe|consider\s+(?:whether|gently)|no\s+pressure)\b/i;

// Word- or digit-numbers before a person noun, so a SOFTENED quota
// ("you might invite three friends this week") still fails even when the
// command itself is exempted.
const COUNT = "(?:\\d+|one|two|three|four|five|six|seven|several|a\\s+few|a\\s+couple)";
const QUOTA_DEADLINE = new RegExp(
  "\\b(" +
    "by (today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|end of (the )?(day|week))|" +
    "within \\d+ (day|week|hour)|" +
    "(?:every|each) day(?: this week)?|" +
    `${COUNT}\\s+(people|friends|souls|others|neighbou?rs)\\s+(this|per|a|each|every|by|before)\\b|` +
    `${COUNT}\\s+(people|friends|souls|others|neighbou?rs)\\b[^.!?]*\\bthis\\s+week` +
    ")",
  "i",
);
const GUILT_SCORE =
  /\b(if you don'?t,? you|failing to|you owe|prove (your|you're|you are)|track your|keep a (streak|count|log|tally)|how many (people|souls|friends)|obedience score|spiritual (scorecard|score)|real christians?|good christians? (share|tell|witness))\b/i;

// Person-as-project language, but NOT when negated ("a friend is not your
// project"). Scanned with matchAll so a negated instance never hides a real
// one later in the copy. The negation guard scans a short window before EACH
// match.
const PERSON_AS_PROJECT =
  /\b(your (project|target|prospect)|work on (him|her|them)|close the deal|get them (saved|to convert)|until they (convert|believe)|fix (him|her|them))\b/gi;
const NEGATION_BEFORE = /\b(not|never|no|isn'?t|aren'?t|do ?n'?t|do not|nobody is|no one is|not a)\b[^.!?]{0,24}$/i;

/** Jaccard word overlap — cheap "is this basically that text reworded" check. */
function contentWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4),
  );
}
function overlapRatio(a: string, b: string): number {
  const A = contentWords(a);
  const B = contentWords(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}
/** Ultra-generic gospel words that appear in almost any chapter — they must NOT
 * count as evidence a card is grounded in THIS chapter (Codex: a token citation
 * on reusable prose is not grounding). */
const GROUNDING_STOPWORDS = new Set([
  "jesus",
  "christ",
  "follow",
  "following",
  "followers",
  "disciple",
  "disciples",
  "discipleship",
  "gospel",
  "chapter",
  "verse",
  "verses",
  "people",
  "someone",
  "friend",
  "friends",
  "others",
  "share",
  "sharing",
  "helping",
  "faith",
  "believe",
  "church",
  "kingdom",
  "truth",
  "notice",
  "invite",
]);
/** Count of specific (non-stopword, 5+ char) words the prose shares with the
 * chapter's own material — the substance-grounding signal for genericity. */
function sharedSpecificCount(body: string, context: string): number {
  const B = new Set([...contentWords(context)].filter((w) => !GROUNDING_STOPWORDS.has(w)));
  let shared = 0;
  for (const w of contentWords(body)) if (!GROUNDING_STOPWORDS.has(w) && B.has(w)) shared++;
  return shared;
}

/** Canonical book names (lowercased) — used to tell an INLINE off-chapter
 * reference ("John 12:17") from a bare in-chapter one ("in 12:17"), so an
 * ordinary preceding word like "in" is never mistaken for a book. */
const BOOK_NAMES = new Set(
  (
    "genesis exodus leviticus numbers deuteronomy joshua judges ruth samuel kings chronicles ezra nehemiah esther job psalm psalms proverbs ecclesiastes song isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans corinthians galatians ephesians philippians colossians thessalonians timothy titus philemon hebrews james peter jude revelation"
  ).split(" "),
);

const MAX_VERSE = 176; // longest chapter in Scripture (Psalm 119)
function validVerseRange(vStart: number, vEnd: number): boolean {
  return (
    Number.isInteger(vStart) &&
    Number.isInteger(vEnd) &&
    vStart >= 1 &&
    vEnd >= vStart &&
    vEnd <= MAX_VERSE
  );
}

/** A scripture reference parsed into structured parts. Accepts "12:17",
 * "12:15-17", "12:15–20", "Mark 12:17", "1 Cor 3:6", "Mark 12:15-17". Returns
 * null for impossible ranges ("12:0", "12:34-28", "12:999"). */
type ParsedRef = { book?: string; chapter: number; vStart: number; vEnd: number };
function parseRef(raw: string): ParsedRef | null {
  const t = raw.trim().toLowerCase();
  const m = t.match(/^(?:([1-3]?\s?[a-z][a-z.]*)\s+)?(\d+):(\d+)(?:\s*[-–—]\s*(\d+))?$/);
  if (!m) return null;
  const book = m[1]?.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const chapter = Number(m[2]);
  const vStart = Number(m[3]);
  const vEnd = m[4] ? Number(m[4]) : vStart;
  if (!Number.isFinite(chapter) || chapter < 1 || !validVerseRange(vStart, vEnd)) return null;
  return { book, chapter, vStart, vEnd };
}
function parseChapterRef(chapterRef: string): { book?: string; chapter: number } | null {
  const m = chapterRef.trim().toLowerCase().match(/^([1-3]?\s?[a-z][a-z.]*(?:\s+[a-z]+)?)\s+(\d+)$/);
  if (!m) return null;
  // Reduce a multi-word book to its last token ("song of solomon" → "solomon"
  // isn't a book; keep the recognizable token). Compare on the canonical name.
  const bookRaw = m[1].replace(/\s+/g, " ").trim();
  const bookToken = bookRaw.split(" ").find((w) => BOOK_NAMES.has(w)) ?? bookRaw;
  return { book: bookToken, chapter: Number(m[2]) };
}
function refInChapter(ref: ParsedRef, chap: { book?: string; chapter: number }): boolean {
  if (ref.chapter !== chap.chapter) return false;
  if (ref.book && chap.book && ref.book !== chap.book) return false;
  return true;
}

/** The sentence (…terminated by . ! ? or a blank line) that contains `index`. */
function enclosingSentence(text: string, index: number): string {
  const start = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf("!", index - 1),
    text.lastIndexOf("?", index - 1),
    text.lastIndexOf("\n", index - 1),
  );
  const rel = text.slice(start + 1).search(/[.!?]|\n/);
  const end = rel === -1 ? text.length : start + 1 + rel;
  return text.slice(start + 1, end);
}

export function checkDiscipleship(input: DiscipleshipInput): DiscipleshipViolation[] {
  const v: DiscipleshipViolation[] = [];
  const section = input.section;

  if (!section || !((section.fullContent ?? "").trim())) {
    if (input.enforcePresence !== false) {
      v.push({
        code: "MISSING",
        message:
          "Newly prepared chapters (Mark 12+) require exactly one Disciple It section; none was produced.",
      });
    }
    return v;
  }
  if (input.count > 1) {
    v.push({
      code: "DUPLICATE_SECTION",
      message: `Exactly one core discipleship section is allowed; found ${input.count}.`,
    });
  }
  // Structural shape is only asserted when the caller supplied the real fields
  // (production path); minimal unit inputs omit them.
  if (section.id !== undefined || section.type !== undefined || section.isCore !== undefined) {
    if (section.type !== "discipleship" || section.id !== "discipleship" || section.isCore !== true) {
      v.push({
        code: "WRONG_SECTION_SHAPE",
        message:
          'The Disciple It section must be the core section with id "discipleship", type "discipleship", isCore true.',
      });
    }
  }

  const text = `${section.cardSummary ?? ""}\n${section.fullContent ?? ""}`;

  // A permission modal governing the match's sentence ("if it would help, you
  // might contact a friend and share…") makes it an invitation — exempt the
  // COMMAND. (Quota/guilt/project are checked below and are NOT exempted.)
  const permissionGoverned = (matchIndex: number): boolean => {
    const start = Math.max(
      text.lastIndexOf(".", matchIndex - 1),
      text.lastIndexOf("!", matchIndex - 1),
      text.lastIndexOf("?", matchIndex - 1),
      text.lastIndexOf("\n", matchIndex - 1),
      -1,
    );
    return PERMISSION_CUE.test(text.slice(start + 1, matchIndex));
  };
  for (const { re, label } of ASSIGNMENT_PATTERNS) {
    const m = re.exec(text);
    if (m && m.index !== undefined && !permissionGoverned(m.index)) {
      v.push({
        code: "ASSIGNMENT_LANGUAGE",
        message: `Reads as an assignment (${label}) — Disciple It must be an invitation.`,
        evidence: m[0].trim(),
      });
    }
  }
  const q = text.match(QUOTA_DEADLINE);
  if (q) v.push({ code: "QUOTA_OR_DEADLINE", message: "Contains a quota or deadline; invitations carry neither.", evidence: q[0] });
  const g = text.match(GUILT_SCORE);
  if (g) v.push({ code: "GUILT_OR_SCORE", message: "Contains guilt or a spiritual score.", evidence: g[0] });
  // matchAll so a negated instance ("a friend is not your project") never hides
  // a real one later in the copy.
  for (const pm of text.matchAll(PERSON_AS_PROJECT)) {
    if (pm.index === undefined) continue;
    if (!NEGATION_BEFORE.test(text.slice(0, pm.index))) {
      v.push({ code: "PERSON_AS_PROJECT", message: "Treats another person as a project/target.", evidence: pm[0] });
      break;
    }
  }

  // Verse grounding: parse every ref accurately; at least one must be in this
  // chapter, and none (declared or inline) may point at a different chapter.
  const chap = parseChapterRef(input.chapterRef);
  const declared = section.verseRefs ?? [];
  let inChapterCount = 0;
  for (const r of declared) {
    const parsed = parseRef(r);
    if (!parsed) {
      v.push({ code: "VERSE_REF_OFF_CHAPTER", message: `Verse ref "${r}" is not a recognizable reference.`, evidence: r });
      continue;
    }
    if (chap && refInChapter(parsed, chap)) inChapterCount++;
    else if (chap) v.push({ code: "VERSE_REF_OFF_CHAPTER", message: `Verse ref "${r}" is not in ${input.chapterRef}.`, evidence: r });
  }
  // Inline chapter:verse references in the body must also belong to this
  // chapter. An optional leading BOOK name is honored ("John 12:17" is
  // off-chapter for Mark 12) but an ordinary preceding word ("in 12:17") is
  // not treated as a book. Impossible ranges are ignored, not counted.
  const body = section.fullContent ?? "";
  const inlineRe = /\b(?:([1-3]?\s?[A-Za-z][A-Za-z.]*)\s+)?(\d+):(\d+)(?:\s*[-–—]\s*(\d+))?\b/g;
  let im: RegExpExecArray | null;
  let inlineInChapter = 0;
  while ((im = inlineRe.exec(body)) !== null) {
    const rawBook = im[1]?.replace(/\./g, "").trim().toLowerCase();
    const inlineBook = rawBook && BOOK_NAMES.has(rawBook) ? rawBook : undefined;
    const inlineChapter = Number(im[2]);
    const vStart = Number(im[3]);
    const vEnd = im[4] ? Number(im[4]) : vStart;
    if (!validVerseRange(vStart, vEnd)) continue; // "12:0", "12:34-28", "12:999"
    const sameBook = !inlineBook || !chap?.book || inlineBook === chap.book;
    if (chap && inlineChapter === chap.chapter && sameBook) inlineInChapter++;
    else if (chap) {
      v.push({
        code: "VERSE_REF_OFF_CHAPTER",
        message: `Inline reference "${im[0].trim()}" is not in ${input.chapterRef}.`,
        evidence: im[0].trim(),
      });
    }
  }
  if (inChapterCount === 0 && inlineInChapter === 0) {
    v.push({ code: "NO_VERSE_REF", message: "No in-chapter verse reference; Disciple It must be grounded in this chapter." });
  }

  if (input.applicationText && overlapRatio(text, input.applicationText) > 0.55) {
    v.push({
      code: "DUPLICATES_LIVE_IT",
      message: "Substantially duplicates Live It; Disciple It must be materially different (how the truth travels to another person).",
    });
  }

  // Genericity by SUBSTANCE, not length, and NOT rescued by a token citation
  // (Codex: reusable-anywhere prose can add a verseRefs token and evade this).
  // A card is grounded only when the PROSE points at a specific verse of this
  // chapter (inline c:v) or shares specific, non-generic vocabulary with the
  // chapter's own material.
  const grounded =
    inlineInChapter > 0 ||
    (input.chapterContext ? sharedSpecificCount(body, input.chapterContext) >= 1 : false);
  if (!grounded) {
    v.push({
      code: "GENERIC_COPY",
      message: "Generic/reusable-anywhere copy — not grounded in this chapter's material (a bare verse citation is not enough).",
    });
  }

  return v;
}

/** The forward generation contract: which chapters must carry a Disciple It
 * section. A cutoff (Mark 12 onward), not a one-chapter special case — Mark
 * 13–16 inherit it, and legacy Mark 6–11 are untouched. */
export function chapterRequiresDiscipleship(book: string, chapter: number): boolean {
  return book.trim().toLowerCase() === "mark" && chapter >= 12;
}

/** Stable QUALITY codes in the existing "PREFIX-### NAME" grammar — the single
 * source of truth shared by the quality evaluator and the live generate/save
 * path. Only the code reaches the durable audit token (whitespace → "_"), so
 * these carry the failure class without leaking any authored copy. */
export const DISCIPLESHIP_QUALITY_CODE: Record<DiscipleshipViolation["code"], string> = {
  MISSING: "DSC-001 DISCIPLESHIP_MISSING",
  DUPLICATE_SECTION: "DSC-002 DISCIPLESHIP_DUPLICATE_SECTION",
  WRONG_SECTION_SHAPE: "DSC-011 DISCIPLESHIP_WRONG_SECTION_SHAPE",
  ASSIGNMENT_LANGUAGE: "DSC-003 DISCIPLESHIP_ASSIGNMENT_LANGUAGE",
  QUOTA_OR_DEADLINE: "DSC-004 DISCIPLESHIP_QUOTA_OR_DEADLINE",
  GUILT_OR_SCORE: "DSC-005 DISCIPLESHIP_GUILT_OR_SCORE",
  PERSON_AS_PROJECT: "DSC-006 DISCIPLESHIP_PERSON_AS_PROJECT",
  NO_VERSE_REF: "DSC-007 DISCIPLESHIP_NO_VERSE_REF",
  VERSE_REF_OFF_CHAPTER: "DSC-008 DISCIPLESHIP_VERSE_REF_OFF_CHAPTER",
  DUPLICATES_LIVE_IT: "DSC-009 DISCIPLESHIP_DUPLICATES_LIVE_IT",
  GENERIC_COPY: "DSC-010 DISCIPLESHIP_GENERIC_COPY",
};

/** Minimal shape the workup-level check reads. Matches GeneratedChapterWorkup
 * without importing it (keeps this gate dependency-light and reusable). */
export type WorkupForDiscipleship = {
  book: string;
  chapter: number;
  application?: string;
  summary?: string;
  whatHappens?: string;
  sections?: Array<{
    id: string;
    type: string;
    isCore: boolean;
    title: string;
    cardSummary: string;
    fullContent: string;
    verseRefs?: string[];
  }>;
};

/**
 * Run the gate against a whole generated workup — the single source of truth
 * used by BOTH the protected quality evaluator and the live Mark 12
 * generate-and-save path. Picks the reader-visible Live It from the application
 * SECTION (what actually renders) with the top-level field as a fallback, and
 * supplies chapter context so genericity is judged by grounding, not length.
 */
export function checkWorkupDiscipleship(
  workup: WorkupForDiscipleship,
  opts: { enforcePresence?: boolean } = {},
): DiscipleshipViolation[] {
  const sections = workup.sections ?? [];
  const discipleshipSections = sections.filter((s) => s.type === "discipleship");
  const primary =
    discipleshipSections.find((s) => s.isCore) ?? discipleshipSections[0] ?? null;
  const applicationSection = sections.find((s) => s.type === "application" && s.isCore);
  const bigIdea = sections.find((s) => s.type === "big_idea");

  const enforcePresence =
    opts.enforcePresence ?? chapterRequiresDiscipleship(workup.book, workup.chapter);

  return checkDiscipleship({
    section: primary
      ? {
          id: primary.id,
          type: primary.type,
          isCore: primary.isCore,
          title: primary.title,
          cardSummary: primary.cardSummary,
          fullContent: primary.fullContent,
          verseRefs: primary.verseRefs,
        }
      : null,
    count: discipleshipSections.length,
    applicationText: applicationSection?.fullContent ?? workup.application,
    chapterRef: `${workup.book} ${workup.chapter}`,
    chapterContext: [workup.summary, workup.whatHappens, bigIdea?.fullContent]
      .filter(Boolean)
      .join(" "),
    enforcePresence,
  });
}

/** The evidence path a workup-level violation points at (repair scope / audit). */
export function discipleshipEvidencePath(workup: WorkupForDiscipleship, code: DiscipleshipViolation["code"]): string {
  const sections = workup.sections ?? [];
  const idx = sections.findIndex((s) => s.type === "discipleship");
  if (code === "DUPLICATE_SECTION" || idx < 0) return "workup:/sections";
  return `workup:/sections/${idx}/fullContent`;
}
