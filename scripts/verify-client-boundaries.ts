/**
 * Client/server module boundary gate (Codex P1-1, retracted PR #101).
 *
 * WHAT IT CATCHES: a server component importing a NON-component export from
 * a "use client" module. The build stays green, but at runtime every export
 * of a client module is a client REFERENCE when seen from the server —
 * calling one 500s the route (`TypeError: (0, r.J) is not a function` on
 * /chapter/exodus-27 was the live symptom).
 *
 * RULE: files WITHOUT "use client" may import ONLY Capitalized (component)
 * names from files WITH "use client". Type-only imports are always fine.
 *
 * Run: npm run verify:client-boundaries [scanRoot]   (offline, in prebuild)
 * The optional scanRoot lets the gate be pointed at another checkout — used
 * to prove it catches the original #101 crash tree.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", process.argv[2] ?? ".");
const SCAN_DIRS = ["app", "components", "lib"].map((d) => join(root, d)).filter(existsSync);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
}

const files: string[] = [];
for (const dir of SCAN_DIRS) walk(dir, files);

const isClient = new Map<string, boolean>();
for (const file of files) {
  const head = readFileSync(file, "utf8").slice(0, 500);
  isClient.set(file, /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(head));
}

function resolveImport(fromFile: string, spec: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return undefined; // package import
  for (const candidate of [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
    if (isClient.has(candidate)) return candidate;
  }
  return undefined;
}

const IMPORT_RE = /import\s+(type\s+)?({[^}]*}|[A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g;
const failures: string[] = [];
let checked = 0;

for (const file of files) {
  if (isClient.get(file)) continue; // client→client is always fine
  const src = readFileSync(file, "utf8");
  for (const match of src.matchAll(IMPORT_RE)) {
    const [, typeOnly, clause, spec] = match;
    if (typeOnly) continue;
    const target = resolveImport(file, spec);
    if (!target || !isClient.get(target)) continue;
    checked++;
    const names = clause.startsWith("{")
      ? clause
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !s.startsWith("type "))
          .map((s) => s.split(/\s+as\s+/)[0].trim())
      : [clause.trim()];
    for (const name of names) {
      if (name && /^[a-z]/.test(name)) {
        failures.push(
          `${file.slice(root.length + 1)} imports non-component "${name}" from client module ${target.slice(root.length + 1)} — this is an uncallable client reference on the server and will 500 the route at runtime.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("✗ verify:client-boundaries FAILED");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `verify:client-boundaries ✓ ${files.length} modules scanned, ${checked} server→client imports all component-only`,
);
