// SERVER-ONLY. Pure preparation and preflight for the future protected Mark
// generation runner. This module performs no network, model, database, Studio,
// generation, or publishing work.
//
// V3 is deliberately separate from generation-manifest.ts. The v2 contract and
// its golden digest remain historical evidence and must never be reinterpreted.
import { CHAPTER_WORKUP_PROMPT_REVISION } from "@/lib/ai/prompts/chapter-workup-prompt";
import {
  assertMarkSprintEsvBundleIntegrity,
  assertMarkSprintEsvOverlapReportIntegrity,
  buildTransientMarkSprintPrompt,
  evaluateMarkSprintEsvOverlap,
  type MarkSprintEsvOverlapReport,
  type MarkSprintEsvSourceBundle,
} from "./mark-sprint-esv-source";
import {
  canonicalJson,
  sha256Canonical,
  sha256Text,
  type DigestIdentity,
  type ManifestFinding,
  type NoteDigestIdentity,
} from "./generation-manifest";
import type { MarkSprintSlug } from "./mark-sprint-manifest-policy";
import {
  LIBRARY_CONTENT_DIGEST,
  LIBRARY_MANIFEST_DIGEST,
  LIBRARY_VERSION,
  libraryContentDigestMatchesSnapshot,
  libraryManifestDigestMatchesSnapshot,
} from "./selah-brain-library";

if (typeof window !== "undefined") {
  throw new Error("Generation manifest v3 is server-only");
}

export const GENERATION_MANIFEST_V3 = "generation-manifest-v3" as const;
export const GENERATION_MODEL_REQUEST_V3 =
  "mark-sprint-chat-completions-request-v1" as const;
export const GENERATION_MODEL_PROVIDER_V3 = "openai" as const;
export const GENERATION_MODEL_API_SURFACE_V3 = "chat.completions" as const;

const SYSTEM_MESSAGE =
  "You output ONLY valid JSON matching the requested schema. No markdown, no code fences, no commentary. Do not include copyrighted Bible verse text.";
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;

export interface GenerationManifestV3Requirements {
  artifact: "chapter_workup";
  stage: "copy_generation";
  subject: {
    slug: MarkSprintSlug;
    book: "Mark";
    chapter: 8 | 9 | 10 | 11;
    readerVersion: "ESV";
  };
  model: {
    id: string;
    reasoningEffort: "low";
    maxCompletionTokens: number;
  };
  promptRevision: string;
  brain: {
    libraryVersion: string;
    approvalContentDigest: string;
    manifestArtifactDigest: string;
    rules: DigestIdentity[];
  };
  guidance: {
    packetId: string;
    version: string;
    digest: string;
    notes: NoteDigestIdentity[];
  };
  example: {
    id: string;
    title: string;
    genre: string;
    exampleType: string;
    contentDigest: string;
  };
  approvedManifestDigest: string | null;
}

export interface GenerationManifestV3PreparationInput {
  bundle: MarkSprintEsvSourceBundle;
  subject: GenerationManifestV3Requirements["subject"];
  model: GenerationManifestV3Requirements["model"];
  brain: {
    libraryVersion: string;
    approved: boolean;
    liveMatched: boolean;
    rules: Array<{ id: string; text: string }>;
  };
  guidance: {
    packetId: string;
    version: string;
    // Exact approved packet snapshot; the digest is derived here.
    artifact: unknown;
    approved: boolean;
    notes: Array<{ id: string; storedRowId: string; text: string }>;
  };
  example: {
    id: string;
    title: string;
    genre: string;
    exampleType: string;
    active: boolean;
    content: string;
  };
}

export interface GenerationModelRequestV3 {
  readonly model: string;
  readonly messages: readonly [
    { readonly role: "system"; readonly content: string },
    { readonly role: "user"; readonly content: string },
  ];
  readonly response_format: { readonly type: "json_object" };
  readonly max_completion_tokens: number;
  readonly reasoning_effort: "low";
  readonly store: false;
}

interface DerivedMaterialEvidence {
  subject: GenerationManifestV3Requirements["subject"];
  model: GenerationManifestV3Requirements["model"];
  promptRevision: string;
  brain: {
    libraryVersion: string;
    approvalContentDigest: string;
    manifestArtifactDigest: string;
    approved: boolean;
    liveMatched: boolean;
    rules: DigestIdentity[];
  };
  guidance: {
    packetId: string;
    version: string;
    digest: string;
    approved: boolean;
    notes: NoteDigestIdentity[];
  };
  example: {
    id: string;
    title: string;
    genre: string;
    exampleType: string;
    active: boolean;
    contentDigest: string;
  };
  requestDigest: string;
}

