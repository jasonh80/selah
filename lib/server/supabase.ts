// SERVER-ONLY MODULE. Do not import into a client component — it reads
// SUPABASE_SERVICE_ROLE_KEY. (Repos that import this are server-only too.)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase access using the service-role key (bypasses RLS).
 * Returns null when the environment isn't configured, so callers can fall back
 * to the local fixture/registry instead of crashing.
 *
 * NEVER import this into a client component — it reads SUPABASE_SERVICE_ROLE_KEY.
 */

let cachedAdmin: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedAdmin !== undefined) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    cachedAdmin = null;
    return null;
  }

  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

// Warn once per process when a repository call needs Supabase but it's missing.
const warned = new Set<string>();
export function warnSupabaseMissing(where: string): void {
  if (warned.has(where)) return;
  warned.add(where);
  console.warn(
    `[selah] Supabase not configured — ${where} is a no-op. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable persistence.`,
  );
}
