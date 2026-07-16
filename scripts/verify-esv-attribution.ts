// Offline gate for the ONE shared ESV/Crossway attribution (owner direction,
// PR #33, 2026-07-16). Enforces:
//   1. The shared notice matches Crossway's official ESV API terms VERBATIM.
//   2. The shared module is client-safe (no server/secret imports).
//   3. Both ESV display paths — the collapsed preview and the full reader
//      (read + verse-by-verse) — render the shared component with the
//      required esv.org link.
//   4. No competing or abridged Crossway notice exists anywhere else in the
//      source tree: this script FAILS if one is ever added.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ESV_ATTRIBUTION_NOTICE,
  ESV_ORG_URL,
  ESV_SHORT_LABEL,
} from "../lib/esv-attribution";

// Crossway's official notice (Option 1), copied verbatim from
// https://api.esv.org/ on 2026-07-16. If Crossway revises its terms, update
// BOTH this expectation and lib/esv-attribution.ts from the official page —
// never by hand-editing one side.
const OFFICIAL_NOTICE =
  "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language. Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

// 1. Verbatim official notice + required link + required short label.
assert.equal(
  ESV_ATTRIBUTION_NOTICE,
  OFFICIAL_NOTICE,
  "the shared ESV notice must match Crossway's official terms verbatim",
);
assert.equal(ESV_ORG_URL, "https://www.esv.org");
assert.equal(ESV_SHORT_LABEL, "ESV");

// 2. The shared source and component are client-safe.
const attributionSource = read("lib/esv-attribution.ts");
assert.ok(
  !/from "\.\/server|from "\.\.\/server|process\.env/u.test(attributionSource),
  "lib/esv-attribution.ts must stay client-safe (no server/secret imports)",
);
const component = read("components/chapter/EsvAttribution.tsx");
assert.ok(component.includes("ESV_ATTRIBUTION_NOTICE"), "component renders the shared notice");
assert.ok(component.includes("ESV_ORG_URL"), "component renders the required esv.org link");

// 3. Both ESV display paths use the shared component; neither carries an
// inline notice of its own.
const reader = read("components/chapter/ScriptureReader.tsx");
const preview = read("components/chapter/ChapterTopControls.tsx");
assert.ok(reader.includes("EsvAttribution"), "the full reader renders the shared attribution");
assert.equal(
  (reader.match(/<EsvAttribution/gu) ?? []).length >= 2,
  true,
  "both reader paths (read + verse-by-verse) render the shared attribution",
);
assert.ok(preview.includes("EsvAttribution"), "the collapsed preview renders the shared attribution");
assert.ok(
  preview.includes("showingEsv &&"),
  "the collapsed preview attaches attribution ONLY to real ESV words (never Selah fallback text)",
);

// 4. No competing Crossway notice anywhere else in the source tree.
const SOURCE_ROOTS = ["app", "components", "lib", "netlify"];
const ALLOWED = new Set([
  "lib/esv-attribution.ts", // the one source
]);
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${entry}`;
    const stats = statSync(join(process.cwd(), rel));
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      yield* walk(rel);
    } else if (/\.(ts|tsx|mts|js|jsx)$/u.test(entry)) {
      yield rel;
    }
  }
}
const offenders: string[] = [];
for (const root of SOURCE_ROOTS) {
  for (const file of walk(root)) {
    if (ALLOWED.has(file)) continue;
    const body = read(file);
    if (/Crossway/u.test(body)) {
      // References to the shared constants are fine; a literal notice is not.
      if (/Scripture quotations|© Crossway|Crossway\. Used by permission/u.test(body)) {
        offenders.push(file);
      }
    }
  }
}
assert.deepEqual(
  offenders,
  [],
  `competing Crossway notices found — use lib/esv-attribution.ts instead: ${offenders.join(", ")}`,
);

console.log("ESV attribution verification passed (one verbatim official source, both paths, no competitors).");
