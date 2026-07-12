import assert from "node:assert/strict";
import {
  assertBenchmarkReviewReadyForOwner,
  benchmarkApprovalEvidenceDigest,
  benchmarkReviewContentDigest,
  evaluateSelahBenchmarkReview,
  evidenceResolutionBindingDigest,
  freshnessBindingDigest,
  generationManifestBindingDigest,
  getSelahBenchmarkRubric,
  privacyScanBindingDigest,
  remediationResolutionBindingDigest,
  reviewerAssignmentEvidenceDigest,
  SELAH_BENCHMARK_RUBRIC_DIGEST,
  SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
  SELAH_BENCHMARK_RUBRIC_VERSION,
  SELAH_BENCHMARK_SET_ID,
  sourceOverlapBindingDigest,
  structuralBindingDigest,
  type BenchmarkReviewRequirementsV1,
  type BenchmarkReviewSubmissionV1,
} from "../lib/server/selah-benchmark-review";
import { sha256Canonical } from "../lib/server/generation-manifest";

const rubric = getSelahBenchmarkRubric();
assert.equal(rubric.criteria.length, 13);
assert.equal(rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0), 100);
assert.equal(rubric.policy.weighted_score_minimum, 85);
assert.equal(rubric.policy.minimum_rating_each_criterion, 3);
assert.equal(rubric.policy.calibration_status, "provisional_pending_owner_benchmark_scoring");
assert.deepEqual(rubric.policy.exact_gate_criterion_ids, ["BMQ-06", "BMQ-12", "BMQ-13"]);
assert.equal(rubric.policy.owner_approval_still_required, true);
assert.equal(rubric.policy.private_benchmark_wording_available_to_author, false);
assert.equal(rubric.policy.distinctive_benchmark_wording_may_be_used_in_revision_instructions, false);
assert.match(SELAH_BENCHMARK_RUBRIC_DIGEST, /^[a-f0-9]{64}$/);

function rationale(title: string): string {
  return `${title} is supported by the named draft and comparison evidence. This is synthetic contract-validation prose only; it is not a real editorial judgment or publishable review.`;
}

function evidenceFor(criterionId: string, minimum: number): string[] {
  const groups = rubric.evidence_policy.required_path_groups_by_criterion[criterionId];
  const paths = groups.map((group, index) => {
    const prefix = group[0];
    const separator = prefix.endsWith("/") ? "" : "/";
    return `${prefix}${separator}synthetic-${criterionId.toLowerCase()}-${index + 1}`;
  });
  while (paths.length < minimum) {
    paths.push(`workup:/synthetic/${criterionId.toLowerCase()}/${paths.length + 1}`);
  }
  return paths;
}

const generationManifestDigest = sha256Canonical({ manifest: "synthetic approved run" });
const structuralReportDigest = sha256Canonical({ report: "synthetic structural pass" });
const sourceOverlapReportDigest = sha256Canonical({ report: "synthetic source-overlap pass" });
const freshnessReportDigest = sha256Canonical({ report: "synthetic freshness pass" });
const approvedVoiceExampleDigest = sha256Canonical({ example: "synthetic approved voice example" });
const draftDigest = sha256Canonical({ workup: "synthetic reviewed draft" });
const benchmarkSetDigest = sha256Canonical({ benchmarkSet: "synthetic private set identity" });
const evidenceResolutionReportDigest = sha256Canonical({ report: "synthetic evidence resolution" });
const remediationResolutionReportDigest = sha256Canonical({ report: "synthetic remediation resolution" });
const privacyScanReportDigest = sha256Canonical({ report: "synthetic private-text scan" });
const artifactRegistryDigest = sha256Canonical({ registry: "synthetic complete artifact registry" });
const resolverVersion = "synthetic-artifact-resolver-v1";

