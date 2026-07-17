// SERVER-ONLY. Pure, one-call protected Mark draft pipeline.
//
// The caller supplies the already prepared v3 source/request/preflight and an
// executor port. This module performs no network, database, job, route, logging,
// or publishing work. It never returns the raw request, prompt, ESV source, or
// raw model response.
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
} from "openai";
import { sha256Canonical } from "./generation-manifest";
import { generatedToRenderWorkup } from "@/lib/ai/adapters/generated-to-workup";
import { evaluateMarkSprintDraft } from "@/lib/ai/quality/mark-sprint-quality";
import { parseChapterWorkupJson } from "@/lib/ai/schemas/chapter-workup-schema";
import {
  createSourceOverlapReviewWarning,
  type SourceOverlapReviewWarning,
} from "@/lib/source-overlap-review";
import type { ChapterWorkup } from "@/lib/types";
import {
  assertGenerationManifestV3OverlapAcceptanceCapability,
  assertGenerationManifestV3OverlapReportIntegrity,
  assertGenerationManifestV3PreflightCapability,
  createGenerationManifestV3OverlapAcceptanceCapability,
  evaluateGenerationManifestV3Overlap,
  type GenerationManifestV3OverlapAcceptanceCapability,
  type GenerationManifestV3PreflightCapability,
  type GenerationModelRequestV3,
} from "./generation-manifest-v3";
import type { MarkSprintEsvSourceBundle } from "./mark-sprint-esv-source";
import {
  takeConsumedTextJobCapabilityForDispatch,
  type ConsumedTextJobCapability,
} from "./generation-jobs";

if (typeof window !== "undefined") {
  throw new Error("Mark sprint draft pipeline is server-only");
}

export type MarkSprintDraftPipelineErrorCode =
  | "PREFLIGHT_INVALID"
  | "RUN_AUTHORIZATION_INVALID"
  | "MODEL_EXECUTION_FAILED"
  | "MODEL_RESPONSE_INVALID"
  | "SOURCE_OVERLAP_BLOCKED"
  | "MARK_QUALITY_BLOCKED";

export class MarkSprintDraftPipelineError extends Error {
  readonly code: MarkSprintDraftPipelineErrorCode;
  readonly blockerCodes: readonly string[];
  readonly tokenUsage: Readonly<MarkSprintDraftTokenUsage> | null;
  /**
   * Safe diagnostic metadata for reconstructing WHY a run stopped: finding
   * code, structural output path (positional, never property names), and
   * token/character counts. NEVER contains ESV excerpts, prompt text, or
   * rejected draft text (issue #17 acceptance 5).
   */
  readonly safeDiagnostics: readonly string[];

  constructor(
    code: MarkSprintDraftPipelineErrorCode,
    blockerCodes: readonly string[] = [],
    tokenUsage: MarkSprintDraftTokenUsage | null = null,
    safeDiagnostics: readonly string[] = [],
  ) {
    super(`Protected Mark draft stopped: ${code}`);
    this.name = "MarkSprintDraftPipelineError";
    this.code = code;
    this.blockerCodes = Object.freeze([...new Set(blockerCodes)].sort());
    this.tokenUsage = tokenUsage ? Object.freeze({ ...tokenUsage }) : null;
    this.safeDiagnostics = Object.freeze([...safeDiagnostics]);
  }
}

/**
 * Excerpt-free diagnostic for one quality blocker. Real codes contain spaces
 * ("COV-002 VERSE_COVERAGE_GAP"); whitespace becomes "_" so the segment fits
 * the strict single-token QUALITY grammar the Studio parser enforces.
 */
export function safeQualityDiagnostic(code: string): string {
  return `QUALITY:${code.trim().split(/\s+/).join("_")}`;
}

/**
 * Excerpt-free classification of a model-transport failure into a closed
 * MODEL:<KIND> token (same single-token grammar as QUALITY diagnostics).
 * ONLY enum values derived from provider status/code fields — never provider
 * message text — so the durable audit can say WHY the model call died
 * (out of credit vs auth vs timeout) without leaking anything.
 */
