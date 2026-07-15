const SHA256 = /^[a-f0-9]{64}$/u;

export const MARK_8_STUDIO_SLUG = "mark-8" as const;
// Chapters connected to the protected Studio flow. Order = launch order.
export const CONNECTED_STUDIO_SLUGS = ["mark-8", "mark-7"] as const;
export type ConnectedStudioSlug = (typeof CONNECTED_STUDIO_SLUGS)[number];
export function isConnectedStudioSlug(value: string): value is ConnectedStudioSlug {
  return (CONNECTED_STUDIO_SLUGS as readonly string[]).includes(value);
}
export const MARK_8_PREFLIGHT_ERROR =
  "Studio could not safely check Mark 8 readiness. Try again before creating a draft.";
export const MARK_8_SOURCE_PREPARATION_MESSAGE =
  "Studio will privately load Mark 7–9 from the official ESV API (125 verse-instances) to prepare this one-chapter pilot. Crossway's public terms do not specifically address this AI preparation, and you chose to proceed with that uncertainty. Nothing is sent to the writing AI, saved, or published yet.";
export const MARK_8_CONFIRMATION_MESSAGE =
  "Studio will now use the prepared ESV Mark 7–9 context to create one private Mark 8 draft. This uses a small amount of AI credit and publishes nothing.";

type EvidenceBlocker = {
  code: string;
};

type ApprovalBlocker = {
  code: string;
};

type ManifestFinding = {
  code: string;
};

export interface Mark8RuntimePreviewLike {
  slug: string;
  evidenceReady: boolean;
  readyForGeneration: boolean;
  sourceBundleDigest: string | null;
  manifestDigest: string | null;
  evidenceBlockers: readonly EvidenceBlocker[];
  approvalBlockers: readonly ApprovalBlocker[];
  manifestFindings: readonly ManifestFinding[];
}

export interface Mark8StudioSafePreview {
  slug: typeof MARK_8_STUDIO_SLUG;
  evidenceReady: boolean;
  readyForGeneration: boolean;
  readyToConfirm: boolean;
  sourceBundleDigest: string | null;
  manifestDigest: string | null;
}

export interface Mark8StudioPreflightSuccess {
  ok: true;
  preview: Mark8StudioSafePreview;
  blockers: string[];
}

export type Mark8StudioPreflightDecision =
  | { kind: "confirm"; manifestDigest: string }
  | { kind: "blocked"; blockers: string[] };

const EXPECTED_CONFIRMATION_APPROVALS = new Set([
  "MANIFEST_APPROVAL_MISSING",
  "OWNER_RUN_AUTHORIZATION_MISSING",
]);

const EXPECTED_CONFIRMATION_FINDINGS = new Set([
  "MANIFEST_APPROVAL_MISSING",
]);

const PLAIN_EVIDENCE_BLOCKERS: Record<string, string> = {
  VERSIONED_REQUIREMENTS_MISMATCH:
    "The saved Mark 8 plan does not match its safety checks.",
  LIVE_READ_FAILED: "Studio could not safely check Selah Brain.",
  LIVE_BRAIN_MISSING: "Selah Brain is missing required learning.",
  LIVE_BRAIN_MISMATCH:
    "The live Selah Brain does not match the approved version.",
  LIVE_CHAPTER_NOTES_MISSING: "Mark 8 study notes are missing.",
  LIVE_CHAPTER_NOTES_MISMATCH:
    "The live Mark 8 notes do not match the approved set.",
  LIVE_VOICE_EXAMPLE_MISSING: "The Mark 6 voice example is missing.",
  LIVE_VOICE_EXAMPLE_MISMATCH:
    "The Mark 6 voice example does not match the approved example.",
  SOURCE_LOAD_FAILED: "Studio could not safely load ESV Mark 7–9.",
};

const PLAIN_APPROVAL_BLOCKERS: Record<string, string> = {
  BRAIN_ARTIFACT_APPROVAL_MISSING: "Selah Brain still needs your approval.",
  GUIDANCE_APPROVAL_MISSING: "The Mark 8 study guide still needs your approval.",
  SOURCE_RUNTIME_APPROVAL_MISSING: "The ESV study source is not connected yet.",
  SOURCE_SELECTION_APPROVAL_MISSING:
    "The ESV study source still needs your approval.",
  MANIFEST_APPROVAL_MISMATCH:
    "This Mark 8 preparation changed and must be checked again.",
};

const PLAIN_MANIFEST_FINDINGS: Record<string, string> = {
  BRAIN_NOT_APPROVED: "Selah Brain still needs your approval.",
  GUIDANCE_NOT_APPROVED: "The Mark 8 study guide still needs your approval.",
  MANIFEST_APPROVAL_MISMATCH:
    "This Mark 8 preparation changed and must be checked again.",
};

