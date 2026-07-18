// Offline gate for map location honesty (maps config lane,
// docs/selah/maps-config-lane.md, corrected per the PR #41 review).
//
// The owner-approved model keeps TWO INDEPENDENT facts per place, plus a
// role (lib/prepare-locations.ts):
//   featureKind  point · region · route · text-only   (what shape it has)
//   certainty    known · probable · debated · unknown (how sure we are)
//   role         event · context                      (why it is shown)
// Geometry is never derived from certainty alone. This gate proves every map
// config renders each digest-bound entry with its exact allowed treatment:
//   point (always known)        → pin somewhere; never an area or path
//   region (known/prob/debated) → glow area marked approx whose label carries
//                                 the certainty qualifier; never a pin/path
//   route unknown               → nothing drawn, named in a caption
//   route known                 → the ONLY thing a drawn path may reference —
//                                 known endpoints never make a road known
//   text-only                   → nothing drawn, named in a caption
// Every pin/region in a checked chapter must be classified (locationName or
// context: true, never both), a context overlay may not reuse an approved
// name, and every path must reference a known ROUTE entry — so an
// unclassified "Dalmanutha" pin or a guessed Bethsaida→Caesarea line cannot
// slip past. Chapters with fixture locations but no map yet (mark-9) are
// noted, not failed — map tiles ride a later config pass.
import assert from "node:assert/strict";
import acceptanceArtifact from "../lib/ai/quality/mark-sprint-acceptance.v1.json";
import {
  MARK_7_BOUND_CONTENT_CHANGED_AT,
  MARK_7_STUDIO_SETUP_APPROVAL,
} from "../lib/server/mark-sprint-setup-contracts";
import {
  normalizePrepareLocation,
  prepareAreaLabelQualifier,
  prepareLocationComboAllowed,
  prepareLocationMapTreatment,
  type PrepareLocation,
} from "../lib/prepare-locations";
import {
  CHAPTER_MAPS,
  type ChapterMapConfig,
  type MapPath,
  type MapPin,
  type MapRegion,
} from "../lib/maps/chapter-maps";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

const acceptance = acceptanceArtifact as unknown as {
  chapters: Record<string, { locations?: Array<Record<string, unknown>> }>;
};

// --- The model itself -------------------------------------------------------
// Allowed combinations: a "debated point" may not exist — a disputed
// identification must widen to a region or drop to text-only.
ok(prepareLocationComboAllowed("point", "known"), "point+known allowed");
ok(!prepareLocationComboAllowed("point", "debated"), "point+debated refused");
ok(!prepareLocationComboAllowed("point", "probable"), "point+probable refused");
ok(!prepareLocationComboAllowed("point", "unknown"), "point+unknown refused");
ok(prepareLocationComboAllowed("region", "known"), "region+known allowed");
ok(prepareLocationComboAllowed("region", "probable"), "region+probable allowed");
ok(prepareLocationComboAllowed("region", "debated"), "region+debated allowed");
ok(!prepareLocationComboAllowed("region", "unknown"), "region+unknown refused (that is text-only)");
ok(prepareLocationComboAllowed("route", "unknown"), "route+unknown allowed (never drawn)");
ok(prepareLocationComboAllowed("route", "known"), "route+known allowed (drawable)");
ok(prepareLocationComboAllowed("route", "probable"), "route+probable allowed (broad corridor — owner amendment 2026-07-17)");
ok(!prepareLocationComboAllowed("route", "debated"), "route+debated refused");
ok(!prepareLocationComboAllowed("text-only", "known"), "text-only+known refused");
ok(prepareLocationComboAllowed("text-only", "unknown"), "text-only+unknown allowed");

