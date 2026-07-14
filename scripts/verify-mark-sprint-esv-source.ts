import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseChapterWorkupJson } from "../lib/ai/schemas/chapter-workup-schema";
import {
  assertMarkSprintEsvBundleIntegrity,
  assertMarkSprintEsvOverlapReportIntegrity,
  buildTransientMarkSprintPrompt,
  evaluateMarkSprintEsvOverlap,
  loadMarkSprintEsvSourceBundle,
  MarkSprintEsvSourceError,
  type MarkSprintEsvSourceBundle,
} from "../lib/server/mark-sprint-esv-source";
import {
  MARK_SPRINT_ESV_ENDPOINT,
  MARK_SPRINT_ESV_REQUEST_OPTIONS,
  MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST,
  expectedMarkChapterVerseIdPair,
  expectedMarkChapterVerseMarkers,
} from "../lib/server/mark-sprint-esv-contract";
import { sha256Canonical } from "../lib/server/generation-manifest";
import { MARK_SPRINT_SLUGS } from "../lib/server/mark-sprint-manifest-policy";

const SYNTHETIC_KEY = "synthetic-secret-never-log";
const SYNTHETIC_PRIVATE_PHRASE =
  "one two three four small gap five six seven eight brief gap nine ten eleven twelve";
const MANIFEST_DIGEST = "a".repeat(64);

function chapterFromReference(reference: string): number {
  const match = /^Mark (\d+)$/.exec(reference);
  assert.ok(match, `unexpected synthetic reference ${reference}`);
  return Number(match[1]);
}

function syntheticChapterText(reference: string, variant = "base"): string {
  const markers = expectedMarkChapterVerseMarkers(reference);
  assert.ok(markers);
  const chapter = chapterFromReference(reference);
  return markers
    .map((verse) => {
      if (verse === 1) {
        return `[1] ${SYNTHETIC_PRIVATE_PHRASE}.`;
      }
      return `[${verse}] cedar amber lantern mercy river witness chapter mark synthetic validation wording remains private chapter ${chapter} variant ${variant}.`;
    })
    .join("\n\n");
}

function syntheticPayload(
  reference: string,
  options: {
    variant?: string;
    textOverride?: (reference: string) => string;
    omitVerse?: number;
    canonical?: string;
    partial?: boolean;
    multiplePassages?: boolean;
    metadataExtra?: string;
    markerOnly?: boolean;
    lopsidedBody?: boolean;
    thinEveryVerse?: boolean;
    hybridSparseBody?: boolean;
  } = {},
) {
  const pair = expectedMarkChapterVerseIdPair(reference);
  assert.ok(pair);
  const markers = expectedMarkChapterVerseMarkers(reference)!;
  const completeText = options.markerOnly
    ? markers
        .map((verse) => `[${verse}]`)
        .join(" ")
        .padEnd(200, " ")
    : options.lopsidedBody
      ? markers
          .map((verse, index) =>
            index === 0
              ? `[${verse}] word ${"padding ".repeat(markers.length * 8)}`
              : `[${verse}] word`,
          )
          .join("\n\n")
    : options.thinEveryVerse
      ? markers.map((verse) => `[${verse}] one two three`).join("\n\n")
    : options.hybridSparseBody
      ? markers
          .map((verse, index) =>
            index === 0
              ? `[${verse}] one two three ${"padding ".repeat(markers.length * 8)}`
              : `[${verse}] one two three`,
          )
          .join("\n\n")
    : options.textOverride
      ? options.textOverride(reference)
      : syntheticChapterText(reference, options.variant);
  const text = completeText.replace(
    options.omitVerse ? new RegExp(`\\[${options.omitVerse}\\][^\\[]*`, "u") : /$^/u,
    "",
  );
  const parsed = options.partial ? [pair[0], pair[0]] : [...pair];
  const canonical = options.canonical ?? reference;
  return {
    query: reference,
    canonical,
    parsed: [parsed],
    passage_meta: [
      {
        canonical,
        chapter_start: [...pair],
        chapter_end: [...pair],
        synthetic_metadata: options.metadataExtra ?? "base",
      },
    ],
    passages: options.multiplePassages ? [text, "extra"] : [text],
  };
}

type FetchCall = { url: URL; init?: RequestInit };

