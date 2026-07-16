// SERVER-ONLY. Generalized private Studio setup for protected Mark sprint
// chapters approved after Mark 8. It calls the existing approved Brain seeder,
// then reconciles only that chapter's deterministic note rows from its
// owner-receipted setup contract. Mark 8 keeps its original frozen literal
// path in mark8-studio-setup.ts; this runner never serves mark-8.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";
import {
  librarySeedApproved,
  planLibrarySeed,
  seedFromLibrary,
  type ExistingLibraryRuleRow,
} from "./selah-brain";
import {
  buildMarkSprintSetupContract,
  MARK_7_SETUP_CONTRACT,
  MARK_7_STUDIO_SETUP_APPROVAL,
  markSprintSetupApprovalMatches,
  type MarkSprintSetupContract,
  type MarkSprintStudioSetupApproval,
} from "./mark-sprint-setup-contracts";
import { readStoredSetupApproval } from "./chapter-setup-approvals";
import { SEED_RULES } from "./selah-brain-library";

export interface MarkSprintFactorySetup {
  readonly contract: MarkSprintSetupContract;
  readonly approval: MarkSprintStudioSetupApproval | null;
}

// Chapters served by the factory runner. Mark 8's literal contract is
// deliberately absent. A chapter needs an owner receipt to do ANYTHING here:
// Mark 7 carries its frozen code literal; chapters listed with approval null
// (Mark 9) stay fail-closed until the owner approves them on the Prepare
// Chapter screen, which records a digest-bound row read back by
// readStoredSetupApproval (owner decision A5, 2026-07-16).
const FACTORY_SETUPS: readonly MarkSprintFactorySetup[] = [
  { contract: MARK_7_SETUP_CONTRACT, approval: MARK_7_STUDIO_SETUP_APPROVAL },
  { contract: buildMarkSprintSetupContract("mark-9"), approval: null },
];

export function markSprintFactorySetupFor(
  slug: string,
): MarkSprintFactorySetup | null {
  return FACTORY_SETUPS.find((setup) => setup.contract.slug === slug) ?? null;
}

export function markSprintChapterLabel(slug: string): string {
  const match = /^mark-(\d+)$/u.exec(slug);
  return match ? `Mark ${match[1]}` : slug;
}

export type MarkSprintStudioSetupErrorCode =
  | "UNKNOWN_CHAPTER"
  | "UNAPPROVED"
  | "DIGEST_MISMATCH"
  | "REVIEW_REQUIRED"
  | "STORE_FAILED";

export class MarkSprintStudioSetupError extends Error {
  constructor(
    readonly code: MarkSprintStudioSetupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MarkSprintStudioSetupError";
  }
}

export function isMarkSprintStudioSetupError(
  value: unknown,
): value is MarkSprintStudioSetupError {
  return value instanceof MarkSprintStudioSetupError;
}

export interface MarkSprintChapterNoteRow {
  id: string;
  slug: string;
  tags: string[];
  note: string;
  scope: string;
}

export interface MarkSprintStudioSetupStore {
  readCanonicalRules(): Promise<ExistingLibraryRuleRow[]>;
  readChapterNotes(): Promise<MarkSprintChapterNoteRow[]>;
  upsertNotes(rows: MarkSprintChapterNoteRow[]): Promise<void>;
}

type BrainSeedResult = Awaited<ReturnType<typeof seedFromLibrary>>;
type BrainSeeder = () => Promise<BrainSeedResult>;

export interface MarkSprintStudioSetupInspection {
  complete: boolean;
  canReconcile: boolean;
  rulePlan: ReturnType<typeof planLibrarySeed>;
  noteCollisions: string[];
  missingNoteIds: string[];
  mismatchedNoteIds: string[];
}

export interface MarkSprintStudioSetupStatus {
  slug: string;
  approved: boolean;
  complete: boolean;
  canSetup: boolean;
  setupDigest: string | null;
  ruleCount: number;
  noteCount: number;
}

export interface MarkSprintStudioSetupResult {
  insertedRules: number;
  updatedRules: number;
  unchangedRules: number;
  insertedNotes: number;
  updatedNotes: number;
  totalRules: number;
  totalNotes: number;
}

