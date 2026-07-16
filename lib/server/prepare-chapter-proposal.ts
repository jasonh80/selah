// SERVER-ONLY. The Brain's Prepare Chapter proposal (owner decision A5,
// board #29, 2026-07-16): one read-only packet built ENTIRELY from the
// reviewed, version-controlled artifacts — the same contract the owner's
// digest-bound receipt will freeze. Nothing here reads the database, spends
// credit, or mutates anything.
import {
  buildMarkSprintSetupContract,
  type MarkSprintSetupContract,
} from "./mark-sprint-setup-contracts";
import { markSprintChapterLabel } from "./mark-sprint-studio-setup";
import acceptanceArtifact from "../ai/quality/mark-sprint-acceptance.v1.json";
import { isMarkSprintSlug } from "./mark-sprint-manifest-policy";

interface AcceptanceChapter {
  expected_verse_count: number;
  required_movements: Array<{ id: string; startVerse: number; endVerse: number }>;
  manual_guardrails?: string[];
  textual_variants?: string[];
}

const acceptance = acceptanceArtifact as unknown as {
  chapters: Record<string, AcceptanceChapter>;
};

export type PrepareNoteGroup = "Teaching" | "Caution" | "Image" | "Map";

export interface PrepareChapterProposal {
  slug: string;
  label: string;
  setupDigest: string;
  expectedVerseCount: number;
  movements: Array<{ id: string; startVerse: number; endVerse: number }>;
  notes: Array<{ id: string; text: string; group: PrepareNoteGroup }>;
  watchouts: string[];
  textualVariants: string[];
  // Location-library entries ride a later config pass (owner has not yet
  // approved the certainty model) — the screen states this plainly instead
  // of showing invented pins.
  locations: Array<{ name: string; certainty: string; display: string }>;
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

export function buildPrepareChapterProposal(
  slug: string,
): PrepareChapterProposal | null {
  if (!isMarkSprintSlug(slug)) return null;
  const chapter = acceptance.chapters[slug];
  if (!chapter) return null;
  const contract: MarkSprintSetupContract = buildMarkSprintSetupContract(slug);
  if (contract.notes.length !== contract.expectedNoteCount) return null;
  return {
    slug,
    label: markSprintChapterLabel(slug),
    setupDigest: contract.setupDigest,
    expectedVerseCount: chapter.expected_verse_count,
    movements: chapter.required_movements.map(({ id, startVerse, endVerse }) => ({
      id,
      startVerse,
      endVerse,
    })),
    notes: contract.notes.map((note) => ({
      id: note.guidanceId,
      text: note.text,
      group: prepareNoteGroup(note.text),
    })),
    watchouts: [...(chapter.manual_guardrails ?? [])],
    textualVariants: [...(chapter.textual_variants ?? [])],
    locations: [],
  };
}
