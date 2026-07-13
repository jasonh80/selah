import assert from "node:assert/strict";
import {
  GENERATION_MANIFEST_V3,
  GENERATION_MODEL_API_SURFACE_V3,
  GENERATION_MODEL_PROVIDER_V3,
  assertGenerationManifestV3OverlapAcceptanceCapability,
  assertGenerationManifestV3OverlapReportIntegrity,
  assertGenerationManifestV3PreflightCapability,
  assertGenerationManifestV3Ready,
  createGenerationManifestV3PreflightCapability,
  createGenerationManifestV3OverlapAcceptanceCapability,
  evaluateGenerationManifestV3,
  evaluateGenerationManifestV3Overlap,
  prepareGenerationModelRequestV3,
  type GenerationManifestV3PreparationInput,
  type GenerationManifestV3Requirements,
  type GenerationModelRequestV3,
} from "../lib/server/generation-manifest-v3";
import {
  loadMarkSprintEsvSourceBundle,
  type MarkSprintEsvSourceBundle,
} from "../lib/server/mark-sprint-esv-source";
import {
  MARK_SPRINT_ESV_REQUEST_OPTIONS,
  expectedMarkChapterVerseIdPair,
  expectedMarkChapterVerseMarkers,
} from "../lib/server/mark-sprint-esv-contract";
import {
  canonicalJson,
  sha256Canonical,
  sha256Text,
} from "../lib/server/generation-manifest";
import { CHAPTER_WORKUP_PROMPT_REVISION } from "../lib/ai/prompts/chapter-workup-prompt";
import {
  LIBRARY_CONTENT_DIGEST,
  LIBRARY_MANIFEST_DIGEST,
  LIBRARY_VERSION,
} from "../lib/server/selah-brain-library";

const SYNTHETIC_KEY = "PRIVATE V3 SYNTHETIC API KEY";
const SOURCE_PHRASE =
  "PRIVATE V3 SOURCE cedar amber lantern mercy river witness never serialize";
const PRIVATE_RULE = "PRIVATE V3 RULE keep the synthetic test fail closed";
const PRIVATE_NOTE = "PRIVATE V3 NOTE a chapter-specific synthetic constraint";
const PRIVATE_EXAMPLE = "PRIVATE V3 EXAMPLE wise warm synthetic voice";
const PRIVATE_GUIDANCE_ARTIFACT = "PRIVATE V3 GUIDANCE ARTIFACT";
const V2_GOLDEN_DIGEST =
  "b5918e7a779be7f8b5890f7c89594451e9cd2fb5a83d859c2d3ed8fc3d1c36f3";

function chapterFromReference(reference: string): number {
  const match = /^Mark (\d+)$/.exec(reference);
  assert.ok(match);
  return Number(match[1]);
}

function syntheticText(reference: string, variant: string): string {
  const markers = expectedMarkChapterVerseMarkers(reference);
  assert.ok(markers);
  const chapter = chapterFromReference(reference);
  return markers
    .map((verse) =>
      verse === 1
        ? `[1] ${SOURCE_PHRASE} chapter ${chapter} variant ${variant}.`
        : `[${verse}] synthetic complete chapter content carries enough distinct words for validation chapter ${chapter} verse ${verse} variant ${variant}.`,
    )
    .join("\n\n");
}

function syntheticPayload(reference: string, variant: string, metadata: string) {
  const pair = expectedMarkChapterVerseIdPair(reference);
  assert.ok(pair);
  return {
    query: reference,
    canonical: reference,
    parsed: [[...pair]],
    passage_meta: [
      {
        canonical: reference,
        chapter_start: [...pair],
        chapter_end: [...pair],
        synthetic_metadata: metadata,
      },
    ],
    passages: [syntheticText(reference, variant)],
  };
}

