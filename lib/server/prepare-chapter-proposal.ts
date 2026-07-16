// SERVER-ONLY. The Brain's Prepare Chapter proposal (owner decision A5,
// board #29, 2026-07-16): the packet the owner reads, may edit (notes only),
// and approves once. The DEFAULT packet composes the reviewed,
// version-controlled artifacts; the approval then binds the exact packet the
// owner submitted. Nothing here reads the database, spends credit, or
// mutates anything.
import {
  buildPreparedSetupContract,
  type MarkSprintSetupContract,
  type PreparedChapterPacket,
  type PreparedLocation,
  type PreparedMovement,
} from "./mark-sprint-setup-contracts";
import guidanceArtifact from "./mark-sprint-guidance.v1.json";
import acceptanceArtifact from "../ai/quality/mark-sprint-acceptance.v1.json";
import locationsArtifact from "./prepare-chapter-locations.v1.json";
import { isMarkSprintSlug, type MarkSprintSlug } from "./mark-sprint-manifest-policy";

interface AcceptanceChapter {
  expected_verse_count: number;
  required_movements: Array<{
    id: string;
    startVerse: number;
    endVerse: number;
    name?: string;
    reason?: string;
  }>;
  manual_guardrails?: string[];
  textual_variants?: string[];
}

const acceptance = acceptanceArtifact as unknown as {
  chapters: Record<string, AcceptanceChapter>;
};
const guidance = guidanceArtifact as unknown as {
  chapters: Record<string, { notes: Array<{ id: string; text: string }> }>;
};
const locations = locationsArtifact as unknown as {
  chapters: Record<string, PreparedLocation[]>;
};

const MAX_NOTE_LENGTH = 2000;
const CERTAINTIES = new Set(["known", "debated", "uncertain"]);

// Local label helper (identical to mark-sprint-studio-setup's) — imported
// from neither side so the approvals ↔ proposal ↔ setup modules stay acyclic.
function chapterLabel(slug: string): string {
  const match = /^mark-(\d+)$/u.exec(slug);
  return match ? `Mark ${match[1]}` : slug;
}

export type PrepareNoteGroup = "Teaching" | "Caution" | "Image" | "Map";

// Display grouping ONLY (spec: notes "plainly grouped"): a heuristic over the
// note text with no safety role — every note is seeded identically whatever
// group it displays under, and the receipt digests bind the exact text.
export function prepareNoteGroup(text: string): PrepareNoteGroup {
  const lower = text.toLowerCase();
  if (/\b(map|location|geograph|mountain|region|route)\b/u.test(lower)) return "Map";
  if (/\b(image|scene|depict|visual|portray)\b/u.test(lower)) return "Image";
  if (
    /\b(do not|never|avoid|care|caution|honestly|not a technique|hyperbole)\b/u.test(
      lower,
    )
  ) {
    return "Caution";
  }
  return "Teaching";
}

/**
 * The Brain's default proposal for one chapter, composed from the reviewed
 * artifacts (guidance notes, acceptance movements/guardrails/variants, and
 * the location library). Null when the Brain has nothing reviewed for the
 * chapter yet — the screen cannot prepare what was never proposed.
 */
export function defaultPreparedChapterPacket(
  slug: string,
): PreparedChapterPacket | null {
  if (!isMarkSprintSlug(slug)) return null;
  const chapter = acceptance.chapters[slug];
  const notes = guidance.chapters[slug]?.notes ?? [];
  if (!chapter || notes.length === 0) return null;
  return {
    movements: chapter.required_movements.map((movement) => ({
      id: movement.id,
      startVerse: movement.startVerse,
      endVerse: movement.endVerse,
      name: movement.name ?? "",
      reason: movement.reason ?? "",
    })),
    notes: notes.map(({ id, text }) => ({ id, text })),
    watchouts: [...(chapter.manual_guardrails ?? [])],
    textualVariants: [...(chapter.textual_variants ?? [])],
    locations: (locations.chapters[slug] ?? []).map((location) => ({ ...location })),
  };
}

