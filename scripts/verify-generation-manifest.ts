import assert from "node:assert/strict";
import {
  assertGenerationManifestReady,
  canonicalJson,
  computeGenerationSourceBundleDigest,
  evaluateGenerationManifest,
  sha256Canonical,
  sha256Text,
  type GenerationManifestMaterialsV2,
  type GenerationManifestRequirementsV2,
  type GenerationSourcePassageIdentity,
} from "../lib/server/generation-manifest";
import {
  buildMarkSprintManifestPolicy,
  MARK_SPRINT_SLUGS,
} from "../lib/server/mark-sprint-manifest-policy";
import { MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST } from "../lib/server/mark-sprint-esv-contract";
import {
  assertGenericChapterGenerationAllowed,
  isProtectedMarkSprintGenerationIdentity,
} from "../lib/server/generate-chapter-workup";

const raw = {
  requestSystem: "PRIVATE SYSTEM MESSAGE\nDo not return me.",
  requestUser: "PRIVATE ASSEMBLED USER PROMPT\nDo not return me.",
  sourceBefore: "PRIVATE ESV CONTEXT-BEFORE SOURCE\nDo not return me.",
  sourcePrimary: "PRIVATE ESV PRIMARY SOURCE\nDo not return me.",
  sourceAfter: "PRIVATE ESV CONTEXT-AFTER SOURCE\nDo not return me.",
  example: "PRIVATE APPROVED EXAMPLE\nDo not return me.",
  ruleOne: "Private rule one text.",
  ruleTwo: "Private rule two text.",
  noteOne: "Private note one text.",
  noteTwo: "Private note two text.",
};
const ownerSourceDecision = {
  decisionId: "mark-sprint-esv-source-2026-07-12",
  decision: "use_esv_api_for_prompt_time_analysis",
  noncommercialOnly: true,
  modelTrainingAuthorized: false,
  formalAiAnalysisPermissionConfirmed: false,
};
const sourceRequestOptions = {
  endpoint: "passage/text",
  includePassageReferences: true,
  includeVerseNumbers: true,
  includeFootnotes: true,
  includeFootnoteBody: true,
  includeHeadings: true,
  includeShortCopyright: true,
};
const sourcePassages: GenerationSourcePassageIdentity[] = [
  {
    role: "context_before",
    requestedReference: "Mark 7",
    canonicalReference: "Mark 7",
    textDigest: sha256Text(raw.sourceBefore),
  },
  {
    role: "primary",
    requestedReference: "Mark 8",
    canonicalReference: "Mark 8",
    textDigest: sha256Text(raw.sourcePrimary),
  },
  {
    role: "context_after",
    requestedReference: "Mark 9",
    canonicalReference: "Mark 9",
    textDigest: sha256Text(raw.sourceAfter),
  },
];
const sourceIdentity = {
  provider: "Crossway",
  name: "English Standard Version",
  version: "ESV Text Edition: 2025",
  apiEndpoint: "https://api.esv.org/v3/passage/text/",
  termsUrl: "https://api.esv.org/",
  permissionsUrl: "https://www.crossway.org/permissions/",
  useBasis: "owner_direction_noncommercial_ministry_api_use",
  publishedTermsAiAnalysisStatus: "not_explicit_owner_accepts_uncertainty",
  commercialUseAllowed: false as const,
  ownerDecisionId: ownerSourceDecision.decisionId,
  ownerDecisionDigest: sha256Canonical(ownerSourceDecision),
  requestOptionsDigest: sha256Canonical(sourceRequestOptions),
  passages: sourcePassages,
};
const sourceBundleDigest = computeGenerationSourceBundleDigest(sourceIdentity);
const modelRequest = {
  model: "gpt-5.5",
  reasoning_effort: "low",
  max_completion_tokens: 12_000,
  messages: [
    { role: "system", content: raw.requestSystem },
    { role: "user", content: raw.requestUser },
  ],
  response_format: { type: "json_object" },
};

