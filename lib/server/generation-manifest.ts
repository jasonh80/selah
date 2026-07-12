// SERVER-ONLY. Pure, no-I/O preflight contract for a future protected
// generation runner. This module never reads the database, mutates a chapter,
// dispatches work, or calls a model.
import { createHash } from "node:crypto";

export type ManifestFinding = {
  code: string;
  path: string;
  message: string;
};

export type DigestIdentity = {
  id: string;
  digest: string;
};

export type NoteDigestIdentity = DigestIdentity & {
  storedRowId: string;
};

export type GenerationSourcePassageRole =
  | "context_before"
  | "primary"
  | "context_after";

export interface GenerationSourcePassageIdentity {
  role: GenerationSourcePassageRole;
  requestedReference: string;
  canonicalReference: string;
  textDigest: string;
}

export interface GenerationManifestRequirementsV2 {
  artifact: "chapter_workup";
  stage: "copy_generation";
  subject: {
    slug: string;
    book: string;
    chapter: number;
    readerVersion: string;
  };
  model: { id: string; reasoningEffort: string };
  // `digest` binds the complete canonical model request (system + user
  // messages, response format/schema, token controls, model, and reasoning),
  // not merely the visible user prompt. The legacy field name remains v1 API.
  prompt: { revision: string; digest: string };
  brain: {
    libraryVersion: string;
    libraryDigest: string;
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
  source: {
    provider: string;
    name: string;
    version: string;
    apiEndpoint: string;
    termsUrl: string;
    permissionsUrl: string;
    useBasis: string;
    publishedTermsAiAnalysisStatus: string;
    commercialUseAllowed: false;
    ownerDecisionId: string;
    ownerDecisionDigest: string;
    requestOptionsDigest: string;
    passages: GenerationSourcePassageIdentity[];
    bundleDigest: string;
  };
  approvedManifestDigest: string | null;
}

export interface GenerationManifestMaterialsV2 {
  artifact: "chapter_workup";
  stage: "copy_generation";
  subject: {
    slug: string;
    book: string;
    chapter: number;
    readerVersion: string;
  };
  model: { id: string; reasoningEffort: string };
  prompt: { revision: string; digest: string };
  brain: {
    libraryVersion: string;
    libraryDigest: string;
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
  examples: Array<{
    id: string;
    title: string;
    genre: string;
    exampleType: string;
    active: boolean;
    contentDigest: string;
  }>;
  source: {
    provider: string;
    name: string;
    version: string;
    apiEndpoint: string;
    termsUrl: string;
    permissionsUrl: string;
    useBasis: string;
    publishedTermsAiAnalysisStatus: string;
    commercialUseAllowed: false;
    ownerDecisionId: string;
    ownerDecisionDigest: string;
    requestOptionsDigest: string;
    passages: GenerationSourcePassageIdentity[];
    bundleDigest: string;
    ownerSelected: boolean;
    connected: boolean;
    contentPresent: boolean;
  };
}

export interface GenerationManifestV2 {
  manifestVersion: "generation-manifest-v2";
  artifact: "chapter_workup";
  stage: "copy_generation";
  subject: GenerationManifestMaterialsV2["subject"];
  model: GenerationManifestMaterialsV2["model"];
  prompt: GenerationManifestMaterialsV2["prompt"];
  brain: GenerationManifestMaterialsV2["brain"];
  guidance: GenerationManifestMaterialsV2["guidance"];
  examples: GenerationManifestMaterialsV2["examples"];
  source: GenerationManifestMaterialsV2["source"];
}

export interface ManifestPreflightResult {
  ready: boolean;
  manifest: GenerationManifestV2;
  manifestDigest: string;
  findings: ManifestFinding[];
}

export function normalizeDigestText(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(normalizeDigestText(value), "utf8").digest("hex");
}

function canonicalValue(value: unknown, path = "$"): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalValue(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`non-plain object at ${path}`);
    }
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(input).sort()) {
      if (input[key] === undefined) throw new Error(`undefined value at ${path}.${key}`);
      output[key] = canonicalValue(input[key], `${path}.${key}`);
    }
    return output;
  }
  throw new Error(`non-JSON value at ${path}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function computeGenerationSourceBundleDigest(source: {
  provider: string;
  name: string;
  version: string;
  apiEndpoint: string;
  requestOptionsDigest: string;
  passages: GenerationSourcePassageIdentity[];
}): string {
  return sha256Canonical({
    schemaVersion: "esv-api-source-bundle-v1",
    provider: source.provider,
    name: source.name,
    version: source.version,
    apiEndpoint: source.apiEndpoint,
    requestOptionsDigest: source.requestOptionsDigest,
    passages: source.passages.map((passage) => ({ ...passage })),
  });
}

const DIGEST = /^[a-f0-9]{64}$/;

function duplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates].sort();
}

function assertPlainRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid manifest object at ${path}`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`invalid manifest object at ${path}`);
  }
}

