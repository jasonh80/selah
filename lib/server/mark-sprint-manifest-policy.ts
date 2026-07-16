// SERVER-ONLY. Read-only policy adapter for the Mark 8–11 authoring sprint.
//
// This module deliberately performs no database reads or writes and cannot
// start generation. It turns the reviewed, version-controlled artifacts into
// exact preflight requirements. The current artifacts are intentionally not
// ready for a paid run, so every returned policy fails closed.
import { CHAPTER_WORKUP_PROMPT_REVISION } from "@/lib/ai/prompts/chapter-workup-prompt";
import guidanceArtifact from "./mark-sprint-guidance.v1.json";
import { sha256Canonical, sha256Text } from "./generation-manifest";
import { librarySeedApproved } from "./selah-brain";
import {
  LIBRARY_CONTENT_DIGEST,
  LIBRARY_SEED_APPROVAL,
  LIBRARY_STATUS,
  LIBRARY_VERSION,
  INJECTION_POLICY,
  SEED_RULES,
} from "./selah-brain-library";
import { MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST } from "./mark-sprint-esv-contract";
import {
  MARK_8_SETUP_NOTES,
  MARK_8_STUDIO_SETUP_APPROVAL,
  mark8ScopedSetupApprovalApplies,
  type Mark8StudioSetupApproval,
} from "./mark8-studio-setup-contract";
import {
  buildPreparedSetupContract,
  MARK_7_SETUP_CONTRACT,
  MARK_7_STUDIO_SETUP_APPROVAL,
  markSprintScopedSetupApprovalApplies,
  type MarkSprintStudioSetupApproval,
  type PreparedChapterPacket,
} from "./mark-sprint-setup-contracts";

export const MARK_SPRINT_SLUGS = [
  "mark-7",
  "mark-8",
  "mark-9",
  "mark-10",
  "mark-11",
] as const;

export type MarkSprintSlug = (typeof MARK_SPRINT_SLUGS)[number];

interface GuidancePacket {
  packet_id: string;
  version: string;
  status: string;
  library_version: string;
  authoring_policy: {
    fresh_authorship_required: boolean;
    private_study_reference_wording_available_during_generation: boolean;
    approved_voice_example_content_available_during_generation: boolean;
    post_generation_freshness_review_required: boolean;
    owner_authorization_required: boolean;
  };
  owner_source_decision: {
    decision_id: string;
    decided_at: string;
    decision: string;
    scope: string;
    model_training_authorized: boolean;
    formal_ai_analysis_permission_confirmed: boolean;
    commercial_use_authorized: boolean;
    oeb_allowed: boolean;
  };
  source_requirement: {
    provider: string;
    name: string;
    version: string;
    api_endpoint: string;
    terms_url: string;
    permissions_url: string;
    use_basis: string;
    published_terms_ai_analysis_status: string;
    commercial_use_allowed: boolean;
    owner_selection_status: string;
    runtime_connection_status: string;
    source_text_included: boolean;
    reader_display_version: string;
    reader_and_generation_sources_are_distinct: boolean;
    retrieval_policy: string;
    storage_policy: string;
    context_chapters_each_side: number;
    context_purpose: string;
  };
  expected_model: string;
  required_rule_ids: {
    core: string[];
    gospel_contextual: string[];
  };
  required_voice_example: {
    title: string;
    genre: string;
    example_type: string;
    selection: string;
    content_digest?: string;
  };
  chapters: Record<MarkSprintSlug, {
    notes: { id: string; text: string }[];
  }>;
}

const guidance = guidanceArtifact as GuidancePacket;

export type MarkSprintPolicyBlockerCode =
  | "guidance_not_approved"
  | "brain_artifact_not_approved"
  | "brain_live_match_missing"
  | "brain_library_mismatch"
  | "required_brain_rule_missing"
  | "source_owner_selection_missing"
  | "source_not_connected"
  | "source_request_options_digest_missing"
  | "source_passage_digests_missing"
  | "source_digest_missing"
  | "model_request_digest_missing"
  | "chapter_note_row_ids_missing"
  | "voice_example_id_missing"
  | "voice_example_digest_missing"
  | "owner_authorization_missing";