const submission: BenchmarkReviewSubmissionV1 = {
  artifact: "chapter_workup",
  stage: "benchmark_comparison",
  subject: { slug: "mark-8", book: "Mark", chapter: 8 },
  prerequisites: {
    generationManifestDigest,
    structuralReportDigest,
    sourceOverlapReportDigest,
    freshnessReportDigest,
    approvedVoiceExampleDigest,
    draftDigest,
  },
  benchmark: {
    setId: SELAH_BENCHMARK_SET_ID,
    setDigest: benchmarkSetDigest,
    comparisonMode: "same_chapter_private_benchmark",
    rubricVersion: SELAH_BENCHMARK_RUBRIC_VERSION,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
  },
  reviewer: {
    kind: "human_editor",
    id: "synthetic-independent-reviewer",
    version: "synthetic-reviewer-v1",
  },
  attestations: {
    comparedAgainstBenchmark: true,
    privateBenchmarkWordingWasUnavailableToAuthor: true,
    comparisonUsedPrivateBenchmarkOnlyAfterGeneration: true,
    reviewArtifactContainsNoPrivateBenchmarkWording: true,
    revisionInstructionsContainNoPrivateBenchmarkWording: true,
  },
  criteria: rubric.criteria.map((criterion) => ({
    id: criterion.id,
    rating: 4,
    rationale: rationale(criterion.title),
    evidencePaths: evidenceFor(criterion.id, criterion.minimum_evidence_paths),
    revisionTargets: [],
  })),
};

const requirements: BenchmarkReviewRequirementsV1 = {
  artifact: "chapter_workup",
  stage: "benchmark_comparison",
  subject: { ...submission.subject },
  prerequisites: {
    generationManifestReady: true,
    generationManifestDigest,
    generationManifestBindingDigest: "",
    structuralMachineVerdict: "pass",
    structuralReportDigest,
    structuralBindingDigest: "",
    sourceOverlapMachineVerdict: "pass",
    sourceOverlapReportDigest,
    sourceOverlapBindingDigest: "",
    freshnessMachineVerdict: "pass",
    freshnessReportDigest,
    freshnessBindingDigest: "",
    approvedVoiceExampleDigest,
    draftDigest,
  },
  benchmark: {
    setId: SELAH_BENCHMARK_SET_ID,
    setDigest: benchmarkSetDigest,
    comparisonMode: "same_chapter_private_benchmark",
    approval: {
      recordId: "synthetic-owner-approval-record",
      approvedBy: "synthetic-owner",
      approvedAt: "2026-07-12T05:00:00.000Z",
      evidenceDigest: "",
    },
    rubricVersion: SELAH_BENCHMARK_RUBRIC_VERSION,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
  },
  reviewerAssignment: {
    ...submission.reviewer,
    independentFromAuthor: true,
    evidenceDigest: "",
  },
  reviewValidation: {
    reviewContentDigest: "",
    artifactRegistryDigest,
    resolverVersion,
    evidenceResolutionVerdict: "pass",
    evidenceResolutionReportDigest,
    evidenceResolutionBindingDigest: "",
    remediationResolutionVerdict: "pass",
    remediationResolutionReportDigest,
    remediationResolutionBindingDigest: "",
    privacyScanVerdict: "pass",
    privacyScanReportDigest,
    privacyScanBindingDigest: "",
  },
};

