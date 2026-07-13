import assert from "node:assert/strict";
import guidanceArtifact from "../lib/server/mark-sprint-guidance.v1.json";
import {
  createSupabaseMarkSprintRuntimeReadPorts,
  prepareMarkSprintRuntime,
  prepareMarkSprintRuntimePreview,
  withMarkSprintRuntimeApprovedPreparation,
  type MarkSprintRuntimeApprovedPreparation,
  type MarkSprintLiveBrainRuleRow,
  type MarkSprintLiveChapterNoteRow,
  type MarkSprintLiveVoiceExampleRow,
  type MarkSprintRuntimeReadPorts,
} from "../lib/server/mark-sprint-runtime";
import { buildMarkSprintManifestPolicy } from "../lib/server/mark-sprint-manifest-policy";
import {
  MARK_SPRINT_ESV_REQUEST_OPTIONS,
  expectedMarkChapterVerseIdPair,
  expectedMarkChapterVerseMarkers,
} from "../lib/server/mark-sprint-esv-contract";
import { LIBRARY_VERSION, SEED_RULES } from "../lib/server/selah-brain-library";
import { MARK_8_SETUP_NOTES } from "../lib/server/mark8-studio-setup-contract";

const SLUG = "mark-8" as const;
const API_KEY = "PRIVATE RUNTIME TEST KEY";
const SOURCE_PHRASE =
  "PRIVATE RUNTIME SOURCE cedar amber lantern mercy river witness";
const EXAMPLE_CONTENT =
  "PRIVATE RUNTIME EXAMPLE warm wise Mark voice without copied wording.";
const policy = buildMarkSprintManifestPolicy(SLUG);

const brainRows: MarkSprintLiveBrainRuleRow[] = SEED_RULES.map((seed) => {
  return {
    id: `db-${seed.id}`,
    rule_id: seed.id,
    title: seed.title,
    rule_text: seed.text,
    category: seed.category,
    scope: seed.scope,
    genre: seed.genre ?? null,
    priority: seed.priority,
    stages: [...seed.stages],
    source_titles: [...(seed.sources ?? [])],
    version: LIBRARY_VERSION,
    active: seed.active,
    archived: false,
  };
});

const guidanceNotes = guidanceArtifact.chapters[SLUG].notes;
const managedNoteIds = new Map(
  MARK_8_SETUP_NOTES.map((note) => [note.guidanceId, note.rowId]),
);
const noteRows: MarkSprintLiveChapterNoteRow[] = guidanceNotes.map((note) => ({
  id: managedNoteIds.get(note.id) ?? `missing-${note.id}`,
  slug: SLUG,
  note: note.text,
  scope: "chapter",
}));

const exampleRows: MarkSprintLiveVoiceExampleRow[] = [
  {
    id: "db-mark-6-daily-rundown",
    title: policy.requirements.voiceExample.title,
    genre: policy.requirements.voiceExample.genre,
    example_type: policy.requirements.voiceExample.exampleType,
    content: EXAMPLE_CONTENT,
    active: true,
  },
];

function ports(input: {
  brain?: readonly MarkSprintLiveBrainRuleRow[];
  notes?: readonly MarkSprintLiveChapterNoteRow[];
  examples?: readonly MarkSprintLiveVoiceExampleRow[];
  fail?: "brain" | "notes" | "example";
} = {}): MarkSprintRuntimeReadPorts {
  return {
    async readBrainRuleRows() {
      if (input.fail === "brain") throw new Error("private database detail");
      return input.brain ?? brainRows;
    },
    async readChapterNoteRows() {
      if (input.fail === "notes") throw new Error("private database detail");
      return input.notes ?? noteRows;
    },
    async readVoiceExampleRows() {
      if (input.fail === "example") throw new Error("private database detail");
      return input.examples ?? exampleRows;
    },
  };
}

function chapterNumber(reference: string): number {
  const match = /^Mark (\d+)$/u.exec(reference);
  assert.ok(match);
  return Number(match[1]);
}

