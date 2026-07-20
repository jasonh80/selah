import assert from "node:assert/strict";
import { __setStoredSetupApprovalStoreForTesting } from "../lib/server/chapter-setup-approvals";
import {
  buildMark8StudioPreflightResponse,
  buildStudioGenerateRequest,
  decideMark8StudioPreflight,
  isStudioGenerateEntryDisabled,
  MARK_8_CONFIRMATION_MESSAGE,
  MARK_8_PREFLIGHT_ERROR,
  MARK_8_SOURCE_PREPARATION_MESSAGE,
  studioConfirmationMessage,
  studioSourcePreparationMessage,
} from "../lib/studio-mark8-preflight";
import {
  buildMarkSprintStudioSetupRequest,
  decideMarkSprintStudioSetup,
} from "../lib/studio-mark-sprint-setup";
import {
  MARK_7_SETUP_CONTRACT,
  MARK_7_STUDIO_SETUP_APPROVAL,
  markSprintScopedSetupApprovalApplies,
  markSprintSetupApprovalMatches,
} from "../lib/server/mark-sprint-setup-contracts";
import {
  __setMarkSprintStudioSetupStoreForTesting,
  reconcileMarkSprintStudioSetup,
  type MarkSprintChapterNoteRow,
  type MarkSprintStudioSetupStore,
} from "../lib/server/mark-sprint-studio-setup";
import {
  buildMark8StudioSetupRequest,
  decideMark8StudioSetup,
} from "../lib/studio-mark8-setup";
import {
  MARK_8_SETUP_NOTES,
  MARK_8_SETUP_NOTES_DIGEST,
  MARK_8_GUIDANCE_DIGEST,
  MARK_8_SETUP_SCOPE,
  MARK_8_SETUP_SLUG,
  MARK_8_STUDIO_SETUP_APPROVAL,
  MARK_8_STUDIO_SETUP_DIGEST,
  mark8ScopedSetupApprovalApplies,
  mark8StudioSetupApprovalMatches,
  type Mark8StudioSetupApproval,
} from "../lib/server/mark8-studio-setup-contract";
import {
  __setMark8StudioSetupStoreForTesting,
  reconcileMark8StudioSetup,
  type Mark8ChapterNoteRow,
  type Mark8StudioSetupStore,
} from "../lib/server/mark8-studio-setup";
import {
  librarySeedApproved,
  planLibrarySeed,
  type ExistingLibraryRuleRow,
} from "../lib/server/selah-brain";
import {
  LIBRARY_VERSION,
  SEED_RULES,
} from "../lib/server/selah-brain-library";
import { buildMarkSprintManifestPolicy } from "../lib/server/mark-sprint-manifest-policy";

const ADMIN_TOKEN = "offline-mark8-studio-token";
const MANIFEST_DIGEST = "a".repeat(64);
const SOURCE_DIGEST = "b".repeat(64);

const validMark8GuidanceApproval: Mark8StudioSetupApproval = {
  scope: MARK_8_SETUP_SCOPE,
  slug: MARK_8_SETUP_SLUG,
  approved_by: "owner-test",
  approved_at: "2026-07-13T12:00:00.000Z",
  evidence: "offline exact Mark 8 guidance receipt test",
  guidance_digest: MARK_8_GUIDANCE_DIGEST,
  notes_digest: MARK_8_SETUP_NOTES_DIGEST,
  receipt_digest: MARK_8_STUDIO_SETUP_DIGEST,
};

function canonicalRuleRows(
  rules = SEED_RULES,
  version = LIBRARY_VERSION,
): ExistingLibraryRuleRow[] {
  return rules.map((rule) => ({
    rule_id: rule.id,
    title: rule.title,
    rule_text: rule.text,
    category: rule.category,
    scope: rule.scope,
    genre: rule.genre ?? null,
    priority: rule.priority,
    stages: [...rule.stages],
    source_titles: [...(rule.sources ?? [])],
    version,
    active: rule.active !== false,
    archived: false,
  }));
}

class FakeSetupStore implements Mark8StudioSetupStore {
  rules: ExistingLibraryRuleRow[];
  notes: Mark8ChapterNoteRow[];
  upsertCalls = 0;

  constructor(
    rules: ExistingLibraryRuleRow[],
    notes: Mark8ChapterNoteRow[] = [],
  ) {
    this.rules = structuredClone(rules);
    this.notes = structuredClone(notes);
  }

  async readCanonicalRules() {
    return structuredClone(this.rules);
  }

  async readMark8Notes() {
    return structuredClone(this.notes);
  }