// Treatment derives from featureKind (shape), not certainty.
ok(prepareLocationMapTreatment({ featureKind: "point", certainty: "known" }) === "pin", "point → pin");
ok(prepareLocationMapTreatment({ featureKind: "region", certainty: "known" }) === "area", "known region → area, NOT a pin");
ok(prepareLocationMapTreatment({ featureKind: "region", certainty: "debated" }) === "area", "debated region → area");
ok(prepareLocationMapTreatment({ featureKind: "route", certainty: "unknown" }) === "text-only", "unknown route → never drawn");
ok(prepareLocationMapTreatment({ featureKind: "route", certainty: "known" }) === "path", "known route → drawable");
ok(prepareLocationMapTreatment({ featureKind: "route", certainty: "probable" }) === "corridor", "probable route → broad corridor, never a precise path");
ok(prepareLocationMapTreatment({ featureKind: "text-only", certainty: "unknown" }) === "text-only", "text-only → text-only");

// The helper itself fails closed on forbidden combinations (PR #41 review,
// P2) — a "debated point" must throw, never quietly return a pin.
function treatmentThrows(featureKind: string, certainty: string): boolean {
  try {
    prepareLocationMapTreatment({ featureKind, certainty } as never);
    return false;
  } catch {
    return true;
  }
}
ok(treatmentThrows("point", "debated"), "treatment(point+debated) throws — never a pin");
ok(treatmentThrows("point", "unknown"), "treatment(point+unknown) throws");
ok(treatmentThrows("region", "unknown"), "treatment(region+unknown) throws");
ok(treatmentThrows("route", "debated"), "treatment(route+debated) throws");
ok(treatmentThrows("text-only", "known"), "treatment(text-only+known) throws");

// The re-minted Mark 7 receipt must record the LATEST owner decision (PR #41
// review, P1): approved_at may never predate the moment the bound content
// last changed, so a re-mint can never silently ride an old approval date.
{
  const approvedAt = Date.parse(MARK_7_STUDIO_SETUP_APPROVAL?.approved_at ?? "");
  const contentChangedAt = Date.parse(MARK_7_BOUND_CONTENT_CHANGED_AT);
  ok(!Number.isNaN(approvedAt), "mark-7 approved_at parses");
  ok(!Number.isNaN(contentChangedAt), "mark-7 bound-content-changed-at parses");
  ok(
    approvedAt >= contentChangedAt,
    "mark-7 approved_at must not predate the re-mint that changed bound content",
  );
}

// Legacy entries (the byte-identical Mark 9 packet) normalize losslessly.
ok(
  JSON.stringify(normalizePrepareLocation({ name: "X", certainty: "known", display: "d" })) ===
    JSON.stringify({ name: "X", featureKind: "point", certainty: "known", role: "event", display: "d" }),
  "legacy known → known point",
);
ok(
  normalizePrepareLocation({ name: "X", certainty: "none", display: "d" })?.featureKind === "text-only",
  "legacy none → text-only",
);
ok(
  normalizePrepareLocation({ name: "X", certainty: "debated", display: "d" })?.featureKind === "region",
  "legacy debated → debated region",
);
ok(
  normalizePrepareLocation({ name: "X", featureKind: "point", certainty: "debated", role: "event", display: "d" }) === null,
  "a debated point entry is refused at normalization",
);
ok(
  normalizePrepareLocation({ name: "X", featureKind: "region", certainty: "known", role: "bogus", display: "d" }) === null,
  "a bogus role is refused",
);

// --- Per-chapter map enforcement --------------------------------------------
function allPins(cfg: ChapterMapConfig): MapPin[] {
  return [
    ...(cfg.bigPicture?.pins ?? []),
    ...Object.values(cfg.local?.modes ?? {}).flatMap((mode) => mode.pins),
  ];
}
function allRegions(cfg: ChapterMapConfig): MapRegion[] {
  return [
    ...(cfg.bigPicture?.regions ?? []),
    ...Object.values(cfg.local?.modes ?? {}).flatMap((mode) => mode.regions),
  ];
}
function allPaths(cfg: ChapterMapConfig): MapPath[] {
  return Object.values(cfg.local?.modes ?? {}).flatMap((mode) => mode.paths);
}
function captions(cfg: ChapterMapConfig): string {
  return [cfg.bigPicture?.caption, cfg.local?.caption, cfg.streetView?.caption]
    .filter(Boolean)
    .join(" ");
}