export interface MarkSprintPolicyBlocker {
  code: MarkSprintPolicyBlockerCode;
  expected: string;
  actual: string | null;
  message: string;
}

export interface MarkSprintManifestRequirements {
  slug: MarkSprintSlug;
  requestRevision: string;
  expectedModelRequestDigest: null;
  expectedModel: string;
  expectedReasoningEffort: "low";
  guidance: {
    packetId: string;
    packetVersion: string;
    contentDigest: string;
    status: string;
    requiredApprovedStatus: "approved_for_generation";
  };
  brain: {
    libraryVersion: string;
    libraryContentDigest: string;
    artifactStatus: string;
    artifactApprovalDigest: string | null;
    requiredCoreRuleIds: string[];
    requiredContextualRuleIds: string[];
    requiredRules: { id: string; textDigest: string }[];
    liveMatchRequired: true;
    liveMatchEvidence: null;
  };
  /** Which versioned truth the note requirements came from: the reviewed
   * artifact (code-receipted chapters) or the owner-approved Prepare-Chapter
   * packet (its digests were validated against the stored receipt). */
  chapterNotesSource: "artifact" | "owner-approved-packet";
  chapterNotes: {
    id: string;
    textDigest: string;
    expectedStoredRowId: string | null;
  }[];
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
    ownerSelectionStatus: string;
    runtimeConnectionStatus: string;
    expectedRequestOptionsDigest: string;
    expectedPassages: Array<{
      role: "context_before" | "primary" | "context_after";
      requestedReference: string;
      expectedCanonicalReference: string;
      expectedTextDigest: null;
    }>;
    expectedBundleDigest: null;
    sourceTextIncluded: boolean;
    readerDisplayVersion: string;
    readerAndGenerationSourcesAreDistinct: boolean;
    retrievalPolicy: string;
    storagePolicy: string;
  };
  voiceExample: {
    title: string;
    genre: string;
    exampleType: string;
    selection: string;
    expectedStoredId: null;
    expectedContentDigest: string | null;
  };
  authoringPolicy: GuidancePacket["authoring_policy"];
}

export interface MarkSprintManifestPolicy {
  requirements: MarkSprintManifestRequirements;
  readyForGeneration: boolean;
  blockers: MarkSprintPolicyBlocker[];
}

export function isMarkSprintSlug(value: string): value is MarkSprintSlug {
  return (MARK_SPRINT_SLUGS as readonly string[]).includes(value);
}

/**
 * Build the exact requirements for one Mark sprint chapter.
 *
 * This is intentionally an artifact-only view: live Brain evidence, source
 * bytes, example bytes, and owner authorization must be supplied and verified
 * later by the server-owned generation manifest. They are never guessed here.
 */
