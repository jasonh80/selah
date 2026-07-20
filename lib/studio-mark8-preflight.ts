const SHA256 = /^[a-f0-9]{64}$/u;

export const MARK_8_STUDIO_SLUG = "mark-8" as const;
// Chapters connected to the protected Studio flow. Order = launch order.
// Mark 9 is connected for the Prepare Chapter screen (owner decision A5,
// 2026-07-16) — connection alone authorizes NOTHING: every write still needs
// the owner's digest-bound receipt, and Mark 9's receipt only exists after he
// approves the on-screen packet.
// Mark 10 is connected the same way (board #29 Codex handoff, 2026-07-18):
// its receipt only exists after the owner approves the on-screen packet.
// Mark 11 joins identically (owner request, 2026-07-19 evening: "build Mark
// 11 tomorrow") — nothing is pre-approved; the owner's digest-bound packet
// approval is still the only key.
export const CONNECTED_STUDIO_SLUGS = ["mark-8", "mark-7", "mark-9", "mark-10", "mark-11"] as const;
export type ConnectedStudioSlug = (typeof CONNECTED_STUDIO_SLUGS)[number];
export function isConnectedStudioSlug(value: string): value is ConnectedStudioSlug {
  return (CONNECTED_STUDIO_SLUGS as readonly string[]).includes(value);
}

const CHAPTER_NUMBERS: Record<ConnectedStudioSlug, number> = {
  "mark-8": 8,
  "mark-7": 7,
  "mark-9": 9,
  "mark-10": 10,
  "mark-11": 11,
};

// Verse-instance totals for each chapter's protected ESV window (the chapter
// plus one adjacent chapter on each side). Mark 7's count reflects what the
// ESV actually returns: Mark 6 = 56, Mark 7 = 36 (the ESV omits the disputed
// 7:16 from its critical-text numbering), Mark 8 = 38 → 130. Mark 8's 125 is
// the owner-approved frozen wording from its 2026-07 launch (nominal counts)
// and must stay byte-identical.
// Mark 9's window (Mark 8–10) counts what the ESV actually returns: Mark 8 =
// 38, Mark 9 = 48 (the ESV omits the disputed 9:44 and 9:46), Mark 10 = 52 →
// 138. UNVERIFIED against the live ESV API (no key offline) — the source-load
// preflight validates the real count before any credit is spent, so a wrong
// number here fails closed with a plain blocker, never a bad draft.
// Mark 10's window (Mark 9–11) the same way: Mark 9 = 48 (omits 9:44, 9:46),
// Mark 10 = 52, Mark 11 = 32 (omits the disputed 11:26) → 132. Equally
// UNVERIFIED offline; the live preflight validates before any spend.
// Mark 11's window (Mark 10–12) the same way: Mark 10 = 52, Mark 11 = 32
// (omits 11:26), Mark 12 = 44 → 128. Equally UNVERIFIED offline; the live
// preflight validates before any spend.
const WINDOW_VERSE_INSTANCES: Record<ConnectedStudioSlug, number> = {
  "mark-8": 125,
  "mark-7": 130,
  "mark-9": 138,
  "mark-10": 132,
  "mark-11": 128,
};

export function connectedChapterLabel(slug: ConnectedStudioSlug): string {
  return `Mark ${CHAPTER_NUMBERS[slug]}`;
}

export function connectedWindowLabel(slug: ConnectedStudioSlug): string {
  const chapter = CHAPTER_NUMBERS[slug];
  return `Mark ${chapter - 1}–${chapter + 1}`;
}

export function studioPreflightError(slug: ConnectedStudioSlug): string {
  return `Studio could not safely check ${connectedChapterLabel(slug)} readiness. Try again before creating a draft.`;
}

export function studioSourcePreparationMessage(slug: ConnectedStudioSlug): string {
  return `Studio will privately load ${connectedWindowLabel(slug)} from the official ESV API (${WINDOW_VERSE_INSTANCES[slug]} verse-instances) to prepare this one-chapter pilot. Crossway's public terms do not specifically address this AI preparation, and you chose to proceed with that uncertainty. Nothing is sent to the writing AI, saved, or published yet.`;
}

export function studioConfirmationMessage(slug: ConnectedStudioSlug): string {
  return `Studio will now use the prepared ESV ${connectedWindowLabel(slug)} context to create one private ${connectedChapterLabel(slug)} draft. This uses a small amount of AI credit and publishes nothing.`;
}

// Frozen Mark 8 wording (asserted byte-for-byte by the offline verifier).
export const MARK_8_PREFLIGHT_ERROR = studioPreflightError(MARK_8_STUDIO_SLUG);
export const MARK_8_SOURCE_PREPARATION_MESSAGE =
  studioSourcePreparationMessage(MARK_8_STUDIO_SLUG);
export const MARK_8_CONFIRMATION_MESSAGE =
  studioConfirmationMessage(MARK_8_STUDIO_SLUG);

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
  slug: ConnectedStudioSlug;
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

