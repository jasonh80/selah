// SERVER-ONLY. Pure, one-call protected Mark draft pipeline.
//
// The caller supplies the already prepared v3 source/request/preflight and an
// executor port. This module performs no network, database, job, route, logging,
// or publishing work. It never returns the raw request, prompt, ESV source, or
// raw model response.
import { generatedToRenderWorkup } from "@/lib/ai/adapters/generated-to-workup";
import { evaluateMarkSprintDraft } from "@/lib/ai/quality/mark-sprint-quality";
import { parseChapterWorkupJson } from "@/lib/ai/schemas/chapter-workup-schema";
import type { ChapterWorkup } from "@/lib/types";
import {
  assertGenerationManifestV3OverlapAcceptanceCapability,
  assertGenerationManifestV3PreflightCapability,
  createGenerationManifestV3OverlapAcceptanceCapability,
  evaluateGenerationManifestV3Overlap,
  type GenerationManifestV3OverlapAcceptanceCapability,
  type GenerationManifestV3PreflightCapability,
  type GenerationModelRequestV3,
} from "./generation-manifest-v3";
import type { MarkSprintEsvSourceBundle } from "./mark-sprint-esv-source";

if (typeof window !== "undefined") {
  throw new Error("Mark sprint draft pipeline is server-only");
}

export type MarkSprintDraftPipelineErrorCode =
  | "PREFLIGHT_INVALID"
  | "MODEL_EXECUTION_FAILED"
  | "MODEL_RESPONSE_INVALID"
  | "SOURCE_OVERLAP_BLOCKED"
  | "MARK_QUALITY_BLOCKED";

export class MarkSprintDraftPipelineError extends Error {
  readonly code: MarkSprintDraftPipelineErrorCode;
  readonly blockerCodes: readonly string[];

  constructor(
    code: MarkSprintDraftPipelineErrorCode,
    blockerCodes: readonly string[] = [],
  ) {
    super(`Protected Mark draft stopped: ${code}`);
    this.name = "MarkSprintDraftPipelineError";
    this.code = code;
    this.blockerCodes = Object.freeze([...new Set(blockerCodes)].sort());
  }
}

export interface MarkSprintModelExecutionResult {
  rawDraftJson: string;
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
  executor: MarkSprintModelExecutorPort;
}

export interface ProtectedMarkSprintDraftResult {
  slug: MarkSprintEsvSourceBundle["slug"];
  manifestDigest: string;
  sourceBundleDigest: string;
  rawDraftDigest: string;
  canonicalDraftDigest: string;
  overlapReportDigest: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  overlapAcceptance: GenerationManifestV3OverlapAcceptanceCapability;
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

  let execution: MarkSprintModelExecutionResult;
  try {
    execution = await input.executor.executeExactRequest(input.modelRequest);
  } catch {
    throw new MarkSprintDraftPipelineError("MODEL_EXECUTION_FAILED");
  }
  if (
    !execution ||
    typeof execution.rawDraftJson !== "string" ||
    !execution.rawDraftJson.trim() ||
    !validTokenCount(execution.inputTokens) ||
    !validTokenCount(execution.outputTokens)
  ) {
    throw new MarkSprintDraftPipelineError("MODEL_RESPONSE_INVALID");
  }

  let generated;
  try {
    generated = parseChapterWorkupJson(execution.rawDraftJson);
  } catch {
    throw new MarkSprintDraftPipelineError("MODEL_RESPONSE_INVALID");
  }

  const overlapReport = evaluateGenerationManifestV3Overlap(
    input.preflight,
    preparation,
    execution.rawDraftJson,
  );
  if (overlapReport.verdict !== "pass") {
    throw new MarkSprintDraftPipelineError(
      "SOURCE_OVERLAP_BLOCKED",
      overlapReport.findings.map((finding) => finding.code),
    );
  }
  let overlapAcceptance: GenerationManifestV3OverlapAcceptanceCapability;
  try {
    overlapAcceptance =
      createGenerationManifestV3OverlapAcceptanceCapability(
        input.preflight,
        preparation,
        overlapReport,
        execution.rawDraftJson,
      );
    assertGenerationManifestV3OverlapAcceptanceCapability(
      overlapAcceptance,
      input.preflight,
      preparation,
      execution.rawDraftJson,
    );
  } catch {
    throw new MarkSprintDraftPipelineError("SOURCE_OVERLAP_BLOCKED");
  }

  const quality = evaluateMarkSprintDraft(generated, input.sourceBundle.slug);
  if (quality.machineVerdict !== "pass" || quality.blockers.length > 0) {
    throw new MarkSprintDraftPipelineError(
      "MARK_QUALITY_BLOCKED",
      quality.blockers.map((finding) => finding.code),
    );
  }

  const renderWorkup = generatedToRenderWorkup(generated);
  return deepFreeze({
    slug: input.sourceBundle.slug,
    manifestDigest: input.preflight.manifestDigest,
    sourceBundleDigest: input.sourceBundle.bundleDigest,
    rawDraftDigest: overlapReport.rawDraftDigest,
    canonicalDraftDigest: overlapReport.canonicalDraftDigest,
    overlapReportDigest: overlapReport.reportDigest,
    tokenUsage: {
      inputTokens: execution.inputTokens,
      outputTokens: execution.outputTokens,
    },
    overlapAcceptance,
    quality: {
      machineVerdict: "pass" as const,
      overallStatus: "needs_owner_review" as const,
      warningCodes: quality.warnings.map((finding) => finding.code),
      manualGuardrails: quality.manualChecks.guardrails,
      textualVariants: quality.manualChecks.textualVariants,
    },
    renderWorkup,
  });
}
