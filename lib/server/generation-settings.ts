// SERVER-ONLY. Reads/writes the routine generation controls in Supabase so they
// can change from /admin/generation without a redeploy. Fail-CLOSED: if Supabase
// is unreachable or the row is missing, generation is treated as disabled.
import { getSupabaseAdmin } from "./supabase";

export interface GenerationSettings {
  id: string;
  text_generation_enabled: boolean;
  image_generation_enabled: boolean;
  allowed_slugs: string[];
  selected_text_model: string;
  selected_image_model: string;
  daily_budget_limit_usd: number | null;
  require_confirm: boolean;
  updated_at: string;
}

const TABLE = "generation_settings";

// Safe defaults — everything OFF, no slugs. Models fall back to the Netlify
// defaults so a freshly-created row still has sensible model values.
const FALLBACK: GenerationSettings = {
  id: "global",
  text_generation_enabled: false,
  image_generation_enabled: false,
  allowed_slugs: [],
  selected_text_model: process.env.CHAPTER_WORKUP_TEXT_MODEL || "gpt-4o",
  selected_image_model: process.env.CHAPTER_IMAGE_MODEL || "gpt-image-1",
  daily_budget_limit_usd: null,
  require_confirm: true,
  updated_at: "",
};

// TEST SEAM (offline safety gate only): lets scripts/verify-studio-safety.ts
// drive the REAL admin route/workers with controlled settings and capture the
// durable audit trail in memory. Never set in production code paths.
let settingsOverride: GenerationSettings | null = null;
let auditCapture: Array<Record<string, unknown>> | null = null;
let auditFailureForTesting = false;
let auditResolvedFalseForTesting = false;
export function __setGenerationTestOverrides(overrides: {
  settings?: GenerationSettings | null;
  captureAudit?: Array<Record<string, unknown>> | null;
  auditFailure?: boolean;
  /**
   * Production-shaped outage: writeGenerationAudit RESOLVES false (Supabase
   * unavailable / insert error) instead of throwing. This is the path that
   * actually fires in production — a thrown error never does.
   */
  auditResolvedFalse?: boolean;
} | null): void {
  settingsOverride = overrides?.settings ?? null;
  auditCapture = overrides?.captureAudit ?? null;
  auditFailureForTesting = overrides?.auditFailure ?? false;
  auditResolvedFalseForTesting = overrides?.auditResolvedFalse ?? false;
}

export async function getGenerationSettings(): Promise<GenerationSettings> {
  if (settingsOverride) return settingsOverride;
  const db = getSupabaseAdmin();
  if (!db) return FALLBACK;
  const { data, error } = await db.from(TABLE).select("*").eq("id", "global").maybeSingle();
  if (error || !data) return FALLBACK; // fail-closed
  return { ...FALLBACK, ...data };
}

const EDITABLE_KEYS: (keyof GenerationSettings)[] = [
  "text_generation_enabled",
  "image_generation_enabled",
  "allowed_slugs",
  "selected_text_model",
  "selected_image_model",
  "daily_budget_limit_usd",
  "require_confirm",
];

export async function updateGenerationSettings(
  patch: Partial<GenerationSettings>,
): Promise<GenerationSettings | null> {
  if (settingsOverride) {
    const next: GenerationSettings = {
      ...settingsOverride,
      updated_at: new Date().toISOString(),
    };
    for (const key of EDITABLE_KEYS) {
      if (key in patch) {
        (next[key] as GenerationSettings[typeof key]) = patch[key] as GenerationSettings[typeof key];
      }
    }
    settingsOverride = next;
    return next;
  }
  const db = getSupabaseAdmin();
  if (!db) return null;
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE_KEYS) if (k in patch) clean[k] = patch[k];
  const { data, error } = await db
    .from(TABLE)
    .update(clean)
    .eq("id", "global")
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[selah] updateGenerationSettings failed:", error.message);
    return null;
  }
  return data ? { ...FALLBACK, ...data } : null;
}

export interface GenerationAuditEntry {
  action: string;
  slug?: string;
  model?: string;
  estimatedCost?: number;
  actualCost?: number;
  status: "started" | "succeeded" | "failed";
  message?: string;
}

async function writeGenerationAudit(entry: GenerationAuditEntry): Promise<boolean> {
  if (auditFailureForTesting) throw new Error("simulated generation audit outage");
  if (auditResolvedFalseForTesting) return false;
  if (auditCapture) {
    auditCapture.push({ ...entry });
    return true;
  }
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { error } = await db.from("generation_audit_log").insert({
    action: entry.action,
    slug: entry.slug ?? null,
    model: entry.model ?? null,
    estimated_cost: entry.estimatedCost ?? null,
    actual_cost: entry.actualCost ?? null,
    status: entry.status,
    message: entry.message ?? null,
  });
  if (error) {
    console.error("[selah] logGenerationAudit failed:", error.message);
    return false;
  }
  return true;
}

export async function logGenerationAudit(entry: GenerationAuditEntry): Promise<void> {
  await writeGenerationAudit(entry);
}

/** Used when a caller must know whether the activity row was durably saved. */
export async function logGenerationAuditVerified(
  entry: GenerationAuditEntry,
): Promise<boolean> {
  return writeGenerationAudit(entry);
}
