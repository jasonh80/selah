// SERVER-ONLY. Pure authenticated-evidence contract for Selah benchmark review.
// It performs no I/O and never loads a secret. A protected server composition
// root must supply the role-scoped public-key policy, current clock, active
// assignment/review IDs, resolver/scanner versions, and artifact heads. Request
// JSON must never choose any of those values.
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { sha256Canonical } from "./generation-manifest";

export type BenchmarkEvidenceFinding = {
  code: string;
  path: string;
  message: string;
};

export type BenchmarkEvidenceSubject = {
  slug: string;
  book: string;
  chapter: number;
};

export type BenchmarkEvidenceReviewer = {
  kind: "owner" | "human_editor" | "independent_model";
  id: string;
  version: string;
};

export interface TrustedBenchmarkEvidenceAuthorityV1 {
  authorityVersion: "selah-benchmark-evidence-authority-v1";
  authorityId: string;
  keyId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
}

export interface TrustedBenchmarkEvidenceAuthorityPolicyV1 {
  policyVersion: "selah-benchmark-evidence-authority-policy-v1";
  policyId: string;
  benchmarkApproval: TrustedBenchmarkEvidenceAuthorityV1;
  reviewerAssignment: TrustedBenchmarkEvidenceAuthorityV1;
  reviewValidation: TrustedBenchmarkEvidenceAuthorityV1;
}

export interface ArtifactRegistryEntryV1 {
  path: string;
  rootPath: string;
  artifactType:
    | "workup"
    | "manifest"
    | "structural_report"
    | "source_overlap_report"
    | "freshness_report"
    | "render_report"
    | "guidance"
    | "voice_example"
    | "benchmark_set"
    | "rubric"
    | "review_evidence"
    | "remediation_target";
  recordId: string;
  revision: string;
  rootDigest: string;
  digest: string;
}

export interface ArtifactRegistrySnapshotV1 {
  registryVersion: "selah-benchmark-artifact-registry-v1";
  recordId: string;
  revision: string;
  createdAt: string;
  subject: BenchmarkEvidenceSubject;
  prerequisiteVerdicts: {
    generationManifestReady: boolean;
    structuralMachineVerdict: "pass" | "block";
    sourceOverlapMachineVerdict: "pass" | "block";
    freshnessMachineVerdict: "pass" | "block";
  };
  draftDigest: string;
  generationManifestDigest: string;
  structuralReportDigest: string;
  sourceOverlapReportDigest: string;
  freshnessReportDigest: string;
  approvedVoiceExampleDigest: string;
  benchmarkSetDigest: string;
  rubricDigest: string;
  entries: ArtifactRegistryEntryV1[];
  registryDigest: string;
}

export interface BenchmarkApprovalReceiptPayloadV1 {
  evidenceType: "benchmark-set-owner-approval";
  setId: string;
  setDigest: string;
  recordId: string;
  approvedBy: string;
  approvedAt: string;
}

export interface ReviewerAssignmentReceiptPayloadV1 {
  evidenceType: "benchmark-reviewer-assignment";
  assignmentId: string;
  reviewId: string;
  assignedAt: string;
  expiresAt: string;
  author: {
    id: string;
    version: string;
  };
  reviewer: BenchmarkEvidenceReviewer;
  independentFromAuthor: true;
  subject: BenchmarkEvidenceSubject;
  draftDigest: string;
  generationManifestDigest: string;
  benchmarkSetDigest: string;
  rubricDigest: string;
  approvedVoiceExampleDigest: string;
  comparisonMode: "same_chapter_private_benchmark" | "cross_chapter_quality_only";
}

export interface ReviewValidationReceiptPayloadV1 {
  evidenceType: "benchmark-review-validation";
  reviewId: string;
  assignmentId: string;
  reviewer: BenchmarkEvidenceReviewer;
  subject: BenchmarkEvidenceSubject;
  draftDigest: string;
  generationManifestDigest: string;
  benchmarkSetDigest: string;
  rubricDigest: string;
  evidencePolicyDigest: string;
  approvedVoiceExampleDigest: string;
  reviewContentDigest: string;
  artifactRegistryDigest: string;
  resolverVersion: string;
  evidenceResolution: {
    reportDigest: string;
    verdict: "pass" | "block";
  };
  remediationResolution: {
    reportDigest: string;
    verdict: "pass" | "block";
  };
  privacyScan: {
    scannerVersion: string;
    reportDigest: string;
    verdict: "pass" | "block";
  };
}

export interface EvidenceResolutionResultV1 {
  criterionId: string;
  submittedPath: string;
  status: "resolved" | "missing" | "ambiguous" | "forbidden";
  registryPath: string | null;
  artifactDigest: string | null;
}

export interface EvidenceResolutionReportV1 {
  reportVersion: "selah-benchmark-evidence-resolution-report-v1";
  reportId: string;
  reviewId: string;
  reviewContentDigest: string;
  draftDigest: string;
  artifactRegistryDigest: string;
  rubricDigest: string;
  evidencePolicyDigest: string;
  resolverVersion: string;
  completedAt: string;
  results: EvidenceResolutionResultV1[];
}

export interface RemediationResolutionResultV1 {
  criterionId: string;
  domain: "workup" | "manifest" | "review_process" | "regenerate_clean";
  submittedPath: string;
  status: "resolved" | "missing" | "ambiguous" | "forbidden";
  registryPath: string | null;
  artifactDigest: string | null;
}

export interface RemediationResolutionReportV1 {
  reportVersion: "selah-benchmark-remediation-resolution-report-v1";
  reportId: string;
  reviewId: string;
  reviewContentDigest: string;
  draftDigest: string;
  artifactRegistryDigest: string;
  rubricDigest: string;
  evidencePolicyDigest: string;
  resolverVersion: string;
  completedAt: string;
  results: RemediationResolutionResultV1[];
}

export interface PrivacyScanFindingV1 {
  code: string;
  reviewPath: string;
  protectedSource: "benchmark" | "voice_example";
  matchFingerprintDigest: string;
}

export interface PrivacyScanReportV1 {
  reportVersion: "selah-benchmark-privacy-scan-report-v1";
  reportId: string;
  reviewId: string;
  reviewContentDigest: string;
  benchmarkSetDigest: string;
  approvedVoiceExampleDigest: string;
  scannerVersion: string;
  executionStatus: "complete" | "error";
  completedAt: string;
  scannedFieldPaths: string[];
  findings: PrivacyScanFindingV1[];
}

export interface AuthenticatedEvidenceReceiptV1<Payload> {
  receiptVersion: "selah-authenticated-evidence-receipt-v1";
  receiptId: string;
  authorityId: string;
  keyId: string;
  issuedAt: string;
  payload: Payload;
  signedContentDigest: string;
  signature: string;
}

export interface AuthenticatedBenchmarkEvidenceV1 {
  bundleVersion: "selah-authenticated-benchmark-evidence-v1";
  artifactRegistry: ArtifactRegistrySnapshotV1;
  evidenceResolutionReport: EvidenceResolutionReportV1;
  remediationResolutionReport: RemediationResolutionReportV1;
  privacyScanReport: PrivacyScanReportV1;
  benchmarkApproval: AuthenticatedEvidenceReceiptV1<BenchmarkApprovalReceiptPayloadV1>;
  reviewerAssignment: AuthenticatedEvidenceReceiptV1<ReviewerAssignmentReceiptPayloadV1>;
  reviewValidation: AuthenticatedEvidenceReceiptV1<ReviewValidationReceiptPayloadV1>;
}

export interface BenchmarkEvidenceExpectationsV1 {
  subject: BenchmarkEvidenceSubject;
  prerequisiteVerdicts: ArtifactRegistrySnapshotV1["prerequisiteVerdicts"];
  draftDigest: string;
  generationManifestDigest: string;
  structuralReportDigest: string;
  sourceOverlapReportDigest: string;
  freshnessReportDigest: string;
  approvedVoiceExampleDigest: string;
  benchmarkSetId: string;
  benchmarkSetDigest: string;
  benchmarkApproval: {
    recordId: string;
    approvedBy: string;
    approvedAt: string;
  };
  comparisonMode: "same_chapter_private_benchmark" | "cross_chapter_quality_only";
  reviewer: BenchmarkEvidenceReviewer;
  author: {
    id: string;
    version: string;
  };
  independentFromAuthor: boolean;
  rubricDigest: string;
  evidencePolicyDigest: string;
  reviewContentDigest: string;
  resolverVersion: string;
  evidenceResolution: { reportDigest: string; verdict: "pass" | "block" };
  remediationResolution: { reportDigest: string; verdict: "pass" | "block" };
  privacyScan: { reportDigest: string; verdict: "pass" | "block" };
  privacyScannerVersion: string;
  evidencePaths: Array<{ criterionId: string; path: string }>;
  remediationTargets: Array<{
    criterionId: string;
    domain: RemediationResolutionResultV1["domain"];
    path: string;
  }>;
  privacyFieldPaths: string[];
  verificationTime: string;
  trustedCurrentState: {
    reviewId: string;
    assignmentId: string;
    draftDigest: string;
    generationManifestDigest: string;
    artifactRegistry: {
      recordId: string;
      revision: string;
      registryDigest: string;
    };
  };
}

