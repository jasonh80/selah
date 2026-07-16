// SERVER-ONLY. Owner setup approvals recorded from the Prepare Chapter screen
// (owner decision A5, board #29, 2026-07-16: "preparation is no longer a PR").
//
// The CONTENT a receipt authorizes still lives in version-controlled artifacts
// (mark-sprint-guidance.v1.json + mark-sprint-acceptance.v1.json) and every
// digest is recomputed from those artifacts at read time — a stored row can
// only ever approve the exact reviewed packet, never arbitrary content. Only
// the APPROVAL itself (who/when/evidence + the bound digests) moves from a
// code literal to a database row written by the authenticated Studio owner.
//
// Fail-closed everywhere: no Supabase, missing row, malformed row, or any
// digest drift all answer "no receipt". Mark 7 and Mark 8 keep their frozen
// code literals; this store serves chapters approved in-screen (Mark 9+).
import { getSupabaseAdmin } from "./supabase";
import {
  connectedChapterReceiptApplies,
  connectedReceiptOverrideForTesting,
  markSprintStoredApprovalApplies,
  packetNotesValidFor,
  type MarkSprintPacketNote,
  type MarkSprintStudioSetupApproval,
} from "./mark-sprint-setup-contracts";
import { isMarkSprintSlug } from "./mark-sprint-manifest-policy";

const TABLE = "chapter_setup_approvals";
const SHA256 = /^[a-f0-9]{64}$/u;

export interface StoredSetupApprovalStore {
  read(slug: string): Promise<Record<string, unknown> | null>;
  upsert(row: Record<string, unknown>): Promise<void>;
}

// TEST SEAM (offline route verification only). Production uses the server-only
// Supabase adapter below.
let storedSetupApprovalStoreForTesting: StoredSetupApprovalStore | null = null;
export function __setStoredSetupApprovalStoreForTesting(
  store: StoredSetupApprovalStore | null,
): void {
  storedSetupApprovalStoreForTesting = store;
}

function productionStore(): StoredSetupApprovalStore | null {
  if (storedSetupApprovalStoreForTesting) return storedSetupApprovalStoreForTesting;
  const db = getSupabaseAdmin();
  if (!db) return null;
  return {
    async read(slug: string) {
      const { data, error } = await db
        .from(TABLE)
        .select(
          "slug,scope,approved_by,approved_at,evidence,guidance_digest,notes_digest,receipt_digest,packet_notes",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        console.error(`[selah] chapter setup approval read failed (${slug})`);
        return null;
      }
      return (data as Record<string, unknown> | null) ?? null;
    },
    async upsert(row: Record<string, unknown>) {
      const { error } = await db.from(TABLE).upsert(row, { onConflict: "slug" });
      if (error) {
        console.error("[selah] chapter setup approval write failed");
        throw new Error("Owner approval could not be safely recorded.");
      }
    },
  };
}

/**
 * Read one stored approval, validated STRICTLY into the exact shape the
 * receipt matcher expects. Anything unexpected — wrong slug, non-sha256
 * digests, blank strings, unparseable date — answers null (no receipt).
 */
export async function readStoredSetupApproval(
  slug: string,
): Promise<MarkSprintStudioSetupApproval | null> {
  if (!isMarkSprintSlug(slug)) return null;
  const store = productionStore();
  if (!store) return null;
  const raw = await store.read(slug);
  if (!raw) return null;
  const text = (key: string): string =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  // The optional owner-edited packet (PR #40 review, item 6): absent/null is
  // the unedited artifact; anything present must be the exact artifact note
  // structure with non-empty texts, or the whole row answers "no receipt".
  let packetNotes: readonly MarkSprintPacketNote[] | null = null;
  if (raw.packet_notes !== undefined && raw.packet_notes !== null) {
    if (!Array.isArray(raw.packet_notes)) return null;
    const candidate = raw.packet_notes.map((note) => ({
      id: typeof (note as { id?: unknown })?.id === "string" ? (note as { id: string }).id : "",
      text:
        typeof (note as { text?: unknown })?.text === "string"
          ? (note as { text: string }).text
          : "",
    }));
    if (!packetNotesValidFor(slug, candidate)) return null;
    packetNotes = candidate;
  }
  const approval: MarkSprintStudioSetupApproval = {
    scope: text("scope"),
    slug,
    approved_by: text("approved_by"),
    approved_at: text("approved_at"),
    evidence: text("evidence"),
    guidance_digest: text("guidance_digest"),
    notes_digest: text("notes_digest"),
    receipt_digest: text("receipt_digest"),
    packet_notes: packetNotes,
  };
  if (
    raw.slug !== slug ||
    !approval.approved_by.trim() ||
    !approval.evidence.trim() ||
    Number.isNaN(Date.parse(approval.approved_at)) ||
    !SHA256.test(approval.guidance_digest) ||
    !SHA256.test(approval.notes_digest) ||
    !SHA256.test(approval.receipt_digest)
  ) {
    return null;
  }
  return approval;
}

/** Persist one owner approval (Studio-authenticated caller only). Throws on
 * storage failure so the route can refuse instead of pretending. */
export async function recordStoredSetupApproval(
  approval: MarkSprintStudioSetupApproval,
): Promise<void> {
  const store = productionStore();
  if (!store) {
    throw new Error("Owner approval could not be safely recorded.");
  }
  await store.upsert({
    slug: approval.slug,
    scope: approval.scope,
    approved_by: approval.approved_by,
    approved_at: approval.approved_at,
    evidence: approval.evidence,
    guidance_digest: approval.guidance_digest,
    notes_digest: approval.notes_digest,
    receipt_digest: approval.receipt_digest,
    packet_notes: approval.packet_notes
      ? approval.packet_notes.map((note) => ({ id: note.id, text: note.text }))
      : null,
  });
}

/**
 * The stored-approval-aware answer to "does this chapter's exact owner
 * receipt apply right now?" — code literals first (Mark 7/8), then a stored
 * approval validated against the freshly recomputed contract. Honors the same
 * test overrides as the sync gate so offline verifiers stay deterministic.
 */
export async function connectedChapterReceiptAppliesIncludingStored(
  slug: string,
): Promise<boolean> {
  const override = connectedReceiptOverrideForTesting(slug);
  if (override !== undefined) return override;
  if (connectedChapterReceiptApplies(slug)) return true;
  if (!isMarkSprintSlug(slug)) return false;
  const stored = await readStoredSetupApproval(slug);
  if (!stored) return false;
  // Packet-aware: the digests are verified against a contract rebuilt from
  // the approval's own (possibly owner-edited) packet.
  return markSprintStoredApprovalApplies(slug, stored);
}
