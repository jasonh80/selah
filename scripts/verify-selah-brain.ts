import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  librarySeedApproved,
  planLibrarySeed,
  selectRulesFromRows,
  type ExistingLibraryRuleRow,
  type RuleRow,
} from "../lib/server/selah-brain";
import {
  INJECTION_POLICY,
  LIBRARY_CONTENT_DIGEST,
  SEED_RULES,
  libraryContentDigestMatchesSnapshot,
} from "../lib/server/selah-brain-library";

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
  audit_basis: string;
  status: string;
  seed_approval: {
    approved_by: string;
    approved_at: string;
    evidence: string;
    library_version: string;
    content_digest: string;
  } | null;
  rule_count: number;
  source_count: number;
  rules: LibraryRule[];
  source_ledger: {
    title: string;
    genre_or_use: string;
    principal_intelligence: string;
  }[];
  injection_policy: {
    always_on_rule_ids: string[];
    max_contextual_rules_per_generation: number;
    max_contextual_rules_by_stage: Record<string, number>;
    quality_gate_rule_ids: string[];
    governance_rule_ids_not_injected_into_copy_prompt: string[];
  };
  conflict_ledger: {
    topic: string;
    earlier: string;
    resolution: string;
  }[];
};

type GuidancePacket = {
  packet_id: string;
  version: string;
  status: string;
  library_version: string;
  authoring_policy: {
    fresh_authorship_required: boolean;
    private_study_reference_wording_available_during_generation: boolean;
    approved_voice_example_content_available_during_generation: boolean;
    post_generation_freshness_review_required: boolean;
    owner_authorization_required: boolean;
    maximum_notes_per_chapter: number;
  };
  owner_source_decision: {
    decision_id: string;
    decided_at: string;
    decision: string;
    scope: string;
    model_training_authorized: boolean;
    formal_ai_analysis_permission_confirmed: boolean;
    commercial_use_authorized: boolean;
    oeb_allowed: boolean;
  };
  source_requirement: {
    provider: string;
    name: string;
    version: string;
    api_endpoint: string;
    terms_url: string;
    permissions_url: string;
    use_basis: string;
    published_terms_ai_analysis_status: string;
    commercial_use_allowed: boolean;
    owner_selection_status: string;
    runtime_connection_status: string;
    source_text_included: boolean;
    reader_display_version: string;
    reader_and_generation_sources_are_distinct: boolean;
    retrieval_policy: string;
    storage_policy: string;
    context_chapters_each_side: number;
    context_purpose: string;
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
assert.equal(library.version, "1.9", "unexpected candidate Brain version");
assert.match(LIBRARY_CONTENT_DIGEST, /^[a-f0-9]{64}$/);
assert.ok(
  libraryContentDigestMatchesSnapshot(),
  "runtime Brain snapshot must still match the approval digest",
);
assert.ok(Object.isFrozen(SEED_RULES), "seed rule array must be frozen");
assert.ok(Object.isFrozen(SEED_RULES[0]), "individual seed rules must be frozen");
assert.ok(Object.isFrozen(SEED_RULES[0].stages), "seed rule stages must be frozen");
assert.ok(Object.isFrozen(INJECTION_POLICY), "injection policy must be frozen");
assert.ok(
  Object.isFrozen(INJECTION_POLICY.always_on_rule_ids),
  "injection policy rule IDs must be frozen",
);
const firstSeedRuleText = SEED_RULES[0].text;
assert.equal(
  Reflect.set(
    SEED_RULES[0] as unknown as Record<string, unknown>,
    "text",
    "UNAPPROVED MUTATION",
  ),
  false,
  "digest-bound seed rules must refuse in-memory mutation",
);
assert.equal(SEED_RULES[0].text, firstSeedRuleText);
assert.ok(
  libraryContentDigestMatchesSnapshot(),
  "a refused mutation must leave the runtime snapshot digest-bound",
);
assert.ok(
  ["review_only", "approved_for_seed"].includes(library.status),
  "Brain artifact has an unknown seed status",
);
assert.equal(
  librarySeedApproved(library.status, library.seed_approval),
  library.status === "approved_for_seed",
  "seed status and recorded owner approval must agree",
);
if (library.status === "review_only") {
  assert.equal(library.seed_approval, null, "review-only Brain must not claim approval");
}
assert.equal(
  librarySeedApproved("approved_for_seed", {
    approved_by: "owner",
    approved_at: "2026-07-12T00:00:00.000Z",
    evidence: "reviewed-change",
    library_version: library.version,
    content_digest: LIBRARY_CONTENT_DIGEST,
  }),
  true,
  "a complete future owner approval must pass without changing verifier code",
);
assert.equal(
  librarySeedApproved("approved_for_seed", {
    approved_by: "owner",
    approved_at: "2026-07-12T00:00:00.000Z",
    evidence: "stale-review",
    library_version: library.version,
    content_digest: "0".repeat(64),
  }),
  false,
  "stale approval must not authorize changed Brain content",
);
assert.equal(library.rule_count, 99, "unexpected candidate rule count");
assert.equal(library.source_count, 36, "unexpected candidate source count");
assert.match(
  library.audit_basis,
  /Mark 6 alone is the refined app-quality benchmark/i,
  "Brain provenance must name Mark 6 as the sole refined app benchmark",
);
const exodus27Source = library.source_ledger.find(
  (source) => source.title === "Exodus 27 Overview",
);
assert.match(
  exodus27Source?.genre_or_use ?? "",
  /technical render fixture only/i,
  "Exodus 27 must remain classified as a technical fixture",
);
assert.match(
  exodus27Source?.principal_intelligence ?? "",
  /must not teach Selah voice, depth, interpretation, or app-quality standards/i,
  "Exodus 27 must never become a quality-training source",
);
assert.equal(
  library.rules.some((rule) => rule.sources?.includes("Exodus 27 Overview")),
  false,
  "no Brain rule may cite the weak Exodus 27 shell",
);
assert.equal(library.injection_policy.max_contextual_rules_per_generation, 12);
assert.deepEqual(library.injection_policy.max_contextual_rules_by_stage, {
  image_prompt: 18,
  image_review: 18,
});
const recentAuditTitle =
  "Recent Mark 8–10 and Exodus 33–34 study-chat lesson audit";
assert.ok(
  library.source_ledger.some(
    (source) => source.title === recentAuditTitle,
  ),
  "recent signed-in study-chat lesson audit must retain provenance",
);
const ledgerTitles = new Set(library.source_ledger.map((source) => source.title));
for (const rule of library.rules) {
  for (const source of rule.sources ?? []) {
    assert.ok(
      ledgerTitles.has(source),
      `${rule.id} references missing source-ledger title: ${source}`,
    );
  }
}
assert.match(byId.get("SB-004")?.text ?? "", /stands under Scripture/i);
assert.match(byId.get("SB-004")?.text ?? "", /approved Mark 6 example/i);
assert.match(byId.get("SB-004")?.text ?? "", /never its distinctive wording/i);
assert.match(byId.get("SB-032")?.text ?? "", /facial expression/i);
assert.match(byId.get("SB-032")?.text ?? "", /jewelry, accessories/i);
assert.match(byId.get("SB-032")?.text ?? "", /historically plausible detail/i);
assert.match(byId.get("SB-074")?.text ?? "", /explicitly describes/i);
assert.match(byId.get("SB-074")?.text ?? "", /text's own manifestation/i);
assert.match(byId.get("SB-074")?.text ?? "", /received or reflected/i);
for (const id of ["SB-030", "SB-031", "SB-032", "SB-036", "SB-039"]) {
  assert.ok(byId.get(id)?.stages.includes("image_prompt"), `${id} needs image_prompt`);
  assert.ok(byId.get(id)?.stages.includes("image_review"), `${id} needs image_review`);
}
for (const id of ["SB-004", "SB-030", "SB-031", "SB-032", "SB-036", "SB-039", "SB-074", "SB-124"]) {
  assert.ok(
    byId.get(id)?.sources?.includes(recentAuditTitle),
    `${id} must cite the recent study-chat lesson audit`,
  );
}
for (const id of ["SB-005", "SB-033", "SB-035"]) {
  assert.deepEqual(
    byId.get(id)?.stages,
    ["copy_generation", "copy_review"],
    `${id} must remain copy-only`,
  );
}
assert.ok(byId.get("SB-074")?.stages.includes("copy_review"));
assert.deepEqual(byId.get("SB-120")?.stages, ["copy_review"]);
assert.ok(!byId.get("SB-124")?.stages.includes("image_prompt"));
assert.ok(byId.get("SB-124")?.stages.includes("image_review"));
const glowConflict = library.conflict_ledger.find(
  (entry) => entry.topic === "No generic glow vs text-explicit supernatural effect",
);
assert.match(glowConflict?.earlier ?? "", /person bearing a received effect/i);
assert.doesNotMatch(glowConflict?.earlier ?? "", /reflected glory is explicit/i);
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
  assert.ok(selection.coreIds.includes("SB-210"), `${slug} needs SB-210 book flow`);
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

const expectedImageContextual = [
  "SB-208",
  "SB-032",
  "SB-036",
  "SB-039",
  "SB-070",
  "SB-072",
  "SB-073",
  "SB-074",
  "SB-075",
  "SB-076",
  "SB-077",
  "SB-078",
  "SB-206",
  "SB-207",
  "SB-071",
  "SB-079",
  "SB-080",
];
for (const slug of ["mark-8", "mark-9", "mark-10", "mark-11"]) {
  const promptSelection = selectRulesFromRows(rows, slug, "image_prompt");
  assert.deepEqual(promptSelection.coreIds, ["SB-030", "SB-031"]);
  assert.deepEqual(
    promptSelection.contextualIds,
    expectedImageContextual,
    `${slug} image-prompt profile drifted`,
  );
  assert.deepEqual(promptSelection.qaIds, [], "image authorship must not inject QA gates");

  const reviewSelection = selectRulesFromRows(rows, slug, "image_review");
  assert.deepEqual(reviewSelection.contextualIds, expectedImageContextual);
  assert.deepEqual(
    reviewSelection.qaIds,
    ["SB-124"],
    `${slug} image review needs the anachronism gate`,
  );
}
const craftsmanshipImageSelection = selectRulesFromRows(
  rows,
  "exodus-31",
  "image_prompt",
);
assert.deepEqual(craftsmanshipImageSelection.contextualIds, [
  "SB-032",
  "SB-036",
  "SB-039",
  "SB-070",
  "SB-072",
  "SB-073",
  "SB-074",
  "SB-075",
  "SB-076",
  "SB-077",
  "SB-078",
  "SB-206",
  "SB-207",
  "SB-136",
  "SB-137",
  "SB-071",
  "SB-079",
  "SB-080",
]);
for (const slug of ["exodus-33", "exodus-34"]) {
  const selection = selectRulesFromRows(rows, slug, "image_prompt");
  assert.ok(selection.contextualIds.includes("SB-074"), `${slug} needs SB-074`);
  assert.ok(!selection.contextualIds.includes("SB-136"), `${slug} must not get craft-only SB-136`);
  assert.ok(!selection.contextualIds.includes("SB-137"), `${slug} must not get craft-only SB-137`);
}
const copyReviewSelection = selectRulesFromRows(rows, "mark-8", "copy_review");
assert.deepEqual(copyReviewSelection.qaIds, [
  "SB-120",
  "SB-121",
  "SB-122",
  "SB-123",
  "SB-124",
  "SB-125",
]);
const scopedQa: RuleRow = {
  rule_id: "TEST-QA-GOSPEL",
  title: "Gospel-only QA probe",
  rule_text: "Gospel-only review rule.",
  category: "quality",
  scope: "genre",
  genre: "gospel narrative",
  priority: "qa",
  stages: ["image_review"],
};
assert.ok(
  selectRulesFromRows([...rows, scopedQa], "mark-8", "image_review").qaIds.includes(
    scopedQa.rule_id,
  ),
);
assert.ok(
  !selectRulesFromRows([...rows, scopedQa], "psalm-23", "image_review").qaIds.includes(
    scopedQa.rule_id,
  ),
  "genre-scoped QA must not leak into another genre",
);

const canonicalExisting: ExistingLibraryRuleRow[] = library.rules.map((rule) => ({
  rule_id: rule.id,
  title: rule.title,
  rule_text: rule.text,
  category: rule.category,
  scope: rule.scope,
  genre: rule.genre ?? null,
  priority: rule.priority,
  stages: rule.stages,
  source_titles: rule.sources ?? [],
  version: library.version,
  active: rule.active !== false,
  archived: false,
}));
const unchangedSeedPlan = planLibrarySeed(
  canonicalExisting,
  "2026-07-12T00:00:00.000Z",
);
assert.equal(unchangedSeedPlan.inserts.length, 0);
assert.equal(unchangedSeedPlan.updates.length, 0);
assert.equal(unchangedSeedPlan.unchanged, library.rule_count);
assert.deepEqual(unchangedSeedPlan.unexpectedRuleIds, []);

const priorLibraryPlan = planLibrarySeed(
  canonicalExisting.filter((row) => row.rule_id !== "SB-210"),
  "2026-07-12T00:00:00.000Z",
);
assert.deepEqual(
  priorLibraryPlan.inserts.map((insert) => insert.rule_id),
  ["SB-210"],
  "the new owner-directed book-flow rule must be an explicit seed insertion",
);

const versionOnlyPlan = planLibrarySeed(
  canonicalExisting.map((row) => ({ ...row, version: "1.6" })),
  "2026-07-12T00:00:00.000Z",
);
assert.equal(
  versionOnlyPlan.updates.length,
  0,
  "a library-version bump alone must not rewrite every live rule",
);
assert.equal(versionOnlyPlan.unchanged, library.rule_count);

const unexpectedRulePlan = planLibrarySeed([
  ...canonicalExisting,
  {
    ...canonicalExisting[0],
    rule_id: "SB-999",
    title: "Unexpected canonical rule",
  },
]);
assert.deepEqual(
  unexpectedRulePlan.unexpectedRuleIds,
  ["SB-999"],
  "removed or unknown canonical rules must fail closed for explicit retirement review",
);

const priorWiseCounsel =
  "Sound warm, confident, perceptive, pastoral, visual, and historically grounded—like a wise Bible teacher and trusted counselor, not a generic assistant.";
const staleSeedRows = canonicalExisting.map((row) => {
  if (row.rule_id === "SB-004") {
    return {
      ...row,
      rule_text: priorWiseCounsel,
      version: "1.6",
      active: false,
      archived: true,
    };
  }
  if (row.rule_id === "SB-030") {
    return {
      ...row,
      stages: ["copy_generation", "copy_review"],
      source_titles: [],
      version: "1.6",
    };
  }
  return row;
});
const reconciliationPlan = planLibrarySeed(
  staleSeedRows,
  "2026-07-12T00:00:00.000Z",
);
assert.deepEqual(reconciliationPlan.unexpectedRuleIds, []);
assert.deepEqual(
  reconciliationPlan.updates.map((update) => update.ruleId),
  ["SB-004", "SB-030"],
  "seed planning must catch wording and metadata-only changes",
);
const textUpdate = reconciliationPlan.updates[0];
assert.equal(textUpdate.previousText, priorWiseCounsel);
assert.equal(textUpdate.previousVersion, "1.6");
assert.ok(!("active" in textUpdate.values));
assert.ok(!("archived" in textUpdate.values));
const metadataUpdate = reconciliationPlan.updates[1];
assert.equal(metadataUpdate.previousText, undefined);
assert.deepEqual(metadataUpdate.values.stages, [
  "copy_generation",
  "copy_review",
  "image_prompt",
  "image_review",
]);
assert.deepEqual(metadataUpdate.values.source_titles, [recentAuditTitle]);
assert.equal(metadataUpdate.values.version, "1.9");

assert.equal(guidance.status, "review_only", "guidance must not be active");
assert.equal(guidance.packet_id, "mark-8-11-2026-07-v5");
assert.equal(guidance.version, "1.4");
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
  guidance.authoring_policy.private_study_reference_wording_available_during_generation,
  false,
  "private study-reference wording must stay out of authoring context",
);
assert.equal(
  guidance.authoring_policy.approved_voice_example_content_available_during_generation,
  true,
  "the exact approved Mark 6 voice example is the deliberate exception",
);
assert.equal(
  guidance.authoring_policy.post_generation_freshness_review_required,
  true,
  "freshness still requires an independent post-generation review",
);
assert.equal(
  guidance.authoring_policy.owner_authorization_required,
  true,
  "owner authorization must remain required",
);
assert.equal(
  guidance.owner_source_decision.decision_id,
  "mark-sprint-esv-source-2026-07-12",
);
assert.equal(guidance.owner_source_decision.decided_at, "2026-07-12");
assert.equal(
  guidance.owner_source_decision.decision,
  "use_esv_api_for_prompt_time_analysis",
);
assert.equal(guidance.owner_source_decision.model_training_authorized, false);
assert.equal(
  guidance.owner_source_decision.formal_ai_analysis_permission_confirmed,
  false,
);
assert.equal(guidance.owner_source_decision.commercial_use_authorized, false);
assert.equal(guidance.owner_source_decision.oeb_allowed, false);
assert.equal(guidance.source_requirement.owner_selection_status, "approved");
assert.equal(
  guidance.source_requirement.runtime_connection_status,
  "not_connected",
  "owner selection must not be mistaken for runtime connection",
);
assert.equal(
  guidance.source_requirement.source_text_included,
  false,
  "the guidance packet must not bundle source text",
);
assert.equal(guidance.source_requirement.provider, "Crossway");
assert.equal(guidance.source_requirement.name, "English Standard Version");
assert.equal(guidance.source_requirement.version, "ESV Text Edition: 2025");
assert.equal(
  guidance.source_requirement.api_endpoint,
  "https://api.esv.org/v3/passage/text/",
);
assert.equal(guidance.source_requirement.terms_url, "https://api.esv.org/");
assert.equal(
  guidance.source_requirement.permissions_url,
  "https://www.crossway.org/permissions/",
);
assert.equal(
  guidance.source_requirement.use_basis,
  "owner_direction_noncommercial_ministry_api_use",
);
assert.equal(
  guidance.source_requirement.published_terms_ai_analysis_status,
  "not_explicit_owner_accepts_uncertainty",
);
assert.equal(guidance.source_requirement.commercial_use_allowed, false);
assert.equal(guidance.source_requirement.reader_display_version, "ESV");
assert.equal(
  guidance.source_requirement.reader_and_generation_sources_are_distinct,
  false,
  "the owner selected ESV for both generation analysis and reader display",
);
assert.equal(
  guidance.source_requirement.retrieval_policy,
  "official_api_server_side_only",
);
assert.equal(
  guidance.source_requirement.storage_policy,
  "no_repo_no_logs_no_public_generation_output",
);
assert.equal(
  guidance.source_requirement.context_chapters_each_side,
  1,
  "book-flow authorship must receive one owner-approved adjacent chapter on each side",
);
assert.equal(guidance.source_requirement.context_purpose, "grounded_book_flow_only");
assert.doesNotMatch(
  guidanceRaw,
  /Open English Bible|OEB 2025\.6|rights-cleared/i,
  "loadable guidance still carries the rejected source policy",
);
assert.doesNotMatch(
  reviewPacket,
  /Open English Bible|OEB 2025\.6|rights-cleared/i,
  "review packet still carries the rejected source policy",
);
assert.equal(guidance.expected_model, "gpt-5.5");
assert.deepEqual(guidance.required_voice_example, {
  title: "Mark 6 Daily Rundown",
  genre: "gospel narrative",
  example_type: "voice",
  selection: "exact_identity_required",
});
const generationRuleText = library.rules
  .filter((rule) => rule.stages.includes("copy_generation"))
  .map((rule) => rule.text)
  .join("\n");
for (const workedExemplarPhrase of [
  "Fear wearing religious clothing",
  "Familiarity pretending to be discernment",
  "They are holding leftovers and still missing the point",
  "Do not receive the bread and miss who gave it",
  "A ruler with power but no backbone",
  "Control dressed up as worship",
  "They received the bread, but they missed what the bread was showing them",
  "Trust Him before you can see how the whole thing works out",
  "The disciples received the bread but missed what it was saying",
  "Jesus is not merely useful. He is Lord",
]) {
  assert.ok(
    !generationRuleText.includes(workedExemplarPhrase),
    `worked Mark 6 exemplar prose leaked into global generation rules: ${workedExemplarPhrase}`,
  );
}
assert.match(
  library.rules.find((rule) => rule.id === "SB-200")?.text ?? "",
  /do not .*imitate.*approved example/i,
  "the cadence rule must explicitly require fresh language",
);
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
assert.equal(noteCounts["mark-8"], 10, "Mark 8 needs the reviewed image delta");
assert.ok(
  guidance.chapters["mark-8"].notes.some(
    (note) =>
      note.id === "M8-10" &&
      /candidates, not mandatory image slots/i.test(note.text),
  ),
  "M8-10 must preserve image candidates without forcing a fixed plan",
);
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

const withoutBookFlow = selectRulesFromRows(
  rows.filter((rule) => rule.rule_id !== "SB-210"),
  "mark-8",
  "copy_generation",
);
assert.ok(
  !withoutBookFlow.coreIds.includes("SB-210"),
  "missing SB-210 must remain visible to a future fail-closed manifest",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      version: library.version,
      rules: library.rules.length,
      sources: library.source_ledger.length,
      core: actualCore.size,
      seedArtifact: {
        status: library.status,
        contentDigest: LIBRARY_CONTENT_DIGEST,
      },
      selections,
      guidance: {
        packetId: guidance.packet_id,
        status: guidance.status,
        noteCounts,
        sourceOwnerSelectionStatus:
          guidance.source_requirement.owner_selection_status,
        sourceRuntimeConnectionStatus:
          guidance.source_requirement.runtime_connection_status,
      },
    },
    null,
    2,
  ),
);
