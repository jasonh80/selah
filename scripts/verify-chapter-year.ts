// Regressions for the shared chapter-year derivation and the date chip's
// "about N years ago" suffix (owner feature, 2026-07-19). Pure math — no
// network, no env. The BC path must honor "no year zero".
import { chapterYear, parseYear, yearsAgoLabel } from "../lib/chapter-year";
import type { ChapterWorkup } from "../lib/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// Fixed "now" so results never depend on when the gate runs.
const NOW_2026 = new Date("2026-07-19T12:00:00Z");

const workup = (over: Partial<ChapterWorkup>): ChapterWorkup =>
  ({ slug: "test", metaChips: [], ...over }) as ChapterWorkup;

// --- parseYear (moved from TimelineSection — behavior must be unchanged) ---
check("parseYear AD", parseYear("AD 30"), 30);
check("parseYear BC circa", parseYear("c. 1446 BC"), -1446);
check("parseYear range averages", parseYear("AD 30–33"), 32);
check("parseYear century", parseYear("1st century AD"), 50);
check("parseYear BCE", parseYear("959 BCE"), -959);
check("parseYear no digits", parseYear("unknown"), null);
check("parseYear missing", parseYear(undefined), null);

// --- chapterYear precedence: structured year > range midpoint > parsed copy ---
check(
  "chapterYear prefers estimatedYear",
  chapterYear(
    workup({
      estimatedDate: "AD 999",
      biblicalTimeline: {
        estimatedYear: 30,
        dateRange: { startYear: 20, endYear: 40 },
      } as ChapterWorkup["biblicalTimeline"],
    }),
  ),
  30,
);
check(
  "chapterYear falls back to range midpoint",
  chapterYear(
    workup({
      estimatedDate: "AD 999",
      biblicalTimeline: { dateRange: { startYear: -1010, endYear: -990 } } as ChapterWorkup["biblicalTimeline"],
    }),
  ),
  -1000,
);
check("chapterYear falls back to parsed copy", chapterYear(workup({ estimatedDate: "c. 1446 BC" })), -1446);
check("chapterYear null when nothing derivable", chapterYear(workup({})), null);

// --- yearsAgoLabel ---
check(
  "AD 30 in 2026 → about 1,996 years ago (comma-separated)",
  yearsAgoLabel(workup({ estimatedDate: "AD 30" }), NOW_2026),
  "about 1,996 years ago",
);
check(
  "1000 BC honors no-year-zero (2026 + 1000 − 1)",
  yearsAgoLabel(workup({ estimatedDate: "1000 BC" }), NOW_2026),
  "about 3,025 years ago",
);
check(
  "updates itself annually (same chapter, 2027)",
  yearsAgoLabel(workup({ estimatedDate: "AD 30" }), new Date("2027-01-02T12:00:00Z")),
  "about 1,997 years ago",
);
check("no derivable year → no suffix", yearsAgoLabel(workup({}), NOW_2026), null);
check(
  "current-era year never says '0 years ago'",
  yearsAgoLabel(workup({ estimatedDate: "AD 2026" }), NOW_2026),
  null,
);

if (failures > 0) {
  console.error(`verify-chapter-year: ${failures} failure(s)`);
  process.exit(1);
}
console.log("verify-chapter-year: all checks passed");
