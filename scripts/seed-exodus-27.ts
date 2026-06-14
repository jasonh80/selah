/**
 * Seeds the generated Exodus 27 workup into Supabase chapter_workups.
 *   fixture JSON → parseChapterWorkupJson() → generatedToRenderWorkup()
 *   → createGeneratingChapterWorkup() → saveReadyChapterWorkup()
 *
 * Run (with Supabase env vars set):  npm run seed:exodus-27
 *
 * Storage choice: we store the RENDER-READY ChapterWorkup as workup_json, so
 * reads go straight to ChapterView. (The canonical generated JSON could be kept
 * in a separate column later if we ever need to re-derive the render model.)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseChapterWorkupJson } from "../lib/ai/schemas/chapter-workup-schema";
import { generatedToRenderWorkup } from "../lib/ai/adapters/generated-to-workup";
import {
  createGeneratingChapterWorkup,
  saveReadyChapterWorkup,
} from "../lib/server/chapter-workups-repository";
import { isSupabaseConfigured } from "../lib/server/supabase";

async function main() {
  if (!isSupabaseConfigured()) {
    console.error(
      "✗ Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, "../lib/ai/fixtures/exodus-27-generated.json"), "utf8");

  const generated = parseChapterWorkupJson(raw);
  const workup = generatedToRenderWorkup(generated);

  await createGeneratingChapterWorkup({
    book: "Exodus",
    chapter: 27,
    slug: "exodus-27",
    title: workup.title,
    subtitle: workup.subtitle,
    source: "generated-fixture",
    bibleVersion: workup.defaultVersion,
  });

  await saveReadyChapterWorkup({
    slug: "exodus-27",
    workup,
    status: "reviewed",
    version: workup.version,
    bibleVersion: workup.defaultVersion,
  });

  console.log(`✓ Seeded exodus-27 ("${workup.subtitle}") as reviewed.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ Seed failed:", (e as Error).message);
  process.exit(1);
});