export type AuthenticatedBenchmarkEvidenceVerification = {
  ok: boolean;
  authorityPolicyId: string;
  approvalKeyId: string;
  assignmentKeyId: string;
  validationKeyId: string;
  bundleDigest: string;
  findings: BenchmarkEvidenceFinding[];
};

const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PUBLIC_KEY_PEM = /^-----BEGIN PUBLIC KEY-----\r?\n(?:[A-Za-z0-9+/]+={0,2}\r?\n)+-----END PUBLIC KEY-----$/;
const REGISTRY_PATH = /^[A-Za-z][A-Za-z0-9-]*:\/[A-Za-z0-9_./~:-]+$/;
const REVIEWER_KINDS = new Set<BenchmarkEvidenceReviewer["kind"]>([
  "owner",
  "human_editor",
  "independent_model",
]);
const ARTIFACT_TYPES = new Set<ArtifactRegistryEntryV1["artifactType"]>([
  "workup",
  "manifest",
  "structural_report",
  "source_overlap_report",
  "freshness_report",
  "render_report",
  "guidance",
  "voice_example",
  "benchmark_set",
  "rubric",
  "review_evidence",
  "remediation_target",
]);
const RESOLUTION_STATUSES = new Set<EvidenceResolutionResultV1["status"]>([
  "resolved",
  "missing",
  "ambiguous",
  "forbidden",
]);
const REMEDIATION_DOMAINS = new Set<RemediationResolutionResultV1["domain"]>([
  "workup",
  "manifest",
  "review_process",
  "regenerate_clean",
]);

type ReceiptSigningContent<Payload> = Omit<
  AuthenticatedEvidenceReceiptV1<Payload>,
  "signedContentDigest" | "signature"
>;

export function artifactRegistrySnapshotDigest(
  snapshot: Omit<ArtifactRegistrySnapshotV1, "registryDigest">,
): string {
  return sha256Canonical({ domain: "selah-benchmark-artifact-registry-snapshot-v1", value: snapshot });
}

export function authenticatedEvidenceReceiptSigningDigest<Payload>(
  content: ReceiptSigningContent<Payload>,
): string {
  return sha256Canonical({ domain: "selah-authenticated-evidence-receipt-signing-v1", value: content });
}

export function authenticatedBenchmarkEvidenceBundleDigest(
  bundle: AuthenticatedBenchmarkEvidenceV1,
): string {
  return sha256Canonical({ domain: "selah-authenticated-benchmark-evidence-bundle-v1", value: bundle });
}

export function evidenceResolutionReportDigest(
  report: EvidenceResolutionReportV1,
): string {
  return sha256Canonical({ domain: "selah-benchmark-evidence-resolution-report-v1", value: report });
}

export function remediationResolutionReportDigest(
  report: RemediationResolutionReportV1,
): string {
  return sha256Canonical({ domain: "selah-benchmark-remediation-resolution-report-v1", value: report });
}

export function privacyScanReportDigest(report: PrivacyScanReportV1): string {
  return sha256Canonical({ domain: "selah-benchmark-privacy-scan-report-v1", value: report });
}

export function verifyAuthenticatedBenchmarkEvidence(
  trustedPolicy: TrustedBenchmarkEvidenceAuthorityPolicyV1,
  bundle: AuthenticatedBenchmarkEvidenceV1,
  expected: BenchmarkEvidenceExpectationsV1,
): AuthenticatedBenchmarkEvidenceVerification {
  try {
    return deepFreeze(
      verifyAuthenticatedBenchmarkEvidenceUnchecked(trustedPolicy, bundle, expected),
    );
  } catch (error) {
    return deepFreeze({
      ok: false,
      authorityPolicyId: safeString(trustedPolicy?.policyId),
      approvalKeyId: safeString(trustedPolicy?.benchmarkApproval?.keyId),
      assignmentKeyId: safeString(trustedPolicy?.reviewerAssignment?.keyId),
      validationKeyId: safeString(trustedPolicy?.reviewValidation?.keyId),
      bundleDigest: "invalid-digest",
      findings: [{
        code: "AUTHENTICATED_EVIDENCE_MALFORMED",
        path: "authenticatedEvidence",
        message: safeErrorMessage(error),
      }],
    });
  }
}

