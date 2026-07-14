// SERVER-ONLY. Protected Mark sprint draft-job orchestrator.
//
// The authenticated Netlify text worker dispatches only Mark 8 here. This
// consumes an existing digest-bound job before source/model work, rebuilds the
// exact approved runtime, runs one private draft, and leaves publication to a
// later owner-reviewed boundary. Mark 9–11 remain disconnected.
import { estimateChapterWorkupCost } from "@/lib/ai/costs";
import type { SourceOverlapReviewWarning } from "@/lib/source-overlap-review";
import type { ChapterWorkup } from "@/lib/types";
import {
  recordCostEventStrict,
  type CostEventInput,
} from "./cost-events-repository";
import {
  completeGenerationJob,
  consumeGenerationClaim,
  failGenerationJob,
  requireJobStore,
  type ConsumedTextJobCapability,
  type FailJobOutcome,
  type JobStorePort,
  type TextJobFailureState,
} from "./generation-jobs";
import { logGenerationAudit } from "./generation-settings";
import type { GenerationModelRequestV3 } from "./generation-manifest-v3";
import {
  MarkSprintDraftPipelineError,
  runProtectedMarkSprintDraft,
  type MarkSprintModelExecutionResult,
  type MarkSprintModelExecutorPort,
  type ProtectedMarkSprintDraftResult,
} from "./mark-sprint-draft-pipeline";
import {
  createSupabaseMarkSprintRuntimeReadPorts,
  prepareMarkSprintRuntime,
  withMarkSprintRuntimeApprovedPreparation,
  type MarkSprintRuntimeApprovedPreparation,
  type MarkSprintRuntimePreparationResult,
  type MarkSprintRuntimeReadPorts,
  type PrepareMarkSprintRuntimeInput,
  type MarkSprintRuntimeRunnerPreparation,
} from "./mark-sprint-runtime";
import { isMarkSprintSlug, type MarkSprintSlug } from "./mark-sprint-manifest-policy";
import { getOpenAI } from "./openai";
import { isChapterMutationError } from "./protected-chapters";
import { getSupabaseAdmin } from "./supabase";
import { snapshotVersion } from "./chapter-versions-repository";

if (typeof window !== "undefined") {
  throw new Error("Protected Mark draft jobs are server-only");
}

const SHA256 = /^[a-f0-9]{64}$/u;

// Netlify gives background functions 15 minutes. Stop source/model work at
// 12 minutes so cost, audit, and exact terminal-state writes retain a full
// three-minute cleanup reserve.
export const MARK_8_TEXT_RUN_DEADLINE_MS = 12 * 60 * 1000;
export const MARK_8_TEXT_RUN_CLEANUP_RESERVE_MS = 3 * 60 * 1000;

class TextRunDeadlineError extends Error {
  constructor() {
    super(
      "Mark 8 text run reached its 12-minute safety deadline; stopping before the hosting limit",
    );
    this.name = "TextRunDeadlineError";
  }
}

interface TextRunDeadline {
  signal: AbortSignal;
  run<T>(operation: () => Promise<T>): Promise<T>;
  dispose(): void;
}

function createTextRunDeadline(durationMs: number): TextRunDeadline {
  const controller = new AbortController();
  const safeDurationMs =
    Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : MARK_8_TEXT_RUN_DEADLINE_MS;
  const timer = setTimeout(() => controller.abort(), safeDurationMs);

  return {
    signal: controller.signal,
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (controller.signal.aborted) {
        return Promise.reject(new TextRunDeadlineError());
      }
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          callback();
        };
        const onAbort = () => finish(() => reject(new TextRunDeadlineError()));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve()
          .then(operation)
          .then(
            (value) => finish(() => resolve(value)),
            (error) => finish(() => reject(error)),
          );
      });
    },
    dispose(): void {
      clearTimeout(timer);
    },
  };
}

