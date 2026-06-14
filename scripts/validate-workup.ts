/**
 * Validates the full offline contract chain for the Exodus 27 fixture:
 *   JSON fixture → parseChapterWorkupJson() (Zod) → generatedToRenderWorkup()
 *   → required ChapterView render fields present.
 *
 * Run: npm run validate:workup   (no AI/network calls)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseChapterWorkupJson } from "../lib/ai/schemas/chapter-workup-schema";
import { generatedToRenderWorkup } from "../lib/ai/adapters/generated-to-workup";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../lib/ai/fixtures/exodus-27-generated.json");

function assert(name: string, ok: unknown) {
  if (!ok) throw new Error(`missing/invalid render field: ${name}`);
}

try {
  const raw = readFileSync(fixturePath, "utf8");

  // 1) schema
  const generated = parseChapterWorkupJson(raw);
  console.log(`✓ Schema OK: ${generated.book} ${generated.chapter} — "${generated.subtitle}"`);

  // 2) adapter → render model
  const r = generatedToRenderWorkup(generated);
  assert("book", r.book);
  assert("chapter", r.chapter);
  assert("slug", r.slug);
  assert("title", r.title);
  assert("subtitle", r.subtitle);
  assert("reference", r.reference);
  assert("metaChips", r.metaChips.length >= 3);
  assert("summary", r.quickSummary);
  assert("generatedImages === 3", r.images.length === 3);
  assert("maps.modern", r.modernMap?.src);
  assert("maps.historic", r.historicMap?.src);
  assert("goDeeper (3 groups)", r.deeperGroups.length === 3);
  assert("insights", r.insights.length > 0);
  assert("status", r.status);

  console.log(
    `✓ Render OK: ${r.reference} — images=${r.images.length}, insights=${r.insights.length}, deeper=${r.deeperGroups.length}, status=${r.status}`,
  );
  process.exit(0);
} catch (err) {
  console.error("✗ Validation failed:\n" + (err as Error).message);
  process.exit(1);
}
