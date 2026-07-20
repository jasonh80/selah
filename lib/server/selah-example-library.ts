// SERVER-ONLY. The Approved-Examples LIBRARY (owner gap report, 2026-07-19:
// "how do we only have 2 approved examples???") — curated exemplars harvested
// VERBATIM from chapters the owner already approved and published (live rows
// read the same day) plus repo fixtures. Examples teach REGISTER, not content.
//
// Governance mirrors the Brain rules library: the library is version-controlled
// and digest-bound; Codex reviews the exact texts in the PR; seeding into the
// selah_approved_examples table happens only from the owner's explicit
// "Seed examples" tap in Studio (admin-authed route). Seeding is IDEMPOTENT
// and ADDITIVE: entries are matched by title, existing rows are never
// overwritten, deactivated, or deleted — the owner's two hand-added Mark 6
// examples stay exactly as they are.
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { addExample, deleteExample, type ExampleType } from "./selah-examples";

export const EXAMPLE_LIBRARY_VERSION = "example-library.v1";

export interface LibraryExample {
  title: string;
  source_title: string;
  genre: string;
  example_type: ExampleType;
  content: string;
}

// OWNER VOICE NOTE (2026-07-19): Jason flagged the published chapters as
// sounding "very teachery… not like a buddy." VOICE examples from those
// chapters are therefore deliberately EXCLUDED — seeding them would lock the
// teachery register in. The buddy-voice fix is its own queued item: voice
// exemplars the owner picks (the hand-added Mark 6 voice example stays the
// only active one until then). Structure, scene-check, and image-direction
// registers below are unaffected by that concern.
export const EXAMPLE_LIBRARY: readonly LibraryExample[] = [
  // ---- gospel narrative -----------------------------------------------------
  {
    title: "Mark 7 Movement Structure Example",
    // Codex #73 P1-3: content is now VERBATIM — two exact lines from the
    // owner-approved Mark 7 preload spec (board #29, approved 2026-07-15),
    // nothing synthesized.
    source_title: "Mark 7 preload spec, board #29 (owner-approved 2026-07-15) — verbatim lines",
    genre: "gospel narrative",
    example_type: "structure",
    content:
      "Required movements: 1–5 · 6–13 · 14–23 · 24–30 · 31–37. Preserve all five movements: disputed purity → the heart → two boundary-crossing encounters.",
  },
  {
    title: "Mark 9 Restored Dignity Scene Check Example",
    source_title: "Published Mark 9 scene check (owner-approved)",
    genre: "gospel narrative",
    example_type: "scene_check",
    content:
      "The suffering boy's episode can easily be pictured like a horror scene. Mark's emphasis lands elsewhere: Jesus listens to the father, commands the spirit, and lifts the boy up. The visual center should be restored dignity, not a dramatic medical close-up. Compassion first, special effects never.",
  },
  {
    title: "Mark 9 Unnamed Mountain Scene Check Example",
    source_title: "Published Mark 9 scene check (owner-approved)",
    genre: "gospel narrative",
    example_type: "scene_check",
    content:
      "The Transfiguration did not happen under a neat tourist sign reading 'Mount of Transfiguration.' Mark never names the mountain. So the best visual is a rugged, unnamed height, not a famous landmark staged like a postcard with captions helpfully supplied by the props department.",
  },
  {
    title: "Mark 9 Transfiguration Image Direction Example",
    source_title: "Published Mark 9 image prompt (owner-approved)",
    genre: "gospel narrative",
    example_type: "image_direction",
    content:
      "Photorealistic historical-documentary scene on an unnamed rugged high mountain in first-century Galilee or the northern region, natural dawn-like light, Jesus as a first-century Jewish man in simple woven garments appearing radiantly white as described in Mark 9, Peter, James, and John nearby frightened and low to the ground, Moses and Elijah present in conversation without name labels, a dense cloud overshadowing the scene, rocky terrain, sparse vegetation, worn sandals and rough cloaks; no halos or glow used as shorthand, no glowing eyes, no humanoid depiction of the Father, no beams from heaven, no identifiable modern landmark.",
  },
  // ---- poetry/psalm ---------------------------------------------------------
  {
    title: "Psalm 23 Honest Landscape Scene Check Example",
    source_title: "Psalm 23 curated scene check (repo, owner-approved)",
    genre: "poetry/psalm",
    example_type: "scene_check",
    content:
      "Don't picture a soft green lawn and a fluffy lamb. Picture dry Judean hills, scarce water, real predators, and a shadowed ravine. The shepherd carries a club and a staff because the danger is real — which is exactly why 'I will fear no evil' means something.",
  },
];

