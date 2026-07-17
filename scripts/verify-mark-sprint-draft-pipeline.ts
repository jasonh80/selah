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
  assertGenerationManifestV3OverlapAcceptanceCapability,
  createGenerationManifestV3PreflightCapability,
  evaluateGenerationManifestV3,
  prepareGenerationModelRequestV3,
} from "../lib/server/generation-manifest-v3";
import {
  MarkSprintDraftPipelineError,
  repairableQualityBlockers,
  runProtectedMarkSprintDraft,
  type MarkSprintModelExecutorPort,
} from "../lib/server/mark-sprint-draft-pipeline";
import { sha256Canonical, sha256Text } from "../lib/server/generation-manifest";
import {
  claimGenerationJob,
  consumeGenerationClaim,
  type ConsumedTextJobCapability,
  type JobPredicates,
  type JobRow,
  type JobStorePort,
} from "../lib/server/generation-jobs";

class FakeJobStore implements JobStorePort {
  private rows = new Map<
    string,
    { status: string; updatedAt: string; workupJson: Record<string, unknown> }
  >();
  private tick = 0;

  async read(slug: string): Promise<JobRow | null> {
    const row = this.rows.get(slug);
    return row ? { ...row } : null;
  }

  async insert(
    slug: string,
    payload: Record<string, unknown>,
  ): Promise<"ok" | "duplicate"> {
    if (this.rows.has(slug)) return "duplicate";
    this.rows.set(slug, {
      status: String(payload.status),
      updatedAt: `T${++this.tick}`,
      workupJson: payload.workup_json as Record<string, unknown>,
    });
    return "ok";
  }

  async update(
    slug: string,
    predicates: JobPredicates,
    next: Record<string, unknown>,
  ): Promise<number> {
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
      if (check.equals === null ? actual != null : actual !== check.equals) {
        return 0;
      }
    }
    if ("status" in next) row.status = String(next.status);
    if ("workup_json" in next) {
      row.workupJson = next.workup_json as Record<string, unknown>;
    }
    row.updatedAt = `T${++this.tick}`;
    return 1;
  }
}