export interface GenerationManifestV3 {
  manifestVersion: typeof GENERATION_MANIFEST_V3;
  artifact: "chapter_workup";
  stage: "copy_generation";
  subject: GenerationManifestV3Requirements["subject"];
  model: GenerationManifestV3Requirements["model"];
  modelRequest: {
    schemaVersion: typeof GENERATION_MODEL_REQUEST_V3;
    provider: typeof GENERATION_MODEL_PROVIDER_V3;
    apiSurface: typeof GENERATION_MODEL_API_SURFACE_V3;
    promptRevision: string;
    digest: string;
    store: false;
    retentionStatement: "store_false_requested_provider_retention_policy_still_applies";
  };
  brain: DerivedMaterialEvidence["brain"];
  guidance: DerivedMaterialEvidence["guidance"];
  example: DerivedMaterialEvidence["example"];
  // This is the exact safe, enumerable MarkSprintEsvSourceBundle projection.
  // It contains evidence digests and request metadata, never source text.
  source: MarkSprintEsvSourceBundle;
}

export interface GenerationManifestV3Result {
  ready: boolean;
  manifest: GenerationManifestV3 | null;
  manifestDigest: string | null;
  findings: ManifestFinding[];
}

interface PreparedRequestBinding {
  bundle: MarkSprintEsvSourceBundle;
  evidence: DerivedMaterialEvidence;
}

interface GenuineReadyBinding {
  bundle: MarkSprintEsvSourceBundle;
  modelRequest: GenerationModelRequestV3;
  manifest: GenerationManifestV3;
  manifestDigest: string;
}

export interface GenerationManifestV3PreflightCapability {
  // Safe evidence only. Runtime authority comes from module-private object
  // identity, not from this serializable value.
  readonly manifestDigest: string;
}

export interface GenerationManifestV3OverlapAcceptanceCapability {
  readonly manifestDigest: string;
  readonly reportDigest: string;
}

interface PreflightCapabilityBinding extends GenuineReadyBinding {
  result: GenerationManifestV3Result;
}

interface OverlapAcceptanceBinding extends PreflightCapabilityBinding {
  preflight: GenerationManifestV3PreflightCapability;
  reportDigest: string;
  rawDraftDigest: string;
  canonicalDraftDigest: string;
}

const PREPARED_REQUESTS = new WeakMap<
  GenerationModelRequestV3,
  PreparedRequestBinding
>();
const GENUINE_READY_RESULTS = new WeakMap<
  GenerationManifestV3Result,
  GenuineReadyBinding
>();
const PREFLIGHT_CAPABILITIES = new WeakMap<
  GenerationManifestV3PreflightCapability,
  PreflightCapabilityBinding
>();
const OVERLAP_ACCEPTANCE_CAPABILITIES = new WeakMap<
  GenerationManifestV3OverlapAcceptanceCapability,
  OverlapAcceptanceBinding
>();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return (
    canonicalJson(Object.keys(value).sort()) ===
    canonicalJson([...expected].sort())
  );
}

function assertExactRecord(
  value: unknown,
  path: string,
  expected: readonly string[],
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value) || !exactKeys(value, expected)) {
    throw new Error(`${path} has an invalid shape`);
  }
}

function assertDenseArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) throw new Error(`${path} must be dense`);
  }
}

function nonempty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function duplicateIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size !== items.length;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

function cloneSafeSource(
  bundle: MarkSprintEsvSourceBundle,
): MarkSprintEsvSourceBundle {
  // assertMarkSprintEsvBundleIntegrity proves this exact enumerable shape is the
  // safe projection backed by the module-private source bytes.
  return JSON.parse(canonicalJson(bundle)) as MarkSprintEsvSourceBundle;
}

