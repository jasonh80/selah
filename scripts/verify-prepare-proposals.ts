// verify:prepare-proposals — the IQ-011 self-serve Prepare acceptance test
// (Codex lean design note, board #29, 2026-07-18), hermetic and offline.
//
// Drives the REAL admin route and the REAL background worker through injected
// seams only (in-memory proposal store, canned model, canned ESV, captured
// triggers, captured audit/cost) — no network, no Supabase, no OpenAI, no
// secrets beyond a dummy admin token. HONESTY NOTE: the real Supabase adapter
// (productionStore in prepare-proposals.ts — its select ordering, the 23505
// insert-conflict mapping, and error returns) is NOT executed here; the fake
// mirrors its contract, and O1 exercises the conflict SEMANTICS through the
// claim logic. Codex's post-merge look at a live proposal covers the adapter.
//
// The acceptance test, verbatim from the design note: prepare one Gospel
// chapter AND one non-map Old Testament chapter without code changes; the
// irrelevant Places section stays absent; an approved proposal cannot mutate;
// a failed proposal cannot unlock generation; no text/image/publish action
// occurs during Prepare.
process.env.DEV_ADMIN_TOKEN = "verify-prepare-proposals-offline-token";

import { POST as routePost } from "../app/api/admin/generation/route";
import prepareWorker from "../netlify/functions/prepare-proposal-background.mts";
import {
  __setPrepareProposalStoreForTesting,
  __setProposalModelForTesting,
  __setProposalEsvLoaderForTesting,
  readLatestProposal,
  approvedProposalApplies,
  claimPrepareProposal,
  loadProposalGuidanceOrFail,
  validateProposalContent,
  proposalGuidanceTexts,
  proposalLaneEligible,
  esvVerseCount,
  PREPARE_PROPOSAL_SCHEMA_VERSION,
  type PrepareProposalStore,
  type PrepareProposalStatus,
} from "../lib/server/prepare-proposals";
import { __setGenerationTestOverrides, getGenerationSettings, type GenerationSettings } from "../lib/server/generation-settings";
import { __setCostCaptureForTesting, type CostEventInput } from "../lib/server/cost-events-repository";
import { __setTriggerTransportForTesting } from "../lib/server/trigger-generation";
import { __setJobStoreForTesting, type JobStorePort, type JobRow, type JobPredicates } from "../lib/server/generation-jobs";
import { __setRowLookupForTesting } from "../lib/server/protected-chapters";
import { __setGenerationConfigBypassForTesting } from "../lib/server/generate-chapter-workup";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    console.error(`verify:prepare-proposals FAILED: ${label}`);
    process.exit(1);
  }
}

const ADMIN = process.env.DEV_ADMIN_TOKEN!;
function adminReq(body: Record<string, unknown>, token = ADMIN): Request {
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
}
function workerReq(body: Record<string, unknown>, method = "POST"): Request {
  return new Request("http://localhost:3000/.netlify/functions/prepare-proposal-background", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

// In-memory proposal store with the production semantics: newest-first
// latest(), insert-as-claim with the one-generating-per-slug partial unique,
// and strictly conditional updates.
class FakeProposalStore implements PrepareProposalStore {
  rows: Array<Record<string, unknown>> = [];
  async latest(slug: string) {
    const mine = this.rows.filter((r) => r.slug === slug);
    return mine.length ? mine[mine.length - 1] : null;
  }
  async insert(row: Record<string, unknown>) {
    if (row.status === "generating" && this.rows.some((r) => r.slug === row.slug && r.status === "generating")) {
      return "conflict" as const;
    }
    this.rows.push({ ...row, created_at: `T${this.rows.length + 1}` });
    return "ok" as const;
  }
  async conditionalUpdate(id: string, expectedStatus: PrepareProposalStatus, next: Record<string, unknown>) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.status !== expectedStatus) return 0;
    Object.assign(row, next);
    return 1;
  }
}