function refreshTrustedBindings(
  requirement: BenchmarkReviewRequirementsV1,
  review: BenchmarkReviewSubmissionV1,
): void {
  requirement.benchmark.approval.evidenceDigest = benchmarkApprovalEvidenceDigest({
    setId: requirement.benchmark.setId,
    setDigest: requirement.benchmark.setDigest,
    recordId: requirement.benchmark.approval.recordId,
    approvedBy: requirement.benchmark.approval.approvedBy,
    approvedAt: requirement.benchmark.approval.approvedAt,
  });
  requirement.prerequisites.generationManifestBindingDigest =
    generationManifestBindingDigest({
      generationManifestDigest: requirement.prerequisites.generationManifestDigest,
      generationManifestReady: requirement.prerequisites.generationManifestReady,
    });
  requirement.reviewerAssignment.evidenceDigest = reviewerAssignmentEvidenceDigest({
    kind: requirement.reviewerAssignment.kind,
    id: requirement.reviewerAssignment.id,
    version: requirement.reviewerAssignment.version,
    independentFromAuthor: requirement.reviewerAssignment.independentFromAuthor,
    subject: requirement.subject,
    draftDigest: requirement.prerequisites.draftDigest,
    generationManifestDigest: requirement.prerequisites.generationManifestDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    comparisonMode: requirement.benchmark.comparisonMode,
  });
  requirement.prerequisites.sourceOverlapBindingDigest = sourceOverlapBindingDigest({
    draftDigest: requirement.prerequisites.draftDigest,
    generationManifestDigest: requirement.prerequisites.generationManifestDigest,
    sourceOverlapReportDigest: requirement.prerequisites.sourceOverlapReportDigest,
    sourceOverlapMachineVerdict: requirement.prerequisites.sourceOverlapMachineVerdict,
  });
  requirement.prerequisites.structuralBindingDigest = structuralBindingDigest({
    draftDigest: requirement.prerequisites.draftDigest,
    structuralReportDigest: requirement.prerequisites.structuralReportDigest,
    structuralMachineVerdict: requirement.prerequisites.structuralMachineVerdict,
  });
  requirement.prerequisites.freshnessBindingDigest = freshnessBindingDigest({
    draftDigest: requirement.prerequisites.draftDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    approvedVoiceExampleDigest: requirement.prerequisites.approvedVoiceExampleDigest,
    freshnessReportDigest: requirement.prerequisites.freshnessReportDigest,
    comparisonMode: requirement.benchmark.comparisonMode,
    freshnessMachineVerdict: requirement.prerequisites.freshnessMachineVerdict,
  });
  const reviewContentDigest = benchmarkReviewContentDigest(review);
  requirement.reviewValidation.reviewContentDigest = reviewContentDigest;
  requirement.reviewValidation.evidenceResolutionBindingDigest =
    evidenceResolutionBindingDigest({
      draftDigest: requirement.prerequisites.draftDigest,
      reviewContentDigest,
      artifactRegistryDigest: requirement.reviewValidation.artifactRegistryDigest,
      rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
      evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
      resolverVersion: requirement.reviewValidation.resolverVersion,
      evidenceResolutionReportDigest: requirement.reviewValidation.evidenceResolutionReportDigest,
      evidenceResolutionVerdict: requirement.reviewValidation.evidenceResolutionVerdict,
    });
  requirement.reviewValidation.remediationResolutionBindingDigest =
    remediationResolutionBindingDigest({
      draftDigest: requirement.prerequisites.draftDigest,
      reviewContentDigest,
      artifactRegistryDigest: requirement.reviewValidation.artifactRegistryDigest,
      rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
      evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
      resolverVersion: requirement.reviewValidation.resolverVersion,
      remediationResolutionReportDigest:
        requirement.reviewValidation.remediationResolutionReportDigest,
      remediationResolutionVerdict: requirement.reviewValidation.remediationResolutionVerdict,
    });
  requirement.reviewValidation.privacyScanBindingDigest = privacyScanBindingDigest({
    reviewContentDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    approvedVoiceExampleDigest: requirement.prerequisites.approvedVoiceExampleDigest,
    privacyScanReportDigest: requirement.reviewValidation.privacyScanReportDigest,
    privacyScanVerdict: requirement.reviewValidation.privacyScanVerdict,
  });
}

refreshTrustedBindings(requirements, submission);

const green = evaluateSelahBenchmarkReview(requirements, submission);
assert.equal(green.machineVerdict, "pass");
assert.equal(green.qualityVerdict, "benchmark_ready");
assert.equal(green.weightedScore, 100);
assert.equal(green.overallStatus, "needs_owner_review");
assert.equal(green.readyForOwnerReview, true);
assert.equal(green.reviewSnapshotAvailable, true);
assert.equal(green.criteria.length, 13);
assert.deepEqual(green.findings, []);
assert.equal(green.calibrationStatus, "provisional_pending_owner_benchmark_scoring");
assert.match(green.requirementsDigest, /^[a-f0-9]{64}$/);
assert.match(green.submissionDigest, /^[a-f0-9]{64}$/);
assert.match(green.reviewDigest, /^[a-f0-9]{64}$/);
assert.equal(green.artifactRegistryDigest, artifactRegistryDigest);
assert.equal(assertBenchmarkReviewReadyForOwner(requirements, submission).reviewDigest, green.reviewDigest);
assert.deepEqual(evaluateSelahBenchmarkReview(requirements, submission), green);
assert.ok(Object.isFrozen(green));
assert.ok(Object.isFrozen(green.criteria));
try {
  (green as { readyForOwnerReview: boolean }).readyForOwnerReview = false;
} catch {
  // Strict runtimes throw; non-strict runtimes ignore the write.
}
assert.equal(green.readyForOwnerReview, true, "the returned report must be immutable");

