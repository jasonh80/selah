/**
 * Verifies that Supabase has a usable Exodus 27 workup.
 * Run (with Supabase env vars set):  npm run verify:supabase
 *
 * Checks: env present · table queryable · exodus-27 exists · status ready/
 * reviewed · workup_json has required fields · 3 images.
 * (workup_json stores the RENDER model, so the image field is `images`.)
 */
import { isSupabaseConfigured, getSupabaseAdmin } from "../lib/server/supabase";

async function main() {
  if (!isSupabaseConfigured()) {
    console.error("✗ Supabase not configured (env vars missing).");
    process.exit(1);
  }
  const db = getSupabaseAdmin();
  if (!db) {
    console.error("✗ Could not create Supabase client.");
    process.exit(1);
  }

  const { data, error } = await db
    .from("chapter_workups")
    .select("slug,status,workup_json")
    .eq("slug", "exodus-27")
    .maybeSingle();

  if (error) {
    console.error("✗ chapter_workups query failed:", error.message);
    process.exit(1);
  }
  if (!data) {
    console.error("✗ exodus-27 not found. Run: npm run seed:exodus-27");
    process.exit(1);
  }
  if (!["ready", "reviewed"].includes(data.status)) {
    console.error(`✗ exodus-27 status is "${data.status}", expected ready/reviewed.`);
    process.exit(1);
  }

  const w = data.workup_json as Record<string, unknown> | null;
  for (const field of ["book", "chapter", "slug", "title", "subtitle"]) {
    if (!w || w[field] === undefined || w[field] === null) {
      console.error(`✗ workup_json missing field: ${field}`);
      process.exit(1);
    }
  }
  const images = (w?.images as unknown[]) ?? [];
  if (!Array.isArray(images) || images.length !== 3) {
    console.error(`✗ workup_json images length is ${images.length}, expected 3.`);
    process.exit(1);
  }

  console.log(
    `✓ Supabase OK: exodus-27 status=${data.status}, images=${images.length}, "${String(w?.subtitle)}"`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ Verify failed:", (e as Error).message);
  process.exit(1);
});
