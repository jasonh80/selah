// Offline gate for map location honesty (maps config lane,
// docs/selah/maps-config-lane.md).
//
// Proves every map config obeys the owner-approved certainty→treatment model
// against the digest-bound Prepare location entries in the acceptance fixture:
//   known   → rendered as a pin somewhere (Big Picture or Local), never a glow
//   debated → rendered as a glow area marked approx, never a pin
//   none    → never a pin, never a glow, never a drawn path — captions only
// In a chapter with approved entries, EVERY pin and region must be classified
// (locationName, checked against its treatment, or context: true, whose label
// may never reuse an approved location's name) and EVERY path must reference
// a "known" location — so an unclassified "Dalmanutha" pin or a drawn Mark
// 7:31 route cannot slip past the gate (PR #41 review, both P2s). Chapters
// with fixture locations but no map yet (mark-9) are noted, not failed — map
// tiles ride a later config pass.
import assert from "node:assert/strict";
import acceptanceArtifact from "../lib/ai/quality/mark-sprint-acceptance.v1.json";
import {
  CHAPTER_MAPS,
  prepareCertaintyToMapTreatment,
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

type FixtureLocation = { name: string; certainty: string; display: string };
const acceptance = acceptanceArtifact as unknown as {
  chapters: Record<string, { locations?: FixtureLocation[] }>;
};

// The mapping function IS the approved model — pin/area/text-only, exactly.
ok(prepareCertaintyToMapTreatment("known") === "pin", "known → pin");
ok(prepareCertaintyToMapTreatment("debated") === "area", "debated → area");
ok(prepareCertaintyToMapTreatment("none") === "text-only", "none → text-only");

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

const fixtureSlugs = Object.keys(acceptance.chapters);
for (const slug of fixtureSlugs) {
  const locations = acceptance.chapters[slug].locations ?? [];
  const cfg = CHAPTER_MAPS[slug];
  if (locations.length > 0 && !cfg) {
    console.log(
      `[maps-honesty] ${slug}: ${locations.length} approved location(s), no map config yet — allowed (map tiles ride a later pass)`,
    );
    continue;
  }
  if (!cfg) continue;

  const pins = allPins(cfg);
  const regions = allRegions(cfg);
  const paths = allPaths(cfg);
  const captionText = captions(cfg);
  const approvedNamesLower = new Set(
    locations.map((l) => l.name.toLowerCase()),
  );

  // Classification rule (PR #41 review, P2-1): every pin and region must be
  // EITHER an event overlay (locationName, treatment-checked below) OR an
  // explicit context overlay whose label never reuses an approved location's
  // name — an unclassified overlay cannot exist, so no pin can quietly name
  // an approved event location without being checked.
  for (const pin of pins) {
    const classified =
      (pin.locationName !== undefined) !== (pin.context === true);
    ok(
      classified,
      `${slug}: pin "${pin.label}" must be exactly one of event (locationName) or context`,
    );
    if (pin.context === true) {
      ok(
        !approvedNamesLower.has(pin.label.toLowerCase()),
        `${slug}: context pin "${pin.label}" reuses an approved location name`,
      );
    }
  }
  for (const region of regions) {
    const classified =
      (region.locationName !== undefined) !== (region.context === true);
    ok(
      classified,
      `${slug}: area "${region.label ?? "(unlabelled)"}" must be exactly one of event (locationName) or context`,
    );
    if (region.context === true) {
      ok(
        !approvedNamesLower.has((region.label ?? "").toLowerCase()),
        `${slug}: context area "${region.label}" reuses an approved location name`,
      );
    }
  }
  // Path rule (PR #41 review, P2-2): a drawn line must reference a "known"
  // location — there is no honest way to draw a "none" route (Mark 7:31) or
  // a "debated" area, and an unclassified path is refused outright.
  for (const path of paths) {
    ok(
      path.locationName !== undefined,
      `${slug}: path "${path.label ?? "(unlabelled)"}" must reference a known location`,
    );
    const entry = locations.find((l) => l.name === path.locationName);
    ok(
      Boolean(entry),
      `${slug}: path "${path.label}" references unapproved location "${path.locationName}"`,
    );
    if (entry) {
      ok(
        prepareCertaintyToMapTreatment(entry.certainty as never) === "pin",
        `${slug}: path "${path.label}" draws a "${entry.certainty}" location — only known locations may anchor a drawn line`,
      );
    }
  }

  for (const location of locations) {
    const treatment = prepareCertaintyToMapTreatment(
      location.certainty as "known" | "debated" | "none",
    );
    const pinRefs = pins.filter((p) => p.locationName === location.name);
    const regionRefs = regions.filter((r) => r.locationName === location.name);
    const pathRefs = paths.filter((p) => p.locationName === location.name);

    if (treatment === "pin") {
      ok(
        pinRefs.length > 0,
        `${slug}: known location "${location.name}" must be pinned on some map level`,
      );
      ok(
        regionRefs.length === 0,
        `${slug}: known location "${location.name}" must never render as a glow area`,
      );
    } else if (treatment === "area") {
      ok(
        regionRefs.length > 0,
        `${slug}: debated location "${location.name}" must render as a glow area`,
      );
      ok(
        regionRefs.every((r) => r.variant === "glow" && r.approx === true),
        `${slug}: debated location "${location.name}" areas must be glow + approx`,
      );
      ok(
        regionRefs.every((r) => (r.label ?? "").toLowerCase().includes("debated")),
        `${slug}: debated location "${location.name}" areas must be labelled debated`,
      );
      ok(
        pinRefs.length === 0,
        `${slug}: debated location "${location.name}" must never be pinned`,
      );
    } else {
      ok(
        pinRefs.length === 0,
        `${slug}: no-pin location "${location.name}" must never be pinned`,
      );
      ok(
        regionRefs.length === 0,
        `${slug}: no-pin location "${location.name}" must never render as a glow area`,
      );
      ok(
        pathRefs.length === 0,
        `${slug}: no-pin location "${location.name}" must never render as a drawn path`,
      );
      // A "none" location the map covers should still be named honestly in a
      // caption — silence would hide the uncertainty instead of stating it.
      const firstWord = location.name.split(" ")[0];
      ok(
        captionText.toLowerCase().includes(firstWord.toLowerCase()) ||
          captionText.toLowerCase().includes("route"),
        `${slug}: no-pin location "${location.name}" should be named in a caption`,
      );
    }
  }

  // Reverse direction: a map may only reference approved fixture locations,
  // with the exact approved treatment.
  const approvedNames = new Set(locations.map((l) => l.name));
  for (const pin of pins) {
    if (pin.locationName === undefined) continue;
    ok(
      approvedNames.has(pin.locationName),
      `${slug}: pin "${pin.label}" references unapproved location "${pin.locationName}"`,
    );
    const entry = locations.find((l) => l.name === pin.locationName)!;
    ok(
      prepareCertaintyToMapTreatment(entry.certainty as never) === "pin",
      `${slug}: pin "${pin.label}" contradicts approved certainty "${entry.certainty}"`,
    );
  }
  for (const region of regions) {
    if (region.locationName === undefined) continue;
    ok(
      approvedNames.has(region.locationName),
      `${slug}: area "${region.label}" references unapproved location "${region.locationName}"`,
    );
    const entry = locations.find((l) => l.name === region.locationName)!;
    ok(
      prepareCertaintyToMapTreatment(entry.certainty as never) === "area",
      `${slug}: area "${region.label}" contradicts approved certainty "${entry.certainty}"`,
    );
  }
}

// Negative controls: the model itself must catch dishonest configs, so feed it
// synthetic violations and prove each one fails.
function expectViolation(label: string, fn: () => void): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  ok(threw, label);
}