export type ProtectedMarkDraftJobFailureCode =
  | "INVALID_INPUT"
  | "CLAIM_NOT_CONSUMED"
  | "CLAIM_CONSUME_WRITE_FAILED"
  | "ESV_KEY_MISSING"
  | "RUNTIME_STORAGE_MISSING"
  | "PREPARATION_FAILED"
  | "PREPARATION_REFUSED"
  | "RUN_DEADLINE_EXCEEDED"
  | "MANIFEST_DIGEST_MISMATCH"
  | "PREFLIGHT_INVALID"
  | "RUN_AUTHORIZATION_INVALID"
  | "MODEL_EXECUTION_FAILED"
  | "MODEL_RESPONSE_INVALID"
  | "SOURCE_OVERLAP_BLOCKED"
  | "MARK_QUALITY_BLOCKED"
  | "RESULT_DIGEST_MISMATCH"
  | "COST_LOG_FAILED"
  | "DRAFT_COMPLETION_FAILED";

export type ProtectedMarkDraftJobResult =
  | {
      readonly ok: true;
      readonly slug: MarkSprintSlug;
      readonly status: "draft";
      readonly manifestDigest: string;
      readonly canonicalDraftDigest: string;
      readonly copyWarning: boolean;
      readonly snapshotVersion: number | null;
    }
  | {
      readonly ok: false;
      readonly slug: string;
      readonly status: "refused" | "failed" | "conflict" | "write_failed";
      readonly code: ProtectedMarkDraftJobFailureCode;
      readonly manifestDigest: string | null;
    };

type RuntimePreparer = (
  input: PrepareMarkSprintRuntimeInput,
) => Promise<MarkSprintRuntimePreparationResult>;

type ApprovedPreparationConsumer = <T>(
  prepared: MarkSprintRuntimeApprovedPreparation,
  use: (preparation: MarkSprintRuntimeRunnerPreparation) => T,
) => T;

interface SafeAuditEntry {
  action: string;
  slug: string;
  model?: string;
  estimatedCost?: number;
  status: "started" | "succeeded" | "failed";
  message: string;
}

/** Injectable orchestration seams. Production construction is below. */
export interface ProtectedMarkDraftJobPorts {
  store: JobStorePort;
  runDeadlineMs: number;
  requireEsvApiKey(): string;
  createRuntimeReadPorts(): MarkSprintRuntimeReadPorts;
  prepareRuntime: RuntimePreparer;
  useApprovedPreparation: ApprovedPreparationConsumer;
  createModelExecutor(signal: AbortSignal): MarkSprintModelExecutorPort;
  recordCost(input: CostEventInput): Promise<void>;
  audit(entry: SafeAuditEntry): Promise<void>;
  snapshot(slug: string, label: string): Promise<number | null>;
}

export interface RunProtectedMarkDraftJobInput {
  slug: string;
  jobId: string;
  approvedManifestDigest: string;
}

interface OpenAIExactClient {
  chat: {
    completions: {
      create(
        body: unknown,
        options: { signal: AbortSignal; maxRetries: 0; timeout: 600_000 },
      ): Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    };
  };
}

/** Dispatches the exact frozen v3 request object once; it never clones it. */
export function createExactOpenAiMarkSprintExecutor(
  client: OpenAIExactClient,
  runSignal?: AbortSignal,
): MarkSprintModelExecutorPort {
  return Object.freeze({
    async executeExactRequest(
      request: GenerationModelRequestV3,
    ): Promise<MarkSprintModelExecutionResult> {
      const controller = new AbortController();
      const abortFromRun = () => controller.abort();
      if (runSignal?.aborted) controller.abort();
      runSignal?.addEventListener("abort", abortFromRun, { once: true });
      const timer = setTimeout(() => controller.abort(), 600_000);
      try {
        const response = await client.chat.completions.create(request, {
          signal: controller.signal,
          // The shared OpenAI client defaults to four minutes. Mark 8's large,
          // exact draft request gets the same ten-minute provider envelope as
          // this executor's abort timer, inside the 12-minute overall limit.
          timeout: 600_000,
          // The exact protected executor owns retries. One execution means one
          // provider request; a transport retry would risk duplicate spend.
          maxRetries: 0,
        });
        return {
          rawDraftJson: response.choices?.[0]?.message?.content ?? "",
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        };
      } finally {
        clearTimeout(timer);
        runSignal?.removeEventListener("abort", abortFromRun);
      }
    },
  });
}

