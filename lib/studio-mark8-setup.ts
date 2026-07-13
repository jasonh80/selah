const SHA256 = /^[a-f0-9]{64}$/u;

export type Mark8StudioSetupDecision =
  | { kind: "locked" }
  | { kind: "setup"; setupDigest: string; ruleCount: number; noteCount: number }
  | { kind: "ready" }
  | { kind: "error" };

export function decideMark8StudioSetup(
  value: unknown,
): Mark8StudioSetupDecision {
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
  if (response.ok !== true || setup?.slug !== "mark-8") return { kind: "error" };
  if (setup.approved !== true) return { kind: "locked" };
  if (setup.complete === true) return { kind: "ready" };
  if (
    setup.canSetup === true &&
    typeof setup.setupDigest === "string" &&
    SHA256.test(setup.setupDigest) &&
    setup.ruleCount === 99 &&
    setup.noteCount === 10
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

export function buildMark8StudioSetupRequest(
  decision: Mark8StudioSetupDecision,
): Record<string, unknown> {
  if (decision.kind !== "setup") {
    throw new Error("Mark 8 setup requires an exact approved receipt");
  }
  return {
    action: "mark8_setup",
    slug: "mark-8",
    confirm: true,
    setupDigest: decision.setupDigest,
  };
}
