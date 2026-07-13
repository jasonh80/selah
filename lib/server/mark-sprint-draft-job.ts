// SERVER-ONLY. Disconnected protected Mark 8–11 draft-job orchestrator.
//
// This module is intentionally not imported by a route or Netlify handler. It
// consumes an existing digest-bound job before source/model work, rebuilds the
// exact approved runtime, runs one private draft, and leaves publication to a
// later owner-reviewed boundary.
import { estimateChapterWorkupCost } from "@/lib/ai/costs";
import type { ChapterWorkup } from "@/lib/types";
import { recordCostEvent, type CostEventInput } from "./cost-events-repository";
import {
  completeGenerationJob,
  consumeGenerationClaim,
  failGenerationJob,
  requireJobStore,
  type ConsumedTextJobCapability,
  type FailJobOutcome,
  type JobStorePort,
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
import { getSupabaseAdmin } from "./supabase";
import { snapshotVersion } from "./chapter-versions-repository";

if (typeof window !== "undefined") {
  throw new Error("Protected Mark draft jobs are server-only");
}

const SHA256 = /^[a-f0-9]{64}$/u;

export type ProtectedMarkDraftJobFailureCode =
  | "INVALID_INPUT"
  | "CLAIM_NOT_CONSUMED"
  | "ESV_KEY_MISSING"
  | "RUNTIME_STORAGE_MISSING"
  | "PREPARATION_FAILED"
  | "PREPARATION_REFUSED"
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
  requireEsvApiKey(): string;
  createRuntimeReadPorts(): MarkSprintRuntimeReadPorts;
  prepareRuntime: RuntimePreparer;
  useApprovedPreparation: ApprovedPreparationConsumer;
  createModelExecutor(): MarkSprintModelExecutorPort;
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
        options: { signal: AbortSignal },
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
): MarkSprintModelExecutorPort {
  return Object.freeze({
    async executeExactRequest(
      request: GenerationModelRequestV3,
    ): Promise<MarkSprintModelExecutionResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 600_000);
      try {
        const response = await client.chat.completions.create(request, {
          signal: controller.signal,
        });
        return {
          rawDraftJson: response.choices?.[0]?.message?.content ?? "",
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

function safeMessage(
  code: ProtectedMarkDraftJobFailureCode | "DRAFT_SAVED",
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
): ChapterWorkup {
  return {
    ...workup,
    // Safe provenance only. No ESV, prompt, exemplar, or raw response bytes.
    generationManifestDigest: manifestDigest,
  } as ChapterWorkup;
}

async function auditFailure(
  ports: ProtectedMarkDraftJobPorts,
  slug: string,
  code: ProtectedMarkDraftJobFailureCode,
  manifestDigest: string,
  cleanup?: FailJobOutcome,
): Promise<void> {
  await writeSafeAudit(ports, {
    action: "protected_mark_draft",
    slug,
    status: "failed",
    message: safeMessage(
      code,
      manifestDigest,
      cleanup ? { cleanup } : {},
    ),
  });
}

async function failConsumedJob(
  ports: ProtectedMarkDraftJobPorts,
  input: RunProtectedMarkDraftJobInput,
  code: ProtectedMarkDraftJobFailureCode,
): Promise<ProtectedMarkDraftJobResult> {
  const cleanup = await failGenerationJob(
    ports.store,
    input.slug,
    input.jobId,
    `protected_mark_draft:${code}`,
    input.approvedManifestDigest,
  );
  await auditFailure(
    ports,
    input.slug,
    code,
    input.approvedManifestDigest,
    cleanup,
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
  } catch {
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

  let apiKey: string;
  let runtimePorts: MarkSprintRuntimeReadPorts;
  try {
    apiKey = ports.requireEsvApiKey();
    if (!apiKey.trim()) {
      return await failConsumedJob(ports, input, "ESV_KEY_MISSING");
    }
    runtimePorts = ports.createRuntimeReadPorts();
  } catch (error) {
    const code: ProtectedMarkDraftJobFailureCode =
      error instanceof Error && error.name === "EsvKeyMissingError"
        ? "ESV_KEY_MISSING"
        : "RUNTIME_STORAGE_MISSING";
    return await failConsumedJob(ports, input, code);
  }

  let runtime: MarkSprintRuntimePreparationResult;
  try {
    runtime = await ports.prepareRuntime({
      slug: input.slug,
      apiKey,
      ports: runtimePorts,
      approvedManifestDigest: input.approvedManifestDigest,
      ownerAuthorized: true,
    });
  } catch {
    return await failConsumedJob(ports, input, "PREPARATION_FAILED");
  }
  if (runtime.preview.manifestDigest !== input.approvedManifestDigest) {
    return await failConsumedJob(ports, input, "MANIFEST_DIGEST_MISMATCH");
  }
  if (!runtime.preview.readyForGeneration || !runtime.prepared) {
    return await failConsumedJob(ports, input, "PREPARATION_REFUSED");
  }

  let preparationModel = "unknown";
  let approvedPreparationOpened = false;
  let result: ProtectedMarkSprintDraftResult;
  try {
    result = await ports.useApprovedPreparation(
      runtime.prepared,
      async (preparation) => {
        approvedPreparationOpened = true;
        preparationModel = preparation.modelRequest.model;
        return runProtectedMarkSprintDraft({
          sourceBundle: preparation.sourceBundle,
          modelRequest: preparation.modelRequest,
          preflight: preparation.preflight,
          jobId: input.jobId,
          consumedJobCapability,
          executor: ports.createModelExecutor(),
        });
      },
    );
  } catch (error) {
    const pipelineError =
      error instanceof MarkSprintDraftPipelineError ? error : null;
    const code: ProtectedMarkDraftJobFailureCode = pipelineError?.code ??
      (approvedPreparationOpened
        ? "MODEL_EXECUTION_FAILED"
        : "PREPARATION_FAILED");
    if (!approvedPreparationOpened) {
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
      );
    } catch {
      return await failConsumedJob(ports, input, "COST_LOG_FAILED");
    }
    return await failConsumedJob(ports, input, code);
  }

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
      "PIPELINE_PASSED",
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
    message: safeMessage("DRAFT_SAVED", input.approvedManifestDigest, {
      canonicalDraftDigest: result.canonicalDraftDigest,
      snapshot: snapshotState,
    }),
  });

  return Object.freeze({
    ok: true,
    slug: input.slug,
    status: "draft",
    manifestDigest: input.approvedManifestDigest,
    canonicalDraftDigest: result.canonicalDraftDigest,
    snapshotVersion: snapshot,
  });
}

class EsvKeyMissingError extends Error {
  constructor() {
    super("ESV key missing");
    this.name = "EsvKeyMissingError";
  }
}

/** Production adapters. This function is deliberately disconnected. */
export async function runConfiguredProtectedMarkDraftJob(
  input: RunProtectedMarkDraftJobInput,
): Promise<ProtectedMarkDraftJobResult> {
  const store = requireJobStore(input.slug, "runConfiguredProtectedMarkDraftJob");
  const ports: ProtectedMarkDraftJobPorts = {
    store,
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
    createModelExecutor() {
      const client = getOpenAI();
      if (!client) throw new Error("OpenAI unavailable");
      return createExactOpenAiMarkSprintExecutor(client as unknown as OpenAIExactClient);
    },
    recordCost: recordCostEvent,
    audit: logGenerationAudit,
    snapshot: snapshotVersion,
  };
  return runProtectedMarkDraftJob(input, ports);
}
