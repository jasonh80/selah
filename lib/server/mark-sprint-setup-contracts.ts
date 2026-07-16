// SERVER-ONLY. Per-chapter studio setup receipts for the protected Mark
// sprint, built from the same reviewed guidance artifact the manifest policy
// binds. Mark 8 keeps its original literal contract in
// mark8-studio-setup-contract.ts (already owner-approved, digests frozen);
// this factory produces the SAME shape for chapters approved later, starting
// with Mark 7. A receipt here never substitutes for Selah Brain seed approval
// and can never authorize another chapter.
import { createHash } from "node:crypto";
import guidanceArtifact from "./mark-sprint-guidance.v1.json";
import acceptanceArtifact from "../ai/quality/mark-sprint-acceptance.v1.json";
import { sha256Canonical, sha256Text } from "./generation-manifest";
import { mark8ScopedSetupApprovalApplies } from "./mark8-studio-setup-contract";
import type { MarkSprintSlug } from "./mark-sprint-manifest-policy";

interface AcceptanceChapters {
  chapters: Record<
    string,
    {
      expected_verse_count: number;
      required_movements: Array<{ id: string; startVerse: number; endVerse: number }>;
      textual_variants: string[];
    }
  >;
}

interface GuidanceChapters {
  chapters: Record<string, { notes: Array<{ id: string; text: string }> }>;
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
}

