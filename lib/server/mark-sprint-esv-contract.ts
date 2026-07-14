// Pure constants for the protected Mark-sprint ESV source path. No I/O.
import { sha256Canonical } from "./generation-manifest";

export const MARK_SPRINT_ESV_ENDPOINT =
  "https://api.esv.org/v3/passage/text/";
export const MARK_SPRINT_ESV_ASSEMBLER_REVISION =
  "mark-sprint-esv-assembler-v1";
export const MARK_SPRINT_ESV_NORMALIZER_REVISION = "nfc-lf-trim-v1";
export const MARK_SPRINT_ESV_RESPONSE_VALIDATOR_REVISION =
  "complete-mark-chapter-response-esv-2025-v3";
export const MARK_SPRINT_ESV_MIN_WORDS_PER_VERSE = 3;
export const MARK_SPRINT_ESV_MIN_AVERAGE_WORDS_PER_VERSE = 8;
export const MARK_SPRINT_ESV_MIN_MEDIAN_WORDS_PER_VERSE = 8;
export const MARK_SPRINT_ESV_SOURCE_BUNDLE_SCHEMA =
  "mark-sprint-esv-source-bundle-v2";
export const MARK_SPRINT_ESV_MAX_RESPONSE_BYTES = 250_000;
export const MARK_SPRINT_ESV_TIMEOUT_MS = 15_000;
export const MARK_SPRINT_ESV_OVERLAP_SCANNER_REVISION =
  "esv-exact-overlap-scanner-v3";
export const MARK_SPRINT_ESV_OVERLAP_NORMALIZER_REVISION =
  "nfkc-lower-default-ignorable-token-v2";
export const MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS = 4;
export const MARK_SPRINT_ESV_OVERLAP_REVIEW_TOKENS = 5;
export const MARK_SPRINT_ESV_OVERLAP_BLOCK_TOKENS = 8;
export const MARK_SPRINT_ESV_OVERLAP_LONG_FOUR_CHARS = 32;
// Issue #17 calibration (v3): short overlaps are severity "review" — safe
// diagnostics, not blockers — UNLESS combined evidence in one field shows real
// copying (two or more non-overlapping review spans totaling this many tokens).
export const MARK_SPRINT_ESV_OVERLAP_REVIEW_ESCALATION_TOKENS = 10;
// Mosaic/cross-field accumulation pieces must carry at least one CONTENT token
// (a token outside the closed-class function-word list below), and a
// cross-field component must cover at least this many content tokens. This is
// what stops "of the / and he / in the" bigrams scattered across a large JSON
// object from accumulating into a false-positive block.
export const MARK_SPRINT_ESV_OVERLAP_CROSS_FIELD_CONTENT_TOKENS = 4;
// Closed-class English function words only (articles, conjunctions,
// prepositions, pronouns, auxiliaries, negation, common discourse particles).
// Deliberately NO content vocabulary — nouns/verbs like "said", "bread",
// "boat" stay contentful so genuine copying still accumulates. Frozen and
// exported so the offline verifier pins the exact calibration.
export const MARK_SPRINT_ESV_OVERLAP_FUNCTION_WORDS: readonly string[] =
  Object.freeze([
    "a", "an", "the",
    "and", "but", "or", "nor", "for", "so", "yet",
    "of", "in", "on", "at", "to", "from", "with", "by", "about", "as",
    "into", "unto", "upon", "over", "under", "through", "after", "before",
    "against", "among", "between", "toward", "towards", "off", "out", "up",
    "down",
    "is", "are", "was", "were", "be", "been", "being", "am",
    "do", "does", "did", "done",
    "have", "has", "had",
    "will", "would", "shall", "should", "can", "could", "may", "might",
    "must",
    "he", "she", "it", "they", "them", "him", "her", "his", "hers", "its",
    "their", "theirs", "we", "us", "our", "ours", "you", "your", "yours",
    "i", "me", "my", "mine", "who", "whom", "whose", "which", "that",
    "this", "these", "those", "there", "then", "than", "here",
    "when", "where", "while", "how", "why", "what",
    "if", "because", "though", "although", "unless", "until", "once",
    "not", "no", "nor",
    "also", "very", "just", "only", "both", "each", "all", "any", "some",
    "such", "own", "same", "too",
  ]);

// Pin every documented rendering option that can affect response bytes. The
// request-specific `q` comes only from the allowlisted Mark layout. Headings
// are editorial and excluded. Footnotes remain available but must be framed as
// translator/editorial notes, not Scripture. Copyright flags are off because
// this is private transient analysis input, not a public Scripture display;
// public reader attribution remains a separate required correction.
export const MARK_SPRINT_ESV_REQUEST_OPTIONS = Object.freeze({
  "include-passage-references": false,
  "include-verse-numbers": true,
  "include-first-verse-numbers": true,
  "include-footnotes": true,
  "include-footnote-body": true,
  "include-headings": false,
  "include-short-copyright": false,
  "include-copyright": false,
  "include-passage-horizontal-lines": false,
  "include-heading-horizontal-lines": false,
  "horizontal-line-length": 55,
  "include-selahs": true,
  "indent-using": "space",
  "indent-paragraphs": 2,
  "indent-poetry": true,
  "indent-poetry-lines": 4,
  "indent-declares": 40,
  "indent-psalm-doxology": 30,
  "line-length": 0,
} as const);

export const MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST = sha256Canonical(
  MARK_SPRINT_ESV_REQUEST_OPTIONS,
);

const MARK_CHAPTER_VERSE_COUNTS: Readonly<Record<number, number>> = Object.freeze({
  7: 37,
  8: 38,
  9: 50,
  10: 52,
  11: 33,
  12: 44,
});

// The ESV follows the critical-text numbering and omits these disputed verse
// numbers from the body while preserving the surrounding canonical range.
// Requiring a naïve 1..last marker sequence would reject complete official ESV
// responses for three chapters in the approved windows.
const ESV_2025_OMITTED_MARK_VERSES: Readonly<Record<number, readonly number[]>> =
  Object.freeze({
    7: Object.freeze([16]),
    9: Object.freeze([44, 46]),
    11: Object.freeze([26]),
  });

export function expectedMarkChapterVerseIdPair(
  reference: string,
): readonly [number, number] | null {
  const match = /^Mark (\d+)$/.exec(reference);
  if (!match) return null;
  const chapter = Number(match[1]);
  const lastVerse = MARK_CHAPTER_VERSE_COUNTS[chapter];
  if (!lastVerse) return null;
  const prefix = 41_000_000 + chapter * 1_000;
  return Object.freeze([prefix + 1, prefix + lastVerse] as const);
}

export function expectedMarkChapterVerseMarkers(
  reference: string,
): readonly number[] | null {
  const pair = expectedMarkChapterVerseIdPair(reference);
  if (!pair) return null;
  const lastVerse = pair[1] % 1_000;
  const chapter = Math.floor((pair[0] - 41_000_000) / 1_000);
  const omitted = new Set(ESV_2025_OMITTED_MARK_VERSES[chapter] ?? []);
  return Object.freeze(
    Array.from({ length: lastVerse }, (_, index) => index + 1).filter(
      (verse) => !omitted.has(verse),
    ),
  );
}

export function markSprintEsvRequestDescriptor(reference: string) {
  return Object.freeze({
    schemaVersion: "mark-sprint-esv-request-v1",
    assemblerRevision: MARK_SPRINT_ESV_ASSEMBLER_REVISION,
    endpoint: MARK_SPRINT_ESV_ENDPOINT,
    reference,
    options: MARK_SPRINT_ESV_REQUEST_OPTIONS,
  });
}