/** Digest binding the exact library content — shown in Studio + audit so the
 * owner's seed tap approves precisely these texts. */
export function exampleLibraryDigest(): string {
  const canonical = JSON.stringify(
    EXAMPLE_LIBRARY.map((e) => [e.title, e.genre, e.example_type, e.content, e.source_title]),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ExampleSeedResult {
  inserted: number;
  skippedExisting: number;
  failed: number;
  /** Library-title duplicates removed by the post-insert self-heal. */
  duplicatesHealed: number;
  total: number;
  digest: string;
}

/** IO port so the offline gate can prove the concurrency/failure semantics
 * against the REAL seed logic (Codex #73 P1-2). The production port reads the
 * table TRI-STATE — a read error THROWS instead of collapsing to "no rows". */
export interface ExampleSeedPort {
  /** All rows' (id, title, created_at), oldest first. THROWS on any storage
   * error — a failed read must never look like an empty table. */
  listStrict(): Promise<{ id: string; title: string; created_at: string }[]>;
  add(entry: LibraryExample): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

export class ExampleSeedError extends Error {}

function productionPort(): ExampleSeedPort {
  return {
    async listStrict() {
      const db = getSupabaseAdmin();
      if (!db) throw new ExampleSeedError("example storage is not configured");
      const { data, error } = await db
        .from("selah_approved_examples")
        .select("id,title,created_at")
        .order("created_at", { ascending: true });
      if (error) throw new ExampleSeedError(`example read failed: ${error.message}`);
      return (data ?? []) as { id: string; title: string; created_at: string }[];
    },
    async add(entry) {
      return addExample({
        title: entry.title,
        genre: entry.genre,
        example_type: entry.example_type,
        content: entry.content,
        source_title: entry.source_title,
      });
    },
    async remove(id) {
      return deleteExample(id);
    },
  };
}

/**
 * Idempotent, ADDITIVE seed. The table has no unique-title constraint (a
 * schema change is an owner decision — deliberately not taken here), so
 * read-then-insert alone could duplicate under a double tap or concurrent
 * request. Discipline instead (Codex #73 P1-2):
 *   1. STRICT read — a storage read error throws (zero inserts), never
 *      collapses to "empty table, insert everything".
 *   2. Insert only titles not present.
 *   3. SELF-HEAL — re-read and delete newer duplicates of any LIBRARY title
 *      (keep the oldest row). Concurrent seeds converge: whichever finishes
 *      last removes the extras. Only library-titled rows are ever touched;
 *      the owner's hand-added examples are never read, changed, or deleted.
 */
export async function seedExamplesFromLibrary(
  port: ExampleSeedPort = productionPort(),
): Promise<ExampleSeedResult> {
  const existingTitles = new Set((await port.listStrict()).map((e) => e.title));
  let inserted = 0;
  let skippedExisting = 0;
  let failed = 0;
  for (const entry of EXAMPLE_LIBRARY) {
    if (existingTitles.has(entry.title)) {
      skippedExisting++;
      continue;
    }
    if (await port.add(entry)) inserted++;
    else failed++;
  }
  // Self-heal pass: converge duplicates of LIBRARY titles to the oldest row.
  let duplicatesHealed = 0;
  const libraryTitles = new Set(EXAMPLE_LIBRARY.map((e) => e.title));
  const after = await port.listStrict();
  const seen = new Set<string>();
  for (const row of after) {
    if (!libraryTitles.has(row.title)) continue;
    if (seen.has(row.title)) {
      if (await port.remove(row.id)) duplicatesHealed++;
    } else {
      seen.add(row.title);
    }
  }
  return {
    inserted,
    skippedExisting,
    failed,
    duplicatesHealed,
    total: EXAMPLE_LIBRARY.length,
    digest: exampleLibraryDigest(),
  };
}