function safeMessage(
  code:
    | ProtectedMarkDraftJobFailureCode
    | "DRAFT_SAVED"
    | "DRAFT_SAVED_WITH_COPY_WARNING",
  manifestDigest: string,
  extra: Record<string, string> = {},
): string {
  return JSON.stringify({ code, manifestDigest, ...extra });
}

function cleanupStatus(outcome: FailJobOutcome): "failed" | "conflict" | "write_failed" {
  return outcome === "marked_failed" ? "failed" : outcome;
}

async function writeSafeAudit(
  ports: ProtectedMarkDraftJobPorts,
  entry: SafeAuditEntry,
): Promise<boolean> {
  try {
    await ports.audit(entry);
    return true;
  } catch {
    // The chapter/job result stays authoritative. An audit outage must never
    // turn a saved private draft into a reported failure or hide cleanup truth.
    console.error(
      `[selah] protected_mark_draft audit write failed (${entry.status})`,
    );
    return false;
  }
}

function withManifestDigest(
  workup: ChapterWorkup,
  manifestDigest: string,
  sourceOverlapReview: SourceOverlapReviewWarning | null,
): ChapterWorkup {
  return {
    ...workup,
    // Safe provenance only. No ESV, prompt, exemplar, or raw response bytes.
    generationManifestDigest: manifestDigest,
    ...(sourceOverlapReview ? { sourceOverlapReview } : {}),
  } as ChapterWorkup;
}

/**
 * Bounded, excerpt-free diagnostic summary for the durable audit row (issue
 * #17 acceptance 5): finding codes, structural paths, and counts only — a
 * future stop can be reconstructed without ever persisting ESV text, prompt
 * text, or rejected draft text.
 */
function boundedDiagnostics(diagnostics: readonly string[]): string {
  const kept = diagnostics.slice(0, 6);
  const suffix =
    diagnostics.length > kept.length
      ? `; +${diagnostics.length - kept.length} more`
      : "";
  return `${kept.join("; ")}${suffix}`.slice(0, 400);
}

async function auditFailure(
  ports: ProtectedMarkDraftJobPorts,
  slug: string,
  code: ProtectedMarkDraftJobFailureCode,
  manifestDigest: string,
  cleanup?: FailJobOutcome,
  safeDiagnostics: readonly string[] = [],
): Promise<void> {
  await writeSafeAudit(ports, {
    action: "protected_mark_draft",
    slug,
    status: "failed",
    message: safeMessage(code, manifestDigest, {
      ...(cleanup ? { cleanup } : {}),
      ...(safeDiagnostics.length
        ? { diagnostics: boundedDiagnostics(safeDiagnostics) }
        : {}),
    }),
  });
}

async function failConsumedJob(
  ports: ProtectedMarkDraftJobPorts,
  input: RunProtectedMarkDraftJobInput,
  code: ProtectedMarkDraftJobFailureCode,
  expectedState: TextJobFailureState = "running",
  safeDiagnostics: readonly string[] = [],
): Promise<ProtectedMarkDraftJobResult> {
  let cleanup: FailJobOutcome;
  try {
    cleanup = await failGenerationJob(
      ports.store,
      input.slug,
      input.jobId,
      `protected_mark_draft:${code}`,
      {
        expectedState,
        approvedManifestDigest: input.approvedManifestDigest,
      },
    );
  } catch {
    // Defensive backstop: cleanup I/O must never reject the orchestrator.
    cleanup = "write_failed";
  }
  await auditFailure(
    ports,
    input.slug,
    code,
    input.approvedManifestDigest,
    cleanup,
    safeDiagnostics,
  );
  return Object.freeze({
    ok: false,
    slug: input.slug,
    status: cleanupStatus(cleanup),
    code,
    manifestDigest: input.approvedManifestDigest,
  });
}