// Minimal generic-jobs store (only what the generic generate path touches).
class FakeJobStore implements JobStorePort {
  rows = new Map<string, { status: string; updated_at: string | null; workup_json: Record<string, unknown> }>();
  private tick = 0;
  async read(slug: string): Promise<JobRow | null | { error: string }> {
    const r = this.rows.get(slug);
    return r ? { status: r.status, updatedAt: r.updated_at, workupJson: r.workup_json } : null;
  }
  async insert(slug: string, payload: Record<string, unknown>) {
    if (this.rows.has(slug)) return "duplicate" as const;
    this.rows.set(slug, {
      status: String(payload.status),
      updated_at: `T${++this.tick}`,
      workup_json: (payload.workup_json as Record<string, unknown>) ?? {},
    });
    return "ok" as const;
  }
  async update(slug: string, p: JobPredicates, next: Record<string, unknown>) {
    const r = this.rows.get(slug);
    if (!r || r.status !== p.status) return 0;
    if ("status" in next) r.status = String(next.status);
    if ("workup_json" in next) r.workup_json = next.workup_json as Record<string, unknown>;
    r.updated_at = `T${++this.tick}`;
    return 1;
  }
}

const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: false,
  allowed_slugs: [],
  selected_text_model: "offline-test-model",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: false,
  updated_at: "T0",
};

// Canned ESV texts: John 3 (Gospel, trimmed to 8 verse markers for the
// harness) and Psalm 117 (real 2-verse chapter — the non-map OT case).
const ESV: Record<string, string> = {
  "John 3": "[1] Now there was a man of the Pharisees named Nicodemus. [2] This man came to Jesus by night. [3] Jesus answered him, Truly, truly. [4] Nicodemus said to him, How can a man be born when he is old? [5] Jesus answered, Truly, truly. [6] That which is born of the flesh is flesh. [7] Do not marvel that I said to you. [8] The wind blows where it wishes.",
  "Psalm 117": "[1] Praise the LORD, all nations! Extol him, all peoples! [2] For great is his steadfast love toward us, and the faithfulness of the LORD endures forever. Praise the LORD!",
};

function movementsCovering(count: number, prefix: string) {
  if (count === 2) {
    return [
      { id: `${prefix}-M01`, startVerse: 1, endVerse: 1, name: "The summons to praise", reason: "All nations are called to praise the LORD (v. 1)." },
      { id: `${prefix}-M02`, startVerse: 2, endVerse: 2, name: "The reason for praise", reason: "Steadfast love and enduring faithfulness ground the call (v. 2)." },
    ];
  }
  return [
    { id: `${prefix}-M01`, startVerse: 1, endVerse: 2, name: "Nicodemus comes by night", reason: "A Pharisee approaches Jesus quietly (vv. 1-2)." },
    { id: `${prefix}-M02`, startVerse: 3, endVerse: 6, name: "Born again", reason: "Jesus answers with new birth from above (vv. 3-6)." },
    { id: `${prefix}-M03`, startVerse: 7, endVerse: count, name: "The wind and the Spirit", reason: "The Spirit moves beyond human control (vv. 7-8)." },
  ];
}

function proposalFor(slug: string, book: string, chapter: number, verseCount: number, locations: unknown[]) {
  return {
    schemaVersion: PREPARE_PROPOSAL_SCHEMA_VERSION,
    slug,
    book,
    chapter,
    sourceReference: `${book} ${chapter}`,
    expectedVerseCount: verseCount,
    movements: movementsCovering(verseCount, slug.toUpperCase().replace(/[^A-Z0-9]/g, "")),
    notes: [
      { id: "N01", text: "State plainly what the text says and what it does not." },
      { id: "N02", text: "Never turn a narrative detail into a universal promise or formula." },
      { id: "N03", text: "Keep every person in the chapter dignified." },
    ],
    watchouts: ["Do not caricature the Pharisees."],
    textualVariants: [],
    locations,
  };
}