function approvalsReady(
  setup: MarkSprintFactorySetup,
  storedApproval: MarkSprintStudioSetupApproval | null = null,
): boolean {
  return (
    librarySeedApproved() &&
    (markSprintSetupApprovalMatches(setup.contract, setup.approval) ||
      markSprintSetupApprovalMatches(setup.contract, storedApproval))
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function expectedNoteRows(
  contract: MarkSprintSetupContract,
): MarkSprintChapterNoteRow[] {
  return contract.notes.map((note) => ({
    id: note.rowId,
    slug: contract.slug,
    tags: [...note.tags],
    note: note.text,
    scope: "chapter",
  }));
}

export function inspectMarkSprintStudioSetup(
  contract: MarkSprintSetupContract,
  rules: ExistingLibraryRuleRow[],
  notes: MarkSprintChapterNoteRow[],
): MarkSprintStudioSetupInspection {
  const rulePlan = planLibrarySeed(rules, new Date(0).toISOString(), {
    requireExactVersion: true,
  });
  const expected = expectedNoteRows(contract);
  const expectedTexts = new Set(expected.map((note) => note.note));
  const expectedIds = new Set(expected.map((note) => note.id));
  const noteCollisions = notes
    .filter((note) => expectedTexts.has(note.note) && !expectedIds.has(note.id))
    .map((note) => note.id)
    .sort();
  const missingNoteIds: string[] = [];
  const mismatchedNoteIds: string[] = [];

  for (const expectedNote of expected) {
    const matches = notes.filter((note) => note.id === expectedNote.id);
    if (!matches.length) {
      missingNoteIds.push(expectedNote.id);
      continue;
    }
    const note = matches.length === 1 ? matches[0] : null;
    if (
      !note ||
      note.slug !== expectedNote.slug ||
      note.scope !== expectedNote.scope ||
      note.note !== expectedNote.note ||
      !sameStrings(note.tags, expectedNote.tags)
    ) {
      mismatchedNoteIds.push(expectedNote.id);
    }
  }

  const canReconcile =
    rulePlan.unexpectedRuleIds.length === 0 &&
    noteCollisions.length === 0 &&
    mismatchedNoteIds.length === 0;
  return {
    complete:
      canReconcile &&
      rulePlan.inserts.length === 0 &&
      rulePlan.updates.length === 0 &&
      missingNoteIds.length === 0 &&
      mismatchedNoteIds.length === 0,
    canReconcile,
    rulePlan,
    noteCollisions,
    missingNoteIds,
    mismatchedNoteIds,
  };
}

export async function reconcileMarkSprintStudioSetup(
  contract: MarkSprintSetupContract,
  store: MarkSprintStudioSetupStore,
  seedBrain: BrainSeeder,
  approvalsAreReady: boolean,
): Promise<MarkSprintStudioSetupResult> {
  const label = markSprintChapterLabel(contract.slug);
  if (!approvalsAreReady) {
    throw new MarkSprintStudioSetupError(
      "UNAPPROVED",
      `The Brain and exact ${label} notes still need owner approval.`,
    );
  }
  const beforeNotes = await store.readChapterNotes();
  const expected = expectedNoteRows(contract);
  const expectedTexts = new Set(expected.map((note) => note.note));
  const expectedById = new Map(expected.map((note) => [note.id, note]));
  if (
    beforeNotes.some((note) => {
      const managed = expectedById.get(note.id);
      if (!managed) return expectedTexts.has(note.note);
      return (
        note.slug !== managed.slug ||
        note.scope !== managed.scope ||
        note.note !== managed.note ||
        !sameStrings(note.tags, managed.tags)
      );
    })
  ) {
    throw new MarkSprintStudioSetupError(
      "REVIEW_REQUIRED",
      `An existing ${label} note needs review before setup.`,
    );
  }

  const seeded = await seedBrain();
  if (seeded.error) {
    throw new MarkSprintStudioSetupError("STORE_FAILED", "Selah Brain setup failed.");
  }
  await store.upsertNotes(expected);

  const [afterRules, afterNotes] = await Promise.all([
    store.readCanonicalRules(),
    store.readChapterNotes(),
  ]);
  const after = inspectMarkSprintStudioSetup(contract, afterRules, afterNotes);
  if (!after.complete) {
    throw new MarkSprintStudioSetupError(
      "STORE_FAILED",
      `${label} setup could not be verified after its safe writes.`,
    );
  }

  const existingNoteIds = new Set(beforeNotes.map((note) => note.id));
  const beforeById = new Map(beforeNotes.map((note) => [note.id, note]));
  return {
    insertedRules: seeded.inserted,
    updatedRules: seeded.updated,
    unchangedRules: seeded.unchanged,
    insertedNotes: expected.filter((note) => !existingNoteIds.has(note.id)).length,
    updatedNotes: expected.filter((note) => {
      const prior = beforeById.get(note.id);
      return Boolean(
        prior &&
          (prior.slug !== note.slug ||
            prior.scope !== note.scope ||
            prior.note !== note.note ||
            !sameStrings(prior.tags, note.tags)),
      );
    }).length,
    totalRules: seeded.total,
    totalNotes: expected.length,
  };
}

function throwOnError(
  error: { message: string } | null,
  label: string,
  operation: string,
): void {
  if (!error) return;
  console.error(`[selah] ${label} setup ${operation} failed`);
  throw new MarkSprintStudioSetupError(
    "STORE_FAILED",
    `${label} setup ${operation} failed.`,
  );
}

function createSupabaseMarkSprintStudioSetupStore(
  db: SupabaseClient,
  contract: MarkSprintSetupContract,
): MarkSprintStudioSetupStore {
  const label = markSprintChapterLabel(contract.slug);
  return {
    async readCanonicalRules() {
      const { data, error } = await db
        .from("selah_brain_rules")
        .select(
          "rule_id,title,rule_text,category,scope,genre,priority,stages,source_titles,version,active,archived",
        )
        .not("rule_id", "is", null);
      throwOnError(error, label, "rule read");
      if (!Array.isArray(data)) {
        throw new MarkSprintStudioSetupError(
          "STORE_FAILED",
          `${label} setup rule read failed.`,
        );
      }
      return data as ExistingLibraryRuleRow[];
    },
    async readChapterNotes() {
      const bySlug = await db
        .from("chapter_review_notes")
        .select("id,slug,tags,note,scope")
        .eq("slug", contract.slug);
      throwOnError(bySlug.error, label, "note read");
      const byManagedId = await db
        .from("chapter_review_notes")
        .select("id,slug,tags,note,scope")
        .in("id", contract.notes.map((note) => note.rowId));
      throwOnError(byManagedId.error, label, "managed note read");
      if (!Array.isArray(bySlug.data) || !Array.isArray(byManagedId.data)) {
        throw new MarkSprintStudioSetupError(
          "STORE_FAILED",
          `${label} setup note read failed.`,
        );
      }
      return [
        ...new Map(
          [...bySlug.data, ...byManagedId.data].map((row) => [
            String((row as { id?: unknown }).id ?? ""),
            row,
          ]),
        ).values(),
      ] as MarkSprintChapterNoteRow[];
    },
    async upsertNotes(rows) {
      const { error } = await db
        .from("chapter_review_notes")
        .upsert(rows, { onConflict: "id" });
      throwOnError(error, label, "note reconciliation");
    },
  };
}

// TEST SEAM (offline route verification only). Production uses the server-only
// Supabase adapter above.
let markSprintStudioSetupStoreForTesting: MarkSprintStudioSetupStore | null = null;
export function __setMarkSprintStudioSetupStoreForTesting(
  store: MarkSprintStudioSetupStore | null,
): void {
  markSprintStudioSetupStoreForTesting = store;
}

function productionStore(
  contract: MarkSprintSetupContract,
): MarkSprintStudioSetupStore {
  if (markSprintStudioSetupStoreForTesting) return markSprintStudioSetupStoreForTesting;
  const db = getSupabaseAdmin();
  if (!db) {
    throw new MarkSprintStudioSetupError(
      "STORE_FAILED",
      `${markSprintChapterLabel(contract.slug)} setup is unavailable.`,
    );
  }
  return createSupabaseMarkSprintStudioSetupStore(db, contract);
}

function requireFactorySetup(slug: string): MarkSprintFactorySetup {
  const setup = markSprintFactorySetupFor(slug);
  if (!setup) {
    throw new MarkSprintStudioSetupError(
      "UNKNOWN_CHAPTER",
      "This chapter has no owner-receipted Studio setup.",
    );
  }
  return setup;
}

export async function getMarkSprintStudioSetupStatus(
  slug: string,
): Promise<MarkSprintStudioSetupStatus> {
  const setup = requireFactorySetup(slug);
  const { contract } = setup;
  const storedApproval = await readStoredSetupApproval(slug);
  if (!approvalsReady(setup, storedApproval)) {
    return {
      slug: contract.slug,
      approved: false,
      complete: false,
      canSetup: false,
      setupDigest: null,
      ruleCount: SEED_RULES.length,
      noteCount: contract.notes.length,
    };
  }
  const store = productionStore(contract);
  const [rules, notes] = await Promise.all([
    store.readCanonicalRules(),
    store.readChapterNotes(),
  ]);
  const inspection = inspectMarkSprintStudioSetup(contract, rules, notes);
  return {
    slug: contract.slug,
    approved: true,
    complete: inspection.complete,
    canSetup: inspection.canReconcile && !inspection.complete,
    setupDigest: contract.setupDigest,
    ruleCount: SEED_RULES.length,
    noteCount: contract.notes.length,
  };
}

export async function runMarkSprintStudioSetup(
  slug: string,
  suppliedSetupDigest: string,
): Promise<{
  status: MarkSprintStudioSetupStatus;
  result: MarkSprintStudioSetupResult;
}> {
  const setup = requireFactorySetup(slug);
  const { contract } = setup;
  const label = markSprintChapterLabel(contract.slug);
  const storedApproval = await readStoredSetupApproval(slug);
  if (!approvalsReady(setup, storedApproval)) {
    throw new MarkSprintStudioSetupError(
      "UNAPPROVED",
      `The Brain and exact ${label} notes still need owner approval.`,
    );
  }
  if (suppliedSetupDigest !== contract.setupDigest) {
    throw new MarkSprintStudioSetupError(
      "DIGEST_MISMATCH",
      `The ${label} setup changed after review.`,
    );
  }
  const result = await reconcileMarkSprintStudioSetup(
    contract,
    productionStore(contract),
    seedFromLibrary,
    true,
  );
  return {
    result,
    status: {
      slug: contract.slug,
      approved: true,
      complete: true,
      canSetup: false,
      setupDigest: contract.setupDigest,
      ruleCount: SEED_RULES.length,
      noteCount: contract.notes.length,
    },
  };
}
