// SERVER-ONLY. Read-only composition for a future protected Mark 8–11 run.
//
// This module may read exact live evidence and assemble the transient ESV
// bundle, but it cannot call a model, mutate Studio/Supabase, or authorize a
// run. Its public result is safe to serialize: source, rule, note, exemplar,
// API-key, and prompt bytes are deliberately discarded after v3 evaluation.
import type { SupabaseClient } from "@supabase/supabase-js";
import guidanceArtifact from "./mark-sprint-guidance.v1.json";
import {
  assertGenerationManifestV3PreflightCapability,
  createGenerationManifestV3PreflightCapability,
  evaluateGenerationManifestV3,
  prepareGenerationModelRequestV3,
  type GenerationManifestV3PreflightCapability,
  type GenerationManifestV3Requirements,
  type GenerationManifestV3Result,
  type GenerationModelRequestV3,
} from "./generation-manifest-v3";
import {
  canonicalJson,
  sha256Canonical,
  sha256Text,
  type ManifestFinding,
} from "./generation-manifest";
import {
  loadMarkSprintEsvSourceBundle,
  type MarkSprintEsvSourceBundle,
} from "./mark-sprint-esv-source";
import {
  buildMarkSprintManifestPolicy,
  isMarkSprintSlug,
  type MarkSprintManifestPolicy,
  type MarkSprintSlug,
} from "./mark-sprint-manifest-policy";
import {
  LIBRARY_MANIFEST_DIGEST,
  LIBRARY_VERSION,
  SEED_RULES,
} from "./selah-brain-library";

if (typeof window !== "undefined") {
  throw new Error("Mark sprint runtime preparation is server-only");
}

export const MARK_SPRINT_MAX_COMPLETION_TOKENS = 12_000;

const MARK_6_VOICE_EXAMPLE_TITLE = "Mark 6 Daily Rundown";
const MARK_6_LEGACY_VOICE_EXAMPLE_TITLE =
  "Mark 6 Daily Rundown Voice Example";