function verifyAuthenticatedBenchmarkEvidenceUnchecked(
  trustedPolicy: TrustedBenchmarkEvidenceAuthorityPolicyV1,
  bundle: AuthenticatedBenchmarkEvidenceV1,
  expected: BenchmarkEvidenceExpectationsV1,
): AuthenticatedBenchmarkEvidenceVerification {
  const findings: BenchmarkEvidenceFinding[] = [];
  const add = (code: string, path: string, message: string) => findings.push({ code, path, message });

  try {
    assertAuthorityPolicyShape(trustedPolicy);
    assertBundleShape(bundle);
    assertExpectationsShape(expected);
  } catch (error) {
    add("AUTHENTICATED_EVIDENCE_MALFORMED", "authenticatedEvidence", String((error as Error).message));
    return {
      ok: false,
      authorityPolicyId: safeString(trustedPolicy?.policyId),
      approvalKeyId: safeString(trustedPolicy?.benchmarkApproval?.keyId),
      assignmentKeyId: safeString(trustedPolicy?.reviewerAssignment?.keyId),
      validationKeyId: safeString(trustedPolicy?.reviewValidation?.keyId),
      bundleDigest: "invalid-digest",
      findings,
    };
  }

  const verificationTime = Date.parse(expected.verificationTime);
  const receiptIds = new Set<string>();
  const verifyReceipt = <Payload>(
    receipt: AuthenticatedEvidenceReceiptV1<Payload>,
    path: string,
    trustedAuthority: TrustedBenchmarkEvidenceAuthorityV1,
  ): void => {
    let publicKey: ReturnType<typeof createPublicKey> | null = null;
    try {
      publicKey = createPublicKey(trustedAuthority.publicKeyPem);
      if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("trust anchor is not an Ed25519 public key");
    } catch (error) {
      add("TRUST_ANCHOR_INVALID", `${path}.authority`, safeErrorMessage(error));
    }
    if (receiptIds.has(receipt.receiptId)) {
      add("EVIDENCE_RECEIPT_REPLAY", `${path}.receiptId`, "Receipt IDs must be unique inside one evidence bundle");
    }
    receiptIds.add(receipt.receiptId);
    if (receipt.authorityId !== trustedAuthority.authorityId || receipt.keyId !== trustedAuthority.keyId) {
      add("EVIDENCE_AUTHORITY_MISMATCH", path, "Receipt was not issued by the configured evidence authority");
    }
    if (!isCanonicalIso(receipt.issuedAt) || Date.parse(receipt.issuedAt) > verificationTime) {
      add("EVIDENCE_RECEIPT_INVALID", `${path}.issuedAt`, "Receipt issuedAt must be an ISO-compatible timestamp");
    }
    const signingContent = {
      receiptVersion: receipt.receiptVersion,
      receiptId: receipt.receiptId,
      authorityId: receipt.authorityId,
      keyId: receipt.keyId,
      issuedAt: receipt.issuedAt,
      payload: receipt.payload,
    } satisfies ReceiptSigningContent<Payload>;
    const expectedDigest = authenticatedEvidenceReceiptSigningDigest(signingContent);
    if (receipt.signedContentDigest !== expectedDigest) {
      add("EVIDENCE_CONTENT_MISMATCH", `${path}.signedContentDigest`, "Receipt content changed after signing");
    }
    const decodedSignature = BASE64.test(receipt.signature)
      ? Buffer.from(receipt.signature, "base64")
      : null;
    if (
      !decodedSignature ||
      decodedSignature.length !== 64 ||
      decodedSignature.toString("base64") !== receipt.signature ||
      !publicKey
    ) {
      add("EVIDENCE_SIGNATURE_INVALID", `${path}.signature`, "Receipt signature is missing or malformed");
      return;
    }
    try {
      const valid = verifySignature(
        null,
        Buffer.from(receipt.signedContentDigest, "utf8"),
        publicKey,
        decodedSignature,
      );
      if (!valid) add("EVIDENCE_SIGNATURE_INVALID", `${path}.signature`, "Receipt signature did not verify");
    } catch {
      add("EVIDENCE_SIGNATURE_INVALID", `${path}.signature`, "Receipt signature could not be verified");
    }
  };

  verifyReceipt(bundle.benchmarkApproval, "authenticatedEvidence.benchmarkApproval", trustedPolicy.benchmarkApproval);
  verifyReceipt(bundle.reviewerAssignment, "authenticatedEvidence.reviewerAssignment", trustedPolicy.reviewerAssignment);
  verifyReceipt(bundle.reviewValidation, "authenticatedEvidence.reviewValidation", trustedPolicy.reviewValidation);

  const assignmentPayload = bundle.reviewerAssignment.payload;
  const assignedAt = Date.parse(assignmentPayload.assignedAt);
  const expiresAt = Date.parse(assignmentPayload.expiresAt);
  if (
    Number.isNaN(verificationTime) ||
    Number.isNaN(assignedAt) ||
    Number.isNaN(expiresAt) ||
    assignedAt > verificationTime ||
    expiresAt <= verificationTime ||
    expiresAt <= assignedAt
  ) {
    add(
      "REVIEWER_ASSIGNMENT_EXPIRED",
      "authenticatedEvidence.reviewerAssignment.payload.expiresAt",
      "Reviewer assignment must be active at the trusted verification time",
    );
  }
  const approvalAt = Date.parse(bundle.benchmarkApproval.payload.approvedAt);
  const approvalReceiptAt = Date.parse(bundle.benchmarkApproval.issuedAt);
  const assignmentReceiptAt = Date.parse(bundle.reviewerAssignment.issuedAt);
  const registryCreatedAt = Date.parse(bundle.artifactRegistry.createdAt);
  const evidenceCompletedAt = Date.parse(bundle.evidenceResolutionReport.completedAt);
  const remediationCompletedAt = Date.parse(bundle.remediationResolutionReport.completedAt);
  const privacyCompletedAt = Date.parse(bundle.privacyScanReport.completedAt);
  const validationReceiptAt = Date.parse(bundle.reviewValidation.issuedAt);
  const finalReportCompletion = Math.max(
    evidenceCompletedAt,
    remediationCompletedAt,
    privacyCompletedAt,
  );
  if (
    approvalAt > approvalReceiptAt ||
    approvalReceiptAt > assignedAt ||
    approvalAt > assignedAt ||
    assignedAt > assignmentReceiptAt ||
    assignmentReceiptAt > registryCreatedAt ||
    assignedAt > registryCreatedAt ||
    registryCreatedAt > evidenceCompletedAt ||
    registryCreatedAt > remediationCompletedAt ||
    registryCreatedAt > privacyCompletedAt ||
    finalReportCompletion > validationReceiptAt ||
    validationReceiptAt > verificationTime
  ) {
    add(
      "AUTHENTICATED_EVIDENCE_CHRONOLOGY_INVALID",
      "authenticatedEvidence",
      "Approval, assignment, registry, validation reports, and final receipt are not in a valid trusted chronology",
    );
  }
  compare(
    add,
    "reviewerAssignment.payload.reviewId",
    expected.trustedCurrentState.reviewId,
    assignmentPayload.reviewId,
  );
  compare(
    add,
    "reviewerAssignment.payload.assignmentId",
    expected.trustedCurrentState.assignmentId,
    assignmentPayload.assignmentId,
  );
  if (assignmentPayload.reviewId === assignmentPayload.assignmentId) {
    add(
      "REVIEWER_ASSIGNMENT_INVALID",
      "authenticatedEvidence.reviewerAssignment.payload",
      "Review and assignment IDs must be distinct",
    );
  }
  if (
    receiptIds.has(assignmentPayload.reviewId) ||
    receiptIds.has(assignmentPayload.assignmentId)
  ) {
    add(
      "AUTHENTICATED_EVIDENCE_ID_REPLAY",
      "authenticatedEvidence",
      "Review and assignment IDs must not reuse a receipt identity",
    );
  }
  const reportIds = [
    bundle.evidenceResolutionReport.reportId,
    bundle.remediationResolutionReport.reportId,
    bundle.privacyScanReport.reportId,
  ];
  if (
    new Set(reportIds).size !== reportIds.length ||
    reportIds.some((reportId) =>
      reportId === assignmentPayload.reviewId ||
      reportId === assignmentPayload.assignmentId ||
      receiptIds.has(reportId)
    )
  ) {
    add(
      "AUTHENTICATED_EVIDENCE_ID_REPLAY",
      "authenticatedEvidence",
      "Report, review, assignment, and receipt IDs must use distinct identities",
    );
  }

  const registry = bundle.artifactRegistry;
  const registryWithoutDigest = {
    registryVersion: registry.registryVersion,
    recordId: registry.recordId,
    revision: registry.revision,
    createdAt: registry.createdAt,
    subject: registry.subject,
    prerequisiteVerdicts: registry.prerequisiteVerdicts,
    draftDigest: registry.draftDigest,
    generationManifestDigest: registry.generationManifestDigest,
    structuralReportDigest: registry.structuralReportDigest,
    sourceOverlapReportDigest: registry.sourceOverlapReportDigest,
    freshnessReportDigest: registry.freshnessReportDigest,
    approvedVoiceExampleDigest: registry.approvedVoiceExampleDigest,
    benchmarkSetDigest: registry.benchmarkSetDigest,
    rubricDigest: registry.rubricDigest,
    entries: registry.entries,
  };
  const computedRegistryDigest = artifactRegistrySnapshotDigest(registryWithoutDigest);
  if (registry.registryDigest !== computedRegistryDigest) {
    add("ARTIFACT_REGISTRY_MISMATCH", "authenticatedEvidence.artifactRegistry.registryDigest", "Artifact registry snapshot changed after it was digested");
  }
  const registryPaths = new Set<string>();
  const registryByPath = new Map<string, ArtifactRegistryEntryV1>();
  for (const [index, entry] of registry.entries.entries()) {
    if (index > 0 && registry.entries[index - 1].path >= entry.path) {
      add("ARTIFACT_REGISTRY_INVALID", `authenticatedEvidence.artifactRegistry.entries[${index}].path`, "Artifact registry entries must be uniquely sorted by path");
    }
    if (registryPaths.has(entry.path)) {
      add("ARTIFACT_REGISTRY_INVALID", `authenticatedEvidence.artifactRegistry.entries[${index}].path`, "Artifact registry paths must be unique");
    }
    registryPaths.add(entry.path);
    registryByPath.set(entry.path, entry);
    if (!DIGEST.test(entry.digest)) {
      add("ARTIFACT_REGISTRY_INVALID", `authenticatedEvidence.artifactRegistry.entries[${index}].digest`, "Registry entries require lowercase SHA-256 digests");
    }
  }
  for (const [index, entry] of registry.entries.entries()) {
    const expectedIdentity = expectedRegistryIdentity(entry.path);
    const root = registryByPath.get(entry.rootPath);
    if (!expectedIdentity || entry.artifactType !== expectedIdentity.artifactType) {
      add("ARTIFACT_REGISTRY_INVALID", `authenticatedEvidence.artifactRegistry.entries[${index}].artifactType`, "Registry namespace and artifact type do not agree");
    }
    if (
      !expectedIdentity ||
      entry.rootPath !== expectedIdentity.rootPath ||
      !root ||
      root.rootPath !== root.path ||
      root.rootDigest !== root.digest ||
      root.artifactType !== entry.artifactType ||
      root.recordId !== entry.recordId ||
      root.revision !== entry.revision ||
      entry.rootDigest !== root.digest
    ) {
      add("ARTIFACT_REGISTRY_INVALID", `authenticatedEvidence.artifactRegistry.entries[${index}].rootPath`, "Registry subpaths must bind the exact authenticated root record, revision, and digest");
    }
  }
  for (const path of [
    ...expected.evidencePaths.map((item) => item.path),
    ...expected.remediationTargets.map((item) => item.path),
  ]) {
    if (!registryPaths.has(path)) {
      add("ARTIFACT_REGISTRY_INCOMPLETE", "authenticatedEvidence.artifactRegistry.entries", `The bound artifact registry does not contain ${path}`);
    }
  }

  const requiredRoots: Array<{
    path: string;
    artifactType: ArtifactRegistryEntryV1["artifactType"];
    digest: string;
  }> = [
    { path: "workup:/__artifact__", artifactType: "workup", digest: expected.draftDigest },
    { path: "manifest:/__artifact__", artifactType: "manifest", digest: expected.generationManifestDigest },
    { path: "structural-report:/__artifact__", artifactType: "structural_report", digest: expected.structuralReportDigest },
    { path: "source-overlap-report:/__artifact__", artifactType: "source_overlap_report", digest: expected.sourceOverlapReportDigest },
    { path: "freshness-report:/__artifact__", artifactType: "freshness_report", digest: expected.freshnessReportDigest },
    { path: "voice-example:/__artifact__", artifactType: "voice_example", digest: expected.approvedVoiceExampleDigest },
    { path: "benchmark-set:/__artifact__", artifactType: "benchmark_set", digest: expected.benchmarkSetDigest },
    { path: "rubric:/__artifact__", artifactType: "rubric", digest: expected.rubricDigest },
  ];
  for (const required of requiredRoots) {
    const entry = registry.entries.find((candidate) => candidate.path === required.path);
    if (
      !entry ||
      entry.artifactType !== required.artifactType ||
      entry.digest !== required.digest
    ) {
      add(
        "ARTIFACT_REGISTRY_INCOMPLETE",
        `authenticatedEvidence.artifactRegistry.entries.${required.path}`,
        "The authenticated registry is missing a canonical root artifact or binds the wrong digest",
      );
    }
  }

  compare(add, "trustedCurrentState.draftDigest", expected.trustedCurrentState.draftDigest, registry.draftDigest);
  compare(add, "trustedCurrentState.generationManifestDigest", expected.trustedCurrentState.generationManifestDigest, registry.generationManifestDigest);
  compare(add, "trustedCurrentState.artifactRegistry.recordId", expected.trustedCurrentState.artifactRegistry.recordId, registry.recordId);
  compare(add, "trustedCurrentState.artifactRegistry.revision", expected.trustedCurrentState.artifactRegistry.revision, registry.revision);
  compare(add, "trustedCurrentState.artifactRegistry.registryDigest", expected.trustedCurrentState.artifactRegistry.registryDigest, registry.registryDigest);

  compareCanonical(add, "artifactRegistry.subject", expected.subject, registry.subject);
  compareCanonical(
    add,
    "artifactRegistry.prerequisiteVerdicts",
    expected.prerequisiteVerdicts,
    registry.prerequisiteVerdicts,
  );
  compare(add, "artifactRegistry.draftDigest", expected.draftDigest, registry.draftDigest);
  compare(add, "artifactRegistry.generationManifestDigest", expected.generationManifestDigest, registry.generationManifestDigest);
  compare(add, "artifactRegistry.structuralReportDigest", expected.structuralReportDigest, registry.structuralReportDigest);
  compare(add, "artifactRegistry.sourceOverlapReportDigest", expected.sourceOverlapReportDigest, registry.sourceOverlapReportDigest);
  compare(add, "artifactRegistry.freshnessReportDigest", expected.freshnessReportDigest, registry.freshnessReportDigest);
  compare(add, "artifactRegistry.approvedVoiceExampleDigest", expected.approvedVoiceExampleDigest, registry.approvedVoiceExampleDigest);
  compare(add, "artifactRegistry.benchmarkSetDigest", expected.benchmarkSetDigest, registry.benchmarkSetDigest);
  compare(add, "artifactRegistry.rubricDigest", expected.rubricDigest, registry.rubricDigest);

  const approvalPayload: BenchmarkApprovalReceiptPayloadV1 = {
    evidenceType: "benchmark-set-owner-approval",
    setId: expected.benchmarkSetId,
    setDigest: expected.benchmarkSetDigest,
    recordId: expected.benchmarkApproval.recordId,
    approvedBy: expected.benchmarkApproval.approvedBy,
    approvedAt: expected.benchmarkApproval.approvedAt,
  };
  compareCanonical(add, "benchmarkApproval.payload", approvalPayload, bundle.benchmarkApproval.payload);

  if (!SAFE_ID.test(assignmentPayload.assignmentId)) {
    add("REVIEWER_ASSIGNMENT_INVALID", "authenticatedEvidence.reviewerAssignment.payload.assignmentId", "Reviewer assignment requires a stable assignment ID");
  }
  const expectedAssignmentPayload: ReviewerAssignmentReceiptPayloadV1 = {
    evidenceType: "benchmark-reviewer-assignment",
    assignmentId: expected.trustedCurrentState.assignmentId,
    reviewId: expected.trustedCurrentState.reviewId,
    assignedAt: assignmentPayload.assignedAt,
    expiresAt: assignmentPayload.expiresAt,
    author: expected.author,
    reviewer: expected.reviewer,
    independentFromAuthor: true,
    subject: expected.subject,
    draftDigest: expected.draftDigest,
    generationManifestDigest: expected.generationManifestDigest,
    benchmarkSetDigest: expected.benchmarkSetDigest,
    rubricDigest: expected.rubricDigest,
    approvedVoiceExampleDigest: expected.approvedVoiceExampleDigest,
    comparisonMode: expected.comparisonMode,
  };
  compareCanonical(add, "reviewerAssignment.payload", expectedAssignmentPayload, assignmentPayload);
  if (expected.independentFromAuthor !== true) {
    add("REVIEWER_ASSIGNMENT_INVALID", "reviewerAssignment.independentFromAuthor", "Assigned reviewer must be independent from the author");
  }
  if (expected.author.id === expected.reviewer.id) {
    add(
      "REVIEWER_ASSIGNMENT_INVALID",
      "reviewerAssignment.author",
      "The assigned reviewer must not be the same principal as the draft author",
    );
  }

  const validationPayload = bundle.reviewValidation.payload;
  if (!SAFE_ID.test(validationPayload.reviewId)) {
    add("REVIEW_VALIDATION_INVALID", "authenticatedEvidence.reviewValidation.payload.reviewId", "Review validation requires a stable review ID");
  }
  const evidenceReportDigest = evidenceResolutionReportDigest(bundle.evidenceResolutionReport);
  const remediationReportDigest = remediationResolutionReportDigest(bundle.remediationResolutionReport);
  const privacyReportDigest = privacyScanReportDigest(bundle.privacyScanReport);
  const evidenceVerdict = validateEvidenceResolutionReport(
    add,
    bundle.evidenceResolutionReport,
    registry,
    expected,
  );
  const remediationVerdict = validateRemediationResolutionReport(
    add,
    bundle.remediationResolutionReport,
    registry,
    expected,
  );
  const privacyVerdict = validatePrivacyScanReport(
    add,
    bundle.privacyScanReport,
    expected,
  );

  compare(add, "evidenceResolution.reportDigest", expected.evidenceResolution.reportDigest, evidenceReportDigest);
  compare(add, "evidenceResolution.verdict", expected.evidenceResolution.verdict, evidenceVerdict);
  compare(add, "remediationResolution.reportDigest", expected.remediationResolution.reportDigest, remediationReportDigest);
  compare(add, "remediationResolution.verdict", expected.remediationResolution.verdict, remediationVerdict);
  compare(add, "privacyScan.reportDigest", expected.privacyScan.reportDigest, privacyReportDigest);
  compare(add, "privacyScan.verdict", expected.privacyScan.verdict, privacyVerdict);

  const expectedValidationPayload: ReviewValidationReceiptPayloadV1 = {
    evidenceType: "benchmark-review-validation",
    reviewId: expected.trustedCurrentState.reviewId,
    assignmentId: expected.trustedCurrentState.assignmentId,
    reviewer: expected.reviewer,
    subject: expected.subject,
    draftDigest: expected.draftDigest,
    generationManifestDigest: expected.generationManifestDigest,
    benchmarkSetDigest: expected.benchmarkSetDigest,
    rubricDigest: expected.rubricDigest,
    evidencePolicyDigest: expected.evidencePolicyDigest,
    approvedVoiceExampleDigest: expected.approvedVoiceExampleDigest,
    reviewContentDigest: expected.reviewContentDigest,
    artifactRegistryDigest: registry.registryDigest,
    resolverVersion: expected.resolverVersion,
    evidenceResolution: { reportDigest: evidenceReportDigest, verdict: evidenceVerdict },
    remediationResolution: { reportDigest: remediationReportDigest, verdict: remediationVerdict },
    privacyScan: {
      scannerVersion: expected.privacyScannerVersion,
      reportDigest: privacyReportDigest,
      verdict: privacyVerdict,
    },
  };
  if (!SAFE_ID.test(validationPayload.privacyScan.scannerVersion)) {
    add("REVIEW_VALIDATION_INVALID", "authenticatedEvidence.reviewValidation.payload.privacyScan.scannerVersion", "Privacy scan requires a versioned scanner identity");
  }
  compareCanonical(add, "reviewValidation.payload", expectedValidationPayload, validationPayload);

  for (const [path, verdict] of [
    ["reviewValidation.evidenceResolution.verdict", evidenceVerdict],
    ["reviewValidation.remediationResolution.verdict", remediationVerdict],
    ["reviewValidation.privacyScan.verdict", privacyVerdict],
  ] as const) {
    if (verdict !== "pass") add("AUTHENTICATED_REVIEW_VALIDATION_BLOCKED", path, "Authenticated validation evidence did not pass");
  }

  const sorted = [...findings].sort((a, b) => a.code.localeCompare(b.code) || a.path.localeCompare(b.path));
  return {
    ok: sorted.length === 0,
    authorityPolicyId: trustedPolicy.policyId,
    approvalKeyId: trustedPolicy.benchmarkApproval.keyId,
    assignmentKeyId: trustedPolicy.reviewerAssignment.keyId,
    validationKeyId: trustedPolicy.reviewValidation.keyId,
    bundleDigest: authenticatedBenchmarkEvidenceBundleDigest(bundle),
    findings: sorted,
  };
}