function assertPreparationInput(
  input: GenerationManifestV3PreparationInput,
): void {
  assertExactRecord(input, "preparation", [
    "bundle",
    "subject",
    "model",
    "brain",
    "guidance",
    "example",
  ]);
  assertExactRecord(input.subject, "preparation.subject", [
    "slug",
    "book",
    "chapter",
    "readerVersion",
  ]);
  assertExactRecord(input.model, "preparation.model", [
    "id",
    "reasoningEffort",
    "maxCompletionTokens",
  ]);
  assertExactRecord(input.brain, "preparation.brain", [
    "libraryVersion",
    "approved",
    "liveMatched",
    "rules",
  ]);
  assertDenseArray(input.brain.rules, "preparation.brain.rules");
  input.brain.rules.forEach((rule, index) =>
    assertExactRecord(rule, `preparation.brain.rules[${index}]`, ["id", "text"]),
  );
  assertExactRecord(input.guidance, "preparation.guidance", [
    "packetId",
    "version",
    "artifact",
    "approved",
    "notes",
  ]);
  assertDenseArray(input.guidance.notes, "preparation.guidance.notes");
  input.guidance.notes.forEach((note, index) =>
    assertExactRecord(note, `preparation.guidance.notes[${index}]`, [
      "id",
      "storedRowId",
      "text",
    ]),
  );
  assertExactRecord(input.example, "preparation.example", [
    "id",
    "title",
    "genre",
    "exampleType",
    "active",
    "content",
  ]);

  const chapter = Number(input.subject.slug.split("-")[1]);
  if (
    input.subject.slug !== input.bundle.slug ||
    input.subject.book !== "Mark" ||
    input.subject.chapter !== chapter ||
    ![8, 9, 10, 11].includes(input.subject.chapter) ||
    input.subject.readerVersion !== "ESV"
  ) {
    throw new Error("preparation subject does not match the opaque source bundle");
  }
  nonempty(input.model.id, "preparation.model.id");
  if (
    input.model.reasoningEffort !== "low" ||
    !Number.isSafeInteger(input.model.maxCompletionTokens) ||
    input.model.maxCompletionTokens <= 0
  ) {
    throw new Error("preparation model controls are invalid");
  }
  if (
    input.brain.libraryVersion !== LIBRARY_VERSION ||
    !libraryContentDigestMatchesSnapshot() ||
    !libraryManifestDigestMatchesSnapshot()
  ) {
    throw new Error("preparation Brain library does not match the version-controlled artifact");
  }
  if (!input.brain.rules.length || duplicateIds(input.brain.rules)) {
    throw new Error("preparation Brain rules must be non-empty and unique");
  }
  input.brain.rules.forEach((rule, index) => {
    nonempty(rule.id, `preparation.brain.rules[${index}].id`);
    nonempty(rule.text, `preparation.brain.rules[${index}].text`);
  });
  nonempty(input.guidance.packetId, "preparation.guidance.packetId");
  nonempty(input.guidance.version, "preparation.guidance.version");
  if (!input.guidance.notes.length || duplicateIds(input.guidance.notes)) {
    throw new Error("preparation guidance notes must be non-empty and unique");
  }
  input.guidance.notes.forEach((note, index) => {
    nonempty(note.id, `preparation.guidance.notes[${index}].id`);
    nonempty(note.storedRowId, `preparation.guidance.notes[${index}].storedRowId`);
    nonempty(note.text, `preparation.guidance.notes[${index}].text`);
  });
  for (const [path, value] of [
    ["preparation.example.id", input.example.id],
    ["preparation.example.title", input.example.title],
    ["preparation.example.genre", input.example.genre],
    ["preparation.example.exampleType", input.example.exampleType],
    ["preparation.example.content", input.example.content],
  ] as const) {
    nonempty(value, path);
  }
  // Canonicalization here proves the guidance snapshot is bounded to JSON
  // semantics before any prompt or manifest is composed. The Brain digest is
  // derived by its own library module because that artifact has a separately
  // reviewed digest contract.
  canonicalJson(input.guidance.artifact);
}

/**
 * Build the one exact future SDK body from an authenticated opaque bundle and
 * raw immutable inputs. The request contains transient ESV text: never log or
 * serialize it. A future dispatcher may pass this exact frozen object only
 * after genuine preflight succeeds AND a separate owner-issued slug/scope/
 * revision/expiry/nonce authorization is atomically consumed once.
 */