  async upsertNotes(rows: Mark8ChapterNoteRow[]) {
    this.upsertCalls++;
    for (const row of rows) {
      const index = this.notes.findIndex((note) => note.id === row.id);
      if (index >= 0) this.notes[index] = structuredClone(row);
      else this.notes.push(structuredClone(row));
    }
  }
}

const confirmablePreview = {
  slug: "mark-8",
  evidenceReady: true,
  readyForGeneration: false,
  sourceBundleDigest: SOURCE_DIGEST,
  manifestDigest: MANIFEST_DIGEST,
  evidenceBlockers: [],
  approvalBlockers: [
    {
      code: "MANIFEST_APPROVAL_MISSING",
      message: "expected first-pass approval",
    },
    {
      code: "OWNER_RUN_AUTHORIZATION_MISSING",
      message: "expected one-use confirmation",
    },
  ],
  manifestFindings: [
    {
      code: "MANIFEST_APPROVAL_MISSING",
      path: "approvedManifestDigest",
      message: "expected first-pass approval",
    },
  ],
};

const lockedPreview = {
  slug: "mark-8",
  evidenceReady: false,
  readyForGeneration: false,
  sourceBundleDigest: null,
  manifestDigest: null,
  evidenceBlockers: [
    {
      code: "LIVE_READ_FAILED",
      path: "PRIVATE TABLE NAME",
      message: "PRIVATE DATABASE DETAIL",
    },
  ],
  approvalBlockers: [
    {
      code: "BRAIN_ARTIFACT_APPROVAL_MISSING",
      message: "PRIVATE ARTIFACT DETAIL",
    },
  ],
  manifestFindings: [
    {
      code: "BRAIN_NOT_APPROVED",
      path: "PRIVATE PATH",
      message: "PRIVATE FINDING DETAIL",
    },
  ],
};

