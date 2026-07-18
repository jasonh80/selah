// Client-safe decisions for the Prepare Chapter screen (owner decision A5,
// board #29, 2026-07-16). The API response is treated as UNTRUSTED: the
// screen renders only a strictly validated proposal, and the approve request
// echoes back exactly the digest the owner read — recomputed server-side for
// the exact (possibly edited) notes it submits.
const SHA256 = /^[a-f0-9]{64}$/u;

export const PREPARE_NOTE_GROUPS = ["Teaching", "Caution", "Image", "Map"] as const;
export type PrepareNoteGroupName = (typeof PREPARE_NOTE_GROUPS)[number];

export {
  PREPARE_CERTAINTIES as PREPARE_LOCATION_CERTAINTIES,
  prepareLocationBadge,
  type PrepareCertainty as PrepareLocationCertainty,
  type PrepareLocation,
} from "./prepare-locations";
import { normalizePrepareLocation, type PrepareLocation as PrepareLocationEntry } from "./prepare-locations";

export interface PrepareChapterViewModel {
  slug: string;
  label: string;
  setupDigest: string;
  expectedVerseCount: number;
  movements: Array<{
    id: string;
    startVerse: number;
    endVerse: number;
    name: string;
    reason: string;
  }>;
  notes: Array<{ id: string; text: string; group: PrepareNoteGroupName }>;
  watchouts: string[];
  textualVariants: string[];
  // Two-axis location entries (PR #41 review), normalized/validated via
  // normalizePrepareLocation — the screen renders only allowed combinations.
  locations: PrepareLocationEntry[];
  proposedBy: {
    packetId: string;
    packetVersion: string;
    brainLibraryVersion: string;
    expectedModel: string;
  } | null;
}

export type PrepareChapterDecision =
  | { kind: "error"; message: string }
  | { kind: "already-prepared" }
  | { kind: "proposal"; proposal: PrepareChapterViewModel };

function validStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readProposedBy(value: unknown): PrepareChapterViewModel["proposedBy"] {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.packetId !== "string" ||
    typeof p.packetVersion !== "string" ||
    typeof p.brainLibraryVersion !== "string" ||
    typeof p.expectedModel !== "string"
  ) {
    return null;
  }
  return {
    packetId: p.packetId,
    packetVersion: p.packetVersion,
    brainLibraryVersion: p.brainLibraryVersion,
    expectedModel: p.expectedModel,
  };
}

export function decidePrepareChapterStatus(
  slug: string,
  value: unknown,
): PrepareChapterDecision {
  const fallback = { kind: "error" as const, message: "Studio could not load this chapter's preparation." };
  if (!value || typeof value !== "object") return fallback;
  const response = value as { ok?: unknown; error?: unknown; prepare?: Record<string, unknown> };
  if (response.ok !== true || !response.prepare) {
    return {
      kind: "error",
      message: typeof response.error === "string" ? response.error : fallback.message,
    };
  }
  const p = response.prepare;
  if (p.approved === true && p.setupComplete === true) return { kind: "already-prepared" };
  const movements = Array.isArray(p.movements)
    ? p.movements.filter(
        (m): m is { id: string; startVerse: number; endVerse: number; name: string; reason: string } =>
          Boolean(m) &&
          typeof (m as { id?: unknown }).id === "string" &&
          Number.isInteger((m as { startVerse?: unknown }).startVerse) &&
          Number.isInteger((m as { endVerse?: unknown }).endVerse) &&
          typeof (m as { name?: unknown }).name === "string" &&
          typeof (m as { reason?: unknown }).reason === "string",
      )
    : [];
  const notes = Array.isArray(p.notes)
    ? p.notes.filter(
        (n): n is { id: string; text: string; group: PrepareNoteGroupName } =>
          Boolean(n) &&
          typeof (n as { id?: unknown }).id === "string" &&
          typeof (n as { text?: unknown }).text === "string" &&
          (PREPARE_NOTE_GROUPS as readonly string[]).includes(
            String((n as { group?: unknown }).group),
          ),
      )
    : [];
  const locations = Array.isArray(p.locations)
    ? p.locations
        .map((l) => normalizePrepareLocation(l))
        .filter((l): l is PrepareLocationEntry => l !== null)
    : [];
  if (
    p.slug !== slug ||
    typeof p.label !== "string" ||
    typeof p.setupDigest !== "string" ||
    !SHA256.test(p.setupDigest) ||
    !Number.isInteger(p.expectedVerseCount) ||
    movements.length === 0 ||
    notes.length === 0 ||
    !validStrings(p.watchouts) ||
    !validStrings(p.textualVariants) ||
    (Array.isArray(p.movements) && movements.length !== p.movements.length) ||
    (Array.isArray(p.notes) && notes.length !== p.notes.length) ||
    (Array.isArray(p.locations) && locations.length !== p.locations.length)
  ) {
    return fallback;
  }
  return {
    kind: "proposal",
    proposal: {
      slug,
      label: p.label,
      setupDigest: p.setupDigest,
      expectedVerseCount: p.expectedVerseCount as number,
      movements,
      notes,
      watchouts: p.watchouts,
      textualVariants: p.textualVariants,
      locations,
      proposedBy: readProposedBy(p.proposedBy),
    },
  };
}

