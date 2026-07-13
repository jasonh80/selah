// SERVER-ONLY. The private Mark 8 setup calls the existing approved Brain
// seeder, then reconciles only the ten deterministic Mark 8 note rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";
import {
  librarySeedApproved,
  planLibrarySeed,
  seedFromLibrary,
  type ExistingLibraryRuleRow,
} from "./selah-brain";
import {
  MARK_8_SETUP_NOTES,
  MARK_8_SETUP_SLUG,
  MARK_8_STUDIO_SETUP_APPROVAL,
  MARK_8_STUDIO_SETUP_DIGEST,
  mark8StudioSetupApprovalMatches,
} from "./mark8-studio-setup-contract";
import { SEED_RULES } from "./selah-brain-library";

export type Mark8StudioSetupErrorCode =
  | "UNAPPROVED"
  | "DIGEST_MISMATCH"
  | "REVIEW_REQUIRED"
  | "STORE_FAILED";

export class Mark8StudioSetupError extends Error {
  constructor(
    readonly code: Mark8StudioSetupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "Mark8StudioSetupError";
  }
}

export function isMark8StudioSetupError(
  value: unknown,
): value is Mark8StudioSetupError {
  return value instanceof Mark8StudioSetupError;
}

export interface Mark8ChapterNoteRow {
  id: string;
  slug: string;
  tags: string[];
  note: string;
  scope: string;
}

export interface Mark8StudioSetupStore {
  readCanonicalRules(): Promise<ExistingLibraryRuleRow[]>;
  readMark8Notes(): Promise<Mark8ChapterNoteRow[]>;
  upsertNotes(rows: Mark8ChapterNoteRow[]): Promise<void>;
}

type BrainSeedResult = Awaited<ReturnType<typeof seedFromLibrary>>;
type BrainSeeder = () => Promise<BrainSeedResult>;

export interface Mark8StudioSetupInspection {
  complete: boolean;
  canReconcile: boolean;
  rulePlan: ReturnType<typeof planLibrarySeed>;
  noteCollisions: string[];
  missingNoteIds: string[];
  mismatchedNoteIds: string[];
}

export interface Mark8StudioSetupStatus {
  slug: typeof MARK_8_SETUP_SLUG;
  approved: boolean;
  complete: boolean;
  canSetup: boolean;
  setupDigest: string | null;
  ruleCount: number;
  noteCount: number;
}

export interface Mark8StudioSetupResult {
  insertedRules: number;
  updatedRules: number;
  unchangedRules: number;
  insertedNotes: number;
  updatedNotes: number;
  totalRules: number;
  totalNotes: number;
}

