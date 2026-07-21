/**
 * Mega revision integrity gate — generic over every chapter in the 7→10
 * queue (the proven Mark 6 gate, generalized).
 *
 * WHOM IT PROTECTS: the owner's finished-work review and Codex's editorial
 * approval — "text-only, quality-over-quantity" stays a PROVEN claim:
 *   1. Nothing outside a chapter's declared text paths may differ from its
 *      base snapshot (images/maps/verses/structure/metadata byte-identical).
 *   2. Total words across changed fields must be FLAT OR SHORTER (owner
 *      conviction 2026-07-20: more does not equal better) unless a chapter
 *      declares a documented exception.
 *   3. Flagged churchy vocabulary must not survive.
 *
 * Run: npm run verify:mega-revisions   (offline, in prebuild)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

interface RevisionSpec {
  slug: string;
  basePath: string;
  fixturePath: string;
  /** Paths that MAY change (dot/insight-id syntax as produced by walk()). */
  allowedChangedPaths: string[];
  /** Word-delta ceiling across changed fields (default 0 = flat-or-shorter). */
  maxWordDelta?: number;
}

const REVISIONS: RevisionSpec[] = [
  {
    slug: "mark-7",
    basePath: "../docs/selah/mark-7-revision/base-workup.json",
    fixturePath: "../lib/ai/fixtures/mark-7-mega-revision.json",
    // Codex rundown comparison (PR #89 review, -286 words): exactly these
    // five fields. Widening again requires editing this manifest.
    allowedChangedPaths: [
      "quickSummary",
      "insights[chapter-flow].body",
      "insights[jesus].body",
      "insights[theology].body",
      "insights[application].body",
    ],
  },
  {
    slug: "mark-8",
    basePath: "../docs/selah/mark-8-revision/base-workup.json",
    fixturePath: "../lib/ai/fixtures/mark-8-mega-revision.json",
    // Codex rundown comparison (board #29, 2026-07-20): exactly these five.
    allowedChangedPaths: [
      "quickSummary",
      "insights[chapter-flow].body",
      "insights[jesus].body",
      "insights[theology].body",
      "insights[application].body",
    ],
  },
  {
    slug: "mark-9",
    basePath: "../docs/selah/mark-9-revision/base-workup.json",
    fixturePath: "../lib/ai/fixtures/mark-9-mega-revision.json",
    // Codex rundown comparison (board #29, 2026-07-21, + wording addendum).
    allowedChangedPaths: [
      "quickSummary",
      "insights[what-most-miss].body",
      "insights[jesus].body",
      "insights[theology].body",
      "insights[application].body",
    ],
  },
  {
    slug: "mark-10",
    basePath: "../docs/selah/mark-10-revision/base-workup.json",
    fixturePath: "../lib/ai/fixtures/mark-10-mega-revision.json",
    // Codex rundown comparison (board #29, 2026-07-21) + its recheck
    // corrections (PR #94, 2026-07-21) — the recheck trimmed the easy-to-miss
    // opener, so the normal flat-or-shorter gate applies again.
    allowedChangedPaths: [
      "quickSummary",
      "insights[what-most-miss].body",
      "insights[jesus].body",
      "insights[theology].body",
      "insights[application].body",
    ],
  },
];

const CHURCHY = /discernment/i;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function words(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

let failures: string[] = [];

function walk(
  a: Json | undefined,
  b: Json | undefined,
  path: string,
  changed: string[],
  allowed: Set<string>,
): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      failures.push(`array length changed at ${path}`);
      return;
    }
    a.forEach((item, i) => {
      const id =
        item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, Json>).id === "string"
          ? String((item as Record<string, Json>).id)
          : String(i);
    walk(item, b[i], `${path}[${id}]`, changed, allowed);
    });
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk(
        (a as Record<string, Json>)[k],
        (b as Record<string, Json>)[k],
        path ? `${path}.${k}` : k,
        changed,
        allowed,
      );
    }
    return;
  }
  if (a !== b) {
    changed.push(path);
    if (!allowed.has(path)) failures.push(`NON-DECLARED CHANGE at ${path}`);
  }
}

function collect(obj: Json, path: string, out: Map<string, string>): void {
  if (typeof obj === "string") {
    out.set(path, obj);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const id =
        item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, Json>).id === "string"
          ? String((item as Record<string, Json>).id)
          : String(i);
      collect(item, `${path}[${id}]`, out);
    });
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) collect(v as Json, path ? `${path}.${k}` : k, out);
  }
}

let total = 0;
for (const spec of REVISIONS) {
  failures = [];
  const base = JSON.parse(readFileSync(resolve(here, spec.basePath), "utf8")) as Json;
  const revised = JSON.parse(readFileSync(resolve(here, spec.fixturePath), "utf8")) as Json;
  const changed: string[] = [];
  walk(base, revised, "", changed, new Set(spec.allowedChangedPaths));

  const baseText = new Map<string, string>();
  const revText = new Map<string, string>();
  collect(base, "", baseText);
  collect(revised, "", revText);
  let delta = 0;
  for (const p of changed) {
    delta += words(revText.get(p) ?? "") - words(baseText.get(p) ?? "");
  }
  const ceiling = spec.maxWordDelta ?? 0;
  if (delta > ceiling) {
    failures.push(`word delta +${delta} exceeds ceiling ${ceiling} (quality over quantity — flat or shorter)`);
  }
  if (CHURCHY.test(JSON.stringify(revised))) {
    failures.push("flagged churchy vocabulary present");
  }
  if (failures.length > 0) {
    console.error(`✗ verify:mega-revisions FAILED for ${spec.slug}`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  total++;
  console.log(
    `✓ ${spec.slug}: ${changed.length} changed path(s) all declared [${changed.join(", ")}], word delta ${delta <= 0 ? "" : "+"}${delta} (ceiling ${ceiling})`,
  );
}
console.log(`verify:mega-revisions ✓ ${total} revision artifact(s) clean`);
