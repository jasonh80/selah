// SERVER-ONLY. Self-serve chapter preparation proposals (IQ-011, owner
// decision 2026-07-18: "Prepare becomes a built-in launch-page step for every
// chapter"; Codex lean design note, board #29 same day).
//
// A PROPOSAL is a structured, chapter-appropriate preparation spec — movement
// boundaries and names, guidance notes, watch-outs, textual variants, and
// honest three-axis locations ONLY when genuinely useful — generated at
// runtime by one bounded, single-use, explicitly-confirmed model call and
// validated FAIL-CLOSED before the owner ever sees an approval button. A
// proposal authorizes NOTHING by itself: only the owner's digest-bound
// "Approve & set up" unlocks the (separately confirmed) generic draft flow.
//
// The protected Mark 7–11 lane is untouched: those chapters carry reviewed
// version-controlled artifacts and digest-bound receipts. This module serves
// every OTHER chapter, replacing the per-chapter fixture PR with a runtime
// proposal the owner reviews on-screen.
//
// Storage is the dedicated immutable table chapter_prepare_proposals (see
// supabase/chapter-prepare-proposals.sql — Jason runs the DDL once, exactly
// like chapter_setup_approvals; until then everything here fails closed).
// The single-use claim IS a row insert (status 'generating', one per slug at
// a time via partial unique index), atomically CONSUMED by the worker
// (generating→running) BEFORE any model dispatch — claims never touch
// chapter_workups, so no phantom drafts exist.
//
// SCOPE NOTE (v1, stated plainly): on-screen EDITING of a proposal (design
// note step 6, "Jason may edit; edits create a new digest") is NOT built yet —
// the owner approves or rejects the proposal exactly as generated; to change
// one, reject it and create a fresh proposal. Queued as the follow-up.
import { getSupabaseAdmin } from "./supabase";
import { getOpenAI, CHAPTER_WORKUP_TEXT_MODEL } from "./openai";
import { getEsvPassage } from "./esv";
import { sha256Canonical, sha256Text } from "./generation-manifest";
import { estimateChapterWorkupCost } from "../ai/costs";
import { recordCostEventStrict } from "./cost-events-repository";
import { logGenerationAudit } from "./generation-settings";
import { normalizePrepareLocation, type PrepareLocation } from "../prepare-locations";
import { parseSlug } from "./generate-chapter-workup";
import { isMarkSprintSlug } from "./mark-sprint-manifest-policy";
import { selectRulesForGeneration } from "./selah-brain";
import { isConnectedStudioSlug } from "../studio-mark8-preflight";
import { PROTECTED_SLUGS } from "./protected-chapters";

const TABLE = "chapter_prepare_proposals";
export const PREPARE_PROPOSAL_SCHEMA_VERSION = "prepare-proposal.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
// Past the 20-min job-token TTL + the worker's model budget + margin: no live
// worker can still exist for a claim this old.
const STALE_CLAIM_MS = 35 * 60 * 1000;

// Bounded fields (validation refuses anything outside these — no silent
// truncation, the model is told the bounds and a violation fails the run).
const BOUNDS = {
  movementsMin: 1,
  movementsMax: 12,
  nameMax: 90,
  reasonMax: 400,
  notesMin: 3,
  notesMax: 12,
  noteMax: 700,
  watchoutsMax: 10,
  watchoutMax: 400,
  variantsMax: 10,
  variantMax: 400,
  locationsMax: 8,
  displayMax: 500,
  totalJsonMax: 32_000,
} as const;

export interface PrepareProposalMovement {
  id: string;
  startVerse: number;
  endVerse: number;
  name: string;
  reason: string;
}

export interface PrepareProposalContent {
  schemaVersion: typeof PREPARE_PROPOSAL_SCHEMA_VERSION;
  slug: string;
  book: string;
  chapter: number;
  sourceReference: string;
  expectedVerseCount: number;
  movements: PrepareProposalMovement[];
  notes: { id: string; text: string }[];
  watchouts: string[];
  textualVariants: string[];
  // Three-axis entries ONLY (featureKind × certainty × role). Empty when a
  // map would not serve the chapter — the review screen hides Places then.
  locations: PrepareLocation[];
}

export type PrepareProposalStatus =
  | "generating" // claimed/queued — the worker has NOT consumed it yet
  | "running" // atomically consumed by the worker BEFORE any model dispatch
  | "proposed"
  | "failed"
  | "approved"
  | "superseded";

export interface PrepareProposalRow {
  id: string;
  slug: string;
  status: PrepareProposalStatus;
  job_id: string;
  proposal_json: PrepareProposalContent | null;
  proposal_digest: string | null;
  source_digest: string | null;
  model: string | null;
  schema_version: string | null;
  error: string | null;
  cost_usd: number | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  evidence: string | null;
}

