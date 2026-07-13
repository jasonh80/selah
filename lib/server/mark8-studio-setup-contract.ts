// SERVER-ONLY. Exact Mark-8-only receipt for the reviewed authoring guidance
// and ten chapter notes. Selah Brain keeps its own status + seed approval;
// this receipt can never substitute for that approval or authorize another
// chapter.
import { createHash } from "node:crypto";
import guidanceArtifact from "./mark-sprint-guidance.v1.json";
import { sha256Canonical, sha256Text } from "./generation-manifest";

export const MARK_8_SETUP_SLUG = "mark-8" as const;
export const MARK_8_SETUP_SCOPE = "private_studio_mark8_guidance_and_notes" as const;

interface Mark8GuidanceSnapshot {
  packet_id: string;
  version: string;
  status: string;
  library_version: string;
  authoring_policy: Record<string, unknown>;
  owner_source_decision: Record<string, unknown>;
  source_requirement: Record<string, unknown>;
  expected_model: string;
  required_rule_ids: Record<string, unknown>;
  required_voice_example: Record<string, unknown>;
  chapters: {
    "mark-8": { notes: Array<{ id: string; text: string }> };
  };
}

const guidance = guidanceArtifact as Mark8GuidanceSnapshot;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

// Bind the Mark 8 approval to every shared setting that can affect its draft,
// while deliberately excluding Mark 9–11 notes. A note-only receipt must never
// be able to approve an otherwise review-only multi-chapter packet.
export const MARK_8_GUIDANCE_PROJECTION = deepFreeze(
  structuredClone({
    packetId: guidance.packet_id,
    packetVersion: guidance.version,
    packetStatusAtReview: guidance.status,
    libraryVersion: guidance.library_version,
    authoringPolicy: guidance.authoring_policy,
    ownerSourceDecision: guidance.owner_source_decision,
    sourceRequirement: guidance.source_requirement,
    expectedModel: guidance.expected_model,
    requiredRuleIds: guidance.required_rule_ids,
    requiredVoiceExample: guidance.required_voice_example,
    chapter: {
      slug: MARK_8_SETUP_SLUG,
      notes: guidance.chapters[MARK_8_SETUP_SLUG].notes,
    },
  }),
);

export const MARK_8_GUIDANCE_DIGEST = sha256Canonical(
  MARK_8_GUIDANCE_PROJECTION,
);

function deterministicNoteUuid(noteId: string, textDigest: string): string {
  const hex = createHash("sha256")
    .update(`selah:${MARK_8_SETUP_SCOPE}:${noteId}:${textDigest}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export const MARK_8_SETUP_NOTES = deepFreeze(
  guidance.chapters[MARK_8_SETUP_SLUG].notes.map((note) => {
    const textDigest = sha256Text(note.text);
    return {
      guidanceId: note.id,
      rowId: deterministicNoteUuid(note.id, textDigest),
      text: note.text,
      textDigest,
      tags: [
        "selah-managed",
        "mark8-studio-setup",
        note.id,
        `sha256:${textDigest}`,
      ] as const,
    };
  }),
);

export const MARK_8_SETUP_NOTES_DIGEST = sha256Canonical(
  MARK_8_SETUP_NOTES.map(({ guidanceId, rowId, textDigest }) => ({
    guidanceId,
    rowId,
    textDigest,
  })),
);

export const MARK_8_STUDIO_SETUP_DIGEST = sha256Canonical({
  scope: MARK_8_SETUP_SCOPE,
  slug: MARK_8_SETUP_SLUG,
  guidanceDigest: MARK_8_GUIDANCE_DIGEST,
  noteCount: MARK_8_SETUP_NOTES.length,
  notesDigest: MARK_8_SETUP_NOTES_DIGEST,
});

export interface Mark8StudioSetupApproval {
  readonly scope: typeof MARK_8_SETUP_SCOPE;
  readonly slug: typeof MARK_8_SETUP_SLUG;
  readonly approved_by: string;
  readonly approved_at: string;
  readonly evidence: string;
  readonly guidance_digest: string;
  readonly notes_digest: string;
  readonly receipt_digest: string;
}

// Intentionally null until the owner approves the exact Mark 8 projection and
// its ten notes.
export const MARK_8_STUDIO_SETUP_APPROVAL: Mark8StudioSetupApproval | null = null;

export function mark8StudioSetupApprovalMatches(
  approval: Mark8StudioSetupApproval | null,
): boolean {
  return Boolean(
    approval &&
      approval.scope === MARK_8_SETUP_SCOPE &&
      approval.slug === MARK_8_SETUP_SLUG &&
      approval.approved_by.trim() &&
      approval.evidence.trim() &&
      !Number.isNaN(Date.parse(approval.approved_at)) &&
      approval.guidance_digest === MARK_8_GUIDANCE_DIGEST &&
      approval.notes_digest === MARK_8_SETUP_NOTES_DIGEST &&
      approval.receipt_digest === MARK_8_STUDIO_SETUP_DIGEST &&
      MARK_8_SETUP_NOTES.length === 10,
  );
}

export function mark8ScopedSetupApprovalApplies(
  slug: string,
  approval: Mark8StudioSetupApproval | null = MARK_8_STUDIO_SETUP_APPROVAL,
): boolean {
  return slug === MARK_8_SETUP_SLUG && mark8StudioSetupApprovalMatches(approval);
}
