// SERVER-ONLY. Pure, no-I/O contract for a future post-generation benchmark
// review. It validates and scores already-produced review evidence; it does not
// perform the semantic review, call a model, mutate a draft, or authorize
// publication. Requirements must be assembled from authenticated server-owned
// records, never ordinary request JSON. The trusted context is a composition-
// root input: no route may deserialize its authority policy, clock, key IDs,
// active assignment, resolver/scanner versions, or current heads from a client.
import rubricJson from "../ai/quality/selah-benchmark-rubric.v1.json";
import { sha256Canonical } from "./generation-manifest";
import {
  verifyAuthenticatedBenchmarkEvidence,
  type AuthenticatedBenchmarkEvidenceV1,
  type BenchmarkEvidenceExpectationsV1,
  type TrustedBenchmarkEvidenceAuthorityPolicyV1,
} from "./selah-benchmark-evidence";

type RubricCriterion = {
  id: string;
  key: string;
  title: string;
  weight: number;
  question: string;
  minimum_evidence_paths: number;
  indicators: string[];
};

type BenchmarkRubric = {
  contract_version: string;
  artifact: "chapter_workup";
  stage: "benchmark_comparison";
  benchmark_set_id: string;
  policy: {
    private_benchmark_wording_available_to_author: boolean;
    private_benchmark_wording_available_to_independent_reviewer: boolean;
    distinctive_benchmark_wording_may_be_used_in_revision_instructions: boolean;
    weighted_score_minimum: number;
    calibration_status: "provisional_pending_owner_benchmark_scoring" | "calibrated";
    minimum_rating_each_criterion: number;
    exact_gate_rating: number;
    exact_gate_criterion_ids: string[];
    averaging_may_not_hide_a_weak_criterion: boolean;
    owner_approval_still_required: boolean;
  };
  rating_scale: Record<string, string>;
  evidence_policy: {
    allowed_prefixes: string[];
    required_path_groups_by_criterion: Record<string, string[][]>;
  };
  remediation_policy: {
    allowed_domains_by_criterion: Record<string, BenchmarkRevisionDomain[]>;
  };
  criteria: RubricCriterion[];
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function validateRubric(value: BenchmarkRubric): BenchmarkRubric {
  if (
    value.artifact !== "chapter_workup" ||
    value.stage !== "benchmark_comparison" ||
    !value.contract_version.trim() ||
    !value.benchmark_set_id.trim()
  ) {
    throw new Error("invalid Selah benchmark rubric identity");
  }
  if (value.criteria.length !== 13) throw new Error("benchmark rubric must contain 13 criteria");
  const ids = value.criteria.map((criterion) => criterion.id);
  if (new Set(ids).size !== ids.length) throw new Error("benchmark rubric criterion IDs must be unique");
  if (
    value.criteria.some(
      (criterion) =>
        !criterion.id.trim() ||
        !criterion.title.trim() ||
        !Number.isSafeInteger(criterion.weight) ||
        criterion.weight <= 0 ||
        !Number.isSafeInteger(criterion.minimum_evidence_paths) ||
        criterion.minimum_evidence_paths < 1,
    )
  ) {
    throw new Error("benchmark rubric contains an invalid criterion");
  }
  if (value.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) !== 100) {
    throw new Error("benchmark rubric weights must total 100");
  }
  if (
    value.policy.weighted_score_minimum !== 85 ||
    value.policy.minimum_rating_each_criterion !== 3 ||
    value.policy.exact_gate_rating !== 4 ||
    value.policy.owner_approval_still_required !== true ||
    value.policy.private_benchmark_wording_available_to_author !== false ||
    value.policy.distinctive_benchmark_wording_may_be_used_in_revision_instructions !== false
  ) {
    throw new Error("benchmark rubric safety policy changed without contract review");
  }
  const expectedExactGates = ["BMQ-06", "BMQ-12", "BMQ-13"];
  if (JSON.stringify(value.policy.exact_gate_criterion_ids) !== JSON.stringify(expectedExactGates)) {
    throw new Error("benchmark rubric exact gates changed without contract review");
  }
  if (
    !value.evidence_policy.allowed_prefixes.length ||
    Object.keys(value.evidence_policy.required_path_groups_by_criterion).length !== ids.length ||
    ids.some(
      (id) =>
        !value.evidence_policy.required_path_groups_by_criterion[id]?.length ||
        value.evidence_policy.required_path_groups_by_criterion[id].some(
          (group) => !group.length || group.some((prefix) => !prefix.trim()),
        ),
    )
  ) {
    throw new Error("benchmark rubric evidence policy is incomplete");
  }
  if (
    Object.keys(value.remediation_policy.allowed_domains_by_criterion).length !== ids.length ||
    ids.some(
      (id) =>
        !value.remediation_policy.allowed_domains_by_criterion[id]?.length ||
        value.remediation_policy.allowed_domains_by_criterion[id].some(
          (domain) => !["workup", "manifest", "review_process", "regenerate_clean"].includes(domain),
        ),
    )
  ) {
    throw new Error("benchmark rubric remediation policy is incomplete");
  }
  return value;
}

const rubric = deepFreeze(
  validateRubric(structuredClone(rubricJson) as BenchmarkRubric),
);

export const SELAH_BENCHMARK_RUBRIC_VERSION = rubric.contract_version;
export const SELAH_BENCHMARK_RUBRIC_DIGEST = sha256Canonical(rubric);
export const SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST = sha256Canonical({
  evidence: rubric.evidence_policy,
  remediation: rubric.remediation_policy,
});
export const SELAH_BENCHMARK_SET_ID = rubric.benchmark_set_id;

export type BenchmarkComparisonMode =
  | "same_chapter_private_benchmark"
  | "cross_chapter_quality_only";
export type BenchmarkReviewerKind = "owner" | "human_editor" | "independent_model";
export type BenchmarkCriterionRating = 0 | 1 | 2 | 3 | 4;
export type BenchmarkRevisionDomain =
  | "workup"
  | "manifest"
  | "review_process"
  | "regenerate_clean";

const MARK_SPRINT_SUBJECTS: Record<
  string,
  { book: "Mark"; chapter: number; comparisonMode: BenchmarkComparisonMode }
> = {
  "mark-8": { book: "Mark", chapter: 8, comparisonMode: "same_chapter_private_benchmark" },
  "mark-9": { book: "Mark", chapter: 9, comparisonMode: "same_chapter_private_benchmark" },
  "mark-10": { book: "Mark", chapter: 10, comparisonMode: "same_chapter_private_benchmark" },
  "mark-11": { book: "Mark", chapter: 11, comparisonMode: "cross_chapter_quality_only" },
};

export type BenchmarkReviewFinding = {
  code: string;
  path: string;
  message: string;
};

export interface BenchmarkReviewRequirementsV1 {
  artifact: "chapter_workup";
  stage: "benchmark_comparison";
  subject: { slug: string; book: string; chapter: number };
  prerequisites: {
    generationManifestReady: boolean;
    generationManifestDigest: string;
    generationManifestBindingDigest: string;
    structuralMachineVerdict: "pass" | "block";
    structuralReportDigest: string;
    structuralBindingDigest: string;
    sourceOverlapMachineVerdict: "pass" | "block";
    sourceOverlapReportDigest: string;
    sourceOverlapBindingDigest: string;
    freshnessMachineVerdict: "pass" | "block";
    freshnessReportDigest: string;
    freshnessBindingDigest: string;
    approvedVoiceExampleDigest: string;
    draftDigest: string;
  };
  benchmark: {
    setId: string;
    setDigest: string;
    comparisonMode: BenchmarkComparisonMode;
    approval: {
      recordId: string;
      approvedBy: string;
      approvedAt: string;
      evidenceDigest: string;
    };
    rubricVersion: string;
    rubricDigest: string;
  };
  reviewerAssignment: {
    kind: BenchmarkReviewerKind;
    id: string;
    version: string;
    independentFromAuthor: boolean;
    evidenceDigest: string;
  };
  reviewValidation: {
    reviewContentDigest: string;
    artifactRegistryDigest: string;
    resolverVersion: string;
    evidenceResolutionVerdict: "pass" | "block";
    evidenceResolutionReportDigest: string;
    evidenceResolutionBindingDigest: string;
    remediationResolutionVerdict: "pass" | "block";
    remediationResolutionReportDigest: string;
    remediationResolutionBindingDigest: string;
    privacyScanVerdict: "pass" | "block";
    privacyScanReportDigest: string;
    privacyScanBindingDigest: string;
  };
}