export function safeModelExecutionDiagnostic(error: unknown): string {
  const e = error as
    | ({ status?: unknown; code?: unknown; name?: unknown; error?: { code?: unknown } } & Partial<Error>)
    | null;
  const status = typeof e?.status === "number" ? e.status : null;
  const code = String(e?.code ?? e?.error?.code ?? "");
  // SDK subclasses first (PR #46 review): instanceof is the reliable
  // discriminator — subclass NAMES can be mangled by bundlers. The
  // native-DOMException AbortError (our own controller.abort) keeps a name
  // check because it is not an SDK type.
  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    (error instanceof DOMException && error.name === "AbortError") ||
    code === "ETIMEDOUT"
  ) {
    return "MODEL:TIMEOUT_OR_ABORTED";
  }
  if (code === "insufficient_quota") return "MODEL:INSUFFICIENT_QUOTA";
  if (error instanceof AuthenticationError || status === 401 || code === "invalid_api_key") {
    return "MODEL:AUTH_FAILED";
  }
  if (error instanceof RateLimitError || status === 429) return "MODEL:RATE_LIMITED";
  if (error instanceof NotFoundError || status === 404 || code === "model_not_found") {
    return "MODEL:MODEL_NOT_FOUND";
  }
  if (error instanceof InternalServerError || (status !== null && status >= 500)) {
    return "MODEL:PROVIDER_5XX";
  }
  if (error instanceof APIConnectionError || code === "ECONNRESET" || code === "ENOTFOUND") {
    return "MODEL:NETWORK";
  }
  if (status !== null) return `MODEL:HTTP_${status}`;
  return "MODEL:UNKNOWN";
}

/**
 * ONE-REPAIR AMENDMENT to the one-call contract (owner + Codex directive,
 * board #29, 2026-07-17): when a finished draft fails quality ONLY on the
 * structural-completeness codes below, the pipeline makes exactly ONE bounded
 * repair call — "return the same draft with only these deficiencies fixed" —
 * then re-runs the FULL gate chain (schema, overlap, quality) on the repaired
 * draft. Never more than one repair; never for theology/voice/coverage or any
 * overlap code; both calls' tokens are cost-logged; the owner sees
 * REPAIR-001 STRUCTURAL_REPAIR_APPLIED as a review warning.
 */
export const REPAIRABLE_QUALITY_CODES: ReadonlySet<string> = new Set([
  "STR-004 EMPTY_REQUIRED_CONTENT",
  "STR-010 EXACT_DUPLICATE_CONTENT",
]);

export function repairableQualityBlockers(
  blockers: readonly { code: string }[],
): boolean {
  return (
    blockers.length > 0 &&
    blockers.every((finding) => REPAIRABLE_QUALITY_CODES.has(finding.code))
  );
}

/**
 * Deterministic repair request derived ONLY from already-authorized material:
 * the frozen approved request's model/params, the model's own draft, and the
 * machine checker's findings (checker-authored messages + structural paths —
 * never ESV text, never new sources). The derivation is pure so the audit can
 * reproduce exactly what was sent.
 */
export function buildMarkSprintRepairRequest(
  base: GenerationModelRequestV3,
  rawDraftJson: string,
  blockers: readonly {
    code: string;
    message: string;
    evidencePaths: readonly string[];
    expected?: unknown;
    actual?: unknown;
  }[],
): GenerationModelRequestV3 {
  const findingLines = blockers
    .map(
      (finding) =>
        `- ${finding.code} at ${finding.evidencePaths.join(", ") || "(document)"}: ${finding.message}` +
        (finding.expected !== undefined
          ? ` (expected: ${String(finding.expected)}; actual: ${String(finding.actual)})`
          : ""),
    )
    .join("\n");
  return Object.freeze({
    model: base.model,
    messages: Object.freeze([
      {
        role: "system",
        content:
          "You are repairing a single JSON chapter workup you already wrote. " +
          "Return the COMPLETE corrected JSON object. Fix ONLY the deficiencies listed by the machine checker; " +
          "keep every other field byte-identical. Stay faithful to the chapter; never quote Bible translation text verbatim; " +
          "no placeholders; duplicated labels must become genuinely distinct entries.",
      } as const,
      {
        role: "user",
        content: `MACHINE CHECKER DEFICIENCIES (fix exactly these, nothing else):\n${findingLines}\n\nDRAFT JSON TO REPAIR:\n${rawDraftJson}`,
      } as const,
    ]) as unknown as GenerationModelRequestV3["messages"],
    response_format: base.response_format,
    max_completion_tokens: base.max_completion_tokens,
    reasoning_effort: base.reasoning_effort,
    store: base.store,
  });
}

