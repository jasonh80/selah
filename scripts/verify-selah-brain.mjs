import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const libraryPath = join(root, "lib/server/selah-brain-library.v1_1.json");
const selectorPath = join(root, "lib/server/selah-brain.ts");
const library = JSON.parse(readFileSync(libraryPath, "utf8"));
const selectorSource = readFileSync(selectorPath, "utf8");

const allowedStages = new Set([
  "copy_generation",
  "copy_review",
  "image_prompt",
  "image_review",
  "map_config",
  "governance",
]);

assert.equal(library.rule_count, library.rules.length, "rule_count must match rules.length");
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
  assert.ok(["global", "genre"].includes(rule.scope), `${rule.id} has invalid scope`);
  assert.ok(["core", "contextual", "qa", "governance"].includes(rule.priority), `${rule.id} has invalid priority`);
  assert.ok(Array.isArray(rule.stages) && rule.stages.length > 0, `${rule.id} needs stages`);
  for (const stage of rule.stages) {
    assert.ok(allowedStages.has(stage), `${rule.id} has unknown stage ${stage}`);
  }
  if (rule.scope === "genre") assert.ok(rule.genre?.trim(), `${rule.id} genre rule needs genre`);
}

const byId = new Map(library.rules.map((rule) => [rule.id, rule]));
const configuredCore = new Set(library.injection_policy.always_on_rule_ids);
const actualCore = new Set(
  library.rules
    .filter((rule) => rule.active !== false && rule.priority === "core")
    .map((rule) => rule.id),
);
assert.deepEqual(configuredCore, actualCore, "always_on_rule_ids must exactly match active core rules");

for (const id of library.injection_policy.quality_gate_rule_ids) {
  assert.equal(byId.get(id)?.priority, "qa", `${id} must be a QA rule`);
}
for (const id of library.injection_policy.governance_rule_ids_not_injected_into_copy_prompt) {
  assert.equal(byId.get(id)?.priority, "governance", `${id} must be a governance rule`);
}

const gospelProfileMatch = selectorSource.match(
  /"gospel narrative":\s*{\s*companions:\s*(\[[^\]]+\]),\s*categories:\s*(\[[^\]]+\])/m,
);
assert.ok(gospelProfileMatch, "could not read gospel narrative selection profile");
const gospelCompanions = JSON.parse(gospelProfileMatch[1]);
const gospelCategories = JSON.parse(gospelProfileMatch[2]);

const score = (rule) => {
  if (rule.scope === "genre") return rule.genre === "gospel narrative" ? 100 : -1;
  if (gospelCompanions.includes(rule.id)) return 90;
  if (gospelCategories.includes(rule.category)) return 60;
  return 20;
};

const gospelContextual = library.rules
  .filter(
    (rule) =>
      rule.active !== false &&
      rule.priority === "contextual" &&
      rule.stages.includes("copy_generation"),
  )
  .map((rule) => ({ rule, score: score(rule) }))
  .filter(({ score: value }) => value >= 0)
  .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))
  .slice(0, library.injection_policy.max_contextual_rules_per_generation)
  .map(({ rule }) => rule.id);

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
for (const id of requiredGospelRules) {
  assert.ok(gospelContextual.includes(id), `${id} must be selected for Gospel authorship`);
}
assert.ok(actualCore.has("SB-209"), "SB-209 must be injected as a core rule");
assert.ok(!gospelContextual.includes("SB-034"), "genealogy-only SB-034 should not displace Gospel safeguards");
assert.ok(!gospelContextual.includes("SB-037"), "generic providence SB-037 should not displace Gospel safeguards");

console.log(
  JSON.stringify(
    {
      ok: true,
      version: library.version,
      rules: library.rules.length,
      sources: library.source_ledger.length,
      core: actualCore.size,
      gospelContextual,
    },
    null,
    2,
  ),
);