// ---------------------------------------------------------------------------
// Store port + test seam (mirrors chapter-setup-approvals / JobStorePort).
// ---------------------------------------------------------------------------
export interface PrepareProposalStore {
  latest(slug: string): Promise<Record<string, unknown> | null>;
  insert(row: Record<string, unknown>): Promise<"ok" | "conflict" | { error: string }>;
  /** Conditional write: only rows matching (id, expected status) move. Returns
   * the number of rows changed — 0 means the predicate lost (never throw a
   * plausible success). */
  conditionalUpdate(
    id: string,
    expectedStatus: PrepareProposalStatus,
    next: Record<string, unknown>,
  ): Promise<number | { error: string }>;
}

let storeForTesting: PrepareProposalStore | null = null;
export function __setPrepareProposalStoreForTesting(store: PrepareProposalStore | null): void {
  storeForTesting = store;
}

function productionStore(): PrepareProposalStore | null {
  if (storeForTesting) return storeForTesting;
  const db = getSupabaseAdmin();
  if (!db) return null;
  return {
    async latest(slug: string) {
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error(`[selah] prepare proposal read failed (${slug})`);
        return null;
      }
      return (data as Record<string, unknown> | null) ?? null;
    },
    async insert(row: Record<string, unknown>) {
      const { error } = await db.from(TABLE).insert(row);
      if (!error) return "ok";
      // The partial unique index (one 'generating' row per slug) reports as a
      // conflict — that is the single-use claim losing, not an outage.
      if (String(error.code) === "23505") return "conflict";
      console.error(`[selah] prepare proposal insert failed (${String(row.slug)})`);
      return { error: error.message };
    },
    async conditionalUpdate(id, expectedStatus, next) {
      const { data, error } = await db
        .from(TABLE)
        .update(next)
        .eq("id", id)
        .eq("status", expectedStatus)
        .select("id");
      if (error) {
        console.error(`[selah] prepare proposal update failed (${id})`);
        return { error: error.message };
      }
      return (data ?? []).length;
    },
  };
}

// ---------------------------------------------------------------------------
// Row reading, strictly validated (fail-closed like readStoredSetupApproval).
// ---------------------------------------------------------------------------
function rowStatus(raw: Record<string, unknown>): PrepareProposalStatus | null {
  const s = raw.status;
  return s === "generating" || s === "running" || s === "proposed" || s === "failed" ||
    s === "approved" || s === "superseded"
    ? s
    : null;
}

export async function readLatestProposal(slug: string): Promise<PrepareProposalRow | null> {
  const store = productionStore();
  if (!store) return null;
  const raw = await store.latest(slug);
  if (!raw) return null;
  const status = rowStatus(raw);
  if (!status || raw.slug !== slug || typeof raw.id !== "string" || typeof raw.job_id !== "string") {
    return null;
  }
  let content: PrepareProposalContent | null = null;
  if (raw.proposal_json && (status === "proposed" || status === "approved" || status === "superseded")) {
    const validated = validateProposalContent(raw.proposal_json, slug);
    if (!validated.ok) return null; // a stored row that no longer validates is no proposal
    content = validated.content;
    const digest = typeof raw.proposal_digest === "string" ? raw.proposal_digest : "";
    if (!SHA256.test(digest) || digest !== proposalDigestOf(content)) return null;
  }
  return {
    id: raw.id,
    slug,
    status,
    job_id: raw.job_id,
    proposal_json: content,
    proposal_digest: typeof raw.proposal_digest === "string" ? raw.proposal_digest : null,
    source_digest: typeof raw.source_digest === "string" ? raw.source_digest : null,
    model: typeof raw.model === "string" ? raw.model : null,
    schema_version: typeof raw.schema_version === "string" ? raw.schema_version : null,
    error: typeof raw.error === "string" ? raw.error : null,
    cost_usd: typeof raw.cost_usd === "number" ? raw.cost_usd : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    approved_by: typeof raw.approved_by === "string" ? raw.approved_by : null,
    approved_at: typeof raw.approved_at === "string" ? raw.approved_at : null,
    evidence: typeof raw.evidence === "string" ? raw.evidence : null,
  };
}

/** The gate the generic generate path consults: an APPROVED, digest-intact
 * proposal for this exact slug. Fail-closed everywhere. */
export async function approvedProposalApplies(slug: string): Promise<boolean> {
  const row = await readLatestProposal(slug);
  return Boolean(
    row &&
      row.status === "approved" &&
      row.proposal_json &&
      row.proposal_digest &&
      row.approved_by &&
      row.approved_at &&
      !Number.isNaN(Date.parse(row.approved_at)),
  );
}

