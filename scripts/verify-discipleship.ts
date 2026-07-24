// verify:discipleship — IQ-019 gate checks (Codex ruling 2026-07-24, plus the
// exact-head corrections). Adversarial fixtures for the prohibited
// contact/teach/share/recruit/report law, accurate verse parsing, safe-copy
// exceptions (narrowed obligation + negated project language), structure/
// genericity, and a biblical command the card merely quotes.

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
  chapterContext: over.chapterContext,
});

const codes = (input: DiscipleshipInput) => checkDiscipleship(input).map((x) => x.code);
const has = (input: DiscipleshipInput, code: string) => codes(input).includes(code);
const clean = (input: DiscipleshipInput) => checkDiscipleship(input).length === 0;

// --- POSITIVE: a compliant invitation must pass clean ---
const GOOD =
  "When Jesus answers the coin trap in verses 15-17, he refuses to let loyalty to God shrink into a political slogan. Following him here means letting that same clarity shape where your ultimate allegiance sits. If it would help, you might invite a friend to notice how Jesus reframes the question — and let that be all, with no pressure and no follow-up owed.";
log(clean(base(GOOD)), "compliant invitation passes clean", JSON.stringify(codes(base(GOOD))));

// A SHORT, verse-grounded invitation must also pass — no minimum-count padding.
const SHORT_GOOD = "Jesus silences the trap in 12:17. If it helps, you might let a friend hear how he does it.";
log(clean(base(SHORT_GOOD)), "short verse-grounded invitation passes (no length minimum)", JSON.stringify(codes(base(SHORT_GOOD))));

// --- MISSING (only when presence is enforced) ---
log(has({ section: null, count: 0, chapterRef: "Mark 12" }, "MISSING"), "missing section flagged");
log(checkDiscipleship({ section: null, count: 0, chapterRef: "Mark 12", enforcePresence: false }).length === 0, "missing section NOT flagged for legacy (enforcePresence:false)");

// --- DUPLICATE SECTION ---
log(has(base(GOOD, { count: 2 }), "DUPLICATE_SECTION"), "duplicate discipleship section flagged");

// --- WRONG SECTION SHAPE (non-core / wrong id) ---
log(
  checkDiscipleship({ section: { id: "disciple", type: "discipleship", isCore: true, fullContent: GOOD, verseRefs: ["12:17"] }, count: 1, chapterRef: "Mark 12" }).some((x) => x.code === "WRONG_SECTION_SHAPE"),
  "wrong id flagged as WRONG_SECTION_SHAPE",
);
log(
  checkDiscipleship({ section: { id: "discipleship", type: "discipleship", isCore: false, fullContent: GOOD, verseRefs: ["12:17"] }, count: 1, chapterRef: "Mark 12" }).some((x) => x.code === "WRONG_SECTION_SHAPE"),
  "non-core flagged as WRONG_SECTION_SHAPE",
);

// --- ASSIGNMENT LANGUAGE: the exact contact/teach/share/recruit/report law ---
log(has(base("Ask three people this week to read Mark 12 with you and report back on verse 17."), "ASSIGNMENT_LANGUAGE"), "‘ask three people’ flagged");
log(has(base("This week you must share this chapter with someone who needs it."), "ASSIGNMENT_LANGUAGE"), "‘you must share’ flagged");
log(has(base("Your assignment: disciple two people using verses 28-34."), "ASSIGNMENT_LANGUAGE"), "‘your assignment’ flagged");
log(has(base("Share Mark 12 with a friend so they can read verse 17 too."), "ASSIGNMENT_LANGUAGE"), "‘Share Mark 12 with a friend’ flagged");
log(has(base("Teach someone this chapter and report back on 12:30."), "ASSIGNMENT_LANGUAGE"), "‘Teach someone … report back’ flagged");
log(has(base("Contact a friend. Teach them the gospel and report back about verse 17."), "ASSIGNMENT_LANGUAGE"), "‘Contact … report back’ flagged");
log(has(base("Reach three people about verse 30 before the weekend is over."), "ASSIGNMENT_LANGUAGE"), "‘Reach three people’ flagged");
log(has(base("Invite a friend to read Mark 12 aloud with you, then quiz them on verse 17."), "ASSIGNMENT_LANGUAGE"), "bare ‘Invite a friend’ imperative flagged");

// --- QUOTA / DEADLINE ---
log(has(base("Reach 5 souls this week; by Sunday you should have three conversations about verse 30."), "QUOTA_OR_DEADLINE"), "quota/deadline flagged");

// --- GUILT / SCORE ---
log(has(base("If you don't, you are failing Jesus. Keep a streak of how many people you tell about 12:41-44."), "GUILT_OR_SCORE"), "guilt/score flagged");