export interface BenchmarkReviewSubmissionV1 {
  artifact: "chapter_workup";
  stage: "benchmark_comparison";
  subject: BenchmarkReviewRequirementsV1["subject"];
  prerequisites: {
    generationManifestDigest: string;
    structuralReportDigest: string;
    sourceOverlapReportDigest: string;
    freshnessReportDigest: string;
    approvedVoiceExampleDigest: string;
    draftDigest: string;
  };
  benchmark: {
    setId: string;
    setDigest: string;
    comparisonMode: BenchmarkComparisonMode;
    rubricVersion: string;
    rubricDigest: string;
  };
  reviewer: {
    kind: BenchmarkReviewerKind;
    id: string;
    version: string;
  };
  attestations: {
    comparedAgainstBenchmark: boolean;
    privateBenchmarkWordingWasUnavailableToAuthor: boolean;
    comparisonUsedPrivateBenchmarkOnlyAfterGeneration: boolean;
    reviewArtifactContainsNoPrivateBenchmarkWording: boolean;
    revisionInstructionsContainNoPrivateBenchmarkWording: boolean;
  };
  criteria: Array<{
    id: string;
    rating: BenchmarkCriterionRating;
    rationale: string;
    evidencePaths: string[];
    revisionTargets: Array<{
      domain: BenchmarkRevisionDomain;
      path: string;
      instruction: string;
    }>;
  }>;
}

export interface TrustedBenchmarkReviewContextV1 {
  contextVersion: "selah-trusted-benchmark-review-context-v1";
  authorityPolicy: TrustedBenchmarkEvidenceAuthorityPolicyV1;
  authenticatedEvidence: AuthenticatedBenchmarkEvidenceV1;
  verificationTime: string;
  resolverVersion: string;
  privacyScannerVersion: string;
  author: {
    id: string;
    version: string;
  };
  currentState: BenchmarkEvidenceExpectationsV1["trustedCurrentState"];
}

export interface BenchmarkReviewReportV2 {
  reportVersion: "selah-benchmark-review-v2";
  artifact: "chapter_workup";
  stage: "benchmark_comparison";
  slug: string;
  requirementsDigest: string;
  submissionDigest: string;
  reviewContentDigest: string;
  reviewDigest: string;
  generationManifestDigest: string;
  structuralReportDigest: string;
  sourceOverlapReportDigest: string;
  freshnessReportDigest: string;
  draftDigest: string;
  benchmarkSetDigest: string;
  artifactRegistryDigest: string;
  resolverVersion: string;
  evidenceResolutionReportDigest: string;
  remediationResolutionReportDigest: string;
  privacyScanReportDigest: string;
  rubricVersion: string;
  rubricDigest: string;
  benchmarkSetId: string;
  calibrationStatus: BenchmarkRubric["policy"]["calibration_status"];
  weightedScore: number | null;
  weightedScoreMinimum: number;
  machineVerdict: "pass" | "block";
  qualityVerdict: "benchmark_ready" | "targeted_revision" | "block";
  overallStatus: "blocked" | "targeted_revision" | "needs_owner_review";
  contentMachineVerdict: "pass" | "block";
  contentReadyForOwnerReview: boolean;
  authenticatedEvidenceReady: boolean;
  authenticatedEvidenceBundleDigest: string;
  evidenceAuthorityPolicyId: string;
  evidenceApprovalKeyId: string;
  evidenceAssignmentKeyId: string;
  evidenceValidationKeyId: string;
  verificationTime: string;
  readyForOwnerReview: boolean;
  reviewSnapshotAvailable: boolean;
  blockingCriterionIds: string[];
  revisionCriterionIds: string[];
  criteria: BenchmarkReviewSubmissionV1["criteria"];
  findings: BenchmarkReviewFinding[];
}

const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_SLUG = /^mark-(?:8|9|10|11)$/;
const SAFE_RESOLVER_VERSION = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SAFE_ARTIFACT_PATH = /^[A-Za-z][A-Za-z0-9-]*:\/[A-Za-z0-9_./~:-]+$/;
const REVIEWER_KINDS = new Set<BenchmarkReviewerKind>([
  "owner",
  "human_editor",
  "independent_model",
]);
const REVISION_DOMAINS = new Set<BenchmarkRevisionDomain>([
  "workup",
  "manifest",
  "review_process",
  "regenerate_clean",
]);
const MAX_RATIONALE = 2_000;
const MAX_EVIDENCE_PATHS = 12;
const MAX_EVIDENCE_PATH_LENGTH = 300;
const MAX_REVISION_TARGETS = 8;
const MAX_REVISION_INSTRUCTION = 1_000;

function assertPlainRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid benchmark review object at ${path}`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`invalid benchmark review object at ${path}`);
  }
}

function assertExactKeys(value: Record<string, unknown>, path: string, allowed: readonly string[]): void {
  const allow = new Set(allowed);
  if (
    Object.keys(value).some((key) => !allow.has(key)) ||
    allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error(`unsupported benchmark review field at ${path}`);
  }
}

function assertDenseArray(
  value: unknown,
  path: string,
  maximumLength?: number,
): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`invalid benchmark review array at ${path}`);
  if (maximumLength !== undefined && value.length > maximumLength) {
    throw new Error(`benchmark review ${path} exceeds maximum`);
  }
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) throw new Error(`sparse benchmark review array at ${path}`);
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`invalid benchmark review string at ${path}`);
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid benchmark review number at ${path}`);
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`invalid benchmark review boolean at ${path}`);
}

