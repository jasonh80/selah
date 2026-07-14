// CLIENT-SAFE helpers for the private-draft Bible-wording review marker.
// The marker stores digests, closed finding codes, and counts only. It never
// stores ESV text, generated prose, prompt text, excerpts, or field names.

const SHA256 = /^[a-f0-9]{64}$/u;
const KNOWN_CODES = new Set([
  "EXACT_8_PLUS",
  "EXACT_5_TO_7",
  "LONG_EXACT_FOUR",
  "CROSS_FIELD_8_PLUS",
  "MOSAIC_10_PLUS",
]);

export const SOURCE_OVERLAP_REVIEW_KEY = "sourceOverlapReview";

export interface SourceOverlapReviewWarning {
  readonly version: 1;
  readonly manifestDigest: string;
  readonly reportDigest: string;
  readonly canonicalDraftDigest: string;
  readonly blockerCodes: readonly string[];
  readonly findingCount: number;
  readonly blockFindingCount: number;
  readonly reviewFindingCount: number;
}

export type SourceOverlapReviewInspection =
  | { readonly kind: "none" }
  | { readonly kind: "invalid" }
  | {
      readonly kind: "warning";
      readonly warning: SourceOverlapReviewWarning;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100;
}

function exactKeys(record: Record<string, unknown>): boolean {
  const expected = [
    "blockFindingCount",
    "blockerCodes",
    "canonicalDraftDigest",
    "findingCount",
    "manifestDigest",
    "reportDigest",
    "reviewFindingCount",
    "version",
  ];
  return (
    Object.keys(record).length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
}

export function createSourceOverlapReviewWarning(input: {
  manifestDigest: string;
  reportDigest: string;
  canonicalDraftDigest: string;
  blockerCodes: readonly string[];
  findingCount: number;
  blockFindingCount: number;
  reviewFindingCount: number;
}): SourceOverlapReviewWarning {
  const blockerCodes = [...new Set(input.blockerCodes)].sort();
  const candidate = {
    version: 1 as const,
    manifestDigest: input.manifestDigest,
    reportDigest: input.reportDigest,
    canonicalDraftDigest: input.canonicalDraftDigest,
    blockerCodes,
    findingCount: input.findingCount,
    blockFindingCount: input.blockFindingCount,
    reviewFindingCount: input.reviewFindingCount,
  };
  const inspected = inspectSourceOverlapReview({
    [SOURCE_OVERLAP_REVIEW_KEY]: candidate,
  });
  if (inspected.kind !== "warning") {
    throw new Error("invalid source-overlap review warning");
  }
  return Object.freeze({
    ...inspected.warning,
    blockerCodes: Object.freeze([...inspected.warning.blockerCodes]),
  });
}

/**
 * Missing marker means a clean draft. Any present-but-malformed marker is
 * invalid and must fail closed at image/publish boundaries.
 */
export function inspectSourceOverlapReview(
  workup: unknown,
): SourceOverlapReviewInspection {
  if (!isPlainRecord(workup)) return { kind: "invalid" };
  if (!Object.prototype.hasOwnProperty.call(workup, SOURCE_OVERLAP_REVIEW_KEY)) {
    return { kind: "none" };
  }
  const value = workup[SOURCE_OVERLAP_REVIEW_KEY];
  if (!isPlainRecord(value) || !exactKeys(value)) return { kind: "invalid" };
  if (
    value.version !== 1 ||
    typeof value.manifestDigest !== "string" ||
    !SHA256.test(value.manifestDigest) ||
    typeof value.reportDigest !== "string" ||
    !SHA256.test(value.reportDigest) ||
    typeof value.canonicalDraftDigest !== "string" ||
    !SHA256.test(value.canonicalDraftDigest) ||
    !Array.isArray(value.blockerCodes) ||
    value.blockerCodes.length < 1 ||
    value.blockerCodes.length > KNOWN_CODES.size ||
    !value.blockerCodes.every(
      (code) => typeof code === "string" && KNOWN_CODES.has(code),
    ) ||
    new Set(value.blockerCodes).size !== value.blockerCodes.length ||
    !isBoundedCount(value.findingCount) ||
    !isBoundedCount(value.blockFindingCount) ||
    !isBoundedCount(value.reviewFindingCount) ||
    value.blockFindingCount < 1 ||
    value.findingCount !== value.blockFindingCount + value.reviewFindingCount
  ) {
    return { kind: "invalid" };
  }
  return {
    kind: "warning",
    warning: value as unknown as SourceOverlapReviewWarning,
  };
}

export function sourceOverlapReviewAccepted(
  workup: unknown,
  approvedReportDigest: unknown,
): { ok: true } | { ok: false; reason: string } {
  const inspection = inspectSourceOverlapReview(workup);
  if (inspection.kind === "none") return { ok: true };
  if (inspection.kind === "invalid") {
    return {
      ok: false,
      reason: "Studio could not verify this draft's Bible-wording review. Create or inspect the draft again before continuing.",
    };
  }
  if (
    typeof approvedReportDigest !== "string" ||
    approvedReportDigest !== inspection.warning.reportDigest
  ) {
    return {
      ok: false,
      reason: "Preview this draft and review its Bible wording before creating images or publishing.",
    };
  }
  return { ok: true };
}