const requirements: GenerationManifestRequirementsV2 = {
  artifact: "chapter_workup",
  stage: "copy_generation",
  subject: {
    slug: "mark-8",
    book: "Mark",
    chapter: 8,
    readerVersion: "ESV",
  },
  model: { id: "gpt-5.5", reasoningEffort: "low" },
  prompt: {
    revision: "chapter-workup-json-v2",
    digest: sha256Canonical(modelRequest),
  },
  brain: {
    libraryVersion: "1.7",
    libraryDigest: sha256Canonical({ version: "1.7", rules: 2 }),
    rules: [
      { id: "SB-001", digest: sha256Text(raw.ruleOne) },
      { id: "SB-032", digest: sha256Text(raw.ruleTwo) },
    ],
  },
  guidance: {
    packetId: "mark-8-11-2026-07-v5",
    version: "1.4",
    digest: sha256Canonical({ packet: "v3", notes: 2 }),
    notes: [
      { id: "M8-01", storedRowId: "row-note-1", digest: sha256Text(raw.noteOne) },
      { id: "M8-02", storedRowId: "row-note-2", digest: sha256Text(raw.noteTwo) },
    ],
  },
  example: {
    id: "example-mark-6-voice",
    title: "Mark 6 Daily Rundown",
    genre: "gospel narrative",
    exampleType: "voice",
    contentDigest: sha256Text(raw.example),
  },
  source: {
    ...sourceIdentity,
    bundleDigest: sourceBundleDigest,
  },
  approvedManifestDigest: null,
};

const materials: GenerationManifestMaterialsV2 = {
  artifact: "chapter_workup",
  stage: "copy_generation",
  subject: { ...requirements.subject },
  model: { ...requirements.model },
  prompt: { ...requirements.prompt },
  brain: {
    libraryVersion: requirements.brain.libraryVersion,
    libraryDigest: requirements.brain.libraryDigest,
    approved: true,
    liveMatched: true,
    rules: requirements.brain.rules.map((rule) => ({ ...rule })),
  },
  guidance: {
    packetId: requirements.guidance.packetId,
    version: requirements.guidance.version,
    digest: requirements.guidance.digest,
    approved: true,
    notes: requirements.guidance.notes.map((note) => ({ ...note })),
  },
  examples: [{ ...requirements.example, active: true }],
  source: {
    ...requirements.source,
    ownerSelected: true,
    connected: true,
    contentPresent: true,
  },
};

const preview = evaluateGenerationManifest(requirements, materials);
assert.equal(preview.ready, false);
assert.deepEqual(preview.findings.map((finding) => finding.code), [
  "MANIFEST_APPROVAL_MISSING",
]);
assert.throws(() => assertGenerationManifestReady(preview));

const approvedRequirements: GenerationManifestRequirementsV2 = {
  ...requirements,
  approvedManifestDigest: preview.manifestDigest,
};
const green = evaluateGenerationManifest(approvedRequirements, materials);
assert.equal(green.ready, true);
assert.deepEqual(green.findings, []);
assertGenerationManifestReady(green);
assert.equal(
  evaluateGenerationManifest(approvedRequirements, materials).manifestDigest,
  green.manifestDigest,
  "same materials must produce the same manifest digest",
);

let mutationCases = 0;
function expectBlocked(
  label: string,
  mutate: (
    requirementCopy: GenerationManifestRequirementsV2,
    materialCopy: GenerationManifestMaterialsV2,
  ) => void,
  code: string,
): void {
  mutationCases++;
  const requirementCopy = structuredClone(approvedRequirements);
  const materialCopy = structuredClone(materials);
  mutate(requirementCopy, materialCopy);
  const result = evaluateGenerationManifest(requirementCopy, materialCopy);
  assert.equal(result.ready, false, `${label} unexpectedly passed`);
  assert.ok(
    result.findings.some((finding) => finding.code === code),
    `${label} did not report ${code}: ${result.findings.map((finding) => finding.code).join(", ")}`,
  );
}