function plainEvidenceBlockers(slug: ConnectedStudioSlug): Record<string, string> {
  const label = connectedChapterLabel(slug);
  return {
    VERSIONED_REQUIREMENTS_MISMATCH: `The saved ${label} plan does not match its safety checks.`,
    LIVE_READ_FAILED: "Studio could not safely check Selah Brain.",
    LIVE_BRAIN_MISSING: "Selah Brain is missing required learning.",
    LIVE_BRAIN_MISMATCH: "The live Selah Brain does not match the approved version.",
    LIVE_CHAPTER_NOTES_MISSING: `${label} study notes are missing.`,
    LIVE_CHAPTER_NOTES_MISMATCH: `The live ${label} notes do not match the approved set.`,
    LIVE_VOICE_EXAMPLE_MISSING: "The Mark 6 voice example is missing.",
    LIVE_VOICE_EXAMPLE_MISMATCH:
      "The Mark 6 voice example does not match the approved example.",
    SOURCE_LOAD_FAILED: `Studio could not safely load ESV ${connectedWindowLabel(slug)}.`,
  };
}

function plainApprovalBlockers(slug: ConnectedStudioSlug): Record<string, string> {
  const label = connectedChapterLabel(slug);
  return {
    BRAIN_ARTIFACT_APPROVAL_MISSING: "Selah Brain still needs your approval.",
    GUIDANCE_APPROVAL_MISSING: `The ${label} study guide still needs your approval.`,
    SOURCE_RUNTIME_APPROVAL_MISSING: "The ESV study source is not connected yet.",
    SOURCE_SELECTION_APPROVAL_MISSING:
      "The ESV study source still needs your approval.",
    MANIFEST_APPROVAL_MISMATCH: `This ${label} preparation changed and must be checked again.`,
  };
}

function plainManifestFindings(slug: ConnectedStudioSlug): Record<string, string> {
  const label = connectedChapterLabel(slug);
  return {
    BRAIN_NOT_APPROVED: "Selah Brain still needs your approval.",
    GUIDANCE_NOT_APPROVED: `The ${label} study guide still needs your approval.`,
    MANIFEST_APPROVAL_MISMATCH: `This ${label} preparation changed and must be checked again.`,
  };
}

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
  expectedSlug: ConnectedStudioSlug = MARK_8_STUDIO_SLUG,
): Mark8StudioPreflightSuccess {
  const label = connectedChapterLabel(expectedSlug);
  const evidenceMessages = plainEvidenceBlockers(expectedSlug);
  const approvalMessages = plainApprovalBlockers(expectedSlug);
  const findingMessages = plainManifestFindings(expectedSlug);
  const blockers = unique([
    ...runtime.evidenceBlockers.map(
      ({ code }) =>
        evidenceMessages[code] ??
        `${label} did not pass a required safety check.`,
    ),
    ...runtime.approvalBlockers
      .filter(({ code }) => !EXPECTED_CONFIRMATION_APPROVALS.has(code))
      .map(
        ({ code }) =>
          approvalMessages[code] ??
          `${label} still needs an owner-approved launch requirement.`,
      ),
    ...runtime.manifestFindings
      .filter(({ code }) => !EXPECTED_CONFIRMATION_FINDINGS.has(code))
      .map(
        ({ code }) =>
          findingMessages[code] ??
          `${label} did not pass a required safety check.`,
      ),
  ]);

  const exactDigests =
    typeof runtime.manifestDigest === "string" &&
    SHA256.test(runtime.manifestDigest) &&
    typeof runtime.sourceBundleDigest === "string" &&
    SHA256.test(runtime.sourceBundleDigest);
  if (runtime.evidenceReady && !exactDigests) {
    blockers.push(`Studio could not lock the exact ${label} preparation.`);
  }
  if (runtime.slug !== expectedSlug) {
    blockers.push("Studio checked the wrong chapter.");
  }
  if (!runtime.evidenceReady && blockers.length === 0) {
    blockers.push(`${label} is not ready for owner confirmation yet.`);
  }

  const plainBlockers = unique(blockers);
  const readyToConfirm = plainBlockers.length === 0;

  return {
    ok: true,
    preview: {
      slug: expectedSlug,
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
  expectedSlug: ConnectedStudioSlug = MARK_8_STUDIO_SLUG,
): Mark8StudioPreflightDecision {
  if (!value || typeof value !== "object") {
    return { kind: "blocked", blockers: [studioPreflightError(expectedSlug)] };
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
    response.preview?.slug === expectedSlug &&
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
    blockers: blockers.length ? blockers : [studioPreflightError(expectedSlug)],
  };
}

export function buildStudioGenerateRequest(
  slug: string,
  approvedManifestDigest: string | null,
  confirmDiscardCompletedImages = false,
): Record<string, unknown> {
  if (isConnectedStudioSlug(slug)) {
    if (!approvedManifestDigest || !SHA256.test(approvedManifestDigest)) {
      throw new Error(
        `${connectedChapterLabel(slug)} requires an exact prepared manifest digest`,
      );
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
    (!input.textGenerationEnabled && !isConnectedStudioSlug(input.slug))
  );
}