type AddEvidenceFinding = (code: string, path: string, message: string) => void;

function validateEvidenceResolutionReport(
  add: AddEvidenceFinding,
  report: EvidenceResolutionReportV1,
  registry: ArtifactRegistrySnapshotV1,
  expected: BenchmarkEvidenceExpectationsV1,
): "pass" | "block" {
  let passed = true;
  const block = (code: string, path: string, message: string) => {
    passed = false;
    add(code, path, message);
  };
  const prefix = "authenticatedEvidence.evidenceResolutionReport";
  compareCanonical(add, `${prefix}.identity`, {
    reviewId: expected.trustedCurrentState.reviewId,
    reviewContentDigest: expected.reviewContentDigest,
    draftDigest: expected.draftDigest,
    artifactRegistryDigest: registry.registryDigest,
    rubricDigest: expected.rubricDigest,
    evidencePolicyDigest: expected.evidencePolicyDigest,
    resolverVersion: expected.resolverVersion,
  }, {
    reviewId: report.reviewId,
    reviewContentDigest: report.reviewContentDigest,
    draftDigest: report.draftDigest,
    artifactRegistryDigest: report.artifactRegistryDigest,
    rubricDigest: report.rubricDigest,
    evidencePolicyDigest: report.evidencePolicyDigest,
    resolverVersion: report.resolverVersion,
  });
  if (sha256Canonical({
    reviewId: expected.trustedCurrentState.reviewId,
    reviewContentDigest: expected.reviewContentDigest,
    draftDigest: expected.draftDigest,
    artifactRegistryDigest: registry.registryDigest,
    rubricDigest: expected.rubricDigest,
    evidencePolicyDigest: expected.evidencePolicyDigest,
    resolverVersion: expected.resolverVersion,
  }) !== sha256Canonical({
    reviewId: report.reviewId,
    reviewContentDigest: report.reviewContentDigest,
    draftDigest: report.draftDigest,
    artifactRegistryDigest: report.artifactRegistryDigest,
    rubricDigest: report.rubricDigest,
    evidencePolicyDigest: report.evidencePolicyDigest,
    resolverVersion: report.resolverVersion,
  })) passed = false;
  if (!validCompletedAt(report.completedAt, expected.verificationTime)) {
    block("EVIDENCE_RESOLUTION_BLOCKED", `${prefix}.completedAt`, "Evidence resolution must complete no later than the trusted verification time");
  }

  const expectedKeys = new Set(expected.evidencePaths.map(({ criterionId, path }) => `${criterionId}\u0000${path}`));
  if (expectedKeys.size !== expected.evidencePaths.length) {
    block("EVIDENCE_RESOLUTION_BLOCKED", "expectations.evidencePaths", "Expected evidence paths must be unique by criterion and path");
  }
  const actualKeys = new Set<string>();
  for (const [index, result] of report.results.entries()) {
    const resultPath = `${prefix}.results[${index}]`;
    const key = `${result.criterionId}\u0000${result.submittedPath}`;
    if (actualKeys.has(key)) block("EVIDENCE_RESOLUTION_BLOCKED", resultPath, "Evidence resolution results must be unique");
    actualKeys.add(key);
    if (!expectedKeys.has(key)) block("EVIDENCE_RESOLUTION_BLOCKED", resultPath, "Evidence resolution contains an unexpected criterion/path pair");
    if (result.status !== "resolved") block("EVIDENCE_RESOLUTION_BLOCKED", `${resultPath}.status`, "Every submitted evidence path must resolve exactly once");
    if (result.registryPath !== result.submittedPath) block("EVIDENCE_RESOLUTION_BLOCKED", `${resultPath}.registryPath`, "Resolved evidence must point to the exact submitted registry path");
    const entry = registry.entries.find((candidate) => candidate.path === result.registryPath);
    if (!entry || result.artifactDigest !== entry.digest) {
      block("EVIDENCE_RESOLUTION_BLOCKED", `${resultPath}.artifactDigest`, "Resolved evidence must bind the digest in the authenticated registry snapshot");
    }
  }
  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) block("EVIDENCE_RESOLUTION_BLOCKED", `${prefix}.results`, "Evidence resolution is missing a submitted criterion/path pair");
  }
  return passed ? "pass" : "block";
}

