import type { MarkSprintEsvOverlapFindingCode } from "./server/mark-sprint-esv-source";

export type StudioOverlapFindingCode = MarkSprintEsvOverlapFindingCode;

export type StudioOverlapFindingSeverity = "block" | "review";

export interface StudioOverlapDiagnostic {
  code: StudioOverlapFindingCode;
  severity: StudioOverlapFindingSeverity;
  path: string;
  tokenCount: number;
  characterCount: number;
}

export interface StudioOverlapAuditDetails {
  findings: StudioOverlapDiagnostic[];
  moreCount: number;
}

export interface StudioAuditEntryInput {
  action: string;
  status: string;
  message?: string | null;
}

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/u;
const MAX_MESSAGE_CHARACTERS = 1_024;
const MAX_DIAGNOSTIC_CHARACTERS = 400;
const MAX_VISIBLE_FINDINGS = 6;
const MAX_SAFE_COUNT = 1_000_000;
const STRUCTURAL_PATH =
  /^(?:\/root|\/cross-field|(?:(?:\/array\/(?:0|[1-9][0-9]*))|(?:\/object\/(?:0|[1-9][0-9]*)\/(?:key|value)))+)$/u;
const FINDING =
  /^([A-Z0-9_]+)\[(block|review)\]@(\S+) tokens=(0|[1-9][0-9]*) chars=(0|[1-9][0-9]*)$/u;
const MORE = /^\+([1-9][0-9]*) more$/u;
const ALLOWED_MESSAGE_KEYS = new Set([
  "code",
  "manifestDigest",
  "cleanup",
  "diagnostics",
]);
const ALLOWED_CLEANUP = new Set(["marked_failed", "conflict", "write_failed"]);
const CODE_RULES: Record<
  StudioOverlapFindingCode,
  {
    severity: StudioOverlapFindingSeverity;
    minimumTokens: number;
    maximumTokens?: number;
    crossField: boolean;
  }
> = {
  EXACT_8_PLUS: {
    severity: "block",
    minimumTokens: 8,
    crossField: false,
  },
  EXACT_5_TO_7: {
    severity: "review",
    minimumTokens: 5,
    maximumTokens: 7,
    crossField: false,
  },
  LONG_EXACT_FOUR: {
    severity: "review",
    minimumTokens: 4,
    maximumTokens: 4,
    crossField: false,
  },
  CROSS_FIELD_8_PLUS: {
    severity: "block",
    minimumTokens: 8,
    crossField: true,
  },
  MOSAIC_10_PLUS: {
    severity: "block",
    minimumTokens: 10,
    crossField: false,
  },
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeCount(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_SAFE_COUNT
    ? parsed
    : null;
}

function validCodeShape(
  code: StudioOverlapFindingCode,
  severity: StudioOverlapFindingSeverity,
  path: string,
  tokenCount: number,
): boolean {
  const rule = CODE_RULES[code];
  return (
    severity === rule.severity &&
    (rule.crossField ? path === "/cross-field" : path !== "/cross-field") &&
    tokenCount >= rule.minimumTokens &&
    (rule.maximumTokens === undefined || tokenCount <= rule.maximumTokens)
  );
}

function parseFinding(segment: string): StudioOverlapDiagnostic | null {
  const match = FINDING.exec(segment);
  if (!match || !STRUCTURAL_PATH.test(match[3])) return null;
  if (!Object.prototype.hasOwnProperty.call(CODE_RULES, match[1])) return null;

  const code = match[1] as StudioOverlapFindingCode;
  const severity = match[2] as StudioOverlapFindingSeverity;
  const path = match[3];
  const tokenCount = safeCount(match[4]);
  const characterCount = safeCount(match[5]);
  if (
    tokenCount === null ||
    characterCount === null ||
    characterCount < tokenCount ||
    !validCodeShape(code, severity, path, tokenCount)
  ) {
    return null;
  }

  return { code, severity, path, tokenCount, characterCount };
}

/**
 * Returns only reconstructed, allowlisted overlap metadata for the owner's
 * authenticated Studio history. Raw audit text is never returned to the UI.
 */
export function parseStudioOverlapAuditEntry(
  entry: StudioAuditEntryInput,
): StudioOverlapAuditDetails | null {
  if (
    entry.action !== "protected_mark_draft" ||
    entry.status !== "failed" ||
    typeof entry.message !== "string" ||
    entry.message.length === 0 ||
    entry.message.length > MAX_MESSAGE_CHARACTERS
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.message);
  } catch {
    return null;
  }
  if (!isPlainRecord(parsed)) return null;
  if (Object.keys(parsed).some((key) => !ALLOWED_MESSAGE_KEYS.has(key))) {
    return null;
  }
  if (
    parsed.code !== "SOURCE_OVERLAP_BLOCKED" ||
    typeof parsed.manifestDigest !== "string" ||
    !LOWERCASE_SHA256.test(parsed.manifestDigest) ||
    typeof parsed.diagnostics !== "string" ||
    parsed.diagnostics.length === 0 ||
    parsed.diagnostics.length > MAX_DIAGNOSTIC_CHARACTERS ||
    (parsed.cleanup !== undefined &&
      (typeof parsed.cleanup !== "string" || !ALLOWED_CLEANUP.has(parsed.cleanup)))
  ) {
    return null;
  }

  const segments = parsed.diagnostics.split("; ");
  const findings: StudioOverlapDiagnostic[] = [];
  let moreCount = 0;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const isFinal = index === segments.length - 1;
    // A 400-character value may have cut the last entry at any digit. Never
    // trust that boundary segment, even if its shortened form still parses.
    if (isFinal && parsed.diagnostics.length === MAX_DIAGNOSTIC_CHARACTERS) {
      continue;
    }
    const more = MORE.exec(segment);
    if (more) {
      if (!isFinal) return null;
      moreCount = safeCount(more[1]) ?? 0;
      if (moreCount === 0) return null;
      continue;
    }

    const finding = parseFinding(segment);
    if (!finding) {
      // The writer's 400-character bound can cut only the last detail. Keep
      // earlier complete safe entries; reject every other malformed shape.
      return null;
    }
    if (findings.length < MAX_VISIBLE_FINDINGS) findings.push(finding);
  }

  if (!findings.some((finding) => finding.severity === "block")) return null;
  return { findings, moreCount };
}