async function expectPipelineError(
  run: Promise<unknown>,
  code: MarkSprintDraftPipelineError["code"],
): Promise<MarkSprintDraftPipelineError> {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof MarkSprintDraftPipelineError);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code}`);
}

async function main(): Promise<void> {
  const sourceBundle = await bundle("mark-8", "draft-pipeline");
  const preparationInput = fixtureInput(sourceBundle);
  const modelRequest = prepareGenerationModelRequestV3(preparationInput);
  const preview = evaluateGenerationManifestV3(
    requirementsFrom(preparationInput),
    { sourceBundle, modelRequest },
  );
  assert.ok(preview.manifestDigest);
  const ready = evaluateGenerationManifestV3(
    requirementsFrom(preparationInput, preview.manifestDigest),
    { sourceBundle, modelRequest },
  );
  assert.equal(ready.ready, true);
  const preflight = createGenerationManifestV3PreflightCapability(ready, {
    sourceBundle,
    modelRequest,
  });

  async function authorization(
    approvedManifestDigest = preflight.manifestDigest,
  ): Promise<{
    jobId: string;
    consumedJobCapability: ConsumedTextJobCapability;
  }> {
    const store = new FakeJobStore();
    const jobId = await claimGenerationJob(store, "mark-8", {
      book: "Mark",
      chapter: 8,
      title: "Mark 8",
      approvedManifestDigest,
    });
    const consumedJobCapability = await consumeGenerationClaim(
      store,
      "mark-8",
      jobId,
      approvedManifestDigest,
    );
    return { jobId, consumedJobCapability };
  }

  function executor(rawDraftJson: string): {
    port: MarkSprintModelExecutorPort;
    calls: () => number;
    requests: () => unknown[];
  } {
    let callCount = 0;
    const received: unknown[] = [];
    return {
      port: {
        async executeExactRequest(request) {
          callCount++;
          received.push(request);
          return { rawDraftJson, inputTokens: 321, outputTokens: 654 };
        },
      },
      calls: () => callCount,
      requests: () => received,
    };
  }

  async function expectAuthorizationBlock(
    auth: {
      jobId: string;
      consumedJobCapability: ConsumedTextJobCapability;
    },
  ): Promise<void> {
    const blocked = executor("{}");
    const error = await expectPipelineError(
      runProtectedMarkSprintDraft({
        sourceBundle,
        modelRequest,
        preflight,
        ...auth,
        executor: blocked.port,
      }),
      "RUN_AUTHORIZATION_INVALID",
    );
    assert.equal(blocked.calls(), 0, "invalid run authority reached the model");
    assert.equal(error.tokenUsage, null);
  }

  await expectAuthorizationBlock({
    jobId: "forged-job",
    consumedJobCapability: {} as ConsumedTextJobCapability,
  });

  const clonedAuthorization = await authorization();
  await expectAuthorizationBlock({
    jobId: clonedAuthorization.jobId,
    consumedJobCapability: structuredClone(
      clonedAuthorization.consumedJobCapability,
    ),
  });

  const crossJobAuthorization = await authorization();
  await expectAuthorizationBlock({
    ...crossJobAuthorization,
    jobId: `${crossJobAuthorization.jobId}-other`,
  });

  const wrongDigestAuthorization = await authorization("b".repeat(64));
  await expectAuthorizationBlock(wrongDigestAuthorization);

  const invalidSchema = executor('{"slug":"mark-8"}');
  const schemaAuthorization = await authorization();
  const schemaError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      ...schemaAuthorization,
      executor: invalidSchema.port,
    }),
    "MODEL_RESPONSE_INVALID",
  );
  assert.equal(invalidSchema.calls(), 1);
  assert.deepEqual(schemaError.tokenUsage, {
    inputTokens: 321,
    outputTokens: 654,
  });
  assert.ok(Object.isFrozen(schemaError.tokenUsage));

  const copiedSource = passingDraft("mark-8");
  copiedSource.summary = `${SOURCE_PHRASE}. ${copiedSource.summary}`;
  const overlap = executor(JSON.stringify(copiedSource));
  const overlapAuthorization = await authorization();
  const overlapResult = await runProtectedMarkSprintDraft({
    sourceBundle,
    modelRequest,
    preflight,
    ...overlapAuthorization,
    executor: overlap.port,
  });
  assert.equal(overlap.calls(), 1);
  assert.equal(overlapResult.overlapVerdict, "block");
  assert.equal(overlapResult.overlapAcceptance, null);
  assert.ok(overlapResult.sourceOverlapReview);
  assert.ok(overlapResult.sourceOverlapReview.blockerCodes.length > 0);
  assert.ok(
    overlapResult.overlapDiagnostics.some((line) => line.includes("[block]")),
  );
  assert.equal(overlapResult.renderWorkup.slug, "mark-8");
  assert.deepEqual(overlapResult.tokenUsage, {
    inputTokens: 321,
    outputTokens: 654,
  });

  const wrongChapter = passingDraft("mark-8");
  wrongChapter.slug = "mark-9";
  const quality = executor(JSON.stringify(wrongChapter));
  const qualityAuthorization = await authorization();
  const qualityError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      ...qualityAuthorization,
      executor: quality.port,
    }),
    "MARK_QUALITY_BLOCKED",
  );
  assert.equal(quality.calls(), 1);
  assert.ok(
    qualityError.blockerCodes.includes("STR-002 OUTPUT_IDENTITY_MISMATCH"),
  );
  assert.deepEqual(qualityError.tokenUsage, {
    inputTokens: 321,
    outputTokens: 654,
  });

  const happyJson = JSON.stringify(passingDraft("mark-8"));
  const happy = executor(happyJson);
  const happyAuthorization = await authorization();
  const result = await runProtectedMarkSprintDraft({
    sourceBundle,
    modelRequest,
    preflight,
    ...happyAuthorization,
    executor: happy.port,
  });
  assert.equal(happy.calls(), 1, "the exact request must run once");
  assert.equal(happy.requests()[0], modelRequest, "request identity changed");
  assert.equal(result.slug, "mark-8");
  assert.equal(result.manifestDigest, preflight.manifestDigest);
  assert.equal(result.sourceBundleDigest, sourceBundle.bundleDigest);
  assert.equal(result.rawDraftDigest, sha256Text(happyJson));
  assert.equal(result.canonicalDraftDigest, sha256Canonical(JSON.parse(happyJson)));
  assert.match(result.overlapReportDigest, /^[a-f0-9]{64}$/u);
  assert.equal(result.overlapVerdict, "pass");
  assert.equal(result.sourceOverlapReview, null);
  assert.deepEqual(result.tokenUsage, { inputTokens: 321, outputTokens: 654 });
  assert.equal(result.quality.machineVerdict, "pass");
  assert.equal(result.quality.overallStatus, "needs_owner_review");
  assert.equal(result.renderWorkup.slug, "mark-8");
  assert.equal(result.renderWorkup.status, "draft");
  assert.equal(result.renderWorkup.verses.length, 0);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.renderWorkup));
  assert.ok(result.overlapAcceptance);
  assertGenerationManifestV3OverlapAcceptanceCapability(
    result.overlapAcceptance!,
    preflight,
    { sourceBundle, modelRequest },
    happyJson,
  );

  const replay = executor(happyJson);
  const replayError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      ...happyAuthorization,
      executor: replay.port,
    }),
    "RUN_AUTHORIZATION_INVALID",
  );
  assert.equal(replay.calls(), 0, "replayed run authority reached the model");
  assert.equal(replayError.tokenUsage, null);

  const serialized = JSON.stringify(result);
  for (const privateValue of [
    SYNTHETIC_KEY,
    SOURCE_PHRASE,
    PRIVATE_RULE,
    PRIVATE_NOTE,
    PRIVATE_EXAMPLE,
    PRIVATE_GUIDANCE_ARTIFACT,
    modelRequest.messages[0].content,
    modelRequest.messages[1].content,
  ]) {
    assert.ok(!serialized.includes(privateValue), `result leaked ${privateValue}`);
  }
  assert.doesNotMatch(serialized, /SERVER-SUPPLIED GENERATION SOURCE/u);

  let failedCalls = 0;
  const failedAuthorization = await authorization();
  const executionError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      ...failedAuthorization,
      executor: {
        async executeExactRequest() {
          failedCalls++;
          throw new Error(modelRequest.messages[1].content);
        },
      },
    }),
    "MODEL_EXECUTION_FAILED",
  );
  assert.equal(failedCalls, 1);
  assert.equal(executionError.tokenUsage, null);
  assert.ok(!String(executionError).includes(SOURCE_PHRASE));
  assert.ok(!JSON.stringify(executionError).includes(PRIVATE_RULE));

  // ---- ONE-REPAIR AMENDMENT (board #29 directive, 2026-07-17) --------------
  // When the ONLY quality blockers are the repairable structural codes
  // (STR-004/STR-010), the pipeline may make exactly ONE repair call, then
  // must re-run the full gate chain. These cases prove: repair fires only
  // then, never loops, sums cost, stays private, and cannot bypass overlap.
  function sequencedExecutor(responses: readonly string[]): {
    port: MarkSprintModelExecutorPort;
    calls: () => number;
    requests: () => unknown[];
  } {
    let callCount = 0;
    const received: unknown[] = [];
    return {
      port: {
        async executeExactRequest(request) {
          const body = responses[Math.min(callCount, responses.length - 1)];
          callCount++;
          received.push(request);
          return { rawDraftJson: body, inputTokens: 321, outputTokens: 654 };
        },
      },
      calls: () => callCount,
      requests: () => received,
    };
  }
  function structurallyBroken(): ReturnType<typeof passingDraft> {
    const draft = passingDraft("mark-8");
    draft.application = "Too short.";
    draft.primaryCharacters = ["Jesus", "Jesus", "Peter"];
    return draft;
  }

  // A targeted repair: the SAME broken draft with ONLY the flagged fields
  // fixed (PR #46, correction 1 — a wholesale replacement draft must fail).
  function targetedRepairOf(broken: ReturnType<typeof passingDraft>): ReturnType<typeof passingDraft> {
    const clean = passingDraft("mark-8");
    const repaired = JSON.parse(JSON.stringify(broken)) as ReturnType<typeof passingDraft>;
    repaired.application = clean.application;
    repaired.primaryCharacters = clean.primaryCharacters;
    return repaired;
  }

  // 1. Repairable blockers → ONE targeted repair call → full pass,
  // transparent + summed + audited.
  {
    const broken = structurallyBroken();
    const seq = sequencedExecutor([
      JSON.stringify(broken),
      JSON.stringify(targetedRepairOf(broken)),
    ]);
    const auth = await authorization();
    const repairedResult = await runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      ...auth,
      executor: seq.port,
    });
    assert.equal(seq.calls(), 2, "repairable block must trigger exactly one repair call");
    assert.equal(seq.requests()[0], modelRequest, "first call must be the exact approved request");
    const repairRequest = seq.requests()[1] as {
      model: string;
      messages: readonly { role: string; content: string }[];
    };
    assert.equal(repairRequest.model, modelRequest.model, "repair must reuse the approved model");
    assert.ok(
      repairRequest.messages[0].content.includes("repairing a single JSON chapter workup"),
      "repair call must use the repair system prompt, not the original",
    );
    assert.ok(
      repairRequest.messages[1].content.includes("STR-004 EMPTY_REQUIRED_CONTENT") &&
        repairRequest.messages[1].content.includes("STR-010 EXACT_DUPLICATE_CONTENT"),
      "repair call must name the machine findings",
    );
    assert.ok(
      !repairRequest.messages[0].content.includes(SOURCE_PHRASE) &&
        !repairRequest.messages[1].content.includes(SOURCE_PHRASE),
      "repair call must never carry ESV source text",
    );
    assert.ok(
      !JSON.stringify(repairRequest).includes(PRIVATE_RULE),
      "repair call must never carry private guidance",
    );
    assert.deepEqual(
      repairedResult.tokenUsage,
      { inputTokens: 642, outputTokens: 1308 },
      "both calls' tokens must be cost-visible",
    );
    assert.ok(
      repairedResult.quality.warningCodes.includes("REPAIR-001 STRUCTURAL_REPAIR_APPLIED"),
      "owner review must see that a repair happened",
    );
    assert.ok(repairedResult.repair, "the repair record must persist on the result");
    assert.match(repairedResult.repair!.requestDigest, /^[a-f0-9]{64}$/u);
    assert.deepEqual(
      [...repairedResult.repair!.repairedCodes].sort(),
      ["STR-004 EMPTY_REQUIRED_CONTENT", "STR-010 EXACT_DUPLICATE_CONTENT"],
    );
  }

  // 1b. A "repair" that swaps in a wholesale different draft (unflagged
  // fields changed) is REFUSED — the exact hole the review named.
  {
    const seq = sequencedExecutor([
      JSON.stringify(structurallyBroken()),
      JSON.stringify(passingDraft("mark-9")),
    ]);
    const auth = await authorization();
    const scope = await expectPipelineError(
      runProtectedMarkSprintDraft({
        sourceBundle,
        modelRequest,
        preflight,
        ...auth,
        executor: seq.port,
      }),
      "MODEL_RESPONSE_INVALID",
    );
    assert.equal(seq.calls(), 2);
    assert.ok(
      scope.safeDiagnostics.includes("REPAIR:SCOPE_VIOLATION"),
      "out-of-scope repair must be named",
    );
    assert.deepEqual(scope.tokenUsage, { inputTokens: 642, outputTokens: 1308 });
  }

  // 1c. Repair cost is counted even when the repair response is unusable
  // (PR #46, correction 3).
  {
    const seq = sequencedExecutor([JSON.stringify(structurallyBroken()), "   "]);
    const auth = await authorization();
    const emptyRepair = await expectPipelineError(
      runProtectedMarkSprintDraft({
        sourceBundle,
        modelRequest,
        preflight,
        ...auth,
        executor: seq.port,
      }),
      "MODEL_RESPONSE_INVALID",
    );
    assert.equal(seq.calls(), 2);
    assert.ok(emptyRepair.safeDiagnostics.includes("REPAIR:RESPONSE_INVALID"));
    assert.deepEqual(
      emptyRepair.tokenUsage,
      { inputTokens: 642, outputTokens: 1308 },
      "an empty repair response still cost both calls' tokens",
    );
  }

  // 1d. A block-verdict (wording review) candidate is NEVER repaired
  // (PR #46, correction 2) — even when its quality codes are repairable.
  {
    const overlapAndBroken = structurallyBroken();
    overlapAndBroken.summary = `${SOURCE_PHRASE}. ${overlapAndBroken.summary}`;
    const seq = sequencedExecutor([JSON.stringify(overlapAndBroken)]);
    const auth = await authorization();
    const noRepair = await expectPipelineError(
      runProtectedMarkSprintDraft({
        sourceBundle,
        modelRequest,
        preflight,
        ...auth,
        executor: seq.port,
      }),
      "MARK_QUALITY_BLOCKED",
    );
    assert.equal(seq.calls(), 1, "a wording-review candidate must not be repaired");
    assert.ok(!noRepair.safeDiagnostics.some((d) => d.startsWith("REPAIR:")));
  }

  // 2. Repair still blocked → terminal, exactly two calls, never a loop.
  {
    const broken = structurallyBroken();
    const stillBroken = JSON.parse(JSON.stringify(broken)) as ReturnType<typeof passingDraft>;
    stillBroken.primaryCharacters = ["Jesus", "Peter", "the disciples"];
    stillBroken.application = "Still too short.";
    const seq = sequencedExecutor([
      JSON.stringify(broken),
      JSON.stringify(stillBroken),
    ]);
    const auth = await authorization();
    const stillBlocked = await expectPipelineError(
      runProtectedMarkSprintDraft({
        sourceBundle,
        modelRequest,
        preflight,
        ...auth,
        executor: seq.port,
      }),
      "MARK_QUALITY_BLOCKED",
    );
    assert.equal(seq.calls(), 2, "one repair only — never a retry loop");
    assert.ok(
      stillBlocked.safeDiagnostics.includes("REPAIR:STILL_BLOCKED"),
      "terminal failure must say the repair ran and did not clear the bar",
    );
    assert.deepEqual(stillBlocked.tokenUsage, { inputTokens: 642, outputTokens: 1308 });
  }

  // 3. A repaired draft cannot bypass the overlap firewall: source-copying
  // wording in the REPAIRED draft still lands in the block-verdict wording
  // review state (no acceptance capability, owner must review), with the
  // repair disclosed.
  {
    const broken = structurallyBroken();
    const sneakyRepair = JSON.parse(JSON.stringify(broken)) as ReturnType<typeof passingDraft>;
    sneakyRepair.primaryCharacters = ["Jesus", "Peter", "the disciples"];
    sneakyRepair.application = `${SOURCE_PHRASE}. ${passingDraft("mark-8").application}`;
    const seq = sequencedExecutor([
      JSON.stringify(broken),
      JSON.stringify(sneakyRepair),
    ]);
    const auth = await authorization();
    const reviewAfterRepair = await runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      ...auth,
      executor: seq.port,
    });
    assert.equal(seq.calls(), 2);
    assert.equal(reviewAfterRepair.overlapVerdict, "block");
    assert.equal(reviewAfterRepair.overlapAcceptance, null);
    assert.ok(reviewAfterRepair.sourceOverlapReview, "repaired copy still requires wording review");
    assert.ok(
      reviewAfterRepair.quality.warningCodes.includes("REPAIR-001 STRUCTURAL_REPAIR_APPLIED"),
      "the repair must stay disclosed through the review state",
    );
  }

  // 4. Non-repairable codes never trigger a repair call (covered above by the
  // STR-002 case asserting calls === 1); repairableQualityBlockers itself:
  assert.equal(
    repairableQualityBlockers([{ code: "STR-004 EMPTY_REQUIRED_CONTENT" }]),
    true,
  );
  assert.equal(
    repairableQualityBlockers([
      { code: "STR-004 EMPTY_REQUIRED_CONTENT" },
      { code: "STR-002 OUTPUT_IDENTITY_MISMATCH" },
    ]),
    false,
    "a single non-repairable code must disable repair entirely",
  );
  assert.equal(repairableQualityBlockers([]), false);

  console.log(
    "Mark sprint draft pipeline verification passed (schema/overlap/quality/one-call+one-repair/privacy).",
  );
}

void main();
