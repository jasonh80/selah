// Client-safe decisions for the generalized protected-chapter Studio setup
// (chapters approved after Mark 8; Mark 8 keeps studio-mark8-setup.ts).
const SHA256 = /^[a-f0-9]{64}$/u;

// The factory setup seeds the same approved v1.9 Brain library (99 rules) and
// exactly ten owner-receipted chapter notes; anything else is not the reviewed
// setup and stays locked.
export const MARK_SPRINT_SETUP_RULE_COUNT = 99;
export const MARK_SPRINT_SETUP_NOTE_COUNT = 10;

export type MarkSprintStudioSetupDecision =
  | { kind: "locked" }
  | { kind: "setup"; setupDigest: string; ruleCount: number; noteCount: number }
  | { kind: "ready" }
  | { kind: "error" };

export function decideMarkSprintStudioSetup(
  slug: string,
  value: unknown,
): MarkSprintStudioSetupDecision {
  if (!value || typeof value !== "object") return { kind: "error" };
  const response = value as {
    ok?: unknown;
    setup?: {
      slug?: unknown;
      approved?: unknown;
      complete?: unknown;
      canSetup?: unknown;
      setupDigest?: unknown;
      ruleCount?: unknown;
      noteCount?: unknown;
    };
  };
  const setup = response.setup;
  if (response.ok !== true || setup?.slug !== slug) return { kind: "error" };
  if (setup.approved !== true) return { kind: "locked" };
  if (setup.complete === true) return { kind: "ready" };
  if (
    setup.canSetup === true &&
    typeof setup.setupDigest === "string" &&
    SHA256.test(setup.setupDigest) &&
    setup.ruleCount === MARK_SPRINT_SETUP_RULE_COUNT &&
    setup.noteCount === MARK_SPRINT_SETUP_NOTE_COUNT
  ) {
    return {
      kind: "setup",
      setupDigest: setup.setupDigest,
      ruleCount: setup.ruleCount,
      noteCount: setup.noteCount,
    };
  }
  return { kind: "error" };
}

export function buildMarkSprintStudioSetupRequest(
  slug: string,
  decision: MarkSprintStudioSetupDecision,
): Record<string, unknown> {
  if (decision.kind !== "setup") {
    throw new Error("Protected chapter setup requires an exact approved receipt");
  }
  return {
    action: "mark_sprint_setup",
    slug,
    confirm: true,
    setupDigest: decision.setupDigest,
  };
}