/** The approved proposal's content, for loading into the confirmed draft run
 * ("Approve & set up ... loads only that version"). */
export async function readApprovedProposalContent(
  slug: string,
): Promise<PrepareProposalContent | null> {
  const row = await readLatestProposal(slug);
  if (!row || row.status !== "approved" || !row.proposal_json) return null;
  return row.proposal_json;
}

/** Draft-time guidance load, FAIL-CLOSED for proposal-lane chapters (design
 * note: "Approve & set up ... loads only that version"): no proposal row at
 * all = a legacy chapter, proceed with no guidance; any row present demands a
 * valid APPROVED proposal or the paid draft must not run. */
export async function loadProposalGuidanceOrFail(slug: string): Promise<string[]> {
  const store = productionStore();
  if (!store) return []; // storage off entirely — legacy/offline behavior
  const raw = await store.latest(slug);
  if (!raw) return []; // legacy chapter: never had a proposal
  const row = await readLatestProposal(slug);
  if (!row || row.status !== "approved" || !row.proposal_json) {
    throw new Error(
      "this chapter's preparation proposal is missing, unapproved, or changed since authorization — the draft must not run without it",
    );
  }
  return proposalGuidanceTexts(row.proposal_json);
}

/** Render the approved proposal as plain guidance lines for the generic
 * draft prompt ("Approve & set up ... loads only that version"). */
export function proposalGuidanceTexts(content: PrepareProposalContent): string[] {
  const lines: string[] = [
    `Owner-approved preparation for ${content.sourceReference} (${content.expectedVerseCount} verses). Honor these movement boundaries exactly:`,
    ...content.movements.map(
      (m) => `Movement ${m.startVerse}–${m.endVerse} "${m.name}": ${m.reason}`,
    ),
    ...content.notes.map((n) => `Guidance: ${n.text}`),
    ...content.watchouts.map((w) => `Watch out: ${w}`),
    ...content.textualVariants.map((v) => `Textual variant: ${v}`),
  ];
  if (content.locations.length > 0) {
    lines.push(
      "Approved place treatment (honesty model — never assert more certainty than stated):",
      ...content.locations.map(
        (l) => `${l.name} [${l.featureKind}/${l.certainty}/${l.role}]: ${l.display}`,
      ),
    );
  } else {
    lines.push("No map or location claims for this chapter — the approved preparation includes none.");
  }
  return lines;
}

export function proposalDigestOf(content: PrepareProposalContent): string {
  return sha256Canonical(content);
}

// ---------------------------------------------------------------------------
// Fail-closed validation. One plain reason per failure — never a partial pass.
// ---------------------------------------------------------------------------
export type ProposalValidation =
  | { ok: true; content: PrepareProposalContent }
  | { ok: false; reason: string };

const PLACEHOLDER = /\b(todo|tbd|placeholder|lorem ipsum|fill in|xxx)\b/i;

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || PLACEHOLDER.test(trimmed)) return null;
  return trimmed;
}