function assertDenseRecordArray(value: unknown, path: string): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`invalid manifest array at ${path}`);
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) throw new Error(`sparse manifest array at ${path}`);
    assertPlainRecord(value[index], `${path}[${index}]`);
  }
}

function assertManifestRuntimeShape(
  requirements: GenerationManifestRequirementsV2,
  materials: GenerationManifestMaterialsV2,
): void {
  assertPlainRecord(requirements, "requirements");
  assertPlainRecord(requirements.subject, "requirements.subject");
  assertPlainRecord(requirements.model, "requirements.model");
  assertPlainRecord(requirements.prompt, "requirements.prompt");
  assertPlainRecord(requirements.brain, "requirements.brain");
  assertDenseRecordArray(requirements.brain.rules, "requirements.brain.rules");
  assertPlainRecord(requirements.guidance, "requirements.guidance");
  assertDenseRecordArray(requirements.guidance.notes, "requirements.guidance.notes");
  assertPlainRecord(requirements.example, "requirements.example");
  assertPlainRecord(requirements.source, "requirements.source");
  assertDenseRecordArray(requirements.source.passages, "requirements.source.passages");

  assertPlainRecord(materials, "materials");
  assertPlainRecord(materials.subject, "materials.subject");
  assertPlainRecord(materials.model, "materials.model");
  assertPlainRecord(materials.prompt, "materials.prompt");
  assertPlainRecord(materials.brain, "materials.brain");
  assertDenseRecordArray(materials.brain.rules, "materials.brain.rules");
  assertPlainRecord(materials.guidance, "materials.guidance");
  assertDenseRecordArray(materials.guidance.notes, "materials.guidance.notes");
  assertDenseRecordArray(materials.examples, "materials.examples");
  assertPlainRecord(materials.source, "materials.source");
  assertDenseRecordArray(materials.source.passages, "materials.source.passages");
}