// --- PERSON AS PROJECT ---
log(has(base("Pick your target, work on him until they convert, and close the deal on the gospel by 12:44."), "PERSON_AS_PROJECT"), "person-as-project flagged");

// --- NO VERSE REF ---
log(has({ section: { fullContent: "A vague reflection about following and helping others, with no anchor at all in the text itself here.", verseRefs: [] }, count: 1, chapterRef: "Mark 12" }, "NO_VERSE_REF"), "no verse ref flagged");

// --- VERSE REF OFF CHAPTER (declared, and bare-number off-chapter) ---
log(has(base(GOOD, { section: { verseRefs: ["John 3:16"] } }), "VERSE_REF_OFF_CHAPTER"), "off-chapter declared ref flagged");
log(has(base(GOOD, { section: { verseRefs: ["11:17"] } }), "VERSE_REF_OFF_CHAPTER"), "bare off-chapter ref 11:17 flagged for Mark 12");
log(has(base("Jesus reframes allegiance, echoing an earlier moment at 11:17 in the temple courts."), "VERSE_REF_OFF_CHAPTER"), "inline off-chapter ref 11:17 flagged");

// A valid in-chapter RANGE must NOT be rejected.
log(!has(base(GOOD, { section: { verseRefs: ["12:15-17"] } }), "VERSE_REF_OFF_CHAPTER"), "valid range 12:15-17 accepted", JSON.stringify(codes(base(GOOD, { section: { verseRefs: ["12:15-17"] } }))));
log(!has(base(GOOD, { section: { verseRefs: ["Mark 12:28-34"] } }), "VERSE_REF_OFF_CHAPTER"), "valid ‘Mark 12:28-34’ accepted");

// --- DUPLICATES LIVE IT (uses the reader-visible application section text) ---
const LIVEIT =
  "When Jesus answers the coin trap in verses 15-17, he refuses to let loyalty to God shrink into a political slogan. Following him here means letting that same clarity shape where your ultimate allegiance sits today in your own choices.";
log(has(base(LIVEIT + " Consider where your allegiance sits.", { applicationText: LIVEIT }), "DUPLICATES_LIVE_IT"), "Live It duplication flagged");

// --- GENERIC COPY (no verse, no chapter grounding) ---
log(has(base("Following Jesus means telling others about him and helping them grow so the kingdom expands everywhere.", { section: { verseRefs: [] } }), "GENERIC_COPY"), "generic copy flagged");

// Genericity is judged by SUBSTANCE, not length: a concise card grounded in the
// chapter's own material is NOT tagged generic. (It still needs a verse ref — the
// verse requirement is independent — so the only expected code here is NO_VERSE_REF.)
const GROUNDED_NO_VERSE =
  "The widow gives her last two coins while the rich give from plenty. Following Jesus can look like that quiet, unnoticed trust — and a friend watching your own small, unshowy generosity may catch it too.";
const groundedCodes = codes(base(GROUNDED_NO_VERSE, { section: { verseRefs: [] }, chapterContext: "A poor widow puts in two copper coins, all she had to live on, while rich donors give large sums from their surplus." }));
log(!groundedCodes.includes("GENERIC_COPY") && groundedCodes.includes("NO_VERSE_REF"), "grounded-by-context is not GENERIC (only NO_VERSE_REF)", JSON.stringify(groundedCodes));

// --- SAFE COPY must NOT false-positive ---
// Narrowed obligation: "you should love your neighbour" is teaching, not outreach.
const SAFE_SHOULD =
  "Jesus says you should love your neighbor as yourself (12:31). When that lands, you naturally want a friend to know it too — though only ever as a gift, never a duty.";
log(clean(base(SAFE_SHOULD)), "‘you should love your neighbor’ NOT flagged", JSON.stringify(codes(base(SAFE_SHOULD))));

// Negated project language passes.
const SAFE_NEGATED =
  "Remember that a neighbor is not your project to fix; they are a person Jesus already loves (12:31). Following him means loving them freely.";
log(clean(base(SAFE_NEGATED)), "‘not your project’ (negated) NOT flagged", JSON.stringify(codes(base(SAFE_NEGATED))));

// A biblical command the card merely QUOTES / explains passes.
const QUOTED =
  "In verses 30-31 Jesus quotes the command, ‘You shall love the Lord your God’ and ‘love your neighbor as yourself’ (12:31). Explaining that command to a friend — only if it would help them — is one gentle way this chapter's truth can travel. No pressure, nothing owed.";
log(clean(base(QUOTED)), "quoted biblical command NOT falsely flagged", JSON.stringify(codes(base(QUOTED))));

console.log(failures === 0 ? "\nverify:discipleship ✓ all checks passed" : `\nverify:discipleship ✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