expectBlocked("wrong slug", (_r, m) => { m.subject.slug = "mark-9"; }, "IDENTITY_MISMATCH");
expectBlocked("wrong model", (_r, m) => { m.model.id = "other-model"; }, "IDENTITY_MISMATCH");
expectBlocked("wrong reasoning", (_r, m) => { m.model.reasoningEffort = "high"; }, "IDENTITY_MISMATCH");
expectBlocked("wrong prompt revision", (_r, m) => { m.prompt.revision = "changed"; }, "IDENTITY_MISMATCH");
expectBlocked("changed model request", (_r, m) => {
  m.prompt.digest = sha256Canonical({ ...modelRequest, max_completion_tokens: 11_999 });
}, "DIGEST_MISMATCH");
expectBlocked("array-valued digest", (r, m) => {
  const coercesLikeDigest = ["a".repeat(64)];
  (r.prompt as unknown as Record<string, unknown>).digest = coercesLikeDigest;
  (m.prompt as unknown as Record<string, unknown>).digest = coercesLikeDigest;
}, "INVALID_DIGEST");
expectBlocked("Brain not approved", (_r, m) => { m.brain.approved = false; }, "BRAIN_NOT_APPROVED");
expectBlocked("Brain not live-matched", (_r, m) => { m.brain.liveMatched = false; }, "BRAIN_LIVE_MISMATCH");
expectBlocked("Brain string approval", (_r, m) => { (m.brain as unknown as Record<string, unknown>).approved = "false"; }, "BRAIN_NOT_APPROVED");
expectBlocked("Brain numeric live match", (_r, m) => { (m.brain as unknown as Record<string, unknown>).liveMatched = 1; }, "BRAIN_LIVE_MISMATCH");
expectBlocked("wrong Brain digest", (_r, m) => { m.brain.libraryDigest = "0".repeat(64); }, "DIGEST_MISMATCH");
expectBlocked("reordered rules", (_r, m) => { m.brain.rules.reverse(); }, "IDENTITY_MISMATCH");
expectBlocked("missing rule", (_r, m) => { m.brain.rules.pop(); }, "ORDERED_SET_SIZE_MISMATCH");
expectBlocked("extra rule", (_r, m) => { m.brain.rules.push({ id: "SB-999", digest: "1".repeat(64) }); }, "ORDERED_SET_SIZE_MISMATCH");
expectBlocked("duplicate rule", (_r, m) => { m.brain.rules[1] = { ...m.brain.rules[0] }; }, "DUPLICATE_MATERIAL");
expectBlocked("changed rule text", (_r, m) => { m.brain.rules[0].digest = sha256Text(`${raw.ruleOne}!`); }, "DIGEST_MISMATCH");
expectBlocked("guidance not approved", (_r, m) => { m.guidance.approved = false; }, "GUIDANCE_NOT_APPROVED");
expectBlocked("guidance null approval", (_r, m) => { (m.guidance as unknown as Record<string, unknown>).approved = null; }, "GUIDANCE_NOT_APPROVED");
expectBlocked("wrong guidance digest", (_r, m) => { m.guidance.digest = "2".repeat(64); }, "DIGEST_MISMATCH");
expectBlocked("reordered notes", (_r, m) => { m.guidance.notes.reverse(); }, "IDENTITY_MISMATCH");
expectBlocked("missing note", (_r, m) => { m.guidance.notes.pop(); }, "ORDERED_SET_SIZE_MISMATCH");
expectBlocked("changed note text", (_r, m) => { m.guidance.notes[0].digest = sha256Text(`${raw.noteOne}!`); }, "DIGEST_MISMATCH");
expectBlocked("wrong stored note", (_r, m) => { m.guidance.notes[0].storedRowId = "other-row"; }, "IDENTITY_MISMATCH");
expectBlocked("missing example", (_r, m) => { m.examples = []; }, "EXAMPLE_COUNT_MISMATCH");
expectBlocked("ambiguous examples", (_r, m) => { m.examples.push({ ...m.examples[0], id: "other" }); }, "EXAMPLE_COUNT_MISMATCH");
expectBlocked("inactive example", (_r, m) => { m.examples[0].active = false; }, "EXAMPLE_NOT_ACTIVE");
expectBlocked("example string active", (_r, m) => { (m.examples[0] as unknown as Record<string, unknown>).active = "true"; }, "EXAMPLE_NOT_ACTIVE");
expectBlocked("wrong example", (_r, m) => { m.examples[0].id = "other"; }, "IDENTITY_MISMATCH");
expectBlocked("changed example", (_r, m) => { m.examples[0].contentDigest = sha256Text(`${raw.example}!`); }, "DIGEST_MISMATCH");
expectBlocked("source not owner selected", (_r, m) => { m.source.ownerSelected = false; }, "SOURCE_NOT_OWNER_SELECTED");
expectBlocked("source unconnected", (_r, m) => { m.source.connected = false; }, "SOURCE_NOT_CONNECTED");
expectBlocked("source absent", (_r, m) => { m.source.contentPresent = false; }, "SOURCE_CONTENT_MISSING");
expectBlocked("source string owner-selected", (_r, m) => { (m.source as unknown as Record<string, unknown>).ownerSelected = "false"; }, "SOURCE_NOT_OWNER_SELECTED");
expectBlocked("source numeric connected", (_r, m) => { (m.source as unknown as Record<string, unknown>).connected = 1; }, "SOURCE_NOT_CONNECTED");
expectBlocked("source null content", (_r, m) => { (m.source as unknown as Record<string, unknown>).contentPresent = null; }, "SOURCE_CONTENT_MISSING");
expectBlocked("wrong source provider", (_r, m) => { m.source.provider = "Other"; }, "IDENTITY_MISMATCH");
expectBlocked("old OEB source identity", (_r, m) => {
  m.source.name = "Open English Bible";
  m.source.version = "2025.6";
  m.source.useBasis = "other";
}, "IDENTITY_MISMATCH");
expectBlocked("wrong ESV endpoint", (_r, m) => {
  m.source.apiEndpoint = "https://api.esv.org/v3/passage/html/";
}, "IDENTITY_MISMATCH");
expectBlocked("commercial ESV use", (r, m) => {
  (r.source as unknown as Record<string, unknown>).commercialUseAllowed = true;
  (m.source as unknown as Record<string, unknown>).commercialUseAllowed = true;
}, "SOURCE_COMMERCIAL_USE_FORBIDDEN");
expectBlocked("changed owner source decision", (_r, m) => {
  m.source.ownerDecisionDigest = sha256Canonical({ ...ownerSourceDecision, decision: "other" });
}, "DIGEST_MISMATCH");
expectBlocked("changed ESV request options", (_r, m) => {
  m.source.requestOptionsDigest = sha256Canonical({ ...sourceRequestOptions, includeFootnotes: false });
}, "DIGEST_MISMATCH");
expectBlocked("changed primary source text", (_r, m) => {
  m.source.passages[1].textDigest = sha256Text(`${raw.sourcePrimary}!`);
}, "DIGEST_MISMATCH");
expectBlocked("reordered source passages", (_r, m) => {
  m.source.passages.reverse();
}, "IDENTITY_MISMATCH");
expectBlocked("missing source passage", (_r, m) => {
  m.source.passages.pop();
}, "SOURCE_PASSAGE_SET_MISMATCH");
expectBlocked("duplicate source reference", (_r, m) => {
  m.source.passages[2] = { ...m.source.passages[0], role: "context_after" };
}, "SOURCE_PASSAGE_DUPLICATE");
expectBlocked("wrong primary canonical reference", (_r, m) => {
  m.source.passages[1].canonicalReference = "Mark 9";
}, "IDENTITY_MISMATCH");
expectBlocked("changed source bundle digest", (_r, m) => {
  m.source.bundleDigest = "0".repeat(64);
}, "DIGEST_MISMATCH");
expectBlocked("blank source bundle digest", (_r, m) => {
  m.source.bundleDigest = "";
}, "INVALID_DIGEST");
expectBlocked("blank matching identity", (r, m) => { r.model.id = ""; m.model.id = ""; }, "INVALID_IDENTITY");
expectBlocked("stale owner approval", (r) => { r.approvedManifestDigest = "f".repeat(64); }, "MANIFEST_APPROVAL_MISMATCH");

