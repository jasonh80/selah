// verify:discipleship — IQ-019 gate checks (Codex ruling 2026-07-24).
// Negative fixtures for assignments, quotas, generic copy, Live-It duplication,
// and unsafe pressure; a positive fixture that must pass clean; and a check
// that a biblical command the card merely QUOTES is not falsely flagged.

import { checkDiscipleship, type DiscipleshipInput } from "../lib/ai/quality/discipleship-gate";

let failures = 0;
const log = (ok: boolean, name: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const base = (fullContent: string, over: Partial<DiscipleshipInput> = {}): DiscipleshipInput => ({
  section: { title: "Disciple It", cardSummary: "A gentle invitation.", fullContent, verseRefs: ["12:17"], ...(over.section ?? {}) },
  count: over.count ?? 1,
  applicationText: over.applicationText,
  chapterRef: over.chapterRef ?? "Mark 12",
});

const has = (input: DiscipleshipInput, code: string) => checkDiscipleship(input).some((x) => x.code === code);
const clean = (input: DiscipleshipInput) => checkDiscipleship(input).length === 0;

// --- POSITIVE: a compliant invitation must pass clean ---
const GOOD =
  "When Jesus answers the coin trap in verses 15-17, he refuses to let loyalty to God shrink into a political slogan. Following him here means letting that same clarity shape where your ultimate allegiance sits. If it would help, you might invite a friend to notice how Jesus reframes the question — and let that be all, with no pressure and no follow-up owed.";
log(clean(base(GOOD)), "compliant invitation passes clean", JSON.stringify(checkDiscipleship(base(GOOD)).map((x) => x.code)));

// --- MISSING ---
log(has({ section: null, count: 0, chapterRef: "Mark 12" }, "MISSING"), "missing section flagged");

// --- DUPLICATE SECTION ---
log(has(base(GOOD, { count: 2 }), "DUPLICATE_SECTION"), "duplicate discipleship section flagged");

// --- ASSIGNMENT LANGUAGE ---
log(has(base("Ask three people this week to read Mark 12 with you and report back on verse 17."), "ASSIGNMENT_LANGUAGE"), "‘ask three people’ flagged");
log(has(base("This week you must share this chapter with someone who needs it."), "ASSIGNMENT_LANGUAGE"), "‘you must share’ flagged");
log(has(base("Your assignment: disciple two people using verses 28-34."), "ASSIGNMENT_LANGUAGE"), "‘your assignment’ flagged");

// --- QUOTA / DEADLINE ---
log(has(base("Reach 5 souls this week; by Sunday you should have three conversations about verse 30."), "QUOTA_OR_DEADLINE"), "quota/deadline flagged");

// --- GUILT / SCORE ---
log(has(base("If you don't, you are failing Jesus. Keep a streak of how many people you tell about 12:41-44."), "GUILT_OR_SCORE"), "guilt/score flagged");

// --- PERSON AS PROJECT ---
log(has(base("Pick your target, work on him until they convert, and close the deal on the gospel."), "PERSON_AS_PROJECT"), "person-as-project flagged");

// --- NO VERSE REF ---
log(has({ section: { fullContent: "A vague reflection about following and helping others, with no anchor at all in the text itself here.", verseRefs: [] }, count: 1, chapterRef: "Mark 12" }, "NO_VERSE_REF"), "no verse ref flagged");

// --- VERSE REF OFF CHAPTER ---
log(has(base(GOOD, { section: { verseRefs: ["John 3:16"] } }), "VERSE_REF_OFF_CHAPTER"), "off-chapter verse ref flagged");

// --- DUPLICATES LIVE IT ---
const LIVEIT =
  "When Jesus answers the coin trap in verses 15-17, he refuses to let loyalty to God shrink into a political slogan. Following him here means letting that same clarity shape where your ultimate allegiance sits today in your own choices.";
log(has(base(LIVEIT + " Consider where your allegiance sits.", { applicationText: LIVEIT }), "DUPLICATES_LIVE_IT"), "Live It duplication flagged");

// --- GENERIC COPY ---
log(has(base("Following Jesus means telling others about him and helping them grow so the kingdom expands everywhere."), "GENERIC_COPY"), "generic copy flagged");

// --- MUST NOT falsely flag a QUOTED biblical command ---
const QUOTED =
  "In verses 30-31 Jesus quotes the command, ‘You shall love the Lord your God’ and ‘love your neighbor as yourself.’ Explaining that command to a friend — only if it would help them — is one gentle way this chapter's truth can travel. No pressure, nothing owed.";
const quotedViolations = checkDiscipleship(base(QUOTED)).map((x) => x.code);
log(quotedViolations.length === 0, "quoted biblical command NOT falsely flagged", JSON.stringify(quotedViolations));

console.log(failures === 0 ? "\nverify:discipleship ✓ all checks passed" : `\nverify:discipleship ✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
