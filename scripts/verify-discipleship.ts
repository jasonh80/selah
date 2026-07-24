// verify:discipleship — IQ-019 gate checks (Codex ruling 2026-07-24, plus both
// exact-head correction rounds). Adversarial fixtures for the prohibited
// contact/teach/share/recruit/report law (incl. names, polite/go-tell/send/talk
// shapes), the permission-modal exemption across coordinated verbs, accurate
// verse parsing (book-aware inline, impossible ranges), substance-based
// genericity (a token citation is not grounding), and safe-copy exceptions.

import { checkDiscipleship, type DiscipleshipInput } from "../lib/ai/quality/discipleship-gate";

let failures = 0;
const log = (ok: boolean, name: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// Production always supplies chapter context (summary + what-happens + big idea),
// so the fixtures do too — that is the path where genericity is judged by
// substance rather than a bare citation.
// Representative of the production chapter context (summary + what-happens + big
// idea) so genericity is judged against the chapter's real vocabulary.
const MARK12_CONTEXT =
  "Jesus faces trap after trap in the temple courts — the wicked tenants who kill the beloved son, the tax coin bearing Caesar's likeness, the Sadducees denying the resurrection, and the scribe who asks the greatest commandment. Jesus answers: love the Lord your God with all your heart, soul, mind, and strength, and love your neighbor as yourself. He warns against the scribes and praises a poor widow who gives two copper coins, all she had to live on. The chapter turns on allegiance, loyalty, and where the reader's ultimate trust belongs.";

const base = (fullContent: string, over: Partial<DiscipleshipInput> = {}): DiscipleshipInput => ({
  section: { title: "Disciple It", cardSummary: "A gentle invitation.", fullContent, verseRefs: ["12:17"], ...(over.section ?? {}) },
  count: over.count ?? 1,
  applicationText: over.applicationText,
  chapterRef: over.chapterRef ?? "Mark 12",
  chapterContext: over.chapterContext ?? MARK12_CONTEXT,
});

const codes = (input: DiscipleshipInput) => checkDiscipleship(input).map((x) => x.code);
const has = (input: DiscipleshipInput, code: string) => codes(input).includes(code);
const clean = (input: DiscipleshipInput) => checkDiscipleship(input).length === 0;

// --- POSITIVE: a compliant invitation (inline chapter verse) must pass clean ---
const GOOD =
  "When Jesus answers the coin trap in 12:15-17, he refuses to let loyalty to God shrink into a political slogan. Following him here means letting that same clarity shape where your ultimate allegiance sits. If it would help, you might invite a friend to notice how Jesus reframes the question — and let that be all, with no pressure and no follow-up owed.";
log(clean(base(GOOD)), "compliant invitation passes clean", JSON.stringify(codes(base(GOOD))));

// A SHORT, verse-grounded invitation must also pass — no minimum-count padding.
const SHORT_GOOD = "Jesus silences the trap in 12:17. If it helps, you might let a friend hear how he does it.";
log(clean(base(SHORT_GOOD)), "short verse-grounded invitation passes (no length minimum)", JSON.stringify(codes(base(SHORT_GOOD))));

// The safe OPTIONAL invitation across coordinated verbs must pass — the "might /
// if it would help" modal governs both "contact" and "share".
const SAFE_OPTIONAL =
  "If it would help, you might contact a friend and share how Jesus answers the coin trap in 12:15-17 with them — only if it feels natural, with nothing owed.";
log(clean(base(SAFE_OPTIONAL)), "optional invitation across coordinated verbs passes", JSON.stringify(codes(base(SAFE_OPTIONAL))));

// --- MISSING (only when presence is enforced) ---
log(has({ section: null, count: 0, chapterRef: "Mark 12" }, "MISSING"), "missing section flagged");
log(checkDiscipleship({ section: null, count: 0, chapterRef: "Mark 12", enforcePresence: false }).length === 0, "missing section NOT flagged for legacy (enforcePresence:false)");

// --- DUPLICATE SECTION ---
log(has(base(GOOD, { count: 2 }), "DUPLICATE_SECTION"), "duplicate discipleship section flagged");

// --- WRONG SECTION SHAPE (non-core / wrong id) ---
log(
  checkDiscipleship({ section: { id: "disciple", type: "discipleship", isCore: true, fullContent: GOOD }, count: 1, chapterRef: "Mark 12", chapterContext: MARK12_CONTEXT }).some((x) => x.code === "WRONG_SECTION_SHAPE"),
  "wrong id flagged as WRONG_SECTION_SHAPE",
);
log(
  checkDiscipleship({ section: { id: "discipleship", type: "discipleship", isCore: false, fullContent: GOOD }, count: 1, chapterRef: "Mark 12", chapterContext: MARK12_CONTEXT }).some((x) => x.code === "WRONG_SECTION_SHAPE"),
  "non-core flagged as WRONG_SECTION_SHAPE",
);

// --- ASSIGNMENT LANGUAGE: the exact contact/teach/share/recruit/report law ---
log(has(base("Ask three people this week to read Mark 12 with you and report back on 12:17."), "ASSIGNMENT_LANGUAGE"), "‘ask three people’ flagged");
log(has(base("This week you must share this chapter with someone who needs 12:17."), "ASSIGNMENT_LANGUAGE"), "‘you must share’ flagged");
log(has(base("Your assignment: disciple two people using 12:28-34."), "ASSIGNMENT_LANGUAGE"), "‘your assignment’ flagged");
log(has(base("Share Mark 12 with a friend so they can read 12:17 too."), "ASSIGNMENT_LANGUAGE"), "‘Share Mark 12 with a friend’ flagged");
log(has(base("Teach someone this chapter and report back on 12:30."), "ASSIGNMENT_LANGUAGE"), "‘Teach someone … report back’ flagged");
log(has(base("Contact a friend. Teach them the gospel and report back about 12:17."), "ASSIGNMENT_LANGUAGE"), "‘Contact … report back’ flagged");
log(has(base("Reach three people about 12:30 before the weekend is over."), "ASSIGNMENT_LANGUAGE"), "‘Reach three people’ flagged");
log(has(base("Invite a friend to read Mark 12 aloud with you, then quiz them on 12:17."), "ASSIGNMENT_LANGUAGE"), "bare ‘Invite a friend’ imperative flagged");
// Codex round-2 shapes: polite, named, send/talk/go-tell.
log(has(base("Please contact a friend and point them to 12:17."), "ASSIGNMENT_LANGUAGE"), "polite ‘Please contact a friend’ flagged", JSON.stringify(codes(base("Please contact a friend and point them to 12:17."))));
log(has(base("Teach Jordan the greatest command from 12:30."), "ASSIGNMENT_LANGUAGE"), "named ‘Teach Jordan’ flagged", JSON.stringify(codes(base("Teach Jordan the greatest command from 12:30."))));
log(has(base("Send this chapter to a friend so they can sit with 12:17."), "ASSIGNMENT_LANGUAGE"), "‘Send this chapter to a friend’ flagged");
log(has(base("Talk with a friend about how Jesus answers in 12:17."), "ASSIGNMENT_LANGUAGE"), "‘Talk with a friend’ flagged");
log(has(base("Go tell a friend what Jesus says in 12:17."), "ASSIGNMENT_LANGUAGE"), "‘Go tell a friend’ flagged");

// --- QUOTA / DEADLINE (incl. SOFTENED word-quota, which the command exemption
// must NOT swallow) ---
log(has(base("Reach 5 souls this week; by Sunday you should have three conversations about 12:30."), "QUOTA_OR_DEADLINE"), "quota/deadline flagged");
log(has(base("You might invite three friends this week to read 12:17 with you."), "QUOTA_OR_DEADLINE"), "softened word-quota still flagged", JSON.stringify(codes(base("You might invite three friends this week to read 12:17 with you."))));

// --- GUILT / SCORE ---
log(has(base("If you don't, you are failing Jesus. Keep a streak of how many people you tell about 12:41-44."), "GUILT_OR_SCORE"), "guilt/score flagged");

// --- PERSON AS PROJECT (a negated instance must NOT hide a later real one) ---
log(has(base("Pick your target, work on him until they convert, and close the deal on the gospel by 12:44."), "PERSON_AS_PROJECT"), "person-as-project flagged");
log(has(base("A neighbor is not your project; still, make them your project until they convert (12:31)."), "PERSON_AS_PROJECT"), "negation does not hide a later real project match", JSON.stringify(codes(base("A neighbor is not your project; still, make them your project until they convert (12:31)."))));

// --- NO VERSE REF ---
log(has({ section: { fullContent: "A vague reflection about following and helping others, with no anchor at all in the text itself here.", verseRefs: [] }, count: 1, chapterRef: "Mark 12" }, "NO_VERSE_REF"), "no verse ref flagged");

// --- VERSE REF OFF CHAPTER (declared, bare number, inline book, impossible) ---
log(has(base(GOOD, { section: { verseRefs: ["John 3:16"] } }), "VERSE_REF_OFF_CHAPTER"), "off-chapter declared ref flagged");
log(has(base(GOOD, { section: { verseRefs: ["11:17"] } }), "VERSE_REF_OFF_CHAPTER"), "bare off-chapter ref 11:17 flagged for Mark 12");
log(has(base("Jesus reframes allegiance, echoing an earlier moment at 11:17 in the temple courts."), "VERSE_REF_OFF_CHAPTER"), "inline off-chapter ref 11:17 flagged");
log(has(base("His words here rhyme with a moment recorded in John 12:17 elsewhere.", { section: { verseRefs: [] } }), "VERSE_REF_OFF_CHAPTER"), "inline ‘John 12:17’ not mistaken for Mark 12");
for (const bad of ["12:34-28", "12:0", "12:999"]) {
  log(has(base(GOOD, { section: { verseRefs: [bad] } }), "VERSE_REF_OFF_CHAPTER"), `impossible ref ${bad} rejected`);
}
// A bare in-chapter word like "in 12:17" is NOT read as a book.
log(!has(base("Notice how Jesus answers in 12:17 without flinching."), "VERSE_REF_OFF_CHAPTER"), "‘in 12:17’ not treated as a book");

// A valid in-chapter RANGE must NOT be rejected.
log(!has(base(GOOD, { section: { verseRefs: ["12:15-17"] } }), "VERSE_REF_OFF_CHAPTER"), "valid range 12:15-17 accepted", JSON.stringify(codes(base(GOOD, { section: { verseRefs: ["12:15-17"] } }))));
log(!has(base(GOOD, { section: { verseRefs: ["Mark 12:28-34"] } }), "VERSE_REF_OFF_CHAPTER"), "valid ‘Mark 12:28-34’ accepted");

// --- DUPLICATES LIVE IT (uses the reader-visible application section text) ---
const LIVEIT =
  "When Jesus answers the coin trap in 12:15-17, he refuses to let loyalty to God shrink into a political slogan. Following him here means letting that same clarity shape where your ultimate allegiance sits today in your own choices.";
log(has(base(LIVEIT + " Consider where your allegiance sits.", { applicationText: LIVEIT }), "DUPLICATES_LIVE_IT"), "Live It duplication flagged");

// --- GENERIC COPY: a bare verse citation must NOT rescue reusable-anywhere prose ---
log(
  has(base("Following Jesus means helping other people follow Jesus too.", { section: { verseRefs: ["12:17"] } }), "GENERIC_COPY"),
  "token-citation generic copy still flagged GENERIC",
  JSON.stringify(codes(base("Following Jesus means helping other people follow Jesus too.", { section: { verseRefs: ["12:17"] } }))),
);

// Genericity is by SUBSTANCE: a concise card grounded in the chapter's own
// material is NOT generic (it still needs a verse ref → only NO_VERSE_REF here).
// A card that never anchors a chapter verse is NOT grounded, even if it name-
// drops chapter nouns — grounding needs the verse-in-a-sentence anchor (Codex).
const NO_ANCHOR =
  "The widow gives her last two coins while the rich give from plenty. Following Jesus can look like that quiet, unnoticed trust — and a friend watching your own small, unshowy generosity may catch it too.";
const noAnchorCodes = codes(base(NO_ANCHOR, { section: { verseRefs: [] }, chapterContext: "A poor widow puts in two copper coins, all she had to live on, while rich donors give large sums from their surplus." }));
log(noAnchorCodes.includes("GENERIC_COPY") && noAnchorCodes.includes("NO_VERSE_REF"), "no verse anchor at all → NOT grounded (GENERIC + NO_VERSE_REF)", JSON.stringify(noAnchorCodes));

// Codex's exact two-incidental-word probe: chapter nouns name-dropped in a decoy
// sentence, generic invitation, with only a DECLARED verse → still GENERIC.
const DECOY =
  "Coins and widow appear here. Following Jesus means helping other people follow Jesus too.";
log(has(base(DECOY, { section: { verseRefs: ["12:17"] } }), "GENERIC_COPY"), "decoy chapter-noun sentence + declared verse still GENERIC", JSON.stringify(codes(base(DECOY, { section: { verseRefs: ["12:17"] } }))));
// DETERMINISTIC BOUNDARY (documented honestly): a sentence that genuinely cites
// a chapter verse AND names this chapter's content ("…a widow… in 12:44") makes
// the card chapter-SPECIFIC, so the reusability gate does NOT fire — even if the
// invitation itself is weak. Judging invitation strength is the senior semantic
// reviewer's call, not this deterministic reusability check.
const CHAPTER_SPECIFIC_WEAK =
  "Following Jesus means helping other people follow him too. The widow's two coins in 12:44 show what wholehearted trust looks like.";
log(!has(base(CHAPTER_SPECIFIC_WEAK, { section: { verseRefs: [] } }), "GENERIC_COPY"), "a sentence anchoring a verse to chapter content is chapter-specific (not GENERIC)", JSON.stringify(codes(base(CHAPTER_SPECIFIC_WEAK, { section: { verseRefs: [] } }))));

// --- SAFE COPY must NOT false-positive ---
const SAFE_SHOULD =
  "Jesus says you should love your neighbor as yourself (12:31). When that lands, you naturally want a friend to know it too — though only ever as a gift, never a duty.";
log(clean(base(SAFE_SHOULD)), "‘you should love your neighbor’ NOT flagged", JSON.stringify(codes(base(SAFE_SHOULD))));

const SAFE_NEGATED =
  "Remember that a neighbor is not your project to fix; they are a person Jesus already loves (12:31). Following him means loving them freely.";
log(clean(base(SAFE_NEGATED)), "‘not your project’ (negated) NOT flagged", JSON.stringify(codes(base(SAFE_NEGATED))));

const QUOTED =
  "In 12:30-31 Jesus quotes the command, ‘You shall love the Lord your God’ and ‘love your neighbor as yourself’. Explaining that command to a friend — only if it would help them — is one gentle way this chapter's truth can travel. No pressure, nothing owed.";
log(clean(base(QUOTED)), "quoted biblical command NOT falsely flagged", JSON.stringify(codes(base(QUOTED))));

// ===== Codex round-3 adversarial probes =====

// 1. A permitted earlier phrase must not hide a LATER bare command.
log(has(base("If it would help, you might reflect quietly. Then contact three friends about 12:17."), "ASSIGNMENT_LANGUAGE"), "later bare command not hidden by an earlier permitted phrase", JSON.stringify(codes(base("If it would help, you might reflect quietly. Then contact three friends about 12:17."))));
// A loose earlier "no pressure" must not exempt a later command.
log(has(base("There is no pressure, but you must contact a friend about 12:17."), "ASSIGNMENT_LANGUAGE"), "loose ‘no pressure’ does not exempt a later obligation");
// "him", "her", "your sister" objects.
log(has(base("Tell him about how Jesus answers in 12:17."), "ASSIGNMENT_LANGUAGE"), "‘Tell him’ (pronoun object) flagged", JSON.stringify(codes(base("Tell him about how Jesus answers in 12:17."))));
log(has(base("Teach your sister the lesson of 12:17."), "ASSIGNMENT_LANGUAGE"), "‘Teach your sister’ flagged");

// The safe optional invitation must STILL pass (governing modal close by).
log(clean(base("If it would help, you might contact a friend and walk through the coin trap in 12:15-17 with them — only if it feels natural.")), "governed optional invitation still passes", JSON.stringify(codes(base("If it would help, you might contact a friend and walk through the coin trap in 12:15-17 with them."))));

// 2. Chapter-accurate verse bound: Mark 12 ends at 44.
log(has(base(GOOD, { section: { verseRefs: ["12:99"] } }), "VERSE_REF_OFF_CHAPTER"), "12:99 rejected (beyond Mark 12's 44 verses)");
log(!has(base(GOOD, { section: { verseRefs: ["12:44"] } }), "VERSE_REF_OFF_CHAPTER"), "12:44 accepted (Mark 12's last verse)");
// Numbered book must not be read as no-book.
log(has(base("His point echoes what Paul writes in 1 Corinthians 12:3 elsewhere.", { section: { verseRefs: [] } }), "VERSE_REF_OFF_CHAPTER"), "inline ‘1 Corinthians 12:3’ not mistaken for Mark 12");

// 3. One incidental shared word must not defeat genericity.
const ONE_WORD_SHARE = "Following Jesus means pursuing the greatest good you can imagine in ordinary living.";
log(has(base(ONE_WORD_SHARE, { section: { verseRefs: [] } }), "GENERIC_COPY"), "single incidental shared word still GENERIC", JSON.stringify(codes(base(ONE_WORD_SHARE, { section: { verseRefs: [] } }))));

// 4. Person-as-project bypasses closed.
log(has(base("Do not hesitate to make them your project until they come around (12:31)."), "PERSON_AS_PROJECT"), "‘do not hesitate to make them your project’ flagged", JSON.stringify(codes(base("Do not hesitate to make them your project until they come around (12:31)."))));
log(has(base("Treat your friend as a project to fix, gently, over time (12:31)."), "PERSON_AS_PROJECT"), "‘treat your friend as a project to fix’ flagged", JSON.stringify(codes(base("Treat your friend as a project to fix, gently, over time (12:31)."))));

// ===== Codex round-4 adversarial probes =====

// 1. A modal in a PRIOR sentence must not license a later command.
log(has(base("You might pray. Contact a friend about 12:17."), "ASSIGNMENT_LANGUAGE"), "permission does not leak across a sentence boundary", JSON.stringify(codes(base("You might pray. Contact a friend about 12:17."))));

// 2. Numbered abbreviation + malformed inline refs are rejected, even when a
// valid declared ref is present.
log(has(base("His point echoes 1 Cor 12:3 elsewhere.", { section: { verseRefs: ["12:17"] } }), "VERSE_REF_OFF_CHAPTER"), "‘1 Cor 12:3’ recognized as off-chapter");
for (const bad of ["12:0", "12:34-28", "12:999"]) {
  log(has(base(`A note about ${bad} appears here, though 12:17 is the real anchor.`, { section: { verseRefs: ["12:17"] } }), "VERSE_REF_OFF_CHAPTER"), `malformed inline ${bad} rejected (not skipped)`, JSON.stringify(codes(base(`A note about ${bad} appears here, though 12:17 is the real anchor.`, { section: { verseRefs: ["12:17"] } }))));
}

// 3. An inline citation on reusable prose, and two incidental words, cannot
// alone establish chapter substance.
log(has(base("Following Jesus means loving him with your whole heart (12:17).", { section: { verseRefs: [] } }), "GENERIC_COPY"), "reusable prose + inline (12:17) still GENERIC", JSON.stringify(codes(base("Following Jesus means loving him with your whole heart (12:17).", { section: { verseRefs: [] } }))));

// 4. Unrelated nearby negation (different clause) must not hide project language.
log(has(base("Do not shame them; make them your project until they come around (12:31)."), "PERSON_AS_PROJECT"), "negation in a different clause does not hide project language", JSON.stringify(codes(base("Do not shame them; make them your project until they come around (12:31)."))));
log(has(base("Never pressure her; treat her as a project to win over time (12:31)."), "PERSON_AS_PROJECT"), "‘Never pressure her; treat her as a project’ flagged");

console.log(failures === 0 ? "\nverify:discipleship ✓ all checks passed" : `\nverify:discipleship ✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