const sparseExamples = structuredClone(materials);
sparseExamples.examples = [];
sparseExamples.examples.length = 1;
assert.throws(
  () => evaluateGenerationManifest(approvedRequirements, sparseExamples),
  /sparse manifest array/,
);

const taintedMaterials = structuredClone(materials) as GenerationManifestMaterialsV2 &
  Record<string, unknown>;
taintedMaterials.rawTopLevel = "PRIVATE TOP-LEVEL WORDING";
Object.assign(taintedMaterials.prompt, { rawRequest: modelRequest });
Object.assign(taintedMaterials.brain.rules[0], { ruleText: raw.ruleOne });
Object.assign(taintedMaterials.guidance.notes[0], { noteText: raw.noteOne });
Object.assign(taintedMaterials.examples[0], { rawExample: raw.example });
Object.assign(taintedMaterials.source, { rawSource: raw.sourcePrimary, apiKey: "PRIVATE API KEY" });
const tainted = evaluateGenerationManifest(approvedRequirements, taintedMaterials);
assert.equal(tainted.ready, false);
assert.ok(tainted.findings.some((finding) => finding.code === "UNKNOWN_FIELD"));
const serializedTainted = JSON.stringify(tainted);
for (const protectedText of [
  "PRIVATE TOP-LEVEL WORDING",
  raw.requestSystem,
  raw.requestUser,
  raw.ruleOne,
  raw.noteOne,
  raw.example,
  raw.sourceBefore,
  raw.sourcePrimary,
  raw.sourceAfter,
  "PRIVATE API KEY",
]) {
  assert.ok(!serializedTainted.includes(protectedText), "tainted material leaked into manifest result");
}
const taintedRequirements = structuredClone(approvedRequirements) as
  GenerationManifestRequirementsV2 & Record<string, unknown>;
