import assert from "node:assert/strict";
import { passingDraft } from "./verify-mark-authoring-contract";
import {
  PRIVATE_EXAMPLE,
  PRIVATE_GUIDANCE_ARTIFACT,
  PRIVATE_NOTE,
  PRIVATE_RULE,
  SOURCE_PHRASE,
  SYNTHETIC_KEY,
  bundle,
  fixtureInput,
  requirementsFrom,
} from "./verify-generation-manifest-v3";
import {
  createGenerationManifestV3PreflightCapability,
  evaluateGenerationManifestV3,
  prepareGenerationModelRequestV3,
} from "../lib/server/generation-manifest-v3";
import {
  TEXT_JOB_KEY,
  TEXT_JOB_MANIFEST_DIGEST_KEY,
  TEXT_JOB_STATE_KEY,
  type JobPredicates,
  type JobRow,
  type JobStorePort,
} from "../lib/server/generation-jobs";
import {
  createExactOpenAiMarkSprintExecutor,
  runProtectedMarkDraftJob,
  type ProtectedMarkDraftJobPorts,
} from "../lib/server/mark-sprint-draft-job";
import type {
  MarkSprintRuntimeApprovedPreparation,
  MarkSprintRuntimePreparationResult,
  MarkSprintRuntimeRunnerPreparation,
} from "../lib/server/mark-sprint-runtime";
import {
  __setCostCaptureForTesting,
  __setCostWriteFailureForTesting,
  recordCostEvent,
  recordCostEventStrict,
  type CostEventInput,
} from "../lib/server/cost-events-repository";

const SLUG = "mark-8" as const;
const JOB_ID = "offline-mark-8-job";
const PRIVATE_ESV_KEY = "PRIVATE ORCHESTRATOR ESV KEY";

interface StoredRow {
  status: string;
  updatedAt: string | null;
  workupJson: Record<string, unknown>;
}

class FakeJobStore implements JobStorePort {
  readonly rows = new Map<string, StoredRow>();
  readonly events: string[];
  private tick = 0;
  updateCalls = 0;
  consumeFailure: "conflict" | "write_failed" | null = null;
  cleanupFailure: "conflict" | "write_failed" | null = null;
  rejectNextRead = false;
  rejectConsumeUpdate = false;
  rejectCleanupUpdate = false;

  constructor(events: string[]) {
    this.events = events;
  }

  seed(manifestDigest: string): void {
    this.rows.set(SLUG, {
      status: "generating",
      updatedAt: "T0",
      workupJson: {
        [TEXT_JOB_KEY]: JOB_ID,
        [TEXT_JOB_STATE_KEY]: "queued",
        [TEXT_JOB_MANIFEST_DIGEST_KEY]: manifestDigest,
      },
    });
  }

  async read(slug: string): Promise<JobRow | null | { error: string }> {
    if (this.rejectNextRead) {
      this.rejectNextRead = false;
      throw new Error("PRIVATE rejected read detail");
    }
    const row = this.rows.get(slug);
    return row
      ? {
          status: row.status,
          updatedAt: row.updatedAt,
          workupJson: row.workupJson,
        }
      : null;
  }

  async insert(): Promise<"ok" | "duplicate" | { error: string }> {
    return "duplicate";
  }

  async update(
    slug: string,
    predicates: JobPredicates,
    next: Record<string, unknown>,
  ): Promise<number | { error: string }> {
    this.updateCalls++;
    const row = this.rows.get(slug);
    if (!row || row.status !== predicates.status) return 0;
    if (
      predicates.updatedAt !== undefined &&
      predicates.updatedAt !== null &&
      row.updatedAt !== predicates.updatedAt
    ) {
      return 0;
    }
    for (const check of predicates.json ?? []) {
      const actual = row.workupJson[check.key];
      if (check.equals === null) {
        if (actual !== undefined && actual !== null) return 0;
      } else if (actual !== check.equals) {
        return 0;
      }
    }
    const isConsume =
      typeof next.workup_json === "object" &&
      next.workup_json !== null &&
      (next.workup_json as Record<string, unknown>)[TEXT_JOB_STATE_KEY] ===
        "running";
    if (isConsume && this.rejectConsumeUpdate) {
      this.rejectConsumeUpdate = false;
      throw new Error("PRIVATE rejected consume update detail");
    }
    if (isConsume && this.consumeFailure) {
      const failure = this.consumeFailure;
      this.consumeFailure = null;
      return failure === "conflict"
        ? 0
        : { error: "PRIVATE consume storage detail" };
    }
    if (next.status === "failed" && this.cleanupFailure) {
      const failure = this.cleanupFailure;
      this.cleanupFailure = null;
      return failure === "conflict"
        ? 0
        : { error: "simulated cleanup write failure" };
    }
    if (next.status === "failed" && this.rejectCleanupUpdate) {
      this.rejectCleanupUpdate = false;
      throw new Error("PRIVATE rejected cleanup update detail");
    }
    if (isConsume) {
      this.events.push("consume");
    }
    if ("status" in next) row.status = String(next.status);
    if ("workup_json" in next) {
      row.workupJson = next.workup_json as Record<string, unknown>;
    }
    row.updatedAt = `T${++this.tick}`;
    return 1;
  }
}