const mark11Submission = structuredClone(submission);
mark11Submission.subject = { slug: "mark-11", book: "Mark", chapter: 11 };
mark11Submission.benchmark.comparisonMode = "cross_chapter_quality_only";
const mark11Requirements = structuredClone(requirements);
mark11Requirements.subject = { ...mark11Submission.subject };
mark11Requirements.benchmark.comparisonMode = "cross_chapter_quality_only";
refreshTrustedBindings(mark11Requirements, mark11Submission);
const mark11Green = evaluateSelahBenchmarkReview(mark11Requirements, mark11Submission);
assert.equal(mark11Green.machineVerdict, "pass");
assert.equal(mark11Green.qualityVerdict, "benchmark_ready");

const forgedReport = {
  readyForOwnerReview: true,
  machineVerdict: "block",
  qualityVerdict: "block",
};
assert.throws(
  () => (assertBenchmarkReviewReadyForOwner as unknown as (value: unknown) => unknown)(forgedReport),
  /(?:invalid benchmark review object|unsupported benchmark review field)/,
  "the readiness assertion must re-evaluate requirements and submission rather than trust a report",
);

let blockedMutationCases = 0;
function expectMachineBlocked(
  label: string,
  mutate: (
    requirementCopy: BenchmarkReviewRequirementsV1,
    submissionCopy: BenchmarkReviewSubmissionV1,
  ) => void,
  expectedCode: string,
  refresh = true,
): void {
  blockedMutationCases++;
  const requirementCopy = structuredClone(requirements);
  const submissionCopy = structuredClone(submission);
  mutate(requirementCopy, submissionCopy);
  if (refresh) refreshTrustedBindings(requirementCopy, submissionCopy);
  const report = evaluateSelahBenchmarkReview(requirementCopy, submissionCopy);
  assert.equal(report.machineVerdict, "block", `${label} unexpectedly passed machine validation`);
  assert.equal(report.readyForOwnerReview, false, `${label} unexpectedly reached owner review`);
  assert.ok(
    report.findings.some((finding) => finding.code === expectedCode),
    `${label} did not report ${expectedCode}: ${report.findings.map((finding) => finding.code).join(", ")}`,
  );
  assert.throws(() => assertBenchmarkReviewReadyForOwner(requirementCopy, submissionCopy));
}