function checkChapter(
  slug: string,
  locations: PrepareLocation[],
  cfg: ChapterMapConfig,
  check: (cond: boolean, label: string) => void,
): void {
  const pins = allPins(cfg);
  const regions = allRegions(cfg);
  const paths = allPaths(cfg);
  const captionText = captions(cfg).toLowerCase();
  const approvedNamesLower = new Set(locations.map((l) => l.name.toLowerCase()));
  const byName = new Map(locations.map((l) => [l.name, l]));

  // Classification: every pin/region is exactly one of event or context, and
  // a context overlay may never reuse an approved location's name.
  for (const pin of pins) {
    check(
      (pin.locationName !== undefined) !== (pin.context === true),
      `${slug}: pin "${pin.label}" must be exactly one of event (locationName) or context`,
    );
    if (pin.context === true) {
      check(
        !approvedNamesLower.has(pin.label.toLowerCase()),
        `${slug}: context pin "${pin.label}" reuses an approved location name`,
      );
    }
    if (pin.locationName !== undefined) {
      const entry = byName.get(pin.locationName);
      check(
        Boolean(entry),
        `${slug}: pin "${pin.label}" references unapproved location "${pin.locationName}"`,
      );
      if (entry) {
        check(
          prepareLocationMapTreatment(entry) === "pin",
          `${slug}: pin "${pin.label}" contradicts approved ${entry.featureKind}/${entry.certainty}`,
        );
      }
    }
  }
  for (const region of regions) {
    check(
      (region.locationName !== undefined) !== (region.context === true),
      `${slug}: area "${region.label ?? "(unlabelled)"}" must be exactly one of event (locationName) or context`,
    );
    if (region.context === true) {
      check(
        !approvedNamesLower.has((region.label ?? "").toLowerCase()),
        `${slug}: context area "${region.label}" reuses an approved location name`,
      );
    }
    if (region.locationName !== undefined) {
      const entry = byName.get(region.locationName);
      check(
        Boolean(entry),
        `${slug}: area "${region.label}" references unapproved location "${region.locationName}"`,
      );
      if (entry) {
        check(
          prepareLocationMapTreatment(entry) === "area",
          `${slug}: area "${region.label}" contradicts approved ${entry.featureKind}/${entry.certainty}`,
        );
        check(
          region.variant === "glow" && region.approx === true,
          `${slug}: area "${region.label}" must be a glow marked approx`,
        );
        check(
          (region.label ?? "").toLowerCase().includes(prepareAreaLabelQualifier(entry.certainty)),
          `${slug}: area "${region.label}" must carry the "${prepareAreaLabelQualifier(entry.certainty)}" qualifier`,
        );
      }
    }
  }
  // Paths may ONLY reference a known ROUTE entry — known endpoints never make
  // the connecting road known, and unknown routes are never drawn.
  for (const path of paths) {
    check(
      path.locationName !== undefined,
      `${slug}: path "${path.label ?? "(unlabelled)"}" must reference an approved route entry`,
    );
    const entry = path.locationName ? byName.get(path.locationName) : undefined;
    check(
      Boolean(entry),
      `${slug}: path "${path.label}" references unapproved location "${path.locationName}"`,
    );
    if (entry) {
      check(
        entry.featureKind === "route" && prepareLocationMapTreatment(entry) === "path",
        `${slug}: path "${path.label}" draws ${entry.featureKind}/${entry.certainty} — only a known ROUTE may be drawn`,
      );
    }
  }

  // Forward direction: every approved entry renders with its exact treatment.
  for (const location of locations) {
    const treatment = prepareLocationMapTreatment(location);
    const pinRefs = pins.filter((p) => p.locationName === location.name);
    const regionRefs = regions.filter((r) => r.locationName === location.name);
    const pathRefs = paths.filter((p) => p.locationName === location.name);

    if (treatment === "pin") {
      check(
        pinRefs.length > 0,
        `${slug}: point "${location.name}" must be pinned on some map level`,
      );
      check(
        regionRefs.length === 0 && pathRefs.length === 0,
        `${slug}: point "${location.name}" must render only as a pin`,
      );
    } else if (treatment === "area") {
      check(
        regionRefs.length > 0,
        `${slug}: region "${location.name}" must render as a glow area`,
      );
      check(
        pinRefs.length === 0 && pathRefs.length === 0,
        `${slug}: region "${location.name}" must never be pinned or drawn as a line`,
      );
    } else if (treatment === "path") {
      check(
        pinRefs.length === 0 && regionRefs.length === 0,
        `${slug}: route "${location.name}" may render only as a path`,
      );
    } else {
      check(
        pinRefs.length === 0 && regionRefs.length === 0 && pathRefs.length === 0,
        `${slug}: "${location.name}" (${location.featureKind}/${location.certainty}) must render as text only`,
      );
      const firstWord = location.name.split(" ")[0].toLowerCase();
      check(
        captionText.includes(firstWord) || captionText.includes("route"),
        `${slug}: text-only location "${location.name}" should be named in a caption`,
      );
    }
  }
}