Object.assign(taintedRequirements.source, { licenseExpiry: "PRIVATE NEW REQUIREMENT" });
const taintedRequirementResult = evaluateGenerationManifest(taintedRequirements, materials);
assert.equal(taintedRequirementResult.ready, false);
assert.ok(taintedRequirementResult.findings.some((finding) => finding.code === "UNKNOWN_FIELD"));
assert.ok(!JSON.stringify(taintedRequirementResult).includes("PRIVATE NEW REQUIREMENT"));

assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Canonical({ a: 1, b: 2 }));
assert.equal(sha256Canonical({ text: "caf\u00e9" }), sha256Canonical({ text: "cafe\u0301" }));
const protoKey = JSON.parse('{"a":1,"__proto__":{"hidden":"BOUND"}}') as unknown;
assert.notEqual(canonicalJson(protoKey), canonicalJson({ a: 1 }));
assert.match(canonicalJson(protoKey), /__proto__/);
assert.notEqual(sha256Canonical(["a", "b"]), sha256Canonical(["b", "a"]));
assert.equal(sha256Text("\uFEFFcaf\u00e9\r\nline"), sha256Text("cafe\u0301\nline"));
assert.notEqual(sha256Text("text"), sha256Text("text "));
assert.throws(() => canonicalJson({ bad: Number.NaN }));
assert.throws(() => canonicalJson({ bad: undefined }));

const serializedResult = JSON.stringify(green);
for (const protectedText of Object.values(raw)) {
  assert.ok(!serializedResult.includes(protectedText), "manifest leaked protected text");
}