async function main() {
  const proposals = new FakeProposalStore();
  const jobs = new FakeJobStore();
  const audit: Array<Record<string, unknown>> = [];
  const costs: CostEventInput[] = [];
  let lastTrigger: { url: string; body: Record<string, unknown> } | null = null;
  let modelCalls = 0;

  __setGenerationConfigBypassForTesting(true);
  __setPrepareProposalStoreForTesting(proposals);
  __setJobStoreForTesting(jobs);
  __setRowLookupForTesting(async (slug: string) => {
    const r = jobs.rows.get(slug);
    return r
      ? ({ kind: "row", row: { status: r.status, updatedAt: r.updated_at } } as const)
      : ({ kind: "missing" } as const);
  });
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting(costs);
  __setProposalEsvLoaderForTesting(async (ref) => (ESV[ref] ? { text: ESV[ref] } : null));
  __setTriggerTransportForTesting(async (req) => {
    lastTrigger = { url: req.url, body: req.body as unknown as Record<string, unknown> };
    return { ok: true, status: 202 };
  });
  __setProposalModelForTesting(async ({ slug, book, chapter, esvText }) => {
    modelCalls += 1;
    const count = esvVerseCount(esvText);
    const locations =
      slug === "john-3"
        ? [
            {
              name: "Jerusalem",
              featureKind: "point",
              certainty: "known",
              role: "context",
              display: "The Passover setting of the surrounding narrative; shown as a point for orientation.",
            },
          ]
        : [];
    return {
      content: JSON.stringify(proposalFor(slug, book, chapter, count, locations)),
      inputTokens: 2000,
      outputTokens: 800,
    };
  });

  const adminPost = (body: Record<string, unknown>, token?: string) => routePost(adminReq(body, token));
  const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

  try {
    // A. Lane eligibility: protected chapters and nonsense refuse; auth required.
    ok((await adminPost({ action: "prepare_proposal_status", slug: "john-3" }, "wrong")).status === 401, "A1 status requires the studio key");
    for (const refused of ["mark-7", "mark-10", "mark-8", "not-a-chapter", "psalm-23"]) {
      const res = await adminPost({ action: "prepare_proposal_status", slug: refused });
      ok(res.status === 400, `A2 ${refused} is not served by the self-serve lane`);
    }
    ok(proposalLaneEligible("john-3").eligible && proposalLaneEligible("psalm-117").eligible, "A3 ordinary chapters are eligible");

    // B. Gospel chapter end-to-end: none → create (confirm) → REAL worker → proposed.
    const none = await json(await adminPost({ action: "prepare_proposal_status", slug: "john-3" }));
    ok(none.status === "none" && typeof none.maxCostUsd === "number" && (none.maxCostUsd as number) > 0, "B1 fresh chapter reports none + a real max cost");
    ok((await adminPost({ action: "prepare_proposal_create", slug: "john-3" })).status === 400, "B2 create without confirmation refuses");
    const created = await json(await adminPost({ action: "prepare_proposal_create", slug: "john-3", confirm: true }));
    ok(created.ok === true && lastTrigger !== null && String(lastTrigger!.url).includes("prepare-proposal-background"), "B3 confirmed create claims + triggers the prepare worker");
    // Duplicate create while generating loses the single-use claim.
    ok((await adminPost({ action: "prepare_proposal_create", slug: "john-3", confirm: true })).status === 409, "B4 a second create while generating conflicts");
    // Worker auth: non-POST and bad tokens are console-only refusals.
    const preAuthAudit = audit.length;
    ok((await prepareWorker(workerReq({}, "GET"))).status === 405, "B5 worker non-POST → 405");
    ok((await prepareWorker(workerReq({ slug: "john-3", job: String(lastTrigger!.body.job), token: "junk" }))).status === 401, "B6 worker bad token → 401");
    ok(audit.length === preAuthAudit, "B7 pre-auth worker refusals write NO durable audit rows");
    // Real delivery.
    const delivered = await prepareWorker(workerReq({ slug: "john-3", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
    ok(delivered.status === 200 && modelCalls === 1, "B8 the real worker ran exactly one model request");
    const proposed = await json(await adminPost({ action: "prepare_proposal_status", slug: "john-3" }));
    ok(proposed.status === "proposed" && /^[a-f0-9]{64}$/u.test(String(proposed.proposalDigest)), "B9 the proposal is stored digest-bound");
    const content = proposed.proposal as Record<string, unknown>;
    ok(Array.isArray(content.movements) && (content.movements as unknown[]).length === 3, "B10 movements arrived");
    ok(costs.some((c) => c.requestType === "prepare_proposal"), "B11 the spend has a durable cost row");
    // Replayed delivery cannot double-run.
    const replay = await prepareWorker(workerReq({ slug: "john-3", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
    ok(replay.status === 500 && modelCalls === 1, "B12 a duplicated delivery does not spend again");

    // C. During Prepare, nothing else happened: no workup rows, no drafts,
    // no image/publish actions.
    ok(jobs.rows.size === 0, "C1 Prepare created no chapter_workups rows (no phantom drafts)");
    ok(!audit.some((a) => ["generate_text", "generate_images", "publish"].includes(String(a.action))), "C2 no text/image/publish action occurred during Prepare");

    // D. Unprepared/unapproved chapters cannot generate (the IQ-011 gate).
    const gated = await adminPost({ action: "generate", slug: "john-3", confirm: true });
    const gatedBody = (await gated.json()) as { error?: string };
    ok(gated.status === 403 && /prepare this chapter first/.test(gatedBody.error ?? ""), "D1 proposed-but-unapproved chapter is refused generation with the Prepare pointer");
    ok(!(await getGenerationSettings()).allowed_slugs.includes("john-3"), "D2 the refused generate never allowlisted the slug");

    // E. Approval is digest-bound; wrong digest 409; right digest approves.
    ok((await adminPost({ action: "prepare_proposal_approve", slug: "john-3", confirm: true, proposalDigest: "0".repeat(64) })).status === 409, "E1 a drifted digest cannot approve");
    const approveRes = await adminPost({ action: "prepare_proposal_approve", slug: "john-3", confirm: true, proposalDigest: String(proposed.proposalDigest) });
    ok(approveRes.status === 200, "E2 the exact reviewed digest approves");
    ok(await approvedProposalApplies("john-3"), "E3 the approved proposal now applies");
    // Approved proposals cannot mutate.
    const approvedRow = await readLatestProposal("john-3");
    ok(approvedRow?.status === "approved", "E4 row is approved");
    ok((await proposals.conditionalUpdate(approvedRow!.id, "proposed", { proposal_json: {} })) === 0, "E5 an approved proposal cannot be rewritten through the proposed predicate");
    // The REAL read-time defense: a tampered stored row stops applying.
    {
      const stored = proposals.rows.find((r) => r.id === approvedRow!.id)!;
      const originalJson = stored.proposal_json;
      stored.proposal_json = { ...(originalJson as Record<string, unknown>), expectedVerseCount: 99 };
      ok(!(await approvedProposalApplies("john-3")), "E5b a tampered approved row is no receipt (digest recompute fails closed)");
      let guidanceThrew = false;
      try {
        await loadProposalGuidanceOrFail("john-3");
      } catch {
        guidanceThrew = true;
      }
      ok(guidanceThrew, "E5c the draft-time guidance load FAILS on a tampered proposal instead of proceeding without it");
      stored.proposal_json = originalJson;
      ok(await approvedProposalApplies("john-3"), "E5d the untampered row applies again");
    }
    ok((await adminPost({ action: "prepare_proposal_create", slug: "john-3", confirm: true })).status === 403, "E5e creating over an APPROVED proposal refuses (approval cannot be silently buried)");
    ok((await adminPost({ action: "prepare_proposal_approve", slug: "john-3", confirm: true, proposalDigest: String(proposed.proposalDigest) })).status === 404, "E6 approving twice finds nothing reviewable");
    ok((await adminPost({ action: "prepare_proposal_reject", slug: "john-3", proposalDigest: String(proposed.proposalDigest) })).status === 404, "E7 rejecting an approved proposal finds nothing reviewable");
    // The approved content feeds the draft prompt.
    const guidance = proposalGuidanceTexts(approvedRow!.proposal_json!);
    ok(guidance.some((line) => line.includes("Born again")) && guidance.some((line) => line.includes("movement boundaries")), "E8 the approved proposal renders into draft guidance");

    // F. With the approval, the generic generate gate opens (the request now
    // proceeds past the IQ-011 gate to the allowlist + claim machinery).
    lastTrigger = null;
    const generateRes = await adminPost({ action: "generate", slug: "john-3", confirm: true });
    ok(generateRes.status === 200, "F1 an approved chapter passes the gate and queues");
    ok(lastTrigger !== null && String(lastTrigger!.url).includes("generate-chapter-background"), "F2 the draft trigger fired only after approval");
    ok(jobs.rows.get("john-3")?.status === "generating", "F3 the draft claim exists only after approval");
    jobs.rows.delete("john-3");

    // G. Non-map OT chapter: Psalm 117 proposes with NO locations — Places
    // stays absent — and a legacy-shaped location is refused outright.
    lastTrigger = null;
    ok((await adminPost({ action: "prepare_proposal_create", slug: "psalm-117", confirm: true })).status === 200, "G1 the OT chapter creates");
    const psalmRun = await prepareWorker(workerReq({ slug: "psalm-117", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
    ok(psalmRun.status === 200, "G2 the OT proposal run succeeds");
    const psalm = await json(await adminPost({ action: "prepare_proposal_status", slug: "psalm-117" }));
    ok(psalm.status === "proposed" && Array.isArray((psalm.proposal as Record<string, unknown>).locations) && ((psalm.proposal as Record<string, unknown>).locations as unknown[]).length === 0, "G3 a chapter a map cannot serve carries ZERO locations (Places hidden)");
    const legacyShaped = validateProposalContent(
      proposalFor("psalm-117", "Psalm", 117, 2, [{ name: "Zion", certainty: "known", display: "legacy shape" }]),
      "psalm-117",
      2,
    );
    ok(!legacyShaped.ok && /three-axis/.test((legacyShaped as { reason: string }).reason), "G4 legacy-shaped locations refuse — only the three-axis honesty model is accepted");

    // H. Fail-closed validation classes (driven through the REAL worker).
    const failCase = async (
      label: string,
      slug: string,
      mutate: (p: Record<string, unknown>) => void,
      expectReason: RegExp,
    ) => {
      __setProposalModelForTesting(async ({ book, chapter, esvText }) => {
        const p = proposalFor(slug, book, chapter, esvVerseCount(esvText), []) as unknown as Record<string, unknown>;
        mutate(p);
        return { content: JSON.stringify(p), inputTokens: 100, outputTokens: 50 };
      });
      lastTrigger = null;
      ok((await adminPost({ action: "prepare_proposal_create", slug, confirm: true })).status === 200, `${label} creates`);
      await prepareWorker(workerReq({ slug, job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
      const after = await readLatestProposal(slug);
      ok(after?.status === "failed" && expectReason.test(after.error ?? ""), `${label} fails closed with one plain reason`);
      ok(!(await approvedProposalApplies(slug)), `${label} unlocks nothing`);
      const stillGated = await adminPost({ action: "generate", slug, confirm: true });
      ok(stillGated.status === 403, `${label} cannot generate`);
    };
    ESV["John 4"] = ESV["John 3"];
    await failCase("H1 movement gap", "john-4", (p) => {
      (p.movements as Array<Record<string, unknown>>)[1].startVerse = 4; // gap at 3
      p.slug = "john-4";
      p.chapter = 4;
      p.sourceReference = "John 4";
    }, /gap or overlap|does not match/);
    await failCase("H2 placeholder text", "john-4", (p) => {
      p.slug = "john-4"; p.chapter = 4; p.sourceReference = "John 4";
      (p.notes as Array<Record<string, unknown>>)[0].text = "TODO fill in later";
    }, /unique id and real text|placeholder/);
    await failCase("H3 identity smuggle", "john-4", (p) => {
      p.slug = "john-3"; // wrong chapter identity under john-4's claim
    }, /does not match/);
    // Honest model decline.
    __setProposalModelForTesting(async () => ({ content: JSON.stringify({ error: "the source is too ambiguous" }), inputTokens: 10, outputTokens: 5 }));
    lastTrigger = null;
    await adminPost({ action: "prepare_proposal_create", slug: "john-4", confirm: true });
    await prepareWorker(workerReq({ slug: "john-4", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
    const declined = await readLatestProposal("john-4");
    ok(declined?.status === "failed" && /declined honestly/.test(declined.error ?? ""), "H4 the model may decline honestly; the row fails with its reason");

    // I. Post-dispatch model failure records possible spend (IQ-006 standard).
    __setProposalModelForTesting(async () => {
      throw new Error("socket hang up (connection lost after dispatch)");
    });
    const costsBefore = costs.length;
    lastTrigger = null;
    await adminPost({ action: "prepare_proposal_create", slug: "john-4", confirm: true });
    await prepareWorker(workerReq({ slug: "john-4", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
    const failedRun = await readLatestProposal("john-4");
    ok(failedRun?.status === "failed" && /MAY be billed/.test(failedRun.error ?? ""), "I1 a post-dispatch failure says the request may be billed");
    const uncertain = costs.slice(costsBefore).find((c) => (c.metadata as { billingUncertain?: boolean })?.billingUncertain === true);
    ok(Boolean(uncertain), "I2 the possible spend has a durable billingUncertain cost row");

    // J. Missing source fails closed BEFORE any dispatch (no spend).
    __setProposalModelForTesting(async () => {
      throw new Error("model must never be reached");
    });
    lastTrigger = null;
    await adminPost({ action: "prepare_proposal_create", slug: "luke-9", confirm: true });
    await prepareWorker(workerReq({ slug: "luke-9", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) }));
    const noSource = await readLatestProposal("luke-9");
    ok(noSource?.status === "failed" && /could not be loaded — nothing was spent/.test(noSource.error ?? ""), "J1 a missing ESV source stops with a plain reason and no spend");

    // L. Atomic consume before spend: a DUPLICATED CONCURRENT delivery
    // dispatches exactly one model request.
    ESV["Luke 8"] = ESV["John 3"];
    __setProposalModelForTesting(async ({ slug: s2, book, chapter, esvText }) => {
      modelCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20)); // let the race overlap
      return {
        content: JSON.stringify(proposalFor(s2, book, chapter, esvVerseCount(esvText), [])),
        inputTokens: 500,
        outputTokens: 200,
      };
    });
    lastTrigger = null;
    const callsBefore = modelCalls;
    ok((await adminPost({ action: "prepare_proposal_create", slug: "luke-8", confirm: true })).status === 200, "L1 creates");
    const dupBody = { slug: "luke-8", job: String(lastTrigger!.body.job), token: String(lastTrigger!.body.token) };
    const [first, second] = await Promise.all([
      prepareWorker(workerReq(dupBody)),
      prepareWorker(workerReq(dupBody)),
    ]);
    ok(modelCalls === callsBefore + 1, "L2 concurrent duplicate deliveries dispatch exactly ONE model request");
    ok([first.status, second.status].sort().join(",") === "200,500", "L3 exactly one delivery wins the atomic consume");

    // M. The text kill switch covers this paid lane.
    __setGenerationTestOverrides({ settings: { ...TEST_SETTINGS, text_generation_enabled: false }, captureAudit: audit });
    ok((await adminPost({ action: "prepare_proposal_create", slug: "luke-9", confirm: true })).status === 403, "M1 Text Generation OFF refuses proposal spends");
    __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });

    // N. Stale-claim unstick: a claim past the worker's maximum lifetime is
    // conditionally failed and a fresh claim proceeds — honestly worded.
    proposals.rows.push({
      id: "stale-row-1",
      slug: "luke-10",
      status: "running",
      job_id: "dead-job",
      schema_version: PREPARE_PROPOSAL_SCHEMA_VERSION,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const unstuck = await claimPrepareProposal("luke-10", "fresh-job");
    ok(typeof unstuck === "string", "N1 a fresh claim proceeds past the stale one");
    const staleRow = proposals.rows.find((r) => r.id === "stale-row-1")!;
    ok(staleRow.status === "failed" && /cost ledger/.test(String(staleRow.error)), "N2 the stale claim failed with honest spend wording (never 'nothing was spent')");
    // A RECENT claim still conflicts.
    let recentConflict = false;
    try {
      await claimPrepareProposal("luke-10", "another-job");
    } catch (e) {
      recentConflict = (e as { code?: string }).code === "CONFLICT";
    }
    ok(recentConflict, "N3 a live (recent) claim still conflicts — the unstick never clobbers a live worker");
    proposals.rows.length = proposals.rows.length; // no-op; rows retained for O
    // O. The insert-level race branch (two creates passing the pre-read
    // simultaneously): the second insert loses on the partial-unique conflict.
    {
      const realLatest = proposals.latest.bind(proposals);
      let hidden = true;
      proposals.latest = async (slugArg: string) => (hidden && slugArg === "luke-10" ? null : realLatest(slugArg));
      let raceConflict = false;
      try {
        await claimPrepareProposal("luke-10", "racing-job");
      } catch (e) {
        raceConflict = (e as { code?: string }).code === "CONFLICT";
      }
      proposals.latest = realLatest;
      hidden = false;
      ok(raceConflict, "O1 a racing create loses at the INSERT (partial-unique) even when the pre-read missed the claim");
    }

    // K. A failed trigger clears its claim (nothing stranded generating).
    __setTriggerTransportForTesting(async () => ({ ok: false, status: 502, error: "offline" }));
    const triggerFail = await adminPost({ action: "prepare_proposal_create", slug: "luke-9", confirm: true });
    ok(triggerFail.status === 502, "K1 a failed trigger surfaces as a refusal");
    const cleared = await readLatestProposal("luke-9");
    ok(cleared?.status === "failed" && /worker was never invoked/.test(cleared.error ?? ""), "K2 the claim was marked failed — provably nothing spent, nothing stranded");
  } finally {
    __setGenerationConfigBypassForTesting(false);
    __setPrepareProposalStoreForTesting(null);
    __setProposalModelForTesting(null);
    __setProposalEsvLoaderForTesting(null);
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setTriggerTransportForTesting(null);
    __setJobStoreForTesting(null);
    __setRowLookupForTesting(null);
  }

  console.log(
    `verify:prepare-proposals ✓ ${checks} checks passed (self-serve Prepare: one confirmed request, fail-closed validation, digest-bound approval, nothing else moves)`,
  );
}

void main();