expectMachineBlocked(
  "generation manifest not ready",
  (r) => { r.prerequisites.generationManifestReady = false; },
  "PREREQUISITE_NOT_READY",
);
expectMachineBlocked(
  "structural QA blocked",
  (r) => { r.prerequisites.structuralMachineVerdict = "block"; },
  "PREREQUISITE_NOT_READY",
);
expectMachineBlocked(
  "source overlap blocked",
  (r) => { r.prerequisites.sourceOverlapMachineVerdict = "block"; },
  "PREREQUISITE_NOT_READY",
);
expectMachineBlocked(
  "freshness blocked",
  (r) => { r.prerequisites.freshnessMachineVerdict = "block"; },
  "PREREQUISITE_NOT_READY",
);
expectMachineBlocked(
  "wrong draft digest",
  (_r, s) => { s.prerequisites.draftDigest = "0".repeat(64); },
  "DIGEST_MISMATCH",
);
expectMachineBlocked(
  "wrong source binding",
  (r) => { r.prerequisites.sourceOverlapBindingDigest = "1".repeat(64); },
  "DIGEST_MISMATCH",
  false,
);
expectMachineBlocked(
  "structural report belongs to another draft",
  (r) => { r.prerequisites.structuralBindingDigest = "4".repeat(64); },
  "DIGEST_MISMATCH",
  false,
);
expectMachineBlocked(
  "wrong freshness binding",
  (r) => { r.prerequisites.freshnessBindingDigest = "2".repeat(64); },
  "DIGEST_MISMATCH",
  false,
);
expectMachineBlocked(
  "benchmark approval absent",
  (r) => { r.benchmark.approval.recordId = ""; },
  "BENCHMARK_APPROVAL_INVALID",
);
expectMachineBlocked(
  "reviewer not independent",
  (r) => { r.reviewerAssignment.independentFromAuthor = false; },
  "REVIEWER_ASSIGNMENT_INVALID",
);
expectMachineBlocked(
  "reviewer identity changed",
  (_r, s) => { s.reviewer.id = "other-reviewer"; },
  "IDENTITY_MISMATCH",
);
expectMachineBlocked(
  "invalid subject combination",
  (r, s) => { r.subject = { slug: "mark-8", book: "Luke", chapter: 9 }; s.subject = { ...r.subject }; },
  "INVALID_SUBJECT_IDENTITY",
);
expectMachineBlocked(
  "wrong Mark 11 comparison mode",
  (r, s) => {
    r.subject = { slug: "mark-11", book: "Mark", chapter: 11 };
    s.subject = { ...r.subject };
    r.benchmark.comparisonMode = "same_chapter_private_benchmark";
    s.benchmark.comparisonMode = r.benchmark.comparisonMode;
  },
  "INVALID_COMPARISON_MODE",
);
expectMachineBlocked(
  "benchmark not compared",
  (_r, s) => { s.attestations.comparedAgainstBenchmark = false; },
  "REVIEW_POLICY_NOT_ATTESTED",
);
expectMachineBlocked(
  "private wording exposure not cleared",
  (_r, s) => { s.attestations.reviewArtifactContainsNoPrivateBenchmarkWording = false; },
  "REVIEW_POLICY_NOT_ATTESTED",
);
expectMachineBlocked(
  "evidence resolver blocked",
  (r) => { r.reviewValidation.evidenceResolutionVerdict = "block"; },
  "REVIEW_VALIDATION_BLOCKED",
);
expectMachineBlocked(
  "remediation resolver blocked",
  (r) => { r.reviewValidation.remediationResolutionVerdict = "block"; },
  "REVIEW_VALIDATION_BLOCKED",
);
expectMachineBlocked(
  "stale resolver receipt after registry change",
  (r) => { r.reviewValidation.artifactRegistryDigest = "5".repeat(64); },
  "DIGEST_MISMATCH",
  false,
);
expectMachineBlocked(
  "privacy scan blocked",
  (r) => { r.reviewValidation.privacyScanVerdict = "block"; },
  "REVIEW_VALIDATION_BLOCKED",
);
expectMachineBlocked(
  "privacy binding changed",
  (r) => { r.reviewValidation.privacyScanBindingDigest = "3".repeat(64); },
  "DIGEST_MISMATCH",
  false,
);
expectMachineBlocked(
  "missing criterion",
  (_r, s) => { s.criteria.pop(); },
  "CRITERION_COUNT_MISMATCH",
);
expectMachineBlocked(
  "reordered criteria",
  (_r, s) => { [s.criteria[0], s.criteria[1]] = [s.criteria[1], s.criteria[0]]; },
  "CRITERION_ORDER_MISMATCH",
);
expectMachineBlocked(
  "duplicate criterion",
  (_r, s) => { s.criteria[1].id = s.criteria[0].id; },
  "DUPLICATE_CRITERION",
);
expectMachineBlocked(
  "short rationale",
  (_r, s) => { s.criteria[0].rationale = "Looks good."; },
  "INVALID_RATIONALE",
);
expectMachineBlocked(
  "nonsense evidence namespace",
  (_r, s) => { s.criteria[0].evidencePaths = ["nonsense-one", "nonsense-two"]; },
  "INVALID_EVIDENCE_PATH",
);
expectMachineBlocked(
  "freshness evidence missing",
  (_r, s) => {
    const criterion = s.criteria.find((item) => item.id === "BMQ-13")!;
    criterion.evidencePaths = criterion.evidencePaths.filter(
      (path) => !path.startsWith("freshness-report:/"),
    );
    while (criterion.evidencePaths.length < 2) criterion.evidencePaths.push("workup:/summary");
  },
  "MISSING_CRITERION_EVIDENCE",
);
expectMachineBlocked(
  "rating needs remediation",
  (_r, s) => { s.criteria[0].rating = 2; },
  "MISSING_REVISION_TARGET",
);
expectMachineBlocked(
  "voice exact gate needs remediation",
  (_r, s) => { s.criteria.find((item) => item.id === "BMQ-06")!.rating = 3; },
  "MISSING_REVISION_TARGET",
);
expectMachineBlocked(
  "insufficient below-threshold plan",
  (_r, s) => {
    s.criteria.forEach((criterion) => { criterion.rating = 3; });
    for (const id of rubric.policy.exact_gate_criterion_ids) {
      s.criteria.find((criterion) => criterion.id === id)!.rating = 4;
    }
    s.criteria[0].revisionTargets = [{
      domain: "workup",
      path: "workup:/summary",
      instruction: "Deepen the summary so the chapter's complete movement supports its controlling idea.",
    }];
  },
  "INSUFFICIENT_REVISION_PLAN",
);
expectMachineBlocked(
  "wrong remediation domain",
  (_r, s) => {
    s.criteria[0].rating = 2;
    s.criteria[0].revisionTargets = [{
      domain: "manifest",
      path: "workup:/summary",
      instruction: "Correct the identified artifact through the proper protected workflow boundary.",
    }];
  },
  "INVALID_REVISION_TARGET",
);
expectMachineBlocked(
  "criterion-inappropriate remediation domain",
  (_r, s) => {
    s.criteria[0].rating = 2;
    s.criteria[0].revisionTargets = [{
      domain: "manifest",
      path: "manifest:/source",
      instruction: "This otherwise valid manifest target is not an allowed remedy for chapter coverage.",
    }];
  },
  "INVALID_REVISION_DOMAIN",
);
expectMachineBlocked(
  "bare remediation root",
  (_r, s) => {
    s.criteria[0].rating = 2;
    s.criteria[0].revisionTargets = [{
      domain: "workup",
      path: "workup:/",
      instruction: "Name the actual field that needs work rather than targeting the whole workup root.",
    }];
  },
  "INVALID_REVISION_TARGET",
);
expectMachineBlocked(
  "duplicate remediation across criteria",
  (_r, s) => {
    for (const index of [0, 2]) {
      s.criteria[index].rating = 3;
      s.criteria[index].revisionTargets = [{
        domain: "workup",
        path: "workup:/summary",
        instruction: "Resolve the named criterion with its own exact and independently actionable field target.",
      }];
    }
  },
  "DUPLICATE_REVISION_TARGET",
);

