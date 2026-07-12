import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signBytes, type KeyObject } from "node:crypto";
import {
  assertAuthenticatedBenchmarkReviewReadyForOwner,
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
  type TrustedBenchmarkReviewContextV1,
} from "../lib/server/selah-benchmark-review";
import {
  artifactRegistrySnapshotDigest,
  authenticatedEvidenceReceiptSigningDigest,
  evidenceResolutionReportDigest as computeEvidenceResolutionReportDigest,
  privacyScanReportDigest as computePrivacyScanReportDigest,
  remediationResolutionReportDigest as computeRemediationResolutionReportDigest,
  type ArtifactRegistryEntryV1,
  type ArtifactRegistrySnapshotV1,
  type AuthenticatedBenchmarkEvidenceV1,
  type AuthenticatedEvidenceReceiptV1,
  type BenchmarkApprovalReceiptPayloadV1,
  type EvidenceResolutionReportV1,
  type PrivacyScanReportV1,
  type RemediationResolutionReportV1,
  type ReviewerAssignmentReceiptPayloadV1,
  type ReviewValidationReceiptPayloadV1,
  type TrustedBenchmarkEvidenceAuthorityPolicyV1,
  type TrustedBenchmarkEvidenceAuthorityV1,
} from "../lib/server/selah-benchmark-evidence";
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
const privacyScannerVersion = "synthetic-review-privacy-scanner-v1";
const verificationTime = "2026-07-12T05:10:00.000Z";
const syntheticAuthor = {
  id: "synthetic-selah-author",
  version: "synthetic-author-v1",
};

function createAuthority(
  authorityId: string,
  keyId: string,
): { authority: TrustedBenchmarkEvidenceAuthorityV1; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    authority: {
      authorityVersion: "selah-benchmark-evidence-authority-v1",
      authorityId,
      keyId,
      algorithm: "ed25519",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    privateKey,
  };
}

function rewrapPublicKeyPem(pem: string, width: number): string {
  const body = pem
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("-----"))
    .join("");
  const lines = body.match(new RegExp(`.{1,${width}}`, "g")) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

const approvalAuthority = createAuthority(
  "synthetic-owner-approval-authority",
  "synthetic-owner-approval-key-v1",
);
const assignmentAuthority = createAuthority(
  "synthetic-review-assignment-authority",
  "synthetic-review-assignment-key-v1",
);
const validationAuthority = createAuthority(
  "synthetic-review-validation-authority",
  "synthetic-review-validation-key-v1",
);
const authorityPolicy: TrustedBenchmarkEvidenceAuthorityPolicyV1 = {
  policyVersion: "selah-benchmark-evidence-authority-policy-v1",
  policyId: "synthetic-separated-authority-policy-v1",
  benchmarkApproval: approvalAuthority.authority,
  reviewerAssignment: assignmentAuthority.authority,
  reviewValidation: validationAuthority.authority,
};

function signReceipt<Payload>(
  payload: Payload,
  receiptId: string,
  authority: TrustedBenchmarkEvidenceAuthorityV1,
  privateKey: KeyObject,
  issuedAt: string,
): AuthenticatedEvidenceReceiptV1<Payload> {
  const content = {
    receiptVersion: "selah-authenticated-evidence-receipt-v1" as const,
    receiptId,
    authorityId: authority.authorityId,
    keyId: authority.keyId,
    issuedAt,
    payload,
  };
  const signedContentDigest = authenticatedEvidenceReceiptSigningDigest(content);
  return {
    ...content,
    signedContentDigest,
    signature: signBytes(null, Buffer.from(signedContentDigest, "utf8"), privateKey).toString("base64"),
  };
}

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

function registryRootForPath(path: string): {
  rootPath: string;
  artifactType: ArtifactRegistryEntryV1["artifactType"];
} {
  const mappings: Array<[string, ArtifactRegistryEntryV1["artifactType"]]> = [
    ["workup:/", "workup"],
    ["manifest:/", "manifest"],
    ["structural-report:/", "structural_report"],
    ["source-overlap-report:/", "source_overlap_report"],
    ["freshness-report:/", "freshness_report"],
    ["render-report:/", "render_report"],
    ["guidance:/", "guidance"],
    ["voice-example:/", "voice_example"],
    ["benchmark-set:/", "benchmark_set"],
    ["rubric:/", "rubric"],
    ["review:/", "remediation_target"],
    ["generation:/", "remediation_target"],
  ];
  const match = mappings.find(([prefix]) => path.startsWith(prefix));
  if (!match) return { rootPath: "review-evidence:/__artifact__", artifactType: "review_evidence" };
  return { rootPath: `${match[0]}__artifact__`, artifactType: match[1] };
}