const guidance = guidanceArtifact as unknown as GuidanceChapters;
const acceptance = acceptanceArtifact as unknown as AcceptanceChapters;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function deterministicNoteUuid(
  scope: string,
  noteId: string,
  textDigest: string,
): string {
  const hex = createHash("sha256")
    .update(`selah:${scope}:${noteId}:${textDigest}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export interface MarkSprintSetupNote {
  readonly guidanceId: string;
  readonly rowId: string;
  readonly text: string;
  readonly textDigest: string;
  readonly tags: readonly string[];
}

export interface MarkSprintStudioSetupApproval {
  readonly scope: string;
  readonly slug: MarkSprintSlug;
  readonly approved_by: string;
  readonly approved_at: string;
  readonly evidence: string;
  readonly guidance_digest: string;
  readonly notes_digest: string;
  readonly receipt_digest: string;
}

export interface MarkSprintSetupContract {
  readonly slug: MarkSprintSlug;
  readonly scope: string;
  readonly guidanceProjection: Readonly<Record<string, unknown>>;
  readonly guidanceDigest: string;
  readonly notes: readonly MarkSprintSetupNote[];
  readonly notesDigest: string;
  readonly setupDigest: string;
  readonly expectedNoteCount: number;
}

export function buildMarkSprintSetupContract(
  slug: MarkSprintSlug,
): MarkSprintSetupContract {
  const compact = slug.replace(/-/g, "");
  const scope = `private_studio_${compact}_guidance_and_notes`;
  const chapterNotes = guidance.chapters[slug]?.notes ?? [];
  // Bind the approval to every shared setting that can affect this chapter's
  // draft while deliberately excluding the other chapters' notes — a
  // note-only receipt must never approve the wider packet.
  const guidanceProjection = deepFreeze(
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
      chapter: { slug, notes: chapterNotes },
      // The owner's receipt binds the FULL chapter contract — exact verse
      // count, the five movement ranges, and the omitted-verse policy — not
      // only the notes (PR #30 review, hole 4).
      acceptance: {
        expectedVerseCount: acceptance.chapters[slug]?.expected_verse_count ?? null,
        requiredMovements: acceptance.chapters[slug]?.required_movements ?? [],
        textualVariants: acceptance.chapters[slug]?.textual_variants ?? [],
      },
    }),
  );
  const guidanceDigest = sha256Canonical(guidanceProjection);
  const notes = deepFreeze(
    chapterNotes.map((note) => {
      const textDigest = sha256Text(note.text);
      return {
        guidanceId: note.id,
        rowId: deterministicNoteUuid(scope, note.id, textDigest),
        text: note.text,
        textDigest,
        tags: [
          "selah-managed",
          `${compact}-studio-setup`,
          note.id,
          `sha256:${textDigest}`,
        ] as const,
      };
    }),
  );
  const notesDigest = sha256Canonical(
    notes.map(({ guidanceId, rowId, textDigest }) => ({
      guidanceId,
      rowId,
      textDigest,
    })),
  );
  const setupDigest = sha256Canonical({
    scope,
    slug,
    guidanceDigest,
    noteCount: notes.length,
    notesDigest,
  });
  return deepFreeze({
    slug,
    scope,
    guidanceProjection,
    guidanceDigest,
    notes,
    notesDigest,
    setupDigest,
    expectedNoteCount: 10,
  });
}

export function markSprintSetupApprovalMatches(
  contract: MarkSprintSetupContract,
  approval: MarkSprintStudioSetupApproval | null,
): boolean {
  return Boolean(
    approval &&
      approval.scope === contract.scope &&
      approval.slug === contract.slug &&
      approval.approved_by.trim() &&
      approval.evidence.trim() &&
      !Number.isNaN(Date.parse(approval.approved_at)) &&
      approval.guidance_digest === contract.guidanceDigest &&
      approval.notes_digest === contract.notesDigest &&
      approval.receipt_digest === contract.setupDigest &&
      contract.notes.length === contract.expectedNoteCount,
  );
}

export function markSprintScopedSetupApprovalApplies(
  slug: string,
  contract: MarkSprintSetupContract,
  approval: MarkSprintStudioSetupApproval | null,
): boolean {
  return (
    slug === contract.slug && markSprintSetupApprovalMatches(contract, approval)
  );
}

export const MARK_7_SETUP_CONTRACT = buildMarkSprintSetupContract("mark-7");

// Exact owner approval after Claude's independent read-only review of the ten
// Mark 7 notes and the bound acceptance contract (37 ESV verses, five
// movements M7-M01..M7-M05, Mark 7:16 handled as an omitted textual variant).
// These literal digests must be updated by a new review if any bound input
// changes.
export const MARK_7_STUDIO_SETUP_APPROVAL: MarkSprintStudioSetupApproval | null = {
  scope: "private_studio_mark7_guidance_and_notes",
  slug: "mark-7",
  approved_by: "Jason Hales (owner)",
  approved_at: "2026-07-15T17:07:48Z",
  evidence:
    "Owner approved the Codex-specced Mark 7 movements and guidance before the PR #30 preload, then directed this session to complete the note seeding and record his approval receipt ahead of the authorized one-text-run/one-image-run launch; no guidance or source-policy change beyond admitting Mark 7.",
  guidance_digest: "d17ab079fcfc99ab7b6d855a0e1c05c0500b059f716f9e8d9ab595be31e57611",
  notes_digest: "8c404ddcfa1cc3ff834a76fbf4f285f2f472d09c62e8c5366fe8d27c9d262c52",
  receipt_digest: "badfb817497fe7329409d8f062ddbe3c8449548051b6e10f49f64470dfd520ff",
};

// ---- connected-chapter receipt gate ------------------------------------------
// The single answer to "does this chapter's exact owner receipt apply right
// now?" — used BEFORE any settings write, job claim, worker trigger, or
// protected publish validation (PR #32 review, blockers 2 and 3). Mark 8 keeps
// its frozen literal receipt; chapters approved later use the factory
// contracts above. Any slug without an exact current receipt answers false.
const FACTORY_RECEIPTS: ReadonlyArray<{
  contract: MarkSprintSetupContract;
  approval: MarkSprintStudioSetupApproval | null;
}> = [{ contract: MARK_7_SETUP_CONTRACT, approval: MARK_7_STUDIO_SETUP_APPROVAL }];

// TEST SEAM (offline route verification only): simulate a missing or drifted
// receipt for a slug without editing the version-controlled literals.
let connectedReceiptOverridesForTesting: Record<string, boolean> | null = null;
export function __setConnectedReceiptOverridesForTesting(
  overrides: Record<string, boolean> | null,
): void {
  connectedReceiptOverridesForTesting = overrides;
}

/** Read-only view of the test override so the stored-approval gate
 * (chapter-setup-approvals.ts) honors the exact same seam. */
export function connectedReceiptOverrideForTesting(
  slug: string,
): boolean | undefined {
  return connectedReceiptOverridesForTesting?.[slug];
}

export function connectedChapterReceiptApplies(slug: string): boolean {
  const override = connectedReceiptOverridesForTesting?.[slug];
  if (override !== undefined) return override;
  if (slug === "mark-8") return mark8ScopedSetupApprovalApplies(slug);
  const factory = FACTORY_RECEIPTS.find((entry) => entry.contract.slug === slug);
  return Boolean(
    factory &&
      markSprintScopedSetupApprovalApplies(slug, factory.contract, factory.approval),
  );
}