async function recordModelCost(
  ports: ProtectedMarkDraftJobPorts,
  slug: MarkSprintSlug,
  manifestDigest: string,
  model: string,
  tokenUsage: { inputTokens: number; outputTokens: number } | null,
  outcomeCode: string,
  extraMetadata: Record<string, boolean> = {},
): Promise<number | null> {
  const estimate = tokenUsage
    ? estimateChapterWorkupCost({
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        imageCount: 0,
      }).totalEstimateUsd
    : null;
  await ports.recordCost({
    requestType: "chapter_workup_text",
    provider: "openai",
    model,
    ...(tokenUsage
      ? {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          estimatedCostUsd: estimate ?? undefined,
        }
      : {}),
    metadata: {
      slug,
      manifestDigest,
      outcomeCode,
      usageKnown: tokenUsage !== null,
      protectedMarkDraft: true,
      ...extraMetadata,
    },
  });
  return estimate;
}

/**
 * Run one already-claimed, owner-authorized private Mark draft job.
 * Returns safe evidence only; draft/source/prompt bytes never leave persistence.
 */
export async function runProtectedMarkDraftJob(
  input: RunProtectedMarkDraftJobInput,
  ports: ProtectedMarkDraftJobPorts,
): Promise<ProtectedMarkDraftJobResult> {
  if (
    !isMarkSprintSlug(input.slug) ||
    !input.jobId.trim() ||
    !SHA256.test(input.approvedManifestDigest)
  ) {
    return Object.freeze({
      ok: false,
      slug: input.slug,
      status: "refused",
      code: "INVALID_INPUT",
      manifestDigest: SHA256.test(input.approvedManifestDigest)
        ? input.approvedManifestDigest
        : null,
    });
  }

  // First I/O: atomically consume the digest-bound single-use job. Nothing
  // below (key access, live evidence, ESV, or model) can run before this wins.
  let consumedJobCapability: ConsumedTextJobCapability;
  try {
    consumedJobCapability = await consumeGenerationClaim(
      ports.store,
      input.slug,
      input.jobId,
      input.approvedManifestDigest,
    );
  } catch (error) {
    if (isChapterMutationError(error) && error.code === "CONFLICT") {
      // A duplicate/superseded delivery may be the rightful owner. Never let
      // this losing delivery clean up the shared row.
      await auditFailure(
        ports,
        input.slug,
        "CLAIM_NOT_CONSUMED",
        input.approvedManifestDigest,
      );
      return Object.freeze({
        ok: false,
        slug: input.slug,
        status: "conflict",
        code: "CLAIM_NOT_CONSUMED",
        manifestDigest: input.approvedManifestDigest,
      });
    }
    // WRITE_FAILED, REFUSED, and raw rejected read/update promises are not
    // proof of another owner. Attempt exact job+digest cleanup fail-closed.
    return await failConsumedJob(
      ports,
      input,
      isChapterMutationError(error) && error.code === "REFUSED"
        ? "CLAIM_NOT_CONSUMED"
        : "CLAIM_CONSUME_WRITE_FAILED",
      "queued",
    );
  }

  // Match the image worker's safety pattern: never race the atomic claim
  // consume against a timer. Once this worker owns the running claim, one
  // absolute deadline covers all source preparation and model/validation work.
  const deadline = createTextRunDeadline(ports.runDeadlineMs);
  const stopAndFail = async (
    code: ProtectedMarkDraftJobFailureCode,
  ): Promise<ProtectedMarkDraftJobResult> => {
    deadline.dispose();
    return failConsumedJob(ports, input, code);
  };

  let apiKey: string;
  let runtimePorts: MarkSprintRuntimeReadPorts;
  try {
    apiKey = ports.requireEsvApiKey();
    if (!apiKey.trim()) {
      return await stopAndFail("ESV_KEY_MISSING");
    }
    runtimePorts = ports.createRuntimeReadPorts();
  } catch (error) {
    const code: ProtectedMarkDraftJobFailureCode =
      error instanceof Error && error.name === "EsvKeyMissingError"
        ? "ESV_KEY_MISSING"
        : "RUNTIME_STORAGE_MISSING";
    return await stopAndFail(code);
  }

  let runtime: MarkSprintRuntimePreparationResult;
  try {
    runtime = await deadline.run(() =>
      ports.prepareRuntime({
        slug: input.slug,
        apiKey,
        ports: runtimePorts,
        signal: deadline.signal,
        approvedManifestDigest: input.approvedManifestDigest,
        ownerAuthorized: true,
      }),
    );
  } catch {
    return await stopAndFail(
      deadline.signal.aborted
        ? "RUN_DEADLINE_EXCEEDED"
        : "PREPARATION_FAILED",
    );
  }
  if (deadline.signal.aborted) {
    return await stopAndFail("RUN_DEADLINE_EXCEEDED");
  }
  if (runtime.preview.manifestDigest !== input.approvedManifestDigest) {
    return await stopAndFail("MANIFEST_DIGEST_MISMATCH");
  }
  if (!runtime.preview.readyForGeneration || !runtime.prepared) {
    return await stopAndFail("PREPARATION_REFUSED");
  }

  let preparationModel = "unknown";
  let approvedPreparationOpened = false;
  let modelRequestStarted = false;
  let result: ProtectedMarkSprintDraftResult;
  try {
    result = await deadline.run(() =>
      Promise.resolve(
        ports.useApprovedPreparation(
          runtime.prepared!,
          async (preparation) => {
            approvedPreparationOpened = true;
            preparationModel = preparation.modelRequest.model;
            const exactExecutor = ports.createModelExecutor(deadline.signal);
            const observedExecutor: MarkSprintModelExecutorPort = {
              async executeExactRequest(request) {
                modelRequestStarted = true;
                return exactExecutor.executeExactRequest(request);
              },
            };
            return runProtectedMarkSprintDraft({
              sourceBundle: preparation.sourceBundle,
              modelRequest: preparation.modelRequest,
              preflight: preparation.preflight,
              jobId: input.jobId,
              consumedJobCapability,
              executor: observedExecutor,
            });
          },
        ),
      ),
    );
  } catch (error) {
    const deadlineExceeded =
      deadline.signal.aborted || error instanceof TextRunDeadlineError;
    deadline.dispose();
    const pipelineError =
      error instanceof MarkSprintDraftPipelineError ? error : null;
    const code: ProtectedMarkDraftJobFailureCode = deadlineExceeded
      ? "RUN_DEADLINE_EXCEEDED"
      : pipelineError?.code ??
        (approvedPreparationOpened
          ? "MODEL_EXECUTION_FAILED"
          : "PREPARATION_FAILED");
    if (!approvedPreparationOpened) {
      return await failConsumedJob(ports, input, code);
    }
    if (deadlineExceeded && !modelRequestStarted) {
      return await failConsumedJob(ports, input, code);
    }
    try {
      await recordModelCost(
        ports,
        input.slug,
        input.approvedManifestDigest,
        preparationModel,
        pipelineError?.tokenUsage ?? null,
        code,
        deadlineExceeded
          ? { deadlineExceeded: true, billingUncertain: true }
          : {},
      );
    } catch {
      return await failConsumedJob(ports, input, "COST_LOG_FAILED");
    }
    // Safe diagnostics (finding code/path/counts — never excerpts) travel into
    // the durable audit so an overlap stop can be reconstructed (issue #17).
    return await failConsumedJob(
      ports,
      input,
      code,
      "running",
      pipelineError?.safeDiagnostics ?? [],
    );
  }
  deadline.dispose();

  if (result.manifestDigest !== input.approvedManifestDigest) {
    try {
      await recordModelCost(
        ports,
        input.slug,
        input.approvedManifestDigest,
        preparationModel,
        result.tokenUsage,
        "RESULT_DIGEST_MISMATCH",
      );
    } catch {
      return await failConsumedJob(ports, input, "COST_LOG_FAILED");
    }
    return await failConsumedJob(ports, input, "RESULT_DIGEST_MISMATCH");
  }

  let estimatedCost: number | null;
  try {
    estimatedCost = await recordModelCost(
      ports,
      input.slug,
      input.approvedManifestDigest,
      preparationModel,
      result.tokenUsage,
      result.sourceOverlapReview
        ? "PIPELINE_PASSED_WITH_COPY_WARNING"
        : "PIPELINE_PASSED",
      result.sourceOverlapReview ? { copyWarning: true } : {},
    );
  } catch {
    return await failConsumedJob(ports, input, "COST_LOG_FAILED");
  }

  try {
    await completeGenerationJob(
      ports.store,
      input.slug,
      input.jobId,
      {
        workup: withManifestDigest(
          result.renderWorkup,
          input.approvedManifestDigest,
          result.sourceOverlapReview,
        ),
        version: result.renderWorkup.version,
        bibleVersion: "ESV",
      },
      input.approvedManifestDigest,
    );
  } catch {
    return await failConsumedJob(ports, input, "DRAFT_COMPLETION_FAILED");
  }

  // The archive is intentionally after the exact conditional draft save.
  let snapshot: number | null = null;
  let snapshotState = "not_created";
  try {
    snapshot = await ports.snapshot(
      input.slug,
      `protected draft ${input.approvedManifestDigest.slice(0, 12)}`,
    );
    snapshotState = snapshot === null ? "not_created" : "created";
  } catch {
    snapshotState = "write_failed";
  }
  await writeSafeAudit(ports, {
    action: "protected_mark_draft",
    slug: input.slug,
    model: preparationModel,
    ...(estimatedCost === null ? {} : { estimatedCost }),
    status: "succeeded",
    message: safeMessage(
      result.sourceOverlapReview
        ? "DRAFT_SAVED_WITH_COPY_WARNING"
        : "DRAFT_SAVED",
      input.approvedManifestDigest,
      {
        canonicalDraftDigest: result.canonicalDraftDigest,
        snapshot: snapshotState,
        overlapVerdict: result.overlapVerdict,
        ...(result.overlapDiagnostics.length
          ? {
              diagnostics: boundedDiagnostics(result.overlapDiagnostics),
            }
          : {}),
      },
    ),
  });

  return Object.freeze({
    ok: true,
    slug: input.slug,
    status: "draft",
    manifestDigest: input.approvedManifestDigest,
    canonicalDraftDigest: result.canonicalDraftDigest,
    copyWarning: result.sourceOverlapReview !== null,
    snapshotVersion: snapshot,
  });
}