function assertRuntimeShape(
  requirements: BenchmarkReviewRequirementsV1,
  submission: BenchmarkReviewSubmissionV1,
): void {
  assertPlainRecord(requirements, "requirements");
  assertExactKeys(requirements, "requirements", [
    "artifact",
    "stage",
    "subject",
    "prerequisites",
    "benchmark",
    "reviewerAssignment",
    "reviewValidation",
  ]);
  assertString(requirements.artifact, "requirements.artifact");
  assertString(requirements.stage, "requirements.stage");
  assertPlainRecord(requirements.subject, "requirements.subject");
  assertExactKeys(requirements.subject, "requirements.subject", ["slug", "book", "chapter"]);
  assertString(requirements.subject.slug, "requirements.subject.slug");
  assertString(requirements.subject.book, "requirements.subject.book");
  assertNumber(requirements.subject.chapter, "requirements.subject.chapter");
  assertPlainRecord(requirements.prerequisites, "requirements.prerequisites");
  assertExactKeys(requirements.prerequisites, "requirements.prerequisites", [
    "generationManifestReady",
    "generationManifestDigest",
    "generationManifestBindingDigest",
    "structuralMachineVerdict",
    "structuralReportDigest",
    "structuralBindingDigest",
    "sourceOverlapMachineVerdict",
    "sourceOverlapReportDigest",
    "sourceOverlapBindingDigest",
    "freshnessMachineVerdict",
    "freshnessReportDigest",
    "freshnessBindingDigest",
    "approvedVoiceExampleDigest",
    "draftDigest",
  ]);
  assertBoolean(
    requirements.prerequisites.generationManifestReady,
    "requirements.prerequisites.generationManifestReady",
  );
  for (const key of [
    "generationManifestDigest",
    "generationManifestBindingDigest",
    "structuralMachineVerdict",
    "structuralReportDigest",
    "structuralBindingDigest",
    "sourceOverlapMachineVerdict",
    "sourceOverlapReportDigest",
    "sourceOverlapBindingDigest",
    "freshnessMachineVerdict",
    "freshnessReportDigest",
    "freshnessBindingDigest",
    "approvedVoiceExampleDigest",
    "draftDigest",
  ] as const) {
    assertString(requirements.prerequisites[key], `requirements.prerequisites.${key}`);
  }
  assertPlainRecord(requirements.benchmark, "requirements.benchmark");
  assertExactKeys(requirements.benchmark, "requirements.benchmark", [
    "setId",
    "setDigest",
    "comparisonMode",
    "approval",
    "rubricVersion",
    "rubricDigest",
  ]);
  for (const key of ["setId", "setDigest", "comparisonMode", "rubricVersion", "rubricDigest"] as const) {
    assertString(requirements.benchmark[key], `requirements.benchmark.${key}`);
  }
  assertPlainRecord(requirements.benchmark.approval, "requirements.benchmark.approval");
  assertExactKeys(requirements.benchmark.approval, "requirements.benchmark.approval", [
    "recordId",
    "approvedBy",
    "approvedAt",
    "evidenceDigest",
  ]);
  for (const key of ["recordId", "approvedBy", "approvedAt", "evidenceDigest"] as const) {
    assertString(requirements.benchmark.approval[key], `requirements.benchmark.approval.${key}`);
  }
  assertPlainRecord(requirements.reviewerAssignment, "requirements.reviewerAssignment");
  assertExactKeys(requirements.reviewerAssignment, "requirements.reviewerAssignment", [
    "kind",
    "id",
    "version",
    "independentFromAuthor",
    "evidenceDigest",
  ]);
  for (const key of ["kind", "id", "version", "evidenceDigest"] as const) {
    assertString(requirements.reviewerAssignment[key], `requirements.reviewerAssignment.${key}`);
  }
  assertBoolean(
    requirements.reviewerAssignment.independentFromAuthor,
    "requirements.reviewerAssignment.independentFromAuthor",
  );
  assertPlainRecord(requirements.reviewValidation, "requirements.reviewValidation");
  assertExactKeys(requirements.reviewValidation, "requirements.reviewValidation", [
    "reviewContentDigest",
    "artifactRegistryDigest",
    "resolverVersion",
    "evidenceResolutionVerdict",
    "evidenceResolutionReportDigest",
    "evidenceResolutionBindingDigest",
    "remediationResolutionVerdict",
    "remediationResolutionReportDigest",
    "remediationResolutionBindingDigest",
    "privacyScanVerdict",
    "privacyScanReportDigest",
    "privacyScanBindingDigest",
  ]);
  for (const key of Object.keys(requirements.reviewValidation) as Array<keyof typeof requirements.reviewValidation>) {
    assertString(requirements.reviewValidation[key], `requirements.reviewValidation.${key}`);
  }

  assertPlainRecord(submission, "submission");
  assertExactKeys(submission, "submission", [
    "artifact",
    "stage",
    "subject",
    "prerequisites",
    "benchmark",
    "reviewer",
    "attestations",
    "criteria",
  ]);
  assertString(submission.artifact, "submission.artifact");
  assertString(submission.stage, "submission.stage");
  assertPlainRecord(submission.subject, "submission.subject");
  assertExactKeys(submission.subject, "submission.subject", ["slug", "book", "chapter"]);
  assertString(submission.subject.slug, "submission.subject.slug");
  assertString(submission.subject.book, "submission.subject.book");
  assertNumber(submission.subject.chapter, "submission.subject.chapter");
  assertPlainRecord(submission.prerequisites, "submission.prerequisites");
  assertExactKeys(submission.prerequisites, "submission.prerequisites", [
    "generationManifestDigest",
    "structuralReportDigest",
    "sourceOverlapReportDigest",
    "freshnessReportDigest",
    "approvedVoiceExampleDigest",
    "draftDigest",
  ]);
  for (const key of Object.keys(submission.prerequisites) as Array<keyof typeof submission.prerequisites>) {
    assertString(submission.prerequisites[key], `submission.prerequisites.${key}`);
  }
  assertPlainRecord(submission.benchmark, "submission.benchmark");
  assertExactKeys(submission.benchmark, "submission.benchmark", [
    "setId",
    "setDigest",
    "comparisonMode",
    "rubricVersion",
    "rubricDigest",
  ]);
  for (const key of Object.keys(submission.benchmark) as Array<keyof typeof submission.benchmark>) {
    assertString(submission.benchmark[key], `submission.benchmark.${key}`);
  }
  assertPlainRecord(submission.reviewer, "submission.reviewer");
  assertExactKeys(submission.reviewer, "submission.reviewer", ["kind", "id", "version"]);
  for (const key of Object.keys(submission.reviewer) as Array<keyof typeof submission.reviewer>) {
    assertString(submission.reviewer[key], `submission.reviewer.${key}`);
  }
  assertPlainRecord(submission.attestations, "submission.attestations");
  assertExactKeys(submission.attestations, "submission.attestations", [
    "comparedAgainstBenchmark",
    "privateBenchmarkWordingWasUnavailableToAuthor",
    "comparisonUsedPrivateBenchmarkOnlyAfterGeneration",
    "reviewArtifactContainsNoPrivateBenchmarkWording",
    "revisionInstructionsContainNoPrivateBenchmarkWording",
  ]);
  for (const key of Object.keys(submission.attestations) as Array<keyof typeof submission.attestations>) {
    assertBoolean(submission.attestations[key], `submission.attestations.${key}`);
  }
  assertDenseArray(submission.criteria, "criteria", rubric.criteria.length);
  submission.criteria.forEach((criterion, index) => {
    assertPlainRecord(criterion, `submission.criteria[${index}]`);
    assertExactKeys(criterion, `submission.criteria[${index}]`, [
      "id",
      "rating",
      "rationale",
      "evidencePaths",
      "revisionTargets",
    ]);
    assertString(criterion.id, `submission.criteria[${index}].id`);
    assertNumber(criterion.rating, `submission.criteria[${index}].rating`);
    assertString(criterion.rationale, `submission.criteria[${index}].rationale`);
    assertDenseArray(
      criterion.evidencePaths,
      `evidence paths at submission.criteria[${index}]`,
      MAX_EVIDENCE_PATHS,
    );
    criterion.evidencePaths.forEach((path, pathIndex) =>
      assertString(path, `submission.criteria[${index}].evidencePaths[${pathIndex}]`),
    );
    assertDenseArray(
      criterion.revisionTargets,
      `revision targets at submission.criteria[${index}]`,
      MAX_REVISION_TARGETS,
    );
    criterion.revisionTargets.forEach((target, targetIndex) => {
      assertPlainRecord(target, `submission.criteria[${index}].revisionTargets[${targetIndex}]`);
      assertExactKeys(target, `submission.criteria[${index}].revisionTargets[${targetIndex}]`, [
        "domain",
        "path",
        "instruction",
      ]);
      assertString(target.domain, `submission.criteria[${index}].revisionTargets[${targetIndex}].domain`);
      assertString(target.path, `submission.criteria[${index}].revisionTargets[${targetIndex}].path`);
      assertString(
        target.instruction,
        `submission.criteria[${index}].revisionTargets[${targetIndex}].instruction`,
      );
    });
  });
}

