import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectRulesFromRows,
  type RuleRow,
} from "../lib/server/selah-brain";

type LibraryRule = {
  id: string;
  category: string;
  title: string;
  text: string;
  scope: string;
  genre?: string;
  stages: string[];
  sources?: string[];
  active?: boolean;
  priority: string;
};

type Library = {
  version: string;
  rule_count: number;
  source_count: number;
  rules: LibraryRule[];
  source_ledger: unknown[];
  injection_policy: {
    always_on_rule_ids: string[];
    max_contextual_rules_per_generation: number;
    quality_gate_rule_ids: string[];
    governance_rule_ids_not_injected_into_copy_prompt: string[];
  };
};

type GuidancePacket = {
  packet_id: string;
  version: string;
  status: string;
  library_version: string;
  authoring_policy: {
    fresh_authorship_required: boolean;
    benchmark_wording_available_during_generation: boolean;
    owner_authorization_required: boolean;
    maximum_notes_per_chapter: number;
  };
  source_requirement: {
    name: string;
    version: string;
    rights: string;
    url: string;
    status: string;
    source_text_included: boolean;
    reader_display_version: string;
    reader_and_generation_sources_are_distinct: boolean;
  };
  expected_model: string;
  required_rule_ids: {
    core: string[];
    gospel_contextual: string[];
  };
  required_voice_example: {
    title: string;
    genre: string;
    example_type: string;
    selection: string;
  };
  chapters: Record<
    string,
    {
      notes: { id: string; text: string }[];
    }
  >;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const libraryPath = join(
  root,
  "lib/server/selah-brain-library.v1_1.json",
);
const library = JSON.parse(readFileSync(libraryPath, "utf8")) as Library;
const guidancePath = join(root, "lib/server/mark-sprint-guidance.v1.json");
const guidanceRaw = readFileSync(guidancePath, "utf8");
const guidance = JSON.parse(guidanceRaw) as GuidancePacket;
const reviewPacketPath = join(
  root,
  "docs/selah/mark-8-11-training-packet.md",
);
const reviewPacket = readFileSync(reviewPacketPath, "utf8");

function normalizeReviewText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[‘’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reviewNotesFor(slug: string): string[] {
  const chapterNumber = slug.split("-")[1];
  const heading = `## Mark ${chapterNumber} (\`${slug}\`)`;
  const start = reviewPacket.indexOf(heading);
  assert.notEqual(start, -1, `missing human-review section for ${slug}`);
  const sectionStart = start + heading.length;
  const nextHeading = reviewPacket.indexOf("\n## ", sectionStart);
  const section = reviewPacket.slice(
    sectionStart,
    nextHeading === -1 ? reviewPacket.length : nextHeading,
  );
  const notes: string[] = [];
  let current = "";
  for (const line of section.split("\n")) {
    const firstLine = line.match(/^\d+\.\s+(.*)$/);
    if (firstLine) {
      if (current) notes.push(current.trim());
      current = firstLine[1];
    } else if (current && /^\s{3,}\S/.test(line)) {
      current += ` ${line.trim()}`;
    }
  }
  if (current) notes.push(current.trim());
  return notes;
}

const allowedStages = new Set([
  "copy_generation",
  "copy_review",
  "image_prompt",
  "image_review",
  "map_config",
  "governance",
]);

assert.equal(
  library.rule_count,
  library.rules.length,
  "rule_count must match rules.length",
);
assert.equal(
  library.source_count,
  library.source_ledger.length,
  "source_count must match source_ledger.length",
);

const ids = library.rules.map((rule) => rule.id);
assert.equal(new Set(ids).size, ids.length, "rule IDs must be unique");

for (const rule of library.rules) {
  assert.match(rule.id, /^SB-\d{3}$/, `invalid rule ID: ${rule.id}`);
  assert.ok(rule.title?.trim(), `${rule.id} needs a title`);
  assert.ok(rule.text?.trim(), `${rule.id} needs rule text`);
  assert.ok(
    ["global", "genre"].includes(rule.scope),
    `${rule.id} has invalid scope`,
  );
  assert.ok(
    ["core", "contextual", "qa", "governance"].includes(rule.priority),
    `${rule.id} has invalid priority`,
  );
  assert.ok(
    Array.isArray(rule.stages) && rule.stages.length > 0,
    `${rule.id} needs stages`,
  );
  for (const stage of rule.stages) {
    assert.ok(allowedStages.has(stage), `${rule.id} has unknown stage ${stage}`);
  }
  if (rule.scope === "genre") {
    assert.ok(rule.genre?.trim(), `${rule.id} genre rule needs genre`);
  }
}

const byId = new Map(library.rules.map((rule) => [rule.id, rule]));
const configuredCore = new Set(
  library.injection_policy.always_on_rule_ids,
);
const actualCore = new Set(
  library.rules
    .filter(
      (rule) => rule.active !== false && rule.priority === "core",
    )
    .map((rule) => rule.id),
);
assert.deepEqual(
  configuredCore,
  actualCore,
  "always_on_rule_ids must exactly match active core rules",
);

for (const id of library.injection_policy.quality_gate_rule_ids) {
  assert.equal(byId.get(id)?.priority, "qa", `${id} must be a QA rule`);
}
for (const id of
  library.injection_policy.governance_rule_ids_not_injected_into_copy_prompt) {
  assert.equal(
    byId.get(id)?.priority,
    "governance",
    `${id} must be a governance rule`,
  );
}

const rows: RuleRow[] = library.rules
  .filter((rule) => rule.active !== false)
  .map((rule) => ({
    rule_id: rule.id,
    title: rule.title,
    rule_text: rule.text,
    category: rule.category,
    scope: rule.scope,
    genre: rule.genre ?? null,
    priority: rule.priority,
    stages: rule.stages,
  }));

const expectedGospelContextual = [
  "SB-107",
  "SB-208",
  "SB-013",
  "SB-015",
  "SB-019",
  "SB-032",
  "SB-036",
  "SB-039",
  "SB-040",
  "SB-050",
  "SB-054",
  "SB-033",
];
const requiredGospelRules = [
  "SB-013",
  "SB-015",
  "SB-019",
  "SB-032",
  "SB-036",
  "SB-039",
  "SB-040",
  "SB-050",
  "SB-054",
  "SB-107",
  "SB-208",
];

const selections: Record<string, string[]> = {};
for (const slug of ["mark-8", "mark-9", "mark-10", "mark-11"]) {
  const selection = selectRulesFromRows(rows, slug, "copy_generation");
  assert.equal(selection.genre, "gospel narrative", `${slug} needs Gospel genre`);
  assert.deepEqual(
    selection.contextualIds,
    expectedGospelContextual,
    `${slug} contextual selection drifted`,
  );
  assert.ok(selection.coreIds.includes("SB-209"), `${slug} needs SB-209`);
  for (const id of requiredGospelRules) {
    assert.ok(
      selection.contextualIds.includes(id),
      `${id} must be selected for ${slug} authorship`,
    );
  }
  assert.ok(
    !selection.contextualIds.includes("SB-034"),
    `genealogy-only SB-034 should not displace ${slug} safeguards`,
  );
  assert.ok(
    !selection.contextualIds.includes("SB-037"),
    `generic providence SB-037 should not displace ${slug} safeguards`,
  );
  selections[slug] = selection.contextualIds;
}

assert.equal(guidance.status, "review_only", "guidance must not be active");
assert.equal(
  guidance.library_version,
  library.version,
  "guidance and Brain library versions must match",
);
assert.equal(
  guidance.authoring_policy.fresh_authorship_required,
  true,
  "Selah Brain must author a fresh chapter",
);
assert.equal(
  guidance.authoring_policy.benchmark_wording_available_during_generation,
  false,
  "benchmark wording must stay out of authoring context",
);
assert.equal(
  guidance.authoring_policy.owner_authorization_required,
  true,
  "owner authorization must remain required",
);
assert.equal(
  guidance.source_requirement.status,
  "candidate_not_connected",
  "source must remain visibly unconnected until reviewed",
);
assert.equal(
  guidance.source_requirement.source_text_included,
  false,
  "the guidance packet must not bundle source text",
);
assert.equal(guidance.source_requirement.name, "Open English Bible");
assert.equal(guidance.source_requirement.version, "2025.6");
assert.equal(guidance.source_requirement.rights, "CC0");
assert.equal(
  guidance.source_requirement.url,
  "https://openenglishbible.org/oeb/2025.6/read/b041.html",
);
assert.equal(guidance.source_requirement.reader_display_version, "ESV");
assert.equal(
  guidance.source_requirement.reader_and_generation_sources_are_distinct,
  true,
  "generation and reader sources must not be mislabeled",
);
assert.equal(guidance.expected_model, "gpt-5.5");
assert.deepEqual(guidance.required_voice_example, {
  title: "Mark 6 Daily Rundown",
  genre: "gospel narrative",
  example_type: "voice",
  selection: "exact_identity_required",
});
assert.deepEqual(
  Object.keys(guidance.chapters).sort(),
  ["mark-10", "mark-11", "mark-8", "mark-9"],
  "guidance must cover exactly the Tuesday Mark sprint",
);
assert.deepEqual(
  guidance.required_rule_ids.gospel_contextual,
  expectedGospelContextual,
  "guidance must require the exact verified Gospel profile",
);
for (const id of guidance.required_rule_ids.core) {
  assert.ok(actualCore.has(id), `required guidance core rule ${id} is absent`);
}

const allNoteIds: string[] = [];
const noteCounts: Record<string, number> = {};
for (const [slug, chapter] of Object.entries(guidance.chapters)) {
  assert.ok(
    !("comparison_direction" in chapter),
    `${slug} comparison-only direction leaked into loadable guidance`,
  );
  assert.ok(chapter.notes.length > 0, `${slug} needs guidance notes`);
  assert.ok(
    chapter.notes.length <=
      guidance.authoring_policy.maximum_notes_per_chapter,
    `${slug} exceeds the real chapter-note retrieval limit`,
  );
  const combined = chapter.notes.map((note) => note.text).join(" ");
  assert.ok(
    !/faith need not be loud to be real/i.test(combined),
    `${slug} contains polished benchmark wording`,
  );
  const reviewNotes = reviewNotesFor(slug);
  assert.equal(
    reviewNotes.length,
    chapter.notes.length,
    `${slug} human-review and machine guidance note counts differ`,
  );
  chapter.notes.forEach((note, index) => {
    assert.equal(
      normalizeReviewText(reviewNotes[index]),
      normalizeReviewText(note.text),
      `${note.id} differs between the human-review packet and loadable guidance`,
    );
  });
  for (const note of chapter.notes) {
    assert.match(note.id, /^M(?:8|9|10|11)-\d{2}$/);
    assert.ok(note.text.trim().length >= 40, `${note.id} is too thin`);
    allNoteIds.push(note.id);
  }
  noteCounts[slug] = chapter.notes.length;
}
for (const comparisonOnly of [
  "Learning to See Jesus Clearly",
  "Glory and Failure, Side by Side",
  "Open Hands on the Way",
  "The King Who Looks for Fruit",
  "When Jesus Looks Around",
]) {
  assert.ok(
    !guidanceRaw.includes(comparisonOnly),
    `comparison-only wording leaked into loadable guidance: ${comparisonOnly}`,
  );
}
assert.equal(
  new Set(allNoteIds).size,
  allNoteIds.length,
  "guidance note IDs must be unique for idempotent loading",
);

const withoutGospelLocality = selectRulesFromRows(
  rows.filter((rule) => rule.rule_id !== "SB-208"),
  "mark-8",
  "copy_generation",
);
assert.ok(
  !withoutGospelLocality.contextualIds.includes("SB-208"),
  "missing SB-208 must remain visible to a future fail-closed manifest",
);

const withoutOutcomeGuard = selectRulesFromRows(
  rows.filter((rule) => rule.rule_id !== "SB-209"),
  "mark-8",
  "copy_generation",
);
assert.ok(
  !withoutOutcomeGuard.coreIds.includes("SB-209"),
  "missing SB-209 must remain visible to a future fail-closed manifest",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      version: library.version,
      rules: library.rules.length,
      sources: library.source_ledger.length,
      core: actualCore.size,
      selections,
      guidance: {
        packetId: guidance.packet_id,
        status: guidance.status,
        noteCounts,
        sourceStatus: guidance.source_requirement.status,
      },
    },
    null,
    2,
  ),
);
