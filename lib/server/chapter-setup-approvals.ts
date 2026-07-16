// SERVER-ONLY. Owner setup approvals recorded from the Prepare Chapter screen
// (owner decision A5, board #29, 2026-07-16: "preparation is no longer a PR").
//
// Each row stores the owner's approval AND the exact packet he approved
// (movements, possibly owner-edited notes, watch-outs, variants, locations).
// At every read the contract is REBUILT from the stored packet and the
// approval's digests must match it — so a row is tamper-evident end to end,
// and the shared policy projection (model, source policy, rule set) is always
// pinned to the version-controlled artifacts, never to the row.
//
// Fail-closed everywhere: no Supabase, missing row, malformed row or packet,
// or any digest drift all answer "no receipt". Mark 7 and Mark 8 keep their
// frozen code literals; this store serves chapters approved in-screen.
import { getSupabaseAdmin } from "./supabase";
import {
  buildPreparedSetupContract,
  connectedChapterReceiptApplies,
  connectedReceiptOverrideForTesting,
  markSprintScopedSetupApprovalApplies,
  type MarkSprintSetupContract,
  type MarkSprintStudioSetupApproval,
  type PreparedChapterPacket,
} from "./mark-sprint-setup-contracts";
import { validPreparedPacketShape } from "./prepare-chapter-proposal";
import { isMarkSprintSlug, type MarkSprintSlug } from "./mark-sprint-manifest-policy";

const TABLE = "chapter_setup_approvals";
const SHA256 = /^[a-f0-9]{64}$/u;

export interface StoredSetupReceipt {
  readonly approval: MarkSprintStudioSetupApproval;
  readonly packet: PreparedChapterPacket;
  readonly contract: MarkSprintSetupContract;
}

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
          "slug,scope,approved_by,approved_at,evidence,guidance_digest,notes_digest,receipt_digest,packet",
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
 * Read one stored approval and validate it COMPLETELY: strict field shapes,
 * strict packet shape, then the contract rebuilt from the stored packet must
 * match every recorded digest. Anything unexpected answers null (no receipt).
 */
export async function readValidStoredSetupReceipt(
  slug: string,
): Promise<StoredSetupReceipt | null> {
  if (!isMarkSprintSlug(slug)) return null;
  const store = productionStore();
  if (!store) return null;
  const raw = await store.read(slug);
  if (!raw) return null;
  const text = (key: string): string =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const approval: MarkSprintStudioSetupApproval = {
    scope: text("scope"),
    slug: slug as MarkSprintSlug,
    approved_by: text("approved_by"),
    approved_at: text("approved_at"),
    evidence: text("evidence"),
    guidance_digest: text("guidance_digest"),
    notes_digest: text("notes_digest"),
    receipt_digest: text("receipt_digest"),
  };
  const packet =
    typeof raw.packet === "string"
      ? safeParse(raw.packet)
      : (raw.packet as unknown);
  if (
    raw.slug !== slug ||
    !approval.approved_by.trim() ||
    !approval.evidence.trim() ||
    Number.isNaN(Date.parse(approval.approved_at)) ||
    !SHA256.test(approval.guidance_digest) ||
    !SHA256.test(approval.notes_digest) ||
    !SHA256.test(approval.receipt_digest) ||
    !validPreparedPacketShape(packet)
  ) {
    return null;
  }
  const contract = buildPreparedSetupContract(slug as MarkSprintSlug, packet);
  if (!markSprintScopedSetupApprovalApplies(slug, contract, approval)) return null;
  return { approval, packet, contract };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Persist one owner approval + its exact packet (Studio-authenticated caller
 * only). Throws on storage failure so the route can refuse instead of
 * pretending. */
export async function recordStoredSetupApproval(
  approval: MarkSprintStudioSetupApproval,
  packet: PreparedChapterPacket,
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
    packet,
  });
}

/**
 * The stored-approval-aware answer to "does this chapter's exact owner
 * receipt apply right now?" — code literals first (Mark 7/8), then a fully
 * validated stored receipt. Honors the same test overrides as the sync gate
 * so offline verifiers stay deterministic.
 */
export async function connectedChapterReceiptAppliesIncludingStored(
  slug: string,
): Promise<boolean> {
  const override = connectedReceiptOverrideForTesting(slug);
  if (override !== undefined) return override;
  if (connectedChapterReceiptApplies(slug)) return true;
  return Boolean(await readValidStoredSetupReceipt(slug));
}