class EsvKeyMissingError extends Error {
  constructor() {
    super("ESV key missing");
    this.name = "EsvKeyMissingError";
  }
}

/** Production adapters used only by the authenticated protected worker path. */
export async function runConfiguredProtectedMarkDraftJob(
  input: RunProtectedMarkDraftJobInput,
): Promise<ProtectedMarkDraftJobResult> {
  const store = requireJobStore(input.slug, "runConfiguredProtectedMarkDraftJob");
  const ports: ProtectedMarkDraftJobPorts = {
    store,
    runDeadlineMs: MARK_8_TEXT_RUN_DEADLINE_MS,
    requireEsvApiKey() {
      const key = process.env.ESV_API_KEY;
      if (!key) throw new EsvKeyMissingError();
      return key;
    },
    createRuntimeReadPorts() {
      const db = getSupabaseAdmin();
      if (!db) throw new Error("runtime storage missing");
      return createSupabaseMarkSprintRuntimeReadPorts(db);
    },
    prepareRuntime: prepareMarkSprintRuntime,
    useApprovedPreparation: withMarkSprintRuntimeApprovedPreparation,
    createModelExecutor(signal) {
      const client = getOpenAI();
      if (!client) throw new Error("OpenAI unavailable");
      return createExactOpenAiMarkSprintExecutor(
        client as unknown as OpenAIExactClient,
        signal,
      );
    },
    recordCost: recordCostEventStrict,
    audit: logGenerationAudit,
    snapshot: snapshotVersion,
  };
  return runProtectedMarkDraftJob(input, ports);
}
