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
  runProtectedMarkSprintDraft,
  type MarkSprintModelExecutorPort,
} from "../lib/server/mark-sprint-draft-pipeline";
import { sha256Canonical, sha256Text } from "../lib/server/generation-manifest";

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

  const invalidSchema = executor('{"slug":"mark-8"}');
  const schemaError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
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
  const overlapError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
      executor: overlap.port,
    }),
    "SOURCE_OVERLAP_BLOCKED",
  );
  assert.equal(overlap.calls(), 1);
  assert.ok(overlapError.blockerCodes.length > 0);
  assert.deepEqual(overlapError.tokenUsage, {
    inputTokens: 321,
    outputTokens: 654,
  });

  const wrongChapter = passingDraft("mark-8");
  wrongChapter.slug = "mark-9";
  const quality = executor(JSON.stringify(wrongChapter));
  const qualityError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
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
  const result = await runProtectedMarkSprintDraft({
    sourceBundle,
    modelRequest,
    preflight,
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
  assert.deepEqual(result.tokenUsage, { inputTokens: 321, outputTokens: 654 });
  assert.equal(result.quality.machineVerdict, "pass");
  assert.equal(result.quality.overallStatus, "needs_owner_review");
  assert.equal(result.renderWorkup.slug, "mark-8");
  assert.equal(result.renderWorkup.status, "draft");
  assert.equal(result.renderWorkup.verses.length, 0);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.renderWorkup));
  assertGenerationManifestV3OverlapAcceptanceCapability(
    result.overlapAcceptance,
    preflight,
    { sourceBundle, modelRequest },
    happyJson,
  );

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
  const executionError = await expectPipelineError(
    runProtectedMarkSprintDraft({
      sourceBundle,
      modelRequest,
      preflight,
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

  console.log(
    "Mark sprint draft pipeline verification passed (schema/overlap/quality/one-call/privacy).",
  );
}

void main();