export function validateProposalContent(
  value: unknown,
  slug: string,
  sourceVerseCount?: number,
): ProposalValidation {
  if (!value || typeof value !== "object") return { ok: false, reason: "proposal is not an object" };
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== PREPARE_PROPOSAL_SCHEMA_VERSION) {
    return { ok: false, reason: `unknown schema version (expected ${PREPARE_PROPOSAL_SCHEMA_VERSION})` };
  }
  const identity = parseSlug(slug);
  if (!identity) return { ok: false, reason: "unparseable chapter slug" };
  if (raw.slug !== slug) return { ok: false, reason: "proposal slug does not match the requested chapter" };
  if (raw.book !== identity.book || raw.chapter !== identity.chapter) {
    return { ok: false, reason: "proposal book/chapter does not match the requested chapter" };
  }
  const sourceReference = cleanString(raw.sourceReference, 60);
  if (sourceReference !== `${identity.book} ${identity.chapter}`) {
    return { ok: false, reason: "proposal source reference does not match the chapter" };
  }
  const expectedVerseCount = raw.expectedVerseCount;
  if (
    typeof expectedVerseCount !== "number" ||
    !Number.isInteger(expectedVerseCount) ||
    expectedVerseCount < 1 ||
    expectedVerseCount > 200
  ) {
    return { ok: false, reason: "expectedVerseCount is not a sane verse count" };
  }
  if (sourceVerseCount !== undefined && expectedVerseCount !== sourceVerseCount) {
    return {
      ok: false,
      reason: `expectedVerseCount ${expectedVerseCount} does not match the loaded ESV source (${sourceVerseCount} verse markers)`,
    };
  }

  // Movements: full coverage 1..N, contiguous, no gaps or overlaps, named.
  if (!Array.isArray(raw.movements)) return { ok: false, reason: "movements missing" };
  if (raw.movements.length < BOUNDS.movementsMin || raw.movements.length > BOUNDS.movementsMax) {
    return { ok: false, reason: `movements count must be ${BOUNDS.movementsMin}–${BOUNDS.movementsMax}` };
  }
  const movements: PrepareProposalMovement[] = [];
  const movementIds = new Set<string>();
  let cursor = 1;
  for (const entry of raw.movements) {
    const m = entry as Record<string, unknown>;
    const id = cleanString(m.id, 24);
    const name = cleanString(m.name, BOUNDS.nameMax);
    const reason = cleanString(m.reason, BOUNDS.reasonMax);
    if (!id || movementIds.has(id)) return { ok: false, reason: "movement ids must be unique and present" };
    if (!name || !reason) return { ok: false, reason: "every movement needs a real name and reason" };
    const start = m.startVerse;
    const end = m.endVerse;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end)) {
      return { ok: false, reason: "movement verse bounds must be integers" };
    }
    if (start !== cursor) {
      return { ok: false, reason: `movement coverage breaks at verse ${cursor} (gap or overlap)` };
    }
    if (end < start) return { ok: false, reason: "movement end before start" };
    cursor = end + 1;
    movementIds.add(id);
    movements.push({ id, startVerse: start, endVerse: end, name, reason });
  }
  if (cursor !== expectedVerseCount + 1) {
    return { ok: false, reason: `movements cover 1–${cursor - 1} but the chapter has ${expectedVerseCount} verses` };
  }

  // Notes: chapter-appropriate count (no 10-note hardcode), each real.
  if (!Array.isArray(raw.notes)) return { ok: false, reason: "notes missing" };
  if (raw.notes.length < BOUNDS.notesMin || raw.notes.length > BOUNDS.notesMax) {
    return { ok: false, reason: `notes count must be ${BOUNDS.notesMin}–${BOUNDS.notesMax}` };
  }
  const notes: { id: string; text: string }[] = [];
  const noteIds = new Set<string>();
  for (const entry of raw.notes) {
    const n = entry as Record<string, unknown>;
    const id = cleanString(n.id, 24);
    const text = cleanString(n.text, BOUNDS.noteMax);
    if (!id || noteIds.has(id) || !text) return { ok: false, reason: "every note needs a unique id and real text" };
    noteIds.add(id);
    notes.push({ id, text });
  }

  const readStrings = (key: "watchouts" | "textualVariants", max: number, itemMax: number): string[] | null => {
    const list = raw[key];
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list) || list.length > max) return null;
    const out: string[] = [];
    for (const item of list) {
      const s = cleanString(item, itemMax);
      if (!s) return null;
      out.push(s);
    }
    return out;
  };
  const watchouts = readStrings("watchouts", BOUNDS.watchoutsMax, BOUNDS.watchoutMax);
  if (!watchouts) return { ok: false, reason: "watchouts malformed" };
  const textualVariants = readStrings("textualVariants", BOUNDS.variantsMax, BOUNDS.variantMax);
  if (!textualVariants) return { ok: false, reason: "textual variants malformed" };

  // Locations: OPTIONAL (empty = no map value for this chapter, Places stays
  // hidden). Anything present must be the full three-axis shape and an
  // allowed featureKind × certainty combination — legacy shapes refuse.
  const locations: PrepareLocation[] = [];
  if (raw.locations !== undefined && raw.locations !== null) {
    if (!Array.isArray(raw.locations) || raw.locations.length > BOUNDS.locationsMax) {
      return { ok: false, reason: "locations malformed" };
    }
    for (const entry of raw.locations) {
      const e = entry as Record<string, unknown>;
      if (e.featureKind === undefined || e.role === undefined) {
        return { ok: false, reason: "locations must use the three-axis shape (featureKind, certainty, role)" };
      }
      const normalized = normalizePrepareLocation(entry);
      if (!normalized) return { ok: false, reason: "a location entry is invalid under the honesty model" };
      if (normalized.display.length > BOUNDS.displayMax || PLACEHOLDER.test(normalized.display)) {
        return { ok: false, reason: "a location display text is unbounded or placeholder" };
      }
      locations.push(normalized);
    }
  }

  const content: PrepareProposalContent = {
    schemaVersion: PREPARE_PROPOSAL_SCHEMA_VERSION,
    slug,
    book: identity.book,
    chapter: identity.chapter,
    sourceReference,
    expectedVerseCount,
    movements,
    notes,
    watchouts,
    textualVariants,
    locations,
  };
  if (JSON.stringify(content).length > BOUNDS.totalJsonMax) {
    return { ok: false, reason: "proposal exceeds the bounded size" };
  }
  return { ok: true, content };
}

