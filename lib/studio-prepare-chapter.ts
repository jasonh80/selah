// Client-safe decisions for the Prepare Chapter screen (owner decision A5,
// board #29, 2026-07-16). The API response is treated as UNTRUSTED: the
// screen renders only a strictly validated proposal, and the approve request
// echoes back exactly the digest the owner read.
const SHA256 = /^[a-f0-9]{64}$/u;

export const PREPARE_NOTE_GROUPS = ["Teaching", "Caution", "Image", "Map"] as const;
export type PrepareNoteGroupName = (typeof PREPARE_NOTE_GROUPS)[number];

export interface PrepareChapterViewModel {
  slug: string;
  label: string;
  setupDigest: string;
  expectedVerseCount: number;
  movements: Array<{ id: string; startVerse: number; endVerse: number }>;
  notes: Array<{ id: string; text: string; group: PrepareNoteGroupName }>;
  watchouts: string[];
  textualVariants: string[];
  locations: Array<{ name: string; certainty: string; display: string }>;
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
        (m): m is { id: string; startVerse: number; endVerse: number } =>
          Boolean(m) &&
          typeof (m as { id?: unknown }).id === "string" &&
          Number.isInteger((m as { startVerse?: unknown }).startVerse) &&
          Number.isInteger((m as { endVerse?: unknown }).endVerse),
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
        (l): l is { name: string; certainty: string; display: string } =>
          Boolean(l) &&
          typeof (l as { name?: unknown }).name === "string" &&
          typeof (l as { certainty?: unknown }).certainty === "string" &&
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
    (Array.isArray(p.notes) && notes.length !== p.notes.length)
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

export function buildPrepareChapterApproveRequest(
  proposal: PrepareChapterViewModel,
): Record<string, unknown> {
  if (!SHA256.test(proposal.setupDigest)) {
    throw new Error("Prepare Chapter requires the exact reviewed packet digest");
  }
  return {
    action: "prepare_chapter_approve",
    slug: proposal.slug,
    confirm: true,
    setupDigest: proposal.setupDigest,
  };
}

// "8 movements · 10 notes · 0 locations · 3 uncertainties" (spec's sticky
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
