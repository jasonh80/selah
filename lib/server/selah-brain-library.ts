// SERVER-ONLY. The canonical Selah Brain rule library (v1.1), kept in version
// control and seeded into Supabase idempotently. This file is the source of
// truth for the seed; live toggles/edits then happen in the DB.
import library from "./selah-brain-library.v1_1.json";

export interface SeedRule {
  id: string;
  category: string;
  title: string;
  text: string;
  scope: string; // global | genre
  genre?: string;
  stages: string[]; // copy_generation | copy_review | image_prompt | image_review | map_config | governance
  active: boolean;
  priority: string; // core | contextual | qa | governance
  sources?: string[];
}

interface InjectionPolicy {
  always_on_rule_ids: string[];
  max_contextual_rules_per_generation: number;
  quality_gate_rule_ids: string[];
  governance_rule_ids_not_injected_into_copy_prompt: string[];
}

const lib = library as unknown as {
  version: string;
  rule_count: number;
  rules: SeedRule[];
  injection_policy: InjectionPolicy;
};

export const LIBRARY_VERSION = lib.version;
export const SEED_RULES: SeedRule[] = lib.rules;
export const INJECTION_POLICY = lib.injection_policy;
export const MAX_CONTEXTUAL = lib.injection_policy.max_contextual_rules_per_generation;
