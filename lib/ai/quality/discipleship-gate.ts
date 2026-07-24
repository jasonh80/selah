// IQ-019 "Disciple It" safety gate (Codex ruling, 2026-07-24).
//
// Deterministic phrase checks that a Disciple It section is an INVITATION, not
// an assignment, is grounded in the chapter, and does not merely repeat Live
// It. A separate semantic editorial review (the generation model / Codex) is
// senior to this — this layer catches the unambiguous coercion patterns fast
// and cheaply, and MUST NOT flag a biblical command the card only quotes or
// explains.

export type DiscipleshipInput = {
  /** The chapter's discipleship section, or null if none was produced. */
  section: { title?: string; cardSummary?: string; fullContent?: string; verseRefs?: string[] } | null;
  /** How many discipleship-typed sections exist (for the duplicate check). */
  count: number;
  /** The chapter's Live It (application) full text, to check for duplication. */
  applicationText?: string;
  /** Chapter reference like "Mark 12" — verse refs must belong to it. */
  chapterRef: string;
};

export type DiscipleshipViolation = {
  code:
    | "MISSING"
    | "DUPLICATE_SECTION"
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

/** Command/pressure openings that turn the invitation into an assignment.
 * Anchored so we catch imperatives directed AT the reader, not quoted verbs. */
// Only BARE-COMMAND imperatives count as assignments. Softened forms
// ("you might invite a friend to notice…", "one gentle way…") are the GOOD
// shape Codex names and must pass — so the outreach verbs fire only when they
// open a sentence as a command, or under an explicit obligation modal.
const ASSIGNMENT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /(?:^|[.!?]\s+|\n\s*)(ask|tell|text|message|recruit|confront)\s+(three|3|two|2|five|5|someone|somebody|a friend|your|people|everyone)\b/i, label: "commanded outreach" },
  { re: /\byou\s+(must|need to|have to|should|are called to|are assigned)\b/i, label: "obligation on the reader" },
  { re: /\bthis\s+week\s+(you|,)/i, label: "weekly assignment" },
  { re: /\byour\s+(assignment|mission|homework|task)\b/i, label: "assignment framing" },
  { re: /\b(share|post|send|forward)\s+(this|it|the gospel)\s+(today|now|this week|with (three|3|five|5))/i, label: "share-now command" },
  { re: /\bmake\s+(a\s+)?disciples?\s+(of|out of)\s+(three|3|someone|people)\b/i, label: "quota discipling" },
];

const QUOTA_DEADLINE = /\b(by (today|tonight|tomorrow|friday|sunday|end of (the )?week)|within \d+ (day|week)|every day this week|\d+\s+(people|friends|souls)\s+(this|per)\b)/i;
const GUILT_SCORE = /\b(if you don'?t,? you|failing to|you owe|prove (your|you're)|track your|keep a (streak|count|log)|how many (people|souls)|obedience score|spiritual (scorecard|score)|real christians?)\b/i;
const PERSON_AS_PROJECT = /\b(your (project|target|prospect)|work on (him|her|them)|close the deal|get them (saved|to convert)|until they (convert|believe))\b/i;

/** Empty / reusable-anywhere copy: nothing chapter-specific, no verse anchor. */
function looksGeneric(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length < 120) return true;
  // A generic card can be pasted into any chapter — it names no scene, verse,
  // person, or concrete image. Require at least one concrete anchor.
  const hasVerse = /\b\d+:\d+\b/.test(text);
  const concrete = /\b(verse|verses|when jesus|the (widow|scribe|sadducees|pharisees|herodians|tenants|coin|denarius|temple)|in this chapter)\b/i.test(text);
  return !hasVerse && !concrete;
}

/** Jaccard word overlap — cheap "is this basically Live It reworded" check. */
function overlapRatio(a: string, b: string): number {
  const norm = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 4));
  const A = norm(a);
  const B = norm(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

export function checkDiscipleship(input: DiscipleshipInput): DiscipleshipViolation[] {
  const v: DiscipleshipViolation[] = [];

  if (!input.section || !((input.section.fullContent ?? "").trim())) {
    v.push({ code: "MISSING", message: "Newly prepared chapters (Mark 12+) require exactly one Disciple It section; none was produced." });
    return v;
  }
  if (input.count > 1) {
    v.push({ code: "DUPLICATE_SECTION", message: `Exactly one core discipleship section is allowed; found ${input.count}.` });
  }

  const text = `${input.section.cardSummary ?? ""}\n${input.section.fullContent ?? ""}`;

  for (const { re, label } of ASSIGNMENT_PATTERNS) {
    const m = text.match(re);
    if (m) v.push({ code: "ASSIGNMENT_LANGUAGE", message: `Reads as an assignment (${label}) — Disciple It must be an invitation.`, evidence: m[0] });
  }
  const q = text.match(QUOTA_DEADLINE);
  if (q) v.push({ code: "QUOTA_OR_DEADLINE", message: "Contains a quota or deadline; invitations carry neither.", evidence: q[0] });
  const g = text.match(GUILT_SCORE);
  if (g) v.push({ code: "GUILT_OR_SCORE", message: "Contains guilt or a spiritual score.", evidence: g[0] });
  const p = text.match(PERSON_AS_PROJECT);
  if (p) v.push({ code: "PERSON_AS_PROJECT", message: "Treats another person as a project/target.", evidence: p[0] });

  // Verse grounding: at least one ref, and refs must be in this chapter.
  const refs = input.section.verseRefs ?? [];
  const inlineVerses = (input.section.fullContent ?? "").match(/\b\d+:\d+\b/g) ?? [];
  if (refs.length === 0 && inlineVerses.length === 0) {
    v.push({ code: "NO_VERSE_REF", message: "No chapter verse reference; Disciple It must be grounded in this chapter." });
  }
  const bookChap = input.chapterRef.trim().toLowerCase(); // e.g. "mark 12"
  for (const r of refs) {
    const rl = r.trim().toLowerCase();
    // Accept "12:17" (bare) or "Mark 12:17"; reject a different book/chapter.
    const bare = /^\d+:\d+$/.test(rl);
    if (!bare && !rl.startsWith(bookChap)) {
      v.push({ code: "VERSE_REF_OFF_CHAPTER", message: `Verse ref "${r}" is not in ${input.chapterRef}.`, evidence: r });
    }
  }

  if (input.applicationText && overlapRatio(text, input.applicationText) > 0.55) {
    v.push({ code: "DUPLICATES_LIVE_IT", message: "Substantially duplicates Live It; Disciple It must be materially different (how the truth travels to another person)." });
  }

  if (looksGeneric(input.section.fullContent ?? "")) {
    v.push({ code: "GENERIC_COPY", message: "Empty or generic copy that could be pasted into any chapter; must be chapter-specific." });
  }

  return v;
}
