// SERVER-ONLY. The "Selah Brain" rules layer: a real, toggleable store for what
// Selah has learned, plus per-chapter review notes. Replaces the old audit-log
// scraping as the source of prompt learning. All reads fail SOFT (return empty)
// so generation never breaks if the tables aren't there yet.
import { getSupabaseAdmin } from "./supabase";
import { SEED_RULES, LIBRARY_VERSION, MAX_CONTEXTUAL } from "./selah-brain-library";

export type RuleCategory =
  | "voice"
  | "theology"
  | "history"
  | "visuals"
  | "maps"
  | "images"
  | "structure"
  | "avoid";

export interface SelahBrainRule {
  id: string;
  rule_id?: string | null;
  title: string;
  rule_text: string;
  category: string;
  scope?: string;
  genre?: string | null;
  priority?: string;
  stages?: string[];
  active: boolean;
  source_slug?: string | null;
  created_at?: string;
}

export type ReviewScope = "chapter" | "future" | "both";

// Quick tags → the rule text + category they imply. Empty text = nothing to
// teach the model (handled elsewhere or purely positive signal).
const TAG_RULE: Record<string, { text: string; category: RuleCategory }> = {
  "Too academic": {
    text: "Write like a warm, wise friend — never academic or textbook-like.",
    category: "voice",
  },
  "Too generic": {
    text: "Be specific to THIS chapter; cut anything that could apply to any passage.",
    category: "structure",
  },
  "Too much hedging": {
    text: "Be confident in the main voice; keep uncertainty in transparency notes, not headline copy or timeline labels.",
    category: "voice",
  },
  "Needs more visual detail": {
    text: "Add concrete, historically grounded visual detail.",
    category: "visuals",
  },
  "Needs stronger Jesus connection": {
    text: "Make the connection to Jesus warmer and stronger throughout.",
    category: "theology",
  },
  "Map missing": { text: "This chapter needs a map.", category: "maps" },
  "Great — save as example": { text: "", category: "voice" },
};

// One review submission → always a chapter note; a global rule when the editor
// scopes it to future/both AND there's something concrete to teach.
export async function submitReview(input: {
  slug: string;
  verdict: "yes" | "needs_work";
  note?: string;
  scope: ReviewScope;
  tags?: string[];
}): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const tags = input.tags ?? [];
  const note = (input.note ?? "").trim();
  const noteScope = input.scope === "future" ? "global" : input.scope; // chapter | global | both

  const ins = await db.from("chapter_review_notes").insert({
    slug: input.slug,
    tags,
    note,
    scope: noteScope,
  });
  if (ins.error) {
    console.error("[selah] chapter_review_notes insert failed:", ins.error.message);
    return false;
  }

  if (input.scope === "future" || input.scope === "both") {
    const tagTexts = tags.map((t) => TAG_RULE[t]?.text).filter(Boolean) as string[];
    const ruleText = [note, ...tagTexts].filter(Boolean).join(" ");
    if (ruleText) {
      const category =
        (tags.map((t) => TAG_RULE[t]?.category).find(Boolean) as RuleCategory | undefined) || "voice";
      const title = (note || tagTexts[0] || "Selah rule").slice(0, 70);
      const r = await db.from("selah_brain_rules").insert({
        title,
        rule_text: ruleText,
        category,
        active: true,
        source_slug: input.slug,
      });
      if (r.error) console.error("[selah] selah_brain_rules insert failed:", r.error.message);
    }
  }
  return true;
}

// ---- genre detection (heuristic; per-slug overrides win) -------------------
const SLUG_GENRE_OVERRIDE: Record<string, string> = {
  "exodus-31": "craftsmanship/vocation",
  "exodus-35": "craftsmanship/vocation",
  "exodus-36": "craftsmanship/vocation",
};

export function genreForSlug(slug: string): string | null {
  if (SLUG_GENRE_OVERRIDE[slug]) return SLUG_GENRE_OVERRIDE[slug];
  const m = slug.match(/^(.+)-(\d+)$/);
  if (!m) return null;
  const book = m[1];
  const ch = Number(m[2]);
  if (["matthew", "mark", "luke", "john"].includes(book)) return "gospel narrative";
  if (["psalm", "job", "proverbs", "ecclesiastes", "song-of-solomon", "lamentations"].includes(book))
    return "poetry/psalm";
  if (book === "exodus") {
    if (ch >= 1 && ch <= 15) return "oppression/deliverance";
    if (ch >= 20 && ch <= 23) return "law";
    if (ch === 24) return "covenant/ritual";
    if ((ch >= 25 && ch <= 30) || (ch >= 37 && ch <= 40)) return "tabernacle/priesthood";
  }
  if (book === "leviticus") return ch >= 8 && ch <= 9 ? "tabernacle/priesthood" : "covenant/ritual";
  if (book === "genesis") {
    if ([5, 10, 11, 36].includes(ch)) return "genealogy";
    if (ch >= 37) return "dream/providence narrative";
    if (ch >= 12) return "patriarchal narrative";
  }
  if (["deuteronomy", "numbers"].includes(book)) return "law";
  return null;
}