export function prepareGenerationModelRequestV3(
  input: GenerationManifestV3PreparationInput,
): GenerationModelRequestV3 {
  assertMarkSprintEsvBundleIntegrity(input.bundle);
  assertPreparationInput(input);

  const prompt = buildTransientMarkSprintPrompt(input.bundle, {
    ...input.subject,
    bibleVersion: input.subject.readerVersion,
    globalRules: input.brain.rules.map((rule) => rule.text),
    chapterNotes: input.guidance.notes.map((note) => note.text),
    examples: [
      {
        title: input.example.title,
        exampleType: input.example.exampleType,
        content: input.example.content,
      },
    ],
  });
  const request: GenerationModelRequestV3 = {
    model: input.model.id,
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: input.model.maxCompletionTokens,
    reasoning_effort: input.model.reasoningEffort,
    // Request provider-side storage opt-out explicitly. This is not a claim of
    // zero retention: OpenAI account/provider retention policy still applies.
    store: false,
  };
  const frozenRequest = deepFreeze(request);
  const evidence: DerivedMaterialEvidence = deepFreeze({
    subject: { ...input.subject },
    model: { ...input.model },
    promptRevision: CHAPTER_WORKUP_PROMPT_REVISION,
    brain: {
      libraryVersion: input.brain.libraryVersion,
      approvalContentDigest: LIBRARY_CONTENT_DIGEST,
      manifestArtifactDigest: LIBRARY_MANIFEST_DIGEST,
      approved: input.brain.approved,
      liveMatched: input.brain.liveMatched,
      rules: input.brain.rules.map((rule) => ({
        id: rule.id,
        digest: sha256Text(rule.text),
      })),
    },
    guidance: {
      packetId: input.guidance.packetId,
      version: input.guidance.version,
      digest: sha256Canonical(input.guidance.artifact),
      approved: input.guidance.approved,
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
      active: input.example.active,
      contentDigest: sha256Text(input.example.content),
    },
    requestDigest: sha256Canonical(frozenRequest),
  });
  PREPARED_REQUESTS.set(frozenRequest, {
    bundle: input.bundle,
    evidence,
  });
  return frozenRequest;
}

function rejectUnknownRequirements(
  requirements: GenerationManifestV3Requirements,
  add: (code: string, path: string, message: string) => void,
): void {
  const check = (
    path: string,
    value: unknown,
    keys: readonly string[],
  ): void => {
    if (!isPlainRecord(value) || !exactKeys(value, keys)) {
      add("UNKNOWN_FIELD", path, `${path} has an invalid or unsupported shape`);
    }
  };
  check("requirements", requirements, [
    "artifact",
    "stage",
    "subject",
    "model",
    "promptRevision",
    "brain",
    "guidance",
    "example",
    "approvedManifestDigest",
  ]);
  check("requirements.subject", requirements.subject, [
    "slug",
    "book",
    "chapter",
    "readerVersion",
  ]);
  check("requirements.model", requirements.model, [
    "id",
    "reasoningEffort",
    "maxCompletionTokens",
  ]);
  check("requirements.brain", requirements.brain, [
    "libraryVersion",
    "approvalContentDigest",
    "manifestArtifactDigest",
    "rules",
  ]);
  if (Array.isArray(requirements.brain?.rules)) {
    requirements.brain.rules.forEach((rule, index) =>
      check(`requirements.brain.rules[${index}]`, rule, ["id", "digest"]),
    );
  }
  check("requirements.guidance", requirements.guidance, [
    "packetId",
    "version",
    "digest",
    "notes",
  ]);
  if (Array.isArray(requirements.guidance?.notes)) {
    requirements.guidance.notes.forEach((note, index) =>
      check(`requirements.guidance.notes[${index}]`, note, [
        "id",
        "storedRowId",
        "digest",
      ]),
    );
  }
  check("requirements.example", requirements.example, [
    "id",
    "title",
    "genre",
    "exampleType",
    "contentDigest",
  ]);
}

function sameDigest(
  path: string,
  expected: unknown,
  actual: unknown,
  add: (code: string, path: string, message: string) => void,
): void {
  if (
    typeof expected !== "string" ||
    typeof actual !== "string" ||
    !LOWERCASE_SHA256.test(expected) ||
    !LOWERCASE_SHA256.test(actual)
  ) {
    add("INVALID_DIGEST", path, `${path} must be a lowercase SHA-256 digest`);
  } else if (expected !== actual) {
    add("DIGEST_MISMATCH", path, `${path} does not match`);
  }
}