function adminRequest(
  body: Record<string, unknown>,
  token = ADMIN_TOKEN,
): Request {
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  const safe = buildMark8StudioPreflightResponse(confirmablePreview);
  assert.equal(safe.preview.readyToConfirm, true);
  assert.equal(safe.preview.readyForGeneration, false);
  assert.equal(safe.preview.manifestDigest, MANIFEST_DIGEST);
  assert.deepEqual(safe.blockers, []);
  assert.deepEqual(decideMark8StudioPreflight(safe), {
    kind: "confirm",
    manifestDigest: MANIFEST_DIGEST,
  });

  const locked = buildMark8StudioPreflightResponse(lockedPreview);
  assert.equal(locked.preview.readyToConfirm, false);
  assert.equal(locked.preview.manifestDigest, null);
  assert.ok(locked.blockers.includes("Studio could not safely check Selah Brain."));
  assert.ok(locked.blockers.includes("Selah Brain still needs your approval."));
  assert.doesNotMatch(JSON.stringify(locked), /PRIVATE/u);
  assert.equal(decideMark8StudioPreflight(locked).kind, "blocked");

  assert.equal(
    decideMark8StudioPreflight({
      ...safe,
      preview: { ...safe.preview, manifestDigest: MANIFEST_DIGEST.toUpperCase() },
    }).kind,
    "blocked",
  );
  assert.equal(
    decideMark8StudioPreflight({ ...safe, blockers: ["Still locked"] }).kind,
    "blocked",
  );

  assert.deepEqual(buildStudioGenerateRequest("mark-8", MANIFEST_DIGEST), {
    action: "generate",
    slug: "mark-8",
    confirm: true,
    approvedManifestDigest: MANIFEST_DIGEST,
  });
  assert.deepEqual(buildStudioGenerateRequest("mark-8", MANIFEST_DIGEST, true), {
    action: "generate",
    slug: "mark-8",
    confirm: true,
    approvedManifestDigest: MANIFEST_DIGEST,
    confirmDiscardCompletedImages: true,
  });
  assert.deepEqual(buildStudioGenerateRequest("exodus-27", null), {
    action: "generate",
    slug: "exodus-27",
    confirm: true,
  });
  assert.throws(() => buildStudioGenerateRequest("mark-8", null));
  assert.equal(
    isStudioGenerateEntryDisabled({
      slug: "mark-8",
      chapterBusy: false,
      preflightBusy: false,
      textGenerationEnabled: false,
      published: false,
    }),
    false,
    "the read-only Mark 8 check stays available while generation is OFF",
  );
  assert.equal(
    isStudioGenerateEntryDisabled({
      slug: "exodus-27",
      chapterBusy: false,
      preflightBusy: false,
      textGenerationEnabled: false,
      published: false,
    }),
    true,
    "ordinary draft generation stays disabled while generation is OFF",
  );
  assert.equal(
    MARK_8_CONFIRMATION_MESSAGE,
    "Studio will now use the prepared ESV Mark 7–9 context to create one private Mark 8 draft. This uses a small amount of AI credit and publishes nothing.",
  );
  assert.match(MARK_8_SOURCE_PREPARATION_MESSAGE, /125 verse-instances/u);
  assert.match(MARK_8_SOURCE_PREPARATION_MESSAGE, /chose to proceed with that uncertainty/u);
  assert.match(MARK_8_SOURCE_PREPARATION_MESSAGE, /Nothing is sent to the writing AI, saved, or published yet/u);

  // The exact Brain and Mark 8 receipts are approved in code, but this offline
  // gate never performs the owner-triggered live setup.
  assert.equal(mark8StudioSetupApprovalMatches(MARK_8_STUDIO_SETUP_APPROVAL), true);
  assert.equal(librarySeedApproved(), true);
  assert.equal(mark8StudioSetupApprovalMatches(null), false);
  assert.equal(mark8StudioSetupApprovalMatches(validMark8GuidanceApproval), true);
  assert.equal(mark8ScopedSetupApprovalApplies("mark-8", validMark8GuidanceApproval), true);
  assert.equal(mark8ScopedSetupApprovalApplies("mark-9", validMark8GuidanceApproval), false);
  assert.equal(MARK_8_SETUP_NOTES.length, 10);
  assert.equal(new Set(MARK_8_SETUP_NOTES.map((note) => note.rowId)).size, 10);
  assert.ok(MARK_8_SETUP_NOTES.every((note) => /^M8-/u.test(note.guidanceId)));
  assert.ok(
    MARK_8_SETUP_NOTES.every((note) =>
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(note.rowId),
    ),
  );
  assert.equal(
    mark8StudioSetupApprovalMatches({
      ...validMark8GuidanceApproval,
      notes_digest: "0".repeat(64),
    }),
    false,
  );

  assert.equal(
    mark8StudioSetupApprovalMatches({
      ...validMark8GuidanceApproval,
      guidance_digest: "0".repeat(64),
    }),
    false,
  );

  const guidanceApprovedPolicy = buildMarkSprintManifestPolicy("mark-8", {
    mark8GuidanceApproval: validMark8GuidanceApproval,
  });
  assert.ok(
    !guidanceApprovedPolicy.blockers.some((blocker) => blocker.code === "guidance_not_approved"),
    "the exact Mark 8 projection receipt satisfies only Mark 8 guidance",
  );
  assert.ok(
    !guidanceApprovedPolicy.blockers.some((blocker) => blocker.code === "brain_artifact_not_approved"),
    "the separately approved Brain should satisfy its own artifact gate",
  );
  assert.equal(
    librarySeedApproved("review_only", null),
    false,
    "Mark 8 guidance approval still cannot approve an unapproved Brain",
  );
  const mark9Policy = buildMarkSprintManifestPolicy("mark-9", {
    mark8GuidanceApproval: validMark8GuidanceApproval,
  });
  assert.ok(
    mark9Policy.blockers.some((blocker) => blocker.code === "guidance_not_approved"),
    "the Mark 8 receipt must not approve Mark 9",
  );

  assert.deepEqual(
    decideMark8StudioSetup({
      ok: true,
      setup: {
        slug: "mark-8",
        approved: false,
        complete: false,
        canSetup: false,
        setupDigest: null,
        ruleCount: 99,
        noteCount: 10,
      },
    }),
    { kind: "locked" },
  );
  const setupDecision = decideMark8StudioSetup({
    ok: true,
    setup: {
      slug: "mark-8",
      approved: true,
      complete: false,
      canSetup: true,
      setupDigest: MARK_8_STUDIO_SETUP_DIGEST,
      ruleCount: 99,
      noteCount: 10,
    },
  });
  assert.equal(setupDecision.kind, "setup");
  assert.deepEqual(buildMark8StudioSetupRequest(setupDecision), {
    action: "mark8_setup",
    slug: "mark-8",
    confirm: true,
    setupDigest: MARK_8_STUDIO_SETUP_DIGEST,
  });

  // Future-approved behavior is driven through the existing Brain seed plan.
  // The fake seeder mirrors that plan so the test remains offline and cannot
  // touch Supabase, ESV, OpenAI, settings, generation, images, or publishing.
  const staleRules = canonicalRuleRows(SEED_RULES.slice(0, 96), "1.4");
  staleRules[0] = { ...staleRules[0], active: false, archived: true };
  const ownerNote: Mark8ChapterNoteRow = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "mark-8",
    tags: ["owner-note"],
    note: "Owner-created note stays untouched.",
    scope: "chapter",
  };
  const store = new FakeSetupStore(staleRules, [ownerNote]);
  let seedCalls = 0;
  const fakeExistingSeeder = async () => {
    seedCalls++;
    const plan = planLibrarySeed(store.rules, "2026-07-13T12:00:00.000Z", {
      requireExactVersion: true,
    });
    for (const update of plan.updates) {
      const row = store.rules.find((rule) => rule.rule_id === update.ruleId);
      assert.ok(row);
      Object.assign(row, update.values);
    }
    for (const insert of plan.inserts) {
      store.rules.push(insert as unknown as ExistingLibraryRuleRow);
    }
    return {
      inserted: plan.inserts.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged,
      total: SEED_RULES.length,
    };
  };
  const firstSetup = await reconcileMark8StudioSetup(
    store,
    fakeExistingSeeder,
    true,
  );
  assert.equal(seedCalls, 1);
  assert.equal(firstSetup.insertedRules, 3);
  assert.equal(firstSetup.updatedRules, 96);
  assert.equal(firstSetup.insertedNotes, 10);
  assert.equal(store.rules.length, 99);
  assert.equal(store.rules[0].active, false, "owner active choice is preserved");
  assert.equal(store.rules[0].archived, true, "owner archive choice is preserved");
  assert.deepEqual(
    store.notes.find((row) => row.id === ownerNote.id),
    ownerNote,
    "owner-created Mark 8 notes stay untouched",
  );
  const secondSetup = await reconcileMark8StudioSetup(
    store,
    fakeExistingSeeder,
    true,
  );
  assert.equal(secondSetup.insertedRules, 0);
  assert.equal(secondSetup.updatedRules, 0);
  assert.equal(secondSetup.insertedNotes, 0);

  const managed = MARK_8_SETUP_NOTES[0];
  const wrongManagedRow = new FakeSetupStore(canonicalRuleRows(), [
    {
      id: managed.rowId,
      slug: "mark-9",
      tags: [...managed.tags],
      note: managed.text,
      scope: "chapter",
    },
  ]);
  let wrongIdSeedCalls = 0;
  await assert.rejects(
    () =>
      reconcileMark8StudioSetup(
        wrongManagedRow,
        async () => {
          wrongIdSeedCalls++;
          return { inserted: 0, updated: 0, unchanged: 99, total: 99 };
        },
        true,
      ),
    /needs review/u,
  );
  assert.equal(wrongIdSeedCalls, 0, "wrong managed row refuses before Brain writes");
  assert.equal(wrongManagedRow.upsertCalls, 0, "wrong managed row is never overwritten");

  process.env.DEV_ADMIN_TOKEN = ADMIN_TOKEN;
  const loader = await import("../lib/server/studio-mark8-preflight-loader");
  const generationSettings = await import("../lib/server/generation-settings");
  const route = await import("../app/api/admin/generation/route");
  const setupAudit: Array<Record<string, unknown>> = [];
  generationSettings.__setGenerationTestOverrides({ captureAudit: setupAudit });
  __setMark8StudioSetupStoreForTesting(
    new FakeSetupStore(
      canonicalRuleRows(),
      MARK_8_SETUP_NOTES.map((note) => ({
        id: note.rowId,
        slug: MARK_8_SETUP_SLUG,
        tags: [...note.tags],
        note: note.text,
        scope: "chapter",
      })),
    ),
  );
  const unauthorizedSetup = await route.POST(
    adminRequest(
      { action: "mark8_setup_status", slug: "mark-8" },
      "wrong-token",
    ),
  );
  assert.equal(unauthorizedSetup.status, 401);

  const readySetup = await route.POST(
    adminRequest({ action: "mark8_setup_status", slug: "mark-8" }),
  );
  assert.equal(readySetup.status, 200);
  assert.deepEqual(decideMark8StudioSetup(await readySetup.json()), {
    kind: "ready",
  });
  const wrongSetupSlug = await route.POST(
    adminRequest({ action: "mark8_setup_status", slug: "mark-9" }),
  );
  assert.equal(wrongSetupSlug.status, 400);
  const unconfirmedSetup = await route.POST(
    adminRequest({
      action: "mark8_setup",
      slug: "mark-8",
      setupDigest: MARK_8_STUDIO_SETUP_DIGEST,
    }),
  );
  assert.equal(unconfirmedSetup.status, 400);
  const bodyCannotChangeSetup = await route.POST(
    adminRequest({
      ...buildMark8StudioSetupRequest(setupDecision),
      approval: validMark8GuidanceApproval,
      setupDigest: "0".repeat(64),
    }),
  );
  assert.equal(bodyCannotChangeSetup.status, 409);
  assert.deepEqual(
    setupAudit.map(({ action, slug, status, message }) => ({
      action,
      slug,
      status,
      message,
    })),
    [
      {
        action: "mark8_setup",
        slug: "mark-8",
        status: "failed",
        message: "refused:invalid_confirmation",
      },
      {
        action: "mark8_setup",
        slug: "mark-8",
        status: "started",
        message: "owner-confirmed private setup",
      },
      {
        action: "mark8_setup",
        slug: "mark-8",
        status: "failed",
        message: "refused:DIGEST_MISMATCH",
      },
    ],
  );
  generationSettings.__setGenerationTestOverrides({ auditFailure: true });
  const missingStartAudit = await route.POST(
    adminRequest(buildMark8StudioSetupRequest(setupDecision)),
  );
  assert.equal(missingStartAudit.status, 500);
  assert.match(
    String(((await missingStartAudit.json()) as { error?: string }).error),
    /Nothing changed/u,
  );
  generationSettings.__setGenerationTestOverrides({ captureAudit: setupAudit });

  let loaderCalls = 0;
  loader.__setMark8PreviewLoaderForTesting(async () => {
    loaderCalls++;
    return confirmablePreview as never;
  });

  try {
    const unauthorized = await route.POST(
      adminRequest(
        { action: "mark_sprint_prepare", slug: "mark-8" },
        "wrong-token",
      ),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(loaderCalls, 0);

    // mark-12 is the non-connected example now that mark-11 joined the
    // connected flow (owner request 2026-07-19; mark-10 via the board #29
    // handoff, mark-9 via owner decision A5).
    const wrongSlug = await route.POST(
      adminRequest({ action: "mark_sprint_prepare", slug: "mark-12" }),
    );
    assert.equal(wrongSlug.status, 400);
    assert.equal(loaderCalls, 0);

    const exact = await route.POST(
      adminRequest({ action: "mark_sprint_prepare", slug: "mark-8" }),
    );
    assert.equal(exact.status, 200);
    assert.equal(loaderCalls, 1);
    const exactBody = (await exact.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(exactBody).sort(), ["blockers", "ok", "preview"]);
    assert.deepEqual(
      Object.keys(exactBody.preview as Record<string, unknown>).sort(),
      [
        "evidenceReady",
        "manifestDigest",
        "readyForGeneration",
        "readyToConfirm",
        "slug",
        "sourceBundleDigest",
      ],
    );
    assert.doesNotMatch(JSON.stringify(exactBody), /expected first-pass approval/u);

    loader.__setMark8PreviewLoaderForTesting(async () => lockedPreview as never);
    const blocked = await route.POST(
      adminRequest({ action: "mark_sprint_prepare", slug: "mark-8" }),
    );
    assert.equal(blocked.status, 200);
    const blockedBody = await blocked.json();
    assert.equal(decideMark8StudioPreflight(blockedBody).kind, "blocked");
    assert.doesNotMatch(JSON.stringify(blockedBody), /PRIVATE/u);

    loader.__setMark8PreviewLoaderForTesting(async () => {
      throw new Error("PRIVATE MISSING CONFIG DETAIL");
    });
    const unavailable = await route.POST(
      adminRequest({ action: "mark_sprint_prepare", slug: "mark-8" }),
    );
    assert.equal(unavailable.status, 503);
    const unavailableBody = (await unavailable.json()) as { error?: string };
    assert.equal(unavailableBody.error, MARK_8_PREFLIGHT_ERROR);
    assert.doesNotMatch(JSON.stringify(unavailableBody), /PRIVATE/u);
  } finally {
    __setMark8StudioSetupStoreForTesting(null);
    loader.__setMark8PreviewLoaderForTesting(null);
    generationSettings.__setGenerationTestOverrides(null);
  }

  await verifyMark7Enablement();

  console.log(
    "Studio Mark 8 preflight verification passed (read-only route + owner UX logic).",
  );
}