// Per-genre selection profile: companion GLOBAL rules to surface first, plus the
// categories to favor when filling remaining contextual slots.
const GENRE_PROFILE: Record<string, { companions: string[]; categories: string[] }> = {
  "gospel narrative": {
    companions: ["SB-013", "SB-015", "SB-019", "SB-032", "SB-036", "SB-039", "SB-040", "SB-050", "SB-054"],
    categories: ["exegesis", "theology", "history"],
  },
  "poetry/psalm": { companions: ["SB-007", "SB-040", "SB-019"], categories: ["voice", "theology", "exegesis"] },
  "law": { companions: ["SB-039", "SB-053", "SB-043"], categories: ["exegesis", "history"] },
  "covenant/ritual": { companions: ["SB-038", "SB-055", "SB-058"], categories: ["reverence", "history", "exegesis"] },
  "tabernacle/priesthood": { companions: ["SB-051", "SB-052", "SB-055", "SB-057", "SB-075", "SB-078"], categories: ["history", "reverence", "visuals"] },
  "genealogy": { companions: ["SB-034", "SB-019", "SB-040"], categories: ["exegesis", "history"] },
  "patriarchal narrative": { companions: ["SB-036", "SB-037", "SB-053"], categories: ["exegesis", "history"] },
  "dream/providence narrative": { companions: ["SB-032", "SB-041", "SB-037"], categories: ["exegesis", "theology"] },
  "oppression/deliverance": { companions: ["SB-038", "SB-039", "SB-051"], categories: ["exegesis", "history", "theology"] },
  "craftsmanship/vocation": { companions: ["SB-130", "SB-131", "SB-132", "SB-133", "SB-134", "SB-136", "SB-137"], categories: ["vocation", "visuals", "reverence"] },
};

export interface RuleRow {
  rule_id: string | null;
  title: string;
  rule_text: string;
  category: string;
  scope: string;
  genre: string | null;
  priority: string;
  stages: string[];
}

function stageEligible(stages: string[] | null | undefined, stage: string): boolean {
  // No stages recorded (legacy / user-feedback rules) → eligible at authorship + review.
  if (!stages || stages.length === 0) return stage === "copy_generation" || stage === "copy_review";
  return stages.includes(stage);
}

export interface RuleSelection {
  genre: string | null;
  coreIds: string[];
  contextualIds: string[];
  texts: string[];
  counts: { core: number; contextual: number; excludedQa: number; excludedGovernance: number; activeTotal: number };
}

function emptyRuleSelection(slug: string): RuleSelection {
  return {
    genre: genreForSlug(slug),
    coreIds: [],
    contextualIds: [],
    texts: [],
    counts: {
      core: 0,
      contextual: 0,
      excludedQa: 0,
      excludedGovernance: 0,
      activeTotal: 0,
    },
  };
}

// Pure selection engine shared by production and offline verification. The
// caller supplies active, non-archived rows; this function applies the exact
// stage, core/contextual, genre, priority, score, ordering, and cap behavior.
export function selectRulesFromRows(
  rows: RuleRow[],
  slug: string,
  stage = "copy_generation",
  maxContextual = MAX_CONTEXTUAL,
): RuleSelection {
  const genre = genreForSlug(slug);
  const profile = (genre && GENRE_PROFILE[genre]) || { companions: [], categories: [] };

  const excludedQa = rows.filter((r) => r.priority === "qa").length;
  const excludedGovernance = rows.filter((r) => r.priority === "governance").length;

  const eligible = rows.filter(
    (r) =>
      stageEligible(r.stages, stage) &&
      r.priority !== "governance" &&
      r.priority !== "qa",
  );
  const core = eligible
    .filter((r) => r.priority === "core")
    .sort((a, b) =>
      (a.rule_id || a.title).localeCompare(b.rule_id || b.title),
    );

  function score(r: RuleRow): number {
    if (r.scope === "genre") return r.genre === genre ? 100 : -1;
    if (r.rule_id && profile.companions.includes(r.rule_id)) return 90;
    if (!r.rule_id) return 70; // user/review-created learning
    if (profile.categories.includes(r.category)) return 60;
    return 20;
  }

  const contextual = eligible
    .filter((r) => r.priority === "contextual")
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s >= 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        (a.r.rule_id || "zzz").localeCompare(b.r.rule_id || "zzz"),
    )
    .slice(0, maxContextual)
    .map((x) => x.r);

  const ordered = [...core, ...contextual];
  return {
    genre,
    coreIds: core.map((r) => r.rule_id || r.title),
    contextualIds: contextual.map(
      (r) => r.rule_id || `(review) ${r.title}`,
    ),
    texts: [
      ...new Set(
        ordered
          .map((r) => String(r.rule_text || "").trim())
          .filter(Boolean),
      ),
    ],
    counts: {
      core: core.length,
      contextual: contextual.length,
      excludedQa,
      excludedGovernance,
      activeTotal: rows.length,
    },
  };
}