function acceptedVoiceExampleTitles(
  identity: MarkSprintVoiceExampleIdentity,
): readonly string[] {
  // The original Studio row predates the versioned Mark sprint contract and
  // carries a longer display title. Accept only that exact legacy identity;
  // two matching active rows still fail closed as ambiguous below.
  return identity.title === MARK_6_VOICE_EXAMPLE_TITLE &&
    identity.genre === "gospel narrative" &&
    identity.exampleType === "voice"
    ? [identity.title, MARK_6_LEGACY_VOICE_EXAMPLE_TITLE]
    : [identity.title];
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface MarkSprintLiveBrainRuleRow {
  id: string;
  rule_id: string | null;
  title: string;
  rule_text: string;
  category: string;
  scope: string;
  genre: string | null;
  priority: string;
  stages: readonly string[];
  source_titles: readonly string[];
  version: string;
  active: boolean;
  archived: boolean;
}

export interface MarkSprintLiveChapterNoteRow {
  id: string;
  slug: string;
  note: string;
  scope: string;
}

export interface MarkSprintLiveVoiceExampleRow {
  id: string;
  title: string;
  genre: string;
  example_type: string;
  content: string;
  active: boolean;
}

export interface MarkSprintVoiceExampleIdentity {
  title: string;
  genre: string;
  exampleType: string;
}

/** All methods are reads. A caller owns authentication and supplies the port. */
export interface MarkSprintRuntimeReadPorts {
  readBrainRuleRows(
    ruleIds: readonly string[],
  ): Promise<readonly MarkSprintLiveBrainRuleRow[]>;
  readChapterNoteRows(
    slug: MarkSprintSlug,
  ): Promise<readonly MarkSprintLiveChapterNoteRow[]>;
  readVoiceExampleRows(
    identity: MarkSprintVoiceExampleIdentity,
  ): Promise<readonly MarkSprintLiveVoiceExampleRow[]>;
}

/**
 * Production adapter for an already-authenticated server Supabase client.
 * It exposes SELECTs only; the runtime itself still receives this as an
 * injected port and can be verified offline with fakes.
 */
export function createSupabaseMarkSprintRuntimeReadPorts(
  db: SupabaseClient,
): MarkSprintRuntimeReadPorts {
  const rowsOrThrow = <T>(data: unknown, error: { message: string } | null): T => {
    if (error) throw new Error("Mark sprint read failed");
    if (!Array.isArray(data)) throw new Error("Mark sprint read returned no rows");
    return data as T;
  };

  return Object.freeze({
    async readBrainRuleRows(ruleIds: readonly string[]) {
      const { data, error } = await db
        .from("selah_brain_rules")
        .select(
          "id,rule_id,title,rule_text,category,scope,genre,priority,stages,source_titles,version,active,archived",
        )
        .in("rule_id", [...ruleIds]);
      return rowsOrThrow<readonly MarkSprintLiveBrainRuleRow[]>(data, error);
    },
    async readChapterNoteRows(slug: MarkSprintSlug) {
      const { data, error } = await db
        .from("chapter_review_notes")
        .select("id,slug,note,scope")
        .eq("slug", slug)
        .eq("scope", "chapter");
      return rowsOrThrow<readonly MarkSprintLiveChapterNoteRow[]>(data, error);
    },
    async readVoiceExampleRows(identity: MarkSprintVoiceExampleIdentity) {
      const { data, error } = await db
        .from("selah_approved_examples")
        .select("id,title,genre,example_type,content,active")
        .in("title", [...acceptedVoiceExampleTitles(identity)])
        .eq("genre", identity.genre)
        .eq("example_type", identity.exampleType)
        .eq("active", true);
      return rowsOrThrow<readonly MarkSprintLiveVoiceExampleRow[]>(data, error);
    },
  });
}

export type MarkSprintRuntimeEvidenceBlockerCode =
  | "VERSIONED_REQUIREMENTS_MISMATCH"
  | "LIVE_READ_FAILED"
  | "LIVE_BRAIN_MISSING"
  | "LIVE_BRAIN_MISMATCH"
  | "LIVE_CHAPTER_NOTES_MISSING"
  | "LIVE_CHAPTER_NOTES_MISMATCH"
  | "LIVE_VOICE_EXAMPLE_MISSING"
  | "LIVE_VOICE_EXAMPLE_MISMATCH"
  | "SOURCE_LOAD_FAILED";

export interface MarkSprintRuntimeEvidenceBlocker {
  code: MarkSprintRuntimeEvidenceBlockerCode;
  path: string;
  message: string;
}

export type MarkSprintRuntimeApprovalBlockerCode =
  | "BRAIN_ARTIFACT_APPROVAL_MISSING"
  | "GUIDANCE_APPROVAL_MISSING"
  | "SOURCE_RUNTIME_APPROVAL_MISSING"
  | "SOURCE_SELECTION_APPROVAL_MISSING"
  | "MANIFEST_APPROVAL_MISSING"
  | "MANIFEST_APPROVAL_MISMATCH"
  | "OWNER_RUN_AUTHORIZATION_MISSING";

export interface MarkSprintRuntimeApprovalBlocker {
  code: MarkSprintRuntimeApprovalBlockerCode;
  message: string;
}

export interface MarkSprintRuntimePreview {
  slug: MarkSprintSlug;
  evidenceReady: boolean;
  readyForGeneration: boolean;
  sourceBundleDigest: string | null;
  manifestDigest: string | null;
  evidenceBlockers: readonly MarkSprintRuntimeEvidenceBlocker[];
  approvalBlockers: readonly MarkSprintRuntimeApprovalBlocker[];
  manifestFindings: readonly ManifestFinding[];
}

export interface PrepareMarkSprintRuntimePreviewInput {
  slug: string;
  apiKey: string;
  ports: MarkSprintRuntimeReadPorts;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  approvedManifestDigest?: string | null;
}

/**
 * Trusted server input set only after the confirmed route authenticates and
 * owns the single-use generation job. Never map a request-body boolean here.
 */
export interface PrepareMarkSprintRuntimeInput
  extends PrepareMarkSprintRuntimePreviewInput {
  ownerAuthorized: boolean;
}

export type MarkSprintRuntimeApprovedPreparation = object & {
  readonly __markSprintRuntimeApproved: never;
};

export interface MarkSprintRuntimePreparationResult {
  readonly preview: MarkSprintRuntimePreview;
  // Non-enumerable. JSON serialization of this result contains preview only.
  readonly prepared: MarkSprintRuntimeApprovedPreparation | null;
}

export interface MarkSprintRuntimeRunnerPreparation {
  readonly sourceBundle: MarkSprintEsvSourceBundle;
  readonly modelRequest: GenerationModelRequestV3;
  readonly manifestResult: GenerationManifestV3Result;
  readonly preflight: GenerationManifestV3PreflightCapability;
}

const APPROVED_RUNTIME_PREPARATIONS = new WeakMap<
  MarkSprintRuntimeApprovedPreparation,
  MarkSprintRuntimeRunnerPreparation
>();

interface GuidanceNote {
  id: string;
  text: string;
}

interface GuidanceSnapshot {
  packet_id: string;
  version: string;
  status: string;
  library_version: string;
  source_requirement: {
    owner_selection_status: string;
    runtime_connection_status: string;
  };
  chapters: Record<MarkSprintSlug, { notes: GuidanceNote[] }>;
}

const guidance = guidanceArtifact as GuidanceSnapshot;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function evidenceBlocker(
  code: MarkSprintRuntimeEvidenceBlockerCode,
  path: string,
  message: string,
): MarkSprintRuntimeEvidenceBlocker {
  return { code, path, message };
}

function approvalBlockers(
  policy: MarkSprintManifestPolicy,
  findings: readonly ManifestFinding[],
  ownerAuthorized: boolean,
): MarkSprintRuntimeApprovalBlocker[] {
  const blockers: MarkSprintRuntimeApprovalBlocker[] = [];
  const add = (code: MarkSprintRuntimeApprovalBlockerCode, message: string) => {
    if (!blockers.some((blocker) => blocker.code === code)) {
      blockers.push({ code, message });
    }
  };
  const policyCodes = new Set(policy.blockers.map((blocker) => blocker.code));
  if (policyCodes.has("brain_artifact_not_approved")) {
    add(
      "BRAIN_ARTIFACT_APPROVAL_MISSING",
      "The exact version-controlled Brain is still review-only.",
    );
  }
  if (policyCodes.has("guidance_not_approved")) {
    add(
      "GUIDANCE_APPROVAL_MISSING",
      "The exact Mark chapter guidance is still review-only.",
    );
  }
  if (policyCodes.has("source_owner_selection_missing")) {
    add(
      "SOURCE_SELECTION_APPROVAL_MISSING",
      "The Scripture source selection is not approved.",
    );
  }
  if (policyCodes.has("source_not_connected")) {
    add(
      "SOURCE_RUNTIME_APPROVAL_MISSING",
      "The version-controlled source contract is not marked connected.",
    );
  }
  for (const finding of findings) {
    if (finding.code === "MANIFEST_APPROVAL_MISSING") {
      add(
        "MANIFEST_APPROVAL_MISSING",
        "Owner approval for this exact safe manifest digest is missing.",
      );
    } else if (finding.code === "MANIFEST_APPROVAL_MISMATCH") {
      add(
        "MANIFEST_APPROVAL_MISMATCH",
        "Owner approval does not match this exact safe manifest digest.",
      );
    }
  }
  if (
    policyCodes.has("owner_authorization_missing") &&
    ownerAuthorized !== true
  ) {
    add(
      "OWNER_RUN_AUTHORIZATION_MISSING",
      "A later one-use owner authorization is still required.",
    );
  }
  return blockers;
}

function staticEvidence(
  policy: MarkSprintManifestPolicy,
): {
  blockers: MarkSprintRuntimeEvidenceBlocker[];
  rules: Array<{ id: string; text: string }>;
  notes: GuidanceNote[];
} {
  const blockers: MarkSprintRuntimeEvidenceBlocker[] = [];
  const rulesById = new Map(SEED_RULES.map((rule) => [rule.id, rule]));
  const rules = policy.requirements.brain.requiredRules.flatMap((requirement) => {
    const rule = rulesById.get(requirement.id);
    if (!rule || sha256Text(rule.text) !== requirement.textDigest) {
      blockers.push(
        evidenceBlocker(
          "VERSIONED_REQUIREMENTS_MISMATCH",
          `brain.rules.${requirement.id}`,
          `Version-controlled Brain rule ${requirement.id} does not match policy.`,
        ),
      );
      return [];
    }
    return [{ id: rule.id, text: rule.text }];
  });
  const notes = guidance.chapters[policy.requirements.slug]?.notes ?? [];
  const expectedNotes = policy.requirements.chapterNotes;
  if (
    guidance.packet_id !== policy.requirements.guidance.packetId ||
    guidance.version !== policy.requirements.guidance.packetVersion ||
    guidance.library_version !== policy.requirements.brain.libraryVersion ||
    sha256Canonical(guidanceArtifact) !==
      policy.requirements.guidance.contentDigest ||
    canonicalJson(
      notes.map((note) => ({ id: note.id, textDigest: sha256Text(note.text) })),
    ) !==
      canonicalJson(
        expectedNotes.map((note) => ({ id: note.id, textDigest: note.textDigest })),
      )
  ) {
    blockers.push(
      evidenceBlocker(
        "VERSIONED_REQUIREMENTS_MISMATCH",
        "guidance",
        "Version-controlled Mark guidance does not match policy.",
      ),
    );
  }
  if (rules.length !== policy.requirements.brain.requiredRules.length) {
    blockers.push(
      evidenceBlocker(
        "VERSIONED_REQUIREMENTS_MISMATCH",
        "brain.rules",
        "The exact version-controlled Brain rule set is incomplete.",
      ),
    );
  }
  return { blockers, rules, notes };
}

function validateLiveBrain(
  rows: readonly MarkSprintLiveBrainRuleRow[],
  promptRules: readonly { id: string; text: string }[],
): {
  blockers: MarkSprintRuntimeEvidenceBlocker[];
  rules: Array<{ id: string; text: string }>;
} {
  const blockers: MarkSprintRuntimeEvidenceBlocker[] = [];
  const expectedIds = new Set(SEED_RULES.map((rule) => rule.id));
  const missing: string[] = [];
  const mismatch = new Set<string>();

  for (const row of rows) {
    if (!expectedIds.has(row?.rule_id ?? "")) mismatch.add(row?.rule_id ?? "unknown");
  }
  for (const expected of SEED_RULES) {
    const matches = rows.filter((row) => row?.rule_id === expected.id);
    if (!matches.length) {
      missing.push(expected.id);
      continue;
    }
    if (matches.length !== 1) {
      mismatch.add(expected.id);
      continue;
    }
    const row = matches[0];
    if (
      typeof row.id !== "string" ||
      !row.id.trim() ||
      row.title !== expected.title ||
      row.rule_text !== expected.text ||
      row.category !== expected.category ||
      row.scope !== expected.scope ||
      row.genre !== (expected.genre ?? null) ||
      row.priority !== expected.priority ||
      canonicalJson(row.stages) !== canonicalJson(expected.stages) ||
      canonicalJson(row.source_titles) !== canonicalJson(expected.sources ?? []) ||
      row.version !== LIBRARY_VERSION ||
      row.active !== expected.active ||
      row.archived !== false
    ) {
      mismatch.add(expected.id);
      continue;
    }
  }
  if (missing.length) {
    blockers.push(
      evidenceBlocker(
        "LIVE_BRAIN_MISSING",
        "brain.rules",
        `Live Brain is missing required rules: ${missing.join(", ")}.`,
      ),
    );
  }
  if (mismatch.size) {
    blockers.push(
      evidenceBlocker(
        "LIVE_BRAIN_MISMATCH",
        "brain.rules",
        `Live Brain differs from the exact artifact for: ${[...mismatch].sort().join(", ")}.`,
      ),
    );
  }
  return { blockers, rules: promptRules.map((rule) => ({ ...rule })) };
}

function validateLiveNotes(
  slug: MarkSprintSlug,
  rows: readonly MarkSprintLiveChapterNoteRow[],
  expectedNotes: readonly GuidanceNote[],
  requirements: readonly {
    id: string;
    textDigest: string;
    expectedStoredRowId: string | null;
  }[],
): {
  blockers: MarkSprintRuntimeEvidenceBlocker[];
  notes: Array<{ id: string; storedRowId: string; text: string }>;
} {
  const blockers: MarkSprintRuntimeEvidenceBlocker[] = [];
  const missing: string[] = [];
  const mismatch = new Set<string>();
  const usedRowIds = new Set<string>();
  const notes: Array<{ id: string; storedRowId: string; text: string }> = [];
  const requirementsById = new Map(requirements.map((note) => [note.id, note]));
  const expectedStoredIds = new Set(
    requirements.flatMap((note) =>
      note.expectedStoredRowId ? [note.expectedStoredRowId] : [],
    ),
  );
  const legacyExpectedTexts = new Set(
    expectedNotes.flatMap((note) =>
      requirementsById.get(note.id)?.expectedStoredRowId ? [] : [note.text],
    ),
  );
  // Ordinary owner feedback can sit beside the approved guidance. Only rows
  // matching deterministic IDs (Mark 8) or legacy exact text (still-blocked
  // Mark 9–11) enter the manifest set.
  const guidanceRows = rows.filter((row) =>
    expectedStoredIds.has(row?.id ?? "") ||
    legacyExpectedTexts.has(row?.note ?? ""),
  );

  for (const expected of expectedNotes) {
    const requirement = requirementsById.get(expected.id);
    const matches = requirement?.expectedStoredRowId
      ? guidanceRows.filter((row) => row?.id === requirement.expectedStoredRowId)
      : guidanceRows.filter((row) => row?.note === expected.text);
    if (!matches.length) {
      missing.push(expected.id);
      continue;
    }
    if (matches.length !== 1) {
      mismatch.add(expected.id);
      continue;
    }
    const row = matches[0];
    if (
      typeof row.id !== "string" ||
      !row.id.trim() ||
      row.slug !== slug ||
      row.scope !== "chapter" ||
      row.note !== expected.text ||
      !requirement ||
      sha256Text(row.note) !== requirement.textDigest ||
      (requirement.expectedStoredRowId !== null &&
        row.id !== requirement.expectedStoredRowId) ||
      usedRowIds.has(row.id)
    ) {
      mismatch.add(expected.id);
      continue;
    }
    usedRowIds.add(row.id);
    notes.push({ id: expected.id, storedRowId: row.id, text: expected.text });
  }
  if (
    guidanceRows.length !== expectedNotes.length ||
    usedRowIds.size !== guidanceRows.length
  ) {
    mismatch.add("ordered-live-set");
  }
  if (missing.length) {
    blockers.push(
      evidenceBlocker(
        "LIVE_CHAPTER_NOTES_MISSING",
        "guidance.notes",
        `Live chapter notes are missing: ${missing.join(", ")}.`,
      ),
    );
  }
  if (mismatch.size) {
    blockers.push(
      evidenceBlocker(
        "LIVE_CHAPTER_NOTES_MISMATCH",
        "guidance.notes",
        "Live chapter notes do not exactly match the version-controlled set.",
      ),
    );
  }
  return { blockers, notes };
}

function validateLiveExample(
  rows: readonly MarkSprintLiveVoiceExampleRow[],
  expected: MarkSprintVoiceExampleIdentity,
): {
  blockers: MarkSprintRuntimeEvidenceBlocker[];
  example: MarkSprintLiveVoiceExampleRow | null;
} {
  if (!rows.length) {
    return {
      blockers: [
        evidenceBlocker(
          "LIVE_VOICE_EXAMPLE_MISSING",
          "example",
          "The exact active Mark 6 voice example is missing.",
        ),
      ],
      example: null,
    };
  }
  const row = rows.length === 1 ? rows[0] : null;
  const acceptedTitles = acceptedVoiceExampleTitles(expected);
  if (
    !row ||
    typeof row.id !== "string" ||
    !row.id.trim() ||
    !acceptedTitles.includes(row.title) ||
    row.genre !== expected.genre ||
    row.example_type !== expected.exampleType ||
    row.active !== true ||
    typeof row.content !== "string" ||
    !row.content.trim()
  ) {
    return {
      blockers: [
        evidenceBlocker(
          "LIVE_VOICE_EXAMPLE_MISMATCH",
          "example",
          "The live Mark 6 voice example is inactive, ambiguous, or mismatched.",
        ),
      ],
      example: null,
    };
  }
  return { blockers: [], example: row };
}

function blockedPreview(
  slug: MarkSprintSlug,
  policy: MarkSprintManifestPolicy,
  evidenceBlockers: MarkSprintRuntimeEvidenceBlocker[],
  ownerAuthorized: boolean,
): MarkSprintRuntimePreview {
  return deepFreeze({
    slug,
    evidenceReady: false,
    readyForGeneration: false,
    sourceBundleDigest: null,
    manifestDigest: null,
    evidenceBlockers,
    approvalBlockers: approvalBlockers(policy, [], ownerAuthorized),
    manifestFindings: [],
  });
}

function runtimePreparationResult(
  preview: MarkSprintRuntimePreview,
  prepared: MarkSprintRuntimeApprovedPreparation | null,
): MarkSprintRuntimePreparationResult {
  const result = { preview } as MarkSprintRuntimePreparationResult;
  Object.defineProperty(result, "prepared", {
    value: prepared,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(result);
}

/**
 * Give the trusted runner temporary access to exact private preparation.
 * Forged, cloned, preview-only, and blocked objects fail closed.
 */
export function withMarkSprintRuntimeApprovedPreparation<T>(
  prepared: MarkSprintRuntimeApprovedPreparation,
  use: (preparation: MarkSprintRuntimeRunnerPreparation) => T,
): T {
  const binding = APPROVED_RUNTIME_PREPARATIONS.get(prepared);
  if (!binding) {
    throw new Error("Mark sprint runtime preparation is not approved");
  }
  assertGenerationManifestV3PreflightCapability(binding.preflight, {
    sourceBundle: binding.sourceBundle,
    modelRequest: binding.modelRequest,
  });
  return use(binding);
}

/**
 * Prepare a safe v3 result from exact live evidence. Private materials are
 * retained only behind an opaque capability after every approval matches.
 */
export async function prepareMarkSprintRuntime(
  input: PrepareMarkSprintRuntimeInput,
): Promise<MarkSprintRuntimePreparationResult> {
  if (!isMarkSprintSlug(input.slug)) {
    throw new Error("Mark sprint runtime only accepts Mark 8–11");
  }
  const slug = input.slug;
  const policy = buildMarkSprintManifestPolicy(slug);
  const versioned = staticEvidence(policy);
  if (versioned.blockers.length) {
    return runtimePreparationResult(
      blockedPreview(slug, policy, versioned.blockers, input.ownerAuthorized),
      null,
    );
  }

  const identity: MarkSprintVoiceExampleIdentity = {
    title: policy.requirements.voiceExample.title,
    genre: policy.requirements.voiceExample.genre,
    exampleType: policy.requirements.voiceExample.exampleType,
  };
  const reads = await Promise.allSettled([
    input.ports.readBrainRuleRows(SEED_RULES.map((rule) => rule.id)),
    input.ports.readChapterNoteRows(slug),
    input.ports.readVoiceExampleRows(identity),
  ] as const);
  const readNames = ["brain.rules", "guidance.notes", "example"] as const;
  const readBlockers = reads.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          evidenceBlocker(
            "LIVE_READ_FAILED",
            readNames[index],
            `The ${readNames[index]} read failed closed.`,
          ),
        ]
      : [],
  );
  if (readBlockers.length) {
    return runtimePreparationResult(
      blockedPreview(slug, policy, readBlockers, input.ownerAuthorized),
      null,
    );
  }

  const brain = validateLiveBrain(
    (reads[0] as PromiseFulfilledResult<readonly MarkSprintLiveBrainRuleRow[]>).value,
    versioned.rules,
  );
  const notes = validateLiveNotes(
    slug,
    (reads[1] as PromiseFulfilledResult<readonly MarkSprintLiveChapterNoteRow[]>).value,
    versioned.notes,
    policy.requirements.chapterNotes,
  );
  const example = validateLiveExample(
    (reads[2] as PromiseFulfilledResult<readonly MarkSprintLiveVoiceExampleRow[]>).value,
    identity,
  );
  const liveBlockers = [
    ...brain.blockers,
    ...notes.blockers,
    ...example.blockers,
  ];
  if (liveBlockers.length || !example.example) {
    return runtimePreparationResult(
      blockedPreview(slug, policy, liveBlockers, input.ownerAuthorized),
      null,
    );
  }

  let bundle: MarkSprintEsvSourceBundle;
  try {
    bundle = await loadMarkSprintEsvSourceBundle({
      slug,
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    });
  } catch {
    return runtimePreparationResult(
      blockedPreview(
        slug,
        policy,
        [
          evidenceBlocker(
            "SOURCE_LOAD_FAILED",
            "source",
            "The protected ESV bundle could not be assembled.",
          ),
        ],
        input.ownerAuthorized,
      ),
      null,
    );
  }

  const chapter = Number(slug.split("-")[1]) as 7 | 8 | 9 | 10 | 11;
  const brainApproved = !policy.blockers.some(
    (blocker) => blocker.code === "brain_artifact_not_approved",
  );
  const guidanceApproved = !policy.blockers.some(
    (blocker) => blocker.code === "guidance_not_approved",
  );
  const preparation = {
    bundle,
    subject: {
      slug,
      book: "Mark" as const,
      chapter,
      readerVersion: "ESV" as const,
    },
    model: {
      id: policy.requirements.expectedModel,
      reasoningEffort: "low" as const,
      maxCompletionTokens: MARK_SPRINT_MAX_COMPLETION_TOKENS,
    },
    brain: {
      libraryVersion: policy.requirements.brain.libraryVersion,
      approved: brainApproved,
      liveMatched: true,
      rules: brain.rules,
    },
    guidance: {
      packetId: policy.requirements.guidance.packetId,
      version: policy.requirements.guidance.packetVersion,
      artifact: guidanceArtifact,
      approved: guidanceApproved,
      notes: notes.notes,
    },
    example: {
      id: example.example.id,
      title: example.example.title,
      genre: example.example.genre,
      exampleType: example.example.example_type,
      active: example.example.active,
      content: example.example.content,
    },
  };
  const modelRequest = prepareGenerationModelRequestV3(preparation);
  const requirements: GenerationManifestV3Requirements = {
    artifact: "chapter_workup",
    stage: "copy_generation",
    subject: { ...preparation.subject },
    model: { ...preparation.model },
    promptRevision: policy.requirements.requestRevision,
    brain: {
      libraryVersion: policy.requirements.brain.libraryVersion,
      approvalContentDigest: policy.requirements.brain.libraryContentDigest,
      manifestArtifactDigest: LIBRARY_MANIFEST_DIGEST,
      rules: policy.requirements.brain.requiredRules.map((rule) => ({
        id: rule.id,
        digest: rule.textDigest,
      })),
    },
    guidance: {
      packetId: policy.requirements.guidance.packetId,
      version: policy.requirements.guidance.packetVersion,
      digest: policy.requirements.guidance.contentDigest,
      notes: notes.notes.map((note) => ({
        id: note.id,
        storedRowId: note.storedRowId,
        digest: sha256Text(note.text),
      })),
    },
    example: {
      id: example.example.id,
      title: example.example.title,
      genre: example.example.genre,
      exampleType: example.example.example_type,
      contentDigest: sha256Text(example.example.content),
    },
    approvedManifestDigest: input.approvedManifestDigest ?? null,
  };
  const manifestResult = evaluateGenerationManifestV3(requirements, {
    sourceBundle: bundle,
    modelRequest,
  });
  const approvals = approvalBlockers(
    policy,
    manifestResult.findings,
    input.ownerAuthorized,
  );
  const nonApprovalManifestFindings = manifestResult.findings.filter(
    (finding) =>
      ![
        "BRAIN_NOT_APPROVED",
        "GUIDANCE_NOT_APPROVED",
        "MANIFEST_APPROVAL_MISSING",
        "MANIFEST_APPROVAL_MISMATCH",
      ].includes(finding.code),
  );
  const evidenceBlockers = nonApprovalManifestFindings.map((finding) =>
    evidenceBlocker(
      "VERSIONED_REQUIREMENTS_MISMATCH",
      finding.path,
      "Prepared v3 evidence does not match its exact requirement.",
    ),
  );
  const readyForGeneration =
    input.ownerAuthorized === true &&
    evidenceBlockers.length === 0 &&
    approvals.length === 0 &&
    manifestResult.ready;
  const preview = deepFreeze({
    slug,
    evidenceReady: evidenceBlockers.length === 0,
    readyForGeneration,
    sourceBundleDigest: bundle.bundleDigest,
    manifestDigest: manifestResult.manifestDigest,
    evidenceBlockers,
    approvalBlockers: approvals,
    manifestFindings: manifestResult.findings.map((finding) => ({ ...finding })),
  });
  let prepared: MarkSprintRuntimeApprovedPreparation | null = null;
  if (readyForGeneration) {
    const preflight = createGenerationManifestV3PreflightCapability(
      manifestResult,
      { sourceBundle: bundle, modelRequest },
    );
    prepared = Object.freeze(
      Object.create(null),
    ) as MarkSprintRuntimeApprovedPreparation;
    APPROVED_RUNTIME_PREPARATIONS.set(
      prepared,
      Object.freeze({
        sourceBundle: bundle,
        modelRequest,
        manifestResult,
        preflight,
      }),
    );
  }
  return runtimePreparationResult(preview, prepared);
}

/** Normal preview can never satisfy trusted owner authorization. */
export async function prepareMarkSprintRuntimePreview(
  input: PrepareMarkSprintRuntimePreviewInput,
): Promise<MarkSprintRuntimePreview> {
  const result = await prepareMarkSprintRuntime({
    ...input,
    ownerAuthorized: false,
  });
  return result.preview;
}
