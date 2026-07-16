// Client-safe decisions for the Prepare Chapter screen (owner decision A5,
// board #29, 2026-07-16). The API response is treated as UNTRUSTED: the
// screen renders only a strictly validated proposal, and the approve request
// carries the exact packet the owner read (with any inline note edits) plus
// the base digest of the default he was shown.
const SHA256 = /^[a-f0-9]{64}$/u;

export const PREPARE_NOTE_GROUPS = ["Teaching", "Caution", "Image", "Map"] as const;
export type PrepareNoteGroupName = (typeof PREPARE_NOTE_GROUPS)[number];

const CERTAINTIES = ["known", "debated", "uncertain"] as const;
export type PrepareLocationCertainty = (typeof CERTAINTIES)[number];

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
  locations: Array<{
    name: string;
    certainty: PrepareLocationCertainty;
    display: string;
  }>;
}

export type PrepareChapterDecision =
  | { kind: "error"; message: string }
  | { kind: "already-prepared" }
  | { kind: "proposal"; proposal: PrepareChapterViewModel };

function validStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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
        (m): m is PrepareChapterViewModel["movements"][number] =>
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
    ? p.locations.filter(
        (l): l is PrepareChapterViewModel["locations"][number] =>
          Boolean(l) &&
          typeof (l as { name?: unknown }).name === "string" &&
          (CERTAINTIES as readonly string[]).includes(
            String((l as { certainty?: unknown }).certainty),
          ) &&
          typeof (l as { display?: unknown }).display === "string",
      )
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
    },
  };
}

/** The approve request carries the FULL packet the owner is approving: the
 * server re-validates its shape, requires everything except note text to
 * equal the current default, and recomputes every digest from it. */
export function buildPrepareChapterApproveRequest(
  proposal: PrepareChapterViewModel,
  editedNoteTexts: Record<string, string>,
): Record<string, unknown> {
  if (!SHA256.test(proposal.setupDigest)) {
    throw new Error("Prepare Chapter requires the exact reviewed packet digest");
  }
  return {
    action: "prepare_chapter_approve",
    slug: proposal.slug,
    confirm: true,
    baseSetupDigest: proposal.setupDigest,
    packet: {
      movements: proposal.movements,
      notes: proposal.notes.map((note) => ({
        id: note.id,
        text: (editedNoteTexts[note.id] ?? note.text).trim() || note.text,
      })),
      watchouts: proposal.watchouts,
      textualVariants: proposal.textualVariants,
      locations: proposal.locations,
    },
  };
}

// "8 movements · 10 notes · 3 locations · 3 uncertainties" (spec's sticky
// finish row). Uncertainties = textual variants plus uncertain locations.
export function prepareSummaryLine(proposal: PrepareChapterViewModel): string {
  const uncertainties =
    proposal.textualVariants.length +
    proposal.locations.filter((location) => location.certainty === "uncertain").length;
  return [
    `${proposal.movements.length} movements`,
    `${proposal.notes.length} notes`,
    `${proposal.locations.length} locations`,
    `${uncertainties} uncertainties`,
  ].join(" · ");
}