function syntheticFetcher(variant: string, metadata = "base") {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input));
    const reference = url.searchParams.get("q");
    assert.ok(reference);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Token ${SYNTHETIC_KEY}`);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    for (const [key, value] of Object.entries(MARK_SPRINT_ESV_REQUEST_OPTIONS)) {
      assert.equal(url.searchParams.get(key), String(value));
    }
    return new Response(
      JSON.stringify(syntheticPayload(reference, variant, metadata)),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

async function bundle(
  slug: "mark-8" | "mark-9",
  variant: string,
  metadata = "base",
): Promise<MarkSprintEsvSourceBundle> {
  return loadMarkSprintEsvSourceBundle({
    slug,
    apiKey: SYNTHETIC_KEY,
    fetchImpl: syntheticFetcher(variant, metadata),
  });
}

function fixtureInput(
  sourceBundle: MarkSprintEsvSourceBundle,
): GenerationManifestV3PreparationInput {
  const chapter = Number(sourceBundle.slug.split("-")[1]) as 8 | 9 | 10 | 11;
  return {
    bundle: sourceBundle,
    subject: {
      slug: sourceBundle.slug,
      book: "Mark",
      chapter,
      readerVersion: "ESV",
    },
    model: {
      id: "gpt-5.5",
      reasoningEffort: "low",
      maxCompletionTokens: 12_000,
    },
    brain: {
      libraryVersion: LIBRARY_VERSION,
      approved: true,
      liveMatched: true,
      rules: [
        { id: "SB-SYN-1", text: PRIVATE_RULE },
        { id: "SB-SYN-2", text: `${PRIVATE_RULE} second` },
      ],
    },
    guidance: {
      packetId: "synthetic-mark-packet",
      version: "synthetic-v1",
      artifact: {
        label: PRIVATE_GUIDANCE_ARTIFACT,
        scope: sourceBundle.slug,
      },
      approved: true,
      notes: [
        {
          id: "M-SYN-1",
          storedRowId: "row-synthetic-1",
          text: PRIVATE_NOTE,
        },
      ],
    },
    example: {
      id: "example-synthetic-mark",
      title: "Synthetic Mark Example",
      genre: "gospel narrative",
      exampleType: "voice",
      active: true,
      content: PRIVATE_EXAMPLE,
    },
  };
}

function requirementsFrom(
  input: GenerationManifestV3PreparationInput,
  approvedManifestDigest: string | null = null,
): GenerationManifestV3Requirements {
  return {
    artifact: "chapter_workup",
    stage: "copy_generation",
    subject: { ...input.subject },
    model: { ...input.model },
    promptRevision: CHAPTER_WORKUP_PROMPT_REVISION,
    brain: {
      libraryVersion: input.brain.libraryVersion,
      approvalContentDigest: LIBRARY_CONTENT_DIGEST,
      manifestArtifactDigest: LIBRARY_MANIFEST_DIGEST,
      rules: input.brain.rules.map((rule) => ({
        id: rule.id,
        digest: sha256Text(rule.text),
      })),
    },
    guidance: {
      packetId: input.guidance.packetId,
      version: input.guidance.version,
      digest: sha256Canonical(input.guidance.artifact),
      notes: input.guidance.notes.map((note) => ({
        id: note.id,
        storedRowId: note.storedRowId,
        digest: sha256Text(note.text),
      })),
    },
    example: {
      id: input.example.id,
      title: input.example.title,
      genre: input.example.genre,
      exampleType: input.example.exampleType,
      contentDigest: sha256Text(input.example.content),
    },
    approvedManifestDigest,
  };
}

function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  return (
    Object.isFrozen(value) &&
    Object.values(value as Record<string, unknown>).every(isDeepFrozen)
  );
}

function cloneRequest(request: GenerationModelRequestV3): GenerationModelRequestV3 {
  return structuredClone(request) as GenerationModelRequestV3;
}

async function main(): Promise<void> {
  const bundleA = await bundle("mark-8", "A");
  const bundleB = await bundle("mark-8", "B");
  const bundleMetadata = await bundle("mark-8", "A", "metadata-changed");
  const bundleMark9 = await bundle("mark-9", "A");
  const inputA = fixtureInput(bundleA);
  const requestA = prepareGenerationModelRequestV3(inputA);
  const requirements = requirementsFrom(inputA);

  assert.ok(isDeepFrozen(requestA), "the exact SDK request must be deeply frozen");
  assert.match(requestA.messages[1].content, /SERVER-SUPPLIED GENERATION SOURCE/u);
  assert.match(requestA.messages[1].content, /PRIVATE V3 SOURCE/u);
  assert.match(requestA.messages[1].content, /PRIVATE V3 RULE/u);
  assert.match(requestA.messages[1].content, /PRIVATE V3 NOTE/u);
  assert.match(requestA.messages[1].content, /PRIVATE V3 EXAMPLE/u);
  assert.equal(requestA.store, false);

  const preview = evaluateGenerationManifestV3(requirements, {
    sourceBundle: bundleA,
    modelRequest: requestA,
  });
  assert.equal(preview.ready, false);
  assert.deepEqual(preview.findings.map((finding) => finding.code), [
    "MANIFEST_APPROVAL_MISSING",
  ]);
  assert.ok(preview.manifest);
  assert.equal(preview.manifest.manifestVersion, GENERATION_MANIFEST_V3);
  assert.equal(
    canonicalJson(preview.manifest.source),
    canonicalJson(bundleA),
    "v3 must preserve the exact existing safe source projection",
  );
  assert.equal(
    preview.manifest.modelRequest.digest,
    sha256Canonical(requestA),
    "request digest must be derived from the exact frozen SDK body",
  );
  assert.throws(() =>
    assertGenerationManifestV3Ready(preview, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }),
  );

  const approved = requirementsFrom(inputA, preview.manifestDigest);
  const green = evaluateGenerationManifestV3(approved, {
    sourceBundle: bundleA,
    modelRequest: requestA,
  });
  assert.equal(green.ready, true);
  assert.deepEqual(green.findings, []);
  assertGenerationManifestV3Ready(green, {
    sourceBundle: bundleA,
    modelRequest: requestA,
  });
  assert.ok(isDeepFrozen(green));
  assert.equal(green.manifest.modelRequest.provider, GENERATION_MODEL_PROVIDER_V3);
  assert.equal(
    green.manifest.modelRequest.apiSurface,
    GENERATION_MODEL_API_SURFACE_V3,
  );
  assert.equal(green.manifest.modelRequest.store, false);
  assert.equal(green.manifest.brain.libraryVersion, LIBRARY_VERSION);
  assert.equal(
    green.manifest.brain.approvalContentDigest,
    LIBRARY_CONTENT_DIGEST,
  );
  assert.equal(
    green.manifest.brain.manifestArtifactDigest,
    LIBRARY_MANIFEST_DIGEST,
  );
  assert.equal(
    green.manifest.modelRequest.retentionStatement,
    "store_false_requested_provider_retention_policy_still_applies",
  );
  assert.equal(green.manifest.source.schemaVersion, "mark-sprint-esv-source-bundle-v2");
  assert.equal(
    evaluateGenerationManifestV3(approved, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }).manifestDigest,
    green.manifestDigest,
  );

  const serialized = JSON.stringify(green);
  for (const privateValue of [
    SYNTHETIC_KEY,
    SOURCE_PHRASE,
    PRIVATE_RULE,
    PRIVATE_NOTE,
    PRIVATE_EXAMPLE,
    PRIVATE_GUIDANCE_ARTIFACT,
    requestA.messages[0].content,
  ]) {
    assert.ok(!serialized.includes(privateValue), `manifest leaked ${privateValue}`);
  }
  assert.doesNotMatch(serialized, /"text"\s*:/u);
  assert.doesNotMatch(serialized, /"content"\s*:/u);

  const preflight = createGenerationManifestV3PreflightCapability(green, {
    sourceBundle: bundleA,
    modelRequest: requestA,
  });
  assert.doesNotThrow(() =>
    assertGenerationManifestV3PreflightCapability(preflight, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(preflight)), {
    manifestDigest: green.manifestDigest,
  });
  const cleanDraft = JSON.stringify({
    summary: "A wholly distinct synthetic explanation for overlap verification.",
  });
  const overlapReport = evaluateGenerationManifestV3Overlap(
    preflight,
    { sourceBundle: bundleA, modelRequest: requestA },
    cleanDraft,
  );
  assert.equal(overlapReport.reportVersion, "mark-sprint-esv-overlap-report-v2");
  assert.equal(overlapReport.manifestDigest, green.manifestDigest);
  assert.equal(overlapReport.verdict, "pass");
  assert.doesNotThrow(() =>
    assertGenerationManifestV3OverlapReportIntegrity(
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      overlapReport,
      cleanDraft,
    ),
  );
  const overlapAcceptance =
    createGenerationManifestV3OverlapAcceptanceCapability(
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      overlapReport,
      cleanDraft,
    );
  assert.doesNotThrow(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      overlapAcceptance,
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      cleanDraft,
    ),
  );
  // Acceptance is reusable exact-draft evidence, not a one-use run, persist,
  // or publish authorization. The future mutation boundary needs a separate
  // owner-issued capability with atomic nonce consumption.
  assert.doesNotThrow(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      overlapAcceptance,
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      cleanDraft,
    ),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(overlapAcceptance)), {
    manifestDigest: green.manifestDigest,
    reportDigest: overlapReport.reportDigest,
  });
  const blockDraft = JSON.stringify({
    summary: "cedar amber lantern mercy river witness never serialize",
  });
  const blockReport = evaluateGenerationManifestV3Overlap(
    preflight,
    { sourceBundle: bundleA, modelRequest: requestA },
    blockDraft,
  );
  assert.equal(blockReport.verdict, "block");
  assert.ok(blockReport.findingCount > 0);
  assert.doesNotThrow(() =>
    assertGenerationManifestV3OverlapReportIntegrity(
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      blockReport,
      blockDraft,
    ),
  );
  assert.throws(() =>
    createGenerationManifestV3OverlapAcceptanceCapability(
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      blockReport,
      blockDraft,
    ),
  );
  const reformattedCleanDraft = `{\n  "summary": "A wholly distinct synthetic explanation for overlap verification."\n}`;
  assert.equal(
    sha256Canonical(JSON.parse(reformattedCleanDraft)),
    overlapReport.canonicalDraftDigest,
  );
  assert.notEqual(sha256Text(reformattedCleanDraft), overlapReport.rawDraftDigest);
  assert.throws(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      overlapAcceptance,
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      reformattedCleanDraft,
    ),
  );
  assert.throws(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      overlapAcceptance,
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      JSON.stringify({ summary: "different safe draft" }),
    ),
  );

  // Result and preflight authority are identity-bearing. Safe serialization is
  // useful evidence but cannot be replayed as a capability.
  const clonedGreen = structuredClone(green);
  assert.throws(() =>
    assertGenerationManifestV3Ready(clonedGreen, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }),
  );
  const forgedGreen = {
    ready: true,
    manifest: green.manifest,
    manifestDigest: green.manifestDigest,
    findings: [],
  };
  assert.throws(() =>
    assertGenerationManifestV3Ready(forgedGreen, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }),
  );
  const clonedPreflight = structuredClone(preflight);
  assert.throws(() =>
    assertGenerationManifestV3PreflightCapability(clonedPreflight, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }),
  );
  assert.throws(() =>
    evaluateGenerationManifestV3Overlap(
      clonedPreflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      cleanDraft,
    ),
  );
  const forgedPreflight = { manifestDigest: green.manifestDigest };
  assert.throws(() =>
    assertGenerationManifestV3PreflightCapability(forgedPreflight, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    }),
  );
  const clonedOverlapAcceptance = structuredClone(overlapAcceptance);
  assert.throws(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      clonedOverlapAcceptance,
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      cleanDraft,
    ),
  );
  const forgedOverlapAcceptance = {
    manifestDigest: overlapAcceptance.manifestDigest,
    reportDigest: overlapAcceptance.reportDigest,
  };
  assert.throws(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      forgedOverlapAcceptance,
      preflight,
      { sourceBundle: bundleA, modelRequest: requestA },
      cleanDraft,
    ),
  );

  let mutationCases = 0;
  function expectRequirementBlocked(
    label: string,
    mutate: (copy: GenerationManifestV3Requirements) => void,
    code: string,
  ): void {
    mutationCases++;
    const copy = structuredClone(approved);
    mutate(copy);
    const result = evaluateGenerationManifestV3(copy, {
      sourceBundle: bundleA,
      modelRequest: requestA,
    });
    assert.equal(result.ready, false, `${label} unexpectedly passed`);
    assert.ok(
      result.findings.some((finding) => finding.code === code),
      `${label} did not report ${code}: ${result.findings
        .map((finding) => finding.code)
        .join(", ")}`,
    );
  }

  expectRequirementBlocked("artifact", (r) => {
    (r as unknown as { artifact: string }).artifact = "other";
  }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("stage", (r) => {
    (r as unknown as { stage: string }).stage = "other";
  }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("slug", (r) => { r.subject.slug = "mark-9"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("book", (r) => {
    (r.subject as unknown as { book: string }).book = "Matthew";
  }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("chapter", (r) => { r.subject.chapter = 9; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("reader version", (r) => {
    (r.subject as unknown as { readerVersion: string }).readerVersion = "Other";
  }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("model", (r) => { r.model.id = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("reasoning", (r) => {
    (r.model as unknown as { reasoningEffort: string }).reasoningEffort = "high";
  }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("token cap", (r) => { r.model.maxCompletionTokens--; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("prompt revision", (r) => { r.promptRevision = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("Brain version", (r) => { r.brain.libraryVersion = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("Brain approval digest", (r) => {
    r.brain.approvalContentDigest = "0".repeat(64);
  }, "DIGEST_MISMATCH");
  expectRequirementBlocked("Brain manifest digest", (r) => {
    r.brain.manifestArtifactDigest = "0".repeat(64);
  }, "DIGEST_MISMATCH");
  expectRequirementBlocked("rule id", (r) => { r.brain.rules[0].id = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("rule digest", (r) => { r.brain.rules[0].digest = "1".repeat(64); }, "DIGEST_MISMATCH");
  expectRequirementBlocked("rule order", (r) => { r.brain.rules.reverse(); }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("guidance packet", (r) => { r.guidance.packetId = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("guidance version", (r) => { r.guidance.version = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("guidance digest", (r) => { r.guidance.digest = "2".repeat(64); }, "DIGEST_MISMATCH");
  expectRequirementBlocked("note id", (r) => { r.guidance.notes[0].id = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("note row", (r) => { r.guidance.notes[0].storedRowId = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("note digest", (r) => { r.guidance.notes[0].digest = "3".repeat(64); }, "DIGEST_MISMATCH");
  expectRequirementBlocked("example id", (r) => { r.example.id = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("example title", (r) => { r.example.title = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("example genre", (r) => { r.example.genre = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("example type", (r) => { r.example.exampleType = "other"; }, "IDENTITY_MISMATCH");
  expectRequirementBlocked("example digest", (r) => { r.example.contentDigest = "4".repeat(64); }, "DIGEST_MISMATCH");
  expectRequirementBlocked("stale approval", (r) => { r.approvedManifestDigest = "f".repeat(64); }, "MANIFEST_APPROVAL_MISMATCH");
  expectRequirementBlocked("v2 approval cannot approve v3", (r) => {
    r.approvedManifestDigest = V2_GOLDEN_DIGEST;
  }, "MANIFEST_APPROVAL_MISMATCH");

  function preparedWith(
    mutate: (copy: GenerationManifestV3PreparationInput) => void,
  ): {
    input: GenerationManifestV3PreparationInput;
    request: GenerationModelRequestV3;
  } {
    const copy = fixtureInput(bundleA);
    mutate(copy);
    return { input: copy, request: prepareGenerationModelRequestV3(copy) };
  }
  function expectPreparedBlocked(
    label: string,
    mutate: (copy: GenerationManifestV3PreparationInput) => void,
    code: string,
  ): void {
    mutationCases++;
    const changed = preparedWith(mutate);
    const result = evaluateGenerationManifestV3(approved, {
      sourceBundle: changed.input.bundle,
      modelRequest: changed.request,
    });
    assert.equal(result.ready, false, `${label} unexpectedly passed`);
    assert.ok(result.findings.some((finding) => finding.code === code), label);
  }
  mutationCases++;
  assert.throws(
    () => preparedWith((i) => { i.brain.libraryVersion = "other-library"; }),
    /version-controlled artifact/u,
    "a different Brain library must be refused before request preparation",
  );
  expectPreparedBlocked("derived rule text", (i) => {
    i.brain.rules[0].text += " changed";
  }, "DIGEST_MISMATCH");
  expectPreparedBlocked("Brain approval", (i) => { i.brain.approved = false; }, "BRAIN_NOT_APPROVED");
  expectPreparedBlocked("Brain live match", (i) => { i.brain.liveMatched = false; }, "BRAIN_LIVE_MISMATCH");
  expectPreparedBlocked("derived guidance artifact", (i) => {
    i.guidance.artifact = { changed: true };
  }, "DIGEST_MISMATCH");
  expectPreparedBlocked("derived note text", (i) => {
    i.guidance.notes[0].text += " changed";
  }, "DIGEST_MISMATCH");
  expectPreparedBlocked("guidance approval", (i) => { i.guidance.approved = false; }, "GUIDANCE_NOT_APPROVED");
  expectPreparedBlocked("derived example content", (i) => {
    i.example.content += " changed";
  }, "DIGEST_MISMATCH");
  expectPreparedBlocked("example active", (i) => { i.example.active = false; }, "EXAMPLE_NOT_ACTIVE");
  expectPreparedBlocked("model request model", (i) => { i.model.id = "other-model"; }, "IDENTITY_MISMATCH");
  expectPreparedBlocked("model request token cap", (i) => {
    i.model.maxCompletionTokens = 11_999;
  }, "IDENTITY_MISMATCH");

  // A different source response changes the exact safe bundle and the exact
  // prompt/request digest. The previously approved candidate cannot pass.
  const requestB = prepareGenerationModelRequestV3(fixtureInput(bundleB));
  assert.throws(() =>
    assertGenerationManifestV3Ready(green, {
      sourceBundle: bundleB,
      modelRequest: requestB,
    }),
  );
  assert.throws(() =>
    assertGenerationManifestV3PreflightCapability(preflight, {
      sourceBundle: bundleB,
      modelRequest: requestB,
    }),
  );
  assert.throws(() =>
    evaluateGenerationManifestV3Overlap(
      preflight,
      { sourceBundle: bundleB, modelRequest: requestB },
      cleanDraft,
    ),
  );
  assert.throws(() =>
    assertGenerationManifestV3OverlapAcceptanceCapability(
      overlapAcceptance,
      preflight,
      { sourceBundle: bundleB, modelRequest: requestB },
      cleanDraft,
    ),
  );
  const changedSourceResult = evaluateGenerationManifestV3(approved, {
    sourceBundle: bundleB,
    modelRequest: requestB,
  });
  assert.equal(changedSourceResult.ready, false);
  assert.ok(changedSourceResult.findings.some((f) => f.code === "MANIFEST_APPROVAL_MISMATCH"));
  assert.notEqual(bundleB.bundleDigest, bundleA.bundleDigest);
  assert.notEqual(sha256Canonical(requestB), sha256Canonical(requestA));

  const requestMetadata = prepareGenerationModelRequestV3(fixtureInput(bundleMetadata));
  const metadataResult = evaluateGenerationManifestV3(approved, {
    sourceBundle: bundleMetadata,
    modelRequest: requestMetadata,
  });
  assert.equal(metadataResult.ready, false);
  assert.equal(bundleMetadata.passages[0].textDigest, bundleA.passages[0].textDigest);
  assert.notEqual(
    bundleMetadata.passages[0].responseMetadataDigest,
    bundleA.passages[0].responseMetadataDigest,
  );
  assert.notEqual(metadataResult.manifestDigest, green.manifestDigest);

  const crossBundle = evaluateGenerationManifestV3(approved, {
    sourceBundle: bundleB,
    modelRequest: requestA,
  });
  assert.equal(crossBundle.ready, false);
  assert.ok(crossBundle.findings.some((f) => f.code === "SOURCE_REQUEST_MISMATCH"));

  const mark9Input = fixtureInput(bundleMark9);
  const requestMark9 = prepareGenerationModelRequestV3(mark9Input);
  const crossSlug = evaluateGenerationManifestV3(approved, {
    sourceBundle: bundleMark9,
    modelRequest: requestMark9,
  });
  assert.equal(crossSlug.ready, false);
  assert.ok(crossSlug.findings.some((f) => f.code === "IDENTITY_MISMATCH"));

  // Any JSON clone loses both opaque source capability and prepared-request
  // identity. Mutating every new safe source field therefore fails closed.
  const sourceMutationPaths: ReadonlyArray<ReadonlyArray<string | number>> = [
    ["schemaVersion"],
    ["assemblerRevision"],
    ["normalizerRevision"],
    ["responseValidatorRevision"],
    ["slug"],
    ["source", "provider"],
    ["source", "name"],
    ["source", "version"],
    ["source", "editionEvidenceStatus"],
    ["source", "apiEndpoint"],
    ["source", "termsUrl"],
    ["source", "permissionsUrl"],
    ["source", "useBasis"],
    ["source", "publishedTermsAiAnalysisStatus"],
    ["source", "commercialUseAllowed"],
    ["source", "ownerDecisionId"],
    ["source", "ownerDecisionDigest"],
    ...Object.keys(MARK_SPRINT_ESV_REQUEST_OPTIONS).map((key) => [
      "requestOptions",
      key,
    ]),
    ["requestOptionsDigest"],
    ["passages", 0, "role"],
    ["passages", 0, "requestedReference"],
    ["passages", 0, "canonicalReference"],
    ["passages", 0, "textDigest"],
    ["passages", 0, "requestDigest"],
    ["passages", 0, "responseCanonicalDigest"],
    ["passages", 0, "responseMetadataDigest"],
    ["passages", 0, "chapterStartVerseId"],
    ["passages", 0, "chapterEndVerseId"],
    ["passages", 0, "verseMarkerCount"],
    ["bundleDigest"],
  ];
  for (const path of sourceMutationPaths) {
    mutationCases++;
    const clone = structuredClone(bundleA) as unknown as Record<string, unknown>;
    let target: unknown = clone;
    for (const segment of path.slice(0, -1)) {
      target = (target as Record<string | number, unknown>)[segment];
    }
    const last = path[path.length - 1];
    (target as Record<string | number, unknown>)[last] = "MUTATED";
    const result = evaluateGenerationManifestV3(approved, {
      sourceBundle: clone as unknown as MarkSprintEsvSourceBundle,
      modelRequest: requestA,
    });
    assert.equal(result.ready, false, `source mutation ${path.join(".")} passed`);
    assert.ok(result.findings.some((f) => f.code === "SOURCE_BUNDLE_INVALID"));
    assert.ok(!JSON.stringify(result).includes("MUTATED"));
  }

  const requestMutationPaths = [
    ["model"],
    ["messages", 0, "role"],
    ["messages", 0, "content"],
    ["messages", 1, "role"],
    ["messages", 1, "content"],
    ["response_format", "type"],
    ["max_completion_tokens"],
    ["reasoning_effort"],
    ["store"],
  ] as const;
  for (const path of requestMutationPaths) {
    mutationCases++;
    const clone = cloneRequest(requestA) as unknown as Record<string, unknown>;
    let target: unknown = clone;
    for (const segment of path.slice(0, -1)) {
      target = (target as Record<string | number, unknown>)[segment];
    }
    const last = path[path.length - 1];
    (target as Record<string | number, unknown>)[last] = "MUTATED";
    const result = evaluateGenerationManifestV3(approved, {
      sourceBundle: bundleA,
      modelRequest: clone as unknown as GenerationModelRequestV3,
    });
    assert.equal(result.ready, false, `request mutation ${path.join(".")} passed`);
    assert.ok(result.findings.some((f) => f.code === "MODEL_REQUEST_INVALID"));
    assert.ok(!JSON.stringify(result).includes("MUTATED"));
    assert.ok(!JSON.stringify(result).includes(SOURCE_PHRASE));
  }

  mutationCases++;
  const unknownRequirement = structuredClone(approved) as GenerationManifestV3Requirements &
    Record<string, unknown>;
  unknownRequirement.privateUnexpected = "PRIVATE UNKNOWN REQUIREMENT VALUE";
  const unknownResult = evaluateGenerationManifestV3(unknownRequirement, {
    sourceBundle: bundleA,
    modelRequest: requestA,
  });
  assert.equal(unknownResult.ready, false);
  assert.ok(unknownResult.findings.some((f) => f.code === "UNKNOWN_FIELD"));
  assert.ok(!JSON.stringify(unknownResult).includes("PRIVATE UNKNOWN REQUIREMENT VALUE"));

  mutationCases++;
  const unknownPreparation = fixtureInput(bundleA) as GenerationManifestV3PreparationInput &
    Record<string, unknown>;
  unknownPreparation.privateUnexpected = "PRIVATE UNKNOWN PREPARATION VALUE";
  assert.throws(
    () => prepareGenerationModelRequestV3(unknownPreparation),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!String(error).includes("PRIVATE UNKNOWN PREPARATION VALUE"));
      return true;
    },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        contract: GENERATION_MANIFEST_V3,
        syntheticGreenManifestDigest: green.manifestDigest,
        preservedV2GoldenDigest: V2_GOLDEN_DIGEST,
        mutationCases,
        runtimeConnected: false,
      },
      null,
      2,
    ),
  );
}

void main();