function validateRemediationResolutionReport(
  add: AddEvidenceFinding,
  report: RemediationResolutionReportV1,
  registry: ArtifactRegistrySnapshotV1,
  expected: BenchmarkEvidenceExpectationsV1,
): "pass" | "block" {
  let passed = true;
  const block = (code: string, path: string, message: string) => {
    passed = false;
    add(code, path, message);
  };
  const prefix = "authenticatedEvidence.remediationResolutionReport";
  const expectedIdentity = {
    reviewId: expected.trustedCurrentState.reviewId,
    reviewContentDigest: expected.reviewContentDigest,
    draftDigest: expected.draftDigest,
    artifactRegistryDigest: registry.registryDigest,
    rubricDigest: expected.rubricDigest,
    evidencePolicyDigest: expected.evidencePolicyDigest,
    resolverVersion: expected.resolverVersion,
  };
  const actualIdentity = {
    reviewId: report.reviewId,
    reviewContentDigest: report.reviewContentDigest,
    draftDigest: report.draftDigest,
    artifactRegistryDigest: report.artifactRegistryDigest,
    rubricDigest: report.rubricDigest,
    evidencePolicyDigest: report.evidencePolicyDigest,
    resolverVersion: report.resolverVersion,
  };
  compareCanonical(add, `${prefix}.identity`, expectedIdentity, actualIdentity);
  if (sha256Canonical(expectedIdentity) !== sha256Canonical(actualIdentity)) passed = false;
  if (!validCompletedAt(report.completedAt, expected.verificationTime)) {
    block("REMEDIATION_RESOLUTION_BLOCKED", `${prefix}.completedAt`, "Remediation resolution must complete no later than the trusted verification time");
  }
  const keyFor = (value: { criterionId: string; domain: string; path?: string; submittedPath?: string }) =>
    `${value.criterionId}\u0000${value.domain}\u0000${value.path ?? value.submittedPath}`;
  const expectedKeys = new Set(expected.remediationTargets.map(keyFor));
  if (expectedKeys.size !== expected.remediationTargets.length) {
    block("REMEDIATION_RESOLUTION_BLOCKED", "expectations.remediationTargets", "Expected remediation targets must be unique");
  }
  const actualKeys = new Set<string>();
  for (const [index, result] of report.results.entries()) {
    const resultPath = `${prefix}.results[${index}]`;
    const key = keyFor(result);
    if (actualKeys.has(key)) block("REMEDIATION_RESOLUTION_BLOCKED", resultPath, "Remediation resolution results must be unique");
    actualKeys.add(key);
    if (!expectedKeys.has(key)) block("REMEDIATION_RESOLUTION_BLOCKED", resultPath, "Remediation resolution contains an unexpected target");
    if (result.status !== "resolved") block("REMEDIATION_RESOLUTION_BLOCKED", `${resultPath}.status`, "Every submitted remediation target must resolve exactly once");
    if (result.registryPath !== result.submittedPath) block("REMEDIATION_RESOLUTION_BLOCKED", `${resultPath}.registryPath`, "Resolved remediation must point to the exact submitted registry path");
    const entry = registry.entries.find((candidate) => candidate.path === result.registryPath);
    if (!entry || result.artifactDigest !== entry.digest) {
      block("REMEDIATION_RESOLUTION_BLOCKED", `${resultPath}.artifactDigest`, "Resolved remediation must bind the digest in the authenticated registry snapshot");
    }
  }
  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) block("REMEDIATION_RESOLUTION_BLOCKED", `${prefix}.results`, "Remediation resolution is missing a submitted target");
  }
  return passed ? "pass" : "block";
}

function validatePrivacyScanReport(
  add: AddEvidenceFinding,
  report: PrivacyScanReportV1,
  expected: BenchmarkEvidenceExpectationsV1,
): "pass" | "block" {
  let passed = true;
  const block = (code: string, path: string, message: string) => {
    passed = false;
    add(code, path, message);
  };
  const prefix = "authenticatedEvidence.privacyScanReport";
  const expectedIdentity = {
    reviewId: expected.trustedCurrentState.reviewId,
    reviewContentDigest: expected.reviewContentDigest,
    benchmarkSetDigest: expected.benchmarkSetDigest,
    approvedVoiceExampleDigest: expected.approvedVoiceExampleDigest,
    scannerVersion: expected.privacyScannerVersion,
  };
  const actualIdentity = {
    reviewId: report.reviewId,
    reviewContentDigest: report.reviewContentDigest,
    benchmarkSetDigest: report.benchmarkSetDigest,
    approvedVoiceExampleDigest: report.approvedVoiceExampleDigest,
    scannerVersion: report.scannerVersion,
  };
  compareCanonical(add, `${prefix}.identity`, expectedIdentity, actualIdentity);
  if (sha256Canonical(expectedIdentity) !== sha256Canonical(actualIdentity)) passed = false;
  if (!validCompletedAt(report.completedAt, expected.verificationTime)) {
    block("PRIVACY_SCAN_BLOCKED", `${prefix}.completedAt`, "Privacy scan must complete no later than the trusted verification time");
  }
  if (report.executionStatus !== "complete") {
    block("PRIVACY_SCAN_BLOCKED", `${prefix}.executionStatus`, "Privacy scanner did not complete successfully");
  }
  const expectedFields = [...new Set(expected.privacyFieldPaths)].sort();
  const actualFields = [...new Set(report.scannedFieldPaths)].sort();
  if (
    expectedFields.length !== expected.privacyFieldPaths.length ||
    actualFields.length !== report.scannedFieldPaths.length ||
    sha256Canonical(expectedFields) !== sha256Canonical(actualFields)
  ) {
    block("PRIVACY_SCAN_BLOCKED", `${prefix}.scannedFieldPaths`, "Privacy scan must cover every persisted rationale and revision instruction exactly once");
  }
  if (report.findings.length > 0) {
    block("PRIVACY_SCAN_BLOCKED", `${prefix}.findings`, "Private benchmark or exemplar wording was detected in persisted review prose");
  }
  return passed ? "pass" : "block";
}

