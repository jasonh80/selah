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

export const MARK_SPRINT_SLUGS = [
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
    private_benchmark_wording_available_during_generation: boolean;
    approved_voice_example_content_available_during_generation: boolean;
    post_generation_freshness_review_required: boolean;
    owner_authorization_required: boolean;
  };
  source_requirement: {
    name: string;
    version: string;
    rights: string;
    url: string;
    status: string;
    source_text_included: boolean;
    reader_display_version: string;
    reader_and_generation_sources_are_distinct: boolean;
    content_digest?: string;
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
  | "source_not_connected"
  | "source_digest_missing"
  | "prompt_digest_missing"
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
  promptRevision: string;
  expectedPromptDigest: null;
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
  chapterNotes: { id: string; textDigest: string; expectedStoredRowId: null }[];
  source: {
    name: string;
    version: string;
    rights: string;
    url: string;
    reference: string;
    status: string;
    expectedContentDigest: string | null;
    sourceTextIncluded: boolean;
    readerDisplayVersion: string;
    readerAndGenerationSourcesAreDistinct: boolean;
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

  const requirements: MarkSprintManifestRequirements = {
    slug,
    promptRevision: CHAPTER_WORKUP_PROMPT_REVISION,
    expectedPromptDigest: null,
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
    chapterNotes: guidance.chapters[slug].notes.map((note) => ({
      id: note.id,
      textDigest: sha256Text(note.text),
      expectedStoredRowId: null,
    })),
    source: {
      name: guidance.source_requirement.name,
      version: guidance.source_requirement.version,
      rights: guidance.source_requirement.rights,
      url: guidance.source_requirement.url,
      reference: `Mark ${slug.split("-")[1]}`,
      status: guidance.source_requirement.status,
      expectedContentDigest:
        guidance.source_requirement.content_digest?.trim() || null,
      sourceTextIncluded: guidance.source_requirement.source_text_included,
      readerDisplayVersion: guidance.source_requirement.reader_display_version,
      readerAndGenerationSourcesAreDistinct:
        guidance.source_requirement.reader_and_generation_sources_are_distinct,
    },
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
  if (guidance.status !== "approved_for_generation") {
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
  if (guidance.source_requirement.status !== "connected_and_approved") {
    blockers.push({
      code: "source_not_connected",
      expected: "connected_and_approved",
      actual: guidance.source_requirement.status,
      message: "The rights-cleared generation source is still only a candidate.",
    });
  }
  if (!requirements.source.expectedContentDigest) {
    blockers.push({
      code: "source_digest_missing",
      expected: "exact SHA-256 digest of the normalized authorized source text",
      actual: null,
      message: "The guidance packet does not bind the normalized source content.",
    });
  }
  blockers.push({
    code: "prompt_digest_missing",
    expected: "exact SHA-256 digest of the assembled server-owned prompt",
    actual: null,
    message: "The final prompt can only be bound after live materials are prepared.",
  });
  blockers.push({
    code: "chapter_note_row_ids_missing",
    expected: "exact stored row ID for every ordered chapter note",
    actual: null,
    message: "The packet has note IDs and text digests but no live stored row identities.",
  });
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
