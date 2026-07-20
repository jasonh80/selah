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
import {
  GLOBAL_VOICE_GENRE,
  TEXT_EXAMPLE_TYPES,
  selectRelevantExamples,
} from "../lib/server/selah-examples";
import { buildChapterWorkupPrompt } from "../lib/ai/prompts/chapter-workup-prompt";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

// 1. Shape: unique titles, non-empty verbatim content, sane lengths.
const titles = new Set(EXAMPLE_LIBRARY.map((e) => e.title));
ok(titles.size === EXAMPLE_LIBRARY.length, "titles are unique (title is the idempotency key)");
for (const e of EXAMPLE_LIBRARY) {
  // Voice packs are multi-line excerpt sets, so they get a larger (still
  // bounded) budget; everything else keeps the original bound.
  const maxLen = e.example_type === "voice" ? 1600 : 1200;
  ok(e.content.trim().length >= 80 && e.content.length <= maxLen, `${e.title}: content is substantial but bounded`);
  ok(e.source_title.length > 0, `${e.title}: names its owner-approved source`);
  ok(
    ["voice", "structure", "scene_check", "application", "image_direction"].includes(e.example_type),
    `${e.title}: valid example_type`,
  );
}

// 2. Genres must be REACHABLE — every library genre must be one genreForSlug
//    can actually produce (or the "global" voice sentinel, which retrieval
//    surfaces for EVERY chapter), or the example would never be retrieved.
const reachable = new Set(
  ["mark-9", "psalm-23", "exodus-27", "genesis-12", "exodus-3", "exodus-21", "exodus-24", "leviticus-1", "genesis-5", "genesis-40"]
    .map((slug) => genreForSlug(slug))
    .filter(Boolean),
);
for (const e of EXAMPLE_LIBRARY) {
  ok(
    reachable.has(e.genre) || (e.genre === GLOBAL_VOICE_GENRE && e.example_type === "voice"),
    `${e.title}: genre "${e.genre}" is reachable (genreForSlug or the global voice sentinel)`,
  );
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

// 3b. VOICE SOURCE RULE (Codex source audit + owner acceptance, board #29,
//     2026-07-20, superseding the 2026-07-19 no-voice hold): voice packs must
//     exist, must be chat/board-derived, and must NEVER cite published
//     chapter prose (published copy is a QA target, not voice training).
const voicePacks = EXAMPLE_LIBRARY.filter((e) => e.example_type === "voice");
ok(voicePacks.length >= 2, "voice packs exist (global + at least one genre companion)");
ok(
  voicePacks.some((e) => e.genre === GLOBAL_VOICE_GENRE),
  "a GLOBAL voice pack exists (the every-chapter fallback)",
);
const CHAT_PROVENANCE = /Daily Rundown|Daily Workup|Selah Style|voice acceptance|source audit/i;
for (const e of voicePacks) {
  ok(CHAT_PROVENANCE.test(e.source_title), `${e.title}: provenance names the approved-voice chats/board record`);
  ok(!/published/i.test(e.source_title), `${e.title}: voice provenance never cites published chapter prose`);
}

// 3c. Owner line-usage rules (board #29, 2026-07-20): the app-personality
//     exemplar must carry the full relational/self-aware turn — the weaker
//     standalone "leftovers" line must never be featured without it.
const allVoiceText = voicePacks.map((e) => e.content).join("\n");
ok(
  allVoiceText.includes("You humans, you’re remarkably consistent."),
  "app-personality exemplar keeps the owner's full two-sentence form",
);
ok(
  !allVoiceText.split("\n").some(
    (line) => line.includes("holding leftovers and still missing the point") && !line.includes("You humans"),
  ),
  "the weaker standalone leftovers line is never featured alone",
);
for (const required of [
  "Mark 6 keeps putting people close to Jesus—and showing how easy it is to miss Him.",
  "You can grow up around Jesus, listen to truth about Jesus, work for Jesus and receive from Jesus—and still miss who He is.",
  "Their faith is unfinished. Their Shepherd is not.",
]) {
  ok(allVoiceText.includes(required), `owner central-register line present verbatim: "${required.slice(0, 40)}…"`);
}

// 4. Digest is stable and content-bound.
const d1 = exampleLibraryDigest();
ok(/^[a-f0-9]{64}$/.test(d1) && d1 === exampleLibraryDigest(), "digest is a stable sha256 of the content");

// 5. Seed semantics against the REAL seed logic via the injectable port
//    (Codex #73 P1-2): strict reads fail closed, repeat/concurrent seeds
//    cannot duplicate, and the owner's hand-added rows are never touched.
const main = async () => {
  type Row = { id: string; title: string; created_at: string };
  const makeFakePort = () => {
    const rows: Row[] = [
      { id: "owner-1", title: "Mark 6 Daily Rundown Voice Example", created_at: "2026-07-01T00:00:00Z" },
    ];
    let clock = 0;
    return {
      rows,
      port: {
        async listStrict() {
          return [...rows];
        },
        async add(entry: (typeof EXAMPLE_LIBRARY)[number]) {
          rows.push({ id: `r${++clock}`, title: entry.title, created_at: `2026-07-19T00:00:0${clock}Z` });
          return true;
        },
        async remove(id: string) {
          const i = rows.findIndex((r) => r.id === id);
          if (i === -1) return false;
          rows.splice(i, 1);
          return true;
        },
      },
    };
  };

  // 5a. Fresh seed inserts everything once; re-seed inserts nothing.
  const fresh = makeFakePort();
  const first = await seedExamplesFromLibrary(fresh.port);
  ok(first.inserted === EXAMPLE_LIBRARY.length && first.failed === 0, "fresh seed inserts the whole library");
  const second = await seedExamplesFromLibrary(fresh.port);
  ok(second.inserted === 0 && second.skippedExisting === EXAMPLE_LIBRARY.length, "re-seed inserts nothing (idempotent)");
  ok(first.digest === d1 && second.digest === d1, "seed results carry the library digest");

  // 5b. CONCURRENT double-tap, worst case: seed B's initial read is STALE
  //     (taken before seed A inserted anything), so B re-inserts the whole
  //     library — the duplicates a plain read-then-insert would leave behind.
  //     B's self-heal pass (which re-reads fresh) must converge every library
  //     title back to exactly one row, keeping the oldest, and never touch
  //     the owner's hand-added row.
  const race = makeFakePort();
  await seedExamplesFromLibrary(race.port); // seed A completes normally
  const staleSnapshot = [{ id: "owner-1", title: "Mark 6 Daily Rundown Voice Example", created_at: "2026-07-01T00:00:00Z" }];
  let bReads = 0;
  const b = await seedExamplesFromLibrary({
    ...race.port,
    // First read (insert planning) is stale; the heal pass re-reads fresh.
    listStrict: async () => (++bReads === 1 ? staleSnapshot : [...race.rows]),
  });
  ok(b.inserted === EXAMPLE_LIBRARY.length, "stale read makes seed B re-insert everything (the hazard is real)");
  ok(b.duplicatesHealed === EXAMPLE_LIBRARY.length, "seed B's self-heal removes every duplicate it created");
  const counts = new Map<string, number>();
  for (const r of race.rows) counts.set(r.title, (counts.get(r.title) ?? 0) + 1);
  ok([...counts.values()].every((n) => n === 1), "after overlapping seeds every title exists exactly once");
  ok(race.rows.some((r) => r.id === "owner-1"), "the owner's hand-added row is untouched by seeding and healing");

  // 5c. A storage read error fails CLOSED: throws, zero inserts.
  let inserts = 0;
  let threw = false;
  try {
    await seedExamplesFromLibrary({
      async listStrict() {
        throw new Error("simulated read outage");
      },
      async add() {
        inserts++;
        return true;
      },
      async remove() {
        return true;
      },
    });
  } catch {
    threw = true;
  }
  ok(threw && inserts === 0, "read outage throws before ANY insert (never 'empty table, seed everything')");

  // 6. Prompt-lane separation (Codex #73 P1-1): non-voice examples must NEVER
  //    appear under the voice gold-standard framing.
  const prompt = buildChapterWorkupPrompt({
    book: "Mark",
    chapter: 99,
    examples: [
      { title: "V", exampleType: "voice", content: "VOICE-SAMPLE-CONTENT" },
      { title: "S", exampleType: "structure", content: "STRUCTURE-SAMPLE-CONTENT" },
    ],
  } as never);
  const voiceAt = prompt.indexOf("APPROVED VOICE EXAMPLE");
  const formAt = prompt.indexOf("APPROVED FORM EXAMPLES");
  ok(voiceAt !== -1 && formAt !== -1 && voiceAt < formAt, "prompt renders separate voice and form blocks");
  const voiceSection = prompt.slice(voiceAt, formAt);
  ok(voiceSection.includes("VOICE-SAMPLE-CONTENT"), "voice example sits in the voice-mimic lane");
  ok(!voiceSection.includes("STRUCTURE-SAMPLE-CONTENT"), "structure example is NOT in the voice-mimic lane");
  const formSection = prompt.slice(formAt);
  ok(formSection.includes("STRUCTURE-SAMPLE-CONTENT") && formSection.includes("do NOT imitate"), "structure example sits under shape-only framing");
  const formOnly = buildChapterWorkupPrompt({
    book: "Mark",
    chapter: 99,
    examples: [{ title: "S", exampleType: "structure", content: "STRUCTURE-SAMPLE-CONTENT" }],
  } as never);
  ok(!formOnly.includes("APPROVED VOICE EXAMPLE"), "with no voice example there is NO voice-mimic block at all");

  // 6b. CANONICAL VOICE BRIEF (owner acceptance, board #29, 2026-07-20): the
  //     brief renders in EVERY prompt — even with zero retrieved packs — and
  //     encodes the owner's register rules.
  const bare = buildChapterWorkupPrompt({ book: "Mark", chapter: 99, examples: [] } as never);
  for (const [p, label] of [
    ["SELAH VOICE — CANONICAL BRIEF", "brief header"],
    ["wise, funny, thoughtful, caring friend", "buddy identity"],
    ["arise from the passage", "zinger criteria"],
    ["never make the sufferer the joke", "zinger safety"],
    ["Familiarity can feel like understanding. It isn't.", "plain-vocabulary example"],
    ["at most once per chapter", "app-personality bound"],
    ["INFERENCE", "text/inference/unknown distinction"],
  ] as const) {
    ok(bare.includes(p) && prompt.includes(p), `canonical brief always present: ${label}`);
  }

  // 7. RETRIEVAL INVENTORY (Codex handoff, board #29, 2026-07-20): prove which
  //    voice packs a chapter actually retrieves once the library is seeded —
  //    Mark 9 gets global + gospel companion; exodus-34 (which has NO genre
  //    today) still gets the global fallback. Budget caps: ≤2 voice, ≤1 form.
  // Newest-first, matching the production query's created_at DESC contract.
  const seededRows = EXAMPLE_LIBRARY.map((e, i) => ({
    title: e.title,
    genre: e.genre,
    example_type: e.example_type,
    content: e.content,
    created_at: `2026-07-20T00:00:${String(i).padStart(2, "0")}Z`,
  })).reverse();
  const inventory: string[] = [];
  for (const slug of ["mark-9", "exodus-34", "exodus-27", "psalm-23"]) {
    const genre = genreForSlug(slug);
    const picked = selectRelevantExamples(seededRows, genre, { types: TEXT_EXAMPLE_TYPES });
    const voice = picked.filter((p) => p.exampleType === "voice");
    const form = picked.filter((p) => p.exampleType !== "voice");
    ok(voice.length >= 1 && voice.length <= 2, `${slug}: 1–2 voice packs retrieved`);
    ok(form.length <= 1, `${slug}: at most one form example retrieved`);
    ok(voice.some((v) => v.title === "Selah Global Voice Pack"), `${slug}: global voice fallback always present`);
    inventory.push(
      `  ${slug} (genre: ${genre ?? "NONE"}) → voice: [${voice.map((v) => v.title).join(", ")}] · form: [${form
        .map((f) => f.title)
        .join(", ") || "—"}]`,
    );
  }
  const mark9 = selectRelevantExamples(seededRows, genreForSlug("mark-9"), { types: TEXT_EXAMPLE_TYPES });
  ok(
    mark9.some((p) => p.title === "Gospel Narrative Voice Pack"),
    "mark-9 retrieves the gospel genre voice companion",
  );
  const ex34 = selectRelevantExamples(seededRows, genreForSlug("exodus-34"), { types: TEXT_EXAMPLE_TYPES });
  ok(
    ex34.length === 1 && ex34[0].title === "Selah Global Voice Pack",
    "exodus-34 (no genre) still gets exactly the global voice fallback",
  );

  console.log("voice retrieval inventory (seeded library):");
  for (const line of inventory) console.log(line);
  console.log(`verify:example-library ✓ ${checks} checks passed (curated library shape, chat-derived voice packs, global fallback retrieval, canonical brief, fail-closed idempotent seed, voice-lane separation)`);
};

main().catch((error) => {
  console.error("verify:example-library FAILED:", error.message ?? error);
  process.exit(1);
});
