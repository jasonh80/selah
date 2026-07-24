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
  "ask|tell|text|message|dm|email|call|contact|reach|reach out|invite|share|teach|disciple|recruit|confront|report|forward|post|bring|lead|witness|evangeli[sz]e";

// Objects/targets that mark an outreach verb as pointed at another person
// (rather than, say, "share in the joy" or "ask yourself").
const OUTREACH_OBJECT =
  "someone|somebody|a friend|friends|a neighbou?r|people|them|others|anyone|everyone|your (?:friend|family|neighbou?r|co-?worker|group|kids|children|spouse|small group)|this (?:chapter|passage|with|to)|it (?:with|to)|the (?:gospel|good news|chapter|passage|word)|three|3|two|2|five|5|back\\b";

// A command position: start of string/sentence, or after a joining connective
// ("and report back", "then tell three people"). Deliberately does NOT include
// a bare mid-sentence comma, so softened forms — "you might invite…", "one
// gentle way is to invite…", "if it would help, you might share…" — are never
// sentence-initial for their verb and therefore pass.
const IMPERATIVE_ANCHOR =
  "(?:^|[.!?][\"')\\]]?\\s+|\\n\\s*|\\b(?:and|then|so|now|next|also|first|second|third|finally|today)\\s+,?\\s*)";

const ASSIGNMENT_PATTERNS: { re: RegExp; label: string }[] = [
  // Sentence-initial (or connector-led) outreach command with a person object.
  {
    re: new RegExp(
      `${IMPERATIVE_ANCHOR}(${OUTREACH_VERB})\\b(?:\\s+\\S+){0,3}?\\s+(?:${OUTREACH_OBJECT})`,
      "i",
    ),
    label: "commanded outreach",
  },
  // "report back" / "reach out" as a bare imperative even without a later object.
  {
    re: new RegExp(`${IMPERATIVE_ANCHOR}(report back|reach out|pass it on|spread the word)\\b`, "i"),
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

const QUOTA_DEADLINE =
  /\b(by (today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|end of (the )?(day|week))|within \d+ (day|week|hour)|every day this week|each day this week|\d+\s+(people|friends|souls|others)\s+(this|per|a|each)\b)/i;
const GUILT_SCORE =
  /\b(if you don'?t,? you|failing to|you owe|prove (your|you're|you are)|track your|keep a (streak|count|log|tally)|how many (people|souls|friends)|obedience score|spiritual (scorecard|score)|real christians?|good christians? (share|tell|witness))\b/i;

// Person-as-project language, but NOT when negated ("a friend is not your
// project"). The negation guard scans a short window before the match.
const PERSON_AS_PROJECT =
  /\b(your (project|target|prospect)|work on (him|her|them)|close the deal|get them (saved|to convert)|until they (convert|believe)|fix (him|her|them))\b/i;
const NEGATION_BEFORE = /\b(not|never|no|isn'?t|aren'?t|do ?n'?t|do not|nobody is|no one is|not a)\b[^.!?]{0,20}$/i;

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
function sharedWordCount(a: string, b: string): number {
  const A = contentWords(a);
  const B = contentWords(b);
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared;
}

/** A scripture reference parsed into structured parts. Accepts "12:17",
 * "12:15-17", "12:15–20", "Mark 12:17", "1 Cor 3:6", "Mark 12:15-17". */
type ParsedRef = { book?: string; chapter: number; vStart: number; vEnd: number };
function parseRef(raw: string): ParsedRef | null {
  const t = raw.trim().toLowerCase();
  const m = t.match(/^(?:([1-3]?\s?[a-z][a-z.]*)\s+)?(\d+):(\d+)(?:\s*[-–—]\s*(\d+))?$/);
  if (!m) return null;
  const book = m[1]?.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const chapter = Number(m[2]);
  const vStart = Number(m[3]);
  const vEnd = m[4] ? Number(m[4]) : vStart;
  if (!Number.isFinite(chapter) || !Number.isFinite(vStart)) return null;
  return { book, chapter, vStart, vEnd };
}
function parseChapterRef(chapterRef: string): { book?: string; chapter: number } | null {
  const m = chapterRef.trim().toLowerCase().match(/^([1-3]?\s?[a-z][a-z.]*(?:\s+[a-z]+)?)\s+(\d+)$/);
  if (!m) return null;
  return { book: m[1].replace(/\s+/g, " ").trim(), chapter: Number(m[2]) };
}
function refInChapter(ref: ParsedRef, chap: { book?: string; chapter: number }): boolean {
  if (ref.chapter !== chap.chapter) return false;
  if (ref.book && chap.book && ref.book !== chap.book) return false;
  return true;
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

  for (const { re, label } of ASSIGNMENT_PATTERNS) {
    const m = text.match(re);
    if (m) {
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
  const p = text.match(PERSON_AS_PROJECT);
  if (p && p.index !== undefined) {
    const before = text.slice(0, p.index);
    if (!NEGATION_BEFORE.test(before)) {
      v.push({ code: "PERSON_AS_PROJECT", message: "Treats another person as a project/target.", evidence: p[0] });
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
  // Inline chapter:verse references in the body must also belong to this chapter.
  const body = section.fullContent ?? "";
  const inlineRe = /\b(\d+):(\d+)(?:\s*[-–—]\s*\d+)?\b/g;
  let im: RegExpExecArray | null;
  let inlineInChapter = 0;
  while ((im = inlineRe.exec(body)) !== null) {
    const inlineChapter = Number(im[1]);
    if (chap && inlineChapter === chap.chapter) inlineInChapter++;
    else if (chap) {
      v.push({
        code: "VERSE_REF_OFF_CHAPTER",
        message: `Inline reference "${im[0]}" is not in ${input.chapterRef}.`,
        evidence: im[0],
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

  // Genericity by SUBSTANCE, not length (owner: no minimum-count padding). A
  // card is generic only if it is neither verse-grounded in this chapter nor
  // demonstrably drawn from this chapter's own material.
  const hasInChapterVerse = inChapterCount > 0 || inlineInChapter > 0;
  const grounded =
    hasInChapterVerse ||
    (input.chapterContext ? sharedWordCount(body, input.chapterContext) >= 3 : false);
  if (!grounded) {
    v.push({
      code: "GENERIC_COPY",
      message: "Generic/reusable-anywhere copy — not grounded in this chapter's verses or material.",
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