function approvalsReady(): boolean {
  return (
    librarySeedApproved() &&
    mark8StudioSetupApprovalMatches(MARK_8_STUDIO_SETUP_APPROVAL)
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function expectedNoteRows(): Mark8ChapterNoteRow[] {
  return MARK_8_SETUP_NOTES.map((note) => ({
    id: note.rowId,
    slug: MARK_8_SETUP_SLUG,
    tags: [...note.tags],
    note: note.text,
    scope: "chapter",
  }));
}

export function inspectMark8StudioSetup(
  rules: ExistingLibraryRuleRow[],
  notes: Mark8ChapterNoteRow[],
): Mark8StudioSetupInspection {
  const rulePlan = planLibrarySeed(rules, new Date(0).toISOString(), {
    requireExactVersion: true,
  });
  const expected = expectedNoteRows();
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

export async function reconcileMark8StudioSetup(
  store: Mark8StudioSetupStore,
  seedBrain: BrainSeeder,
  approvalsAreReady: boolean,
): Promise<Mark8StudioSetupResult> {
  if (!approvalsAreReady) {
    throw new Mark8StudioSetupError(
      "UNAPPROVED",
      "The Brain and exact Mark 8 notes still need owner approval.",
    );
  }
  const beforeNotes = await store.readMark8Notes();
  const expected = expectedNoteRows();
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
    throw new Mark8StudioSetupError(
      "REVIEW_REQUIRED",
      "An existing Mark 8 note needs review before setup.",
    );
  }

  const seeded = await seedBrain();
  if (seeded.error) {
    throw new Mark8StudioSetupError("STORE_FAILED", "Selah Brain setup failed.");
  }
  await store.upsertNotes(expected);

  const [afterRules, afterNotes] = await Promise.all([
    store.readCanonicalRules(),
    store.readMark8Notes(),
  ]);
  const after = inspectMark8StudioSetup(afterRules, afterNotes);
  if (!after.complete) {
    throw new Mark8StudioSetupError(
      "STORE_FAILED",
      "Mark 8 setup could not be verified after its safe writes.",
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

function throwOnError(error: { message: string } | null, operation: string): void {
  if (!error) return;
  console.error(`[selah] Mark 8 setup ${operation} failed`);
  throw new Mark8StudioSetupError("STORE_FAILED", `Mark 8 setup ${operation} failed.`);
}

function createSupabaseMark8StudioSetupStore(
  db: SupabaseClient,
): Mark8StudioSetupStore {
  return {
    async readCanonicalRules() {
      const { data, error } = await db
        .from("selah_brain_rules")
        .select(
          "rule_id,title,rule_text,category,scope,genre,priority,stages,source_titles,version,active,archived",
        )
        .not("rule_id", "is", null);
      throwOnError(error, "rule read");
      if (!Array.isArray(data)) {
        throw new Mark8StudioSetupError("STORE_FAILED", "Mark 8 setup rule read failed.");
      }
      return data as ExistingLibraryRuleRow[];
    },
    async readMark8Notes() {
      const bySlug = await db
        .from("chapter_review_notes")
        .select("id,slug,tags,note,scope")
        .eq("slug", MARK_8_SETUP_SLUG);
      throwOnError(bySlug.error, "note read");
      const byManagedId = await db
        .from("chapter_review_notes")
        .select("id,slug,tags,note,scope")
        .in("id", MARK_8_SETUP_NOTES.map((note) => note.rowId));
      throwOnError(byManagedId.error, "managed note read");
      if (!Array.isArray(bySlug.data) || !Array.isArray(byManagedId.data)) {
        throw new Mark8StudioSetupError("STORE_FAILED", "Mark 8 setup note read failed.");
      }
      return [
        ...new Map(
          [...bySlug.data, ...byManagedId.data].map((row) => [
            String((row as { id?: unknown }).id ?? ""),
            row,
          ]),
        ).values(),
      ] as Mark8ChapterNoteRow[];
    },
    async upsertNotes(rows) {
      const { error } = await db
        .from("chapter_review_notes")
        .upsert(rows, { onConflict: "id" });
      throwOnError(error, "note reconciliation");
    },
  };
}

// TEST SEAM (offline route verification only). Production uses the server-only
// Supabase adapter below.
let mark8StudioSetupStoreForTesting: Mark8StudioSetupStore | null = null;
export function __setMark8StudioSetupStoreForTesting(
  store: Mark8StudioSetupStore | null,
): void {
  mark8StudioSetupStoreForTesting = store;
}

function productionStore(): Mark8StudioSetupStore {
  if (mark8StudioSetupStoreForTesting) return mark8StudioSetupStoreForTesting;
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Mark8StudioSetupError("STORE_FAILED", "Mark 8 setup is unavailable.");
  }
  return createSupabaseMark8StudioSetupStore(db);
}

export async function getMark8StudioSetupStatus(): Promise<Mark8StudioSetupStatus> {
  if (!approvalsReady()) {
    return {
      slug: MARK_8_SETUP_SLUG,
      approved: false,
      complete: false,
      canSetup: false,
      setupDigest: null,
      ruleCount: SEED_RULES.length,
      noteCount: MARK_8_SETUP_NOTES.length,
    };
  }
  const store = productionStore();
  const [rules, notes] = await Promise.all([
    store.readCanonicalRules(),
    store.readMark8Notes(),
  ]);
  const inspection = inspectMark8StudioSetup(rules, notes);
  return {
    slug: MARK_8_SETUP_SLUG,
    approved: true,
    complete: inspection.complete,
    canSetup: inspection.canReconcile && !inspection.complete,
    setupDigest: MARK_8_STUDIO_SETUP_DIGEST,
    ruleCount: SEED_RULES.length,
    noteCount: MARK_8_SETUP_NOTES.length,
  };
}

export async function runMark8StudioSetup(
  suppliedSetupDigest: string,
): Promise<{ status: Mark8StudioSetupStatus; result: Mark8StudioSetupResult }> {
  if (!approvalsReady()) {
    throw new Mark8StudioSetupError(
      "UNAPPROVED",
      "The Brain and exact Mark 8 notes still need owner approval.",
    );
  }
  if (suppliedSetupDigest !== MARK_8_STUDIO_SETUP_DIGEST) {
    throw new Mark8StudioSetupError(
      "DIGEST_MISMATCH",
      "The Mark 8 setup changed after review.",
    );
  }
  const result = await reconcileMark8StudioSetup(
    productionStore(),
    seedFromLibrary,
    true,
  );
  return {
    result,
    status: {
      slug: MARK_8_SETUP_SLUG,
      approved: true,
      complete: true,
      canSetup: false,
      setupDigest: MARK_8_STUDIO_SETUP_DIGEST,
      ruleCount: SEED_RULES.length,
      noteCount: MARK_8_SETUP_NOTES.length,
    },
  };
}