function buildTrustedContext(
  requirement: BenchmarkReviewRequirementsV1,
  review: BenchmarkReviewSubmissionV1,
): TrustedBenchmarkReviewContextV1 {
  const reviewContentDigest = benchmarkReviewContentDigest(review);
  const reviewId = `synthetic-${requirement.subject.slug}-review-v1`;
  const assignmentId = `synthetic-${requirement.subject.slug}-assignment-v1`;
  const rootDefinitions = new Map<string, {
    artifactType: ArtifactRegistryEntryV1["artifactType"];
    digest: string;
  }>([
    ["workup:/__artifact__", { artifactType: "workup", digest: requirement.prerequisites.draftDigest }],
    ["manifest:/__artifact__", { artifactType: "manifest", digest: requirement.prerequisites.generationManifestDigest }],
    ["structural-report:/__artifact__", { artifactType: "structural_report", digest: requirement.prerequisites.structuralReportDigest }],
    ["source-overlap-report:/__artifact__", { artifactType: "source_overlap_report", digest: requirement.prerequisites.sourceOverlapReportDigest }],
    ["freshness-report:/__artifact__", { artifactType: "freshness_report", digest: requirement.prerequisites.freshnessReportDigest }],
    ["voice-example:/__artifact__", { artifactType: "voice_example", digest: requirement.prerequisites.approvedVoiceExampleDigest }],
    ["benchmark-set:/__artifact__", { artifactType: "benchmark_set", digest: requirement.benchmark.setDigest }],
    ["rubric:/__artifact__", { artifactType: "rubric", digest: SELAH_BENCHMARK_RUBRIC_DIGEST }],
  ]);
  const evidencePairs = review.criteria.flatMap((criterion) =>
    criterion.evidencePaths.map((path) => ({ criterionId: criterion.id, path })),
  );
  const remediationPairs = review.criteria.flatMap((criterion) =>
    criterion.revisionTargets.map((target) => ({
      criterionId: criterion.id,
      domain: target.domain,
      path: target.path,
    })),
  );
  for (const path of [...evidencePairs.map((item) => item.path), ...remediationPairs.map((item) => item.path)]) {
    const root = registryRootForPath(path);
    if (!rootDefinitions.has(root.rootPath)) {
      rootDefinitions.set(root.rootPath, {
        artifactType: root.artifactType,
        digest: sha256Canonical({ syntheticRegistryRoot: root.rootPath, draftDigest: requirement.prerequisites.draftDigest }),
      });
    }
  }

  const entriesByPath = new Map<string, ArtifactRegistryEntryV1>();
  for (const [rootPath, root] of rootDefinitions) {
    const identity = root.artifactType.replace(/_/g, "-");
    entriesByPath.set(rootPath, {
      path: rootPath,
      rootPath,
      artifactType: root.artifactType,
      recordId: `synthetic-${requirement.subject.slug}-${identity}`,
      revision: "r1",
      rootDigest: root.digest,
      digest: root.digest,
    });
  }
  for (const path of [...evidencePairs.map((item) => item.path), ...remediationPairs.map((item) => item.path)]) {
    if (entriesByPath.has(path)) continue;
    const rootIdentity = registryRootForPath(path);
    const root = entriesByPath.get(rootIdentity.rootPath)!;
    entriesByPath.set(path, {
      path,
      rootPath: root.path,
      artifactType: root.artifactType,
      recordId: root.recordId,
      revision: root.revision,
      rootDigest: root.digest,
      digest: sha256Canonical({ syntheticRegistrySubpath: path, rootDigest: root.digest }),
    });
  }
  const registryWithoutDigest: Omit<ArtifactRegistrySnapshotV1, "registryDigest"> = {
    registryVersion: "selah-benchmark-artifact-registry-v1",
    recordId: `synthetic-${requirement.subject.slug}-artifact-registry`,
    revision: "r1",
    createdAt: "2026-07-12T05:02:00.000Z",
    subject: { ...requirement.subject },
    prerequisiteVerdicts: {
      generationManifestReady: requirement.prerequisites.generationManifestReady,
      structuralMachineVerdict: requirement.prerequisites.structuralMachineVerdict,
      sourceOverlapMachineVerdict: requirement.prerequisites.sourceOverlapMachineVerdict,
      freshnessMachineVerdict: requirement.prerequisites.freshnessMachineVerdict,
    },
    draftDigest: requirement.prerequisites.draftDigest,
    generationManifestDigest: requirement.prerequisites.generationManifestDigest,
    structuralReportDigest: requirement.prerequisites.structuralReportDigest,
    sourceOverlapReportDigest: requirement.prerequisites.sourceOverlapReportDigest,
    freshnessReportDigest: requirement.prerequisites.freshnessReportDigest,
    approvedVoiceExampleDigest: requirement.prerequisites.approvedVoiceExampleDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
    entries: [...entriesByPath.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
  };
  const artifactRegistry: ArtifactRegistrySnapshotV1 = {
    ...registryWithoutDigest,
    registryDigest: artifactRegistrySnapshotDigest(registryWithoutDigest),
  };

  const evidenceResolutionReport: EvidenceResolutionReportV1 = {
    reportVersion: "selah-benchmark-evidence-resolution-report-v1",
    reportId: `synthetic-${requirement.subject.slug}-evidence-resolution`,
    reviewId,
    reviewContentDigest,
    draftDigest: requirement.prerequisites.draftDigest,
    artifactRegistryDigest: artifactRegistry.registryDigest,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
    evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
    resolverVersion,
    completedAt: "2026-07-12T05:04:00.000Z",
    results: evidencePairs.map(({ criterionId, path }) => ({
      criterionId,
      submittedPath: path,
      status: "resolved",
      registryPath: path,
      artifactDigest: entriesByPath.get(path)!.digest,
    })),
  };
  const remediationResolutionReport: RemediationResolutionReportV1 = {
    reportVersion: "selah-benchmark-remediation-resolution-report-v1",
    reportId: `synthetic-${requirement.subject.slug}-remediation-resolution`,
    reviewId,
    reviewContentDigest,
    draftDigest: requirement.prerequisites.draftDigest,
    artifactRegistryDigest: artifactRegistry.registryDigest,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
    evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
    resolverVersion,
    completedAt: "2026-07-12T05:04:10.000Z",
    results: remediationPairs.map(({ criterionId, domain, path }) => ({
      criterionId,
      domain,
      submittedPath: path,
      status: "resolved",
      registryPath: path,
      artifactDigest: entriesByPath.get(path)!.digest,
    })),
  };
  const privacyScanReport: PrivacyScanReportV1 = {
    reportVersion: "selah-benchmark-privacy-scan-report-v1",
    reportId: `synthetic-${requirement.subject.slug}-privacy-scan`,
    reviewId,
    reviewContentDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    approvedVoiceExampleDigest: requirement.prerequisites.approvedVoiceExampleDigest,
    scannerVersion: privacyScannerVersion,
    executionStatus: "complete",
    completedAt: "2026-07-12T05:04:20.000Z",
    scannedFieldPaths: review.criteria.flatMap((criterion, criterionIndex) => [
      `submission.criteria[${criterionIndex}].rationale`,
      ...criterion.revisionTargets.map(
        (_target, targetIndex) =>
          `submission.criteria[${criterionIndex}].revisionTargets[${targetIndex}].instruction`,
      ),
    ]),
    findings: [],
  };

  requirement.reviewValidation.artifactRegistryDigest = artifactRegistry.registryDigest;
  requirement.reviewValidation.evidenceResolutionReportDigest =
    computeEvidenceResolutionReportDigest(evidenceResolutionReport);
  requirement.reviewValidation.remediationResolutionReportDigest =
    computeRemediationResolutionReportDigest(remediationResolutionReport);
  requirement.reviewValidation.privacyScanReportDigest =
    computePrivacyScanReportDigest(privacyScanReport);
  refreshTrustedBindings(requirement, review);

  const benchmarkApprovalPayload: BenchmarkApprovalReceiptPayloadV1 = {
    evidenceType: "benchmark-set-owner-approval",
    setId: requirement.benchmark.setId,
    setDigest: requirement.benchmark.setDigest,
    recordId: requirement.benchmark.approval.recordId,
    approvedBy: requirement.benchmark.approval.approvedBy,
    approvedAt: requirement.benchmark.approval.approvedAt,
  };
  const reviewerAssignmentPayload: ReviewerAssignmentReceiptPayloadV1 = {
    evidenceType: "benchmark-reviewer-assignment",
    assignmentId,
    reviewId,
    assignedAt: "2026-07-12T05:01:00.000Z",
    expiresAt: "2026-07-12T06:00:00.000Z",
    author: { ...syntheticAuthor },
    reviewer: {
      kind: requirement.reviewerAssignment.kind,
      id: requirement.reviewerAssignment.id,
      version: requirement.reviewerAssignment.version,
    },
    independentFromAuthor: true,
    subject: { ...requirement.subject },
    draftDigest: requirement.prerequisites.draftDigest,
    generationManifestDigest: requirement.prerequisites.generationManifestDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
    approvedVoiceExampleDigest: requirement.prerequisites.approvedVoiceExampleDigest,
    comparisonMode: requirement.benchmark.comparisonMode,
  };
  const reviewValidationPayload: ReviewValidationReceiptPayloadV1 = {
    evidenceType: "benchmark-review-validation",
    reviewId,
    assignmentId,
    reviewer: { ...review.reviewer },
    subject: { ...requirement.subject },
    draftDigest: requirement.prerequisites.draftDigest,
    generationManifestDigest: requirement.prerequisites.generationManifestDigest,
    benchmarkSetDigest: requirement.benchmark.setDigest,
    rubricDigest: SELAH_BENCHMARK_RUBRIC_DIGEST,
    evidencePolicyDigest: SELAH_BENCHMARK_EVIDENCE_POLICY_DIGEST,
    approvedVoiceExampleDigest: requirement.prerequisites.approvedVoiceExampleDigest,
    reviewContentDigest,
    artifactRegistryDigest: artifactRegistry.registryDigest,
    resolverVersion,
    evidenceResolution: {
      reportDigest: requirement.reviewValidation.evidenceResolutionReportDigest,
      verdict: "pass",
    },
    remediationResolution: {
      reportDigest: requirement.reviewValidation.remediationResolutionReportDigest,
      verdict: "pass",
    },
    privacyScan: {
      scannerVersion: privacyScannerVersion,
      reportDigest: requirement.reviewValidation.privacyScanReportDigest,
      verdict: "pass",
    },
  };
  const authenticatedEvidence: AuthenticatedBenchmarkEvidenceV1 = {
    bundleVersion: "selah-authenticated-benchmark-evidence-v1",
    artifactRegistry,
    evidenceResolutionReport,
    remediationResolutionReport,
    privacyScanReport,
    benchmarkApproval: signReceipt(
      benchmarkApprovalPayload,
      `synthetic-${requirement.subject.slug}-approval-receipt`,
      approvalAuthority.authority,
      approvalAuthority.privateKey,
      "2026-07-12T05:00:10.000Z",
    ),
    reviewerAssignment: signReceipt(
      reviewerAssignmentPayload,
      `synthetic-${requirement.subject.slug}-assignment-receipt`,
      assignmentAuthority.authority,
      assignmentAuthority.privateKey,
      "2026-07-12T05:01:10.000Z",
    ),
    reviewValidation: signReceipt(
      reviewValidationPayload,
      `synthetic-${requirement.subject.slug}-validation-receipt`,
      validationAuthority.authority,
      validationAuthority.privateKey,
      "2026-07-12T05:05:00.000Z",
    ),
  };

  return {
    contextVersion: "selah-trusted-benchmark-review-context-v1",
    authorityPolicy,
    authenticatedEvidence,
    verificationTime,
    resolverVersion,
    privacyScannerVersion,
    author: { ...syntheticAuthor },
    currentState: {
      reviewId,
      assignmentId,
      draftDigest: requirement.prerequisites.draftDigest,
      generationManifestDigest: requirement.prerequisites.generationManifestDigest,
      artifactRegistry: {
        recordId: artifactRegistry.recordId,
        revision: artifactRegistry.revision,
        registryDigest: artifactRegistry.registryDigest,
      },
    },
  };
}

const trustedContext = buildTrustedContext(requirements, submission);

const green = evaluateSelahBenchmarkReview(requirements, submission, trustedContext);
assert.equal(green.machineVerdict, "pass");
assert.equal(green.qualityVerdict, "benchmark_ready");
assert.equal(green.weightedScore, 100);
assert.equal(green.overallStatus, "needs_owner_review");
assert.equal(green.readyForOwnerReview, true);
assert.equal(green.contentReadyForOwnerReview, true);
assert.equal(green.authenticatedEvidenceReady, true);
assert.equal(green.reviewSnapshotAvailable, true);
assert.equal(green.criteria.length, 13);
assert.deepEqual(green.findings, []);
assert.equal(green.calibrationStatus, "provisional_pending_owner_benchmark_scoring");
assert.match(green.requirementsDigest, /^[a-f0-9]{64}$/);
assert.match(green.submissionDigest, /^[a-f0-9]{64}$/);
assert.match(green.reviewDigest, /^[a-f0-9]{64}$/);
assert.equal(green.artifactRegistryDigest, requirements.reviewValidation.artifactRegistryDigest);
assert.equal(green.evidenceAuthorityPolicyId, authorityPolicy.policyId);
assert.equal(assertAuthenticatedBenchmarkReviewReadyForOwner(requirements, submission, trustedContext).reviewDigest, green.reviewDigest);
assert.deepEqual(evaluateSelahBenchmarkReview(requirements, submission, trustedContext), green);
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
const mark11Context = buildTrustedContext(mark11Requirements, mark11Submission);
const mark11Green = evaluateSelahBenchmarkReview(mark11Requirements, mark11Submission, mark11Context);
assert.equal(mark11Green.machineVerdict, "pass");
assert.equal(mark11Green.qualityVerdict, "benchmark_ready");

const forgedReport = {
  readyForOwnerReview: true,
  machineVerdict: "block",
  qualityVerdict: "block",
};
assert.throws(
  () => (assertAuthenticatedBenchmarkReviewReadyForOwner as unknown as (value: unknown) => unknown)(forgedReport),
  /(?:invalid benchmark review object|unsupported benchmark review field)/,
  "the readiness assertion must re-evaluate requirements and submission rather than trust a report",
);

let authenticatedMutationCases = 0;
function expectAuthenticatedBlocked(
  label: string,
  mutate: (
    requirementCopy: BenchmarkReviewRequirementsV1,
    submissionCopy: BenchmarkReviewSubmissionV1,
    contextCopy: TrustedBenchmarkReviewContextV1,
  ) => void,
  expectedCode: string,
): void {
  authenticatedMutationCases++;
  const requirementCopy = structuredClone(requirements);
  const submissionCopy = structuredClone(submission);
  const contextCopy = structuredClone(trustedContext);
  mutate(requirementCopy, submissionCopy, contextCopy);
  const report = evaluateSelahBenchmarkReview(requirementCopy, submissionCopy, contextCopy);
  assert.equal(report.machineVerdict, "block", `${label} unexpectedly passed machine validation`);
  assert.equal(report.authenticatedEvidenceReady, false, `${label} unexpectedly passed authenticated evidence`);
  assert.equal(report.readyForOwnerReview, false, `${label} unexpectedly reached owner review`);
  assert.ok(
    report.findings.some((finding) => finding.code === expectedCode),
    `${label} did not report ${expectedCode}: ${report.findings.map((finding) => finding.code).join(", ")}`,
  );
}

expectAuthenticatedBlocked(
  "self-created owner approval digest",
  (r, s) => {
    r.benchmark.approval.approvedBy = "forged-owner";
    refreshTrustedBindings(r, s);
  },
  "AUTHENTICATED_EVIDENCE_MISMATCH",
);
expectAuthenticatedBlocked(
  "self-created reviewer assignment digest",
  (r, s) => {
    r.reviewerAssignment.id = "forged-independent-reviewer";
    s.reviewer.id = r.reviewerAssignment.id;
    refreshTrustedBindings(r, s);
  },
  "AUTHENTICATED_EVIDENCE_MISMATCH",
);
expectAuthenticatedBlocked(
  "changed review prose after validation",
  (r, s) => {
    s.criteria[0].rationale = `${s.criteria[0].rationale} Authenticated replay mutation.`;
    refreshTrustedBindings(r, s);
  },
  "AUTHENTICATED_EVIDENCE_MISMATCH",
);
expectAuthenticatedBlocked(
  "attacker-signed owner receipt against pinned policy",
  (_r, _s, context) => {
    const attacker = createAuthority("attacker-owner-authority", "attacker-owner-key-v1");
    const old = context.authenticatedEvidence.benchmarkApproval;
    context.authenticatedEvidence.benchmarkApproval = signReceipt(
      old.payload,
      old.receiptId,
      attacker.authority,
      attacker.privateKey,
      old.issuedAt,
    );
  },
  "EVIDENCE_AUTHORITY_MISMATCH",
);
expectAuthenticatedBlocked(
  "role keys collapsed into one authority",
  (_r, _s, context) => {
    context.authorityPolicy.reviewerAssignment = context.authorityPolicy.benchmarkApproval;
  },
  "AUTHENTICATED_EVIDENCE_MALFORMED",
);
expectAuthenticatedBlocked(
  "same public key relabeled for two roles",
  (_r, _s, context) => {
    context.authorityPolicy.reviewerAssignment = {
      ...context.authorityPolicy.benchmarkApproval,
      authorityId: "synthetic-relabeled-assignment-authority",
      keyId: "synthetic-relabeled-assignment-key-v1",
    };
  },
  "AUTHENTICATED_EVIDENCE_MALFORMED",
);
expectAuthenticatedBlocked(
  "same public key hidden behind different PEM wrapping",
  (_r, _s, context) => {
    context.authorityPolicy.reviewerAssignment = {
      ...context.authorityPolicy.benchmarkApproval,
      authorityId: "synthetic-rewrapped-assignment-authority",
      keyId: "synthetic-rewrapped-assignment-key-v1",
      publicKeyPem: rewrapPublicKeyPem(
        context.authorityPolicy.benchmarkApproval.publicKeyPem,
        32,
      ),
    };
  },
  "AUTHENTICATED_EVIDENCE_MALFORMED",
);
expectAuthenticatedBlocked(
  "trust policy contains appended private-key material",
  (_r, _s, context) => {
    context.authorityPolicy.reviewerAssignment = {
      ...context.authorityPolicy.reviewerAssignment,
      publicKeyPem:
        context.authorityPolicy.reviewerAssignment.publicKeyPem +
        assignmentAuthority.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
    };
  },
  "AUTHENTICATED_EVIDENCE_MALFORMED",
);
expectAuthenticatedBlocked(
  "expired reviewer assignment",
  (_r, _s, context) => {
    context.verificationTime = "2026-07-12T07:00:00.000Z";
  },
  "REVIEWER_ASSIGNMENT_EXPIRED",
);
expectAuthenticatedBlocked(
  "trusted registry head advanced",
  (_r, _s, context) => {
    context.currentState.artifactRegistry.registryDigest = "a".repeat(64);
  },
  "AUTHENTICATED_EVIDENCE_MISMATCH",
);
expectAuthenticatedBlocked(
  "review assignment replayed for another review",
  (_r, _s, context) => {
    context.currentState.reviewId = "synthetic-other-review-v1";
  },
  "AUTHENTICATED_EVIDENCE_MISMATCH",
);
expectAuthenticatedBlocked(
  "unresolved evidence report labeled pass",
  (_r, _s, context) => {
    context.authenticatedEvidence.evidenceResolutionReport.results[0].status = "missing";
    context.authenticatedEvidence.evidenceResolutionReport.results[0].registryPath = null;
    context.authenticatedEvidence.evidenceResolutionReport.results[0].artifactDigest = null;
  },
  "EVIDENCE_RESOLUTION_BLOCKED",
);
expectAuthenticatedBlocked(
  "privacy report omitted a persisted rationale",
  (_r, _s, context) => {
    context.authenticatedEvidence.privacyScanReport.scannedFieldPaths.pop();
  },
  "PRIVACY_SCAN_BLOCKED",
);
expectAuthenticatedBlocked(
  "privacy finding hidden behind pass label",
  (_r, _s, context) => {
    context.authenticatedEvidence.privacyScanReport.findings.push({
      code: "SYNTHETIC_PRIVATE_WORDING_MATCH",
      reviewPath: "submission.criteria[0].rationale",
      protectedSource: "benchmark",
      matchFingerprintDigest: sha256Canonical({ synthetic: "private-match-fingerprint" }),
    });
  },
  "PRIVACY_SCAN_BLOCKED",
);
expectAuthenticatedBlocked(
  "registry subpath detached from its root revision",
  (_r, _s, context) => {
    const registry = context.authenticatedEvidence.artifactRegistry;
    const subpath = registry.entries.find((entry) => entry.path !== entry.rootPath)!;
    subpath.rootDigest = "b".repeat(64);
    const { registryDigest: _oldDigest, ...registryWithoutDigest } = registry;
    registry.registryDigest = artifactRegistrySnapshotDigest(registryWithoutDigest);
    context.currentState.artifactRegistry.registryDigest = registry.registryDigest;
  },
  "ARTIFACT_REGISTRY_INVALID",
);
expectAuthenticatedBlocked(
  "registry subpath masquerades as its own root",
  (_r, _s, context) => {
    const registry = context.authenticatedEvidence.artifactRegistry;
    const subpath = registry.entries.find((entry) => entry.path !== entry.rootPath)!;
    subpath.rootPath = subpath.path;
    subpath.rootDigest = subpath.digest;
    const { registryDigest: _oldDigest, ...registryWithoutDigest } = registry;
    registry.registryDigest = artifactRegistrySnapshotDigest(registryWithoutDigest);
    context.currentState.artifactRegistry.registryDigest = registry.registryDigest;
  },
  "ARTIFACT_REGISTRY_INVALID",
);
expectAuthenticatedBlocked(
  "sparse registry is blocked without escaping verification",
  (_r, _s, context) => {
    const sparse: ArtifactRegistryEntryV1[] = [];
    sparse.length = context.authenticatedEvidence.artifactRegistry.entries.length;
    context.authenticatedEvidence.artifactRegistry.entries = sparse;
  },
  "AUTHENTICATED_EVIDENCE_MALFORMED",
);
expectAuthenticatedBlocked(
  "author assigned as own independent reviewer",
  (_r, s, context) => {
    context.author = { id: s.reviewer.id, version: s.reviewer.version };
    const old = context.authenticatedEvidence.reviewerAssignment;
    const payload = {
      ...old.payload,
      author: { ...context.author },
    };
    context.authenticatedEvidence.reviewerAssignment = signReceipt(
      payload,
      old.receiptId,
      assignmentAuthority.authority,
      assignmentAuthority.privateKey,
      old.issuedAt,
    );
  },
  "REVIEWER_ASSIGNMENT_INVALID",
);

function expectPrerequisiteEscalationBlocked(
  label: string,
  block: (requirement: BenchmarkReviewRequirementsV1) => void,
  promote: (requirement: BenchmarkReviewRequirementsV1) => void,
): void {
  authenticatedMutationCases++;
  const requirementCopy = structuredClone(requirements);
  const submissionCopy = structuredClone(submission);
  block(requirementCopy);
  const contextCopy = buildTrustedContext(requirementCopy, submissionCopy);
  const legitimatelyBlocked = evaluateSelahBenchmarkReview(
    requirementCopy,
    submissionCopy,
    contextCopy,
  );
  assert.equal(legitimatelyBlocked.contentMachineVerdict, "block");
  assert.equal(legitimatelyBlocked.authenticatedEvidenceReady, true);
  promote(requirementCopy);
  refreshTrustedBindings(requirementCopy, submissionCopy);
  const escalated = evaluateSelahBenchmarkReview(
    requirementCopy,
    submissionCopy,
    contextCopy,
  );
  assert.equal(escalated.contentMachineVerdict, "pass", `${label} did not isolate the authentication boundary`);
  assert.equal(escalated.authenticatedEvidenceReady, false, `${label} escaped signed prerequisite binding`);
  assert.equal(escalated.readyForOwnerReview, false);
  assert.ok(
    escalated.findings.some(
      (finding) => finding.code === "AUTHENTICATED_EVIDENCE_MISMATCH",
    ),
    `${label} did not report authenticated prerequisite mismatch`,
  );
}

expectPrerequisiteEscalationBlocked(
  "manifest readiness false-to-true self-hash escalation",
  (r) => { r.prerequisites.generationManifestReady = false; },
  (r) => { r.prerequisites.generationManifestReady = true; },
);
expectPrerequisiteEscalationBlocked(
  "structural verdict block-to-pass self-hash escalation",
  (r) => { r.prerequisites.structuralMachineVerdict = "block"; },
  (r) => { r.prerequisites.structuralMachineVerdict = "pass"; },
);
expectPrerequisiteEscalationBlocked(
  "source-overlap verdict block-to-pass self-hash escalation",
  (r) => { r.prerequisites.sourceOverlapMachineVerdict = "block"; },
  (r) => { r.prerequisites.sourceOverlapMachineVerdict = "pass"; },
);
expectPrerequisiteEscalationBlocked(
  "freshness verdict block-to-pass self-hash escalation",
  (r) => { r.prerequisites.freshnessMachineVerdict = "block"; },
  (r) => { r.prerequisites.freshnessMachineVerdict = "pass"; },
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
  const contextCopy = refresh
    ? buildTrustedContext(requirementCopy, submissionCopy)
    : structuredClone(trustedContext);
  const report = evaluateSelahBenchmarkReview(requirementCopy, submissionCopy, contextCopy);
  assert.equal(report.machineVerdict, "block", `${label} unexpectedly passed machine validation`);
  assert.equal(report.readyForOwnerReview, false, `${label} unexpectedly reached owner review`);
  assert.ok(
    report.findings.some((finding) => finding.code === expectedCode),
    `${label} did not report ${expectedCode}: ${report.findings.map((finding) => finding.code).join(", ")}`,
  );
  assert.throws(() => assertAuthenticatedBenchmarkReviewReadyForOwner(requirementCopy, submissionCopy, contextCopy));
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
const highScoreContext = buildTrustedContext(highScoreRequirements, highScoreWithExplicitRevision);
const highScoreTargeted = evaluateSelahBenchmarkReview(
  highScoreRequirements,
  highScoreWithExplicitRevision,
  highScoreContext,
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
const validRevisionContext = buildTrustedContext(validRevisionRequirements, validRevisionPlan);
const validTargeted = evaluateSelahBenchmarkReview(validRevisionRequirements, validRevisionPlan, validRevisionContext);
assert.equal(validTargeted.machineVerdict, "pass");
assert.equal(validTargeted.qualityVerdict, "targeted_revision");
assert.ok(validTargeted.weightedScore! < 85);

const blocked = structuredClone(highScoreWithExplicitRevision);
blocked.criteria[0].rating = 1;
const blockedRequirements = structuredClone(requirements);
const blockedContext = buildTrustedContext(blockedRequirements, blocked);
const blockedReport = evaluateSelahBenchmarkReview(blockedRequirements, blocked, blockedContext);
assert.equal(blockedReport.machineVerdict, "pass");
assert.equal(blockedReport.qualityVerdict, "block");
assert.deepEqual(blockedReport.blockingCriterionIds, ["BMQ-01"]);

const changedRequirements = structuredClone(requirements);
changedRequirements.prerequisites.sourceOverlapMachineVerdict = "block";
const changedRequirementsContext = buildTrustedContext(changedRequirements, submission);
const changedRequirementsReport = evaluateSelahBenchmarkReview(changedRequirements, submission, changedRequirementsContext);
assert.notEqual(changedRequirementsReport.requirementsDigest, green.requirementsDigest);
assert.notEqual(changedRequirementsReport.reviewDigest, green.reviewDigest);

const changedSubmission = structuredClone(submission);
changedSubmission.criteria[0].rationale = `${changedSubmission.criteria[0].rationale} Additional safe detail.`;
const changedSubmissionRequirements = structuredClone(requirements);
const changedSubmissionContext = buildTrustedContext(changedSubmissionRequirements, changedSubmission);
const changedSubmissionReport = evaluateSelahBenchmarkReview(
  changedSubmissionRequirements,
  changedSubmission,
  changedSubmissionContext,
);
assert.notEqual(changedSubmissionReport.submissionDigest, green.submissionDigest);
assert.notEqual(changedSubmissionReport.reviewDigest, green.reviewDigest);

const privacyBlockedRequirements = structuredClone(requirements);
privacyBlockedRequirements.reviewValidation.privacyScanVerdict = "block";
const privacyBlockedContext = buildTrustedContext(privacyBlockedRequirements, submission);
const privacyBlocked = evaluateSelahBenchmarkReview(privacyBlockedRequirements, submission, privacyBlockedContext);
assert.equal(privacyBlocked.reviewSnapshotAvailable, false);
assert.deepEqual(privacyBlocked.criteria, []);

const tainted = structuredClone(submission) as BenchmarkReviewSubmissionV1 & Record<string, unknown>;
const protectedText = "PRIVATE BENCHMARK WORDING MUST NEVER BE RETURNED";
tainted.rawBenchmarkText = protectedText;
assert.throws(
  () => evaluateSelahBenchmarkReview(requirements, tainted, trustedContext),
  (error: unknown) =>
    error instanceof Error &&
    /unsupported benchmark review field/.test(error.message) &&
    !error.message.includes(protectedText),
);

const sparse = structuredClone(submission);
sparse.criteria = [];
sparse.criteria.length = rubric.criteria.length;
assert.throws(() => evaluateSelahBenchmarkReview(requirements, sparse, trustedContext), /sparse benchmark review array/);

const oversizedCriteria = structuredClone(submission);
oversizedCriteria.criteria.push({ ...structuredClone(oversizedCriteria.criteria[0]), id: "BMQ-EXTRA" });
assert.throws(
  () => evaluateSelahBenchmarkReview(requirements, oversizedCriteria, trustedContext),
  /criteria exceeds maximum/,
);

const oversizedEvidence = structuredClone(submission);
oversizedEvidence.criteria[0].evidencePaths = Array.from(
  { length: 13 },
  (_unused, index) => `workup:/synthetic/oversized-evidence-${index}`,
);
assert.throws(
  () => evaluateSelahBenchmarkReview(requirements, oversizedEvidence, trustedContext),
  /evidence paths .*exceeds maximum/,
);

const oversizedTargets = structuredClone(submission);
oversizedTargets.criteria[0].revisionTargets = Array.from(
  { length: 9 },
  (_unused, index) => ({
    domain: "workup" as const,
    path: `workup:/synthetic/oversized-target-${index}`,
    instruction: "Synthetic bounded target used only to prove early array rejection before traversal.",
  }),
);
assert.throws(
  () => evaluateSelahBenchmarkReview(requirements, oversizedTargets, trustedContext),
  /revision targets .*exceeds maximum/,
);

const stringBoolean = structuredClone(submission);
(stringBoolean.attestations as unknown as Record<string, unknown>).comparedAgainstBenchmark = "true";
assert.throws(() => evaluateSelahBenchmarkReview(requirements, stringBoolean, trustedContext), /invalid benchmark review boolean/);

const mutatedAfterEvaluation = structuredClone(submission);
mutatedAfterEvaluation.criteria[0].rating = 0;
mutatedAfterEvaluation.criteria[0].revisionTargets = [{
  domain: "workup",
  path: "workup:/summary",
  instruction: "Replace the unsafe or absent content before the draft receives another review.",
}];
assert.throws(
  () => assertAuthenticatedBenchmarkReviewReadyForOwner(requirements, mutatedAfterEvaluation, trustedContext),
  /not ready for owner review/,
  "the owner gate must re-evaluate a changed submission",
);

console.log(
  `Selah benchmark review verified with synthetic-only evidence: ${rubric.criteria.length} criteria, ${blockedMutationCases} content mutations and ${authenticatedMutationCases} authenticated-evidence attacks blocked, rubric ${SELAH_BENCHMARK_RUBRIC_VERSION} (${SELAH_BENCHMARK_RUBRIC_DIGEST}).`,
);