function compareOrderedDigests(
  path: string,
  expected: readonly (DigestIdentity | NoteDigestIdentity)[],
  actual: readonly (DigestIdentity | NoteDigestIdentity)[],
  add: (code: string, path: string, message: string) => void,
): void {
  if (duplicateIds(expected) || duplicateIds(actual)) {
    add("DUPLICATE_IDENTITY", path, `${path} contains duplicate identities`);
  }
  if (expected.length !== actual.length) {
    add("ORDERED_SET_SIZE_MISMATCH", path, `${path} has missing or extra entries`);
  }
  for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
    const left = expected[index];
    const right = actual[index];
    if (!left || !right) continue;
    if (left.id !== right.id) {
      add("IDENTITY_MISMATCH", `${path}[${index}].id`, `${path} identity differs`);
    }
    sameDigest(`${path}[${index}].digest`, left.digest, right.digest, add);
    if ("storedRowId" in left || "storedRowId" in right) {
      const leftRow = "storedRowId" in left ? left.storedRowId : undefined;
      const rightRow = "storedRowId" in right ? right.storedRowId : undefined;
      if (leftRow !== rightRow) {
        add(
          "IDENTITY_MISMATCH",
          `${path}[${index}].storedRowId`,
          `${path} stored row identity differs`,
        );
      }
    }
  }
}

