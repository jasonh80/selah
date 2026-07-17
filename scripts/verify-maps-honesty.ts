// Offline gate for map location honesty (maps config lane,
// docs/selah/maps-config-lane.md).
//
// Proves every map config obeys the owner-approved certainty→treatment model
// against the digest-bound Prepare location entries in the acceptance fixture:
//   known   → rendered as a pin somewhere (Big Picture or Local), never a glow
//   debated → rendered as a glow area marked approx, never a pin
//   none    → never a pin, never a glow — captions only
// Also proves the reverse: every locationName a map references exists in the
// fixture, so a map can never render an event location the owner did not
// approve. Chapters with fixture locations but no map yet (mark-9) are noted,
// not failed — map tiles ride a later config pass.
import assert from "node:assert/strict";
import acceptanceArtifact from "../lib/ai/quality/mark-sprint-acceptance.v1.json";
import {
  CHAPTER_MAPS,
  prepareCertaintyToMapTreatment,
  type ChapterMapConfig,
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
  const captionText = captions(cfg);

  for (const location of locations) {
    const treatment = prepareCertaintyToMapTreatment(
      location.certainty as "known" | "debated" | "none",
    );
    const pinRefs = pins.filter((p) => p.locationName === location.name);
    const regionRefs = regions.filter((r) => r.locationName === location.name);

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
function assertHonest(cfgPins: MapPin[], cfgRegions: MapRegion[]): void {
  for (const location of syntheticLocations) {
    const treatment = prepareCertaintyToMapTreatment(location.certainty as never);
    const pinRefs = cfgPins.filter((p) => p.locationName === location.name);
    const regionRefs = cfgRegions.filter((r) => r.locationName === location.name);
    if (treatment === "text-only") {
      assert.ok(pinRefs.length === 0 && regionRefs.length === 0, "none leaked");
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

// The chapters this lane ships must actually be covered end-to-end.
for (const slug of ["mark-7", "mark-8"] as const) {
  ok(Boolean(CHAPTER_MAPS[slug]), `${slug} has a map config`);
  ok(
    (acceptance.chapters[slug].locations ?? []).length > 0,
    `${slug} has approved location entries`,
  );
}

console.log(`verify:maps-honesty ✓ ${checks} checks passed (certainty→treatment model enforced against the digest-bound location entries)`);
