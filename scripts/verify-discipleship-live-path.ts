// verify:discipleship-live-path — IQ-019 exact-head correction #1.
//
// Proves the Disciple It safety gate protects the REAL Mark 12 generate/save
// route (generateAndStoreChapter), not just the standalone checker: a coercive
// or missing Disciple It is REFUSED before the draft is saved, while a
// compliant one saves. Drives the actual worker with the codebase's own test
// seams (job store, text generator, settings, cost capture) — no network.

import assert from "node:assert/strict";
import {
  generateAndStoreChapter,
  __setTextGeneratorForTesting,
  __setGenerationConfigBypassForTesting,
} from "../lib/server/generate-chapter-workup";
import {
  __setJobStoreForTesting,
  claimGenerationJob,
  type JobStorePort,
  type JobRow,
  type JobPredicates,
} from "../lib/server/generation-jobs";
import { __setGenerationTestOverrides, type GenerationSettings } from "../lib/server/generation-settings";
import { __setCostCaptureForTesting } from "../lib/server/cost-events-repository";
import exodusFixture from "../lib/ai/fixtures/exodus-27-generated.json";

// Minimal in-memory JobStorePort (mirrors the FakeJobStore in verify-studio-safety).
class MemoryJobStore implements JobStorePort {
  rows = new Map<string, { status: string; updated_at: string | null; workup_json: Record<string, unknown> }>();
  private tick = 0;
  private now(): string {
    return `T${++this.tick}`;
  }
  async read(slug: string): Promise<JobRow | null | { error: string }> {
    const r = this.rows.get(slug);
    return r ? { status: r.status, updatedAt: r.updated_at, workupJson: r.workup_json } : null;
  }
  async insert(slug: string, payload: Record<string, unknown>): Promise<"ok" | "duplicate" | { error: string }> {
    if (this.rows.has(slug)) return "duplicate";
    this.rows.set(slug, {
      status: String(payload.status),
      updated_at: this.now(),
      workup_json: (payload.workup_json as Record<string, unknown>) ?? {},
    });
    return "ok";
  }
  async update(slug: string, p: JobPredicates, next: Record<string, unknown>): Promise<number | { error: string }> {
    const r = this.rows.get(slug);
    if (!r) return 0;
    if (r.status !== p.status) return 0;
    if (p.updatedAt !== undefined && p.updatedAt !== null && r.updated_at !== p.updatedAt) return 0;
    for (const check of p.json ?? []) {
      const actual = r.workup_json?.[check.key];
      if (check.equals === null && actual !== undefined && actual !== null) return 0;
      if (check.equals !== null && actual !== check.equals) return 0;
    }
    if ("status" in next) r.status = String(next.status);
    if ("workup_json" in next) r.workup_json = next.workup_json as Record<string, unknown>;
    r.updated_at = this.now();
    return 1;
  }
}

const SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: false,
  allowed_slugs: ["mark-12"],
  selected_text_model: "offline-test-model",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: false,
  updated_at: "T0",
};

const GOOD_DISCIPLESHIP =
  "When Jesus answers the coin trap in verses 15-17, he refuses to let loyalty to God shrink into a slogan. Following him here means letting that same clarity shape where your allegiance sits. If it would help, you might invite a friend to notice how Jesus reframes the question (12:17) — and let that be all.";

function coreSections(extra: Record<string, unknown>[]): Record<string, unknown>[] {
  return [
    { id: "big-idea", type: "big_idea", isCore: true, priority: 1, title: "Big Idea", cardSummary: "Temple confrontations expose true allegiance.", fullContent: "Jesus faces trap after trap in the temple courts — the coin, the resurrection, the greatest command — and each answer reveals where real loyalty belongs (12:17)." },
    { id: "application", type: "application", isCore: true, priority: 7, title: "Live It", cardSummary: "Keep your allegiance to God whole.", fullContent: "When pressure tries to split your loyalty, let Jesus' clarity in the coin scene shape your own choices this week." },
    ...extra,
    { id: "prayer-section", type: "prayer", isCore: true, priority: 9, title: "Prayer", cardSummary: "A prayer for undivided loyalty.", fullContent: "Lord, when the world hands me its coin and demands my whole heart, keep my allegiance yours." },
  ];
}

function fixtureJson(sections: Record<string, unknown>[]): string {
  return JSON.stringify({
    ...(exodusFixture as Record<string, unknown>),
    book: "Mark",
    chapter: 12,
    slug: "mark-12",
    title: "Mark 12",
    sections,
  });
}

async function runCase(sections: Record<string, unknown>[]): Promise<{ saved: boolean; audit: string }> {
  const store = new MemoryJobStore();
  const audit: Array<Record<string, unknown>> = [];
  __setJobStoreForTesting(store);
  __setGenerationTestOverrides({ settings: SETTINGS, captureAudit: audit });
  __setCostCaptureForTesting([]);
  __setGenerationConfigBypassForTesting(true);
  __setTextGeneratorForTesting(async () => ({ content: fixtureJson(sections), inputTokens: 10, outputTokens: 10 }));
  const jobId = await claimGenerationJob(store, "mark-12", { book: "Mark", chapter: 12, title: "Mark 12" });
  // The real worker fails soft (returns null, records a failure audit) rather
  // than throwing — a refused draft is one that returns null AND never wrote a
  // completed draft, with the DSC code in the audit trail.
  const result = await generateAndStoreChapter("mark-12", jobId);
  return { saved: result !== null, audit: JSON.stringify(audit) };
}

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  try {
    // A. Compliant Mark 12 draft → saves through the real route.
    const good = await runCase(
      coreSections([
        { id: "discipleship", type: "discipleship", isCore: true, priority: 8, title: "Disciple It", cardSummary: "A gentle invitation to let the chapter travel.", fullContent: GOOD_DISCIPLESHIP, verseRefs: ["12:17"] },
      ]),
    );
    check(good.saved, "compliant Mark 12 Disciple It SAVES through the real route");
    check(!/safety gate refused/.test(good.audit), "compliant draft was not refused");

    // B. Coercive Disciple It → refused BEFORE save on the real route.
    const coercive = await runCase(
      coreSections([
        { id: "discipleship", type: "discipleship", isCore: true, priority: 8, title: "Disciple It", cardSummary: "Do your outreach.", fullContent: "Share Mark 12 with a friend and report back by Sunday on verse 17.", verseRefs: ["12:17"] },
      ]),
    );
    check(!coercive.saved, "coercive Mark 12 Disciple It is NOT saved");
    check(/safety gate refused/.test(coercive.audit), "real route refused coercive draft before save");
    check(/DSC-003/.test(coercive.audit), "refusal audit carries the assignment code DSC-003");

    // C. Missing Disciple It → refused BEFORE save on the real route.
    const missing = await runCase(coreSections([]));
    check(!missing.saved, "Mark 12 draft missing Disciple It is NOT saved");
    check(/DSC-001/.test(missing.audit), "refusal audit carries the missing code DSC-001");
  } finally {
    __setJobStoreForTesting(null);
    __setTextGeneratorForTesting(null);
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setGenerationConfigBypassForTesting(false);
  }

  console.log(failures === 0 ? "\nverify:discipleship-live-path ✓ all checks passed" : `\nverify:discipleship-live-path ✗ ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