const fixtureSlugs = Object.keys(acceptance.chapters);
for (const slug of fixtureSlugs) {
  const raw = acceptance.chapters[slug].locations ?? [];
  const locations = raw
    .map((entry) => normalizePrepareLocation(entry))
    .filter((entry): entry is PrepareLocation => entry !== null);
  ok(
    locations.length === raw.length,
    `${slug}: every fixture location entry is valid under the two-axis model`,
  );
  const cfg = CHAPTER_MAPS[slug];
  if (locations.length > 0 && !cfg) {
    console.log(
      `[maps-honesty] ${slug}: ${locations.length} approved location(s), no map config yet — allowed (map tiles ride a later pass)`,
    );
    continue;
  }
  if (!cfg) continue;
  checkChapter(slug, locations, cfg, ok);
}

// --- Negative controls -------------------------------------------------------
// Feed the SAME enforcement synthetic violations and prove each one fails.
function expectViolation(label: string, fn: () => void): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  ok(threw, label);
}

const SYNTHETIC: PrepareLocation[] = [
  { name: "Real Town", featureKind: "point", certainty: "known", role: "context", display: "d" },
  { name: "Wide League", featureKind: "region", certainty: "known", role: "event", display: "d" },
  { name: "Argued Site", featureKind: "region", certainty: "debated", role: "event", display: "d" },
  { name: "Lost District", featureKind: "text-only", certainty: "unknown", role: "event", display: "d" },
  { name: "Unrecorded Route", featureKind: "route", certainty: "unknown", role: "event", display: "d" },
  { name: "Paved Highway", featureKind: "route", certainty: "known", role: "event", display: "d" },
  { name: "Roundabout Way", featureKind: "route", certainty: "probable", role: "event", display: "d" },
];
function syntheticCheck(
  pins: MapPin[],
  regions: MapRegion[],
  paths: MapPath[] = [],
  caption = "The Lost District and the route are named here.",
): void {
  const cfg: ChapterMapConfig = {
    local: {
      baseMapImage: "x",
      attribution: "x",
      caption,
      milesAcross: 1,
      modes: {
        today: { pins, labels: [], regions, paths },
        biblical: { pins: [], labels: [], regions: [], paths: [] },
      },
    },
  };
  // Baseline renders that must exist for the synthetic fixture to pass:
  // Real Town pin, Wide League + Argued Site areas.
  checkChapter("synthetic", SYNTHETIC, cfg, (cond, label) => assert.ok(cond, label));
}
const HONEST_PINS: MapPin[] = [
  { x: 1, y: 1, label: "Real Town", locationName: "Real Town" },
  { x: 2, y: 2, label: "Backdrop City", context: true },
];
const HONEST_REGIONS: MapRegion[] = [
  { cx: 1, cy: 1, rx: 1, ry: 1, variant: "glow", approx: true, label: "Wide League · approx. extent", locationName: "Wide League" },
  { cx: 2, cy: 2, rx: 1, ry: 1, variant: "glow", approx: true, label: "Argued Site · debated", locationName: "Argued Site" },
];
// The honest baseline passes — the controls below prove violations fail, not
// that everything fails.
syntheticCheck(HONEST_PINS, HONEST_REGIONS, [
  { points: [[0, 0], [1, 1]], label: "along the highway", locationName: "Paved Highway" },
]);
ok(true, "a fully classified honest two-axis config passes");

