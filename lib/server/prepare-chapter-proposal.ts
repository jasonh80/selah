// SERVER-ONLY. The Brain's Prepare Chapter proposal (owner decision A5,
// board #29, 2026-07-16): one read-only packet assembled through the Selah
// Brain preparation flow — the reviewed guidance packet (Brain library
// version, required rule ids, authoring policy) plus the chapter's bounded
// acceptance contract — the same contract the owner's digest-bound receipt
// will freeze. The owner may edit the note texts on screen before the ONE
// approval; ids, order, movements, watch-outs, and locations stay pinned to
// the reviewed artifacts. Nothing here reads the database, spends credit, or
// mutates anything.
import {
  buildMarkSprintSetupContract,
  packetNotesValidFor,
  type MarkSprintPacketNote,
  type MarkSprintSetupContract,
} from "./mark-sprint-setup-contracts";
import { markSprintChapterLabel } from "./mark-sprint-studio-setup";
import acceptanceArtifact from "../ai/quality/mark-sprint-acceptance.v1.json";
import guidanceArtifact from "./mark-sprint-guidance.v1.json";
import { isMarkSprintSlug } from "./mark-sprint-manifest-policy";
import {
  normalizePrepareLocation,
  type PrepareLocation,
} from "../prepare-locations";

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
  // Raw fixture entries — legacy shape (Mark 9, bound byte-identical) or the
  // two-axis shape; validated + normalized via normalizePrepareLocation.
  locations?: Array<Record<string, unknown>>;
}

const acceptance = acceptanceArtifact as unknown as {
  chapters: Record<string, AcceptanceChapter>;
};
const guidance = guidanceArtifact as unknown as {
  packet_id: string;
  version: string;
  library_version: string;
  expected_model: string;
};

export type PrepareNoteGroup = "Teaching" | "Caution" | "Image" | "Map";

export { PREPARE_CERTAINTIES as LOCATION_CERTAINTIES } from "../prepare-locations";

export interface PrepareChapterProposal {
  slug: string;
  label: string;
  setupDigest: string;
  /** Component digests of the exact packet shown (server-side use only —
   * the approval row records all three). */
  guidanceDigest: string;
  notesDigest: string;
  expectedVerseCount: number;
  movements: Array<{
    id: string;
    startVerse: number;
    endVerse: number;
    name: string;
    reason: string;
  }>;
  notes: Array<{ id: string; text: string; group: PrepareNoteGroup }>;
  watchouts: string[];
  textualVariants: string[];
  // Honest location entries, normalized to the owner-approved two-axis model
  // (PR #41 review): featureKind (point/region/route/text-only) × certainty
  // (known/probable/debated/unknown) + role (event/context) — geometry never
  // derived from certainty alone, never an invented pin.
  locations: PrepareLocation[];
  // Where this proposal came from (PR #40 review, item 5): the Selah Brain
  // preparation flow — reviewed packet + Brain library — not ad-hoc code.
  proposedBy: {
    packetId: string;
    packetVersion: string;
    brainLibraryVersion: string;
    expectedModel: string;
  };
}

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
 * Build the proposal, optionally over an owner-edited note packet. The
 * returned setupDigest is ALWAYS recomputed from exactly the texts shown, so
 * the digest the owner approves binds the packet they read.
 */
export function buildPrepareChapterProposal(
  slug: string,
  packetNotes?: readonly MarkSprintPacketNote[],
): PrepareChapterProposal | null {
  if (!isMarkSprintSlug(slug)) return null;
  const chapter = acceptance.chapters[slug];
  if (!chapter) return null;
  if (packetNotes && !packetNotesValidFor(slug, packetNotes)) return null;
  const contract: MarkSprintSetupContract = buildMarkSprintSetupContract(
    slug,
    packetNotes,
  );
  if (contract.notes.length !== contract.expectedNoteCount) return null;
  const locations = (chapter.locations ?? [])
    .map((location) => normalizePrepareLocation(location))
    .filter((location): location is PrepareLocation => location !== null);
  if (locations.length !== (chapter.locations ?? []).length) return null;
  return {
    slug,
    label: markSprintChapterLabel(slug),
    setupDigest: contract.setupDigest,
    guidanceDigest: contract.guidanceDigest,
    notesDigest: contract.notesDigest,
    expectedVerseCount: chapter.expected_verse_count,
    movements: chapter.required_movements.map(
      ({ id, startVerse, endVerse, name, reason }) => ({
        id,
        startVerse,
        endVerse,
        name: name ?? "",
        reason: reason ?? "",
      }),
    ),
    notes: contract.notes.map((note) => ({
      id: note.guidanceId,
      text: note.text,
      group: prepareNoteGroup(note.text),
    })),
    watchouts: [...(chapter.manual_guardrails ?? [])],
    textualVariants: [...(chapter.textual_variants ?? [])],
    locations,
    proposedBy: {
      packetId: guidance.packet_id,
      packetVersion: guidance.version,
      brainLibraryVersion: guidance.library_version,
      expectedModel: guidance.expected_model,
    },
  };
}
