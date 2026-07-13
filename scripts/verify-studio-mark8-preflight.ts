import assert from "node:assert/strict";
import {
  buildMark8StudioPreflightResponse,
  buildStudioGenerateRequest,
  decideMark8StudioPreflight,
  isStudioGenerateEntryDisabled,
  MARK_8_CONFIRMATION_MESSAGE,
  MARK_8_PREFLIGHT_ERROR,
  MARK_8_SOURCE_PREPARATION_MESSAGE,
} from "../lib/studio-mark8-preflight";
import {
  buildMark8StudioSetupRequest,
  decideMark8StudioSetup,
} from "../lib/studio-mark8-setup";
import {
  MARK_8_SETUP_NOTES,
  MARK_8_SETUP_NOTES_DIGEST,
  MARK_8_SETUP_SCOPE,
  MARK_8_SETUP_SLUG,
  MARK_8_STUDIO_SETUP_APPROVAL,
  MARK_8_STUDIO_SETUP_DIGEST,
  mark8ScopedSetupApprovalApplies,
  mark8StudioSetupApprovalMatches,
  type Mark8StudioSetupApproval,
} from "../lib/server/mark8-studio-setup-contract";
import {
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

const validMark8NotesApproval: Mark8StudioSetupApproval = {
  scope: MARK_8_SETUP_SCOPE,
  slug: MARK_8_SETUP_SLUG,
  approved_by: "owner-test",
  approved_at: "2026-07-13T12:00:00.000Z",
  evidence: "offline exact-note receipt test",
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

  // The new setup remains inert at this head: Brain uses its own existing
  // approval and the separate receipt approves exactly ten Mark 8 notes.
  assert.equal(MARK_8_STUDIO_SETUP_APPROVAL, null);
  assert.equal(librarySeedApproved(), false);
  assert.equal(mark8StudioSetupApprovalMatches(null), false);
  assert.equal(mark8StudioSetupApprovalMatches(validMark8NotesApproval), true);
  assert.equal(mark8ScopedSetupApprovalApplies("mark-8", validMark8NotesApproval), true);
  assert.equal(mark8ScopedSetupApprovalApplies("mark-9", validMark8NotesApproval), false);
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
      ...validMark8NotesApproval,
      notes_digest: "0".repeat(64),
    }),
    false,
  );

  const noteApprovedPolicy = buildMarkSprintManifestPolicy("mark-8", {
    mark8NotesApproval: validMark8NotesApproval,
  });
  assert.ok(
    !noteApprovedPolicy.blockers.some((blocker) => blocker.code === "guidance_not_approved"),
    "the exact Mark 8 note receipt satisfies only Mark 8 guidance",
  );
  assert.ok(
    noteApprovedPolicy.blockers.some((blocker) => blocker.code === "brain_artifact_not_approved"),
    "a valid Mark 8 note receipt must not bypass the unapproved Brain",
  );
  const mark9Policy = buildMarkSprintManifestPolicy("mark-9", {
    mark8NotesApproval: validMark8NotesApproval,
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
  const unauthorizedSetup = await route.POST(
    adminRequest(
      { action: "mark8_setup_status", slug: "mark-8" },
      "wrong-token",
    ),
  );
  assert.equal(unauthorizedSetup.status, 401);

  const lockedSetup = await route.POST(
    adminRequest({ action: "mark8_setup_status", slug: "mark-8" }),
  );
  assert.equal(lockedSetup.status, 200);
  assert.deepEqual(decideMark8StudioSetup(await lockedSetup.json()), {
    kind: "locked",
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
  const bodyCannotApproveSetup = await route.POST(
    adminRequest({
      ...buildMark8StudioSetupRequest(setupDecision),
      approval: validMark8NotesApproval,
    }),
  );
  assert.equal(bodyCannotApproveSetup.status, 403);
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
        message: "refused:UNAPPROVED",
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

    const wrongSlug = await route.POST(
      adminRequest({ action: "mark_sprint_prepare", slug: "mark-9" }),
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
    loader.__setMark8PreviewLoaderForTesting(null);
    generationSettings.__setGenerationTestOverrides(null);
  }

  console.log(
    "Studio Mark 8 preflight verification passed (read-only route + owner UX logic).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