function unique(messages: readonly string[]): string[] {
  return [...new Set(messages)];
}

/**
 * Reduce the server-only runtime preview to the few safe facts Studio needs.
 * The first-pass manifest and one-use owner confirmation are expected to be
 * missing here; every other finding keeps the confirmation locked.
 */
export function buildMark8StudioPreflightResponse(
  runtime: Mark8RuntimePreviewLike,
): Mark8StudioPreflightSuccess {
  const blockers = unique([
    ...runtime.evidenceBlockers.map(
      ({ code }) =>
        PLAIN_EVIDENCE_BLOCKERS[code] ??
        "Mark 8 did not pass a required safety check.",
    ),
    ...runtime.approvalBlockers
      .filter(({ code }) => !EXPECTED_CONFIRMATION_APPROVALS.has(code))
      .map(
        ({ code }) =>
          PLAIN_APPROVAL_BLOCKERS[code] ??
          "Mark 8 still needs an owner-approved launch requirement.",
      ),
    ...runtime.manifestFindings
      .filter(({ code }) => !EXPECTED_CONFIRMATION_FINDINGS.has(code))
      .map(
        ({ code }) =>
          PLAIN_MANIFEST_FINDINGS[code] ??
          "Mark 8 did not pass a required safety check.",
      ),
  ]);

  const exactDigests =
    typeof runtime.manifestDigest === "string" &&
    SHA256.test(runtime.manifestDigest) &&
    typeof runtime.sourceBundleDigest === "string" &&
    SHA256.test(runtime.sourceBundleDigest);
  if (runtime.evidenceReady && !exactDigests) {
    blockers.push("Studio could not lock the exact Mark 8 preparation.");
  }
  if (runtime.slug !== MARK_8_STUDIO_SLUG) {
    blockers.push("Studio checked the wrong chapter.");
  }
  if (!runtime.evidenceReady && blockers.length === 0) {
    blockers.push("Mark 8 is not ready for owner confirmation yet.");
  }

  const plainBlockers = unique(blockers);
  const readyToConfirm = plainBlockers.length === 0;

  return {
    ok: true,
    preview: {
      slug: MARK_8_STUDIO_SLUG,
      evidenceReady: runtime.evidenceReady,
      readyForGeneration: runtime.readyForGeneration,
      readyToConfirm,
      sourceBundleDigest: exactDigests ? runtime.sourceBundleDigest : null,
      manifestDigest: exactDigests ? runtime.manifestDigest : null,
    },
    blockers: plainBlockers,
  };
}

/** Treat the API response as untrusted before opening the spend confirmation. */
export function decideMark8StudioPreflight(
  value: unknown,
): Mark8StudioPreflightDecision {
  if (!value || typeof value !== "object") {
    return { kind: "blocked", blockers: [MARK_8_PREFLIGHT_ERROR] };
  }
  const response = value as {
    ok?: unknown;
    preview?: Partial<Mark8StudioSafePreview>;
    blockers?: unknown;
  };
  const blockers = Array.isArray(response.blockers)
    ? unique(
        response.blockers.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        ),
      )
    : [];
  const digest = response.preview?.manifestDigest;
  if (
    response.ok === true &&
    response.preview?.slug === MARK_8_STUDIO_SLUG &&
    response.preview?.evidenceReady === true &&
    response.preview?.readyToConfirm === true &&
    blockers.length === 0 &&
    typeof digest === "string" &&
    SHA256.test(digest)
  ) {
    return { kind: "confirm", manifestDigest: digest };
  }
  return {
    kind: "blocked",
    blockers: blockers.length ? blockers : [MARK_8_PREFLIGHT_ERROR],
  };
}

export function buildStudioGenerateRequest(
  slug: string,
  approvedManifestDigest: string | null,
  confirmDiscardCompletedImages = false,
): Record<string, unknown> {
  if (slug === MARK_8_STUDIO_SLUG) {
    if (!approvedManifestDigest || !SHA256.test(approvedManifestDigest)) {
      throw new Error("Mark 8 requires an exact prepared manifest digest");
    }
    return {
      action: "generate",
      slug,
      confirm: true,
      approvedManifestDigest,
      ...(confirmDiscardCompletedImages ? { confirmDiscardCompletedImages: true } : {}),
    };
  }
  return { action: "generate", slug, confirm: true };
}

export function isStudioGenerateEntryDisabled(input: {
  slug: string;
  chapterBusy: boolean;
  preflightBusy: boolean;
  textGenerationEnabled: boolean;
  published: boolean;
}): boolean {
  return (
    input.chapterBusy ||
    input.preflightBusy ||
    input.published ||
    (!input.textGenerationEnabled && input.slug !== MARK_8_STUDIO_SLUG)
  );
}
