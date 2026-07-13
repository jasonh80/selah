import assert from "node:assert/strict";
import guidanceArtifact from "../lib/server/mark-sprint-guidance.v1.json";
import {
  prepareMarkSprintRuntimePreview,
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
const noteRows: MarkSprintLiveChapterNoteRow[] = guidanceNotes.map((note) => ({
  id: `db-${note.id}`,
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
  await expectEvidenceBlock(ports({ fail: "brain" }), "LIVE_READ_FAILED");

  sourceFetchCount = 0;
  const exact = await preview(ports());
  assert.equal(sourceFetchCount, 3, "the existing loader must load the 3-chapter bundle");
  assert.equal(exact.evidenceReady, true);
  assert.equal(exact.readyForGeneration, false);
  assert.deepEqual(exact.evidenceBlockers, []);
  assert.match(exact.sourceBundleDigest ?? "", /^[a-f0-9]{64}$/u);
  assert.match(exact.manifestDigest ?? "", /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    exact.manifestFindings.map((finding) => finding.code),
    [
      "BRAIN_NOT_APPROVED",
      "GUIDANCE_NOT_APPROVED",
      "MANIFEST_APPROVAL_MISSING",
    ],
    "exact live evidence must leave approval findings only",
  );
  assert.deepEqual(
    exact.approvalBlockers.map((blocker) => blocker.code),
    [
      "BRAIN_ARTIFACT_APPROVAL_MISSING",
      "GUIDANCE_APPROVAL_MISSING",
      "SOURCE_RUNTIME_APPROVAL_MISSING",
      "MANIFEST_APPROVAL_MISSING",
      "OWNER_RUN_AUTHORIZATION_MISSING",
    ],
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
  console.log("Mark sprint runtime verification passed (missing/mismatch/exact/source)." );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