export function buildMarkSprintManifestPolicy(
  slug: MarkSprintSlug,
  options: {
    mark8GuidanceApproval?: Mark8StudioSetupApproval | null;
    mark7GuidanceApproval?: MarkSprintStudioSetupApproval | null;
    /** Owner receipt recorded from the Prepare Chapter screen (Mark 9+),
     * fetched by the async caller. Validated HERE against a contract rebuilt
     * from its own stored packet — which may carry owner-edited note texts —
     * so nothing trusts the row as-is. Absent/null keeps the chapter
     * fail-closed. */
    storedGuidanceReceipt?: {
      approval: MarkSprintStudioSetupApproval;
      packet: PreparedChapterPacket;
    } | null;
  } = {},
): MarkSprintManifestPolicy {
  const requiredCoreRuleIds = [...INJECTION_POLICY.always_on_rule_ids].sort();
  const requiredContextualRuleIds = [
    ...guidance.required_rule_ids.gospel_contextual,
  ];
  const requiredRuleIds = [...requiredCoreRuleIds, ...requiredContextualRuleIds];
  const knownRuleIds = new Set(SEED_RULES.map((rule) => rule.id));
  const rulesById = new Map(SEED_RULES.map((rule) => [rule.id, rule]));
  const missingRuleIds = requiredRuleIds.filter((id) => !knownRuleIds.has(id));
  const artifactApprovalDigest = LIBRARY_SEED_APPROVAL?.content_digest ?? null;
  const brainArtifactApproved = librarySeedApproved(
    LIBRARY_STATUS,
    LIBRARY_SEED_APPROVAL,
    LIBRARY_VERSION,
    LIBRARY_CONTENT_DIGEST,
  );
  // Each connected chapter carries its OWN scoped receipt binding its exact
  // projection and ten notes. Selah Brain must still pass its own artifact
  // approval below, and no chapter can ever use another chapter's receipt.
  const exactMark8GuidanceApproved = mark8ScopedSetupApprovalApplies(
    slug,
    Object.prototype.hasOwnProperty.call(options, "mark8GuidanceApproval")
      ? options.mark8GuidanceApproval ?? null
      : MARK_8_STUDIO_SETUP_APPROVAL,
  );
  const exactMark7GuidanceApproved = markSprintScopedSetupApprovalApplies(
    slug,
    MARK_7_SETUP_CONTRACT,
    Object.prototype.hasOwnProperty.call(options, "mark7GuidanceApproval")
      ? options.mark7GuidanceApproval ?? null
      : MARK_7_STUDIO_SETUP_APPROVAL,
  );
  // A Prepare-Chapter receipt (Mark 9+) counts ONLY when it matches the
  // contract rebuilt from its own stored packet — the same digest strictness
  // as the frozen Mark 7/8 literals, with the owner's approval (and possibly
  // his edited note texts) read from the database instead of code.
  const preparedContract =
    slug !== "mark-8" && slug !== "mark-7" && options.storedGuidanceReceipt
      ? buildPreparedSetupContract(slug, options.storedGuidanceReceipt.packet)
      : null;
  const exactStoredGuidanceApproved = Boolean(
    preparedContract &&
      options.storedGuidanceReceipt &&
      markSprintScopedSetupApprovalApplies(
        slug,
        preparedContract,
        options.storedGuidanceReceipt.approval,
      ),
  );
  const exactChapterGuidanceApproved =
    exactMark8GuidanceApproved ||
    exactMark7GuidanceApproved ||
    exactStoredGuidanceApproved;
  // Deterministic note rows bind ONLY once the chapter's own scoped receipt
  // exists — an unapproved chapter stays blocked by BOTH guidance approval and
  // missing note rows (fail-closed staging, same as Mark 8 before 07-13).
  const storedNoteIds: ReadonlyMap<string, string> | null =
    slug === "mark-8"
      ? new Map(MARK_8_SETUP_NOTES.map((note) => [note.guidanceId, note.rowId]))
      : slug === "mark-7" && exactMark7GuidanceApproved
        ? new Map(
            MARK_7_SETUP_CONTRACT.notes.map((note) => [
              note.guidanceId,
              note.rowId,
            ]),
          )
        : preparedContract && exactStoredGuidanceApproved
          ? new Map(
              preparedContract.notes.map((note) => [note.guidanceId, note.rowId]),
            )
          : null;

  const requirements: MarkSprintManifestRequirements = {
    slug,
    requestRevision: CHAPTER_WORKUP_PROMPT_REVISION,
    expectedModelRequestDigest: null,
    expectedModel: guidance.expected_model,
    expectedReasoningEffort: "low",
    guidance: {
      packetId: guidance.packet_id,
      packetVersion: guidance.version,
      contentDigest: sha256Canonical(guidanceArtifact),
      status: guidance.status,
      requiredApprovedStatus: "approved_for_generation",
    },
    brain: {
      libraryVersion: LIBRARY_VERSION,
      libraryContentDigest: LIBRARY_CONTENT_DIGEST,
      artifactStatus: LIBRARY_STATUS,
      artifactApprovalDigest,
      requiredCoreRuleIds,
      requiredContextualRuleIds,
      requiredRules: requiredRuleIds.flatMap((id) => {
        const rule = rulesById.get(id);
        return rule ? [{ id, textDigest: sha256Text(rule.text) }] : [];
      }),
      liveMatchRequired: true,
      liveMatchEvidence: null,
    },
    // For a Prepare-Chapter receipt the OWNER-APPROVED PACKET is the
    // versioned truth for note text (it may carry his edits); the artifact
    // stays authoritative for every code-receipted chapter. The source is
    // recorded so live-evidence checks compare against the right one.
    chapterNotesSource:
      exactStoredGuidanceApproved && preparedContract
        ? ("owner-approved-packet" as const)
        : ("artifact" as const),
    chapterNotes:
      exactStoredGuidanceApproved && preparedContract
        ? preparedContract.notes.map((note) => ({
            id: note.guidanceId,
            textDigest: note.textDigest,
            expectedStoredRowId: note.rowId,
          }))
        : guidance.chapters[slug].notes.map((note) => ({
            id: note.id,
            textDigest: sha256Text(note.text),
            expectedStoredRowId: storedNoteIds?.get(note.id) ?? null,
          })),
    source: (() => {
      const chapter = Number(slug.split("-")[1]);
      const radius = guidance.source_requirement.context_chapters_each_side;
      const before = Math.max(1, chapter - radius);
      const after = chapter + radius;
      return {
        provider: guidance.source_requirement.provider,
        name: guidance.source_requirement.name,
        version: guidance.source_requirement.version,
        apiEndpoint: guidance.source_requirement.api_endpoint,
        termsUrl: guidance.source_requirement.terms_url,
        permissionsUrl: guidance.source_requirement.permissions_url,
        useBasis: guidance.source_requirement.use_basis,
        publishedTermsAiAnalysisStatus:
          guidance.source_requirement.published_terms_ai_analysis_status,
        commercialUseAllowed: false as const,
        ownerDecisionId: guidance.owner_source_decision.decision_id,
        ownerDecisionDigest: sha256Canonical(guidance.owner_source_decision),
        ownerSelectionStatus:
          guidance.source_requirement.owner_selection_status,
        runtimeConnectionStatus:
          guidance.source_requirement.runtime_connection_status,
        expectedRequestOptionsDigest: MARK_SPRINT_ESV_REQUEST_OPTIONS_DIGEST,
        expectedPassages: [
          {
            role: "context_before" as const,
            requestedReference: `Mark ${before}`,
            expectedCanonicalReference: `Mark ${before}`,
            expectedTextDigest: null,
          },
          {
            role: "primary" as const,
            requestedReference: `Mark ${chapter}`,
            expectedCanonicalReference: `Mark ${chapter}`,
            expectedTextDigest: null,
          },
          {
            role: "context_after" as const,
            requestedReference: `Mark ${after}`,
            expectedCanonicalReference: `Mark ${after}`,
            expectedTextDigest: null,
          },
        ],
        expectedBundleDigest: null,
        sourceTextIncluded: guidance.source_requirement.source_text_included,
        readerDisplayVersion: guidance.source_requirement.reader_display_version,
        readerAndGenerationSourcesAreDistinct:
          guidance.source_requirement.reader_and_generation_sources_are_distinct,
        retrievalPolicy: guidance.source_requirement.retrieval_policy,
        storagePolicy: guidance.source_requirement.storage_policy,
      };
    })(),
    voiceExample: {
      title: guidance.required_voice_example.title,
      genre: guidance.required_voice_example.genre,
      exampleType: guidance.required_voice_example.example_type,
      selection: guidance.required_voice_example.selection,
      expectedStoredId: null,
      expectedContentDigest:
        guidance.required_voice_example.content_digest?.trim() || null,
    },
    authoringPolicy: { ...guidance.authoring_policy },
  };

  const blockers: MarkSprintPolicyBlocker[] = [];
  if (
    guidance.status !== "approved_for_generation" &&
    !exactChapterGuidanceApproved
  ) {
    blockers.push({
      code: "guidance_not_approved",
      expected: "approved_for_generation",
      actual: guidance.status,
      message: "The Mark 8–11 guidance packet is still review-only.",
    });
  }
  if (!brainArtifactApproved) {
    blockers.push({
      code: "brain_artifact_not_approved",
      expected: `approved_for_seed:${LIBRARY_VERSION}:${LIBRARY_CONTENT_DIGEST}`,
      actual: `${LIBRARY_STATUS}:${artifactApprovalDigest ?? "no-approval-digest"}`,
      message: "The version-controlled Brain artifact lacks exact owner-bound approval.",
    });
  }
  blockers.push({
    code: "brain_live_match_missing",
    expected: `live Brain exact match:${LIBRARY_VERSION}:${LIBRARY_CONTENT_DIGEST}`,
    actual: null,
    message: "No post-seed live Brain manifest was supplied to this read-only adapter.",
  });
  if (guidance.library_version !== LIBRARY_VERSION) {
    blockers.push({
      code: "brain_library_mismatch",
      expected: LIBRARY_VERSION,
      actual: guidance.library_version,
      message: "The guidance packet targets a different Brain library version.",
    });
  }
  for (const id of missingRuleIds) {
    blockers.push({
      code: "required_brain_rule_missing",
      expected: id,
      actual: null,
      message: `Required Brain rule ${id} is absent from the candidate library.`,
    });
  }
  if (guidance.source_requirement.owner_selection_status !== "approved") {
    blockers.push({
      code: "source_owner_selection_missing",
      expected: "approved",
      actual: guidance.source_requirement.owner_selection_status,
      message: "The owner has not selected the generation Scripture source.",
    });
  }
  if (guidance.source_requirement.runtime_connection_status !== "connected") {
    blockers.push({
      code: "source_not_connected",
      expected: "connected",
      actual: guidance.source_requirement.runtime_connection_status,
      message: "The owner-selected ESV API source is not connected to the protected runner.",
    });
  }
  if (!requirements.source.expectedRequestOptionsDigest) {
    blockers.push({
      code: "source_request_options_digest_missing",
      expected: "exact SHA-256 digest of the fixed ESV API request options",
      actual: null,
      message: "The protected runner has not supplied fixed ESV API request options.",
    });
  }
  if (requirements.source.expectedPassages.some((passage) => !passage.expectedTextDigest)) {
    blockers.push({
      code: "source_passage_digests_missing",
      expected: "exact normalized text digest for every ordered ESV passage",
      actual: null,
      message: "The protected runner has not supplied the ordered ESV passage digests.",
    });
  }
  if (!requirements.source.expectedBundleDigest) {
    blockers.push({
      code: "source_digest_missing",
      expected: "exact SHA-256 digest of the complete ordered ESV source bundle",
      actual: null,
      message: "The protected runner has not supplied the ordered ESV bundle digest.",
    });
  }
  blockers.push({
    code: "model_request_digest_missing",
    expected: "exact SHA-256 digest of the complete canonical server-owned model request",
    actual: null,
    message: "The final request can only be bound after live materials are prepared.",
  });
  if (requirements.chapterNotes.some((note) => !note.expectedStoredRowId)) {
    blockers.push({
      code: "chapter_note_row_ids_missing",
      expected: "exact stored row ID for every ordered chapter note",
      actual: null,
      message: "The packet has note IDs and text digests but no live stored row identities.",
    });
  }
  blockers.push({
    code: "voice_example_id_missing",
    expected: "exact stored ID of the approved Mark 6 voice example",
    actual: null,
    message: "The artifact identifies the example by title but not by immutable stored row ID.",
  });
  if (!requirements.voiceExample.expectedContentDigest) {
    blockers.push({
      code: "voice_example_digest_missing",
      expected: "exact SHA-256 digest of the approved voice example",
      actual: null,
      message: "The guidance packet identifies the example but does not bind its exact content.",
    });
  }
  if (guidance.authoring_policy.owner_authorization_required) {
    blockers.push({
      code: "owner_authorization_missing",
      expected: "explicit authorization for this slug and revision",
      actual: null,
      message: "Owner authorization belongs to the later server-owned preflight.",
    });
  }

  return {
    requirements,
    readyForGeneration: blockers.length === 0,
    blockers,
  };
}