async function main(): Promise<void> {
  const sourceBundle = await bundle(SLUG, "draft-job");
  const preparationInput = fixtureInput(sourceBundle);
  const modelRequest = prepareGenerationModelRequestV3(preparationInput);
  const preview = evaluateGenerationManifestV3(
    requirementsFrom(preparationInput),
    { sourceBundle, modelRequest },
  );
  assert.ok(preview.manifestDigest);
  const manifestDigest = preview.manifestDigest;
  const manifestResult = evaluateGenerationManifestV3(
    requirementsFrom(preparationInput, manifestDigest),
    { sourceBundle, modelRequest },
  );
  assert.equal(manifestResult.ready, true);
  const preflight = createGenerationManifestV3PreflightCapability(
    manifestResult,
    { sourceBundle, modelRequest },
  );
  const preparation: MarkSprintRuntimeRunnerPreparation = {
    sourceBundle,
    modelRequest,
    manifestResult,
    preflight,
  };
  const prepared = Object.freeze(
    Object.create(null),
  ) as MarkSprintRuntimeApprovedPreparation;

  type Mode =
    | "happy"
    | "review_only"
    | "model"
    | "schema"
    | "overlap"
    | "quality";

  function harness(mode: Mode, claimDigest = manifestDigest) {
    const events: string[] = [];
    const store = new FakeJobStore(events);
    store.seed(claimDigest);
    const costs: CostEventInput[] = [];
    const audits: Array<Record<string, unknown>> = [];
    const snapshots: Array<{ slug: string; label: string; workup: unknown }> = [];
    let modelCalls = 0;
    const ports: ProtectedMarkDraftJobPorts = {
      store,
      requireEsvApiKey() {
        events.push("key");
        return PRIVATE_ESV_KEY;
      },
      createRuntimeReadPorts() {
        events.push("ports");
        return {
          async readBrainRuleRows() { return []; },
          async readChapterNoteRows() { return []; },
          async readVoiceExampleRows() { return []; },
        };
      },
      async prepareRuntime() {
        events.push("source");
        assert.equal(
          store.rows.get(SLUG)?.workupJson[TEXT_JOB_STATE_KEY],
          "running",
          "source preparation started before the job was consumed",
        );
        if (mode === "review_only") {
          return {
            preview: {
              slug: SLUG,
              evidenceReady: true,
              readyForGeneration: false,
              sourceBundleDigest: sourceBundle.bundleDigest,
              manifestDigest,
              evidenceBlockers: [],
              approvalBlockers: [
                {
                  code: "BRAIN_ARTIFACT_APPROVAL_MISSING",
                  message: "review only",
                },
              ],
              manifestFindings: [],
            },
            prepared: null,
          } satisfies MarkSprintRuntimePreparationResult;
        }
        return {
          preview: {
            slug: SLUG,
            evidenceReady: true,
            readyForGeneration: true,
            sourceBundleDigest: sourceBundle.bundleDigest,
            manifestDigest,
            evidenceBlockers: [],
            approvalBlockers: [],
            manifestFindings: [],
          },
          prepared,
        } satisfies MarkSprintRuntimePreparationResult;
      },
      useApprovedPreparation(_prepared, use) {
        assert.equal(_prepared, prepared);
        return use(preparation);
      },
      createModelExecutor() {
        return {
          async executeExactRequest(request) {
            events.push("model");
            modelCalls++;
            assert.equal(request, modelRequest, "exact model request identity changed");
            if (mode === "model") throw new Error("PRIVATE PROVIDER ERROR");
            if (mode === "schema") {
              return {
                rawDraftJson: '{"slug":"mark-8","private":"PRIVATE RAW"}',
                inputTokens: 101,
                outputTokens: 202,
              };
            }
            const draft = passingDraft(SLUG);
            if (mode === "overlap") {
              draft.summary = `${SOURCE_PHRASE}. ${draft.summary}`;
            }
            if (mode === "quality") draft.slug = "mark-9";
            return {
              rawDraftJson: JSON.stringify(draft),
              inputTokens: 101,
              outputTokens: 202,
            };
          },
        };
      },
      async recordCost(input) {
        costs.push(structuredClone(input));
      },
      async audit(entry) {
        audits.push(structuredClone(entry));
      },
      async snapshot(slug, label) {
        const row = store.rows.get(slug);
        assert.equal(row?.status, "draft");
        assert.equal(row?.workupJson.generationManifestDigest, manifestDigest);
        snapshots.push({ slug, label, workup: structuredClone(row?.workupJson) });
        return 1;
      },
    };
    return {
      ports,
      store,
      events,
      costs,
      audits,
      snapshots,
      modelCalls: () => modelCalls,
    };
  }

  const input = {
    slug: SLUG,
    jobId: JOB_ID,
    approvedManifestDigest: manifestDigest,
  };

  // Claim consumption is first; review-only preparation cannot call a model.
  {
    const h = harness("review_only");
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false);
    assert.equal(result.code, "PREPARATION_REFUSED");
    assert.equal(h.events[0], "consume");
    assert.ok(h.events.indexOf("consume") < h.events.indexOf("source"));
    assert.equal(h.modelCalls(), 0);
    assert.equal(h.store.rows.get(SLUG)?.status, "failed");
    assert.equal(h.snapshots.length, 0);
  }

  // A mismatched claim digest stops before key/source/model work.
  {
    const h = harness("happy", "b".repeat(64));
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CLAIM_NOT_CONSUMED");
    assert.deepEqual(h.events, []);
    assert.equal(h.modelCalls(), 0);
    assert.equal(h.costs.length, 0);
    assert.equal(h.snapshots.length, 0);
    assert.equal(h.store.rows.get(SLUG)?.status, "generating");
  }

  // Consume conflicts never clean up a job another delivery may own.
  {
    const h = harness("happy");
    h.store.consumeFailure = "conflict";
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CLAIM_NOT_CONSUMED");
    assert.equal(result.status, "conflict");
    assert.equal(h.store.updateCalls, 1, "conflict attempted forbidden cleanup");
    assert.deepEqual(h.events, []);
    assert.equal(h.modelCalls(), 0);
    assert.equal(h.store.rows.get(SLUG)?.status, "generating");
  }

  // A consume storage failure attempts exact-job cleanup and reports its truth.
  for (const [cleanupFailure, expectedStatus] of [
    [null, "failed"],
    ["conflict", "conflict"],
    ["write_failed", "write_failed"],
  ] as const) {
    const h = harness("happy");
    h.store.consumeFailure = "write_failed";
    h.store.cleanupFailure = cleanupFailure;
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CLAIM_CONSUME_WRITE_FAILED");
    assert.equal(result.status, expectedStatus);
    assert.equal(h.store.updateCalls, 2);
    assert.deepEqual(h.events, []);
    assert.equal(h.modelCalls(), 0);
    assert.equal(h.costs.length, 0);
    assert.equal(h.snapshots.length, 0);
  }

  // Rejected storage promises are cleanup-required, never duplicate conflicts.
  for (const [kind, expectedStatus] of [
    ["consume_read", "failed"],
    ["consume_update", "failed"],
    ["cleanup_update", "write_failed"],
  ] as const) {
    const h = harness("happy");
    if (kind === "consume_read") h.store.rejectNextRead = true;
    if (kind === "consume_update") h.store.rejectConsumeUpdate = true;
    if (kind === "cleanup_update") {
      h.store.consumeFailure = "write_failed";
      h.store.rejectCleanupUpdate = true;
    }
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CLAIM_CONSUME_WRITE_FAILED");
    assert.equal(result.status, expectedStatus);
    assert.deepEqual(h.events, [], `${kind} reached key/source/model work`);
    assert.equal(h.modelCalls(), 0);
    assert.equal(h.costs.length, 0);
    assert.equal(h.snapshots.length, 0);
    assert.equal(
      h.store.rows.get(SLUG)?.status,
      expectedStatus === "failed" ? "failed" : "generating",
    );
  }

  // Every post-consumption failure is terminal, never a draft or snapshot.
  for (const [mode, code, usageKnown] of [
    ["model", "MODEL_EXECUTION_FAILED", false],
    ["schema", "MODEL_RESPONSE_INVALID", true],
    ["overlap", "SOURCE_OVERLAP_BLOCKED", true],
    ["quality", "MARK_QUALITY_BLOCKED", true],
  ] as const) {
    const h = harness(mode);
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false, `${mode} should fail`);
    assert.equal(result.code, code);
    assert.equal(h.modelCalls(), 1);
    assert.equal(h.store.rows.get(SLUG)?.status, "failed");
    assert.equal(h.snapshots.length, 0);
    assert.equal(h.costs.length, 1, `${mode} cost missing`);
    assert.equal(h.costs[0].metadata?.usageKnown, usageKnown);
    if (usageKnown) {
      assert.equal(h.costs[0].inputTokens, 101);
      assert.equal(h.costs[0].outputTokens, 202);
    }
    assert.ok(
      JSON.stringify(h.audits).includes(code),
      `${mode} safe failure code missing from audit`,
    );
  }

  // Happy path: one exact model call, private draft, exact digest, then snapshot.
  {
    const h = harness("happy");
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, true);
    if (!result.ok) assert.fail("happy draft failed");
    assert.equal(result.status, "draft");
    assert.equal(result.manifestDigest, manifestDigest);
    assert.equal(h.modelCalls(), 1);
    assert.deepEqual(h.events.slice(0, 5), [
      "consume",
      "key",
      "ports",
      "source",
      "model",
    ]);
    assert.equal(h.store.rows.get(SLUG)?.status, "draft");
    assert.equal(
      h.store.rows.get(SLUG)?.workupJson.generationManifestDigest,
      manifestDigest,
    );
    assert.equal(h.costs.length, 1);
    assert.equal(h.snapshots.length, 1);

    const serialized = JSON.stringify({
      result,
      costs: h.costs,
      audits: h.audits,
      row: h.store.rows.get(SLUG),
      snapshots: h.snapshots,
    });
    for (const privateValue of [
      PRIVATE_ESV_KEY,
      SYNTHETIC_KEY,
      SOURCE_PHRASE,
      PRIVATE_RULE,
      PRIVATE_NOTE,
      PRIVATE_EXAMPLE,
      PRIVATE_GUIDANCE_ARTIFACT,
      modelRequest.messages[0].content,
      modelRequest.messages[1].content,
    ]) {
      assert.ok(!serialized.includes(privateValue), `private bytes leaked: ${privateValue}`);
    }
  }

  // A required cost write failure closes the job; it can never look successful.
  {
    const h = harness("happy");
    h.ports.recordCost = async () => { throw new Error("PRIVATE COST ERROR"); };
    const result = await runProtectedMarkDraftJob(input, h.ports);
    assert.equal(result.ok, false);
    assert.equal(result.code, "COST_LOG_FAILED");
    assert.equal(result.status, "failed");
    assert.equal(h.modelCalls(), 1);
    assert.equal(h.store.rows.get(SLUG)?.status, "failed");
    assert.equal(h.snapshots.length, 0);
  }

  // Audit outages never change the truthful chapter/job outcome.
  {
    const saved = harness("happy");
    saved.ports.audit = async () => { throw new Error("PRIVATE AUDIT ERROR"); };
    const savedResult = await runProtectedMarkDraftJob(input, saved.ports);
    assert.equal(savedResult.ok, true);
    assert.equal(saved.store.rows.get(SLUG)?.status, "draft");

    const failed = harness("review_only");
    failed.ports.audit = async () => { throw new Error("PRIVATE AUDIT ERROR"); };
    const failedResult = await runProtectedMarkDraftJob(input, failed.ports);
    assert.equal(failedResult.ok, false);
    assert.equal(failedResult.code, "PREPARATION_REFUSED");
    assert.equal(failed.store.rows.get(SLUG)?.status, "failed");
  }

  // Exact OpenAI adapter passes the genuine request object without cloning.
  {
    let received: unknown;
    let receivedOptions: unknown;
    const executor = createExactOpenAiMarkSprintExecutor({
      chat: {
        completions: {
          async create(request, options) {
            received = request;
            receivedOptions = options;
            return {
              choices: [{ message: { content: "{}" } }],
              usage: { prompt_tokens: 7, completion_tokens: 9 },
            };
          },
        },
      },
    });
    const execution = await executor.executeExactRequest(modelRequest);
    assert.equal(received, modelRequest);
    assert.equal(
      (receivedOptions as { maxRetries?: number }).maxRetries,
      0,
      "one protected executor call must make one provider request",
    );
    assert.deepEqual(execution, {
      rawDraftJson: "{}",
      inputTokens: 7,
      outputTokens: 9,
    });
  }


  // Strict cost persistence throws; existing general callers remain best-effort.
  {
    const costInput: CostEventInput = {
      requestType: "chapter_workup_text",
      provider: "openai",
      model: "synthetic-model",
      inputTokens: 1,
      outputTokens: 1,
    };
    __setCostCaptureForTesting(null);
    __setCostWriteFailureForTesting("unconfigured");
    await assert.rejects(() => recordCostEventStrict(costInput));
    await assert.doesNotReject(() => recordCostEvent(costInput));
    __setCostWriteFailureForTesting("insert_failed");
    await assert.rejects(() => recordCostEventStrict(costInput));
    await assert.doesNotReject(() => recordCostEvent(costInput));
    const captured: CostEventInput[] = [];
    __setCostWriteFailureForTesting(null);
    __setCostCaptureForTesting(captured);
    await recordCostEventStrict(costInput);
    assert.equal(captured.length, 1);
    __setCostCaptureForTesting(null);
  }

  console.log(
    "Protected Mark draft job verification passed (claim/source/model/persistence/privacy).",
  );
}

void main();
