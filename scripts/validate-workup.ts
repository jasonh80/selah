/**
 * Validates the Exodus 27 fixture against the chapter-workup schema.
 * Run: npm run validate:workup
 *
 * Confirms the contract end to end:
 *   JSON fixture → Zod schema → typed GeneratedChapterWorkup
 * (No AI/network calls.)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseChapterWorkupJson } from "../lib/ai/schemas/chapter-workup-schema";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../lib/ai/fixtures/exodus-27-generated.json");

try {
  const raw = readFileSync(fixturePath, "utf8");
  const workup = parseChapterWorkupJson(raw);
  console.log(`✓ Valid: ${workup.book} ${workup.chapter} — "${workup.subtitle}"`);
  console.log(
    `  status=${workup.status} version=${workup.version} images=${workup.generatedImages.length}`,
  );
  process.exit(0);
} catch (err) {
  console.error("✗ Validation failed:\n" + (err as Error).message);
  process.exit(1);
}
