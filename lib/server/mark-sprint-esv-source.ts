// SERVER-ONLY. Protected, transient ESV source assembly for Mark 8–11.
//
// This module cannot mutate Studio/Supabase, call a model, log source bytes, or
// authorize a run. API text lives only in a module-private WeakMap; the returned
// bundle is a safe, enumerable digest/metadata projection.
import {
  buildProtectedChapterWorkupPrompt,
  type ChapterWorkupPromptInput,
  type ChapterWorkupGenerationSource,
} from "@/lib/ai/prompts/chapter-workup-prompt";
import {
  canonicalJson,
  normalizeDigestText,
  sha256Canonical,
  sha256Text,
  type GenerationSourcePassageRole,
} from "./generation-manifest";
import {
  MARK_SPRINT_ESV_ASSEMBLER_REVISION,
  MARK_SPRINT_ESV_ENDPOINT,
  MARK_SPRINT_ESV_MAX_RESPONSE_BYTES,
  MARK_SPRINT_ESV_MIN_AVERAGE_WORDS_PER_VERSE,
  MARK_SPRINT_ESV_MIN_MEDIAN_WORDS_PER_VERSE,
  MARK_SPRINT_ESV_MIN_WORDS_PER_VERSE,
  MARK_SPRINT_ESV_NORMALIZER_REVISION,
  MARK_SPRINT_ESV_OVERLAP_BLOCK_TOKENS,
  MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS,
  MARK_SPRINT_ESV_OVERLAP_CROSS_FIELD_CONTENT_TOKENS,
  MARK_SPRINT_ESV_OVERLAP_FUNCTION_WORDS,
  MARK_SPRINT_ESV_OVERLAP_LONG_FOUR_CHARS,
  MARK_SPRINT_ESV_OVERLAP_NORMALIZER_REVISION,
  MARK_SPRINT_ESV_OVERLAP_REVIEW_ESCALATION_TOKENS,
  MARK_SPRINT_ESV_OVERLAP_REVIEW_TOKENS,
  MARK_SPRINT_ESV_OVERLAP_SCANNER_REVISION,
  MARK_SPRINT_ESV_REQUEST_OPTIONS,
  MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST,
  MARK_SPRINT_ESV_RESPONSE_VALIDATOR_REVISION,
  MARK_SPRINT_ESV_SOURCE_BUNDLE_SCHEMA,
  MARK_SPRINT_ESV_TIMEOUT_MS,
  expectedMarkChapterVerseIdPair,
  expectedMarkChapterVerseMarkers,
  markSprintEsvRequestDescriptor,
} from "./mark-sprint-esv-contract";
import {
  buildMarkSprintManifestPolicy,
  isMarkSprintSlug,
  type MarkSprintSlug,
} from "./mark-sprint-manifest-policy";

if (typeof window !== "undefined") {
  throw new Error("Mark sprint ESV source assembly is server-only");
}

export type MarkSprintEsvSourceErrorCode =
  | "SLUG_NOT_ALLOWED"
  | "API_KEY_MISSING"
  | "POLICY_MISMATCH"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "CONTENT_TYPE_INVALID"
  | "RESPONSE_TOO_LARGE"
  | "RESPONSE_INVALID"
  | "REFERENCE_MISMATCH"
  | "INCOMPLETE_CHAPTER"
  | "SOURCE_TEXT_INVALID"
  | "BUNDLE_INTEGRITY_FAILED";

export class MarkSprintEsvSourceError extends Error {
  readonly code: MarkSprintEsvSourceErrorCode;

  constructor(code: MarkSprintEsvSourceErrorCode, message: string) {
    super(message);
    this.name = "MarkSprintEsvSourceError";
    this.code = code;
  }
}

export interface MarkSprintEsvPassageEvidence {
  role: GenerationSourcePassageRole;
  requestedReference: string;
  canonicalReference: string;
  textDigest: string;
  requestDigest: string;
  responseCanonicalDigest: string;
  responseMetadataDigest: string;
  chapterStartVerseId: number;
  chapterEndVerseId: number;
  verseMarkerCount: number;
}

export interface MarkSprintEsvSourceBundle {
  schemaVersion: typeof MARK_SPRINT_ESV_SOURCE_BUNDLE_SCHEMA;
  assemblerRevision: typeof MARK_SPRINT_ESV_ASSEMBLER_REVISION;
  normalizerRevision: typeof MARK_SPRINT_ESV_NORMALIZER_REVISION;
  responseValidatorRevision: typeof MARK_SPRINT_ESV_RESPONSE_VALIDATOR_REVISION;
  slug: MarkSprintSlug;
  source: {
    provider: string;
    name: string;
    version: string;
    editionEvidenceStatus: "policy_expected_not_response_attested";
    apiEndpoint: string;
    termsUrl: string;
    permissionsUrl: string;
    useBasis: string;
    publishedTermsAiAnalysisStatus: string;
    commercialUseAllowed: false;
    ownerDecisionId: string;
    ownerDecisionDigest: string;
  };
  requestOptions: typeof MARK_SPRINT_ESV_REQUEST_OPTIONS;
  requestOptionsDigest: string;
  passages: readonly MarkSprintEsvPassageEvidence[];
  bundleDigest: string;
}

type PrivatePassage = MarkSprintEsvPassageEvidence & { text: string };
type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const PRIVATE_PASSAGES = new WeakMap<
  MarkSprintEsvSourceBundle,
  readonly PrivatePassage[]
>();

function sourceError(
  code: MarkSprintEsvSourceErrorCode,
  message: string,
): never {
  throw new MarkSprintEsvSourceError(code, message);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return canonicalJson(actual) === canonicalJson([...expected].sort());
}

function integerPair(value: unknown): readonly [number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((item) => Number.isSafeInteger(item))
  ) {
    return null;
  }
  return [value[0] as number, value[1] as number] as const;
}

function pairsEqual(
  left: readonly number[] | null,
  right: readonly number[],
): boolean {
  return Boolean(left && left[0] === right[0] && left[1] === right[1]);
}

function verseMarkers(text: string): number[] {
  return Array.from(text.matchAll(/\[(\d+)\]/gu), (match) => Number(match[1]));
}