expectViolation("a pin on a KNOWN REGION is caught (certainty alone never makes a pin)", () =>
  syntheticCheck(
    [...HONEST_PINS, { x: 3, y: 3, label: "League HQ", locationName: "Wide League" }],
    HONEST_REGIONS,
  ),
);
expectViolation("a single pin on a debated-identification site is caught", () =>
  syntheticCheck(
    [...HONEST_PINS, { x: 3, y: 3, label: "Argued Site", locationName: "Argued Site" }],
    HONEST_REGIONS,
  ),
);
expectViolation("an unclassified pin naming an approved location is caught", () =>
  syntheticCheck([...HONEST_PINS, { x: 3, y: 3, label: "Lost District" }], HONEST_REGIONS),
);
expectViolation("a context pin reusing an approved location name is caught", () =>
  syntheticCheck(
    [...HONEST_PINS, { x: 3, y: 3, label: "Lost District", context: true }],
    HONEST_REGIONS,
  ),
);
expectViolation("a pin classified as BOTH event and context is caught", () =>
  syntheticCheck(
    [...HONEST_PINS, { x: 3, y: 3, label: "Town", locationName: "Real Town", context: true }],
    HONEST_REGIONS,
  ),
);
expectViolation("a glow on a text-only location is caught", () =>
  syntheticCheck(HONEST_PINS, [
    ...HONEST_REGIONS,
    { cx: 3, cy: 3, rx: 1, ry: 1, variant: "glow", approx: true, label: "Lost District · unknown", locationName: "Lost District" },
  ]),
);
expectViolation("an area label missing its certainty qualifier is caught", () =>
  syntheticCheck(HONEST_PINS, [
    HONEST_REGIONS[0],
    { ...HONEST_REGIONS[1], label: "Argued Site" },
  ]),
);
expectViolation("a drawn UNKNOWN route is caught", () =>
  syntheticCheck(HONEST_PINS, HONEST_REGIONS, [
    { points: [[0, 0], [1, 1]], label: "the roundabout way", locationName: "Unrecorded Route" },
  ]),
);
expectViolation("a PRECISE path on a corridor-only route is caught (broad sweep, never a line)", () =>
  syntheticCheck(HONEST_PINS, HONEST_REGIONS, [
    { points: [[0, 0], [1, 1]], label: "the roundabout way", locationName: "Roundabout Way" },
  ]),
);
expectViolation("a path referencing a known POINT is caught (endpoints never make a road known)", () =>
  syntheticCheck(HONEST_PINS, HONEST_REGIONS, [
    { points: [[0, 0], [1, 1]], label: "toward Real Town", locationName: "Real Town" },
  ]),
);
expectViolation("an unclassified path is caught", () =>
  syntheticCheck(HONEST_PINS, HONEST_REGIONS, [
    { points: [[0, 0], [1, 1]], label: "mystery line" },
  ]),
);
expectViolation("a missing required area render is caught", () =>
  syntheticCheck(HONEST_PINS, [HONEST_REGIONS[0]]),
);
expectViolation("a missing required pin render is caught", () =>
  syntheticCheck([HONEST_PINS[1]], HONEST_REGIONS),
);

// The chapters this lane ships must carry their approved entries. Their MAP
// configs are intentionally absent: the owner chose a real map engine
// (2026-07-17) over the static-image renderer, so the drawing layer lands in
// the maps-engine lane and this gate picks it up the moment a config exists.
for (const slug of ["mark-7", "mark-8"] as const) {
  ok(
    (acceptance.chapters[slug].locations ?? []).length > 0,
    `${slug} has approved location entries`,
  );
}

console.log(`verify:maps-honesty ✓ ${checks} checks passed (two-axis featureKind×certainty model enforced against the digest-bound location entries)`);