// ---------------------------------------------------------------------------
// Eligibility + free status (spends nothing).
// ---------------------------------------------------------------------------
export interface ProposalEligibility {
  eligible: boolean;
  reason?: string;
}

/** Chapters served by THIS lane: any parseable chapter that is not protected
 * (the Mark sprint keeps its frozen fixture lane) and not psalm-23/mark-6
 * style protected legacy. */
export function proposalLaneEligible(slug: string): ProposalEligibility {
  if (!parseSlug(slug)) return { eligible: false, reason: "not a recognizable chapter slug" };
  if (isMarkSprintSlug(slug) || isConnectedStudioSlug(slug)) {
    return { eligible: false, reason: "this chapter uses the protected prepared lane" };
  }
  if ((PROTECTED_SLUGS as readonly string[]).includes(slug)) {
    return { eligible: false, reason: "this chapter is protected" };
  }
  return { eligible: true };
}

/** Conservative maximum cost shown before the one confirmation. Computed from
 * the bounded call shape (input ≈ chapter text + rules, output ≤ the
 * completion cap) — the real cost is recorded from actual usage. */
export function proposalMaxCostUsd(): number {
  const estimate = estimateChapterWorkupCost({
    inputTokens: 16_000,
    cachedInputTokens: 0,
    outputTokens: 6_000,
  });
  // Ceil, never round down — the shown number is a MAXIMUM.
  return Math.ceil(estimate.textEstimateUsd * 100) / 100;
}

// ---------------------------------------------------------------------------
// Claim (insert-as-claim) + worker run.
// ---------------------------------------------------------------------------
export class ProposalClaimError extends Error {
  constructor(
    public readonly code: "CONFLICT" | "WRITE_FAILED" | "REFUSED",
    message: string,
  ) {
    super(message);
  }
}

export async function claimPrepareProposal(slug: string, jobId: string): Promise<string> {
  const eligibility = proposalLaneEligible(slug);
  if (!eligibility.eligible) {
    throw new ProposalClaimError("REFUSED", eligibility.reason ?? "not eligible");
  }
  const store = productionStore();
  if (!store) throw new ProposalClaimError("WRITE_FAILED", "proposal storage is not available (fail-closed)");
  const raw = await store.latest(slug);
  const rawStatus = raw ? rowStatus(raw) : null;
  if (raw && (rawStatus === "generating" || rawStatus === "running")) {
    // Stale-claim unstick (adversarial pre-review finding 2): a worker that
    // hard-died can strand its claim. After STALE_CLAIM_MS — comfortably past
    // the 20-min token TTL plus the worker's own budget, so no live worker
    // can still be running — the stale row may be conditionally failed and a
    // fresh claim taken. The conditional write loses to a worker finishing at
    // the same instant, so a live run is never clobbered. If the dead worker
    // did dispatch, its spend is already in the cost ledger (or recorded as
    // possible spend); the row says so rather than claiming no-spend.
    const createdAt = typeof raw.created_at === "string" ? Date.parse(raw.created_at) : NaN;
    const stale = Number.isNaN(createdAt) ? false : Date.now() - createdAt > STALE_CLAIM_MS;
    if (!stale) {
      throw new ProposalClaimError("CONFLICT", "a proposal is already being created for this chapter");
    }
    const cleared = await store.conditionalUpdate(String(raw.id), rawStatus, {
      status: "failed",
      error:
        "stale claim cleared after its worker's maximum lifetime; any spend it made is in the cost ledger",
    });
    if (typeof cleared !== "number" || cleared !== 1) {
      throw new ProposalClaimError("CONFLICT", "the previous proposal finished just now — check its result first");
    }
  }
  if (rawStatus === "approved") {
    throw new ProposalClaimError(
      "REFUSED",
      "this chapter already has an approved preparation — generate its draft, or reject the approval flow first",
    );
  }
  const id = crypto.randomUUID();
  const inserted = await store.insert({
    id,
    slug,
    status: "generating",
    job_id: jobId,
    schema_version: PREPARE_PROPOSAL_SCHEMA_VERSION,
  });
  if (inserted === "conflict") {
    throw new ProposalClaimError("CONFLICT", "a proposal is already being created for this chapter");
  }
  if (inserted !== "ok") {
    throw new ProposalClaimError("WRITE_FAILED", "the proposal claim could not be recorded (fail-closed)");
  }
  return id;
}