// ---- Mark 7 (Part 2 of the preload): factory receipt, preflight, seeding ----

class FakeSprintSetupStore implements MarkSprintStudioSetupStore {
  rules: ExistingLibraryRuleRow[];
  notes: MarkSprintChapterNoteRow[];
  upsertCalls = 0;

  constructor(
    rules: ExistingLibraryRuleRow[],
    notes: MarkSprintChapterNoteRow[] = [],
  ) {
    this.rules = structuredClone(rules);
    this.notes = structuredClone(notes);
  }

  async readCanonicalRules() {
    return structuredClone(this.rules);
  }

  async readChapterNotes() {
    return structuredClone(this.notes);
  }

  async upsertNotes(rows: MarkSprintChapterNoteRow[]) {
    this.upsertCalls++;
    for (const row of rows) {
      const index = this.notes.findIndex((note) => note.id === row.id);
      if (index >= 0) this.notes[index] = structuredClone(row);
      else this.notes.push(structuredClone(row));
    }
  }
}

async function verifyMark7Enablement(): Promise<void> {
  // The recorded owner receipt must match the exact contract, apply only to
  // mark-7, and never approve any other chapter.
  assert.equal(
    markSprintSetupApprovalMatches(MARK_7_SETUP_CONTRACT, MARK_7_STUDIO_SETUP_APPROVAL),
    true,
    "the Mark 7 owner receipt must match its setup contract exactly",
  );
  assert.equal(
    markSprintScopedSetupApprovalApplies("mark-7", MARK_7_SETUP_CONTRACT, MARK_7_STUDIO_SETUP_APPROVAL),
    true,
  );
  for (const other of ["mark-8", "mark-9", "mark-10", "mark-11"]) {
    assert.equal(
      markSprintScopedSetupApprovalApplies(other, MARK_7_SETUP_CONTRACT, MARK_7_STUDIO_SETUP_APPROVAL),
      false,
      `the Mark 7 receipt must not apply to ${other}`,
    );
  }
  assert.equal(MARK_7_SETUP_CONTRACT.notes.length, 10);
  assert.equal(new Set(MARK_7_SETUP_CONTRACT.notes.map((note) => note.rowId)).size, 10);
  assert.ok(MARK_7_SETUP_CONTRACT.notes.every((note) => /^M7-/u.test(note.guidanceId)));
  assert.ok(
    new Set(MARK_7_SETUP_CONTRACT.notes.map((note) => note.rowId)).isDisjointFrom(
      new Set(MARK_8_SETUP_NOTES.map((note) => note.rowId)),
    ),
    "Mark 7 deterministic rows must never collide with Mark 8 rows",
  );
  assert.equal(
    markSprintSetupApprovalMatches(MARK_7_SETUP_CONTRACT, {
      ...MARK_7_STUDIO_SETUP_APPROVAL!,
      notes_digest: "0".repeat(64),
    }),
    false,
  );

  // The manifest policy accepts the receipt for mark-7 alone; the cross-slug
  // fail-closed behavior for mark-9..11 stays asserted in verify:manifest.
  const mark7Policy = buildMarkSprintManifestPolicy("mark-7");
  const mark7Codes = mark7Policy.blockers.map((blocker) => blocker.code);
  assert.ok(!mark7Codes.includes("guidance_not_approved" as never));
  assert.ok(!mark7Codes.includes("chapter_note_row_ids_missing" as never));

  // Preflight is slug-exact: a mark-7 runtime preview confirms as mark-7 and
  // is rejected when Studio expected mark-8 (and vice versa).
  const confirmableMark7 = { ...confirmablePreview, slug: "mark-7" };
  const safeMark7 = buildMark8StudioPreflightResponse(confirmableMark7, "mark-7");
  assert.equal(safeMark7.preview.slug, "mark-7");
  assert.deepEqual(safeMark7.blockers, []);
  assert.deepEqual(decideMark8StudioPreflight(safeMark7, "mark-7"), {
    kind: "confirm",
    manifestDigest: MANIFEST_DIGEST,
  });
  assert.equal(decideMark8StudioPreflight(safeMark7).kind, "blocked");
  const wrongChapter = buildMark8StudioPreflightResponse(confirmableMark7);
  assert.ok(wrongChapter.blockers.includes("Studio checked the wrong chapter."));
  assert.equal(decideMark8StudioPreflight(wrongChapter).kind, "blocked");
  const lockedMark7 = buildMark8StudioPreflightResponse(
    {
      ...lockedPreview,
      slug: "mark-7",
      evidenceBlockers: [
        ...lockedPreview.evidenceBlockers,
        { code: "LIVE_CHAPTER_NOTES_MISSING", message: "PRIVATE NOTE DETAIL" },
      ],
    },
    "mark-7",
  );
  assert.ok(lockedMark7.blockers.includes("Mark 7 study notes are missing."));
  assert.doesNotMatch(JSON.stringify(lockedMark7), /PRIVATE/u);

  // Owner-facing copy: Mark 7 prepares the ESV Mark 6–8 window. 130 verse
  // instances = 56 + 36 + 38 — the ESV omits the disputed Mark 7:16, so the
  // human-facing count matches what is actually loaded (PR #32 re-review).
  assert.match(studioSourcePreparationMessage("mark-7"), /Mark 6–8/u);
  assert.match(studioSourcePreparationMessage("mark-7"), /130 verse-instances/u);
  assert.match(studioConfirmationMessage("mark-7"), /one private Mark 7 draft/u);
  assert.equal(studioSourcePreparationMessage("mark-8"), MARK_8_SOURCE_PREPARATION_MESSAGE);
  assert.equal(studioConfirmationMessage("mark-8"), MARK_8_CONFIRMATION_MESSAGE);

  // Generate requests: mark-7 now requires the exact prepared manifest digest.
  assert.deepEqual(buildStudioGenerateRequest("mark-7", MANIFEST_DIGEST), {
    action: "generate",
    slug: "mark-7",
    confirm: true,
    approvedManifestDigest: MANIFEST_DIGEST,
  });
  assert.throws(() => buildStudioGenerateRequest("mark-7", null));
  assert.equal(
    isStudioGenerateEntryDisabled({
      slug: "mark-7",
      chapterBusy: false,
      preflightBusy: false,
      textGenerationEnabled: false,
      published: false,
    }),
    false,
    "the read-only Mark 7 check stays available while generation is OFF",
  );

  // Client setup decisions mirror the Mark 8 shape but carry the mark-7 slug.
  const mark7SetupDecision = decideMarkSprintStudioSetup("mark-7", {
    ok: true,
    setup: {
      slug: "mark-7",
      approved: true,
      complete: false,
      canSetup: true,
      setupDigest: MARK_7_SETUP_CONTRACT.setupDigest,
      ruleCount: 99,
      noteCount: 10,
    },
  });
  assert.equal(mark7SetupDecision.kind, "setup");
  assert.deepEqual(buildMarkSprintStudioSetupRequest("mark-7", mark7SetupDecision), {
    action: "mark_sprint_setup",
    slug: "mark-7",
    confirm: true,
    setupDigest: MARK_7_SETUP_CONTRACT.setupDigest,
  });
  assert.equal(
    decideMarkSprintStudioSetup("mark-8", {
      ok: true,
      setup: {
        slug: "mark-7",
        approved: true,
        complete: true,
        canSetup: false,
        setupDigest: MARK_7_SETUP_CONTRACT.setupDigest,
        ruleCount: 99,
        noteCount: 10,
      },
    }).kind,
    "error",
    "a mark-7 setup response must never satisfy another chapter's UI",
  );

  // Offline seeding behavior: ten inserts once, idempotent second run, and a
  // wrong managed row refuses before any Brain or note write.
  const sprintStore = new FakeSprintSetupStore(canonicalRuleRows(), []);
  let sprintSeedCalls = 0;
  const fakeSprintSeeder = async () => {
    sprintSeedCalls++;
    return { inserted: 0, updated: 0, unchanged: SEED_RULES.length, total: SEED_RULES.length };
  };
  const firstSprintSetup = await reconcileMarkSprintStudioSetup(
    MARK_7_SETUP_CONTRACT,
    sprintStore,
    fakeSprintSeeder,
    true,
  );
  assert.equal(sprintSeedCalls, 1);
  assert.equal(firstSprintSetup.insertedNotes, 10);
  assert.ok(sprintStore.notes.every((note) => note.slug === "mark-7"));
  const secondSprintSetup = await reconcileMarkSprintStudioSetup(
    MARK_7_SETUP_CONTRACT,
    sprintStore,
    fakeSprintSeeder,
    true,
  );
  assert.equal(secondSprintSetup.insertedNotes, 0);
  assert.equal(secondSprintSetup.updatedNotes, 0);

  const managedMark7 = MARK_7_SETUP_CONTRACT.notes[0];
  const wrongSprintRow = new FakeSprintSetupStore(canonicalRuleRows(), [
    {
      id: managedMark7.rowId,
      slug: "mark-9",
      tags: [...managedMark7.tags],
      note: managedMark7.text,
      scope: "chapter",
    },
  ]);
  await assert.rejects(
    () =>
      reconcileMarkSprintStudioSetup(
        MARK_7_SETUP_CONTRACT,
        wrongSprintRow,
        fakeSprintSeeder,
        true,
      ),
    /needs review/u,
  );
  assert.equal(wrongSprintRow.upsertCalls, 0, "wrong managed row is never overwritten");

  // Route integration: mark_sprint_setup_status/mark_sprint_setup accept only
  // receipted chapters, require confirmation, and refuse a drifted digest.
  process.env.DEV_ADMIN_TOKEN = ADMIN_TOKEN;
  const route = await import("../app/api/admin/generation/route");
  const generationSettings = await import("../lib/server/generation-settings");
  const sprintAudit: Array<Record<string, unknown>> = [];
  generationSettings.__setGenerationTestOverrides({ captureAudit: sprintAudit });
  __setMarkSprintStudioSetupStoreForTesting(
    new FakeSprintSetupStore(
      canonicalRuleRows(),
      MARK_7_SETUP_CONTRACT.notes.map((note) => ({
        id: note.rowId,
        slug: "mark-7",
        tags: [...note.tags],
        note: note.text,
        scope: "chapter",
      })),
    ),
  );
  // HERMETIC APPROVAL STORE (board 2026-07-17, second leak of the same class
  // as verify-studio-safety): without this seam, production builds read the
  // LIVE chapter_setup_approvals table — the moment a real mark-9 approval
  // row exists, "locked" flips to "setup" and every deploy fails. An empty
  // store makes the gate environment- and data-independent.
  __setStoredSetupApprovalStoreForTesting({
    async read() { return null; },
    async upsert(): Promise<void> {
      throw new Error("offline preflight gate: approval store is read-only");
    },
  });
  try {
    const unauthorized = await route.POST(
      adminRequest({ action: "mark_sprint_setup_status", slug: "mark-7" }, "wrong-token"),
    );
    assert.equal(unauthorized.status, 401);

    const readyMark7 = await route.POST(
      adminRequest({ action: "mark_sprint_setup_status", slug: "mark-7" }),
    );
    assert.equal(readyMark7.status, 200);
    assert.deepEqual(decideMarkSprintStudioSetup("mark-7", await readyMark7.json()), {
      kind: "ready",
    });

    // mark-9 now carries a factory contract for the Prepare Chapter screen
    // (owner decision A5) but NO receipt until the owner approves on-screen:
    // its status must be served and LOCKED, never ready or setup-capable.
    const lockedMark9 = await route.POST(
      adminRequest({ action: "mark_sprint_setup_status", slug: "mark-9" }),
    );
    assert.equal(lockedMark9.status, 200);
    assert.deepEqual(decideMarkSprintStudioSetup("mark-9", await lockedMark9.json()), {
      kind: "locked",
    });

    const lockedMark10 = await route.POST(
      adminRequest({ action: "mark_sprint_setup_status", slug: "mark-10" }),
    );
    assert.equal(lockedMark10.status, 200);
    assert.deepEqual(decideMarkSprintStudioSetup("mark-10", await lockedMark10.json()), {
      kind: "locked",
    });

    // Mark 11 (owner request 2026-07-19): connected and fail-closed until the
    // owner approves its packet — exactly like Mark 9/10.
    const lockedMark11 = await route.POST(
      adminRequest({ action: "mark_sprint_setup_status", slug: "mark-11" }),
    );
    assert.equal(lockedMark11.status, 200);
    assert.deepEqual(decideMarkSprintStudioSetup("mark-11", await lockedMark11.json()), {
      kind: "locked",
    });

    for (const unknownSlug of ["mark-8", "mark-12", "exodus-27"]) {
      const refusedStatus = await route.POST(
        adminRequest({ action: "mark_sprint_setup_status", slug: unknownSlug }),
      );
      assert.equal(
        refusedStatus.status,
        400,
        `factory setup status must refuse ${unknownSlug} (mark-8 keeps its own frozen action)`,
      );
      const refusedSetup = await route.POST(
        adminRequest({
          action: "mark_sprint_setup",
          slug: unknownSlug,
          confirm: true,
          setupDigest: MARK_7_SETUP_CONTRACT.setupDigest,
        }),
      );
      assert.equal(refusedSetup.status, 400);
    }

    const unconfirmed = await route.POST(
      adminRequest({
        action: "mark_sprint_setup",
        slug: "mark-7",
        setupDigest: MARK_7_SETUP_CONTRACT.setupDigest,
      }),
    );
    assert.equal(unconfirmed.status, 400);

    const drifted = await route.POST(
      adminRequest({
        action: "mark_sprint_setup",
        slug: "mark-7",
        confirm: true,
        setupDigest: "0".repeat(64),
      }),
    );
    assert.equal(drifted.status, 409);

    assert.deepEqual(
      sprintAudit.map(({ action, slug, status, message }) => ({ action, slug, status, message })),
      [
        {
          action: "mark_sprint_setup",
          slug: "mark-7",
          status: "failed",
          message: "refused:invalid_confirmation",
        },
        {
          action: "mark_sprint_setup",
          slug: "mark-7",
          status: "started",
          message: "owner-confirmed private setup",
        },
        {
          action: "mark_sprint_setup",
          slug: "mark-7",
          status: "failed",
          message: "refused:DIGEST_MISMATCH",
        },
      ],
    );
  } finally {
    __setStoredSetupApprovalStoreForTesting(null);
    __setMarkSprintStudioSetupStoreForTesting(null);
    generationSettings.__setGenerationTestOverrides(null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
