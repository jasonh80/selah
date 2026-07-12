import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    omitVerse?: number;
    canonical?: string;
    partial?: boolean;
    multiplePassages?: boolean;
    metadataExtra?: string;
    markerOnly?: boolean;
  } = {},
) {
  const pair = expectedMarkChapterVerseIdPair(reference);
  assert.ok(pair);
  const completeText = options.markerOnly
    ? expectedMarkChapterVerseMarkers(reference)!
        .map((verse) => `[${verse}]`)
        .join(" ")
        .padEnd(200, " ")
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

const fiveWord = scan(JSON.stringify({ unknownField: "cedar amber lantern mercy river" }));
assert.equal(fiveWord.verdict, "block");
assert.ok(fiveWord.findings.some((finding) => finding.code === "EXACT_5_TO_7"));

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
assert.equal(sourceLongFour.verdict, "block");
assert.ok(
  sourceLongFour.findings.some((finding) => finding.code === "LONG_EXACT_FOUR"),
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
        fiveWord: fiveWord.verdict,
        longFour: sourceLongFour.verdict,
        mosaic: mosaic.verdict,
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