const syntheticLocations: FixtureLocation[] = [
  { name: "Nowhere Certain", certainty: "none", display: "no pin" },
  { name: "Argued Hill", certainty: "debated", display: "area" },
  { name: "Real Town", certainty: "known", display: "point" },
];
function assertHonest(
  cfgPins: MapPin[],
  cfgRegions: MapRegion[],
  cfgPaths: MapPath[] = [],
): void {
  const names = new Set(syntheticLocations.map((l) => l.name.toLowerCase()));
  for (const pin of cfgPins) {
    assert.ok(
      (pin.locationName !== undefined) !== (pin.context === true),
      "unclassified pin",
    );
    if (pin.context === true) {
      assert.ok(!names.has(pin.label.toLowerCase()), "context pin reuses approved name");
    }
  }
  for (const region of cfgRegions) {
    assert.ok(
      (region.locationName !== undefined) !== (region.context === true),
      "unclassified region",
    );
    if (region.context === true) {
      assert.ok(!names.has((region.label ?? "").toLowerCase()), "context area reuses approved name");
    }
  }
  for (const path of cfgPaths) {
    const entry = syntheticLocations.find((l) => l.name === path.locationName);
    assert.ok(entry, "path without a known location reference");
    assert.ok(
      prepareCertaintyToMapTreatment(entry!.certainty as never) === "pin",
      "path draws a non-known location",
    );
  }
  for (const location of syntheticLocations) {
    const treatment = prepareCertaintyToMapTreatment(location.certainty as never);
    const pinRefs = cfgPins.filter((p) => p.locationName === location.name);
    const regionRefs = cfgRegions.filter((r) => r.locationName === location.name);
    const pathRefs = cfgPaths.filter((p) => p.locationName === location.name);
    if (treatment === "text-only") {
      assert.ok(
        pinRefs.length === 0 && regionRefs.length === 0 && pathRefs.length === 0,
        "none leaked",
      );
    } else if (treatment === "area") {
      assert.ok(pinRefs.length === 0, "debated pinned");
      assert.ok(
        regionRefs.every((r) => r.variant === "glow" && r.approx === true),
        "debated area not approx glow",
      );
    } else {
      assert.ok(regionRefs.length === 0, "known glowed");
    }
  }
}
expectViolation("a pin on a certainty-none location is caught", () =>
  assertHonest([{ x: 1, y: 1, label: "Nowhere", locationName: "Nowhere Certain" }], []),
);
expectViolation("a glow on a certainty-none location is caught", () =>
  assertHonest(
    [],
    [{ cx: 1, cy: 1, rx: 1, ry: 1, variant: "glow", approx: true, locationName: "Nowhere Certain" }],
  ),
);
expectViolation("a pin on a debated location is caught", () =>
  assertHonest([{ x: 1, y: 1, label: "Hill", locationName: "Argued Hill" }], []),
);
expectViolation("a non-approx debated area is caught", () =>
  assertHonest(
    [],
    [{ cx: 1, cy: 1, rx: 1, ry: 1, variant: "glow", locationName: "Argued Hill" }],
  ),
);
expectViolation("a territory variant on a debated location is caught", () =>
  assertHonest(
    [],
    [{ cx: 1, cy: 1, rx: 1, ry: 1, variant: "territory", approx: true, locationName: "Argued Hill" }],
  ),
);
// PR #41 review, P2-1: bypass attempts via classification.
expectViolation("an UNCLASSIFIED pin naming an approved location is caught", () =>
  assertHonest([{ x: 1, y: 1, label: "Nowhere Certain" }], []),
);
expectViolation("a context pin reusing an approved location name is caught", () =>
  assertHonest([{ x: 1, y: 1, label: "Nowhere Certain", context: true }], []),
);
expectViolation("a pin classified as BOTH event and context is caught", () =>
  assertHonest(
    [{ x: 1, y: 1, label: "Town", locationName: "Real Town", context: true }],
    [],
  ),
);
expectViolation("an unclassified region is caught", () =>
  assertHonest([], [{ cx: 1, cy: 1, rx: 1, ry: 1, variant: "glow", label: "Somewhere" }]),
);
// PR #41 review, P2-2: drawn paths.
expectViolation("a path drawing a certainty-none route is caught", () =>
  assertHonest([], [], [{ points: [[0, 0], [1, 1]], label: "the route", locationName: "Nowhere Certain" }]),
);
expectViolation("a path drawing a debated location is caught", () =>
  assertHonest([], [], [{ points: [[0, 0], [1, 1]], locationName: "Argued Hill" }]),
);
expectViolation("an unclassified path is caught", () =>
  assertHonest([], [], [{ points: [[0, 0], [1, 1]], label: "mystery line" }]),
);
// A properly classified config passes — the controls prove violations fail,
// not that everything fails.
assertHonest(
  [
    { x: 1, y: 1, label: "Real Town", locationName: "Real Town" },
    { x: 2, y: 2, label: "Backdrop City", context: true },
  ],
  [{ cx: 1, cy: 1, rx: 1, ry: 1, variant: "glow", approx: true, label: "Argued Hill · debated", locationName: "Argued Hill" }],
  [{ points: [[0, 0], [1, 1]], label: "toward Real Town", locationName: "Real Town" }],
);
ok(true, "a fully classified honest config passes the model");

// The chapters this lane ships must actually be covered end-to-end.
for (const slug of ["mark-7", "mark-8"] as const) {
  ok(Boolean(CHAPTER_MAPS[slug]), `${slug} has a map config`);
  ok(
    (acceptance.chapters[slug].locations ?? []).length > 0,
    `${slug} has approved location entries`,
  );
}

console.log(`verify:maps-honesty ✓ ${checks} checks passed (certainty→treatment model enforced against the digest-bound location entries)`);