const highScoreWithExplicitRevision = structuredClone(submission);
highScoreWithExplicitRevision.criteria[0].rating = 3;
highScoreWithExplicitRevision.criteria[0].revisionTargets = [{
  domain: "workup",
  path: "workup:/summary",
  instruction: "Strengthen the chapter synthesis before this exact draft reaches owner review.",
}];
const highScoreRequirements = structuredClone(requirements);
refreshTrustedBindings(highScoreRequirements, highScoreWithExplicitRevision);
const highScoreTargeted = evaluateSelahBenchmarkReview(
  highScoreRequirements,
  highScoreWithExplicitRevision,
);
assert.equal(highScoreTargeted.machineVerdict, "pass");
assert.equal(highScoreTargeted.qualityVerdict, "targeted_revision");
assert.equal(highScoreTargeted.readyForOwnerReview, false);
assert.ok(highScoreTargeted.revisionCriterionIds.includes("BMQ-01"));

const validRevisionPlan = structuredClone(submission);
validRevisionPlan.criteria.forEach((criterion) => { criterion.rating = 3; });
for (const id of rubric.policy.exact_gate_criterion_ids) {
  validRevisionPlan.criteria.find((criterion) => criterion.id === id)!.rating = 4;
}
for (const id of ["BMQ-01", "BMQ-02", "BMQ-04", "BMQ-05"]) {
  const criterion = validRevisionPlan.criteria.find((item) => item.id === id)!;
  criterion.revisionTargets = [{
    domain: "workup",
    path: `workup:/synthetic/${id.toLowerCase()}`,
    instruction: "Raise this named dimension to the benchmark level with fresh, chapter-specific evidence.",
  }];
}
const validRevisionRequirements = structuredClone(requirements);
refreshTrustedBindings(validRevisionRequirements, validRevisionPlan);
const validTargeted = evaluateSelahBenchmarkReview(validRevisionRequirements, validRevisionPlan);
assert.equal(validTargeted.machineVerdict, "pass");
assert.equal(validTargeted.qualityVerdict, "targeted_revision");
assert.ok(validTargeted.weightedScore! < 85);