/** Compact, excerpt-free diagnostic line for one overlap finding. */
export function safeOverlapDiagnostic(finding: {
  code: string;
  severity: string;
  outputPath: string;
  tokenCount: number;
  characterCount: number;
}): string {
  return `${finding.code}[${finding.severity}]@${finding.outputPath} tokens=${finding.tokenCount} chars=${finding.characterCount}`;
}

export interface MarkSprintModelExecutionResult {
  rawDraftJson: string;
  inputTokens: number;
  outputTokens: number;
}

export interface MarkSprintDraftTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The adapter must dispatch this exact request object once and return text. */
export interface MarkSprintModelExecutorPort {
  executeExactRequest(
    request: GenerationModelRequestV3,
  ): Promise<MarkSprintModelExecutionResult>;
}

export interface RunProtectedMarkSprintDraftInput {
  sourceBundle: MarkSprintEsvSourceBundle;
  modelRequest: GenerationModelRequestV3;
  preflight: GenerationManifestV3PreflightCapability;
  jobId: string;
  consumedJobCapability: ConsumedTextJobCapability;
  executor: MarkSprintModelExecutorPort;
}

export interface ProtectedMarkSprintDraftResult {
  slug: MarkSprintEsvSourceBundle["slug"];
  manifestDigest: string;
  sourceBundleDigest: string;
  rawDraftDigest: string;
  canonicalDraftDigest: string;
  overlapReportDigest: string;
  overlapVerdict: "pass" | "block";
  /**
   * Excerpt-free diagnostics for owner review and durable audit. These are
   * code, structural path, and counts only.
   */
  overlapDiagnostics: readonly string[];
  sourceOverlapReview: SourceOverlapReviewWarning | null;
  tokenUsage: Readonly<MarkSprintDraftTokenUsage>;
  overlapAcceptance: GenerationManifestV3OverlapAcceptanceCapability | null;
  /**
   * The one-repair amendment's audit record (PR #46 review, correction 2):
   * null when no repair ran; otherwise the digest of the exact derived repair
   * request plus the codes it was authorized to fix — persisted by the job's
   * durable success audit, not only the review warnings.
   */
  repair: { requestDigest: string; repairedCodes: readonly string[] } | null;
  quality: {
    machineVerdict: "pass";
    overallStatus: "needs_owner_review";
    warningCodes: readonly string[];
    manualGuardrails: readonly string[];
    textualVariants: readonly string[];
  };
  renderWorkup: ChapterWorkup;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function validTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeTokenUsage(
  execution: MarkSprintModelExecutionResult,
): MarkSprintDraftTokenUsage | null {
  return validTokenCount(execution.inputTokens) &&
    validTokenCount(execution.outputTokens)
    ? {
        inputTokens: execution.inputTokens,
        outputTokens: execution.outputTokens,
      }
    : null;
}

/**
 * Execute and validate one private draft. A successful result is safe to hand
 * to an owner-review boundary; it is not persistence or publish authorization.
 */
export async function runProtectedMarkSprintDraft(
  input: RunProtectedMarkSprintDraftInput,
): Promise<ProtectedMarkSprintDraftResult> {
  const preparation = {
    sourceBundle: input.sourceBundle,
    modelRequest: input.modelRequest,
  };
  try {
    assertGenerationManifestV3PreflightCapability(
      input.preflight,
      preparation,
    );
  } catch {
    throw new MarkSprintDraftPipelineError("PREFLIGHT_INVALID");
  }
  try {
    takeConsumedTextJobCapabilityForDispatch(input.consumedJobCapability, {
      slug: input.sourceBundle.slug,
      jobId: input.jobId,
      approvedManifestDigest: input.preflight.manifestDigest,
    });
  } catch {
    throw new MarkSprintDraftPipelineError("RUN_AUTHORIZATION_INVALID");
  }

  let execution: MarkSprintModelExecutionResult;
  try {
    execution = await input.executor.executeExactRequest(input.modelRequest);
  } catch (error) {
    // Classify the transport failure into a safe MODEL:<KIND> token so the
    // durable audit names the cause (out of credit / auth / timeout / 5xx)
    // instead of a bare MODEL_EXECUTION_FAILED — no provider text leaks.
    throw new MarkSprintDraftPipelineError("MODEL_EXECUTION_FAILED", [], null, [
      safeModelExecutionDiagnostic(error),
    ]);
  }
  const tokenUsage = execution ? safeTokenUsage(execution) : null;
  if (
    !execution ||
    typeof execution.rawDraftJson !== "string" ||
    !execution.rawDraftJson.trim() ||
    tokenUsage === null
  ) {
    throw new MarkSprintDraftPipelineError(
      "MODEL_RESPONSE_INVALID",
      [],
      tokenUsage,
    );
  }

  interface CandidateEvaluation {
    generated: ReturnType<typeof parseChapterWorkupJson>;
    overlapReport: ReturnType<typeof evaluateGenerationManifestV3Overlap>;
    overlapAcceptance: GenerationManifestV3OverlapAcceptanceCapability | null;
    sourceOverlapReview: SourceOverlapReviewWarning | null;
    quality: ReturnType<typeof evaluateMarkSprintDraft>;
    rawDraftJson: string;
  }

  // The FULL gate chain over one candidate draft: schema parse, overlap
  // evaluation + integrity, acceptance-or-review, quality. Used for the
  // original draft and, when the one-repair amendment applies, ONCE more for
  // the repaired draft — the repaired candidate passes the exact same gates
  // or the run fails terminally.
  const evaluateCandidateDraft = (
    rawDraftJson: string,
    usageForErrors: Readonly<MarkSprintDraftTokenUsage>,
    repairDiagnostics: readonly string[],
  ): CandidateEvaluation => {
    let generated: ReturnType<typeof parseChapterWorkupJson>;
    try {
      generated = parseChapterWorkupJson(rawDraftJson);
    } catch {
      throw new MarkSprintDraftPipelineError(
        "MODEL_RESPONSE_INVALID",
        [],
        usageForErrors,
        repairDiagnostics,
      );
    }
    let overlapReport: ReturnType<typeof evaluateGenerationManifestV3Overlap>;
    try {
      overlapReport = evaluateGenerationManifestV3Overlap(
        input.preflight,
        preparation,
        rawDraftJson,
      );
      assertGenerationManifestV3OverlapReportIntegrity(
        input.preflight,
        preparation,
        overlapReport,
        rawDraftJson,
      );
    } catch {
      throw new MarkSprintDraftPipelineError(
        "SOURCE_OVERLAP_BLOCKED",
        [],
        usageForErrors,
        repairDiagnostics,
      );
    }
    let overlapAcceptance: GenerationManifestV3OverlapAcceptanceCapability | null =
      null;
    let sourceOverlapReview: SourceOverlapReviewWarning | null = null;
    if (overlapReport.verdict === "pass") {
      try {
        overlapAcceptance =
          createGenerationManifestV3OverlapAcceptanceCapability(
            input.preflight,
            preparation,
            overlapReport,
            rawDraftJson,
          );
        assertGenerationManifestV3OverlapAcceptanceCapability(
          overlapAcceptance,
          input.preflight,
          preparation,
          rawDraftJson,
        );
      } catch {
        throw new MarkSprintDraftPipelineError(
          "SOURCE_OVERLAP_BLOCKED",
          [],
          usageForErrors,
          repairDiagnostics,
        );
      }
    } else {
      try {
        sourceOverlapReview = createSourceOverlapReviewWarning({
          manifestDigest: input.preflight.manifestDigest,
          reportDigest: overlapReport.reportDigest,
          canonicalDraftDigest: overlapReport.canonicalDraftDigest,
          blockerCodes: overlapReport.findings
            .filter((finding) => finding.severity === "block")
            .map((finding) => finding.code),
          findingCount: overlapReport.findingCount,
          blockFindingCount: overlapReport.blockFindingCount,
          reviewFindingCount: overlapReport.reviewFindingCount,
        });
      } catch {
        throw new MarkSprintDraftPipelineError(
          "SOURCE_OVERLAP_BLOCKED",
          [],
          usageForErrors,
          repairDiagnostics,
        );
      }
    }
    const quality = evaluateMarkSprintDraft(generated, input.sourceBundle.slug);
    return {
      generated,
      overlapReport,
      overlapAcceptance,
      sourceOverlapReview,
      quality,
      rawDraftJson,
    };
  };

  let candidate = evaluateCandidateDraft(
    execution.rawDraftJson,
    tokenUsage,
    [],
  );
  let combinedUsage: MarkSprintDraftTokenUsage = tokenUsage;
  let repairApplied = false;

  let repairRecord: { requestDigest: string; repairedCodes: readonly string[] } | null =
    null;

  if (
    candidate.quality.machineVerdict !== "pass" ||
    candidate.quality.blockers.length > 0
  ) {
    // PR #46 review, correction 2: a candidate whose wording already sits in
    // the overlap-review (block-verdict) state is never repaired — the owner
    // must see THAT draft's wording problem, not a rewritten one.
    if (
      candidate.overlapReport.verdict !== "pass" ||
      !repairableQualityBlockers(candidate.quality.blockers)
    ) {
      // Non-repairable blockers (theology, coverage, voice, …): terminal,
      // exactly as before the one-repair amendment.
      throw new MarkSprintDraftPipelineError(
        "MARK_QUALITY_BLOCKED",
        candidate.quality.blockers.map((finding) => finding.code),
        combinedUsage,
        candidate.quality.blockers.map((finding) =>
          safeQualityDiagnostic(finding.code),
        ),
      );
    }
    // ONE bounded repair call (board #29 directive): same model/params, the
    // model's own draft plus the machine findings, nothing else. Exactly one;
    // the repaired draft re-runs the FULL gate chain above.
    const repairedCodeDiagnostics = candidate.quality.blockers.map((finding) =>
      safeQualityDiagnostic(finding.code),
    );
    const repairRequest = buildMarkSprintRepairRequest(
      input.modelRequest,
      candidate.rawDraftJson,
      candidate.quality.blockers,
    );
    // Bind the derived request: its digest travels into every outcome so the
    // audit can prove exactly what the repair call was (PR #46, correction 2).
    const repairRequestDigest = sha256Canonical(
      JSON.parse(JSON.stringify(repairRequest)),
    );
    const repairDigestDiagnostic = `REPAIR:REQ_${repairRequestDigest.slice(0, 16)}`;
    let repairExecution: MarkSprintModelExecutionResult;
    try {
      repairExecution = await input.executor.executeExactRequest(repairRequest);
    } catch (error) {
      throw new MarkSprintDraftPipelineError(
        "MODEL_EXECUTION_FAILED",
        [],
        combinedUsage,
        ["REPAIR:EXECUTION_FAILED", repairDigestDiagnostic, safeModelExecutionDiagnostic(error), ...repairedCodeDiagnostics],
      );
    }
    // Cost first (PR #46, correction 3): whenever the provider reported valid
    // token usage, count it BEFORE judging the response body — an empty or
    // useless repair response still cost real tokens.
    const repairUsage = repairExecution ? safeTokenUsage(repairExecution) : null;
    if (repairUsage !== null) {
      combinedUsage = {
        inputTokens: combinedUsage.inputTokens + repairUsage.inputTokens,
        outputTokens: combinedUsage.outputTokens + repairUsage.outputTokens,
      };
    }
    if (
      !repairExecution ||
      typeof repairExecution.rawDraftJson !== "string" ||
      !repairExecution.rawDraftJson.trim() ||
      repairUsage === null
    ) {
      throw new MarkSprintDraftPipelineError(
        "MODEL_RESPONSE_INVALID",
        [],
        combinedUsage,
        ["REPAIR:RESPONSE_INVALID", repairDigestDiagnostic, ...repairedCodeDiagnostics],
      );
    }
    const repaired = evaluateCandidateDraft(
      repairExecution.rawDraftJson,
      combinedUsage,
      ["REPAIR:APPLIED", repairDigestDiagnostic, ...repairedCodeDiagnostics],
    );
    // TARGETED-REPAIR ENFORCEMENT (PR #46 review, correction 1): the repair
    // may change ONLY the top-level fields named by the checker's evidence.
    // Every other field must round-trip canonically identical — a "repair"
    // that rewrites unrelated theology or copy is refused.
    {
      const allowedRoots = new Set(
        candidate.quality.blockers.flatMap((finding) =>
          finding.evidencePaths.map(
            (path) => path.replace(/^workup:[/]/u, "").split("/")[0],
          ),
        ),
      );
      const before = candidate.generated as unknown as Record<string, unknown>;
      const after = repaired.generated as unknown as Record<string, unknown>;
      const roots = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const root of roots) {
        if (allowedRoots.has(root)) continue;
        if (
          sha256Canonical(before[root] ?? null) !==
          sha256Canonical(after[root] ?? null)
        ) {
          throw new MarkSprintDraftPipelineError(
            "MODEL_RESPONSE_INVALID",
            [],
            combinedUsage,
            ["REPAIR:SCOPE_VIOLATION", repairDigestDiagnostic, ...repairedCodeDiagnostics],
          );
        }
      }
    }
    if (
      repaired.quality.machineVerdict !== "pass" ||
      repaired.quality.blockers.length > 0
    ) {
      // The single repair did not clear the bar: terminal. Never a second
      // repair, never a loop.
      throw new MarkSprintDraftPipelineError(
        "MARK_QUALITY_BLOCKED",
        repaired.quality.blockers.map((finding) => finding.code),
        combinedUsage,
        [
          "REPAIR:STILL_BLOCKED",
          repairDigestDiagnostic,
          ...repaired.quality.blockers.map((finding) =>
            safeQualityDiagnostic(finding.code),
          ),
        ],
      );
    }
    repairRecord = Object.freeze({
      requestDigest: repairRequestDigest,
      repairedCodes: Object.freeze(
        candidate.quality.blockers.map((finding) => finding.code),
      ) as readonly string[],
    });
    candidate = repaired;
    repairApplied = true;
  }