/** Strict structural validation of an untrusted packet. */
export function validPreparedPacketShape(
  value: unknown,
): value is PreparedChapterPacket {
  if (!value || typeof value !== "object") return false;
  const packet = value as Record<string, unknown>;
  const movements = packet.movements;
  const notes = packet.notes;
  const watchouts = packet.watchouts;
  const variants = packet.textualVariants;
  const locationList = packet.locations;
  const strings = (list: unknown): list is string[] =>
    Array.isArray(list) && list.every((item) => typeof item === "string");
  return (
    Array.isArray(movements) &&
    movements.length > 0 &&
    movements.every(
      (movement) =>
        movement &&
        typeof (movement as PreparedMovement).id === "string" &&
        Number.isInteger((movement as PreparedMovement).startVerse) &&
        Number.isInteger((movement as PreparedMovement).endVerse) &&
        typeof (movement as PreparedMovement).name === "string" &&
        typeof (movement as PreparedMovement).reason === "string",
    ) &&
    Array.isArray(notes) &&
    notes.length > 0 &&
    notes.every(
      (note) =>
        note &&
        typeof (note as { id: unknown }).id === "string" &&
        typeof (note as { text: unknown }).text === "string" &&
        (note as { text: string }).text.trim().length > 0 &&
        (note as { text: string }).text.length <= MAX_NOTE_LENGTH,
    ) &&
    strings(watchouts) &&
    strings(variants) &&
    Array.isArray(locationList) &&
    locationList.every(
      (location) =>
        location &&
        typeof (location as PreparedLocation).name === "string" &&
        CERTAINTIES.has(String((location as PreparedLocation).certainty)) &&
        typeof (location as PreparedLocation).display === "string",
    )
  );
}

/**
 * Owner editing is scoped to NOTE TEXT only (Codex spec: "ten editable
 * notes"). Everything else — movement ranges/names/reasons, watch-outs,
 * variants, locations, and the note ID sequence — must equal the Brain's
 * current default exactly, so a stale or tampered screen fails closed.
 */
export function packetMatchesDefaultExceptNoteText(
  base: PreparedChapterPacket,
  submitted: PreparedChapterPacket,
): boolean {
  const pinned = (packet: PreparedChapterPacket): string =>
    JSON.stringify({
      movements: packet.movements,
      noteIds: packet.notes.map((note) => note.id),
      watchouts: packet.watchouts,
      textualVariants: packet.textualVariants,
      locations: packet.locations,
    });
  return pinned(base) === pinned(submitted);
}

export interface PrepareChapterProposal {
  slug: string;
  label: string;
  setupDigest: string;
  expectedVerseCount: number;
  movements: PreparedMovement[];
  notes: Array<{ id: string; text: string; group: PrepareNoteGroup }>;
  watchouts: string[];
  textualVariants: string[];
  locations: PreparedLocation[];
}

export function buildPrepareChapterProposal(
  slug: string,
  packet?: PreparedChapterPacket,
): PrepareChapterProposal | null {
  if (!isMarkSprintSlug(slug)) return null;
  const effective = packet ?? defaultPreparedChapterPacket(slug);
  const chapter = acceptance.chapters[slug];
  if (!effective || !chapter) return null;
  const contract: MarkSprintSetupContract = buildPreparedSetupContract(
    slug as MarkSprintSlug,
    effective,
  );
  if (contract.notes.length !== contract.expectedNoteCount) return null;
  return {
    slug,
    label: chapterLabel(slug),
    setupDigest: contract.setupDigest,
    expectedVerseCount: chapter.expected_verse_count,
    movements: effective.movements.map((movement) => ({ ...movement })),
    notes: effective.notes.map((note) => ({
      id: note.id,
      text: note.text,
      group: prepareNoteGroup(note.text),
    })),
    watchouts: [...effective.watchouts],
    textualVariants: [...effective.textualVariants],
    locations: effective.locations.map((location) => ({ ...location })),
  };
}