export function evaluateGenerationManifestV3(
  requirements: GenerationManifestV3Requirements,
  input: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
): GenerationManifestV3Result {
  const findings: ManifestFinding[] = [];
  const add = (code: string, path: string, message: string) =>
    findings.push({ code, path, message });
  rejectUnknownRequirements(requirements, add);

  let safeSource: MarkSprintEsvSourceBundle | null = null;
  try {
    assertMarkSprintEsvBundleIntegrity(input.sourceBundle);
    safeSource = cloneSafeSource(input.sourceBundle);
  } catch {
    add(
      "SOURCE_BUNDLE_INVALID",
      "source",
      "The source bundle is not an authenticated opaque bundle",
    );
  }
  const binding = PREPARED_REQUESTS.get(input.modelRequest);
  if (!binding || !isDeepFrozen(input.modelRequest)) {
    add(
      "MODEL_REQUEST_INVALID",
      "modelRequest",
      "The model request was not produced and frozen by the v3 preparer",
    );
  }
  if (binding && binding.bundle !== input.sourceBundle) {
    add(
      "SOURCE_REQUEST_MISMATCH",
      "modelRequest",
      "The model request was prepared from a different opaque source bundle",
    );
  }
  if (!safeSource || !binding) {
    return deepFreeze({
      ready: false,
      manifest: null,
      manifestDigest: null,
      findings,
    });
  }

  const evidence = binding.evidence;
  const recomputedRequestDigest = sha256Canonical(input.modelRequest);
  if (recomputedRequestDigest !== evidence.requestDigest) {
    add(
      "MODEL_REQUEST_DIGEST_INVALID",
      "modelRequest",
      "The exact prepared model request changed after preparation",
    );
  }
  if (input.modelRequest.model !== evidence.model.id) {
    add("MODEL_REQUEST_IDENTITY_MISMATCH", "modelRequest.model", "Request model differs");
  }
  if (
    input.modelRequest.reasoning_effort !== evidence.model.reasoningEffort ||
    input.modelRequest.max_completion_tokens !== evidence.model.maxCompletionTokens ||
    input.modelRequest.store !== false
  ) {
    add(
      "MODEL_REQUEST_IDENTITY_MISMATCH",
      "modelRequest.controls",
      "Request controls differ from their derived evidence",
    );
  }
  if (evidence.subject.slug !== input.sourceBundle.slug) {
    add(
      "SOURCE_SUBJECT_MISMATCH",
      "subject.slug",
      "The request subject and source bundle slug differ",
    );
  }

  const same = (path: string, expected: unknown, actual: unknown): void => {
    if (expected !== actual) add("IDENTITY_MISMATCH", path, `${path} does not match`);
  };
  same("artifact", requirements.artifact, "chapter_workup");
  same("stage", requirements.stage, "copy_generation");
  for (const key of ["slug", "book", "chapter", "readerVersion"] as const) {
    same(`subject.${key}`, requirements.subject[key], evidence.subject[key]);
  }
  same("model.id", requirements.model.id, evidence.model.id);
  same(
    "model.reasoningEffort",
    requirements.model.reasoningEffort,
    evidence.model.reasoningEffort,
  );
  same(
    "model.maxCompletionTokens",
    requirements.model.maxCompletionTokens,
    evidence.model.maxCompletionTokens,
  );
  same("promptRevision", requirements.promptRevision, evidence.promptRevision);

  same(
    "brain.libraryVersion",
    requirements.brain.libraryVersion,
    evidence.brain.libraryVersion,
  );
  sameDigest(
    "brain.approvalContentDigest",
    requirements.brain.approvalContentDigest,
    evidence.brain.approvalContentDigest,
    add,
  );
  sameDigest(
    "brain.manifestArtifactDigest",
    requirements.brain.manifestArtifactDigest,
    evidence.brain.manifestArtifactDigest,
    add,
  );
  if (evidence.brain.approved !== true) {
    add("BRAIN_NOT_APPROVED", "brain.approved", "Brain snapshot is not approved");
  }
  if (evidence.brain.liveMatched !== true) {
    add("BRAIN_LIVE_MISMATCH", "brain.liveMatched", "Live Brain does not match");
  }
  compareOrderedDigests("brain.rules", requirements.brain.rules, evidence.brain.rules, add);

  same("guidance.packetId", requirements.guidance.packetId, evidence.guidance.packetId);
  same("guidance.version", requirements.guidance.version, evidence.guidance.version);
  sameDigest("guidance.digest", requirements.guidance.digest, evidence.guidance.digest, add);
  if (evidence.guidance.approved !== true) {
    add(
      "GUIDANCE_NOT_APPROVED",
      "guidance.approved",
      "Guidance snapshot is not approved",
    );
  }
  compareOrderedDigests(
    "guidance.notes",
    requirements.guidance.notes,
    evidence.guidance.notes,
    add,
  );

  for (const key of ["id", "title", "genre", "exampleType"] as const) {
    same(`example.${key}`, requirements.example[key], evidence.example[key]);
  }
  sameDigest(
    "example.contentDigest",
    requirements.example.contentDigest,
    evidence.example.contentDigest,
    add,
  );
  if (evidence.example.active !== true) {
    add("EXAMPLE_NOT_ACTIVE", "example.active", "Voice example is inactive");
  }

  const manifest: GenerationManifestV3 = deepFreeze({
    manifestVersion: GENERATION_MANIFEST_V3,
    artifact: "chapter_workup",
    stage: "copy_generation",
    subject: { ...evidence.subject },
    model: { ...evidence.model },
    modelRequest: {
      schemaVersion: GENERATION_MODEL_REQUEST_V3,
      provider: GENERATION_MODEL_PROVIDER_V3,
      apiSurface: GENERATION_MODEL_API_SURFACE_V3,
      promptRevision: evidence.promptRevision,
      digest: recomputedRequestDigest,
      store: false,
      retentionStatement:
        "store_false_requested_provider_retention_policy_still_applies",
    },
    brain: {
      ...evidence.brain,
      rules: evidence.brain.rules.map((rule) => ({ ...rule })),
    },
    guidance: {
      ...evidence.guidance,
      notes: evidence.guidance.notes.map((note) => ({ ...note })),
    },
    example: { ...evidence.example },
    source: safeSource,
  });
  const manifestDigest = sha256Canonical(manifest);
  if (requirements.approvedManifestDigest === null) {
    add(
      "MANIFEST_APPROVAL_MISSING",
      "approvedManifestDigest",
      "Owner approval for this exact v3 manifest digest is missing",
    );
  } else if (
    !LOWERCASE_SHA256.test(requirements.approvedManifestDigest) ||
    requirements.approvedManifestDigest !== manifestDigest
  ) {
    add(
      "MANIFEST_APPROVAL_MISMATCH",
      "approvedManifestDigest",
      "Owner approval does not match this exact v3 manifest digest",
    );
  }

  const result: GenerationManifestV3Result = deepFreeze({
    ready: findings.length === 0,
    manifest,
    manifestDigest,
    findings,
  });
  if (result.ready) {
    GENUINE_READY_RESULTS.set(result, {
      bundle: input.sourceBundle,
      modelRequest: input.modelRequest,
      manifest,
      manifestDigest,
    });
  }
  return result;
}

