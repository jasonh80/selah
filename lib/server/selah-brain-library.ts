// SERVER-ONLY. The canonical Selah Brain rule library (v1.1), kept in version
// control and seeded into Supabase idempotently. This file is the source of
// truth for the seed; live toggles/edits then happen in the DB.
import { createHash } from "node:crypto";
import library from "./selah-brain-library.v1_1.json";
import { sha256Canonical } from "./generation-manifest";

export interface SeedRule {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly text: string;
  readonly scope: string; // global | genre
  readonly genre?: string;
  readonly stages: readonly string[]; // copy_generation | copy_review | image_prompt | image_review | map_config | governance
  readonly active: boolean;
  readonly priority: string; // core | contextual | qa | governance
  readonly sources?: readonly string[];
}

export interface SeedApproval {
  readonly approved_by: string;
  readonly approved_at: string;
  readonly evidence: string;
  readonly library_version: string;
  readonly content_digest: string;
}

interface InjectionPolicy {
  readonly always_on_rule_ids: readonly string[];
  readonly max_contextual_rules_per_generation: number;
  readonly max_contextual_rules_by_stage?: Readonly<Record<string, number>>;
  readonly quality_gate_rule_ids: readonly string[];
  readonly governance_rule_ids_not_injected_into_copy_prompt: readonly string[];
}

interface CanonicalLibrary {
  readonly version: string;
  readonly status: string;
  readonly seed_approval: SeedApproval | null;
  readonly rule_count: number;
  readonly rules: readonly SeedRule[];
  readonly injection_policy: InjectionPolicy;
  readonly [key: string]: unknown;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

// Clone first so no other importer can retain a mutable reference to the JSON
// module, then freeze every nested rule, policy, source, and ledger entry. The
// approval digest and all seed planning now read the same immutable snapshot.
const lib = deepFreeze(structuredClone(library)) as unknown as CanonicalLibrary;

function approvalExcludedArtifact(snapshot: CanonicalLibrary) {
  const {
    status: _status,
    seed_approval: _seedApproval,
    ...digestableLibrary
  } = snapshot;
  return digestableLibrary;
}

function contentDigestFor(snapshot: CanonicalLibrary): string {
  return createHash("sha256")
    .update(JSON.stringify(approvalExcludedArtifact(snapshot)))
    .digest("hex");
}

export const LIBRARY_VERSION = lib.version;
export const LIBRARY_STATUS = lib.status;
export const LIBRARY_SEED_APPROVAL = lib.seed_approval;
export const SEED_RULES: readonly SeedRule[] = lib.rules;
export const INJECTION_POLICY = lib.injection_policy;
export const MAX_CONTEXTUAL = lib.injection_policy.max_contextual_rules_per_generation;
export const MAX_CONTEXTUAL_BY_STAGE =
  lib.injection_policy.max_contextual_rules_by_stage ?? {};

// Bind owner approval to the exact version-controlled artifact while excluding
// the two fields that change when approval is recorded. JSON import order is
// stable, so this digest is deterministic in Studio, verification, and Netlify.
export const LIBRARY_CONTENT_DIGEST = contentDigestFor(lib);

// The seed approval keeps its historical ordered-JSON digest above. Generation
// manifests use a separate canonical digest of the exact same approval-excluded
// artifact. Naming both prevents either encoding from being mistaken for the
// other while binding them to one immutable snapshot.
export const LIBRARY_MANIFEST_ARTIFACT = deepFreeze(
  structuredClone(approvalExcludedArtifact(lib)),
);
export const LIBRARY_MANIFEST_DIGEST = sha256Canonical(
  LIBRARY_MANIFEST_ARTIFACT,
);

export function libraryContentDigestMatchesSnapshot(): boolean {
  return contentDigestFor(lib) === LIBRARY_CONTENT_DIGEST;
}

export function libraryManifestDigestMatchesSnapshot(): boolean {
  return (
    sha256Canonical(approvalExcludedArtifact(lib)) === LIBRARY_MANIFEST_DIGEST
  );
}