// Selective retrieval: core rules always; contextual chosen by genre/category and
// capped; QA/governance excluded by stage. This is what feeds chapter generation.
export async function selectRulesForGeneration(
  slug: string,
  stage = "copy_generation",
): Promise<RuleSelection> {
  const empty = emptyRuleSelection(slug);
  const db = getSupabaseAdmin();
  if (!db) return empty;
  const { data, error } = await db
    .from("selah_brain_rules")
    .select("rule_id,title,rule_text,category,scope,genre,priority,stages")
    .eq("active", true)
    .eq("archived", false);
  if (error || !data) return empty;
  return selectRulesFromRows(data as RuleRow[], slug, stage);
}

// ---- idempotent seed from the version-controlled library --------------------
export async function seedFromLibrary(): Promise<{
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
  error?: string;
}> {
  const db = getSupabaseAdmin();
  if (!db) return { inserted: 0, updated: 0, unchanged: 0, total: 0, error: "no db" };
  const existing = await db.from("selah_brain_rules").select("rule_id,rule_text").not("rule_id", "is", null);
  if (existing.error) return { inserted: 0, updated: 0, unchanged: 0, total: 0, error: existing.error.message };
  const seen = new Map<string, string>();
  for (const row of existing.data as { rule_id: string; rule_text: string }[]) seen.set(row.rule_id, row.rule_text);

  const toInsert: Record<string, unknown>[] = [];
  let updated = 0;
  let unchanged = 0;
  for (const r of SEED_RULES) {
    const row = {
      rule_id: r.id,
      title: r.title,
      rule_text: r.text,
      category: r.category,
      scope: r.scope,
      genre: r.genre ?? null,
      priority: r.priority,
      stages: r.stages ?? [],
      source_titles: r.sources ?? [],
      active: r.active !== false,
      archived: false,
      version: LIBRARY_VERSION,
      updated_at: new Date().toISOString(),
    };
    if (!seen.has(r.id)) {
      toInsert.push(row);
    } else if (seen.get(r.id) !== r.text) {
      // Preserve the prior wording, then update.
      const history = await db.from("selah_brain_rule_history").insert({
        rule_id: r.id,
        rule_text: seen.get(r.id),
        version: "pre-update",
      });
      if (history.error) {
        return {
          inserted: 0,
          updated,
          unchanged,
          total: SEED_RULES.length,
          error: `history failed for ${r.id}: ${history.error.message}`,
        };
      }
      const update = await db
        .from("selah_brain_rules")
        .update(row)
        .eq("rule_id", r.id);
      if (update.error) {
        return {
          inserted: 0,
          updated,
          unchanged,
          total: SEED_RULES.length,
          error: `update failed for ${r.id}: ${update.error.message}`,
        };
      }
      updated++;
    } else {
      unchanged++;
    }
  }
  if (toInsert.length) {
    const ins = await db.from("selah_brain_rules").insert(toInsert);
    if (ins.error) return { inserted: 0, updated, unchanged, total: SEED_RULES.length, error: ins.error.message };
  }
  return { inserted: toInsert.length, updated, unchanged, total: SEED_RULES.length };
}

// Chapter-only notes → re-applied when THAT chapter regenerates. ('both'/global
// notes already become global rules, so we only pull pure chapter notes here.)
export async function getChapterReviewNoteTexts(slug: string, limit = 10): Promise<string[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("chapter_review_notes")
    .select("note")
    .eq("slug", slug)
    .eq("scope", "chapter")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return [...new Set(data.map((r) => String((r as { note?: string }).note || "").trim()).filter(Boolean))];
}

// ---- management (Advanced Settings → "What Selah Has Learned") ----
export async function listGlobalRules(): Promise<SelahBrainRule[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("selah_brain_rules")
    .select("id,rule_id,title,rule_text,category,scope,genre,priority,active,source_slug,created_at")
    .eq("archived", false)
    .order("priority", { ascending: true })
    .order("rule_id", { ascending: true, nullsFirst: false });
  if (error || !data) return [];
  return data as SelahBrainRule[];
}

export async function getRuleCounts(): Promise<{ total: number; active: number; archived: number; byPriority: Record<string, number> }> {
  const db = getSupabaseAdmin();
  if (!db) return { total: 0, active: 0, archived: 0, byPriority: {} };
  const { data, error } = await db.from("selah_brain_rules").select("priority,active,archived");
  if (error || !data) return { total: 0, active: 0, archived: 0, byPriority: {} };
  const rows = data as { priority: string; active: boolean; archived: boolean }[];
  const byPriority: Record<string, number> = {};
  for (const r of rows.filter((x) => x.active && !x.archived)) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  return {
    total: rows.length,
    active: rows.filter((r) => r.active && !r.archived).length,
    archived: rows.filter((r) => r.archived).length,
    byPriority,
  };
}

export async function setRuleActive(id: string, active: boolean): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db || !id) return false;
  const { error } = await db
    .from("selah_brain_rules")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function deleteRule(id: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db || !id) return false;
  const { error } = await db.from("selah_brain_rules").delete().eq("id", id);
  return !error;
}
