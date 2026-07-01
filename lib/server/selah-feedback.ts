// SERVER-ONLY. Reader for the generation audit log (Advanced Settings → Recent
// activity). Review notes + learnings now live in the dedicated Selah Brain
// tables (see selah-brain.ts) — the audit log is no longer a source of prompt
// learning, only a record of what happened.
import { getSupabaseAdmin } from "./supabase";

export interface AuditEntry {
  created_at?: string;
  action: string;
  slug: string | null;
  status: string;
  model: string | null;
  message: string | null;
  estimated_cost?: number | null;
}

export async function getAuditLog(limit = 15): Promise<AuditEntry[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("generation_audit_log")
    .select("created_at, action, slug, status, model, message, estimated_cost")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as AuditEntry[];
}