// Model seam so the offline gate can drive the REAL job with a canned model.
type ProposalModelCall = (input: {
  slug: string;
  book: string;
  chapter: number;
  esvText: string;
}) => Promise<{ content: string; inputTokens: number; outputTokens: number }>;
let proposalModelForTesting: ProposalModelCall | null = null;
export function __setProposalModelForTesting(fn: ProposalModelCall | null): void {
  proposalModelForTesting = fn;
}
// ESV seam: the gate runs with no network/key.
let esvLoaderForTesting: ((reference: string) => Promise<{ text: string } | null>) | null = null;
export function __setProposalEsvLoaderForTesting(
  fn: ((reference: string) => Promise<{ text: string } | null>) | null,
): void {
  esvLoaderForTesting = fn;
}

function proposalPrompt(
  book: string,
  chapter: number,
  esvText: string,
  verseCount: number,
  brainRules: readonly string[],
): string {
  return [
    `You are preparing a study specification for ${book} ${chapter} (ESV, ${verseCount} verses).`,
    "Return ONLY a JSON object with keys: schemaVersion, slug, book, chapter, sourceReference, expectedVerseCount, movements, notes, watchouts, textualVariants, locations.",
    `schemaVersion must be "${PREPARE_PROPOSAL_SCHEMA_VERSION}". sourceReference must be "${book} ${chapter}".`,
    `movements: ${BOUNDS.movementsMin}–${BOUNDS.movementsMax} entries covering verses 1–${verseCount} exactly, contiguous, no gaps or overlaps; each {id, startVerse, endVerse, name, reason} — short honest name (≤${BOUNDS.nameMax} chars) and one-sentence reason with a verse anchor (≤${BOUNDS.reasonMax} chars).`,
    `notes: ${BOUNDS.notesMin}–${BOUNDS.notesMax} guidance notes {id, text} for faithful presentation — accuracy over flourish; state uncertainty plainly; never assign collective blame; never turn narrative details into promises or formulas.`,
    `watchouts: up to ${BOUNDS.watchoutsMax} short cautions (common misreadings, dignity concerns, things not to fabricate).`,
    `textualVariants: up to ${BOUNDS.variantsMax} notes ONLY for real manuscript/translation variants in this chapter (empty array if none).`,
    `locations: ONLY if a map genuinely serves this chapter, up to ${BOUNDS.locationsMax} entries {name, featureKind, certainty, role, display}; featureKind ∈ point|region|route|text-only; certainty ∈ known|probable|debated|unknown; role ∈ event|context. A point must be certainty known; an unrecorded road is route/probable at most; never pin an uncertain site. If a map adds nothing (e.g. a psalm), return an empty array.`,
    ...(brainRules.length > 0
      ? ["Selah Brain rules (the product's standing editorial rules — the proposal must be compatible with every one):", ...brainRules]
      : []),
    "If you cannot produce a faithful specification from this text alone, return {\"error\":\"<one plain reason>\"} instead — never guess, never pad, never use placeholder text.",
    "ESV text follows:",
    esvText,
  ].join("\n");
}