export function assertGenerationManifestV3Ready(
  result: GenerationManifestV3Result,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
): asserts result is GenerationManifestV3Result & {
  ready: true;
  manifest: GenerationManifestV3;
  manifestDigest: string;
} {
  const binding = GENUINE_READY_RESULTS.get(result);
  const prepared = PREPARED_REQUESTS.get(preparation.modelRequest);
  let sourceValid = true;
  try {
    assertMarkSprintEsvBundleIntegrity(preparation.sourceBundle);
  } catch {
    sourceValid = false;
  }
  if (
    !binding ||
    !result.ready ||
    !result.manifest ||
    !result.manifestDigest ||
    result.findings.length !== 0 ||
    !isDeepFrozen(result) ||
    !LOWERCASE_SHA256.test(result.manifestDigest) ||
    result.manifestDigest !== sha256Canonical(result.manifest) ||
    result.manifest !== binding.manifest ||
    result.manifestDigest !== binding.manifestDigest ||
    preparation.sourceBundle !== binding.bundle ||
    preparation.modelRequest !== binding.modelRequest ||
    !sourceValid ||
    !prepared ||
    prepared.bundle !== preparation.sourceBundle ||
    !isDeepFrozen(preparation.modelRequest) ||
    prepared.evidence.requestDigest !==
      sha256Canonical(preparation.modelRequest) ||
    canonicalJson(result.manifest.source) !==
      canonicalJson(preparation.sourceBundle)
  ) {
    throw new Error("Generation manifest v3 readiness capability is invalid");
  }
}

/**
 * Mint non-transferable proof that this exact manifest/request/source
 * preparation passed preflight. This is NOT a run authorization, is not
 * one-use, and must never be accepted by itself for a model call. A future
 * runner still requires a separate owner-issued slug/scope/revision/expiry/
 * nonce capability that is consumed atomically exactly once.
 */
export function createGenerationManifestV3PreflightCapability(
  result: GenerationManifestV3Result,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
): GenerationManifestV3PreflightCapability {
  assertGenerationManifestV3Ready(result, preparation);
  const capability = deepFreeze({ manifestDigest: result.manifestDigest });
  PREFLIGHT_CAPABILITIES.set(capability, {
    result,
    bundle: preparation.sourceBundle,
    modelRequest: preparation.modelRequest,
    manifest: result.manifest,
    manifestDigest: result.manifestDigest,
  });
  return capability;
}

/**
 * Reassert the exact preflight preparation. This function performs no dispatch
 * or other I/O and does not replace future owner-issued one-use authorization.
 */
export function assertGenerationManifestV3PreflightCapability(
  capability: GenerationManifestV3PreflightCapability,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
): void {
  const binding = PREFLIGHT_CAPABILITIES.get(capability);
  if (
    !binding ||
    !isDeepFrozen(capability) ||
    !LOWERCASE_SHA256.test(capability.manifestDigest) ||
    capability.manifestDigest !== binding.manifestDigest ||
    preparation.sourceBundle !== binding.bundle ||
    preparation.modelRequest !== binding.modelRequest
  ) {
    throw new Error("Generation manifest v3 preflight capability is invalid");
  }
  assertGenerationManifestV3Ready(binding.result, preparation);
}

/**
 * Run the v3 source-overlap evidence gate without accepting a free manifest
 * digest. Only a genuine preflight capability for this exact bundle/request
 * can supply the digest. A passing report is necessary evidence, not generation
 * or publishing authorization.
 */
export function evaluateGenerationManifestV3Overlap(
  capability: GenerationManifestV3PreflightCapability,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
  rawDraftJson: string,
): MarkSprintEsvOverlapReport {
  assertGenerationManifestV3PreflightCapability(capability, preparation);
  return evaluateMarkSprintEsvOverlap({
    bundle: preparation.sourceBundle,
    rawDraftJson,
    manifestDigest: capability.manifestDigest,
  });
}

export function assertGenerationManifestV3OverlapReportIntegrity(
  capability: GenerationManifestV3PreflightCapability,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
  report: MarkSprintEsvOverlapReport,
  rawDraftJson: string,
): void {
  assertGenerationManifestV3PreflightCapability(capability, preparation);
  assertMarkSprintEsvOverlapReportIntegrity(report, {
    bundle: preparation.sourceBundle,
    manifestDigest: capability.manifestDigest,
    rawDraftJson,
  });
}