  const renderWorkup = generatedToRenderWorkup(candidate.generated);
  return deepFreeze({
    slug: input.sourceBundle.slug,
    manifestDigest: input.preflight.manifestDigest,
    sourceBundleDigest: input.sourceBundle.bundleDigest,
    rawDraftDigest: candidate.overlapReport.rawDraftDigest,
    canonicalDraftDigest: candidate.overlapReport.canonicalDraftDigest,
    overlapReportDigest: candidate.overlapReport.reportDigest,
    overlapVerdict: candidate.overlapReport.verdict,
    overlapDiagnostics: candidate.overlapReport.findings.map(safeOverlapDiagnostic),
    sourceOverlapReview: candidate.sourceOverlapReview,
    tokenUsage: combinedUsage,
    overlapAcceptance: candidate.overlapAcceptance,
    repair: repairRecord,
    quality: {
      machineVerdict: "pass" as const,
      overallStatus: "needs_owner_review" as const,
      // REPAIR-001 leads the warning list when the one-repair amendment ran,
      // so the owner review screen states plainly that a structural repair
      // call happened (transparency requirement of the amendment).
      warningCodes: [
        ...(repairApplied ? ["REPAIR-001 STRUCTURAL_REPAIR_APPLIED"] : []),
        ...candidate.quality.warnings.map((finding) => finding.code),
      ],
      manualGuardrails: candidate.quality.manualChecks.guardrails,
      textualVariants: candidate.quality.manualChecks.textualVariants,
    },
    renderWorkup,
  });
}