function validateNormalizedChapterText(text: string, reference: string): void {
  const expectedMarkers = expectedMarkChapterVerseMarkers(reference);
  const verseSegments = Array.from(
    text.matchAll(/\[(\d+)\]([\s\S]*?)(?=\[\d+\]|$)/gu),
  );
  const words = (value: string) =>
    value.match(/\p{L}+(?:['’]\p{L}+)*/gu) ?? [];
  const wordCount = words(text).length;
  const segmentWordCounts = verseSegments
    .map((segment) => words(segment[2] ?? "").length)
    .sort((left, right) => left - right);
  const lowerMedianWordCount =
    segmentWordCounts[Math.floor((segmentWordCounts.length - 1) / 2)] ?? 0;
  if (
    !expectedMarkers ||
    text !== normalizeDigestText(text).trim() ||
    text.length < 100 ||
    text.length > 120_000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text) ||
    canonicalJson(verseMarkers(text)) !== canonicalJson(expectedMarkers) ||
    verseSegments.length !== expectedMarkers.length ||
    verseSegments.some(
      (segment, index) =>
        Number(segment[1]) !== expectedMarkers[index] ||
        words(segment[2] ?? "").length < MARK_SPRINT_ESV_MIN_WORDS_PER_VERSE,
    ) ||
    wordCount <
      expectedMarkers.length * MARK_SPRINT_ESV_MIN_AVERAGE_WORDS_PER_VERSE ||
    lowerMedianWordCount < MARK_SPRINT_ESV_MIN_MEDIAN_WORDS_PER_VERSE
  ) {
    return sourceError(
      "SOURCE_TEXT_INVALID",
      "ESV source text failed complete-chapter validation",
    );
  }
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^(application\/json|[^;]+\+json)(?:;|$)/iu.test(contentType.trim())) {
    return sourceError(
      "CONTENT_TYPE_INVALID",
      "ESV source response is not JSON",
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MARK_SPRINT_ESV_MAX_RESPONSE_BYTES
  ) {
    return sourceError(
      "RESPONSE_TOO_LARGE",
      "ESV source response exceeds the size limit",
    );
  }
  if (!response.body) {
    return sourceError("RESPONSE_INVALID", "ESV source response body is missing");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch {
      return sourceError(
        "RESPONSE_INVALID",
        "ESV source response stream could not be read",
      );
    }
    const { done, value } = result;
    if (done) break;
    if (!value) continue;
    length += value.byteLength;
    if (length > MARK_SPRINT_ESV_MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The typed size failure is authoritative; a cleanup failure must not
        // expose an implementation-specific stream error or source bytes.
      }
      return sourceError(
        "RESPONSE_TOO_LARGE",
        "ESV source response exceeds the size limit",
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return sourceError("RESPONSE_INVALID", "ESV source response is not UTF-8");
  }
}

function parseCompleteChapterResponse(
  rawBody: string,
  expectedReference: string,
): {
  text: string;
  responseCanonicalDigest: string;
  responseMetadataDigest: string;
  chapterStartVerseId: number;
  chapterEndVerseId: number;
  verseMarkerCount: number;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return sourceError("RESPONSE_INVALID", "ESV source response is not valid JSON");
  }
  if (!isPlainRecord(payload)) {
    return sourceError("RESPONSE_INVALID", "ESV source response is not an object");
  }
  if (
    payload.query !== expectedReference ||
    payload.canonical !== expectedReference
  ) {
    return sourceError(
      "REFERENCE_MISMATCH",
      "ESV source response does not match the requested chapter",
    );
  }
  if (
    !Array.isArray(payload.parsed) ||
    payload.parsed.length !== 1 ||
    !Array.isArray(payload.passage_meta) ||
    payload.passage_meta.length !== 1 ||
    !Array.isArray(payload.passages) ||
    payload.passages.length !== 1
  ) {
    return sourceError(
      "RESPONSE_INVALID",
      "ESV source response must contain exactly one chapter passage",
    );
  }

  const parsed = integerPair(payload.parsed[0]);
  const metadata = payload.passage_meta[0];
  const expectedPair = expectedMarkChapterVerseIdPair(expectedReference);
  if (
    !expectedPair ||
    !isPlainRecord(metadata) ||
    metadata.canonical !== expectedReference ||
    !pairsEqual(parsed, expectedPair) ||
    !pairsEqual(integerPair(metadata.chapter_start), expectedPair) ||
    !pairsEqual(integerPair(metadata.chapter_end), expectedPair)
  ) {
    return sourceError(
      "INCOMPLETE_CHAPTER",
      "ESV source response is not the complete requested chapter",
    );
  }

  const passage = payload.passages[0];
  if (typeof passage !== "string") {
    return sourceError("SOURCE_TEXT_INVALID", "ESV source text is missing");
  }
  const text = normalizeDigestText(passage).trim();
  validateNormalizedChapterText(text, expectedReference);

  return {
    text,
    responseCanonicalDigest: sha256Canonical(payload),
    responseMetadataDigest: sha256Canonical({
      query: payload.query,
      canonical: payload.canonical,
      parsed: payload.parsed,
      passageMeta: payload.passage_meta,
    }),
    chapterStartVerseId: expectedPair[0],
    chapterEndVerseId: expectedPair[1],
    verseMarkerCount: expectedMarkChapterVerseMarkers(expectedReference)!.length,
  };
}

function requestUrl(reference: string): string {
  const params = new URLSearchParams({ q: reference });
  for (const [key, value] of Object.entries(MARK_SPRINT_ESV_REQUEST_OPTIONS)) {
    params.set(key, String(value));
  }
  return `${MARK_SPRINT_ESV_ENDPOINT}?${params.toString()}`;
}

async function fetchBodyWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), MARK_SPRINT_ESV_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    if (response.redirected) {
      return sourceError("HTTP_ERROR", "ESV source response was redirected");
    }
    if (!response.ok) {
      return sourceError(
        "HTTP_ERROR",
        `ESV source request failed with HTTP ${response.status}`,
      );
    }
    return await readBoundedResponseBody(response);
  } catch (error) {
    if (error instanceof MarkSprintEsvSourceError) throw error;
    return sourceError("FETCH_FAILED", "ESV source request failed");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function safeProjectionWithoutDigest(
  bundle: Omit<MarkSprintEsvSourceBundle, "bundleDigest">,
) {
  return {
    schemaVersion: bundle.schemaVersion,
    assemblerRevision: bundle.assemblerRevision,
    normalizerRevision: bundle.normalizerRevision,
    responseValidatorRevision: bundle.responseValidatorRevision,
    slug: bundle.slug,
    source: bundle.source,
    requestOptions: bundle.requestOptions,
    requestOptionsDigest: bundle.requestOptionsDigest,
    passages: bundle.passages,
  };
}

function safePassageProjection(
  passage: PrivatePassage,
): MarkSprintEsvPassageEvidence {
  const { text: _text, ...safe } = passage;
  return safe;
}

export async function loadMarkSprintEsvSourceBundle(input: {
  slug: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<MarkSprintEsvSourceBundle> {
  if (!isMarkSprintSlug(input.slug)) {
    return sourceError(
      "SLUG_NOT_ALLOWED",
      "ESV source assembly is restricted to the approved Mark sprint",
    );
  }
  if (typeof input.apiKey !== "string" || !input.apiKey.trim()) {
    return sourceError("API_KEY_MISSING", "ESV source API key is unavailable");
  }

  const policy = buildMarkSprintManifestPolicy(input.slug);
  if (policy.requirements.source.apiEndpoint !== MARK_SPRINT_ESV_ENDPOINT) {
    return sourceError(
      "POLICY_MISMATCH",
      "ESV source endpoint does not match the approved policy",
    );
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const privatePassages: PrivatePassage[] = [];

  // Sequential retrieval makes the source order explicit and avoids an API
  // burst. References come only from the reviewed, fixed policy layout.
  for (const expected of policy.requirements.source.expectedPassages) {
    const requestDescriptor = markSprintEsvRequestDescriptor(
      expected.requestedReference,
    );
    const rawBody = await fetchBodyWithTimeout(
      fetchImpl,
      requestUrl(expected.requestedReference),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Token ${input.apiKey}`,
        },
        cache: "no-store",
        redirect: "error",
      },
      input.signal,
    );
    const parsed = parseCompleteChapterResponse(
      rawBody,
      expected.requestedReference,
    );
    privatePassages.push({
      role: expected.role,
      requestedReference: expected.requestedReference,
      canonicalReference: expected.expectedCanonicalReference,
      textDigest: sha256Text(parsed.text),
      requestDigest: sha256Canonical(requestDescriptor),
      responseCanonicalDigest: parsed.responseCanonicalDigest,
      responseMetadataDigest: parsed.responseMetadataDigest,
      chapterStartVerseId: parsed.chapterStartVerseId,
      chapterEndVerseId: parsed.chapterEndVerseId,
      verseMarkerCount: parsed.verseMarkerCount,
      text: parsed.text,
    });
  }

  const source = {
    provider: policy.requirements.source.provider,
    name: policy.requirements.source.name,
    version: policy.requirements.source.version,
    editionEvidenceStatus:
      "policy_expected_not_response_attested" as const,
    apiEndpoint: policy.requirements.source.apiEndpoint,
    termsUrl: policy.requirements.source.termsUrl,
    permissionsUrl: policy.requirements.source.permissionsUrl,
    useBasis: policy.requirements.source.useBasis,
    publishedTermsAiAnalysisStatus:
      policy.requirements.source.publishedTermsAiAnalysisStatus,
    commercialUseAllowed: false as const,
    ownerDecisionId: policy.requirements.source.ownerDecisionId,
    ownerDecisionDigest: policy.requirements.source.ownerDecisionDigest,
  };
  const partial: Omit<MarkSprintEsvSourceBundle, "bundleDigest"> = {
    schemaVersion: MARK_SPRINT_ESV_SOURCE_BUNDLE_SCHEMA,
    assemblerRevision: MARK_SPRINT_ESV_ASSEMBLER_REVISION,
    normalizerRevision: MARK_SPRINT_ESV_NORMALIZER_REVISION,
    responseValidatorRevision: MARK_SPRINT_ESV_RESPONSE_VALIDATOR_REVISION,
    slug: input.slug,
    source,
    requestOptions: MARK_SPRINT_ESV_REQUEST_OPTIONS,
    requestOptionsDigest: MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST,
    passages: privatePassages.map(safePassageProjection),
  };
  const bundle: MarkSprintEsvSourceBundle = {
    ...partial,
    bundleDigest: sha256Canonical(safeProjectionWithoutDigest(partial)),
  };
  PRIVATE_PASSAGES.set(bundle, deepFreeze(privatePassages));
  assertMarkSprintEsvBundleIntegrity(bundle);
  return deepFreeze(bundle);
}

export function assertMarkSprintEsvBundleIntegrity(
  bundle: MarkSprintEsvSourceBundle,
): void {
  const privatePassages = PRIVATE_PASSAGES.get(bundle);
  if (
    !isPlainRecord(bundle) ||
    !exactKeys(bundle, [
      "schemaVersion",
      "assemblerRevision",
      "normalizerRevision",
      "responseValidatorRevision",
      "slug",
      "source",
      "requestOptions",
      "requestOptionsDigest",
      "passages",
      "bundleDigest",
    ]) ||
    bundle.schemaVersion !== MARK_SPRINT_ESV_SOURCE_BUNDLE_SCHEMA ||
    bundle.assemblerRevision !== MARK_SPRINT_ESV_ASSEMBLER_REVISION ||
    bundle.normalizerRevision !== MARK_SPRINT_ESV_NORMALIZER_REVISION ||
    bundle.responseValidatorRevision !==
      MARK_SPRINT_ESV_RESPONSE_VALIDATOR_REVISION ||
    !isMarkSprintSlug(bundle.slug) ||
    !privatePassages
  ) {
    return sourceError(
      "BUNDLE_INTEGRITY_FAILED",
      "ESV source bundle identity is invalid",
    );
  }

  const policy = buildMarkSprintManifestPolicy(bundle.slug);
  const expectedSource = {
    provider: policy.requirements.source.provider,
    name: policy.requirements.source.name,
    version: policy.requirements.source.version,
    editionEvidenceStatus: "policy_expected_not_response_attested" as const,
    apiEndpoint: policy.requirements.source.apiEndpoint,
    termsUrl: policy.requirements.source.termsUrl,
    permissionsUrl: policy.requirements.source.permissionsUrl,
    useBasis: policy.requirements.source.useBasis,
    publishedTermsAiAnalysisStatus:
      policy.requirements.source.publishedTermsAiAnalysisStatus,
    commercialUseAllowed: false as const,
    ownerDecisionId: policy.requirements.source.ownerDecisionId,
    ownerDecisionDigest: policy.requirements.source.ownerDecisionDigest,
  };
  if (
    !isPlainRecord(bundle.source) ||
    !exactKeys(bundle.source, [
      "provider",
      "name",
      "version",
      "editionEvidenceStatus",
      "apiEndpoint",
      "termsUrl",
      "permissionsUrl",
      "useBasis",
      "publishedTermsAiAnalysisStatus",
      "commercialUseAllowed",
      "ownerDecisionId",
      "ownerDecisionDigest",
    ]) ||
    canonicalJson(bundle.source) !== canonicalJson(expectedSource) ||
    canonicalJson(bundle.requestOptions) !==
      canonicalJson(MARK_SPRINT_ESV_REQUEST_OPTIONS) ||
    bundle.requestOptionsDigest !== MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST ||
    bundle.passages.length !==
      policy.requirements.source.expectedPassages.length ||
    privatePassages.length !== bundle.passages.length
  ) {
    return sourceError(
      "BUNDLE_INTEGRITY_FAILED",
      "ESV source bundle does not match the approved policy",
    );
  }

  for (let index = 0; index < bundle.passages.length; index++) {
    const passage = bundle.passages[index];
    const privatePassage = privatePassages[index];
    const expected = policy.requirements.source.expectedPassages[index];
    const range = expectedMarkChapterVerseIdPair(
      expected?.requestedReference ?? "",
    );
    if (
      !passage ||
      !privatePassage ||
      !expected ||
      !range ||
      !isPlainRecord(passage) ||
      !exactKeys(passage, [
        "role",
        "requestedReference",
        "canonicalReference",
        "textDigest",
        "requestDigest",
        "responseCanonicalDigest",
        "responseMetadataDigest",
        "chapterStartVerseId",
        "chapterEndVerseId",
        "verseMarkerCount",
      ]) ||
      passage.role !== expected.role ||
      passage.requestedReference !== expected.requestedReference ||
      passage.canonicalReference !== expected.expectedCanonicalReference ||
      passage.chapterStartVerseId !== range[0] ||
      passage.chapterEndVerseId !== range[1] ||
      passage.verseMarkerCount !==
        expectedMarkChapterVerseMarkers(expected.requestedReference)?.length ||
      passage.requestDigest !==
        sha256Canonical(
          markSprintEsvRequestDescriptor(expected.requestedReference),
        ) ||
      canonicalJson(passage) !==
        canonicalJson(safePassageProjection(privatePassage))
    ) {
      return sourceError(
        "BUNDLE_INTEGRITY_FAILED",
        "ESV source passage does not match its approved evidence",
      );
    }
    validateNormalizedChapterText(
      privatePassage.text,
      expected.requestedReference,
    );
    if (passage.textDigest !== sha256Text(privatePassage.text)) {
      return sourceError(
        "BUNDLE_INTEGRITY_FAILED",
        "ESV source text digest is invalid",
      );
    }
  }

  const { bundleDigest: _bundleDigest, ...partial } = bundle;
  if (
    bundle.bundleDigest !==
    sha256Canonical(safeProjectionWithoutDigest(partial))
  ) {
    return sourceError(
      "BUNDLE_INTEGRITY_FAILED",
      "ESV source bundle digest is invalid",
    );
  }
}

export function buildTransientMarkSprintPrompt(
  bundle: MarkSprintEsvSourceBundle,
  input: ChapterWorkupPromptInput & { slug: MarkSprintSlug },
): string {
  assertMarkSprintEsvBundleIntegrity(bundle);
  const expectedChapter = Number(bundle.slug.split("-")[1]);
  if (
    input.slug !== bundle.slug ||
    input.book !== "Mark" ||
    input.chapter !== expectedChapter
  ) {
    return sourceError(
      "BUNDLE_INTEGRITY_FAILED",
      "Prompt subject does not match the ESV source bundle",
    );
  }
  const privatePassages = PRIVATE_PASSAGES.get(bundle)!;
  const generationSource: ChapterWorkupGenerationSource = {
    label: `${bundle.source.version}; ${bundle.slug}; ${bundle.bundleDigest}`,
    sections: privatePassages.map((passage) => ({
      role: passage.role,
      reference: passage.canonicalReference,
      text: passage.text,
    })),
  };
  // The returned string contains transient ESV text. Never serialize or log it;
  // the future composition root must immediately bind and dispatch this exact
  // prompt, then retain the same bundle only for the overlap scan.
  return buildProtectedChapterWorkupPrompt({
    book: input.book,
    chapter: input.chapter,
    bibleVersion: input.bibleVersion,
    globalRules: input.globalRules,
    chapterNotes: input.chapterNotes,
    examples: input.examples,
    generationSource,
  });
}

export type MarkSprintEsvOverlapFindingCode =
  | "EXACT_8_PLUS"
  | "EXACT_5_TO_7"
  | "LONG_EXACT_FOUR"
  | "CROSS_FIELD_8_PLUS"
  | "MOSAIC_10_PLUS";

/**
 * "block" stops the run. "review" is a safe diagnostic: a short overlap that
 * faithful teaching cannot always avoid ("Son of Man", "and he said to them").
 * Review findings never contain excerpts — only structural paths and counts —
 * and they escalate to block when combined evidence in one field shows real
 * copying (see MARK_SPRINT_ESV_OVERLAP_REVIEW_ESCALATION_TOKENS).
 */
export type MarkSprintEsvOverlapFindingSeverity = "block" | "review";

export interface MarkSprintEsvOverlapFinding {
  code: MarkSprintEsvOverlapFindingCode;
  severity: MarkSprintEsvOverlapFindingSeverity;
  outputPath: string;
  sourceRole: GenerationSourcePassageRole;
  sourceReference: string;
  outputStartToken: number;
  outputEndToken: number;
  sourceStartToken: number;
  sourceEndToken: number;
  tokenCount: number;
  characterCount: number;
}

export interface MarkSprintEsvOverlapReport {
  reportVersion: "mark-sprint-esv-overlap-report-v3";
  scannerRevision: typeof MARK_SPRINT_ESV_OVERLAP_SCANNER_REVISION;
  normalizerRevision: typeof MARK_SPRINT_ESV_OVERLAP_NORMALIZER_REVISION;
  slug: MarkSprintSlug;
  manifestDigest: string;
  sourcePolicyDigest: string;
  sourceBundleDigest: string;
  rawDraftDigest: string;
  canonicalDraftDigest: string;
  thresholds: {
    candidateTokens: number;
    reviewTokens: number;
    blockTokens: number;
    longFourCharacters: number;
    mosaicCandidateTokens: number;
    mosaicTokens: number;
    maximumSourceGapTokens: number;
    maximumOutputGapTokens: number;
    crossFieldTokens: number;
    crossFieldCandidateTokens: number;
    crossFieldContentTokens: number;
    reviewEscalationTokens: number;
    functionWordCount: number;
  };
  verdict: "pass" | "block";
  findingCount: number;
  blockFindingCount: number;
  reviewFindingCount: number;
  findingsTruncated: boolean;
  findings: MarkSprintEsvOverlapFinding[];
  reportDigest: string;
}

type StringLeaf = { path: string; value: string };
type TokenMatch = {
  outputStart: number;
  sourceStart: number;
  length: number;
};
type ReportMatch = {
  outputStart: number;
  outputEnd: number;
  sourceStart: number;
  sourceEnd: number;
  tokenCount: number;
  characterCount: number;
};

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
const MAX_DRAFT_BYTES = 1_500_000;
const MAX_REPORT_FINDINGS = 100;
const MAX_DRAFT_DEPTH = 100;
const MAX_DRAFT_STRING_LEAVES = 5_000;
const MOSAIC_MINIMUM_TOKENS = 10;
const MOSAIC_CANDIDATE_TOKENS = 2;
const CROSS_FIELD_MINIMUM_TOKENS = 8;
const CROSS_FIELD_CANDIDATE_TOKENS = 2;
const MOSAIC_MAXIMUM_SOURCE_GAP = 12;
const MOSAIC_MAXIMUM_OUTPUT_GAP = 20;

function assertDuplicateFreeJson(raw: string): void {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/u.test(raw[index] ?? "")) index++;
  };
  const readString = (): string => {
    const start = index;
    if (raw[index] !== '"') throw new Error("invalid JSON string");
    index++;
    while (index < raw.length) {
      const char = raw[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      index++;
      if (char === '"') {
        return JSON.parse(raw.slice(start, index)) as string;
      }
    }
    throw new Error("unterminated JSON string");
  };
  const scanValue = (depth: number): void => {
    if (depth > MAX_DRAFT_DEPTH) throw new Error("JSON nesting limit exceeded");
    skipWhitespace();
    const char = raw[index];
    if (char === '"') {
      readString();
      return;
    }
    if (char === "{") {
      index++;
      skipWhitespace();
      const keys = new Set<string>();
      if (raw[index] === "}") {
        index++;
        return;
      }
      while (index < raw.length) {
        skipWhitespace();
        const key = readString();
        if (keys.has(key)) throw new Error("duplicate JSON key");
        keys.add(key);
        skipWhitespace();
        if (raw[index] !== ":") throw new Error("missing JSON colon");
        index++;
        scanValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "}") {
          index++;
          return;
        }
        if (raw[index] !== ",") throw new Error("missing JSON comma");
        index++;
      }
      throw new Error("unterminated JSON object");
    }
    if (char === "[") {
      index++;
      skipWhitespace();
      if (raw[index] === "]") {
        index++;
        return;
      }
      while (index < raw.length) {
        scanValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "]") {
          index++;
          return;
        }
        if (raw[index] !== ",") throw new Error("missing JSON comma");
        index++;
      }
      throw new Error("unterminated JSON array");
    }
    const start = index;
    while (index < raw.length && !/[\s,\]}]/u.test(raw[index])) index++;
    if (index === start) throw new Error("invalid JSON value");
  };

  try {
    scanValue(0);
    skipWhitespace();
    if (index !== raw.length) throw new Error("trailing JSON content");
  } catch {
    throw new Error("Overlap scan requires valid duplicate-free JSON");
  }
}

function collectStringLeaves(
  value: unknown,
  path = "",
  output: StringLeaf[] = [],
  depth = 0,
): StringLeaf[] {
  if (depth > MAX_DRAFT_DEPTH) {
    throw new Error("Draft exceeds the overlap-scan nesting limit");
  }
  if (typeof value === "string") {
    if (output.length >= MAX_DRAFT_STRING_LEAVES) {
      throw new Error("Draft exceeds the overlap-scan string-field limit");
    }
    output.push({ path: path || "/root", value });
    return output;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return output;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!(index in value)) {
        throw new Error("Draft contains a sparse array");
      }
      collectStringLeaves(
        value[index],
        `${path}/array/${index}`,
        output,
        depth + 1,
      );
    }
    return output;
  }
  if (!isPlainRecord(value)) {
    throw new Error("Draft contains a non-JSON value");
  }
  const keys = Object.keys(value).sort();
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    collectStringLeaves(
      key,
      `${path}/object/${index}/key`,
      output,
      depth + 1,
    );
    collectStringLeaves(
      value[key],
      `${path}/object/${index}/value`,
      output,
      depth + 1,
    );
  }
  return output;
}

const FUNCTION_WORDS = new Set(MARK_SPRINT_ESV_OVERLAP_FUNCTION_WORDS);

function isContentToken(token: string): boolean {
  return !FUNCTION_WORDS.has(token);
}

/** A mosaic/cross-field piece only counts when it carries content vocabulary. */
function matchHasContentToken(
  outputTokens: readonly string[],
  match: TokenMatch,
): boolean {
  for (let offset = 0; offset < match.length; offset++) {
    const token = outputTokens[match.outputStart + offset];
    if (token !== undefined && isContentToken(token)) return true;
  }
  return false;
}

function overlapTokens(value: string): string[] {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/gu, "'")
    .replace(/[‐‑‒–—―]/gu, "-")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/\[\s*\d+\s*\]/gu, " ")
    .replace(/\(\s*\d+[a-z]?\s*\)/gu, " ");
  return normalized.match(/\p{L}+(?:'\p{L}+)*/gu) ?? [];
}

function assertNoScriptConfusables(value: string): void {
  const words = value.normalize("NFKC").match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? [];
  for (const word of words) {
    const hasLatin = /\p{Script=Latin}/u.test(word);
    const hasGreek = /\p{Script=Greek}/u.test(word);
    const hasCyrillic = /\p{Script=Cyrillic}/u.test(word);
    if (
      hasCyrillic ||
      Number(hasLatin) + Number(hasGreek) + Number(hasCyrillic) > 1
    ) {
      throw new Error("Draft contains a mixed-script or Cyrillic token");
    }
  }
}

function maximalTokenMatches(
  outputTokens: readonly string[],
  sourceTokens: readonly string[],
  minimumLength = MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS,
): TokenMatch[] {
  const sourcePositions = new Map<string, number[]>();
  for (let index = 0; index < sourceTokens.length; index++) {
    const token = sourceTokens[index];
    const positions = sourcePositions.get(token) ?? [];
    positions.push(index);
    sourcePositions.set(token, positions);
  }

  const matches: TokenMatch[] = [];
  for (let outputStart = 0; outputStart < outputTokens.length; outputStart++) {
    const positions = sourcePositions.get(outputTokens[outputStart]) ?? [];
    for (const sourceStart of positions) {
      if (
        outputStart > 0 &&
        sourceStart > 0 &&
        outputTokens[outputStart - 1] === sourceTokens[sourceStart - 1]
      ) {
        continue;
      }
      let length = 0;
      while (
        outputStart + length < outputTokens.length &&
        sourceStart + length < sourceTokens.length &&
        outputTokens[outputStart + length] === sourceTokens[sourceStart + length]
      ) {
        length++;
      }
      if (length >= minimumLength) {
        matches.push({ outputStart, sourceStart, length });
      }
    }
  }
  return matches.sort(
    (left, right) =>
      left.outputStart - right.outputStart ||
      left.sourceStart - right.sourceStart ||
      right.length - left.length,
  );
}

function matchCharacterCount(tokens: readonly string[], match: TokenMatch): number {
  return tokens
    .slice(match.outputStart, match.outputStart + match.length)
    .join(" ").length;
}

function directFindingCode(
  match: TokenMatch,
  characterCount: number,
): MarkSprintEsvOverlapFindingCode | null {
  if (match.length >= MARK_SPRINT_ESV_OVERLAP_BLOCK_TOKENS) {
    return "EXACT_8_PLUS";
  }
  if (match.length >= MARK_SPRINT_ESV_OVERLAP_REVIEW_TOKENS) {
    return "EXACT_5_TO_7";
  }
  if (
    match.length === MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS &&
    characterCount >= MARK_SPRINT_ESV_OVERLAP_LONG_FOUR_CHARS
  ) {
    return "LONG_EXACT_FOUR";
  }
  return null;
}

/**
 * Combined-evidence escalation (issue #17): a single short overlap in a field
 * is an unavoidable-phrase diagnostic, but TWO OR MORE non-overlapping short
 * spans from the same passage in the same field, together reaching the block
 * budget, is copying assembled from pieces — those findings become blockers.
 */
function escalateCombinedReviewFindings(
  findings: MarkSprintEsvOverlapFinding[],
): void {
  const review = findings
    .filter((finding) => finding.severity === "review")
    .sort((left, right) => left.outputStartToken - right.outputStartToken);
  let combinedTokens = 0;
  let pieces = 0;
  let lastEnd = -1;
  for (const finding of review) {
    if (finding.outputStartToken < lastEnd) continue; // overlapping span
    combinedTokens += finding.tokenCount;
    pieces += 1;
    lastEnd = finding.outputEndToken;
  }
  if (
    pieces >= 2 &&
    combinedTokens >= MARK_SPRINT_ESV_OVERLAP_REVIEW_ESCALATION_TOKENS
  ) {
    for (const finding of review) finding.severity = "block";
  }
}

function mosaicMatch(
  matches: readonly TokenMatch[],
  outputTokens: readonly string[],
): ReportMatch | null {
  for (let start = 0; start < matches.length; start++) {
    const first = matches[start];
    let last = first;
    let total = first.length;
    let characterCount = matchCharacterCount(outputTokens, first);
    let pieces = 1;
    for (let index = start + 1; index < matches.length; index++) {
      const next = matches[index];
      const outputGap = next.outputStart - (last.outputStart + last.length);
      const sourceGap = next.sourceStart - (last.sourceStart + last.length);
      if (
        outputGap < 0 ||
        sourceGap < 0 ||
        outputGap > MOSAIC_MAXIMUM_OUTPUT_GAP ||
        sourceGap > MOSAIC_MAXIMUM_SOURCE_GAP
      ) {
        continue;
      }
      total += next.length;
      characterCount += matchCharacterCount(outputTokens, next);
      pieces++;
      last = next;
      if (pieces >= 2 && total >= MOSAIC_MINIMUM_TOKENS) {
        return {
          outputStart: first.outputStart,
          outputEnd: last.outputStart + last.length,
          sourceStart: first.sourceStart,
          sourceEnd: last.sourceStart + last.length,
          tokenCount: total,
          characterCount,
        };
      }
    }
  }
  return null;
}

function crossFieldCoverageMatch(
  leaves: readonly StringLeaf[],
  sourceTokens: readonly string[],
): ReportMatch | null {
  const outputTokensByLeaf = leaves.map((leaf) => overlapTokens(leaf.value));
  const sourceBigramPositions = new Map<string, number[]>();
  for (let sourceStart = 0; sourceStart + 1 < sourceTokens.length; sourceStart++) {
    // Bigrams made purely of function words ("of the", "and he") appear in any
    // faithful English prose; they cannot seed a cross-field component.
    if (
      !isContentToken(sourceTokens[sourceStart]) &&
      !isContentToken(sourceTokens[sourceStart + 1])
    ) {
      continue;
    }
    const key = `${sourceTokens[sourceStart]}\u0000${sourceTokens[sourceStart + 1]}`;
    const positions = sourceBigramPositions.get(key) ?? [];
    positions.push(sourceStart);
    sourceBigramPositions.set(key, positions);
  }
  const pieces: Array<{
    leafIndex: number;
    outputStart: number;
    sourceStart: number;
    sourceEnd: number;
  }> = [];
  for (let leafIndex = 0; leafIndex < outputTokensByLeaf.length; leafIndex++) {
    const outputTokens = outputTokensByLeaf[leafIndex];
    if (outputTokens.length < CROSS_FIELD_CANDIDATE_TOKENS) continue;
    for (let outputStart = 0; outputStart + 1 < outputTokens.length; outputStart++) {
      const key = `${outputTokens[outputStart]}\u0000${outputTokens[outputStart + 1]}`;
      for (const sourceStart of sourceBigramPositions.get(key) ?? []) {
        pieces.push({
          leafIndex,
          outputStart,
          sourceStart,
          sourceEnd: sourceStart + CROSS_FIELD_CANDIDATE_TOKENS,
        });
      }
    }
  }
  pieces.sort(
    (left, right) =>
      left.sourceStart - right.sourceStart ||
      right.sourceEnd - left.sourceEnd ||
      left.leafIndex - right.leafIndex ||
      left.outputStart - right.outputStart,
  );

  let component: typeof pieces = [];
  let componentEnd = -1;
  const evaluateComponent = (): ReportMatch | null => {
    if (!component.length) return null;
    // Calibration (issue #17): split copying TILES a source sentence — its
    // pieces jointly cover a CONTIGUOUS run of distinct source positions.
    // Reusing one short phrase in several fields ("the villages of Caesarea
    // Philippi") covers the same few source tokens repeatedly and never forms
    // a long contiguous run, so it can no longer accumulate into a block.
    const coveredSource = new Map<number, Set<number>>(); // source index -> fields
    for (const piece of component) {
      for (
        let offset = 0;
        offset < CROSS_FIELD_CANDIDATE_TOKENS;
        offset++
      ) {
        const sourceIndex = piece.sourceStart + offset;
        const fields = coveredSource.get(sourceIndex) ?? new Set<number>();
        fields.add(piece.leafIndex);
        coveredSource.set(sourceIndex, fields);
      }
    }
    const coveredIndices = [...coveredSource.keys()].sort(
      (left, right) => left - right,
    );
    let runStart = 0;
    for (let index = 0; index <= coveredIndices.length; index++) {
      const runEnded =
        index === coveredIndices.length ||
        (index > 0 && coveredIndices[index] !== coveredIndices[index - 1] + 1);
      if (!runEnded) continue;
      const run = coveredIndices.slice(runStart, index);
      runStart = index;
      if (run.length < CROSS_FIELD_MINIMUM_TOKENS) continue;
      const runFields = new Set<number>();
      let contentTokens = 0;
      for (const sourceIndex of run) {
        for (const field of coveredSource.get(sourceIndex)!) {
          runFields.add(field);
        }
        if (isContentToken(sourceTokens[sourceIndex])) contentTokens += 1;
      }
      if (
        runFields.size < 2 ||
        contentTokens < MARK_SPRINT_ESV_OVERLAP_CROSS_FIELD_CONTENT_TOKENS
      ) {
        continue;
      }
      return {
        // This is a deliberately path-agnostic cross-field summary. The report
        // never persists raw property names or source/output excerpts.
        outputStart: 0,
        outputEnd: run.length,
        sourceStart: run[0],
        sourceEnd: run[run.length - 1] + 1,
        tokenCount: run.length,
        characterCount: run
          .map((sourceIndex) => sourceTokens[sourceIndex])
          .join(" ").length,
      };
    }
    return null;
  };

  for (const piece of pieces) {
    if (
      component.length &&
      piece.sourceStart > componentEnd + MOSAIC_MAXIMUM_SOURCE_GAP
    ) {
      const match = evaluateComponent();
      if (match) return match;
      component = [];
      componentEnd = -1;
    }
    component.push(piece);
    componentEnd = Math.max(componentEnd, piece.sourceEnd);
  }
  return evaluateComponent();
}

/**
 * Default severity per code. EXACT_8_PLUS (meaningful contiguous copying),
 * MOSAIC_10_PLUS, and CROSS_FIELD_8_PLUS (deliberate split copying) block;
 * short single overlaps are review diagnostics unless escalated by combined
 * evidence in the same field.
 */
function defaultFindingSeverity(
  code: MarkSprintEsvOverlapFindingCode,
): MarkSprintEsvOverlapFindingSeverity {
  return code === "EXACT_5_TO_7" || code === "LONG_EXACT_FOUR"
    ? "review"
    : "block";
}

function overlapFinding(
  code: MarkSprintEsvOverlapFindingCode,
  leaf: StringLeaf,
  passage: PrivatePassage,
  match: ReportMatch,
): MarkSprintEsvOverlapFinding {
  return {
    code,
    severity: defaultFindingSeverity(code),
    outputPath: leaf.path,
    sourceRole: passage.role,
    sourceReference: passage.canonicalReference,
    outputStartToken: match.outputStart,
    outputEndToken: match.outputEnd,
    sourceStartToken: match.sourceStart,
    sourceEndToken: match.sourceEnd,
    tokenCount: match.tokenCount,
    characterCount: match.characterCount,
  };
}

/**
 * Low-level, evidence-only scanner used by synthetic verification and the v3
 * preflight wrapper. A caller-supplied manifestDigest does not authorize a run;
 * production v3 flow must use evaluateGenerationManifestV3Overlap instead.
 */
export function evaluateMarkSprintEsvOverlap(input: {
  bundle: MarkSprintEsvSourceBundle;
  rawDraftJson: string;
  manifestDigest: string;
}): MarkSprintEsvOverlapReport {
  assertMarkSprintEsvBundleIntegrity(input.bundle);
  if (!LOWERCASE_SHA256.test(input.manifestDigest)) {
    throw new Error("Overlap scan requires the exact manifest digest");
  }
  if (
    typeof input.rawDraftJson !== "string" ||
    new TextEncoder().encode(input.rawDraftJson).byteLength > MAX_DRAFT_BYTES
  ) {
    throw new Error("Draft JSON exceeds the overlap-scan size limit");
  }

  assertDuplicateFreeJson(input.rawDraftJson);
  let draft: unknown;
  try {
    draft = JSON.parse(input.rawDraftJson);
  } catch {
    throw new Error("Overlap scan requires valid draft JSON");
  }
  if (!isPlainRecord(draft)) {
    throw new Error("Overlap scan requires a JSON object draft");
  }
  const canonicalDraftDigest = sha256Canonical(draft);
  const leaves = collectStringLeaves(draft);
  for (const leaf of leaves) assertNoScriptConfusables(leaf.value);
  const privatePassages = PRIVATE_PASSAGES.get(input.bundle)!;
  const findings: MarkSprintEsvOverlapFinding[] = [];

  for (const leaf of leaves) {
    const outputTokenList = overlapTokens(leaf.value);
    if (
      outputTokenList.length < MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS
    ) {
      continue;
    }
    for (const passage of privatePassages) {
      const sourceTokenList = overlapTokens(passage.text);
      const matches = maximalTokenMatches(
        outputTokenList,
        sourceTokenList,
        MOSAIC_CANDIDATE_TOKENS,
      );
      const directMatches: MarkSprintEsvOverlapFinding[] = [];
      for (const match of matches) {
        const characterCount = matchCharacterCount(outputTokenList, match);
        const code = directFindingCode(match, characterCount);
        if (code) {
          directMatches.push(
            overlapFinding(code, leaf, passage, {
              outputStart: match.outputStart,
              outputEnd: match.outputStart + match.length,
              sourceStart: match.sourceStart,
              sourceEnd: match.sourceStart + match.length,
              tokenCount: match.length,
              characterCount,
            }),
          );
        }
      }
      // Combined-evidence escalation runs on the COMPLETE per-field/passage
      // set, before truncation, so split short spans cannot hide in the tail.
      escalateCombinedReviewFindings(directMatches);
      // Keep at most the three longest direct spans for one field/passage
      // (blockers first). The aggregate count still records every retained
      // finding without excerpts.
      findings.push(
        ...directMatches
          .sort(
            (left, right) =>
              Number(right.severity === "block") -
                Number(left.severity === "block") ||
              right.tokenCount - left.tokenCount ||
              left.outputStartToken - right.outputStartToken,
          )
          .slice(0, 3),
      );
      if (!directMatches.length) {
        // Mosaic accumulation only counts pieces carrying content vocabulary —
        // pure function-word fragments ("of the", "and he") cannot chain into
        // a false-positive block across ordinary faithful prose.
        const mosaic = mosaicMatch(
          matches.filter((match) =>
            matchHasContentToken(outputTokenList, match),
          ),
          outputTokenList,
        );
        if (mosaic) {
          findings.push(
            overlapFinding(
              "MOSAIC_10_PLUS",
              leaf,
              passage,
              mosaic,
            ),
          );
        }
      }
    }
  }

  // Independently cover source positions with matches from two or more fields.
  // Object-key order and long clean output gaps cannot hide split copying.
  const crossFieldLeaf: StringLeaf = { path: "/cross-field", value: "" };
  for (const passage of privatePassages) {
    const crossField = crossFieldCoverageMatch(
      leaves,
      overlapTokens(passage.text),
    );
    if (crossField) {
      findings.push(
        overlapFinding(
          "CROSS_FIELD_8_PLUS",
          crossFieldLeaf,
          passage,
          crossField,
        ),
      );
    }
  }

  // Blockers order before review diagnostics so truncation can never drop a
  // blocking finding while keeping a warning.
  const orderedFindings = findings.sort(
    (left, right) =>
      Number(right.severity === "block") - Number(left.severity === "block") ||
      left.outputPath.localeCompare(right.outputPath) ||
      left.sourceRole.localeCompare(right.sourceRole) ||
      left.outputStartToken - right.outputStartToken ||
      right.tokenCount - left.tokenCount,
  );
  const blockFindingCount = orderedFindings.filter(
    (finding) => finding.severity === "block",
  ).length;
  const reviewFindingCount = orderedFindings.length - blockFindingCount;
  const policy = buildMarkSprintManifestPolicy(input.bundle.slug);
  const reportWithoutDigest: Omit<
    MarkSprintEsvOverlapReport,
    "reportDigest"
  > = {
    reportVersion: "mark-sprint-esv-overlap-report-v3" as const,
    scannerRevision: MARK_SPRINT_ESV_OVERLAP_SCANNER_REVISION,
    normalizerRevision: MARK_SPRINT_ESV_OVERLAP_NORMALIZER_REVISION,
    slug: input.bundle.slug,
    manifestDigest: input.manifestDigest,
    sourcePolicyDigest: sha256Canonical(policy.requirements.source),
    sourceBundleDigest: input.bundle.bundleDigest,
    rawDraftDigest: sha256Text(input.rawDraftJson),
    canonicalDraftDigest,
    thresholds: {
      candidateTokens: MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS,
      reviewTokens: MARK_SPRINT_ESV_OVERLAP_REVIEW_TOKENS,
      blockTokens: MARK_SPRINT_ESV_OVERLAP_BLOCK_TOKENS,
      longFourCharacters: MARK_SPRINT_ESV_OVERLAP_LONG_FOUR_CHARS,
      mosaicCandidateTokens: MOSAIC_CANDIDATE_TOKENS,
      mosaicTokens: MOSAIC_MINIMUM_TOKENS,
      maximumSourceGapTokens: MOSAIC_MAXIMUM_SOURCE_GAP,
      maximumOutputGapTokens: MOSAIC_MAXIMUM_OUTPUT_GAP,
      crossFieldTokens: CROSS_FIELD_MINIMUM_TOKENS,
      crossFieldCandidateTokens: CROSS_FIELD_CANDIDATE_TOKENS,
      crossFieldContentTokens: MARK_SPRINT_ESV_OVERLAP_CROSS_FIELD_CONTENT_TOKENS,
      reviewEscalationTokens: MARK_SPRINT_ESV_OVERLAP_REVIEW_ESCALATION_TOKENS,
      functionWordCount: MARK_SPRINT_ESV_OVERLAP_FUNCTION_WORDS.length,
    },
    // Only BLOCK-severity findings stop a run. Review findings stay in the
    // report as safe diagnostics (structural path + counts, never excerpts).
    verdict: blockFindingCount ? ("block" as const) : ("pass" as const),
    findingCount: orderedFindings.length,
    blockFindingCount,
    reviewFindingCount,
    findingsTruncated: orderedFindings.length > MAX_REPORT_FINDINGS,
    findings: orderedFindings.slice(0, MAX_REPORT_FINDINGS),
  };
  return deepFreeze({
    ...reportWithoutDigest,
    reportDigest: sha256Canonical(reportWithoutDigest),
  });
}

/** Evidence integrity only; never generation or publishing authorization. */
export function assertMarkSprintEsvOverlapReportIntegrity(
  report: MarkSprintEsvOverlapReport,
  expected: {
    bundle: MarkSprintEsvSourceBundle;
    manifestDigest: string;
    rawDraftJson: string;
  },
): void {
  assertMarkSprintEsvBundleIntegrity(expected.bundle);
  let draft: unknown;
  try {
    draft = JSON.parse(expected.rawDraftJson);
  } catch {
    throw new Error("Overlap report binding requires valid draft JSON");
  }
  const policy = buildMarkSprintManifestPolicy(expected.bundle.slug);
  const expectedThresholds = {
    candidateTokens: MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS,
    reviewTokens: MARK_SPRINT_ESV_OVERLAP_REVIEW_TOKENS,
    blockTokens: MARK_SPRINT_ESV_OVERLAP_BLOCK_TOKENS,
    longFourCharacters: MARK_SPRINT_ESV_OVERLAP_LONG_FOUR_CHARS,
    mosaicCandidateTokens: MOSAIC_CANDIDATE_TOKENS,
    mosaicTokens: MOSAIC_MINIMUM_TOKENS,
    maximumSourceGapTokens: MOSAIC_MAXIMUM_SOURCE_GAP,
    maximumOutputGapTokens: MOSAIC_MAXIMUM_OUTPUT_GAP,
    crossFieldTokens: CROSS_FIELD_MINIMUM_TOKENS,
    crossFieldCandidateTokens: CROSS_FIELD_CANDIDATE_TOKENS,
    crossFieldContentTokens: MARK_SPRINT_ESV_OVERLAP_CROSS_FIELD_CONTENT_TOKENS,
    reviewEscalationTokens: MARK_SPRINT_ESV_OVERLAP_REVIEW_ESCALATION_TOKENS,
    functionWordCount: MARK_SPRINT_ESV_OVERLAP_FUNCTION_WORDS.length,
  };
  if (
    !isPlainRecord(report) ||
    !exactKeys(report, [
      "reportVersion",
      "scannerRevision",
      "normalizerRevision",
      "slug",
      "manifestDigest",
      "sourcePolicyDigest",
      "sourceBundleDigest",
      "rawDraftDigest",
      "canonicalDraftDigest",
      "thresholds",
      "verdict",
      "findingCount",
      "blockFindingCount",
      "reviewFindingCount",
      "findingsTruncated",
      "findings",
      "reportDigest",
    ]) ||
    report.reportVersion !== "mark-sprint-esv-overlap-report-v3" ||
    report.scannerRevision !== MARK_SPRINT_ESV_OVERLAP_SCANNER_REVISION ||
    report.normalizerRevision !== MARK_SPRINT_ESV_OVERLAP_NORMALIZER_REVISION ||
    report.slug !== expected.bundle.slug ||
    report.manifestDigest !== expected.manifestDigest ||
    report.sourcePolicyDigest !==
      sha256Canonical(policy.requirements.source) ||
    report.sourceBundleDigest !== expected.bundle.bundleDigest ||
    report.rawDraftDigest !== sha256Text(expected.rawDraftJson) ||
    report.canonicalDraftDigest !== sha256Canonical(draft) ||
    canonicalJson(report.thresholds) !== canonicalJson(expectedThresholds) ||
    report.verdict !== (report.blockFindingCount > 0 ? "block" : "pass") ||
    !Number.isSafeInteger(report.findingCount) ||
    !Number.isSafeInteger(report.blockFindingCount) ||
    !Number.isSafeInteger(report.reviewFindingCount) ||
    report.findingCount < 0 ||
    report.blockFindingCount < 0 ||
    report.reviewFindingCount < 0 ||
    report.blockFindingCount + report.reviewFindingCount !==
      report.findingCount ||
    !Array.isArray(report.findings) ||
    report.findings.length > MAX_REPORT_FINDINGS ||
    report.findingCount < report.findings.length ||
    // Blockers sort first, so an untruncated prefix must retain every blocker.
    report.findings.filter((finding) => finding.severity === "block").length !==
      Math.min(report.blockFindingCount, report.findings.length) ||
    report.findingsTruncated !==
      (report.findingCount > report.findings.length)
  ) {
    throw new Error("ESV overlap report binding is invalid");
  }

  const knownPassages = new Map(
    expected.bundle.passages.map((passage) => [
      `${passage.role}:${passage.canonicalReference}`,
      passage,
    ]),
  );
  for (const finding of report.findings) {
    if (
      !isPlainRecord(finding) ||
      !exactKeys(finding, [
        "code",
        "severity",
        "outputPath",
        "sourceRole",
        "sourceReference",
        "outputStartToken",
        "outputEndToken",
        "sourceStartToken",
        "sourceEndToken",
        "tokenCount",
        "characterCount",
      ]) ||
      !knownPassages.has(`${finding.sourceRole}:${finding.sourceReference}`) ||
      !finding.outputPath.startsWith("/") ||
      ![
        "EXACT_8_PLUS",
        "EXACT_5_TO_7",
        "LONG_EXACT_FOUR",
        "CROSS_FIELD_8_PLUS",
        "MOSAIC_10_PLUS",
      ].includes(finding.code) ||
      !["block", "review"].includes(finding.severity) ||
      // Codes with a fixed block severity can never be downgraded, and only
      // the short-overlap codes may carry review severity.
      (finding.severity === "review" &&
        finding.code !== "EXACT_5_TO_7" &&
        finding.code !== "LONG_EXACT_FOUR") ||
      ![
        finding.outputStartToken,
        finding.outputEndToken,
        finding.sourceStartToken,
        finding.sourceEndToken,
        finding.tokenCount,
        finding.characterCount,
      ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      finding.outputEndToken <= finding.outputStartToken ||
      finding.sourceEndToken <= finding.sourceStartToken ||
      finding.tokenCount < MARK_SPRINT_ESV_OVERLAP_CANDIDATE_TOKENS
    ) {
      throw new Error("ESV overlap report finding is invalid");
    }
  }

  const { reportDigest: _reportDigest, ...reportWithoutDigest } = report;
  if (report.reportDigest !== sha256Canonical(reportWithoutDigest)) {
    throw new Error("ESV overlap report digest is invalid");
  }
  const recomputed = evaluateMarkSprintEsvOverlap({
    bundle: expected.bundle,
    rawDraftJson: expected.rawDraftJson,
    manifestDigest: expected.manifestDigest,
  });
  if (canonicalJson(report) !== canonicalJson(recomputed)) {
    throw new Error("ESV overlap report does not match the derived verdict");
  }
}