async function callProposalModel(input: {
  slug: string;
  book: string;
  chapter: number;
  esvText: string;
  verseCount: number;
  brainRules: readonly string[];
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  if (proposalModelForTesting) return proposalModelForTesting(input);
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);
  try {
    const resp = await client.chat.completions.create(
      {
        model: CHAPTER_WORKUP_TEXT_MODEL,
        messages: [{ role: "user", content: proposalPrompt(input.book, input.chapter, input.esvText, input.verseCount, input.brainRules) }],
        response_format: { type: "json_object" },
        max_completion_tokens: 6_000,
      },
      { signal: controller.signal },
    );
    return {
      content: resp.choices[0]?.message?.content ?? "",
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Count ESV verse markers ([1] … [n]) — the source-derived verse count the
 * movements must cover. No hardcoded per-book tables. */
export function esvVerseCount(esvText: string): number {
  const markers = new Set<number>();
  for (const match of esvText.matchAll(/\[(\d+)\]/g)) markers.add(Number(match[1]));
  return markers.size;
}

export interface ProposalRunResult {
  ok: boolean;
  slug: string;
  status: "proposed" | "failed";
  reason?: string;
  proposalDigest?: string;
}

/** Worker body for one claimed proposal job. ONE model request, no automatic
 * retry; any post-dispatch failure records its possible spend (IQ-006
 * standard) and the row finishes 'failed' with one plain reason. */
export async function runPrepareProposalJob(slug: string, jobId: string): Promise<ProposalRunResult> {
  const store = productionStore();
  if (!store) return { ok: false, slug, status: "failed", reason: "proposal storage unavailable" };
  const row = await store.latest(slug);
  if (!row || row.job_id !== jobId || rowStatus(row) !== "generating" || typeof row.id !== "string") {
    return { ok: false, slug, status: "failed", reason: "no matching claimed proposal job (duplicate or superseded delivery)" };
  }
  const id = row.id;
  // Atomic CONSUME before any spend (adversarial pre-review finding 1): the
  // queued claim flips generating→running exactly once — a duplicated
  // delivery loses THIS conditional write and dispatches nothing, and a
  // failed-trigger cleanup (which only matches 'generating') can no longer
  // stamp "nothing was spent" over a live run.
  const consumed = await store.conditionalUpdate(id, "generating", { status: "running" });
  if (typeof consumed !== "number" || consumed !== 1) {
    return { ok: false, slug, status: "failed", reason: "claim already consumed — refusing duplicate delivery (no spend)" };
  }
  const failRow = async (reason: string, costUsd?: number): Promise<ProposalRunResult> => {
    const moved = await store.conditionalUpdate(id, "running", {
      status: "failed",
      error: reason.slice(0, 300),
      ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
    });
    if (typeof moved !== "number" || moved !== 1) {
      console.error(`[selah] prepare proposal fail-write lost (${slug}) — row may be stranded generating`);
    }
    await logGenerationAudit({
      action: "prepare_proposal_failed",
      slug,
      status: "failed",
      message: reason.slice(0, 300),
    });
    return { ok: false, slug, status: "failed", reason };
  };

  const identity = parseSlug(slug);
  if (!identity) return failRow("unparseable chapter slug");

  // Free read/check step: load the single chapter's ESV text.
  const loader = esvLoaderForTesting ?? (async (ref: string) => getEsvPassage(ref));
  const passage = await loader(`${identity.book} ${identity.chapter}`);
  if (!passage || !passage.text.trim()) {
    return failRow("the ESV source for this chapter could not be loaded — nothing was spent");
  }
  const verseCount = esvVerseCount(passage.text);
  if (verseCount < 1) return failRow("the loaded source has no verse markers — nothing was spent");

  // Free read/check: the current Selah Brain rules ride into the proposal
  // prompt (design note step 1) and their digest is stored as provenance
  // (step 5). Fail SOFT to empty exactly like the draft pipeline does — an
  // empty rule set is a legitimate state, and the digest records which rules
  // (possibly none) actually applied.
  let brainRules: readonly string[] = [];
  try {
    brainRules = (await selectRulesForGeneration(slug, "copy_generation")).texts;
  } catch {
    brainRules = [];
  }
  const brainDigest = sha256Canonical([...brainRules]);

  // ONE bounded model request. Dispatch accounting mirrors IQ-006: any
  // failure after dispatch records possible spend durably before the row
  // fails; a provably-local pre-dispatch failure records none.
  let dispatched = false;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let contentText = "";
  try {
    if (!proposalModelForTesting && !getOpenAI()) throw new Error("OpenAI not configured");
    dispatched = true;
    const result = await callProposalModel({
      slug,
      book: identity.book,
      chapter: identity.chapter,
      esvText: passage.text,
      verseCount,
      brainRules,
    });
    contentText = result.content;
    usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 200);
    if (!dispatched) return failRow(`failed before the model request was dispatched (no spend): ${msg}`);
    // Possible spend: the request may have been billed even without a
    // response. Record it durably, then fail the row.
    let costUsd: number | undefined;
    try {
      // Conservative ceiling: the aborted request may have billed the full
      // completion cap — never undercount possible spend.
      const estimate = estimateChapterWorkupCost({ inputTokens: 16_000, cachedInputTokens: 0, outputTokens: 6_000 });
      costUsd = estimate.textEstimateUsd;
      await recordCostEventStrict({
        requestType: "prepare_proposal",
        provider: "openai",
        model: CHAPTER_WORKUP_TEXT_MODEL,
        estimatedCostUsd: costUsd,
        metadata: { slug, jobId, failed: true, billingUncertain: true, error: msg },
      });
    } catch {
      return failRow(`model request failed after dispatch AND its possible spend could not be recorded — manual inspection required: ${msg}`, costUsd);
    }
    return failRow(`model request failed after dispatch (the one request MAY be billed; possible spend recorded): ${msg}`, costUsd);
  }

  // Durable cost row from real usage BEFORE the proposal can exist.
  const estimate = estimateChapterWorkupCost({
    inputTokens: usage.inputTokens,
    cachedInputTokens: 0,
    outputTokens: usage.outputTokens,
  });
  try {
    await recordCostEventStrict({
      requestType: "prepare_proposal",
      provider: "openai",
      model: CHAPTER_WORKUP_TEXT_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: estimate.textEstimateUsd,
      metadata: { slug, jobId },
    });
  } catch {
    return failRow("the proposal's cost row could not be recorded — the spend happened, so the run stops here for manual inspection", estimate.textEstimateUsd);
  }

  // Parse + fail-closed validation BEFORE any owner-facing state.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(contentText);
  } catch {
    return failRow("the model did not return valid JSON", estimate.textEstimateUsd);
  }
  const modelError = (parsedJson as Record<string, unknown>)?.error;
  if (typeof modelError === "string" && modelError.trim()) {
    return failRow(`the model declined honestly: ${modelError.slice(0, 200)}`, estimate.textEstimateUsd);
  }
  const validated = validateProposalContent(parsedJson, slug, verseCount);
  if (!validated.ok) return failRow(`validation failed: ${validated.reason}`, estimate.textEstimateUsd);

  const digest = proposalDigestOf(validated.content);
  const moved = await store.conditionalUpdate(id, "running", {
    status: "proposed",
    proposal_json: validated.content,
    proposal_digest: digest,
    source_digest: sha256Text(passage.text),
    brain_digest: brainDigest,
    model: CHAPTER_WORKUP_TEXT_MODEL,
    cost_usd: estimate.textEstimateUsd,
  });
  if (typeof moved !== "number" || moved !== 1) {
    return failRow("the proposal row changed while generating (superseded); the spend is recorded", estimate.textEstimateUsd);
  }
  await logGenerationAudit({
    action: "prepare_proposal_ready",
    slug,
    status: "succeeded",
    message: `proposal ${digest.slice(0, 12)}… (${validated.content.movements.length} movements, ${validated.content.notes.length} notes, ${validated.content.locations.length} locations)`,
  });
  return { ok: true, slug, status: "proposed", proposalDigest: digest };
}

/** Clear a claimed proposal row after a FAILED TRIGGER (the worker was never
 * invoked, so provably nothing was dispatched or spent). Conditional on the
 * exact job id still holding the 'generating' claim. */
export async function failClaimedPrepareProposal(
  slug: string,
  jobId: string,
  reason: string,
): Promise<boolean> {
  const store = productionStore();
  if (!store) return false;
  const raw = await store.latest(slug);
  if (!raw || raw.job_id !== jobId || rowStatus(raw) !== "generating" || typeof raw.id !== "string") {
    return false;
  }
  const moved = await store.conditionalUpdate(raw.id, "generating", {
    status: "failed",
    error: `${reason} (the worker was never invoked; nothing was spent)`.slice(0, 300),
  });
  return typeof moved === "number" && moved === 1;
}

// ---------------------------------------------------------------------------
// Owner decisions (route-driven; the route authenticates).
// ---------------------------------------------------------------------------
export type ProposalDecisionResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "DIGEST_MISMATCH" | "CONFLICT" | "WRITE_FAILED"; reason: string };