function exactDraftDigests(rawDraftJson: string): {
  rawDraftDigest: string;
  canonicalDraftDigest: string;
} {
  let draft: unknown;
  try {
    draft = JSON.parse(rawDraftJson);
  } catch {
    throw new Error("Generation manifest v3 draft binding is invalid");
  }
  return {
    rawDraftDigest: sha256Text(rawDraftJson),
    canonicalDraftDigest: sha256Canonical(draft),
  };
}

/**
 * Mint the proof a future persistence boundary must require. Report integrity
 * alone is insufficient: only a genuine, capability-bound report with a pass
 * verdict and zero findings can mint acceptance. This still does not authorize
 * generation, publishing, or any one-use run.
 */
export function createGenerationManifestV3OverlapAcceptanceCapability(
  preflight: GenerationManifestV3PreflightCapability,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
  report: MarkSprintEsvOverlapReport,
  rawDraftJson: string,
): GenerationManifestV3OverlapAcceptanceCapability {
  assertGenerationManifestV3OverlapReportIntegrity(
    preflight,
    preparation,
    report,
    rawDraftJson,
  );
  if (
    report.verdict !== "pass" ||
    report.findingCount !== 0 ||
    report.findings.length !== 0 ||
    report.findingsTruncated !== false
  ) {
    throw new Error("Generation manifest v3 overlap report did not pass");
  }
  const preflightBinding = PREFLIGHT_CAPABILITIES.get(preflight);
  if (!preflightBinding) {
    throw new Error("Generation manifest v3 preflight capability is invalid");
  }
  const digests = exactDraftDigests(rawDraftJson);
  if (
    report.rawDraftDigest !== digests.rawDraftDigest ||
    report.canonicalDraftDigest !== digests.canonicalDraftDigest ||
    !LOWERCASE_SHA256.test(report.reportDigest)
  ) {
    throw new Error("Generation manifest v3 overlap acceptance binding is invalid");
  }
  const capability = deepFreeze({
    manifestDigest: preflight.manifestDigest,
    reportDigest: report.reportDigest,
  });
  OVERLAP_ACCEPTANCE_CAPABILITIES.set(capability, {
    ...preflightBinding,
    preflight,
    reportDigest: report.reportDigest,
    ...digests,
  });
  return capability;
}

/**
 * Future draft persistence must call this with the exact draft bytes and exact
 * preflight preparation. A forged, cloned, blocked, reformatted, cross-draft,
 * or cross-bundle capability fails closed. Exact repeated assertions are
 * intentionally allowed: this is reusable evidence, not one-use authorization.
 * A future persistence/publish boundary still needs separate owner-issued,
 * atomically consumed one-use authorization.
 */
export function assertGenerationManifestV3OverlapAcceptanceCapability(
  capability: GenerationManifestV3OverlapAcceptanceCapability,
  preflight: GenerationManifestV3PreflightCapability,
  preparation: {
    sourceBundle: MarkSprintEsvSourceBundle;
    modelRequest: GenerationModelRequestV3;
  },
  rawDraftJson: string,
): void {
  const binding = OVERLAP_ACCEPTANCE_CAPABILITIES.get(capability);
  const digests = exactDraftDigests(rawDraftJson);
  if (
    !binding ||
    !isDeepFrozen(capability) ||
    binding.preflight !== preflight ||
    binding.bundle !== preparation.sourceBundle ||
    binding.modelRequest !== preparation.modelRequest ||
    capability.manifestDigest !== binding.manifestDigest ||
    capability.reportDigest !== binding.reportDigest ||
    digests.rawDraftDigest !== binding.rawDraftDigest ||
    digests.canonicalDraftDigest !== binding.canonicalDraftDigest ||
    ![
      capability.manifestDigest,
      capability.reportDigest,
    ].every((digest) => LOWERCASE_SHA256.test(digest))
  ) {
    throw new Error("Generation manifest v3 overlap acceptance capability is invalid");
  }
  assertGenerationManifestV3PreflightCapability(preflight, preparation);
  if (
    binding.manifest !== binding.result.manifest ||
    binding.manifestDigest !== binding.result.manifestDigest ||
    binding.manifestDigest !== sha256Canonical(binding.manifest)
  ) {
    throw new Error("Generation manifest v3 overlap acceptance capability is invalid");
  }
}