function syntheticText(reference: string): string {
  const markers = expectedMarkChapterVerseMarkers(reference);
  assert.ok(markers);
  const chapter = chapterNumber(reference);
  return markers
    .map((verse) =>
      verse === 1
        ? `[1] ${SOURCE_PHRASE} chapter ${chapter} carries complete synthetic words for protected validation.`
        : `[${verse}] Distinct complete synthetic chapter content carries enough careful words for validation in chapter ${chapter} verse ${verse}.`,
    )
    .join("\n\n");
}

let sourceFetchCount = 0;
async function syntheticFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  sourceFetchCount++;
  const url = new URL(String(input));
  const reference = url.searchParams.get("q");
  assert.ok(reference);
  assert.equal(
    new Headers(init?.headers).get("Authorization"),
    `Token ${API_KEY}`,
  );
  for (const [key, value] of Object.entries(MARK_SPRINT_ESV_REQUEST_OPTIONS)) {
    assert.equal(url.searchParams.get(key), String(value));
  }
  const pair = expectedMarkChapterVerseIdPair(reference);
  assert.ok(pair);
  return new Response(
    JSON.stringify({
      query: reference,
      canonical: reference,
      parsed: [[...pair]],
      passage_meta: [
        {
          canonical: reference,
          chapter_start: [...pair],
          chapter_end: [...pair],
        },
      ],
      passages: [syntheticText(reference)],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function preview(readPorts: MarkSprintRuntimeReadPorts) {
  return prepareMarkSprintRuntimePreview({
    slug: SLUG,
    apiKey: API_KEY,
    ports: readPorts,
    fetchImpl: syntheticFetch,
  });
}

async function expectEvidenceBlock(
  readPorts: MarkSprintRuntimeReadPorts,
  code: string,
): Promise<void> {
  sourceFetchCount = 0;
  const result = await preview(readPorts);
  assert.equal(result.evidenceReady, false);
  assert.equal(result.readyForGeneration, false);
  assert.equal(result.manifestDigest, null);
  assert.equal(result.sourceBundleDigest, null);
  assert.ok(result.evidenceBlockers.some((blocker) => blocker.code === code));
  assert.equal(sourceFetchCount, 0, "blocked live evidence must stop before ESV");
}

async function main(): Promise<void> {
  const adapterCalls: Array<{ method: string; args: unknown[] }> = [];
  const adapterQuery = {
    select(...args: unknown[]) {
      adapterCalls.push({ method: "select", args });
      return this;
    },
    in(...args: unknown[]) {
      adapterCalls.push({ method: "in", args });
      return this;
    },
    eq(...args: unknown[]) {
      adapterCalls.push({ method: "eq", args });
      return this;
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: exampleRows, error: null }).then(resolve);
    },
  };
  const adapter = createSupabaseMarkSprintRuntimeReadPorts({
    from(...args: unknown[]) {
      adapterCalls.push({ method: "from", args });
      return adapterQuery;
    },
  } as never);
  await adapter.readVoiceExampleRows({
    title: "Mark 6 Daily Rundown",
    genre: "gospel narrative",
    exampleType: "voice",
  });
  assert.deepEqual(
    adapterCalls.find((call) => call.method === "in"),
    {
      method: "in",
      args: [
        "title",
        ["Mark 6 Daily Rundown", "Mark 6 Daily Rundown Voice Example"],
      ],
    },
    "the live adapter must query only the canonical and exact legacy titles",
  );

  await expectEvidenceBlock(
    ports({ brain: brainRows.slice(1) }),
    "LIVE_BRAIN_MISSING",
  );
  await expectEvidenceBlock(
    ports({
      brain: [
        { ...brainRows[0], rule_text: "changed live rule" },
        ...brainRows.slice(1),
      ],
    }),
    "LIVE_BRAIN_MISMATCH",
  );
  await expectEvidenceBlock(
    ports({ notes: noteRows.slice(1) }),
    "LIVE_CHAPTER_NOTES_MISSING",
  );
  await expectEvidenceBlock(
    ports({
      notes: [
        { ...noteRows[0], id: "same-text-but-unapproved-row" },
        ...noteRows.slice(1),
      ],
    }),
    "LIVE_CHAPTER_NOTES_MISSING",
  );
  await expectEvidenceBlock(
    ports({
      notes: [
        { ...noteRows[0], note: "changed live chapter note" },
        ...noteRows.slice(1),
      ],
    }),
    "LIVE_CHAPTER_NOTES_MISMATCH",
  );
  await expectEvidenceBlock(
    ports({ examples: [] }),
    "LIVE_VOICE_EXAMPLE_MISSING",
  );
  await expectEvidenceBlock(
    ports({ examples: [{ ...exampleRows[0], active: false }] }),
    "LIVE_VOICE_EXAMPLE_MISMATCH",
  );
  for (const invalidExample of [
    { ...exampleRows[0], genre: "gospel" },
    { ...exampleRows[0], example_type: "structure" },
    { ...exampleRows[0], content: "   " },
  ]) {
    await expectEvidenceBlock(
      ports({ examples: [invalidExample] }),
      "LIVE_VOICE_EXAMPLE_MISMATCH",
    );
  }
  await expectEvidenceBlock(
    ports({
      examples: [
        exampleRows[0],
        {
          ...exampleRows[0],
          id: "db-mark-6-daily-rundown-legacy",
          title: "Mark 6 Daily Rundown Voice Example",
        },
      ],
    }),
    "LIVE_VOICE_EXAMPLE_MISMATCH",
  );
  await expectEvidenceBlock(
    ports({
      examples: [
        { ...exampleRows[0], title: "Mark 6 Daily Rundown Example" },
      ],
    }),
    "LIVE_VOICE_EXAMPLE_MISMATCH",
  );
  await expectEvidenceBlock(ports({ fail: "brain" }), "LIVE_READ_FAILED");

  // Studio's original saved row has this exact legacy display title. It is
  // the same single active voice example, and its real title/id/content are
  // still bound into the per-run manifest.
  sourceFetchCount = 0;
  const legacyVoiceExample = await preview(
    ports({
      examples: [
        {
          ...exampleRows[0],
          title: "Mark 6 Daily Rundown Voice Example",
        },
      ],
    }),
  );
  assert.equal(legacyVoiceExample.evidenceReady, true);
  assert.deepEqual(legacyVoiceExample.evidenceBlockers, []);
  assert.equal(sourceFetchCount, 3);

  // A normal Needs work note must not corrupt the exact guidance packet used
  // by the next private draft.
  sourceFetchCount = 0;
  const withOwnerFeedback = await preview(
    ports({
      notes: [
        ...noteRows,
        {
          id: "db-owner-feedback",
          slug: SLUG,
          note: "Make the application clearer before the next private draft.",
          scope: "chapter",
        },
      ],
    }),
  );
  assert.equal(withOwnerFeedback.evidenceReady, true);
  assert.deepEqual(withOwnerFeedback.evidenceBlockers, []);
  assert.equal(sourceFetchCount, 3);

  sourceFetchCount = 0;
  const exact = await preview(ports());
  assert.equal(sourceFetchCount, 3, "the existing loader must load the 3-chapter bundle");
  assert.equal(exact.evidenceReady, true);
  assert.equal(exact.readyForGeneration, false);
  assert.deepEqual(exact.evidenceBlockers, []);
  assert.notEqual(
    legacyVoiceExample.manifestDigest,
    exact.manifestDigest,
    "the stored legacy title must remain bound into the per-run manifest",
  );
  assert.match(exact.sourceBundleDigest ?? "", /^[a-f0-9]{64}$/u);
  assert.match(exact.manifestDigest ?? "", /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    exact.manifestFindings.map((finding) => finding.code),
    ["MANIFEST_APPROVAL_MISSING"],
    "exact live evidence must leave approval findings only",
  );
  assert.deepEqual(
    exact.approvalBlockers.map((blocker) => blocker.code),
    ["MANIFEST_APPROVAL_MISSING", "OWNER_RUN_AUTHORIZATION_MISSING"],
  );
  assert.ok(Object.isFrozen(exact));
  const serialized = JSON.stringify(exact);
  for (const privateValue of [
    API_KEY,
    SOURCE_PHRASE,
    brainRows[0].rule_text,
    noteRows[0].note,
    EXAMPLE_CONTENT,
  ]) {
    assert.ok(!serialized.includes(privateValue), `safe preview leaked ${privateValue}`);
  }

  sourceFetchCount = 0;
  const confirmed = await prepareMarkSprintRuntime({
    slug: SLUG,
    apiKey: API_KEY,
    ports: ports(),
    fetchImpl: syntheticFetch,
    approvedManifestDigest: exact.manifestDigest,
    ownerAuthorized: true,
  });
  assert.equal(sourceFetchCount, 3);
  assert.equal(confirmed.preview.evidenceReady, true);
  assert.equal(confirmed.preview.readyForGeneration, true);
  assert.notEqual(confirmed.prepared, null);
  assert.deepEqual(
    confirmed.preview.manifestFindings.map((finding) => finding.code),
    [],
    "exact manifest + owner confirmation must preserve the approved artifacts",
  );
  assert.deepEqual(confirmed.preview.approvalBlockers, []);
  assert.deepEqual(Object.keys(confirmed), ["preview"]);
  assert.equal(JSON.stringify(confirmed).includes("prepared"), false);
  assert.equal(JSON.stringify(confirmed).includes(SOURCE_PHRASE), false);
  assert.doesNotThrow(() =>
    withMarkSprintRuntimeApprovedPreparation(confirmed.prepared!, (preparation) => {
      assert.equal(preparation.manifestResult.manifestDigest, exact.manifestDigest);
      assert.equal(preparation.sourceBundle.bundleDigest, exact.sourceBundleDigest);
    }),
  );

  const unconfirmed = await prepareMarkSprintRuntime({
    slug: SLUG,
    apiKey: API_KEY,
    ports: ports(),
    fetchImpl: syntheticFetch,
    approvedManifestDigest: exact.manifestDigest,
    ownerAuthorized: false,
  });
  assert.equal(unconfirmed.prepared, null);
  assert.ok(
    unconfirmed.preview.approvalBlockers.some(
      (blocker) => blocker.code === "OWNER_RUN_AUTHORIZATION_MISSING",
    ),
  );

  sourceFetchCount = 0;
  const confirmedMismatch = await prepareMarkSprintRuntime({
    slug: SLUG,
    apiKey: API_KEY,
    ports: ports({ brain: brainRows.slice(1) }),
    fetchImpl: syntheticFetch,
    approvedManifestDigest: exact.manifestDigest,
    ownerAuthorized: true,
  });
  assert.equal(confirmedMismatch.prepared, null);
  assert.equal(confirmedMismatch.preview.evidenceReady, false);
  assert.equal(sourceFetchCount, 0);
  assert.throws(() =>
    withMarkSprintRuntimeApprovedPreparation(
      {} as MarkSprintRuntimeApprovedPreparation,
      () => null,
    ),
  );

  const sourceFailure = await prepareMarkSprintRuntimePreview({
    slug: SLUG,
    apiKey: API_KEY,
    ports: ports(),
    fetchImpl: async () =>
      new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
  });
  assert.equal(sourceFailure.evidenceReady, false);
  assert.deepEqual(sourceFailure.evidenceBlockers.map((blocker) => blocker.code), [
    "SOURCE_LOAD_FAILED",
  ]);
  assert.equal(sourceFailure.manifestDigest, null);

  const failureJson = JSON.stringify(await preview(ports({ fail: "notes" })));
  assert.ok(!failureJson.includes("private database detail"));
  console.log(
    "Mark sprint runtime verification passed (preview/confirmed/fail-closed).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