const policyBlockers: Record<string, string[]> = {};
for (const slug of MARK_SPRINT_SLUGS) {
  const policy = buildMarkSprintManifestPolicy(slug);
  assert.equal(policy.readyForGeneration, false, `${slug} must remain blocked today`);
  const codes = policy.blockers.map((blocker) => blocker.code);
  for (const code of [
    "guidance_not_approved",
    "brain_artifact_not_approved",
    "brain_live_match_missing",
    "source_not_connected",
    "source_passage_digests_missing",
    "source_digest_missing",
    "model_request_digest_missing",
    "chapter_note_row_ids_missing",
    "voice_example_id_missing",
    "voice_example_digest_missing",
    "owner_authorization_missing",
  ]) {
    assert.ok(codes.includes(code as never), `${slug} missing current-state blocker ${code}`);
  }
  assert.ok(
    !codes.includes("source_owner_selection_missing"),
    `${slug} lost the owner's ESV source selection`,
  );
  const chapter = Number(slug.split("-")[1]);
  assert.deepEqual(
    policy.requirements.source.expectedPassages.map((passage) => ({
      role: passage.role,
      requestedReference: passage.requestedReference,
      expectedCanonicalReference: passage.expectedCanonicalReference,
    })),
    [
      {
        role: "context_before",
        requestedReference: `Mark ${chapter - 1}`,
        expectedCanonicalReference: `Mark ${chapter - 1}`,
      },
      {
        role: "primary",
        requestedReference: `Mark ${chapter}`,
        expectedCanonicalReference: `Mark ${chapter}`,
      },
      {
        role: "context_after",
        requestedReference: `Mark ${chapter + 1}`,
        expectedCanonicalReference: `Mark ${chapter + 1}`,
      },
    ],
  );
  assert.equal(policy.requirements.source.name, "English Standard Version");
  assert.equal(policy.requirements.source.version, "ESV Text Edition: 2025");
  assert.equal(policy.requirements.source.commercialUseAllowed, false);
  assert.equal(policy.requirements.source.ownerSelectionStatus, "approved");
  assert.equal(policy.requirements.source.runtimeConnectionStatus, "not_connected");
  assert.equal(
    policy.requirements.source.expectedRequestOptionsDigest,
    MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST,
  );
  assert.equal(policy.requirements.source.readerAndGenerationSourcesAreDistinct, false);
  const serializedPolicy = JSON.stringify(policy);
  assert.ok(!serializedPolicy.includes("Preserve every movement"));
  assert.ok(!serializedPolicy.includes("Partial-to-clear sight"));
  assert.equal(policy.requirements.brain.requiredCoreRuleIds.length, 25);
  assert.equal(policy.requirements.brain.requiredContextualRuleIds.length, 12);
  assert.equal(policy.requirements.brain.requiredRules.length, 37);
  policyBlockers[slug] = codes;
}

assert.throws(
  () =>
    assertGenericChapterGenerationAllowed({
      slug: "mark-8",
      book: "Mark",
      chapter: 8,
    }),
  /protected ESV generation runner is not connected/,
  "generic generation must refuse the Mark sprint before OpenAI configuration or calls",
);
for (const protectedIdentity of [
  { slug: "mark-08", book: "Mark", chapter: 8 },
  { slug: "unexpected-slug", book: " mark ", chapter: 9 },
  { slug: "mark-10", book: "Other", chapter: 1 },
]) {
  assert.equal(
    isProtectedMarkSprintGenerationIdentity(protectedIdentity),
    true,
    `protected identity was not rejected before ordinary-flow mutation: ${JSON.stringify(protectedIdentity)}`,
  );
  assert.throws(
    () => assertGenericChapterGenerationAllowed(protectedIdentity),
    /protected ESV generation runner is not connected/,
    `generic generation accepted protected identity ${JSON.stringify(protectedIdentity)}`,
  );
}
assert.equal(
  isProtectedMarkSprintGenerationIdentity({ slug: "mark-0008" }),
  true,
  "zero-padded Mark sprint alias reached the ordinary flow",
);
assert.equal(
  isProtectedMarkSprintGenerationIdentity({ slug: "mark-7" }),
  false,
);
assert.doesNotThrow(() =>
  assertGenericChapterGenerationAllowed({
    slug: "mark-7",
    book: "Mark",
    chapter: 7,
  }),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: "generation-manifest-v2",
      syntheticGreenManifestDigest: green.manifestDigest,
      mutationCases,
      currentPolicyReady: false,
      policyBlockers,
    },
    null,
    2,
  ),
);