export async function approvePrepareProposal(
  slug: string,
  proposalDigest: string,
  approvedBy: string,
  evidence: string,
): Promise<ProposalDecisionResult> {
  const store = productionStore();
  if (!store) return { ok: false, code: "WRITE_FAILED", reason: "proposal storage unavailable" };
  const row = await readLatestProposal(slug);
  if (!row || row.status !== "proposed" || !row.proposal_digest) {
    return { ok: false, code: "NOT_FOUND", reason: "no reviewable proposal exists for this chapter" };
  }
  if (row.proposal_digest !== proposalDigest) {
    return { ok: false, code: "DIGEST_MISMATCH", reason: "the proposal changed since you reviewed it — review the current one" };
  }
  const moved = await store.conditionalUpdate(row.id, "proposed", {
    status: "approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    evidence: evidence.slice(0, 300),
  });
  if (typeof moved !== "number") return { ok: false, code: "WRITE_FAILED", reason: "the approval could not be recorded" };
  if (moved !== 1) return { ok: false, code: "CONFLICT", reason: "the proposal changed underneath the approval; nothing was recorded" };
  return { ok: true };
}

export async function rejectPrepareProposal(slug: string, proposalDigest: string): Promise<ProposalDecisionResult> {
  const store = productionStore();
  if (!store) return { ok: false, code: "WRITE_FAILED", reason: "proposal storage unavailable" };
  const row = await readLatestProposal(slug);
  if (!row || row.status !== "proposed" || !row.proposal_digest) {
    return { ok: false, code: "NOT_FOUND", reason: "no reviewable proposal exists for this chapter" };
  }
  if (row.proposal_digest !== proposalDigest) {
    return { ok: false, code: "DIGEST_MISMATCH", reason: "the proposal changed since you reviewed it" };
  }
  const moved = await store.conditionalUpdate(row.id, "proposed", { status: "superseded" });
  if (typeof moved !== "number") return { ok: false, code: "WRITE_FAILED", reason: "the rejection could not be recorded" };
  if (moved !== 1) return { ok: false, code: "CONFLICT", reason: "the proposal changed underneath the rejection" };
  return { ok: true };
}