function assertTrustedContextShape(value: TrustedBenchmarkReviewContextV1): void {
  assertPlainRecord(value, "trustedContext");
  assertExactKeys(value, "trustedContext", [
    "contextVersion",
    "authorityPolicy",
    "authenticatedEvidence",
    "verificationTime",
    "resolverVersion",
    "privacyScannerVersion",
    "author",
    "currentState",
  ]);
  if (value.contextVersion !== "selah-trusted-benchmark-review-context-v1") {
    throw new Error("invalid trusted benchmark review context version");
  }
  for (const key of ["verificationTime", "resolverVersion", "privacyScannerVersion"] as const) {
    assertString(value[key], `trustedContext.${key}`);
  }
  if (
    Number.isNaN(Date.parse(value.verificationTime)) ||
    !SAFE_RESOLVER_VERSION.test(value.resolverVersion) ||
    !SAFE_RESOLVER_VERSION.test(value.privacyScannerVersion)
  ) {
    throw new Error("invalid trusted benchmark review context identity");
  }
  assertPlainRecord(value.authorityPolicy, "trustedContext.authorityPolicy");
  assertPlainRecord(value.authenticatedEvidence, "trustedContext.authenticatedEvidence");
  assertPlainRecord(value.author, "trustedContext.author");
  assertExactKeys(value.author, "trustedContext.author", ["id", "version"]);
  assertString(value.author.id, "trustedContext.author.id");
  assertString(value.author.version, "trustedContext.author.version");
  if (!value.author.id.trim() || !value.author.version.trim()) {
    throw new Error("invalid trusted benchmark author identity");
  }
  assertPlainRecord(value.currentState, "trustedContext.currentState");
}

function projectRequirements(
  requirements: BenchmarkReviewRequirementsV1,
): BenchmarkReviewRequirementsV1 {
  return {
    artifact: requirements.artifact,
    stage: requirements.stage,
    subject: { ...requirements.subject },
    prerequisites: { ...requirements.prerequisites },
    benchmark: {
      setId: requirements.benchmark.setId,
      setDigest: requirements.benchmark.setDigest,
      comparisonMode: requirements.benchmark.comparisonMode,
      approval: { ...requirements.benchmark.approval },
      rubricVersion: requirements.benchmark.rubricVersion,
      rubricDigest: requirements.benchmark.rubricDigest,
    },
    reviewerAssignment: { ...requirements.reviewerAssignment },
    reviewValidation: { ...requirements.reviewValidation },
  };
}

function projectSubmission(
  submission: BenchmarkReviewSubmissionV1,
): BenchmarkReviewSubmissionV1 {
  return {
    artifact: submission.artifact,
    stage: submission.stage,
    subject: { ...submission.subject },
    prerequisites: { ...submission.prerequisites },
    benchmark: { ...submission.benchmark },
    reviewer: { ...submission.reviewer },
    attestations: { ...submission.attestations },
    criteria: submission.criteria.map((criterion) => ({
      id: criterion.id,
      rating: criterion.rating,
      rationale: criterion.rationale,
      evidencePaths: [...criterion.evidencePaths],
      revisionTargets: criterion.revisionTargets.map((target) => ({ ...target })),
    })),
  };
}

function projectReviewContent(submission: BenchmarkReviewSubmissionV1): unknown {
  return {
    reviewer: { ...submission.reviewer },
    attestations: { ...submission.attestations },
    criteria: submission.criteria.map((criterion) => ({
      id: criterion.id,
      rating: criterion.rating,
      rationale: criterion.rationale,
      evidencePaths: [...criterion.evidencePaths],
      revisionTargets: criterion.revisionTargets.map((target) => ({ ...target })),
    })),
  };
}

/** Content identity only. Authentication requires the owner-approval signed receipt. */
export function benchmarkApprovalEvidenceDigest(input: {
  setId: string;
  setDigest: string;
  recordId: string;
  approvedBy: string;
  approvedAt: string;
}): string {
  return sha256Canonical({ type: "benchmark-set-approval-v1", ...input });
}

/** Content identity only. Authentication requires the role-scoped signed receipt. */
export function reviewerAssignmentEvidenceDigest(input: {
  kind: BenchmarkReviewerKind;
  id: string;
  version: string;
  independentFromAuthor: boolean;
  subject: { slug: string; book: string; chapter: number };
  draftDigest: string;
  generationManifestDigest: string;
  benchmarkSetDigest: string;
  comparisonMode: BenchmarkComparisonMode;
}): string {
  return sha256Canonical({ type: "benchmark-reviewer-assignment-v1", ...input });
}

export function sourceOverlapBindingDigest(input: {
  draftDigest: string;
  generationManifestDigest: string;
  sourceOverlapReportDigest: string;
  sourceOverlapMachineVerdict: "pass" | "block";
}): string {
  return sha256Canonical({ type: "source-overlap-binding-v1", ...input });
}

export function generationManifestBindingDigest(input: {
  generationManifestDigest: string;
  generationManifestReady: boolean;
}): string {
  return sha256Canonical({ type: "generation-manifest-readiness-binding-v1", ...input });
}

export function structuralBindingDigest(input: {
  draftDigest: string;
  structuralReportDigest: string;
  structuralMachineVerdict: "pass" | "block";
}): string {
  return sha256Canonical({ type: "structural-review-binding-v1", ...input });
}

export function freshnessBindingDigest(input: {
  draftDigest: string;
  benchmarkSetDigest: string;
  approvedVoiceExampleDigest: string;
  freshnessReportDigest: string;
  comparisonMode: BenchmarkComparisonMode;
  freshnessMachineVerdict: "pass" | "block";
}): string {
  return sha256Canonical({ type: "freshness-binding-v1", ...input });
}

export function benchmarkReviewContentDigest(
  submission: BenchmarkReviewSubmissionV1,
): string {
  return sha256Canonical(projectReviewContent(submission));
}

export function evidenceResolutionBindingDigest(input: {
  draftDigest: string;
  reviewContentDigest: string;
  artifactRegistryDigest: string;
  rubricDigest: string;
  evidencePolicyDigest: string;
  resolverVersion: string;
  evidenceResolutionReportDigest: string;
  evidenceResolutionVerdict: "pass" | "block";
}): string {
  return sha256Canonical({ type: "benchmark-evidence-resolution-binding-v1", ...input });
}

export function remediationResolutionBindingDigest(input: {
  draftDigest: string;
  reviewContentDigest: string;
  artifactRegistryDigest: string;
  rubricDigest: string;
  evidencePolicyDigest: string;
  resolverVersion: string;
  remediationResolutionReportDigest: string;
  remediationResolutionVerdict: "pass" | "block";
}): string {
  return sha256Canonical({ type: "benchmark-remediation-resolution-binding-v1", ...input });
}

export function privacyScanBindingDigest(input: {
  reviewContentDigest: string;
  benchmarkSetDigest: string;
  approvedVoiceExampleDigest: string;
  privacyScanReportDigest: string;
  privacyScanVerdict: "pass" | "block";
}): string {
  return sha256Canonical({ type: "benchmark-review-privacy-binding-v1", ...input });
}

function stableFindings(findings: BenchmarkReviewFinding[]): BenchmarkReviewFinding[] {
  return [...findings].sort(
    (a, b) => a.code.localeCompare(b.code) || a.path.localeCompare(b.path),
  );
}

function safeDigest(value: string): string {
  return DIGEST.test(value) ? value : "invalid-digest";
}

export function getSelahBenchmarkRubric(): BenchmarkRubric {
  return structuredClone(rubric);
}

