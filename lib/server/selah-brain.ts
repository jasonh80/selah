// SERVER-ONLY. The "Selah Brain" rules layer: a real, toggleable store for what
// Selah has learned, plus per-chapter review notes. Replaces the old audit-log
// scraping as the source of prompt learning. All reads fail SOFT (return empty)
// so generation never breaks if the tables aren't there yet.
import { getSupabaseAdmin } from "./supabase";

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
  title: string;
  rule_text: string;
  category: string;
  active: boolean;
  source_slug: string | null;
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

// Active global rule texts → injected into EVERY generation. Fails soft.
export async function getActiveGlobalRuleTexts(limit = 25): Promise<string[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("selah_brain_rules")
    .select("rule_text")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return [...new Set(data.map((r) => String((r as { rule_text?: string }).rule_text || "").trim()).filter(Boolean))];
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
    .select("id,title,rule_text,category,active,source_slug,created_at")
    .order("active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as SelahBrainRule[];
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
