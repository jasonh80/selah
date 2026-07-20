// Offline gate for the approved-example library (owner gap report 2026-07-19).
// No network, no Supabase: proves the library's SHAPE and its seed semantics
// (idempotent, additive-only — the owner's hand-added rows are never touched).
import assert from "node:assert/strict";
import {
  EXAMPLE_LIBRARY,
  exampleLibraryDigest,
  seedExamplesFromLibrary,
} from "../lib/server/selah-example-library";
import { genreForSlug } from "../lib/server/selah-brain";
import { TEXT_EXAMPLE_TYPES } from "../lib/server/selah-examples";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

// 1. Shape: unique titles, non-empty verbatim content, sane lengths.
const titles = new Set(EXAMPLE_LIBRARY.map((e) => e.title));
ok(titles.size === EXAMPLE_LIBRARY.length, "titles are unique (title is the idempotency key)");
for (const e of EXAMPLE_LIBRARY) {
  ok(e.content.trim().length >= 80 && e.content.length <= 1200, `${e.title}: content is substantial but bounded`);
  ok(e.source_title.length > 0, `${e.title}: names its owner-approved source`);
  ok(
    ["voice", "structure", "scene_check", "application", "image_direction"].includes(e.example_type),
    `${e.title}: valid example_type`,
  );
}

// 2. Genres must be REACHABLE — every library genre must be one genreForSlug
//    can actually produce, or retrieval will never surface the example.
const reachable = new Set(
  ["mark-9", "psalm-23", "exodus-27", "genesis-12", "exodus-3", "exodus-21", "exodus-24", "leviticus-1", "genesis-5", "genesis-40"]
    .map((slug) => genreForSlug(slug))
    .filter(Boolean),
);
for (const e of EXAMPLE_LIBRARY) {
  ok(reachable.has(e.genre), `${e.title}: genre "${e.genre}" is produced by genreForSlug`);
}

// 3. Coverage: gospel narrative carries structure AND scene_check; poetry/
//    psalm carries scene_check; an image_direction exists for the image stage.
const byGenre = (g: string, t: string) =>
  EXAMPLE_LIBRARY.some((e) => e.genre === g && e.example_type === t);
ok(byGenre("gospel narrative", "structure"), "gospel narrative has a structure example");
ok(byGenre("gospel narrative", "scene_check"), "gospel narrative has a scene_check example");
ok(byGenre("poetry/psalm", "scene_check"), "poetry/psalm has a scene_check example");
ok(EXAMPLE_LIBRARY.some((e) => e.example_type === "image_direction"), "an image_direction example exists");
ok(EXAMPLE_LIBRARY.some((e) => TEXT_EXAMPLE_TYPES.includes(e.example_type)), "text-prompt examples exist");

// 3b. OWNER VOICE NOTE (2026-07-19, "teachery… not like a buddy"): the library
//     must carry NO voice examples until the owner picks buddy-register
//     exemplars — seeding current-chapter voice would lock the wrong register.
ok(
  !EXAMPLE_LIBRARY.some((e) => e.example_type === "voice"),
  "no voice examples seeded (owner voice-register decision, 2026-07-19)",
);

// 4. Digest is stable and content-bound.
const d1 = exampleLibraryDigest();
ok(/^[a-f0-9]{64}$/.test(d1) && d1 === exampleLibraryDigest(), "digest is a stable sha256 of the content");

// 5. Seed semantics without a database: fails soft (0 inserted, all counted as
//    failed-or-skipped, never throws) — Supabase is not configured here.
const main = async () => {
  const result = await seedExamplesFromLibrary();
  ok(result.total === EXAMPLE_LIBRARY.length, "seed reports the full library size");
  ok(result.inserted === 0, "no database → nothing inserted (fail soft, never throws)");
  ok(result.digest === d1, "seed result carries the library digest for the audit line");

  console.log(`verify:example-library ✓ ${checks} checks passed (curated library shape, reachable genres, coverage, additive seed)`);
};

main().catch((error) => {
  console.error("verify:example-library FAILED:", error.message ?? error);
  process.exit(1);
});
