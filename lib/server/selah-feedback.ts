// SERVER-ONLY. Lightweight "Selah Brain" review capture + read-back. Stored in
// the EXISTING generation_audit_log (action = "selah_feedback") so there's no new
// table to create. Notes the editor scopes to future/both become "learnings"
// injected into the generation prompt; the freeform note + quick tags are turned
// into plain imperative guidance the model can act on.
import { getSupabaseAdmin } from "./supabase";

export type FeedbackScope = "chapter" | "future" | "both";
export type FeedbackVerdict = "yes" | "needs_work";

export interface SelahFeedback {
  slug: string;
  verdict: FeedbackVerdict;
  note?: string;
  scope: FeedbackScope;
  tags?: string[];
}

// Quick tags → imperative guidance the model can apply. Empty = not a prompt
// learning (handled elsewhere, e.g. maps, or purely positive signal).
const TAG_GUIDANCE: Record<string, string> = {
  "Too academic": "Write like a warm, wise friend — never academic or textbook-like.",
  "Too generic": "Be specific to THIS chapter; cut anything that could apply to any passage.",
  "Too much hedging":
    "Be confident in the main voice; keep nuance and uncertainty in the transparency notes only, not the headline copy or timeline labels.",
  "Needs more visual detail": "Add concrete, historically grounded visual detail.",
  "Needs stronger Jesus connection": "Make the connection to Jesus warmer and stronger throughout.",
  "Map missing": "",
  "Great — save as example": "",
};

export async function saveSelahFeedback(fb: SelahFeedback): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { error } = await db.from("generation_audit_log").insert({
    action: "selah_feedback",
    slug: fb.slug || null,
    status: "succeeded",
    message: JSON.stringify({
      verdict: fb.verdict,
      note: (fb.note ?? "").slice(0, 1000),
      scope: fb.scope,
      tags: fb.tags ?? [],
    }),
  });
  if (error) {
    console.error("[selah] saveSelahFeedback failed:", error.message);
    return false;
  }
  return true;
}

// Notes the editor asked to apply to future chapters → imperative guidance lines
// for the generation prompt. Fails soft (returns []) so generation never breaks.
export async function getSelahLearnings(limit = 60): Promise<string[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("generation_audit_log")
    .select("message")
    .eq("action", "selah_feedback")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const out: string[] = [];
  for (const row of data) {
    try {
      const m = JSON.parse((row as { message?: string }).message || "{}");
      if (m.scope !== "future" && m.scope !== "both") continue;
      if (m.note && typeof m.note === "string" && m.note.trim()) out.push(m.note.trim());
      for (const t of m.tags || []) {
        const g = TAG_GUIDANCE[t];
        if (g) out.push(g);
      }
    } catch {
      /* skip malformed rows */
    }
  }
  return [...new Set(out.filter(Boolean))].slice(0, 12);
}

export interface AuditEntry {
  created_at?: string;
  action: string;
  slug: string | null;
  status: string;
  model: string | null;
  message: string | null;
}

export async function getAuditLog(limit = 15): Promise<AuditEntry[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("generation_audit_log")
    .select("created_at, action, slug, status, model, message")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as AuditEntry[];
}