/** The owner's on-screen texts, in artifact order — the packet an approve
 * request submits. */
export function packetNotesOf(
  proposal: PrepareChapterViewModel,
  editedTexts: Readonly<Record<string, string>>,
): Array<{ id: string; text: string }> {
  return proposal.notes.map((note) => ({
    id: note.id,
    text: editedTexts[note.id] ?? note.text,
  }));
}

export function prepareNotesEdited(
  proposal: PrepareChapterViewModel,
  editedTexts: Readonly<Record<string, string>>,
): boolean {
  return proposal.notes.some(
    (note) => (editedTexts[note.id] ?? note.text) !== note.text,
  );
}

/** READ-ONLY digest preview of the exact on-screen packet. */
export function buildPrepareChapterPreviewRequest(
  proposal: PrepareChapterViewModel,
  editedTexts: Readonly<Record<string, string>>,
): Record<string, unknown> {
  return {
    action: "prepare_chapter_preview",
    slug: proposal.slug,
    notes: packetNotesOf(proposal, editedTexts),
  };
}

/**
 * The ONE approval request: the exact on-screen notes, the digest the server
 * just computed for those exact notes (from prepare_chapter_preview, or the
 * original proposal digest when nothing was edited), AND the digest of the
 * packet as it looked when the screen OPENED — so the server can refuse if
 * the bound movements/watch-outs/locations/settings changed underneath the
 * owner's read, whether or not notes were edited.
 */
export function buildPrepareChapterApproveRequest(
  proposal: PrepareChapterViewModel,
  editedTexts: Readonly<Record<string, string>>,
  setupDigest: string,
): Record<string, unknown> {
  if (!SHA256.test(setupDigest) || !SHA256.test(proposal.setupDigest)) {
    throw new Error("Prepare Chapter requires the exact reviewed packet digest");
  }
  return {
    action: "prepare_chapter_approve",
    slug: proposal.slug,
    confirm: true,
    setupDigest,
    baseSetupDigest: proposal.setupDigest,
    notes: packetNotesOf(proposal, editedTexts),
  };
}

/** Strict parse of the prepare_chapter_preview response. */
export function readPrepareChapterPreview(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { ok?: unknown; setupDigest?: unknown };
  if (response.ok !== true || typeof response.setupDigest !== "string") return null;
  return SHA256.test(response.setupDigest) ? response.setupDigest : null;
}

// "8 movements · 10 notes · 3 locations · 3 uncertainties" (spec's sticky
// finish row). Uncertainties = textual variants needing edition-aware care.
export function prepareSummaryLine(proposal: PrepareChapterViewModel): string {
  const parts = [
    `${proposal.movements.length} movements`,
    `${proposal.notes.length} notes`,
    `${proposal.locations.length} locations`,
    `${proposal.textualVariants.length} uncertainties`,
  ];
  return parts.join(" · ");
}