function validCompletedAt(completedAt: string, verificationTime: string): boolean {
  const completed = Date.parse(completedAt);
  const verified = Date.parse(verificationTime);
  return !Number.isNaN(completed) && !Number.isNaN(verified) && completed <= verified;
}

function expectedRegistryIdentity(
  path: string,
): { rootPath: string; artifactType: ArtifactRegistryEntryV1["artifactType"] } | null {
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
    ["review-evidence:/", "review_evidence"],
    ["review:/", "remediation_target"],
    ["generation:/", "remediation_target"],
    ["remediation-target:/", "remediation_target"],
  ];
  const match = mappings.find(([prefix]) => path.startsWith(prefix));
  return match
    ? { rootPath: `${match[0]}__artifact__`, artifactType: match[1] }
    : null;
}

function compare(
  add: (code: string, path: string, message: string) => void,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (expected !== actual) add("AUTHENTICATED_EVIDENCE_MISMATCH", path, `${path} does not match authenticated evidence`);
}

function compareCanonical(
  add: (code: string, path: string, message: string) => void,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (sha256Canonical(expected) !== sha256Canonical(actual)) {
    add("AUTHENTICATED_EVIDENCE_MISMATCH", path, `${path} does not match authenticated evidence`);
  }
}

function assertAuthorityPolicyShape(value: TrustedBenchmarkEvidenceAuthorityPolicyV1): void {
  assertPlainRecord(value, "trustedAuthorityPolicy");
  assertExactKeys(value, "trustedAuthorityPolicy", [
    "policyVersion",
    "policyId",
    "benchmarkApproval",
    "reviewerAssignment",
    "reviewValidation",
  ]);
  if (
    value.policyVersion !== "selah-benchmark-evidence-authority-policy-v1" ||
    !SAFE_ID.test(value.policyId)
  ) throw new Error("invalid benchmark evidence authority policy");
  assertAuthorityShape(value.benchmarkApproval, "trustedAuthorityPolicy.benchmarkApproval");
  assertAuthorityShape(value.reviewerAssignment, "trustedAuthorityPolicy.reviewerAssignment");
  assertAuthorityShape(value.reviewValidation, "trustedAuthorityPolicy.reviewValidation");
  const keyIds = [
    value.benchmarkApproval.keyId,
    value.reviewerAssignment.keyId,
    value.reviewValidation.keyId,
  ];
  if (new Set(keyIds).size !== keyIds.length) {
    throw new Error("benchmark approval, reviewer assignment, and review validation require distinct authority keys");
  }
  const publicKeys = [
    canonicalPublicKeyIdentity(value.benchmarkApproval),
    canonicalPublicKeyIdentity(value.reviewerAssignment),
    canonicalPublicKeyIdentity(value.reviewValidation),
  ];
  if (new Set(publicKeys).size !== publicKeys.length) {
    throw new Error("benchmark evidence roles cannot reuse the same public key under different key IDs");
  }
}

function canonicalPublicKeyIdentity(
  authority: TrustedBenchmarkEvidenceAuthorityV1,
): string {
  const publicKey = createPublicKey(authority.publicKeyPem);
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("benchmark evidence trust anchor is not an Ed25519 public key");
  }
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

function assertAuthorityShape(value: TrustedBenchmarkEvidenceAuthorityV1, path: string): void {
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["authorityVersion", "authorityId", "keyId", "algorithm", "publicKeyPem"]);
  if (
    value.authorityVersion !== "selah-benchmark-evidence-authority-v1" ||
    value.algorithm !== "ed25519" ||
    !SAFE_ID.test(value.authorityId) ||
    !SAFE_ID.test(value.keyId) ||
    value.publicKeyPem.length > 1_000 ||
    !PUBLIC_KEY_PEM.test(value.publicKeyPem.trim())
  ) {
    throw new Error("invalid benchmark evidence trust anchor");
  }
}

function assertBundleShape(value: AuthenticatedBenchmarkEvidenceV1): void {
  assertPlainRecord(value, "authenticatedEvidence");
  assertExactKeys(value, "authenticatedEvidence", [
    "bundleVersion",
    "artifactRegistry",
    "evidenceResolutionReport",
    "remediationResolutionReport",
    "privacyScanReport",
    "benchmarkApproval",
    "reviewerAssignment",
    "reviewValidation",
  ]);
  if (value.bundleVersion !== "selah-authenticated-benchmark-evidence-v1") throw new Error("invalid authenticated evidence bundle version");
  assertRegistryShape(value.artifactRegistry);
  assertEvidenceResolutionReportShape(value.evidenceResolutionReport);
  assertRemediationResolutionReportShape(value.remediationResolutionReport);
  assertPrivacyScanReportShape(value.privacyScanReport);
  assertReceiptShape(value.benchmarkApproval, "authenticatedEvidence.benchmarkApproval");
  assertReceiptShape(value.reviewerAssignment, "authenticatedEvidence.reviewerAssignment");
  assertReceiptShape(value.reviewValidation, "authenticatedEvidence.reviewValidation");
  assertApprovalPayloadShape(value.benchmarkApproval.payload);
  assertAssignmentPayloadShape(value.reviewerAssignment.payload);
  assertValidationPayloadShape(value.reviewValidation.payload);
}

function assertRegistryShape(value: ArtifactRegistrySnapshotV1): void {
  assertPlainRecord(value, "authenticatedEvidence.artifactRegistry");
  assertExactKeys(value, "authenticatedEvidence.artifactRegistry", ["registryVersion", "recordId", "revision", "createdAt", "subject", "prerequisiteVerdicts", "draftDigest", "generationManifestDigest", "structuralReportDigest", "sourceOverlapReportDigest", "freshnessReportDigest", "approvedVoiceExampleDigest", "benchmarkSetDigest", "rubricDigest", "entries", "registryDigest"]);
  if (value.registryVersion !== "selah-benchmark-artifact-registry-v1") throw new Error("invalid artifact registry version");
  if (!SAFE_ID.test(value.recordId) || !SAFE_ID.test(value.revision) || !isCanonicalIso(value.createdAt)) throw new Error("invalid artifact registry identity");
  assertSubjectShape(value.subject, "authenticatedEvidence.artifactRegistry.subject");
  assertPrerequisiteVerdictsShape(
    value.prerequisiteVerdicts,
    "authenticatedEvidence.artifactRegistry.prerequisiteVerdicts",
  );
  for (const key of ["draftDigest", "generationManifestDigest", "structuralReportDigest", "sourceOverlapReportDigest", "freshnessReportDigest", "approvedVoiceExampleDigest", "benchmarkSetDigest", "rubricDigest", "registryDigest"] as const) {
    if (!DIGEST.test(value[key])) throw new Error(`invalid artifact registry digest at ${key}`);
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) throw new Error("artifact registry entries are missing");
  assertDenseArray(value.entries, "authenticatedEvidence.artifactRegistry.entries", 1_000);
  value.entries.forEach((entry, index) => {
    assertPlainRecord(entry, `authenticatedEvidence.artifactRegistry.entries[${index}]`);
    assertExactKeys(entry, `authenticatedEvidence.artifactRegistry.entries[${index}]`, ["path", "rootPath", "artifactType", "recordId", "revision", "rootDigest", "digest"]);
    if (
      !isRegistryPath(entry.path) ||
      !isRegistryPath(entry.rootPath) ||
      !ARTIFACT_TYPES.has(entry.artifactType) ||
      !SAFE_ID.test(entry.recordId) ||
      !SAFE_ID.test(entry.revision) ||
      !DIGEST.test(entry.rootDigest) ||
      !DIGEST.test(entry.digest)
    ) throw new Error(`invalid artifact registry entry at ${index}`);
  });
}

function assertEvidenceResolutionReportShape(value: EvidenceResolutionReportV1): void {
  const path = "authenticatedEvidence.evidenceResolutionReport";
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["reportVersion", "reportId", "reviewId", "reviewContentDigest", "draftDigest", "artifactRegistryDigest", "rubricDigest", "evidencePolicyDigest", "resolverVersion", "completedAt", "results"]);
  if (
    value.reportVersion !== "selah-benchmark-evidence-resolution-report-v1" ||
    !SAFE_ID.test(value.reportId) ||
    !SAFE_ID.test(value.reviewId) ||
    !SAFE_ID.test(value.resolverVersion) ||
    !isCanonicalIso(value.completedAt)
  ) throw new Error("invalid evidence resolution report identity");
  for (const key of ["reviewContentDigest", "draftDigest", "artifactRegistryDigest", "rubricDigest", "evidencePolicyDigest"] as const) {
    if (!DIGEST.test(value[key])) throw new Error(`invalid evidence resolution digest at ${key}`);
  }
  assertDenseArray(value.results, `${path}.results`, 156);
  value.results.forEach((result, index) => {
    const resultPath = `${path}.results[${index}]`;
    assertPlainRecord(result, resultPath);
    assertExactKeys(result, resultPath, ["criterionId", "submittedPath", "status", "registryPath", "artifactDigest"]);
    if (
      !SAFE_ID.test(result.criterionId) ||
      !isRegistryPath(result.submittedPath) ||
      !RESOLUTION_STATUSES.has(result.status) ||
      (result.registryPath !== null && !isRegistryPath(result.registryPath)) ||
      (result.artifactDigest !== null && !DIGEST.test(result.artifactDigest))
    ) throw new Error(`invalid evidence resolution result at ${index}`);
  });
}

