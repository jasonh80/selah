// CLIENT-SAFE pure parser for the Studio Recent Activity diagnostic line
// (issue #17). No runtime imports — type-only imports keep this usable in the
// browser while pinning the whitelist to the server's exported unions.
//
// DEFENSE IN DEPTH: Studio never renders a raw audit message. This module
// strictly parses ONLY failed `protected_mark_draft` rows whose message is the
// server's safeMessage JSON with `code: "SOURCE_OVERLAP_BLOCKED"`, validates
// every field against a closed grammar, and the UI rebuilds its visible line
// exclusively from the parsed, typed fields. Unknown, malformed, injected, or
// truncated content yields NO diagnostic (whole entry → null; bad segment →
// dropped). Bible text, prompt text, or draft prose can therefore never reach
// the DOM through this path — even if a message were somehow tampered with.
import type {
  MarkSprintEsvOverlapFindingCode,
  MarkSprintEsvOverlapFindingSeverity,
} from "@/lib/server/mark-sprint-esv-source";

// Compile-time drift guard: if the server union gains a code, this Record
// fails to typecheck until the whitelist here is updated deliberately.
const KNOWN_CODES: Record<MarkSprintEsvOverlapFindingCode, true> = {
  EXACT_8_PLUS: true,
  EXACT_5_TO_7: true,
  LONG_EXACT_FOUR: true,
  CROSS_FIELD_8_PLUS: true,
  MOSAIC_10_PLUS: true,
};
const KNOWN_SEVERITIES: Record<MarkSprintEsvOverlapFindingSeverity, true> = {
  block: true,
  review: true,
};
const KNOWN_CLEANUPS = ["marked_failed", "conflict", "write_failed"] as const;

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;
// Positional structural paths ONLY (collectStringLeaves grammar): /root,
// /cross-field, or repeated /array/<int> | /object/<int>/key|value segments.
// Indices only — property names never appear, so no draft text can hide here.
const PATH_GRAMMAR =
  /^(?:\/(?:root|cross-field)|(?:\/(?:array\/\d{1,5}|object\/\d{1,5}\/(?:key|value)))+)$/;
// One finding segment as written by safeOverlapDiagnostic():
//   CODE[severity]@/path tokens=N chars=M
const SEGMENT_GRAMMAR =
  /^([A-Z0-9_]{1,32})\[([a-z]{1,16})\]@(\S{1,400}) tokens=(\d{1,6}) chars=(\d{1,7})$/;
// The bounded "+N more" marker — exact form only; a slice-truncated "+2 mo"
// fails this and is dropped like any other cut segment.
const MORE_GRAMMAR = /^\+(\d{1,6}) more$/;

export interface ParsedOverlapFinding {
  code: MarkSprintEsvOverlapFindingCode;
  severity: MarkSprintEsvOverlapFindingSeverity;
  path: string;
  tokens: number;
  chars: number;
}

export interface ParsedOverlapDiagnostics {
  code: "SOURCE_OVERLAP_BLOCKED";
  manifestDigestPrefix: string; // first 12 hex chars of the validated digest
  cleanup: (typeof KNOWN_CLEANUPS)[number] | null;
  findings: ParsedOverlapFinding[];
  /** From the exact "+N more" marker; 0 when absent. */
  more: number;
  /** Segments dropped for failing the strict grammar (e.g. the 400-char cut). */
  droppedSegments: number;
}

function isKnownCode(value: string): value is MarkSprintEsvOverlapFindingCode {
  return Object.prototype.hasOwnProperty.call(KNOWN_CODES, value);
}

function isKnownSeverity(
  value: string,
): value is MarkSprintEsvOverlapFindingSeverity {
  return Object.prototype.hasOwnProperty.call(KNOWN_SEVERITIES, value);
}

function boundedInteger(raw: string, max: number): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

/**
 * Parse one audit entry into a renderable overlap diagnostic, or null.
 * The caller must render ONLY from the returned typed fields — never from
 * the raw message.
 */
export function parseOverlapAuditDiagnostics(entry: {
  action?: string | null;
  status?: string | null;
  message?: string | null;
}): ParsedOverlapDiagnostics | null {
  if (
    entry.action !== "protected_mark_draft" ||
    entry.status !== "failed" ||
    typeof entry.message !== "string" ||
    entry.message.length > 5_000
  ) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(entry.message);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.code !== "SOURCE_OVERLAP_BLOCKED") return null;
  if (
    typeof record.manifestDigest !== "string" ||
    !LOWERCASE_SHA256.test(record.manifestDigest)
  ) {
    return null;
  }
  let cleanup: ParsedOverlapDiagnostics["cleanup"] = null;
  if (record.cleanup !== undefined) {
    if (
      typeof record.cleanup !== "string" ||
      !(KNOWN_CLEANUPS as readonly string[]).includes(record.cleanup)
    ) {
      return null; // unexpected shape → no diagnostic at all
    }
    cleanup = record.cleanup as ParsedOverlapDiagnostics["cleanup"];
  }

  const findings: ParsedOverlapFinding[] = [];
  let more = 0;
  let droppedSegments = 0;
  if (record.diagnostics !== undefined) {
    if (typeof record.diagnostics !== "string") return null;
    const segments = record.diagnostics.split("; ");
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const moreMatch = MORE_GRAMMAR.exec(segment);
      if (moreMatch && index === segments.length - 1) {
        more = boundedInteger(moreMatch[1], 100_000) ?? 0;
        continue;
      }
      const match = SEGMENT_GRAMMAR.exec(segment);
      if (!match) {
        droppedSegments += 1; // truncated tail or foreign content — render nothing from it
        continue;
      }
      const [, code, severity, path, tokensRaw, charsRaw] = match;
      const tokens = boundedInteger(tokensRaw, 100_000);
      const chars = boundedInteger(charsRaw, 1_000_000);
      if (
        !isKnownCode(code) ||
        !isKnownSeverity(severity) ||
        !PATH_GRAMMAR.test(path) ||
        tokens === null ||
        chars === null
      ) {
        droppedSegments += 1;
        continue;
      }
      findings.push({ code, severity, path, tokens, chars });
    }
  }

  return {
    code: "SOURCE_OVERLAP_BLOCKED",
    manifestDigestPrefix: record.manifestDigest.slice(0, 12),
    cleanup,
    findings,
    more,
    droppedSegments,
  };
}