function syntheticFetcher(options: {
  variant?: string;
  status?: number;
  contentType?: string;
  payload?: (reference: string) => unknown;
  body?: string;
  declaredLength?: number;
  redirected?: boolean;
  streamFailure?: boolean;
  stallUntilAbort?: boolean;
} = {}) {
  const calls: FetchCall[] = [];
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Token ${SYNTHETIC_KEY}`);
    assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    if (init?.signal?.aborted) throw new Error("synthetic abort");

    const url = new URL(String(input));
    calls.push({ url, init });
    assert.equal(
      `${url.origin}${url.pathname}`.replace(/\/$/u, ""),
      MARK_SPRINT_ESV_ENDPOINT.replace(/\/$/u, ""),
    );
    for (const [key, value] of Object.entries(MARK_SPRINT_ESV_REQUEST_OPTIONS)) {
      assert.equal(url.searchParams.get(key), String(value), `request option ${key}`);
    }
    const reference = url.searchParams.get("q");
    assert.ok(reference);
    const body =
      options.body ??
      JSON.stringify(
        options.payload?.(reference) ??
          syntheticPayload(reference, { variant: options.variant }),
      );
    const headers = new Headers({
      "content-type": options.contentType ?? "application/json; charset=utf-8",
    });
    if (options.declaredLength !== undefined) {
      headers.set("content-length", String(options.declaredLength));
    }
    const responseBody = options.stallUntilAbort
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            const fail = () => controller.error(new Error("synthetic body abort"));
            if (init?.signal?.aborted) fail();
            else init?.signal?.addEventListener("abort", fail, { once: true });
          },
        })
      : options.streamFailure
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error("synthetic stream failure"));
          },
        })
      : body;
    const response = new Response(responseBody, {
      status: options.status ?? 200,
      headers,
    });
    if (options.redirected) {
      Object.defineProperty(response, "redirected", { value: true });
    }
    return response;
  };
  return { calls, fetchImpl };
}

async function expectSourceError(
  label: string,
  code: MarkSprintEsvSourceError["code"],
  task: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(
    task,
    (error: unknown) => {
      assert.ok(error instanceof MarkSprintEsvSourceError, label);
      assert.equal(error.code, code, label);
      const serialized = String(error);
      assert.ok(!serialized.includes(SYNTHETIC_KEY), `${label} leaked API key`);
      assert.ok(
        !serialized.includes(SYNTHETIC_PRIVATE_PHRASE),
        `${label} leaked source text`,
      );
      return true;
    },
  );
}

async function main(): Promise<void> {
assert.ok(!expectedMarkChapterVerseMarkers("Mark 7")?.includes(16));
assert.ok(!expectedMarkChapterVerseMarkers("Mark 9")?.includes(44));
assert.ok(!expectedMarkChapterVerseMarkers("Mark 9")?.includes(46));
assert.ok(!expectedMarkChapterVerseMarkers("Mark 11")?.includes(26));
assert.ok(expectedMarkChapterVerseMarkers("Mark 8")?.includes(38));
const bundles = new Map<string, MarkSprintEsvSourceBundle>();
for (const slug of MARK_SPRINT_SLUGS) {
  const synthetic = syntheticFetcher();
  const bundle = await loadMarkSprintEsvSourceBundle({
    slug,
    apiKey: SYNTHETIC_KEY,
    fetchImpl: synthetic.fetchImpl,
  });
  bundles.set(slug, bundle);
  assert.equal(synthetic.calls.length, 3);
  assert.deepEqual(
    synthetic.calls.map((call) => call.url.searchParams.get("q")),
    bundle.passages.map((passage) => passage.requestedReference),
  );
  assert.equal(bundle.requestOptionsDigest, MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST);
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.source));
  assert.ok(Object.isFrozen(bundle.passages));
  assertMarkSprintEsvBundleIntegrity(bundle);

  const serialized = JSON.stringify(bundle);
  assert.ok(!serialized.includes(SYNTHETIC_PRIVATE_PHRASE));
  assert.ok(!serialized.includes(SYNTHETIC_KEY));
  assert.ok(!serialized.includes("cedar amber lantern"));
  assert.doesNotMatch(serialized, /"text"\s*:/u);

  const chapter = Number(slug.split("-")[1]);
  const prompt = buildTransientMarkSprintPrompt(bundle, {
    slug,
    book: "Mark",
    chapter,
    bibleVersion: "ESV",
    globalRules: ["synthetic rule"],
    chapterNotes: ["synthetic note"],
  });
  assert.match(prompt, /SERVER-SUPPLIED GENERATION SOURCE/u);
  assert.match(prompt, /translator\/editorial notes—not\s+verse text/u);
  assert.match(prompt, /one two three four small gap/u);
}

const mark8Bundle = bundles.get("mark-8")!;
assert.throws(
  () => assertMarkSprintEsvBundleIntegrity(structuredClone(mark8Bundle)),
  /bundle identity is invalid/u,
  "a serialized/forged bundle must not recover private source capability",
);
assert.throws(
  () =>
    buildTransientMarkSprintPrompt(mark8Bundle, {
      slug: "mark-8",
      book: "Mark",
      chapter: 9,
    }),
  /Prompt subject does not match/u,
);
assert.throws(
  () =>
    buildTransientMarkSprintPrompt(mark8Bundle, {
      slug: "mark-8",
      book: " Mark ",
      chapter: 8,
    }),
  /Prompt subject does not match/u,
);

const changedSource = syntheticFetcher({ variant: "changed" });
const changedBundle = await loadMarkSprintEsvSourceBundle({
  slug: "mark-8",
  apiKey: SYNTHETIC_KEY,
  fetchImpl: changedSource.fetchImpl,
});
assert.notEqual(changedBundle.bundleDigest, mark8Bundle.bundleDigest);
assert.notEqual(
  changedBundle.passages[0].textDigest,
  mark8Bundle.passages[0].textDigest,
);

const metadataChanged = await loadMarkSprintEsvSourceBundle({
  slug: "mark-8",
  apiKey: SYNTHETIC_KEY,
  fetchImpl: syntheticFetcher({
    payload: (reference) =>
      syntheticPayload(reference, { metadataExtra: "changed-metadata" }),
  }).fetchImpl,
});
assert.equal(
  metadataChanged.passages[0].textDigest,
  mark8Bundle.passages[0].textDigest,
);
assert.notEqual(
  metadataChanged.passages[0].responseMetadataDigest,
  mark8Bundle.passages[0].responseMetadataDigest,
);
assert.notEqual(metadataChanged.bundleDigest, mark8Bundle.bundleDigest);

await expectSourceError("slug allowlist", "SLUG_NOT_ALLOWED", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-7",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher().fetchImpl,
  }),
);
await expectSourceError("missing API key", "API_KEY_MISSING", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: "",
    fetchImpl: syntheticFetcher().fetchImpl,
  }),
);
await expectSourceError("HTTP failure", "HTTP_ERROR", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ status: 503 }).fetchImpl,
  }),
);
await expectSourceError("wrong content type", "CONTENT_TYPE_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ contentType: "text/html" }).fetchImpl,
  }),
);
await expectSourceError("declared oversize", "RESPONSE_TOO_LARGE", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ declaredLength: 999_999 }).fetchImpl,
  }),
);
await expectSourceError("streamed oversize", "RESPONSE_TOO_LARGE", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ body: "x".repeat(260_000) }).fetchImpl,
  }),
);
await expectSourceError("stream read failure", "RESPONSE_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ streamFailure: true }).fetchImpl,
  }),
);
await expectSourceError("caller abort after response headers", "RESPONSE_INVALID", () => {
  const controller = new AbortController();
  const pending = loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    signal: controller.signal,
    fetchImpl: syntheticFetcher({ stallUntilAbort: true }).fetchImpl,
  });
  queueMicrotask(() => controller.abort());
  return pending;
});
await expectSourceError("invalid JSON", "RESPONSE_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ body: "{" }).fetchImpl,
  }),
);
await expectSourceError("wrong canonical", "REFERENCE_MISMATCH", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { canonical: "Mark 1" }),
    }).fetchImpl,
  }),
);
await expectSourceError("partial metadata range", "INCOMPLETE_CHAPTER", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { partial: true }),
    }).fetchImpl,
  }),
);
await expectSourceError("interior verse missing", "SOURCE_TEXT_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { omitVerse: 20 }),
    }).fetchImpl,
  }),
);
await expectSourceError("marker-only chapter", "SOURCE_TEXT_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { markerOnly: true }),
    }).fetchImpl,
  }),
);
await expectSourceError("lopsided verse bodies", "SOURCE_TEXT_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { lopsidedBody: true }),
    }).fetchImpl,
  }),
);
await expectSourceError("thin whole chapter", "SOURCE_TEXT_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { thinEveryVerse: true }),
    }).fetchImpl,
  }),
);
await expectSourceError("hybrid sparse chapter", "SOURCE_TEXT_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { hybridSparseBody: true }),
    }).fetchImpl,
  }),
);
await expectSourceError("multiple passages", "RESPONSE_INVALID", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({
      payload: (reference) => syntheticPayload(reference, { multiplePassages: true }),
    }).fetchImpl,
  }),
);
await expectSourceError("redirected response", "HTTP_ERROR", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher({ redirected: true }).fetchImpl,
  }),
);
await expectSourceError("pre-aborted request", "FETCH_FAILED", () =>
  loadMarkSprintEsvSourceBundle({
    slug: "mark-8",
    apiKey: SYNTHETIC_KEY,
    signal: AbortSignal.abort(),
    fetchImpl: syntheticFetcher().fetchImpl,
  }),
);

function scan(rawDraftJson: string) {
  return evaluateMarkSprintEsvOverlap({
    bundle: mark8Bundle,
    rawDraftJson,
    manifestDigest: MANIFEST_DIGEST,
  });
}

const cleanDraft = JSON.stringify({
  summary: "A completely original synthetic explanation about patient learning.",
  generatedImages: [{ prompt: "People listening beside a hillside." }],
});
const cleanReport = scan(cleanDraft);
assert.equal(cleanReport.verdict, "pass");
assert.equal(cleanReport.findingCount, 0);
assertMarkSprintEsvOverlapReportIntegrity(cleanReport, {
  bundle: mark8Bundle,
  manifestDigest: MANIFEST_DIGEST,
  rawDraftJson: cleanDraft,
});

const exactEightDraft = JSON.stringify({
  generatedImages: [
    {
      prompt:
        "ONE, two; three—four! small gap five six seven eight appears in an image prompt.",
    },
  ],
});
const exactEight = scan(exactEightDraft);
assert.equal(exactEight.verdict, "block");
assert.ok(exactEight.findings.some((finding) => finding.code === "EXACT_8_PLUS"));
assert.ok(exactEight.findings.every((finding) => finding.outputPath.startsWith("/")));
assert.ok(exactEight.findings.every((finding) => !finding.outputPath.includes("prompt")));

for (const invisible of ["\u200b", "\u034f", "\ufe0f"]) {
  const obscured = "one two three four small gap five six seven eight"
    .split(" ")
    .map((word) => word.split("").join(invisible))
    .join(" ");
  assert.equal(scan(JSON.stringify({ summary: obscured })).verdict, "block");
}

const splitAcrossFields = scan(
  JSON.stringify({
    a: "one two three",
    b: "four small gap",
    c: "five six seven",
    d: "eight",
  }),
);
assert.equal(splitAcrossFields.verdict, "block");
assert.ok(
  splitAcrossFields.findings.some(
    (finding) => finding.code === "CROSS_FIELD_8_PLUS",
  ),
);

const promptOrderSplit = scan(
  JSON.stringify({
    summary: "one two three",
    sceneSetter: "four small gap",
    historicalContext: "five six seven",
    whatHappens: "eight",
  }),
);
assert.equal(promptOrderSplit.verdict, "block");
assert.ok(
  promptOrderSplit.findings.some(
    (finding) => finding.code === "CROSS_FIELD_8_PLUS",
  ),
);

const separatedFields = scan(
  JSON.stringify({
    summary: `one two three four ${"unrelated ".repeat(30)}`,
    prayer: `${"different ".repeat(30)}small gap five six`,
  }),
);
assert.equal(separatedFields.verdict, "block");

const repeatedSourceAmbiguity = scan(
  JSON.stringify({ summary: "chapter mark", prayer: "chapter mark" }),
);
assert.equal(repeatedSourceAmbiguity.verdict, "pass");
assert.equal(repeatedSourceAmbiguity.findingCount, 0);

assert.throws(
  () =>
    scan(
      '{"summary":"one two three four small gap five six seven eight","summary":"clean"}',
    ),
  /duplicate-free JSON/u,
);

const sourceInKey = scan(
  JSON.stringify({
    "one two three four small gap five six seven eight": "clean value",
  }),
);
assert.equal(sourceInKey.verdict, "block");
assert.ok(
  !JSON.stringify(sourceInKey).includes(
    "one two three four small gap five six seven eight",
  ),
);

const hugeSourceKey = `${SYNTHETIC_PRIVATE_PHRASE} `.repeat(2_000);
const hugeKeyReport = scan(JSON.stringify({ [hugeSourceKey]: "clean value" }));
const serializedHugeKeyReport = JSON.stringify(hugeKeyReport);
assert.equal(hugeKeyReport.verdict, "block");
assert.ok(!serializedHugeKeyReport.includes(SYNTHETIC_PRIVATE_PHRASE));
assert.ok(serializedHugeKeyReport.length < 50_000);

// Issue #17: a single short overlap is a REVIEW diagnostic, not a blocker.
const fiveWord = scan(JSON.stringify({ unknownField: "cedar amber lantern mercy river" }));
assert.equal(fiveWord.verdict, "pass");
assert.equal(fiveWord.blockFindingCount, 0);
assert.ok(fiveWord.reviewFindingCount >= 1);
assert.ok(fiveWord.findings.some((finding) => finding.code === "EXACT_5_TO_7"));
assert.ok(fiveWord.findings.every((finding) => finding.severity === "review"));

const longFour = scan(
  JSON.stringify({
    prayer: "extraordinaryword anotherextraordinaryword thirdextraordinaryword fourthextraordinaryword",
  }),
);
// The synthetic source does not contain those words, so this remains a clean
// control. Long-four behavior is exercised below with source words.
assert.equal(longFour.verdict, "pass");
const sourceLongFour = scan(
  JSON.stringify({ prayer: "synthetic validation wording remains" }),
);
assert.equal(sourceLongFour.verdict, "pass");
assert.equal(sourceLongFour.blockFindingCount, 0);
assert.ok(
  sourceLongFour.findings.some((finding) => finding.code === "LONG_EXACT_FOUR"),
);
assert.ok(
  sourceLongFour.findings.every((finding) => finding.severity === "review"),
);

// NEARBY short spans still block: two review-level spans reconstructing one
// source region trip the always-on mosaic detector (the ONE bounded rule).
const combinedShortSpans = scan(
  JSON.stringify({
    summary:
      "cedar amber lantern mercy river appears then original words then synthetic validation wording remains private",
  }),
);
assert.equal(combinedShortSpans.verdict, "block");
assert.ok(
  combinedShortSpans.findings.some(
    (finding) => finding.code === "MOSAIC_10_PLUS" && finding.severity === "block",
  ),
);
assert.ok(
  combinedShortSpans.findings
    .filter((finding) => finding.code === "EXACT_5_TO_7")
    .every((finding) => finding.severity === "review"),
);

const mosaic = scan(
  JSON.stringify({
    summary:
      "one two three four inserted five six seven eight inserted nine ten eleven twelve",
  }),
);
assert.equal(mosaic.verdict, "block");
assert.ok(mosaic.findings.some((finding) => finding.code === "MOSAIC_10_PLUS"));

const trigramMosaic = scan(
  JSON.stringify({
    summary:
      "one two three inserted four small gap inserted five six seven inserted eight brief gap",
  }),
);
assert.equal(trigramMosaic.verdict, "block");
assert.ok(
  trigramMosaic.findings.some((finding) => finding.code === "MOSAIC_10_PLUS"),
);

const bigramMosaic = scan(
  JSON.stringify({
    summary:
      "one two inserted three four inserted small gap inserted five six inserted seven eight inserted brief gap inserted nine ten inserted eleven twelve",
  }),
);
assert.equal(bigramMosaic.verdict, "block");
assert.ok(
  bigramMosaic.findings.some((finding) => finding.code === "MOSAIC_10_PLUS"),
);

const confusableCopy = "one two three four small gap five six seven eight"
  .replaceAll("o", "о")
  .replaceAll("e", "е")
  .replaceAll("a", "а");
assert.throws(
  () => scan(JSON.stringify({ summary: confusableCopy })),
  /mixed-script or Cyrillic/u,
);
assert.equal(
  scan(JSON.stringify({ originalLanguage: "λόγος" })).verdict,
  "pass",
);

const serializedReport = JSON.stringify(exactEight);
assert.ok(!serializedReport.includes(SYNTHETIC_PRIVATE_PHRASE));
assert.ok(!serializedReport.includes("cedar amber lantern"));
assert.ok(!serializedReport.includes(SYNTHETIC_KEY));
assert.doesNotMatch(serializedReport, /excerpt|snippet|overlapDigest/iu);

const tamperedVerdict = structuredClone(exactEight);
tamperedVerdict.verdict = "pass";
assert.throws(() =>
  assertMarkSprintEsvOverlapReportIntegrity(tamperedVerdict, {
    bundle: mark8Bundle,
    manifestDigest: MANIFEST_DIGEST,
    rawDraftJson: exactEightDraft,
  }),
);
assert.throws(() =>
  assertMarkSprintEsvOverlapReportIntegrity(exactEight, {
    bundle: mark8Bundle,
    manifestDigest: "b".repeat(64),
    rawDraftJson: exactEightDraft,
  }),
);
assert.throws(() =>
  assertMarkSprintEsvOverlapReportIntegrity(exactEight, {
    bundle: changedBundle,
    manifestDigest: MANIFEST_DIGEST,
    rawDraftJson: exactEightDraft,
  }),
);
assert.throws(() =>
  assertMarkSprintEsvOverlapReportIntegrity(exactEight, {
    bundle: mark8Bundle,
    manifestDigest: MANIFEST_DIGEST,
    rawDraftJson: cleanDraft,
  }),
);

// =====================================================================
// ISSUE #17 CALIBRATION — a realistic paraphrased Mark 8 workup against a
// scripture-STYLED synthetic source (original wording that deliberately
// shares the unavoidable phrase inventory: "Son of Man", "and he said to
// them", "Caesarea Philippi", ...). No ESV text appears anywhere here.
// =====================================================================
const SCRIPTURE_STYLE_V31 =
  "he began to teach them that the son of man must endure rejection and rise again";
const SCRIPTURE_STYLE_PHRASES: Record<number, string> = {
  5: "and they gathered seven baskets full of broken pieces that remained",
  9: "for about four thousand people were gathered together in that lonely place",
  17: "and he asked them plainly do you not yet understand what has happened",
  21: "and he said to them consider carefully all that you have watched",
  27: "then they went on toward the villages of caesarea philippi speaking together",
  29: "peter answered him saying plainly you are the christ the promised one",
  31: SCRIPTURE_STYLE_V31,
  34: "whoever would come after me let him deny himself and take up his cross and follow me",
};
function scriptureStyleChapterText(reference: string): string {
  const markers = expectedMarkChapterVerseMarkers(reference);
  assert.ok(markers);
  const chapter = chapterFromReference(reference);
  return markers
    .map((verse) => {
      if (verse === 1) return `[1] ${SYNTHETIC_PRIVATE_PHRASE}.`;
      const phrase = chapter === 8 ? SCRIPTURE_STYLE_PHRASES[verse] : undefined;
      if (phrase) return `[${verse}] ${phrase}.`;
      return `[${verse}] the record speaks further with steady plainer wording set down for spot ${verse} within chapter ${chapter}.`;
    })
    .join("\n\n");
}
const scriptureBundle = await loadMarkSprintEsvSourceBundle({
  slug: "mark-8",
  apiKey: SYNTHETIC_KEY,
  fetchImpl: syntheticFetcher({
    payload: (reference) =>
      syntheticPayload(reference, { textOverride: scriptureStyleChapterText }),
  }).fetchImpl,
});
function scanScripture(rawDraftJson: string) {
  return evaluateMarkSprintEsvOverlap({
    bundle: scriptureBundle,
    rawDraftJson,
    manifestDigest: MANIFEST_DIGEST,
  });
}

// 1. The realistic paraphrase fixture PASSES, with its unavoidable short
// phrases surfaced as review diagnostics only.
const paraphraseFixtureJson = readFileSync(
  "lib/ai/fixtures/mark-8-paraphrase-workup.json",
  "utf8",
);
// The fixture must be REAL: fully valid under the production workup schema,
// so the scan exercises the exact shape a production draft will have.
assert.doesNotThrow(() => parseChapterWorkupJson(paraphraseFixtureJson));
const paraphraseFixture = JSON.parse(paraphraseFixtureJson) as Record<string, unknown>;
const realistic = scanScripture(paraphraseFixtureJson);
assert.equal(realistic.verdict, "pass", `realistic paraphrase must pass (block findings: ${realistic.findings.filter((f) => f.severity === "block").map((f) => `${f.code}@${f.outputPath}`).join(", ")})`);
assert.equal(realistic.blockFindingCount, 0);
assert.ok(realistic.reviewFindingCount >= 1, "expected the unavoidable short phrases to surface as review diagnostics");
assert.ok(realistic.findings.every((finding) => finding.severity === "review"));
assert.ok(
  realistic.findings.every((finding) =>
    ["EXACT_5_TO_7", "LONG_EXACT_FOUR"].includes(finding.code),
  ),
);
assertMarkSprintEsvOverlapReportIntegrity(realistic, {
  bundle: scriptureBundle,
  manifestDigest: MANIFEST_DIGEST,
  rawDraftJson: paraphraseFixtureJson,
});
// The report carries only safe metadata — no source or draft wording.
const serializedRealistic = JSON.stringify(realistic);
assert.ok(!serializedRealistic.includes("son of man"));
assert.ok(!serializedRealistic.includes("caesarea"));
assert.ok(!serializedRealistic.includes("Bethsaida"));

// 2. A TRUE long quotation still hard-blocks.
const quotation = scanScripture(
  JSON.stringify({ ...paraphraseFixture, sceneSetter: SCRIPTURE_STYLE_V31 }),
);
assert.equal(quotation.verdict, "block");
assert.ok(quotation.findings.some((finding) => finding.code === "EXACT_8_PLUS" && finding.severity === "block"));
// The unavoidable-phrase boundary is real: quoting the 7-token core
// ("take up his cross and follow me") is a review diagnostic — the fixture
// does exactly that — but quoting the 9-token span WITH its lead-in blocks.
const nineTokenQuote = scanScripture(
  JSON.stringify({
    ...paraphraseFixture,
    application:
      "Discipleship means one must deny himself and take up his cross and follow me, lived out in ordinary days.",
  }),
);
assert.equal(nineTokenQuote.verdict, "block");
assert.ok(
  nineTokenQuote.findings.some(
    (finding) => finding.code === "EXACT_8_PLUS" && finding.severity === "block",
  ),
);

// 3. Deliberate split copying still blocks — across fields...
const splitCopy = scanScripture(
  JSON.stringify({
    a: "he began to teach them",
    b: "that the son of man must",
    c: "endure rejection and rise again",
  }),
);
assert.equal(splitCopy.verdict, "block");
assert.ok(splitCopy.findings.some((finding) => finding.code === "CROSS_FIELD_8_PLUS"));
// ...interleaved short spans inside one field (the always-on mosaic)...
const interleaved = scanScripture(
  JSON.stringify({
    summary:
      "he began to teach them INSERTED that the son of man must INSERTED endure rejection and rise again",
  }),
);
assert.equal(interleaved.verdict, "block");
assert.ok(
  interleaved.findings.some(
    (finding) => finding.code === "MOSAIC_10_PLUS" && finding.severity === "block",
  ),
);
// Codex's proven gap: one review-level five-word match plus smaller copied
// fragments (11+ exact source tokens in one field) must now block — the
// review match no longer suppresses the mosaic detector.
const reviewPlusFragments = scanScripture(
  JSON.stringify({
    summary:
      "began to teach FILLER that the son of man must FILLER endure rejection FILLER rise again",
  }),
);
assert.equal(reviewPlusFragments.verdict, "block");
assert.ok(
  reviewPlusFragments.findings.some(
    (finding) => finding.code === "MOSAIC_10_PLUS" && finding.severity === "block",
  ),
);
// DISTANT natural phrases in one field never combine: verse-17 and verse-34
// phrases are hundreds of source tokens apart, so both stay review and pass.
const distantNaturalPhrases = scanScripture(
  JSON.stringify({
    summary:
      "Jesus asks do you not yet understand and much later calls each disciple to take up his cross and follow me in daily life.",
  }),
);
assert.equal(distantNaturalPhrases.verdict, "pass");
assert.equal(distantNaturalPhrases.blockFindingCount, 0);
assert.ok(distantNaturalPhrases.reviewFindingCount >= 2);
// REVIEW-ONLY TRUNCATION stays a pass: 40+ fields sharing one harmless short
// phrase produce >100 review diagnostics; the verdict remains pass and no
// blocker can hide in the truncated tail (blockers sort first).
const manyReviewFields: Record<string, string> = {};
for (let index = 0; index < 105; index++) {
  manyReviewFields[`field${index}`] = `original thought ${index} echoes do you not yet understand as a question`;
}
const truncatedReview = scanScripture(JSON.stringify(manyReviewFields));
assert.equal(truncatedReview.verdict, "pass");
assert.equal(truncatedReview.blockFindingCount, 0);
assert.equal(truncatedReview.findingsTruncated, true);
assert.ok(truncatedReview.findings.every((finding) => finding.severity === "review"));
assertMarkSprintEsvOverlapReportIntegrity(truncatedReview, {
  bundle: scriptureBundle,
  manifestDigest: MANIFEST_DIGEST,
  rawDraftJson: JSON.stringify(manyReviewFields),
});
// ...and tiny content-bearing fragments that mosaic back into the sentence.
const fragmentMosaic = scanScripture(
  JSON.stringify({
    summary:
      "began to teach INSERTED the son of man INSERTED endure rejection INSERTED rise again",
  }),
);
assert.equal(fragmentMosaic.verdict, "block");
assert.ok(fragmentMosaic.findings.some((finding) => finding.code === "MOSAIC_10_PLUS"));

// PRODUCTION SHAPE (live runs 03:18 / 04:25): the offending strings sat in
// sections[].fullContent and verseByVerse[].explanation. A TEACHING
// explanation that paraphrases passes; an 11+-token reconstruction of the
// source sentence inside an explanation blocks, exactly as observed live.
const teachingShapePass = scanScripture(
  JSON.stringify({
    sections: [
      {
        id: "s1",
        title: "The turning point",
        fullContent:
          "Mark builds this whole chapter toward one exchange on the northern road. The disciples have watched two feedings and still fret about bread, so their teacher slows down and works on their sight — first a blind man's, in stages, then theirs.",
      },
    ],
    verseByVerse: [
      {
        startVerse: 31,
        endVerse: 33,
        explanation:
          "Right after the confession, the teaching turns hard: suffering and rejection are announced as the road ahead, and glory only after. Peter cannot square that with the title he just used, which is precisely Mark's point.",
      },
    ],
  }),
);
assert.equal(teachingShapePass.verdict, "pass");
assert.equal(teachingShapePass.blockFindingCount, 0);
// EXACT copying inside sections[].fullContent → contiguous-run block.
const fullContentExactBlock = scanScripture(
  JSON.stringify({
    sections: [
      {
        id: "s1",
        title: "The turning point",
        fullContent:
          "Mark reports that he began to teach them that the son of man must endure rejection, and the room goes quiet.",
      },
    ],
  }),
);
assert.equal(fullContentExactBlock.verdict, "block");
assert.ok(
  fullContentExactBlock.findings.some(
    (finding) => finding.code === "EXACT_8_PLUS" && finding.severity === "block",
  ),
);
// STITCHED reconstruction inside verseByVerse[].explanation → mosaic block.
const explanationStitchBlock = scanScripture(
  JSON.stringify({
    verseByVerse: [
      {
        startVerse: 31,
        endVerse: 33,
        explanation:
          "The verse says he began to teach them, then insists the son of man must, and finally lands on endure rejection as the road ahead.",
      },
    ],
  }),
);
assert.equal(explanationStitchBlock.verdict, "block");
assert.ok(
  explanationStitchBlock.findings.some(
    (finding) => finding.code === "MOSAIC_10_PLUS" && finding.severity === "block",
  ),
);

// 4. Pure function-word bigrams scattered across many fields can no longer
// accumulate into a cross-field false positive.
const functionWordScatter = scanScripture(
  JSON.stringify({
    a: "do you wonder that you",
    b: "you have hoped in that place",
    c: "not yet and do you see",
    d: "in that hour you have peace",
  }),
);
assert.equal(functionWordScatter.verdict, "pass");
assert.equal(functionWordScatter.blockFindingCount, 0);

assert.equal(existsSync("esv.json"), false, "tracked ESV dump returned to worktree");
assert.match(readFileSync(".gitignore", "utf8"), /^\/esv\.json$/mu);

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: "mark-sprint-esv-source-bundle-v2",
      slugs: [...MARK_SPRINT_SLUGS],
      requestOptionsDigest: MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST,
      syntheticBundleDigest: mark8Bundle.bundleDigest,
      overlap: {
        clean: cleanReport.verdict,
        exactEight: exactEight.verdict,
        fiveWord: `${fiveWord.verdict} (${fiveWord.reviewFindingCount} review)`,
        longFour: `${sourceLongFour.verdict} (review)`,
        combinedShortSpans: combinedShortSpans.verdict,
        mosaic: mosaic.verdict,
        realisticMark8Paraphrase: `${realistic.verdict} (${realistic.reviewFindingCount} review, schema-valid)`,
        trueQuotation: quotation.verdict,
        splitCopy: splitCopy.verdict,
        reviewPlusNearbyFragments: reviewPlusFragments.verdict,
        distantNaturalPhrases: distantNaturalPhrases.verdict,
        reviewOnlyTruncation: `${truncatedReview.verdict} (truncated ${truncatedReview.findingCount})`,
        functionWordScatter: functionWordScatter.verdict,
      },
      networkCalls: 0,
      sourceBytesPersisted: false,
    },
    null,
    2,
  ),
);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "source verifier failed");
  process.exitCode = 1;
});