function assertRemediationResolutionReportShape(value: RemediationResolutionReportV1): void {
  const path = "authenticatedEvidence.remediationResolutionReport";
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["reportVersion", "reportId", "reviewId", "reviewContentDigest", "draftDigest", "artifactRegistryDigest", "rubricDigest", "evidencePolicyDigest", "resolverVersion", "completedAt", "results"]);
  if (
    value.reportVersion !== "selah-benchmark-remediation-resolution-report-v1" ||
    !SAFE_ID.test(value.reportId) ||
    !SAFE_ID.test(value.reviewId) ||
    !SAFE_ID.test(value.resolverVersion) ||
    !isCanonicalIso(value.completedAt)
  ) throw new Error("invalid remediation resolution report identity");
  for (const key of ["reviewContentDigest", "draftDigest", "artifactRegistryDigest", "rubricDigest", "evidencePolicyDigest"] as const) {
    if (!DIGEST.test(value[key])) throw new Error(`invalid remediation resolution digest at ${key}`);
  }
  assertDenseArray(value.results, `${path}.results`, 104);
  value.results.forEach((result, index) => {
    const resultPath = `${path}.results[${index}]`;
    assertPlainRecord(result, resultPath);
    assertExactKeys(result, resultPath, ["criterionId", "domain", "submittedPath", "status", "registryPath", "artifactDigest"]);
    if (
      !SAFE_ID.test(result.criterionId) ||
      !REMEDIATION_DOMAINS.has(result.domain) ||
      !isRegistryPath(result.submittedPath) ||
      !RESOLUTION_STATUSES.has(result.status) ||
      (result.registryPath !== null && !isRegistryPath(result.registryPath)) ||
      (result.artifactDigest !== null && !DIGEST.test(result.artifactDigest))
    ) throw new Error(`invalid remediation resolution result at ${index}`);
  });
}

function assertPrivacyScanReportShape(value: PrivacyScanReportV1): void {
  const path = "authenticatedEvidence.privacyScanReport";
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["reportVersion", "reportId", "reviewId", "reviewContentDigest", "benchmarkSetDigest", "approvedVoiceExampleDigest", "scannerVersion", "executionStatus", "completedAt", "scannedFieldPaths", "findings"]);
  if (
    value.reportVersion !== "selah-benchmark-privacy-scan-report-v1" ||
    !SAFE_ID.test(value.reportId) ||
    !SAFE_ID.test(value.reviewId) ||
    !SAFE_ID.test(value.scannerVersion) ||
    !["complete", "error"].includes(value.executionStatus) ||
    !isCanonicalIso(value.completedAt)
  ) throw new Error("invalid privacy scan report identity");
  for (const key of ["reviewContentDigest", "benchmarkSetDigest", "approvedVoiceExampleDigest"] as const) {
    if (!DIGEST.test(value[key])) throw new Error(`invalid privacy scan digest at ${key}`);
  }
  assertDenseArray(value.scannedFieldPaths, `${path}.scannedFieldPaths`, 117);
  if (value.scannedFieldPaths.some((fieldPath) => !isBoundedPath(fieldPath))) throw new Error("invalid privacy scan field path");
  assertDenseArray(value.findings, `${path}.findings`, 2_000);
  value.findings.forEach((finding, index) => {
    const findingPath = `${path}.findings[${index}]`;
    assertPlainRecord(finding, findingPath);
    assertExactKeys(finding, findingPath, ["code", "reviewPath", "protectedSource", "matchFingerprintDigest"]);
    if (
      !SAFE_ID.test(finding.code) ||
      !isBoundedPath(finding.reviewPath) ||
      !["benchmark", "voice_example"].includes(finding.protectedSource) ||
      !DIGEST.test(finding.matchFingerprintDigest)
    ) throw new Error(`invalid privacy scan finding at ${index}`);
  });
}

function assertReceiptShape<Payload>(value: AuthenticatedEvidenceReceiptV1<Payload>, path: string): void {
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["receiptVersion", "receiptId", "authorityId", "keyId", "issuedAt", "payload", "signedContentDigest", "signature"]);
  if (
    value.receiptVersion !== "selah-authenticated-evidence-receipt-v1" ||
    !SAFE_ID.test(value.receiptId) ||
    !SAFE_ID.test(value.authorityId) ||
    !SAFE_ID.test(value.keyId) ||
    !isCanonicalIso(value.issuedAt) ||
    !DIGEST.test(value.signedContentDigest) ||
    typeof value.signature !== "string" ||
    value.signature.length > 128
  ) throw new Error(`invalid authenticated evidence receipt at ${path}`);
}

function assertApprovalPayloadShape(value: BenchmarkApprovalReceiptPayloadV1): void {
  assertPlainRecord(value, "benchmarkApproval.payload");
  assertExactKeys(value, "benchmarkApproval.payload", ["evidenceType", "setId", "setDigest", "recordId", "approvedBy", "approvedAt"]);
  if (
    value.evidenceType !== "benchmark-set-owner-approval" ||
    !SAFE_ID.test(value.setId) ||
    !DIGEST.test(value.setDigest) ||
    !SAFE_ID.test(value.recordId) ||
    !SAFE_ID.test(value.approvedBy) ||
    !isCanonicalIso(value.approvedAt)
  ) throw new Error("invalid benchmark approval evidence payload");
}

function assertAssignmentPayloadShape(value: ReviewerAssignmentReceiptPayloadV1): void {
  assertPlainRecord(value, "reviewerAssignment.payload");
  assertExactKeys(value, "reviewerAssignment.payload", ["evidenceType", "assignmentId", "reviewId", "assignedAt", "expiresAt", "author", "reviewer", "independentFromAuthor", "subject", "draftDigest", "generationManifestDigest", "benchmarkSetDigest", "rubricDigest", "approvedVoiceExampleDigest", "comparisonMode"]);
  if (value.evidenceType !== "benchmark-reviewer-assignment") throw new Error("invalid reviewer assignment evidence type");
  if (
    !SAFE_ID.test(value.assignmentId) ||
    !SAFE_ID.test(value.reviewId) ||
    !isCanonicalIso(value.assignedAt) ||
    !isCanonicalIso(value.expiresAt) ||
    value.independentFromAuthor !== true ||
    !DIGEST.test(value.draftDigest) ||
    !DIGEST.test(value.generationManifestDigest) ||
    !DIGEST.test(value.benchmarkSetDigest) ||
    !DIGEST.test(value.rubricDigest) ||
    !DIGEST.test(value.approvedVoiceExampleDigest) ||
    !["same_chapter_private_benchmark", "cross_chapter_quality_only"].includes(value.comparisonMode)
  ) throw new Error("invalid reviewer assignment payload");
  assertPlainRecord(value.author, "reviewerAssignment.payload.author");
  assertExactKeys(value.author, "reviewerAssignment.payload.author", ["id", "version"]);
  if (!SAFE_ID.test(value.author.id) || !SAFE_ID.test(value.author.version)) throw new Error("invalid reviewer assignment author identity");
  assertReviewerShape(value.reviewer, "reviewerAssignment.payload.reviewer");
  assertSubjectShape(value.subject, "reviewerAssignment.payload.subject");
}

function assertValidationPayloadShape(value: ReviewValidationReceiptPayloadV1): void {
  assertPlainRecord(value, "reviewValidation.payload");
  assertExactKeys(value, "reviewValidation.payload", ["evidenceType", "reviewId", "assignmentId", "reviewer", "subject", "draftDigest", "generationManifestDigest", "benchmarkSetDigest", "rubricDigest", "evidencePolicyDigest", "approvedVoiceExampleDigest", "reviewContentDigest", "artifactRegistryDigest", "resolverVersion", "evidenceResolution", "remediationResolution", "privacyScan"]);
  if (value.evidenceType !== "benchmark-review-validation") throw new Error("invalid review validation evidence type");
  if (
    !SAFE_ID.test(value.reviewId) ||
    !SAFE_ID.test(value.assignmentId) ||
    !SAFE_ID.test(value.resolverVersion)
  ) throw new Error("invalid review validation identity");
  assertReviewerShape(value.reviewer, "reviewValidation.payload.reviewer");
  assertSubjectShape(value.subject, "reviewValidation.payload.subject");
  for (const key of ["draftDigest", "generationManifestDigest", "benchmarkSetDigest", "rubricDigest", "evidencePolicyDigest", "approvedVoiceExampleDigest", "reviewContentDigest", "artifactRegistryDigest"] as const) {
    if (!DIGEST.test(value[key])) throw new Error(`invalid review validation digest at ${key}`);
  }
  assertVerdictShape(value.evidenceResolution, "reviewValidation.payload.evidenceResolution");
  assertVerdictShape(value.remediationResolution, "reviewValidation.payload.remediationResolution");
  assertPlainRecord(value.privacyScan, "reviewValidation.payload.privacyScan");
  assertExactKeys(value.privacyScan, "reviewValidation.payload.privacyScan", ["scannerVersion", "reportDigest", "verdict"]);
  if (!DIGEST.test(value.privacyScan.reportDigest) || !["pass", "block"].includes(value.privacyScan.verdict)) throw new Error("invalid privacy scan receipt payload");
}