const blocked = structuredClone(highScoreWithExplicitRevision);
blocked.criteria[0].rating = 1;
const blockedRequirements = structuredClone(requirements);
refreshTrustedBindings(blockedRequirements, blocked);
const blockedReport = evaluateSelahBenchmarkReview(blockedRequirements, blocked);
assert.equal(blockedReport.machineVerdict, "pass");
assert.equal(blockedReport.qualityVerdict, "block");
assert.deepEqual(blockedReport.blockingCriterionIds, ["BMQ-01"]);

const changedRequirements = structuredClone(requirements);
changedRequirements.prerequisites.sourceOverlapMachineVerdict = "block";
refreshTrustedBindings(changedRequirements, submission);
const changedRequirementsReport = evaluateSelahBenchmarkReview(changedRequirements, submission);
assert.notEqual(changedRequirementsReport.requirementsDigest, green.requirementsDigest);
assert.notEqual(changedRequirementsReport.reviewDigest, green.reviewDigest);

const changedSubmission = structuredClone(submission);
changedSubmission.criteria[0].rationale = `${changedSubmission.criteria[0].rationale} Additional safe detail.`;
const changedSubmissionRequirements = structuredClone(requirements);
refreshTrustedBindings(changedSubmissionRequirements, changedSubmission);
const changedSubmissionReport = evaluateSelahBenchmarkReview(
  changedSubmissionRequirements,
  changedSubmission,
);
assert.notEqual(changedSubmissionReport.submissionDigest, green.submissionDigest);
assert.notEqual(changedSubmissionReport.reviewDigest, green.reviewDigest);

const privacyBlockedRequirements = structuredClone(requirements);
privacyBlockedRequirements.reviewValidation.privacyScanVerdict = "block";
refreshTrustedBindings(privacyBlockedRequirements, submission);
const privacyBlocked = evaluateSelahBenchmarkReview(privacyBlockedRequirements, submission);
assert.equal(privacyBlocked.reviewSnapshotAvailable, false);
assert.deepEqual(privacyBlocked.criteria, []);

const tainted = structuredClone(submission) as BenchmarkReviewSubmissionV1 & Record<string, unknown>;
const protectedText = "PRIVATE BENCHMARK WORDING MUST NEVER BE RETURNED";
tainted.rawBenchmarkText = protectedText;
assert.throws(
  () => evaluateSelahBenchmarkReview(requirements, tainted),
  (error: unknown) =>
    error instanceof Error &&
    /unsupported benchmark review field/.test(error.message) &&
    !error.message.includes(protectedText),
);

const sparse = structuredClone(submission);
sparse.criteria = [];
sparse.criteria.length = rubric.criteria.length;
assert.throws(() => evaluateSelahBenchmarkReview(requirements, sparse), /sparse benchmark review array/);

const stringBoolean = structuredClone(submission);
(stringBoolean.attestations as unknown as Record<string, unknown>).comparedAgainstBenchmark = "true";
assert.throws(() => evaluateSelahBenchmarkReview(requirements, stringBoolean), /invalid benchmark review boolean/);

const mutatedAfterEvaluation = structuredClone(submission);
mutatedAfterEvaluation.criteria[0].rating = 0;
mutatedAfterEvaluation.criteria[0].revisionTargets = [{
  domain: "workup",
  path: "workup:/summary",
  instruction: "Replace the unsafe or absent content before the draft receives another review.",
}];
assert.throws(
  () => assertBenchmarkReviewReadyForOwner(requirements, mutatedAfterEvaluation),
  /not ready for owner review/,
  "the owner gate must re-evaluate a changed submission",
);

console.log(
  `Selah benchmark review verified with synthetic-only evidence: ${rubric.criteria.length} criteria, ${blockedMutationCases} fail-closed mutations, rubric ${SELAH_BENCHMARK_RUBRIC_VERSION} (${SELAH_BENCHMARK_RUBRIC_DIGEST}).`,
);