export function evaluateSelahBenchmarkReview(
  requirements: BenchmarkReviewRequirementsV1,
  submission: BenchmarkReviewSubmissionV1,
  trustedContext: TrustedBenchmarkReviewContextV1,
): BenchmarkReviewReportV2 {
  assertRuntimeShape(requirements, submission);
  assertTrustedContextShape(trustedContext);
  const findings: BenchmarkReviewFinding[] = [];
  const add = (code: string, path: string, message: string) =>
    findings.push({ code, path, message });
  const same = (path: string, expected: unknown, actual: unknown) => {
    if (expected !== actual) add("IDENTITY_MISMATCH", path, `${path} does not match the bound artifact`);
  };
  const digest = (path: string, expected: string, actual: string) => {
    if (!DIGEST.test(expected) || !DIGEST.test(actual)) {
      add("INVALID_DIGEST", path, `${path} must use a lowercase SHA-256 digest`);
    } else if (expected !== actual) {
      add("DIGEST_MISMATCH", path, `${path} does not match the bound artifact digest`);
    }
  };
  const digestShape = (path: string, value: string) => {
    if (!DIGEST.test(value)) {
      add("INVALID_DIGEST", path, `${path} must use a lowercase SHA-256 digest`);
    }
  };

  same("requirements.artifact", "chapter_workup", requirements.artifact);
  same("requirements.stage", "benchmark_comparison", requirements.stage);
  same("submission.artifact", requirements.artifact, submission.artifact);
  same("submission.stage", requirements.stage, submission.stage);
  same("subject.slug", requirements.subject.slug, submission.subject.slug);
  same("subject.book", requirements.subject.book, submission.subject.book);
  same("subject.chapter", requirements.subject.chapter, submission.subject.chapter);

  const expectedSubject = MARK_SPRINT_SUBJECTS[requirements.subject.slug];
  const subjectIsValid =
    SAFE_SLUG.test(requirements.subject.slug) &&
    expectedSubject !== undefined &&
    requirements.subject.book === expectedSubject.book &&
    requirements.subject.chapter === expectedSubject.chapter;
  if (!subjectIsValid) {
    add(
      "INVALID_SUBJECT_IDENTITY",
      "requirements.subject",
      "This contract accepts only the exact Mark 8–11 sprint subject identities",
    );
  }

  if (requirements.prerequisites.generationManifestReady !== true) {
    add(
      "PREREQUISITE_NOT_READY",
      "requirements.prerequisites.generationManifestReady",
      "The server-verified generation manifest is not ready",
    );
  }
  for (const [key, verdict, message] of [
    [
      "structuralMachineVerdict",
      requirements.prerequisites.structuralMachineVerdict,
      "Structural copy QA must pass before benchmark review",
    ],
    [
      "sourceOverlapMachineVerdict",
      requirements.prerequisites.sourceOverlapMachineVerdict,
      "The source/license overlap scan must pass before benchmark review",
    ],
    [
      "freshnessMachineVerdict",
      requirements.prerequisites.freshnessMachineVerdict,
      "The draft freshness scan must pass before benchmark review",
    ],
  ] as const) {
    if (verdict !== "pass") {
      add("PREREQUISITE_NOT_READY", `requirements.prerequisites.${key}`, message);
    }
  }

  digest(
    "prerequisites.generationManifestDigest",
    requirements.prerequisites.generationManifestDigest,
    submission.prerequisites.generationManifestDigest,
  );
  digest(
    "prerequisites.generationManifestBindingDigest",
    generationManifestBindingDigest({
      generationManifestDigest: requirements.prerequisites.generationManifestDigest,
      generationManifestReady: requirements.prerequisites.generationManifestReady,
    }),
    requirements.prerequisites.generationManifestBindingDigest,
  );
  digest(
    "prerequisites.structuralReportDigest",
    requirements.prerequisites.structuralReportDigest,
    submission.prerequisites.structuralReportDigest,
  );
  digest(
    "prerequisites.structuralBindingDigest",
    structuralBindingDigest({
      draftDigest: requirements.prerequisites.draftDigest,
      structuralReportDigest: requirements.prerequisites.structuralReportDigest,
      structuralMachineVerdict: requirements.prerequisites.structuralMachineVerdict,
    }),
    requirements.prerequisites.structuralBindingDigest,
  );
  digest(
    "prerequisites.sourceOverlapReportDigest",
    requirements.prerequisites.sourceOverlapReportDigest,
    submission.prerequisites.sourceOverlapReportDigest,
  );
  digest(
    "prerequisites.freshnessReportDigest",
    requirements.prerequisites.freshnessReportDigest,
    submission.prerequisites.freshnessReportDigest,
  );
  digest(
    "prerequisites.approvedVoiceExampleDigest",
    requirements.prerequisites.approvedVoiceExampleDigest,
    submission.prerequisites.approvedVoiceExampleDigest,
  );
  digest(
    "prerequisites.draftDigest",
    requirements.prerequisites.draftDigest,
    submission.prerequisites.draftDigest,
  );

  digest(
    "prerequisites.sourceOverlapBindingDigest",
    sourceOverlapBindingDigest({
      draftDigest: requirements.prerequisites.draftDigest,
      generationManifestDigest: requirements.prerequisites.generationManifestDigest,
      sourceOverlapReportDigest: requirements.prerequisites.sourceOverlapReportDigest,
      sourceOverlapMachineVerdict: requirements.prerequisites.sourceOverlapMachineVerdict,
    }),
    requirements.prerequisites.sourceOverlapBindingDigest,
  );

  same("requirements.benchmark.setId", SELAH_BENCHMARK_SET_ID, requirements.benchmark.setId);
  same("benchmark.setId", requirements.benchmark.setId, submission.benchmark.setId);
  digest("benchmark.setDigest", requirements.benchmark.setDigest, submission.benchmark.setDigest);
  same(
    "benchmark.comparisonMode",
    requirements.benchmark.comparisonMode,
    submission.benchmark.comparisonMode,
  );
  if (expectedSubject && requirements.benchmark.comparisonMode !== expectedSubject.comparisonMode) {
    add(
      "INVALID_COMPARISON_MODE",
      "requirements.benchmark.comparisonMode",
      "Comparison mode does not match the chapter's available benchmark provenance",
    );
  }
  same(
    "requirements.benchmark.rubricVersion",
    SELAH_BENCHMARK_RUBRIC_VERSION,
    requirements.benchmark.rubricVersion,
  );
  digest(
    "requirements.benchmark.rubricDigest",
    SELAH_BENCHMARK_RUBRIC_DIGEST,
    requirements.benchmark.rubricDigest,
  );
  same(
    "benchmark.rubricVersion",
    requirements.benchmark.rubricVersion,
    submission.benchmark.rubricVersion,
  );
  digest(
    "benchmark.rubricDigest",
    requirements.benchmark.rubricDigest,
    submission.benchmark.rubricDigest,
  );

  const approval = requirements.benchmark.approval;
  if (
    !approval.recordId.trim() ||
    !approval.approvedBy.trim() ||
    !approval.approvedAt.trim() ||
    Number.isNaN(Date.parse(approval.approvedAt))
  ) {
    add(
      "BENCHMARK_APPROVAL_INVALID",
      "requirements.benchmark.approval",
      "The benchmark set needs complete server-owned owner approval evidence",
    );
  }
  digest(
    "requirements.benchmark.approval.evidenceDigest",
    benchmarkApprovalEvidenceDigest({
      setId: requirements.benchmark.setId,
      setDigest: requirements.benchmark.setDigest,
      recordId: approval.recordId,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
    }),
    approval.evidenceDigest,
  );

  const assignment = requirements.reviewerAssignment;
  if (
    !REVIEWER_KINDS.has(assignment.kind) ||
    !assignment.id.trim() ||
    !assignment.version.trim() ||
    assignment.independentFromAuthor !== true
  ) {
    add(
      "REVIEWER_ASSIGNMENT_INVALID",
      "requirements.reviewerAssignment",
      "The reviewer must be authenticated, versioned, and independent from the author",
    );
  }
  digest(
    "requirements.reviewerAssignment.evidenceDigest",
    reviewerAssignmentEvidenceDigest({
      kind: assignment.kind,
      id: assignment.id,
      version: assignment.version,
      independentFromAuthor: assignment.independentFromAuthor,
      subject: requirements.subject,
      draftDigest: requirements.prerequisites.draftDigest,
      generationManifestDigest: requirements.prerequisites.generationManifestDigest,
      benchmarkSetDigest: requirements.benchmark.setDigest,
      comparisonMode: requirements.benchmark.comparisonMode,
    }),
    assignment.evidenceDigest,
  );
  same("reviewer.kind", assignment.kind, submission.reviewer.kind);
  same("reviewer.id", assignment.id, submission.reviewer.id);
  same("reviewer.version", assignment.version, submission.reviewer.version);

  digest(
    "prerequisites.freshnessBindingDigest",
    freshnessBindingDigest({
      draftDigest: requirements.prerequisites.draftDigest,
      benchmarkSetDigest: requirements.benchmark.setDigest,
      approvedVoiceExampleDigest: requirements.prerequisites.approvedVoiceExampleDigest,
      freshnessReportDigest: requirements.prerequisites.freshnessReportDigest,
      comparisonMode: requirements.benchmark.comparisonMode,
      freshnessMachineVerdict: requirements.prerequisites.freshnessMachineVerdict,
    }),
    requirements.prerequisites.freshnessBindingDigest,
  );

  const reviewContentDigest = benchmarkReviewContentDigest(submission);
  digest(
    "reviewValidation.reviewContentDigest",
    reviewContentDigest,
    requirements.reviewValidation.reviewContentDigest,
  );
  digestShape(
    "reviewValidation.artifactRegistryDigest",
    requirements.reviewValidation.artifactRegistryDigest,
  );
  if (!SAFE_RESOLVER_VERSION.test(requirements.reviewValidation.resolverVersion)) {
    add(
      "REVIEW_VALIDATION_BLOCKED",
      "requirements.reviewValidation.resolverVersion",
      "The evidence and remediation resolver version is invalid",
    );
  }
  for (const [key, verdict, message] of [
    [
      "evidenceResolutionVerdict",
      requirements.reviewValidation.evidenceResolutionVerdict,
      "Every evidence path must resolve against the bound artifact registry",
    ],
    [
      "remediationResolutionVerdict",
      requirements.reviewValidation.remediationResolutionVerdict,
      "Every remediation target must resolve and be appropriate for its criterion",
    ],
    [
      "privacyScanVerdict",
      requirements.reviewValidation.privacyScanVerdict,
      "Persisted review prose must pass private-benchmark and exemplar leakage checks",
    ],
  ] as const) {
    if (verdict !== "pass") {
      add("REVIEW_VALIDATION_BLOCKED", `requirements.reviewValidation.${key}`, message);
    }
  }
  digestShape(
    "reviewValidation.evidenceResolutionReportDigest",
    requirements.reviewValidation.evidenceResolutionReportDigest,
  );
  digest(
    "reviewValidation.evidenceResolutionBindingDigest",
    evidenceResolutionBindingDigest({
      draftDigest: requirements.prerequisites.draftDigest,
      reviewContentDigest,
      artifactRegistryDigest: requirements.reviewValidation.artifactRegistryDigest,
      rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
      evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
      resolverVersion: requirements.reviewValidation.resolverVersion,
      evidenceResolutionReportDigest: requirements.reviewValidation.evidenceResolutionReportDigest,
      evidenceResolutionVerdict: requirements.reviewValidation.evidenceResolutionVerdict,
    }),
    requirements.reviewValidation.evidenceResolutionBindingDigest,
  );
  digestShape(
    "reviewValidation.remediationResolutionReportDigest",
    requirements.reviewValidation.remediationResolutionReportDigest,
  );
  digest(
    "reviewValidation.remediationResolutionBindingDigest",
    remediationResolutionBindingDigest({
      draftDigest: requirements.prerequisites.draftDigest,
      reviewContentDigest,
      artifactRegistryDigest: requirements.reviewValidation.artifactRegistryDigest,
      rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
      evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
      resolverVersion: requirements.reviewValidation.resolverVersion,
      remediationResolutionReportDigest:
        requirements.reviewValidation.remediationResolutionReportDigest,
      remediationResolutionVerdict: requirements.reviewValidation.remediationResolutionVerdict,
    }),
    requirements.reviewValidation.remediationResolutionBindingDigest,
  );
  digestShape(
    "reviewValidation.privacyScanReportDigest",
    requirements.reviewValidation.privacyScanReportDigest,
  );
  digest(
    "reviewValidation.privacyScanBindingDigest",
    privacyScanBindingDigest({
      reviewContentDigest,
      benchmarkSetDigest: requirements.benchmark.setDigest,
      approvedVoiceExampleDigest: requirements.prerequisites.approvedVoiceExampleDigest,
      privacyScanReportDigest: requirements.reviewValidation.privacyScanReportDigest,
      privacyScanVerdict: requirements.reviewValidation.privacyScanVerdict,
    }),
    requirements.reviewValidation.privacyScanBindingDigest,
  );

  for (const [key, value] of Object.entries(submission.attestations)) {
    if (value !== true) {
      add(
        "REVIEW_POLICY_NOT_ATTESTED",
        `submission.attestations.${key}`,
        "A required benchmark privacy or comparison attestation is missing",
      );
    }
  }

  if (submission.criteria.length !== rubric.criteria.length) {
    add(
      "CRITERION_COUNT_MISMATCH",
      "submission.criteria",
      `Expected exactly ${rubric.criteria.length} ordered rubric criteria`,
    );
  }
  const seenCriterionIds = new Set<string>();
  const seenRevisionTargetsAcrossReview = new Set<string>();
  submission.criteria.forEach((criterion, index) => {
    const expected = rubric.criteria[index];
    if (seenCriterionIds.has(criterion.id)) {
      add("DUPLICATE_CRITERION", `submission.criteria[${index}].id`, "Criterion IDs must be unique");
    }
    seenCriterionIds.add(criterion.id);
    if (!expected || criterion.id !== expected.id) {
      add(
        "CRITERION_ORDER_MISMATCH",
        `submission.criteria[${index}].id`,
        `Expected ${expected?.id ?? "no criterion"} at this position`,
      );
    }
    if (!Number.isInteger(criterion.rating) || criterion.rating < 0 || criterion.rating > 4) {
      add(
        "INVALID_RATING",
        `submission.criteria[${index}].rating`,
        "Criterion rating must be an integer from 0 through 4",
      );
    }
    const rationaleLength = criterion.rationale.trim().length;
    if (rationaleLength < 80 || rationaleLength > MAX_RATIONALE) {
      add(
        "INVALID_RATIONALE",
        `submission.criteria[${index}].rationale`,
        `Each rationale must contain 80–${MAX_RATIONALE} characters`,
      );
    }
    const minimumEvidence = expected?.minimum_evidence_paths ?? 1;
    if (
      criterion.evidencePaths.length < minimumEvidence ||
      criterion.evidencePaths.length > MAX_EVIDENCE_PATHS
    ) {
      add(
        "INVALID_EVIDENCE_COUNT",
        `submission.criteria[${index}].evidencePaths`,
        `This criterion needs ${minimumEvidence}–${MAX_EVIDENCE_PATHS} evidence paths`,
      );
    }
    const uniqueEvidence = new Set(criterion.evidencePaths);
    if (
      uniqueEvidence.size !== criterion.evidencePaths.length ||
      criterion.evidencePaths.some(
        (path) =>
          !path.trim() ||
          path.length > MAX_EVIDENCE_PATH_LENGTH ||
          !SAFE_ARTIFACT_PATH.test(path) ||
          !rubric.evidence_policy.allowed_prefixes.some((prefix) => path.startsWith(prefix)),
      )
    ) {
      add(
        "INVALID_EVIDENCE_PATH",
        `submission.criteria[${index}].evidencePaths`,
        "Evidence paths must be unique, bounded, and use an approved evidence namespace",
      );
    }
    for (const group of rubric.evidence_policy.required_path_groups_by_criterion[criterion.id] ?? []) {
      if (!criterion.evidencePaths.some((path) => group.some((prefix) => path.startsWith(prefix)))) {
        add(
          "MISSING_CRITERION_EVIDENCE",
          `submission.criteria[${index}].evidencePaths`,
          "This criterion is missing a required evidence family",
        );
      }
    }
    if (criterion.revisionTargets.length > MAX_REVISION_TARGETS) {
      add(
        "TOO_MANY_REVISION_TARGETS",
        `submission.criteria[${index}].revisionTargets`,
        `A criterion may contain at most ${MAX_REVISION_TARGETS} revision targets`,
      );
    }
    if (criterion.rating <= 2 && criterion.revisionTargets.length === 0) {
      add(
        "MISSING_REVISION_TARGET",
        `submission.criteria[${index}].revisionTargets`,
        "Ratings below 3 require at least one targeted remediation",
      );
    }
    if (criterion.rating === 4 && criterion.revisionTargets.length > 0) {
      add(
        "UNEXPECTED_REVISION_TARGET",
        `submission.criteria[${index}].revisionTargets`,
        "A benchmark-level rating cannot also request remediation",
      );
    }
    const seenTargets = new Set<string>();
    criterion.revisionTargets.forEach((target, targetIndex) => {
      const targetPath = `submission.criteria[${index}].revisionTargets[${targetIndex}]`;
      if (!REVISION_DOMAINS.has(target.domain)) {
        add("INVALID_REVISION_DOMAIN", `${targetPath}.domain`, "Revision domain is unsupported");
      }
      if (
        expected &&
        !rubric.remediation_policy.allowed_domains_by_criterion[expected.id].includes(target.domain)
      ) {
        add(
          "INVALID_REVISION_DOMAIN",
          `${targetPath}.domain`,
          "Remediation domain is not allowed for this rubric criterion",
        );
      }
      const expectedPrefix: Record<BenchmarkRevisionDomain, string> = {
        workup: "workup:/",
        manifest: "manifest:/",
        review_process: "review:/",
        regenerate_clean: "generation:/clean-run",
      };
      const prefix = expectedPrefix[target.domain];
      const pathMatchesDomain =
        target.domain === "regenerate_clean"
          ? target.path === prefix
          : target.path.startsWith(prefix) && target.path.length > prefix.length;
      if (
        !pathMatchesDomain ||
        target.path.length > MAX_EVIDENCE_PATH_LENGTH ||
        !SAFE_ARTIFACT_PATH.test(target.path)
      ) {
        add(
          "INVALID_REVISION_TARGET",
          `${targetPath}.path`,
          "Revision target does not match its remediation domain",
        );
      }
      const targetIdentity = `${target.domain}:${target.path}`;
      if (seenTargets.has(targetIdentity)) {
        add("INVALID_REVISION_TARGET", `${targetPath}.path`, "Revision targets must be unique per criterion");
      }
      seenTargets.add(targetIdentity);
      if (seenRevisionTargetsAcrossReview.has(targetIdentity)) {
        add(
          "DUPLICATE_REVISION_TARGET",
          `${targetPath}.path`,
          "The same remediation target cannot be reused across rubric criteria",
        );
      }
      seenRevisionTargetsAcrossReview.add(targetIdentity);
      const instructionLength = target.instruction.trim().length;
      if (instructionLength < 40 || instructionLength > MAX_REVISION_INSTRUCTION) {
        add(
          "INVALID_REVISION_TARGET",
          `${targetPath}.instruction`,
          `Revision instructions must contain 40–${MAX_REVISION_INSTRUCTION} characters`,
        );
      }
    });
  });

  const criteriaAreAligned =
    submission.criteria.length === rubric.criteria.length &&
    submission.criteria.every(
      (criterion, index) =>
        criterion.id === rubric.criteria[index].id &&
        Number.isInteger(criterion.rating) &&
        criterion.rating >= 0 &&
        criterion.rating <= 4,
    );
  if (criteriaAreAligned) {
    const currentScore = rubric.criteria.reduce(
      (total, criterion, index) =>
        total + criterion.weight * (submission.criteria[index].rating / 4),
      0,
    );
    for (const exactGateId of rubric.policy.exact_gate_criterion_ids) {
      const criterion = submission.criteria.find((item) => item.id === exactGateId)!;
      if (
        criterion.rating < rubric.policy.exact_gate_rating &&
        criterion.revisionTargets.length === 0
      ) {
        add(
          "MISSING_REVISION_TARGET",
          `submission.criteria[${submission.criteria.indexOf(criterion)}].revisionTargets`,
          "An exact-gate miss requires targeted remediation",
        );
      }
    }
    if (currentScore < rubric.policy.weighted_score_minimum) {
      const plannedMaximumScore = rubric.criteria.reduce((total, criterion, index) => {
        const submitted = submission.criteria[index];
        const plannedRating = submitted.revisionTargets.length > 0 ? 4 : submitted.rating;
        return total + criterion.weight * (plannedRating / 4);
      }, 0);
      if (plannedMaximumScore < rubric.policy.weighted_score_minimum) {
        add(
          "INSUFFICIENT_REVISION_PLAN",
          "submission.criteria",
          "The selected remediations cannot mathematically reach the provisional quality threshold",
        );
      }
    }
  }

  const contentFindings = stableFindings(findings);
  const evidencePaths = submission.criteria.flatMap((criterion) =>
    criterion.evidencePaths.map((path) => ({ criterionId: criterion.id, path })),
  );
  const remediationTargets = submission.criteria.flatMap((criterion) =>
    criterion.revisionTargets.map((target) => ({
      criterionId: criterion.id,
      domain: target.domain,
      path: target.path,
    })),
  );
  const privacyFieldPaths = submission.criteria.flatMap((criterion, criterionIndex) => [
    `submission.criteria[${criterionIndex}].rationale`,
    ...criterion.revisionTargets.map(
      (_target, targetIndex) =>
        `submission.criteria[${criterionIndex}].revisionTargets[${targetIndex}].instruction`,
    ),
  ]);
  const authenticatedEvidenceVerification = verifyAuthenticatedBenchmarkEvidence(
    trustedContext.authorityPolicy,
    trustedContext.authenticatedEvidence,
    {
      subject: { ...requirements.subject },
      prerequisiteVerdicts: {
        generationManifestReady: requirements.prerequisites.generationManifestReady,
        structuralMachineVerdict: requirements.prerequisites.structuralMachineVerdict,
        sourceOverlapMachineVerdict: requirements.prerequisites.sourceOverlapMachineVerdict,
        freshnessMachineVerdict: requirements.prerequisites.freshnessMachineVerdict,
      },
      draftDigest: requirements.prerequisites.draftDigest,
      generationManifestDigest: requirements.prerequisites.generationManifestDigest,
      structuralReportDigest: requirements.prerequisites.structuralReportDigest,
      sourceOverlapReportDigest: requirements.prerequisites.sourceOverlapReportDigest,
      freshnessReportDigest: requirements.prerequisites.freshnessReportDigest,
      approvedVoiceExampleDigest: requirements.prerequisites.approvedVoiceExampleDigest,
      benchmarkSetId: requirements.benchmark.setId,
      benchmarkSetDigest: requirements.benchmark.setDigest,
      benchmarkApproval: {
        recordId: requirements.benchmark.approval.recordId,
        approvedBy: requirements.benchmark.approval.approvedBy,
        approvedAt: requirements.benchmark.approval.approvedAt,
      },
      comparisonMode: requirements.benchmark.comparisonMode,
      reviewer: {
        kind: requirements.reviewerAssignment.kind,
        id: requirements.reviewerAssignment.id,
        version: requirements.reviewerAssignment.version,
      },
      author: { ...trustedContext.author },
      independentFromAuthor: requirements.reviewerAssignment.independentFromAuthor,
      rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
      evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
      reviewContentDigest,
      resolverVersion: trustedContext.resolverVersion,
      evidenceResolution: {
        reportDigest: requirements.reviewValidation.evidenceResolutionReportDigest,
        verdict: requirements.reviewValidation.evidenceResolutionVerdict,
      },
      remediationResolution: {
        reportDigest: requirements.reviewValidation.remediationResolutionReportDigest,
        verdict: requirements.reviewValidation.remediationResolutionVerdict,
      },
      privacyScan: {
        reportDigest: requirements.reviewValidation.privacyScanReportDigest,
        verdict: requirements.reviewValidation.privacyScanVerdict,
      },
      privacyScannerVersion: trustedContext.privacyScannerVersion,
      evidencePaths,
      remediationTargets,
      privacyFieldPaths,
      verificationTime: trustedContext.verificationTime,
      trustedCurrentState: trustedContext.currentState,
    },
  );
  findings.push(...authenticatedEvidenceVerification.findings);

  const projectedRequirements = projectRequirements(requirements);
  const projectedSubmission = projectSubmission(submission);
  const requirementsDigest = sha256Canonical(projectedRequirements);
  const submissionDigest = sha256Canonical(projectedSubmission);
  const sortedFindings = stableFindings(findings);

  let weightedScore: number | null = null;
  let qualityVerdict: BenchmarkReviewReportV2["qualityVerdict"] = "block";
  let blockingCriterionIds: string[] = [];
  let revisionCriterionIds: string[] = [];
  if (contentFindings.length === 0) {
    const ratingById = new Map(submission.criteria.map((criterion) => [criterion.id, criterion.rating]));
    const rawScore = rubric.criteria.reduce(
      (total, criterion) => total + criterion.weight * (ratingById.get(criterion.id)! / 4),
      0,
    );
    weightedScore = Math.round(rawScore * 10) / 10;
    blockingCriterionIds = rubric.criteria
      .filter((criterion) => ratingById.get(criterion.id)! <= 1)
      .map((criterion) => criterion.id);
    const belowFloor = rubric.criteria
      .filter((criterion) => ratingById.get(criterion.id)! < rubric.policy.minimum_rating_each_criterion)
      .map((criterion) => criterion.id);
    const exactGateMisses = rubric.policy.exact_gate_criterion_ids.filter(
      (id) => ratingById.get(id)! < rubric.policy.exact_gate_rating,
    );
    const explicitTargets = submission.criteria
      .filter((criterion) => criterion.revisionTargets.length > 0)
      .map((criterion) => criterion.id);
    revisionCriterionIds = [...new Set([...belowFloor, ...exactGateMisses, ...explicitTargets])];
    if (blockingCriterionIds.length > 0) {
      qualityVerdict = "block";
    } else if (
      revisionCriterionIds.length > 0 ||
      weightedScore < rubric.policy.weighted_score_minimum
    ) {
      qualityVerdict = "targeted_revision";
    } else {
      qualityVerdict = "benchmark_ready";
    }
  }

  const contentMachineVerdict = contentFindings.length === 0 ? "pass" : "block";
  const authenticatedEvidenceReady = authenticatedEvidenceVerification.ok;
  const machineVerdict = sortedFindings.length === 0 ? "pass" : "block";
  const contentReadyForOwnerReview =
    contentMachineVerdict === "pass" && qualityVerdict === "benchmark_ready";
  const readyForOwnerReview =
    contentReadyForOwnerReview && authenticatedEvidenceReady && machineVerdict === "pass";
  const overallStatus: BenchmarkReviewReportV2["overallStatus"] =
    machineVerdict === "block" || qualityVerdict === "block"
      ? "blocked"
      : qualityVerdict === "targeted_revision"
        ? "targeted_revision"
        : "needs_owner_review";
  const reviewSnapshotAvailable =
    authenticatedEvidenceReady && contentMachineVerdict === "pass";

  const reportWithoutDigest: Omit<BenchmarkReviewReportV2, "reviewDigest"> = {
    reportVersion: "selah-benchmark-review-v2" as const,
    artifact: "chapter_workup" as const,
    stage: "benchmark_comparison" as const,
    slug: subjectIsValid ? requirements.subject.slug : "invalid-subject",
    requirementsDigest,
    submissionDigest,
    reviewContentDigest,
    generationManifestDigest: safeDigest(requirements.prerequisites.generationManifestDigest),
    structuralReportDigest: safeDigest(requirements.prerequisites.structuralReportDigest),
    sourceOverlapReportDigest: safeDigest(requirements.prerequisites.sourceOverlapReportDigest),
    freshnessReportDigest: safeDigest(requirements.prerequisites.freshnessReportDigest),
    draftDigest: safeDigest(requirements.prerequisites.draftDigest),
    benchmarkSetDigest: safeDigest(requirements.benchmark.setDigest),
    artifactRegistryDigest: safeDigest(requirements.reviewValidation.artifactRegistryDigest),
    resolverVersion: requirements.reviewValidation.resolverVersion,
    evidenceResolutionReportDigest: safeDigest(
      requirements.reviewValidation.evidenceResolutionReportDigest,
    ),
    remediationResolutionReportDigest: safeDigest(
      requirements.reviewValidation.remediationResolutionReportDigest,
    ),
    privacyScanReportDigest: safeDigest(requirements.reviewValidation.privacyScanReportDigest),
    rubricVersion: SELAH_BENCHMARK_RUBRIC_VERSION,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
    benchmarkSetId: SELAH_BENCHMARK_SET_ID,
    calibrationStatus: rubric.policy.calibration_status,
    weightedScore,
    weightedScoreMinimum: rubric.policy.weighted_score_minimum,
    machineVerdict,
    qualityVerdict,
    overallStatus,
    contentMachineVerdict,
    contentReadyForOwnerReview,
    authenticatedEvidenceReady,
    authenticatedEvidenceBundleDigest: authenticatedEvidenceVerification.bundleDigest,
    evidenceAuthorityPolicyId: authenticatedEvidenceVerification.authorityPolicyId,
    evidenceApprovalKeyId: authenticatedEvidenceVerification.approvalKeyId,
    evidenceAssignmentKeyId: authenticatedEvidenceVerification.assignmentKeyId,
    evidenceValidationKeyId: authenticatedEvidenceVerification.validationKeyId,
    verificationTime: trustedContext.verificationTime,
    readyForOwnerReview,
    reviewSnapshotAvailable,
    blockingCriterionIds,
    revisionCriterionIds,
    criteria: reviewSnapshotAvailable ? projectedSubmission.criteria : [],
    findings: sortedFindings,
  };
  const reviewDigest = sha256Canonical(reportWithoutDigest);
  return deepFreeze({ ...reportWithoutDigest, reviewDigest });
}

export function assertAuthenticatedBenchmarkReviewReadyForOwner(
  requirements: BenchmarkReviewRequirementsV1,
  submission: BenchmarkReviewSubmissionV1,
  trustedContext: TrustedBenchmarkReviewContextV1,
): BenchmarkReviewReportV2 {
  const report = evaluateSelahBenchmarkReview(requirements, submission, trustedContext);
  if (!report.readyForOwnerReview) {
    throw new Error(
      `benchmark review is not ready for owner review (${report.machineVerdict}/${report.qualityVerdict})`,
    );
  }
  return report;
}