export function evaluateGenerationManifest(
  requirements: GenerationManifestRequirementsV2,
  materials: GenerationManifestMaterialsV2,
): ManifestPreflightResult {
  assertManifestRuntimeShape(requirements, materials);
  const findings: ManifestFinding[] = [];
  const add = (code: string, path: string, message: string) =>
    findings.push({ code, path, message });
  const rejectUnknown = (
    path: string,
    value: Record<string, unknown>,
    allowed: readonly string[],
  ) => {
    const allow = new Set(allowed);
    if (Object.keys(value).some((key) => !allow.has(key))) {
      add("UNKNOWN_FIELD", path, `${path} contains unsupported fields`);
    }
  };
  const same = (path: string, expected: unknown, actual: unknown) => {
    if (expected !== actual) add("IDENTITY_MISMATCH", path, `${path} does not match the approved requirement`);
  };
  const digest = (path: string, expected: unknown, actual: unknown) => {
    if (
      typeof expected !== "string" ||
      typeof actual !== "string" ||
      !DIGEST.test(expected) ||
      !DIGEST.test(actual)
    ) {
      add("INVALID_DIGEST", path, `${path} must use a lowercase SHA-256 digest`);
    } else if (expected !== actual) {
      add("DIGEST_MISMATCH", path, `${path} does not match the approved digest`);
    }
  };
  const ordered = (
    path: string,
    expected: Array<DigestIdentity | NoteDigestIdentity>,
    actual: Array<DigestIdentity | NoteDigestIdentity>,
  ) => {
    if (duplicateIds(expected).length) add("DUPLICATE_REQUIREMENT", path, `${path} repeats an identity`);
    if (duplicateIds(actual).length) add("DUPLICATE_MATERIAL", path, `${path} repeats an identity`);
    if (expected.length !== actual.length) add("ORDERED_SET_SIZE_MISMATCH", path, `${path} has missing or extra entries`);
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index++) {
      const e = expected[index];
      const a = actual[index];
      if (!e || !a) continue;
      same(`${path}[${index}].id`, e.id, a.id);
      digest(`${path}[${index}].digest`, e.digest, a.digest);
      if ("storedRowId" in e || "storedRowId" in a) {
        same(
          `${path}[${index}].storedRowId`,
          "storedRowId" in e ? e.storedRowId : undefined,
          "storedRowId" in a ? a.storedRowId : undefined,
        );
      }
    }
  };

  rejectUnknown("requirements", requirements as unknown as Record<string, unknown>, [
    "artifact", "stage", "subject", "model", "prompt", "brain", "guidance", "example", "source", "approvedManifestDigest",
  ]);
  rejectUnknown("requirements.subject", requirements.subject as unknown as Record<string, unknown>, [
    "slug", "book", "chapter", "readerVersion",
  ]);
  rejectUnknown("requirements.model", requirements.model as unknown as Record<string, unknown>, [
    "id", "reasoningEffort",
  ]);
  rejectUnknown("requirements.prompt", requirements.prompt as unknown as Record<string, unknown>, [
    "revision", "digest",
  ]);
  rejectUnknown("requirements.brain", requirements.brain as unknown as Record<string, unknown>, [
    "libraryVersion", "libraryDigest", "rules",
  ]);
  requirements.brain.rules.forEach((rule, index) =>
    rejectUnknown(`requirements.brain.rules[${index}]`, rule as unknown as Record<string, unknown>, ["id", "digest"]),
  );
  rejectUnknown("requirements.guidance", requirements.guidance as unknown as Record<string, unknown>, [
    "packetId", "version", "digest", "notes",
  ]);
  requirements.guidance.notes.forEach((note, index) =>
    rejectUnknown(`requirements.guidance.notes[${index}]`, note as unknown as Record<string, unknown>, [
      "id", "storedRowId", "digest",
    ]),
  );
  rejectUnknown("requirements.example", requirements.example as unknown as Record<string, unknown>, [
    "id", "title", "genre", "exampleType", "contentDigest",
  ]);
  rejectUnknown("requirements.source", requirements.source as unknown as Record<string, unknown>, [
    "provider", "name", "version", "apiEndpoint", "termsUrl", "permissionsUrl",
    "useBasis", "publishedTermsAiAnalysisStatus", "commercialUseAllowed",
    "ownerDecisionId", "ownerDecisionDigest", "requestOptionsDigest", "passages",
    "bundleDigest",
  ]);
  requirements.source.passages.forEach((passage, index) =>
    rejectUnknown(
      `requirements.source.passages[${index}]`,
      passage as unknown as Record<string, unknown>,
      ["role", "requestedReference", "canonicalReference", "textDigest"],
    ),
  );

  rejectUnknown("materials", materials as unknown as Record<string, unknown>, [
    "artifact", "stage", "subject", "model", "prompt", "brain", "guidance", "examples", "source",
  ]);
  rejectUnknown("subject", materials.subject as unknown as Record<string, unknown>, [
    "slug", "book", "chapter", "readerVersion",
  ]);
  rejectUnknown("model", materials.model as unknown as Record<string, unknown>, [
    "id", "reasoningEffort",
  ]);
  rejectUnknown("prompt", materials.prompt as unknown as Record<string, unknown>, [
    "revision", "digest",
  ]);
  rejectUnknown("brain", materials.brain as unknown as Record<string, unknown>, [
    "libraryVersion", "libraryDigest", "approved", "liveMatched", "rules",
  ]);
  materials.brain.rules.forEach((rule, index) =>
    rejectUnknown(`brain.rules[${index}]`, rule as unknown as Record<string, unknown>, ["id", "digest"]),
  );
  rejectUnknown("guidance", materials.guidance as unknown as Record<string, unknown>, [
    "packetId", "version", "digest", "approved", "notes",
  ]);
  materials.guidance.notes.forEach((note, index) =>
    rejectUnknown(`guidance.notes[${index}]`, note as unknown as Record<string, unknown>, [
      "id", "storedRowId", "digest",
    ]),
  );
  materials.examples.forEach((example, index) =>
    rejectUnknown(`examples[${index}]`, example as unknown as Record<string, unknown>, [
      "id", "title", "genre", "exampleType", "active", "contentDigest",
    ]),
  );
  rejectUnknown("source", materials.source as unknown as Record<string, unknown>, [
    "provider", "name", "version", "apiEndpoint", "termsUrl", "permissionsUrl",
    "useBasis", "publishedTermsAiAnalysisStatus", "commercialUseAllowed",
    "ownerDecisionId", "ownerDecisionDigest", "requestOptionsDigest", "passages",
    "bundleDigest", "ownerSelected", "connected", "contentPresent",
  ]);
  materials.source.passages.forEach((passage, index) =>
    rejectUnknown(
      `source.passages[${index}]`,
      passage as unknown as Record<string, unknown>,
      ["role", "requestedReference", "canonicalReference", "textDigest"],
    ),
  );

  const identity = (path: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) {
      add("INVALID_IDENTITY", path, `${path} must be a non-empty string`);
    }
  };
  const identityPairs: Array<[string, unknown, unknown]> = [
    ["artifact", requirements.artifact, materials.artifact],
    ["stage", requirements.stage, materials.stage],
    ["subject.slug", requirements.subject.slug, materials.subject.slug],
    ["subject.book", requirements.subject.book, materials.subject.book],
    ["subject.readerVersion", requirements.subject.readerVersion, materials.subject.readerVersion],
    ["model.id", requirements.model.id, materials.model.id],
    ["model.reasoningEffort", requirements.model.reasoningEffort, materials.model.reasoningEffort],
    ["prompt.revision", requirements.prompt.revision, materials.prompt.revision],
    ["brain.libraryVersion", requirements.brain.libraryVersion, materials.brain.libraryVersion],
    ["guidance.packetId", requirements.guidance.packetId, materials.guidance.packetId],
    ["guidance.version", requirements.guidance.version, materials.guidance.version],
    ["example.id", requirements.example.id, materials.examples[0]?.id],
    ["example.title", requirements.example.title, materials.examples[0]?.title],
    ["example.genre", requirements.example.genre, materials.examples[0]?.genre],
    ["example.exampleType", requirements.example.exampleType, materials.examples[0]?.exampleType],
    ["source.provider", requirements.source.provider, materials.source.provider],
    ["source.name", requirements.source.name, materials.source.name],
    ["source.version", requirements.source.version, materials.source.version],
    ["source.apiEndpoint", requirements.source.apiEndpoint, materials.source.apiEndpoint],
    ["source.termsUrl", requirements.source.termsUrl, materials.source.termsUrl],
    ["source.permissionsUrl", requirements.source.permissionsUrl, materials.source.permissionsUrl],
    ["source.useBasis", requirements.source.useBasis, materials.source.useBasis],
    [
      "source.publishedTermsAiAnalysisStatus",
      requirements.source.publishedTermsAiAnalysisStatus,
      materials.source.publishedTermsAiAnalysisStatus,
    ],
    ["source.ownerDecisionId", requirements.source.ownerDecisionId, materials.source.ownerDecisionId],
  ];
  for (const [path, expected, actual] of identityPairs) {
    identity(`requirements.${path}`, expected);
    identity(`materials.${path}`, actual);
  }
  const sourceRoles: GenerationSourcePassageRole[] = [
    "context_before",
    "primary",
    "context_after",
  ];
  if (
    requirements.source.passages.length !== sourceRoles.length ||
    materials.source.passages.length !== sourceRoles.length
  ) {
    add(
      "SOURCE_PASSAGE_SET_MISMATCH",
      "source.passages",
      "Source bundle must contain ordered context-before, primary, and context-after passages",
    );
  }
  const sourcePassageLength = Math.max(
    requirements.source.passages.length,
    materials.source.passages.length,
    sourceRoles.length,
  );
  for (let index = 0; index < sourcePassageLength; index++) {
    const expected = requirements.source.passages[index];
    const actual = materials.source.passages[index];
    const role = sourceRoles[index];
    if (!expected || !actual || !role) continue;
    identity(`requirements.source.passages[${index}].role`, expected.role);
    identity(
      `requirements.source.passages[${index}].requestedReference`,
      expected.requestedReference,
    );
    identity(
      `requirements.source.passages[${index}].canonicalReference`,
      expected.canonicalReference,
    );
    identity(`materials.source.passages[${index}].role`, actual.role);
    identity(
      `materials.source.passages[${index}].requestedReference`,
      actual.requestedReference,
    );
    identity(
      `materials.source.passages[${index}].canonicalReference`,
      actual.canonicalReference,
    );
    same(`source.passages[${index}].role`, role, expected.role);
    same(`source.passages[${index}].role`, expected.role, actual.role);
    same(
      `source.passages[${index}].requestedReference`,
      expected.requestedReference,
      actual.requestedReference,
    );
    same(
      `source.passages[${index}].canonicalReference`,
      expected.canonicalReference,
      actual.canonicalReference,
    );
    digest(
      `source.passages[${index}].textDigest`,
      expected.textDigest,
      actual.textDigest,
    );
  }
  for (const [path, passages] of [
    ["requirements.source.passages", requirements.source.passages],
    ["source.passages", materials.source.passages],
  ] as const) {
    const requested = passages.map((passage) => passage.requestedReference);
    const canonical = passages.map((passage) => passage.canonicalReference);
    if (new Set(requested).size !== requested.length || new Set(canonical).size !== canonical.length) {
      add(
        "SOURCE_PASSAGE_DUPLICATE",
        path,
        "Source bundle passage references must be distinct",
      );
    }
  }
  requirements.brain.rules.forEach((rule, index) => identity(`requirements.brain.rules[${index}].id`, rule.id));
  materials.brain.rules.forEach((rule, index) => identity(`materials.brain.rules[${index}].id`, rule.id));
  requirements.guidance.notes.forEach((note, index) => {
    identity(`requirements.guidance.notes[${index}].id`, note.id);
    identity(`requirements.guidance.notes[${index}].storedRowId`, note.storedRowId);
  });
  materials.guidance.notes.forEach((note, index) => {
    identity(`materials.guidance.notes[${index}].id`, note.id);
    identity(`materials.guidance.notes[${index}].storedRowId`, note.storedRowId);
  });
  if (!Number.isInteger(requirements.subject.chapter) || requirements.subject.chapter <= 0) {
    add("INVALID_IDENTITY", "requirements.subject.chapter", "chapter must be a positive integer");
  }
  if (!Number.isInteger(materials.subject.chapter) || materials.subject.chapter <= 0) {
    add("INVALID_IDENTITY", "materials.subject.chapter", "chapter must be a positive integer");
  }
  if (!requirements.brain.rules.length || !materials.brain.rules.length) {
    add("EMPTY_ORDERED_SET", "brain.rules", "Brain rule selection must not be empty");
  }
  if (!requirements.guidance.notes.length || !materials.guidance.notes.length) {
    add("EMPTY_ORDERED_SET", "guidance.notes", "Chapter note selection must not be empty");
  }

  same("artifact", requirements.artifact, materials.artifact);
  same("stage", requirements.stage, materials.stage);
  for (const key of ["slug", "book", "chapter", "readerVersion"] as const) {
    same(`subject.${key}`, requirements.subject[key], materials.subject[key]);
  }
  same("model.id", requirements.model.id, materials.model.id);
  same("model.reasoningEffort", requirements.model.reasoningEffort, materials.model.reasoningEffort);
  same("prompt.revision", requirements.prompt.revision, materials.prompt.revision);
  digest("prompt.digest", requirements.prompt.digest, materials.prompt.digest);

  same("brain.libraryVersion", requirements.brain.libraryVersion, materials.brain.libraryVersion);
  digest("brain.libraryDigest", requirements.brain.libraryDigest, materials.brain.libraryDigest);
  if (materials.brain.approved !== true) add("BRAIN_NOT_APPROVED", "brain.approved", "Brain library is not owner-approved");
  if (materials.brain.liveMatched !== true) add("BRAIN_LIVE_MISMATCH", "brain.liveMatched", "Live Brain does not match the approved artifact");
  ordered("brain.rules", requirements.brain.rules, materials.brain.rules);

  same("guidance.packetId", requirements.guidance.packetId, materials.guidance.packetId);
  same("guidance.version", requirements.guidance.version, materials.guidance.version);
  digest("guidance.digest", requirements.guidance.digest, materials.guidance.digest);
  if (materials.guidance.approved !== true) add("GUIDANCE_NOT_APPROVED", "guidance.approved", "Chapter guidance is not approved");
  ordered("guidance.notes", requirements.guidance.notes, materials.guidance.notes);

  if (materials.examples.length !== 1) {
    add("EXAMPLE_COUNT_MISMATCH", "examples", "Exactly one approved voice example is required");
  }
  const example = materials.examples[0];
  if (example) {
    same("example.id", requirements.example.id, example.id);
    same("example.title", requirements.example.title, example.title);
    same("example.genre", requirements.example.genre, example.genre);
    same("example.exampleType", requirements.example.exampleType, example.exampleType);
    digest("example.contentDigest", requirements.example.contentDigest, example.contentDigest);
    if (example.active !== true) add("EXAMPLE_NOT_ACTIVE", "example.active", "Approved voice example is inactive");
  }

  for (const key of [
    "provider",
    "name",
    "version",
    "apiEndpoint",
    "termsUrl",
    "permissionsUrl",
    "useBasis",
    "publishedTermsAiAnalysisStatus",
    "ownerDecisionId",
  ] as const) {
    same(`source.${key}`, requirements.source[key], materials.source[key]);
  }
  same(
    "source.commercialUseAllowed",
    requirements.source.commercialUseAllowed,
    materials.source.commercialUseAllowed,
  );
  if (
    requirements.source.commercialUseAllowed !== false ||
    materials.source.commercialUseAllowed !== false
  ) {
    add(
      "SOURCE_COMMERCIAL_USE_FORBIDDEN",
      "source.commercialUseAllowed",
      "The standard ESV API source policy is noncommercial only",
    );
  }
  digest(
    "source.ownerDecisionDigest",
    requirements.source.ownerDecisionDigest,
    materials.source.ownerDecisionDigest,
  );
  digest(
    "source.requestOptionsDigest",
    requirements.source.requestOptionsDigest,
    materials.source.requestOptionsDigest,
  );
  digest(
    "source.bundleDigest",
    requirements.source.bundleDigest,
    materials.source.bundleDigest,
  );
  const computedRequirementBundleDigest = computeGenerationSourceBundleDigest(
    requirements.source,
  );
  const computedMaterialBundleDigest = computeGenerationSourceBundleDigest(
    materials.source,
  );
  if (requirements.source.bundleDigest !== computedRequirementBundleDigest) {
    add(
      "SOURCE_BUNDLE_DIGEST_INVALID",
      "requirements.source.bundleDigest",
      "Required source bundle digest does not match its ordered passage identities",
    );
  }
  if (materials.source.bundleDigest !== computedMaterialBundleDigest) {
    add(
      "SOURCE_BUNDLE_DIGEST_INVALID",
      "source.bundleDigest",
      "Source bundle digest does not match its ordered passage identities",
    );
  }
  if (materials.source.ownerSelected !== true) {
    add(
      "SOURCE_NOT_OWNER_SELECTED",
      "source.ownerSelected",
      "The owner has not selected this generation source",
    );
  }
  if (materials.source.connected !== true) add("SOURCE_NOT_CONNECTED", "source.connected", "Generation source is not connected");
  if (materials.source.contentPresent !== true) add("SOURCE_CONTENT_MISSING", "source.contentPresent", "Generation source content is missing");

  const manifest: GenerationManifestV2 = {
    manifestVersion: "generation-manifest-v2",
    artifact: materials.artifact,
    stage: materials.stage,
    subject: {
      slug: materials.subject.slug,
      book: materials.subject.book,
      chapter: materials.subject.chapter,
      readerVersion: materials.subject.readerVersion,
    },
    model: {
      id: materials.model.id,
      reasoningEffort: materials.model.reasoningEffort,
    },
    prompt: {
      revision: materials.prompt.revision,
      digest: materials.prompt.digest,
    },
    brain: {
      libraryVersion: materials.brain.libraryVersion,
      libraryDigest: materials.brain.libraryDigest,
      approved: materials.brain.approved,
      liveMatched: materials.brain.liveMatched,
      rules: materials.brain.rules.map((rule) => ({ id: rule.id, digest: rule.digest })),
    },
    guidance: {
      packetId: materials.guidance.packetId,
      version: materials.guidance.version,
      digest: materials.guidance.digest,
      approved: materials.guidance.approved,
      notes: materials.guidance.notes.map((note) => ({
        id: note.id,
        storedRowId: note.storedRowId,
        digest: note.digest,
      })),
    },
    examples: materials.examples.map((item) => ({
      id: item.id,
      title: item.title,
      genre: item.genre,
      exampleType: item.exampleType,
      active: item.active,
      contentDigest: item.contentDigest,
    })),
    source: {
      provider: materials.source.provider,
      name: materials.source.name,
      version: materials.source.version,
      apiEndpoint: materials.source.apiEndpoint,
      termsUrl: materials.source.termsUrl,
      permissionsUrl: materials.source.permissionsUrl,
      useBasis: materials.source.useBasis,
      publishedTermsAiAnalysisStatus:
        materials.source.publishedTermsAiAnalysisStatus,
      commercialUseAllowed: materials.source.commercialUseAllowed,
      ownerDecisionId: materials.source.ownerDecisionId,
      ownerDecisionDigest: materials.source.ownerDecisionDigest,
      requestOptionsDigest: materials.source.requestOptionsDigest,
      passages: materials.source.passages.map((passage) => ({ ...passage })),
      bundleDigest: materials.source.bundleDigest,
      ownerSelected: materials.source.ownerSelected,
      connected: materials.source.connected,
      contentPresent: materials.source.contentPresent,
    },
  };
  const manifestDigest = sha256Canonical(manifest);
  if (!requirements.approvedManifestDigest) {
    add("MANIFEST_APPROVAL_MISSING", "approvedManifestDigest", "Exact manifest digest has not been owner-approved");
  } else if (
    typeof requirements.approvedManifestDigest !== "string" ||
    !DIGEST.test(requirements.approvedManifestDigest)
  ) {
    add("INVALID_DIGEST", "approvedManifestDigest", "Approved manifest digest must be lowercase SHA-256");
  } else if (requirements.approvedManifestDigest !== manifestDigest) {
    add("MANIFEST_APPROVAL_MISMATCH", "approvedManifestDigest", "Owner approval does not match this manifest");
  }

  return { ready: findings.length === 0, manifest, manifestDigest, findings };
}

export function assertGenerationManifestReady(
  result: ManifestPreflightResult,
): asserts result is ManifestPreflightResult & { ready: true } {
  if (!result.ready) {
    const codes = [...new Set(result.findings.map((finding) => finding.code))].sort();
    throw new Error(`generation manifest blocked: ${codes.join(", ")}`);
  }
}
