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
      required_movements: Array<{
        id: string;
        startVerse: number;
        endVerse: number;
        // Owner-facing movement name/reason (PR #40 review, item 7) — ride
        // the projection verbatim, so they are digest-bound where present.
        name?: string;
        reason?: string;
      }>;
      manual_guardrails?: string[];
      textual_variants: string[];
      // Honest location entries (PR #40 review, item 8): certainty is the
      // approved model — "known" point, "debated" area, or "none" (no pin).
      locations?: Array<{ name: string; certainty: string; display: string }>;
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

/** One owner-editable packet note: same id set/order as the reviewed
 * artifact, text possibly edited on the Prepare screen (PR #40 review,
 * item 6). */
export interface MarkSprintPacketNote {
  readonly id: string;
  readonly text: string;
}

export const PACKET_NOTE_MAX_CHARS = 4000;

export interface MarkSprintStudioSetupApproval {
  readonly scope: string;
  readonly slug: MarkSprintSlug;
  readonly approved_by: string;
  readonly approved_at: string;
  readonly evidence: string;
  readonly guidance_digest: string;
  readonly notes_digest: string;
  readonly receipt_digest: string;
  /**
   * The exact owner-edited note texts this approval binds (null/absent =
   * the unedited version-controlled artifact notes). Digest verification
   * always recomputes the contract FROM this packet, so a stored row can
   * only ever approve the exact texts the owner read and approved.
   */
  readonly packet_notes?: readonly MarkSprintPacketNote[] | null;
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

/**
 * Whether an owner-edited packet is structurally acceptable for this chapter:
 * the exact artifact note ids in the exact artifact order, every text a
 * non-empty string within the size cap. Semantic review stays with the owner
 * and Codex; this only rejects malformed shapes.
 */
export function packetNotesValidFor(
  slug: MarkSprintSlug,
  packetNotes: readonly MarkSprintPacketNote[],
): boolean {
  const baseNotes = guidance.chapters[slug]?.notes ?? [];
  return (
    baseNotes.length > 0 &&
    packetNotes.length === baseNotes.length &&
    packetNotes.every(
      (note, index) =>
        Boolean(note) &&
        note.id === baseNotes[index].id &&
        typeof note.text === "string" &&
        note.text.trim() !== "" &&
        note.text.length <= PACKET_NOTE_MAX_CHARS,
    )
  );
}

export function buildMarkSprintSetupContract(
  slug: MarkSprintSlug,
  packetNotes?: readonly MarkSprintPacketNote[],
): MarkSprintSetupContract {
  const compact = slug.replace(/-/g, "");
  const scope = `private_studio_${compact}_guidance_and_notes`;
  // An owner-edited packet replaces the note TEXTS only — ids, order, and
  // count are pinned to the reviewed artifact, and every digest below
  // (guidance, notes, setup, deterministic row ids) derives from the exact
  // edited text, so the receipt binds precisely what the owner approved
  // (PR #40 review, item 6). A malformed packet is a server bug here — the
  // route and the stored-row reader both validate before calling.
  if (packetNotes && !packetNotesValidFor(slug, packetNotes)) {
    throw new Error(`edited ${slug} packet does not match the reviewed note structure`);
  }
  const chapterNotes = packetNotes
    ? packetNotes.map((note) => ({ id: note.id, text: note.text }))
    : guidance.chapters[slug]?.notes ?? [];
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
      // count, every movement range (with any owner-facing name/reason the
      // fixture carries), the omitted-verse policy, the displayed watch-outs
      // (PR #40 review, blocker 3), and the honest location entries — not
      // only the notes (PR #30 review, hole 4). Editing ANY of these
      // invalidates every existing receipt for the chapter.
      acceptance: {
        expectedVerseCount: acceptance.chapters[slug]?.expected_verse_count ?? null,
        requiredMovements: acceptance.chapters[slug]?.required_movements ?? [],
        manualGuardrails: acceptance.chapters[slug]?.manual_guardrails ?? [],
        textualVariants: acceptance.chapters[slug]?.textual_variants ?? [],
        locations: acceptance.chapters[slug]?.locations ?? [],
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

/**
 * The packet-aware contract an approval must be verified against: built from
 * the approval's own edited packet when it carries one, else the artifact.
 * Every consumer of a STORED approval must verify through this — comparing an
 * edited approval against the artifact contract fails closed (safe), but
 * would wrongly reject legitimately edited packets.
 */
export function setupContractForApproval(
  slug: MarkSprintSlug,
  approval: MarkSprintStudioSetupApproval | null,
): MarkSprintSetupContract {
  const packet = approval?.packet_notes ?? undefined;
  if (packet && !packetNotesValidFor(slug, packet)) {
    // A malformed stored packet can never mint a matching contract — verify
    // against the artifact contract instead, which its digests cannot match.
    return buildMarkSprintSetupContract(slug);
  }
  return buildMarkSprintSetupContract(slug, packet);
}

/** Stored-approval verification in one step, always packet-aware. */
export function markSprintStoredApprovalApplies(
  slug: string,
  approval: MarkSprintStudioSetupApproval | null,
): boolean {
  if (!approval) return false;
  const contractSlug = approval.slug;
  if (slug !== contractSlug) return false;
  return markSprintScopedSetupApprovalApplies(
    slug,
    setupContractForApproval(contractSlug, approval),
    approval,
  );
}

export const MARK_7_SETUP_CONTRACT = buildMarkSprintSetupContract("mark-7");

// Exact owner approval after Claude's independent read-only review of the ten
// Mark 7 notes and the bound acceptance contract (37 ESV verses, five
// movements M7-M01..M7-M05, Mark 7:16 handled as an omitted textual variant).
// These literal digests must be updated by a new review if any bound input
// changes.
//
// RE-MINTED 2026-07-16 (PR #40 review, blocker 3): the guidance/setup digests
// were recomputed after the projection began binding the fixture's
// manual_guardrails and location entries. NO bound content changed — the
// exact notes (notes_digest is byte-identical), movements, verse count, and
// variants the owner approved are unchanged; the projection now additionally
// freezes the watch-outs it always displayed. That re-mint shipped inside PR
// #40 for Codex re-review and the owner's merge, which is the human approval
// of the strengthened binding.
//
// RE-MINTED 2026-07-17 (maps config lane, PR #41): five honest Mark 7
// location entries were ADDED to the bound acceptance fixture — bound content
// DID change. After Codex's PR #41 review rejected the first (compressed)
// certainty model and its unevidenced approval claim, the corrected two-axis
// entries (Gennesaret/Tyre/Sidon known context points; Decapolis a known
// region with approximate boundary and no healing-site pin; the 7:31 route
// unknown and never drawn) were presented to the owner in plain English in
// the working session on 2026-07-17 and approved as shown ("Approve as
// shown"); the approval is memorialized in the PR #41 thread. notes_digest
// stays byte-identical (no note changed). Codex re-reviews the exact head
// and the owner takes the rendered-map look before merge.
//
// AMENDED same day (owner, 2026-07-17, memorialized on PR #41): the 7:31
// route entry moved unknown → probable ("broad sweep shown, never a precise
// line") after the owner asked to SEE rough A→B→C movement — which is what
// the chapter's own guardrail ("a broad possible route, never a false
// precise line") always specified. Digests re-minted for that one entry;
// notes_digest unchanged.
/**
 * The moment the BOUND CONTENT of the Mark 7 receipt last changed (the
 * corridor amendment re-mint, memorialized on PR #41). Whenever a re-mint
 * changes bound content, update BOTH this constant and `approved_at` below
 * to the new owner decision — verify:maps-honesty fails if `approved_at`
 * predates this, so a re-mint can never silently ride an old approval date
 * (PR #41 review, P1).
 */
export const MARK_7_BOUND_CONTENT_CHANGED_AT = "2026-07-17T03:44:41Z";

export const MARK_7_STUDIO_SETUP_APPROVAL: MarkSprintStudioSetupApproval | null = {
  scope: "private_studio_mark7_guidance_and_notes",
  slug: "mark-7",
  approved_by: "Jason Hales (owner)",
  // The LATEST owner decision this receipt records: the 2026-07-17 in-session
  // approval of the corrected two-axis entries + the same-day corridor
  // amendment (memorialized on PR #41). The original 2026-07-15 approval and
  // the full trail live in the evidence text.
  approved_at: "2026-07-17T03:44:41Z",
  evidence:
    "Owner approved the Codex-specced Mark 7 movements and guidance before the PR #30 preload, then directed this session to complete the note seeding and record his approval receipt ahead of the authorized one-text-run/one-image-run launch; no guidance or source-policy change beyond admitting Mark 7. Digests re-minted in PR #40 when the projection additionally bound the displayed watch-outs and locations (content unchanged), and again 2026-07-17 when the owner approved the corrected two-axis Mark 7 location entries and, later the same day, the broad-corridor amendment for the 7:31 route (matching the chapter guardrail), both in the working session and memorialized on PR #41 (maps config lane; notes unchanged).",
  guidance_digest: "023a0fcd01f9a12e9174009cd940123a897688d930b4eb802a55c3ee78f47948",
  notes_digest: "8c404ddcfa1cc3ff834a76fbf4f285f2f472d09c62e8c5366fe8d27c9d262c52",
  receipt_digest: "6ffdce370768aeadae1d15cf935032ef332a4753287c00d876b91b2672467e99",
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