function assertVerdictShape(value: { reportDigest: string; verdict: "pass" | "block" }, path: string): void {
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["reportDigest", "verdict"]);
  if (!DIGEST.test(value.reportDigest) || !["pass", "block"].includes(value.verdict)) throw new Error(`invalid report verdict at ${path}`);
}

function assertReviewerShape(value: BenchmarkEvidenceReviewer, path: string): void {
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["kind", "id", "version"]);
  if (!REVIEWER_KINDS.has(value.kind) || !SAFE_ID.test(value.id) || !SAFE_ID.test(value.version)) throw new Error(`invalid reviewer identity at ${path}`);
}

function assertSubjectShape(value: BenchmarkEvidenceSubject, path: string): void {
  assertPlainRecord(value, path);
  assertExactKeys(value, path, ["slug", "book", "chapter"]);
  if (!value.slug.trim() || !value.book.trim() || !Number.isSafeInteger(value.chapter) || value.chapter < 1) throw new Error(`invalid subject at ${path}`);
}

function assertPrerequisiteVerdictsShape(
  value: ArtifactRegistrySnapshotV1["prerequisiteVerdicts"],
  path: string,
): void {
  assertPlainRecord(value, path);
  assertExactKeys(value, path, [
    "generationManifestReady",
    "structuralMachineVerdict",
    "sourceOverlapMachineVerdict",
    "freshnessMachineVerdict",
  ]);
  if (
    typeof value.generationManifestReady !== "boolean" ||
    !["pass", "block"].includes(value.structuralMachineVerdict) ||
    !["pass", "block"].includes(value.sourceOverlapMachineVerdict) ||
    !["pass", "block"].includes(value.freshnessMachineVerdict)
  ) throw new Error(`invalid prerequisite verdicts at ${path}`);
}

function assertExpectationsShape(value: BenchmarkEvidenceExpectationsV1): void {
  const path = "expectations";
  assertPlainRecord(value, path);
  assertExactKeys(value, path, [
    "subject",
    "prerequisiteVerdicts",
    "draftDigest",
    "generationManifestDigest",
    "structuralReportDigest",
    "sourceOverlapReportDigest",
    "freshnessReportDigest",
    "approvedVoiceExampleDigest",
    "benchmarkSetId",
    "benchmarkSetDigest",
    "benchmarkApproval",
    "comparisonMode",
    "reviewer",
    "author",
    "independentFromAuthor",
    "rubricDigest",
    "evidencePolicyDigest",
    "reviewContentDigest",
    "resolverVersion",
    "evidenceResolution",
    "remediationResolution",
    "privacyScan",
    "privacyScannerVersion",
    "evidencePaths",
    "remediationTargets",
    "privacyFieldPaths",
    "verificationTime",
    "trustedCurrentState",
  ]);
  assertSubjectShape(value.subject, `${path}.subject`);
  assertPrerequisiteVerdictsShape(
    value.prerequisiteVerdicts,
    `${path}.prerequisiteVerdicts`,
  );
  for (const key of [
    "draftDigest",
    "generationManifestDigest",
    "structuralReportDigest",
    "sourceOverlapReportDigest",
    "freshnessReportDigest",
    "approvedVoiceExampleDigest",
    "benchmarkSetDigest",
    "rubricDigest",
    "evidencePolicyDigest",
    "reviewContentDigest",
  ] as const) {
    if (!DIGEST.test(value[key])) throw new Error(`invalid expected digest at ${key}`);
  }
  if (
    !SAFE_ID.test(value.benchmarkSetId) ||
    !["same_chapter_private_benchmark", "cross_chapter_quality_only"].includes(value.comparisonMode) ||
    value.independentFromAuthor !== true ||
    !SAFE_ID.test(value.resolverVersion) ||
    !SAFE_ID.test(value.privacyScannerVersion) ||
    !isCanonicalIso(value.verificationTime)
  ) throw new Error("invalid authenticated evidence expectations identity");
  assertPlainRecord(value.benchmarkApproval, `${path}.benchmarkApproval`);
  assertExactKeys(value.benchmarkApproval, `${path}.benchmarkApproval`, ["recordId", "approvedBy", "approvedAt"]);
  if (
    !SAFE_ID.test(value.benchmarkApproval.recordId) ||
    !SAFE_ID.test(value.benchmarkApproval.approvedBy) ||
    !isCanonicalIso(value.benchmarkApproval.approvedAt)
  ) throw new Error("invalid expected benchmark approval");
  assertReviewerShape(value.reviewer, `${path}.reviewer`);
  assertPlainRecord(value.author, `${path}.author`);
  assertExactKeys(value.author, `${path}.author`, ["id", "version"]);
  if (!SAFE_ID.test(value.author.id) || !SAFE_ID.test(value.author.version)) throw new Error("invalid expected author identity");
  assertVerdictShape(value.evidenceResolution, `${path}.evidenceResolution`);
  assertVerdictShape(value.remediationResolution, `${path}.remediationResolution`);
  assertVerdictShape(value.privacyScan, `${path}.privacyScan`);

  assertDenseArray(value.evidencePaths, `${path}.evidencePaths`, 156);
  value.evidencePaths.forEach((item, index) => {
    const itemPath = `${path}.evidencePaths[${index}]`;
    assertPlainRecord(item, itemPath);
    assertExactKeys(item, itemPath, ["criterionId", "path"]);
    if (!SAFE_ID.test(item.criterionId) || !isRegistryPath(item.path)) throw new Error(`invalid expected evidence path at ${index}`);
  });
  assertDenseArray(value.remediationTargets, `${path}.remediationTargets`, 104);
  value.remediationTargets.forEach((item, index) => {
    const itemPath = `${path}.remediationTargets[${index}]`;
    assertPlainRecord(item, itemPath);
    assertExactKeys(item, itemPath, ["criterionId", "domain", "path"]);
    if (!SAFE_ID.test(item.criterionId) || !REMEDIATION_DOMAINS.has(item.domain) || !isRegistryPath(item.path)) throw new Error(`invalid expected remediation target at ${index}`);
  });
  assertDenseArray(value.privacyFieldPaths, `${path}.privacyFieldPaths`, 117);
  if (value.privacyFieldPaths.some((fieldPath) => !isBoundedPath(fieldPath))) throw new Error("invalid expected privacy field path");

  assertPlainRecord(value.trustedCurrentState, `${path}.trustedCurrentState`);
  assertExactKeys(value.trustedCurrentState, `${path}.trustedCurrentState`, ["reviewId", "assignmentId", "draftDigest", "generationManifestDigest", "artifactRegistry"]);
  if (
    !SAFE_ID.test(value.trustedCurrentState.reviewId) ||
    !SAFE_ID.test(value.trustedCurrentState.assignmentId) ||
    !DIGEST.test(value.trustedCurrentState.draftDigest) ||
    !DIGEST.test(value.trustedCurrentState.generationManifestDigest)
  ) throw new Error("invalid trusted current review state");
  assertPlainRecord(value.trustedCurrentState.artifactRegistry, `${path}.trustedCurrentState.artifactRegistry`);
  assertExactKeys(value.trustedCurrentState.artifactRegistry, `${path}.trustedCurrentState.artifactRegistry`, ["recordId", "revision", "registryDigest"]);
  if (
    !SAFE_ID.test(value.trustedCurrentState.artifactRegistry.recordId) ||
    !SAFE_ID.test(value.trustedCurrentState.artifactRegistry.revision) ||
    !DIGEST.test(value.trustedCurrentState.artifactRegistry.registryDigest)
  ) throw new Error("invalid trusted artifact registry head");
}

function assertDenseArray(
  value: unknown,
  path: string,
  maximumLength?: number,
): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`invalid array at ${path}`);
  if (maximumLength !== undefined && value.length > maximumLength) {
    throw new Error(`array exceeds maximum at ${path}`);
  }
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) throw new Error(`sparse array at ${path}`);
  }
}

function isBoundedPath(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 300;
}

function isRegistryPath(value: unknown): value is string {
  if (!isBoundedPath(value) || !REGISTRY_PATH.test(value)) return false;
  const pathBody = value.slice(value.indexOf(":/") + 2);
  return !pathBody.split("/").some((segment) => segment === "." || segment === "..");
}

function assertPlainRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid record at ${path}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`invalid record prototype at ${path}`);
}

function assertExactKeys(value: Record<string, unknown>, path: string, allowed: readonly string[]): void {
  const keys = Object.keys(value);
  const expected = new Set(allowed);
  if (keys.some((key) => !expected.has(key)) || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`unsupported field at ${path}`);
  }
}

function isCanonicalIso(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "authenticated evidence verification failed";
  return message.replace(/[\r\n]+/g, " ").slice(0, 300);
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "invalid";
}
