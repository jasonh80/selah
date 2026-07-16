// Pure derivation of the Selah Studio launch progress strip (issue #29).
// No network, storage, or React — the page feeds its existing state in and
// renders whatever comes back, so the strip can never add a new gate: it
// only mirrors decisions the flow already made.

export type LaunchStepKey =
  | "setup"
  | "prepare"
  | "draft"
  | "wording"
  | "images"
  | "publish";

/**
 * done — finished; active — where the owner is working now;
 * attention — stopped and needs the owner (error/blocked/needs-work);
 * todo — not reached yet.
 */
export type LaunchStepState = "done" | "active" | "attention" | "todo";

export interface LaunchStep {
  key: LaunchStepKey;
  label: string;
  state: LaunchStepState;
}

export interface LaunchProgressSnapshot {
  /** Protected connected chapter (mark-7 / mark-8) vs legacy chapter. */
  isProtected: boolean;
  /** mark8SetupDecision?.kind, or "unknown" while it loads. */
  setupState: "unknown" | "locked" | "setup" | "ready" | "error";
  /** preparingMark8 — the read-only ESV preflight is running. */
  preparing: boolean;
  /** An owner-confirmed manifest digest is held for the next draft. */
  hasManifest: boolean;
  /** mark8Blockers were reported by the preflight. */
  blocked: boolean;
  phase: "idle" | "checking" | "generating" | "ready" | "error";
  copyReview: "none" | "warning" | "invalid";
  previewed: boolean;
  verdict: "" | "yes" | "needs_work";
  /** copyReviewApproved(...) — wording accepted (or no warning existed). */
  wordingApproved: boolean;
  imagePhase: "idle" | "checking" | "confirming" | "queued" | "running" | "ready" | "error";
  imagesApproved: boolean;
  published: boolean;
}

const LABELS: Record<LaunchStepKey, string> = {
  setup: "Set up",
  prepare: "Prepare",
  draft: "Text draft",
  wording: "Wording review",
  images: "Images",
  publish: "Publish",
};

function rawState(key: LaunchStepKey, s: LaunchProgressSnapshot): LaunchStepState {
  const textApproved = s.previewed && s.verdict === "yes" && s.wordingApproved;
  switch (key) {
    case "setup":
      if (s.setupState === "ready") return "done";
      if (s.setupState === "locked" || s.setupState === "error") return "attention";
      return "active"; // unknown (checking) or "setup" (awaiting the button)
    case "prepare":
      if (s.hasManifest || s.phase === "generating") return "done";
      if (s.blocked) return "attention";
      if (s.preparing) return "active";
      return s.setupState === "ready" ? "active" : "todo";
    case "draft":
      if (s.phase === "ready") return "done";
      if (s.phase === "error") return "attention";
      if (s.phase === "generating") return "active";
      // With a prepared manifest in hand, the owner is deciding the draft now.
      return s.isProtected ? (s.hasManifest ? "active" : "todo") : "active";
    case "wording":
      if (textApproved) return "done";
      if (s.copyReview === "invalid" || s.verdict === "needs_work") return "attention";
      return s.phase === "ready" ? "active" : "todo";
    case "images":
      if (s.imagesApproved) return "done";
      if (s.imagePhase === "error") return "attention";
      if (
        s.imagePhase === "checking" ||
        s.imagePhase === "confirming" ||
        s.imagePhase === "queued" ||
        s.imagePhase === "running" ||
        s.imagePhase === "ready"
      ) {
        return textApproved ? "active" : "todo";
      }
      return textApproved ? "active" : "todo";
    case "publish":
      return "todo"; // published short-circuits below; until then never done here
  }
}

/**
 * Derive the strip. Protected chapters show the full six-step pipeline;
 * legacy chapters degrade to draft → wording → publish. A published chapter
 * shows every step done. Steps before the furthest completed step are
 * back-filled as done, so a reloaded page (which no longer holds transient
 * prepare state) still reads sensibly left-to-right.
 */
export function deriveLaunchProgress(s: LaunchProgressSnapshot): LaunchStep[] {
  const keys: LaunchStepKey[] = s.isProtected
    ? ["setup", "prepare", "draft", "wording", "images", "publish"]
    : ["draft", "wording", "publish"];

  if (s.published) {
    return keys.map((key) => ({ key, label: LABELS[key], state: "done" as const }));
  }

  const textApproved = s.previewed && s.verdict === "yes" && s.wordingApproved;
  const states = keys.map((key) => rawState(key, s));

  // Publish becomes the active step once everything before it is done.
  const publishIndex = keys.indexOf("publish");
  const readyToPublish =
    textApproved && s.phase === "ready" && (!s.isProtected || s.imagesApproved);
  if (readyToPublish) states[publishIndex] = "active";

  // Back-fill: steps left of the furthest done step read as done too (a
  // reloaded page no longer holds transient prepare state) — but never paint
  // over a step that needs attention, e.g. a blocked re-prepare beside an
  // already-saved draft.
  const lastDone = states.lastIndexOf("done");
  for (let i = 0; i < lastDone; i++) {
    if (states[i] !== "attention") states[i] = "done";
  }

  // Exactly one active step: keep the first active/attention stop, demote
  // later actives to todo so the strip reads as a single position marker.
  const firstStop = states.findIndex((st) => st === "active" || st === "attention");
  if (firstStop !== -1) {
    for (let i = firstStop + 1; i < states.length; i++) {
      if (states[i] === "active") states[i] = "todo";
    }
  }

  return keys.map((key, i) => ({ key, label: LABELS[key], state: states[i] }));
}
