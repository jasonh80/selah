/**
 * Mega Mark 6 review-artifact integrity gate (board #29 spec, 2026-07-20).
 *
 * WHOM IT PROTECTS: Jason's copy approval. His approval is only meaningful if
 * "text-only revision" is provably true — this gate fails the build if the
 * revised fixture differs from the live base ANYWHERE outside the declared
 * text fields, if a required owner-approved line is missing, or if flagged
 * churchy vocabulary ("discernment") survives.
 *
 * TEMPORARY: remove together with the review artifact once the revision is
 * applied (or declined) — it guards this one review lane, nothing else.
 *
 * Run: npm run verify:mark6-revision   (offline, no network)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const basePath = resolve(here, "../docs/selah/mark-6-revision/base-workup.json");
const revisedPath = resolve(here, "../lib/ai/fixtures/mark-6-mega-revision.json");

// The ONLY paths the revision may touch. Insight entries are keyed by their
// stable `id`, never by array position.
const ALLOWED_CHANGED_PATHS = new Set([
  "quickSummary",
  "summary",
  "modernReadersMiss",
  "insights[big-idea].preview",
  "insights[big-idea].body",
  "insights[chapter-flow].body",
  "insights[what-most-miss].body",
  "insights[two-banquets].body",
  "insights[application].preview",
  "insights[application].body",
]);

// Owner-approved lines that must appear VERBATIM (typography-normalized:
// curly/straight apostrophes compare equal; wording is exact).
const REQUIRED_LINES = [
  "Mark 6 keeps putting people close to Jesus—and showing how easy it is to miss Him.",
  "You can grow up around Jesus, listen to truth about Jesus, work for Jesus and receive from Jesus—and still miss who He is.",
  "Here is the good news. Jesus sees the disciples straining before they understand Him. He comes toward them in the dark—not after they pass a theology exam. Their faith is unfinished. Their Shepherd is not.",
  "The disciples are holding leftovers and still missing the point. You humans, you're remarkably consistent.",
];

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function normalize(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

const failures: string[] = [];
const changed: string[] = [];

function pathKey(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function walk(a: Json | undefined, b: Json | undefined, path: string): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      failures.push(`array length changed at ${path} (${a.length} → ${b.length})`);
      return;
    }
    a.forEach((item, i) => {
      const other = b[i];
      const id =
        item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "string"
          ? item.id
          : String(i);
      walk(item, other, `${path}[${id}]`);
    });
    return;
  }
  if (
    a && b &&
    typeof a === "object" && typeof b === "object" &&
    !Array.isArray(a) && !Array.isArray(b)
  ) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk((a as Record<string, Json>)[k], (b as Record<string, Json>)[k], pathKey(path, k));
    }
    return;
  }
  if (a !== b) {
    changed.push(path);
    if (!ALLOWED_CHANGED_PATHS.has(path)) {
      failures.push(`NON-TEXT-FIELD CHANGE at ${path}`);
    }
  }
}

try {
  const base = JSON.parse(readFileSync(basePath, "utf8")) as Json;
  const revised = JSON.parse(readFileSync(revisedPath, "utf8")) as Json;

  walk(base, revised, "");

  for (const allowed of ALLOWED_CHANGED_PATHS) {
    if (!changed.includes(allowed)) {
      failures.push(`declared text change missing (field unchanged): ${allowed}`);
    }
  }

  const revisedText = normalize(JSON.stringify(revised));
  for (const line of REQUIRED_LINES) {
    if (!revisedText.includes(normalize(line))) {
      failures.push(`required owner line missing: "${line.slice(0, 48)}…"`);
    }
  }
  if (/discernment/i.test(revisedText)) {
    failures.push('flagged churchy vocabulary present: "discernment"');
  }

  if (failures.length > 0) {
    console.error("✗ verify:mark6-revision FAILED");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }

  console.log("✓ Mega Mark 6 artifact integrity OK");
  console.log(`  ${changed.length} changed paths, all inside the declared text-field set:`);
  for (const c of changed) console.log("    · " + c);
  console.log("  all 4 owner-approved lines present verbatim; no flagged churchy vocabulary");
} catch (e) {
  console.error("✗ verify:mark6-revision errored:", (e as Error).message);
  process.exit(1);
}
