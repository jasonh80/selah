// Client-safe location model for chapter Prepare/maps (PR #41 review).
//
// Two INDEPENDENT facts per place, plus why it is shown at all:
//   featureKind — what shape the place honestly has on a map:
//     point · region · route · text-only
//   certainty   — how sure the identification/extent is:
//     known · probable · debated · unknown
//   role        — event (where something happened) or context (orientation)
// Certainty alone cannot determine geometry: a known REGION is an area, not
// a pin; a place named plainly in the text can still have a debated modern
// identification (Bethsaida: et-Tell vs el-Araj). The verifier enforces the
// allowed combinations instead of deriving all geometry from certainty.
//
// Legacy entries (the owner-approved Mark 9 packet, bound byte-identical in
// the acceptance fixture) carry only { name, certainty: known|debated|none,
// display }; they normalize here and are never rewritten on disk.

export const PREPARE_FEATURE_KINDS = [
  "point",
  "region",
  "route",
  "text-only",
] as const;
export type PrepareFeatureKind = (typeof PREPARE_FEATURE_KINDS)[number];

export const PREPARE_CERTAINTIES = [
  "known",
  "probable",
  "debated",
  "unknown",
] as const;
export type PrepareCertainty = (typeof PREPARE_CERTAINTIES)[number];

export const PREPARE_ROLES = ["event", "context"] as const;
export type PrepareRole = (typeof PREPARE_ROLES)[number];

export interface PrepareLocation {
  name: string;
  featureKind: PrepareFeatureKind;
  certainty: PrepareCertainty;
  role: PrepareRole;
  display: string;
}

const LEGACY_CERTAINTIES = ["known", "debated", "none"] as const;

/** Allowed featureKind × certainty combinations. A "debated point" is not
 * allowed — a disputed identification must widen to a region (candidate
 * sites) or drop to text-only rather than assert a single dot. */
export function prepareLocationComboAllowed(
  featureKind: PrepareFeatureKind,
  certainty: PrepareCertainty,
): boolean {
  switch (featureKind) {
    case "point":
      return certainty === "known";
    case "region":
      return certainty === "known" || certainty === "probable" || certainty === "debated";
    case "route":
      // A drawn route requires the ROUTE itself to be known — known
      // endpoints never make the connecting road known (PR #41 review).
      return certainty === "known" || certainty === "unknown";
    case "text-only":
      return certainty === "unknown";
  }
}

/** How a location may render on a map. Derived from featureKind (the shape),
 * with certainty carried into the label qualifier — never the reverse. */
export type PrepareMapTreatment = "pin" | "area" | "path" | "text-only";
export function prepareLocationMapTreatment(
  location: Pick<PrepareLocation, "featureKind" | "certainty">,
): PrepareMapTreatment {
  switch (location.featureKind) {
    case "point":
      return "pin";
    case "region":
      return "area";
    case "route":
      return location.certainty === "known" ? "path" : "text-only";
    case "text-only":
      return "text-only";
  }
}

/** The honesty qualifier a rendered area's label must carry, so the map
 * states its own uncertainty (verify:maps-honesty checks for it). */
export function prepareAreaLabelQualifier(certainty: PrepareCertainty): string {
  return certainty === "known" ? "approx" : certainty;
}

/** Short owner-facing badge for the Prepare screen. */
export function prepareLocationBadge(
  location: Pick<PrepareLocation, "featureKind" | "certainty">,
): string {
  if (location.featureKind === "point") return "Known site";
  if (location.featureKind === "region") {
    return location.certainty === "known"
      ? "Known region · approx. boundary"
      : location.certainty === "probable"
        ? "Probable area"
        : "Debated site · area shown";
  }
  if (location.featureKind === "route") {
    return location.certainty === "known" ? "Known route" : "Route unrecorded";
  }
  return "No pin";
}

/** Strictly validate one raw fixture/API entry (either shape) and normalize
 * it to the two-axis model. Returns null on any malformed entry. */
export function normalizePrepareLocation(value: unknown): PrepareLocation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== "string" || raw.name.trim() === "") return null;
  if (typeof raw.display !== "string" || raw.display.trim() === "") return null;

  if (raw.featureKind !== undefined || raw.role !== undefined) {
    // New shape: all three axes required and the combination must be allowed.
    if (
      !(PREPARE_FEATURE_KINDS as readonly string[]).includes(String(raw.featureKind)) ||
      !(PREPARE_CERTAINTIES as readonly string[]).includes(String(raw.certainty)) ||
      !(PREPARE_ROLES as readonly string[]).includes(String(raw.role))
    ) {
      return null;
    }
    const featureKind = raw.featureKind as PrepareFeatureKind;
    const certainty = raw.certainty as PrepareCertainty;
    if (!prepareLocationComboAllowed(featureKind, certainty)) return null;
    return {
      name: raw.name,
      featureKind,
      certainty,
      role: raw.role as PrepareRole,
      display: raw.display,
    };
  }

  // Legacy shape (owner-approved Mark 9 entries, bound byte-identical):
  // known → known point · debated → debated region · none → text-only.
  if (!(LEGACY_CERTAINTIES as readonly string[]).includes(String(raw.certainty))) {
    return null;
  }
  const legacy = raw.certainty as (typeof LEGACY_CERTAINTIES)[number];
  return {
    name: raw.name,
    featureKind: legacy === "known" ? "point" : legacy === "debated" ? "region" : "text-only",
    certainty: legacy === "known" ? "known" : legacy === "debated" ? "debated" : "unknown",
    role: "event",
    display: raw.display,
  };
}
