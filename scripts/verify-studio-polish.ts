// Offline gate for the issue #29 Studio polish lane (runs in `npm run
// prebuild`). Mirrors verify-studio-safety.ts: no network, no Supabase, no
// OpenAI, no secrets — pure helpers are tested exhaustively and the two new
// READ-ONLY admin actions are driven through the REAL route handler with the
// in-memory test seams.
//
// It proves:
//   1. Real gpt-5.5 / gpt-image-2 rates (issue #29 pricing research) drive
//      the estimates, and the Mark 7 launch reference (~$0.61) reproduces.
//   2. The launch progress strip derivation mirrors flow state truthfully,
//      degrades for legacy chapters, and never hides an attention stop.
//   3. chapter_info and cost_history are authenticated, read-only, and leak
//      no raw cost_events metadata (errors/digests/job ids) to the browser.
import assert from "node:assert/strict";

process.env.DEV_ADMIN_TOKEN = "verify-studio-polish-offline-token";

import {
  estimateChapterWorkupCost,
  estimateImageCostUsd,
  GPT_5_5_TEXT_RATES_USD_PER_1M,
  GPT_IMAGE_2_ESTIMATED_USD_EACH,
} from "../lib/ai/costs";
import { MARK_8_IMAGE_ESTIMATED_COST_USD } from "../lib/server/mark8-image-plan";
import {
  deriveLaunchProgress,
  type LaunchProgressSnapshot,
  type LaunchStep,
} from "../lib/studio-launch-progress";
import {
  buildStudioChapterInfoResponse,
  readStudioChapterInfo,
} from "../lib/studio-chapter-info";
import {
  readStudioCostHistory,
  shapeStudioCostHistory,
} from "../lib/studio-cost-history";
import {
  readStudioDraftRevision,
  restoredReviewStillValid,
} from "../lib/studio-review-memory";
import {
  __setCostCaptureForTesting,
  __setCostHistoryForTesting,
  type CostEventInput,
  type CostHistoryRow,
} from "../lib/server/cost-events-repository";
import {
  __setReviewedAtForTesting,
  __setStudioStatusUnavailableForTesting,
} from "../lib/server/chapter-workups-repository";
import {
  __setGenerationTestOverrides,
} from "../lib/server/generation-settings";
import type { GenerationSettings } from "../lib/server/generation-settings";
import { POST as adminPost } from "../app/api/admin/generation/route";
import { BUILD_ID } from "../lib/build";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}
function eq<T>(actual: T, expected: T, label: string): void {
  checks++;
  assert.deepEqual(actual, expected, label);
}

// =====================================================================
// 1. Real pricing rates
// =====================================================================
eq(GPT_5_5_TEXT_RATES_USD_PER_1M.input, 5.0, "gpt-5.5 input $5/1M");
eq(GPT_5_5_TEXT_RATES_USD_PER_1M.cachedInput, 0.5, "gpt-5.5 cached input $0.50/1M");
eq(GPT_5_5_TEXT_RATES_USD_PER_1M.output, 30.0, "gpt-5.5 output $30/1M");

eq(
  estimateChapterWorkupCost({ inputTokens: 1_000_000 }).textEstimateUsd,
  5.0,
  "1M input tokens estimate $5",
);
eq(
  estimateChapterWorkupCost({ outputTokens: 1_000_000 }).textEstimateUsd,
  30.0,
  "1M output tokens estimate $30",
);
eq(
  estimateChapterWorkupCost({ inputTokens: 1_000_000, cachedInputTokens: 1_000_000 }).textEstimateUsd,
  0.5,
  "fully cached 1M input estimate $0.50",
);
eq(
  estimateChapterWorkupCost({ inputTokens: 100_000, cachedInputTokens: 900_000 }).textEstimateUsd,
  0.05,
  "cached tokens clamp to reported input tokens",
);
eq(
  estimateChapterWorkupCost({ inputTokens: -5, outputTokens: -5 }).totalEstimateUsd,
  0,
  "negative token counts never produce a negative estimate",
);

eq(estimateImageCostUsd("gpt-image-2", 3), 0.495, "3 gpt-image-2 images ≈ $0.495");
eq(estimateImageCostUsd("gpt-image-1", 3), 0.12, "3 legacy gpt-image-1 images ≈ $0.12");
eq(
  estimateImageCostUsd("some-future-model", 1),
  GPT_IMAGE_2_ESTIMATED_USD_EACH,
  "unknown image models estimate at the conservative gpt-image-2 rate",
);
eq(estimateImageCostUsd("gpt-image-2", -2), 0, "negative image count estimates $0");
eq(
  MARK_8_IMAGE_ESTIMATED_COST_USD,
  GPT_IMAGE_2_ESTIMATED_USD_EACH,
  "protected image binding and the ledger share ONE per-image rate",
);

// Mark 7 launch cross-check (2026-07-15, ≈$0.61): one gpt-5.5 text run
// (~10K in / ~2K out ≈ $0.11) + three gpt-image-2 images (~$0.495).
{
  const text = estimateChapterWorkupCost({ inputTokens: 10_000, outputTokens: 2_000 });
  eq(text.textEstimateUsd, 0.11, "typical gpt-5.5 launch run estimates $0.11");
  const launch = text.textEstimateUsd + estimateImageCostUsd("gpt-image-2", 3);
  ok(
    Math.abs(launch - 0.61) < 0.02,
    `Mark 7 launch reference reproduces (~$0.61, got $${launch.toFixed(3)})`,
  );
}

// =====================================================================
// 2. Launch progress strip derivation
// =====================================================================
function snap(overrides: Partial<LaunchProgressSnapshot>): LaunchProgressSnapshot {
  return {
    isProtected: true,
    setupState: "ready",
    preparing: false,
    hasManifest: false,
    blocked: false,
    phase: "idle",
    copyReview: "none",
    previewed: false,
    verdict: "",
    wordingApproved: true,
    imagePhase: "idle",
    imagesApproved: false,
    published: false,
    ...overrides,
  };
}
function stateOf(steps: LaunchStep[], key: string): string {
  const step = steps.find((s) => s.key === key);
  assert.ok(step, `step ${key} present`);
  return step.state;
}
function activeCount(steps: LaunchStep[]): number {
  return steps.filter((s) => s.state === "active").length;
}

// Legacy chapters degrade to three steps.
{
  const steps = deriveLaunchProgress(snap({ isProtected: false }));
  eq(steps.map((s) => s.key), ["draft", "wording", "publish"], "legacy strip has 3 steps");
  eq(stateOf(steps, "draft"), "active", "legacy idle → draft active");
}
{
  const steps = deriveLaunchProgress(snap({ isProtected: false, phase: "ready" }));
  eq(stateOf(steps, "draft"), "done", "legacy draft saved → done");
  eq(stateOf(steps, "wording"), "active", "legacy draft saved → wording active");
}
{
  const steps = deriveLaunchProgress(
    snap({ isProtected: false, phase: "ready", previewed: true, verdict: "yes" }),
  );
  eq(stateOf(steps, "publish"), "active", "legacy approved text → publish active");
}

// Protected chapters walk the full six-step pipeline.
{
  const steps = deriveLaunchProgress(snap({ setupState: "unknown" }));
  eq(steps.length, 6, "protected strip has 6 steps");
  eq(stateOf(steps, "setup"), "active", "setup checking → setup active");
  ok(activeCount(steps) === 1, "setup checking → exactly one active step");
}
eq(
  stateOf(deriveLaunchProgress(snap({ setupState: "locked" })), "setup"),
  "attention",
  "locked setup needs attention",
);
{
  const steps = deriveLaunchProgress(snap({}));
  eq(stateOf(steps, "setup"), "done", "setup ready → done");
  eq(stateOf(steps, "prepare"), "active", "setup ready + idle → prepare active");
}
eq(
  stateOf(deriveLaunchProgress(snap({ preparing: true })), "prepare"),
  "active",
  "preflight running → prepare active",
);
{
  const steps = deriveLaunchProgress(snap({ hasManifest: true }));
  eq(stateOf(steps, "prepare"), "done", "manifest held → prepare done");
  eq(stateOf(steps, "draft"), "active", "manifest held → draft decision active");
}
{
  const steps = deriveLaunchProgress(snap({ phase: "generating" }));
  eq(stateOf(steps, "prepare"), "done", "generating implies prepared");
  eq(stateOf(steps, "draft"), "active", "generating → draft active");
  ok(activeCount(steps) === 1, "generating → exactly one active step");
}
{
  const steps = deriveLaunchProgress(snap({ phase: "ready" }));
  eq(stateOf(steps, "draft"), "done", "draft saved → done");
  eq(stateOf(steps, "prepare"), "done", "draft saved back-fills prepare as done");
  eq(stateOf(steps, "wording"), "active", "draft saved → wording active");
}
eq(
  stateOf(deriveLaunchProgress(snap({ phase: "error" })), "draft"),
  "attention",
  "failed draft needs attention",
);
eq(
  stateOf(
    deriveLaunchProgress(snap({ phase: "ready", previewed: true, verdict: "needs_work" })),
    "wording",
  ),
  "attention",
  "needs-work verdict → wording attention",
);
eq(
  stateOf(
    deriveLaunchProgress(snap({ phase: "ready", copyReview: "invalid", wordingApproved: false })),
    "wording",
  ),
  "attention",
  "invalid Bible-wording review → wording attention",
);
{
  const steps = deriveLaunchProgress(
    snap({ phase: "ready", previewed: true, verdict: "yes" }),
  );
  eq(stateOf(steps, "wording"), "done", "approved text → wording done");
  eq(stateOf(steps, "images"), "active", "approved text → images active");
}
{
  const steps = deriveLaunchProgress(
    snap({ phase: "ready", previewed: true, verdict: "yes", imagePhase: "running" }),
  );
  eq(stateOf(steps, "images"), "active", "image run in flight → images active");
  ok(activeCount(steps) === 1, "image run → exactly one active step");
}
eq(
  stateOf(
    deriveLaunchProgress(
      snap({ phase: "ready", previewed: true, verdict: "yes", imagePhase: "error" }),
    ),
    "images",
  ),
  "attention",
  "failed image run needs attention",
);
{
  const steps = deriveLaunchProgress(
    snap({ phase: "ready", previewed: true, verdict: "yes", imagePhase: "ready", imagesApproved: true }),
  );
  eq(stateOf(steps, "images"), "done", "approved images → done");
  eq(stateOf(steps, "publish"), "active", "everything approved → publish active");
  eq(
    steps.filter((s) => s.state === "done").length,
    5,
    "everything approved → five done steps",
  );
}
{
  const steps = deriveLaunchProgress(snap({ published: true }));
  ok(steps.every((s) => s.state === "done"), "published → every step done");
}
{
  // A blocked re-prepare beside an already-saved draft must stay visible.
  const steps = deriveLaunchProgress(snap({ blocked: true, phase: "ready" }));
  eq(stateOf(steps, "prepare"), "attention", "blockers are never painted over by back-fill");
  eq(stateOf(steps, "draft"), "done", "existing draft still reads done beside blockers");
}

// =====================================================================
// 2b. Remembered-review draft binding (PR #36 review, P1-1)
// =====================================================================
// The regression Codex asked for: a CLEAN draft (no wording-review digest)
// changes out-of-band while the owner is on another chapter. The remembered
// approval was captured at revision A; the fresh status reports revision B —
// the approval must NOT stand.
ok(
  !restoredReviewStillValid("2026-07-15T09:00:00Z", "2026-07-15T09:05:00Z"),
  "P1-1 regression: out-of-band clean-draft change invalidates the remembered approval",
);
ok(
  restoredReviewStillValid("2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z"),
  "unchanged draft revision lets the remembered approval stand",
);
ok(!restoredReviewStillValid("2026-07-15T09:00:00Z", null), "unproven fresh revision fails closed");
ok(!restoredReviewStillValid("", "2026-07-15T09:00:00Z"), "unremembered revision fails closed");
ok(!restoredReviewStillValid("", null), "no revision on either side fails closed");

eq(
  readStudioDraftRevision({ ok: true, status: "draft", draftRevision: "2026-07-15T09:00:00Z" }),
  "2026-07-15T09:00:00Z",
  "draft revision reads from the status response",
);
eq(readStudioDraftRevision({ ok: true, status: "draft" }), null, "missing revision reads as unproven");
eq(readStudioDraftRevision({ ok: true, draftRevision: "  " }), null, "blank revision reads as unproven");
eq(readStudioDraftRevision(null), null, "malformed status reads as unproven");

// =====================================================================
// 3. Chapter info shaping + strict client parse
// =====================================================================
{
  const response = buildStudioChapterInfoResponse("mark-7", {
    reviewedAt: "2026-07-15T09:30:00.000Z",
    buildId: "2026-07-15-r96",
    textModel: "gpt-5.5",
    imageModel: "gpt-image-2",
  });
  const parsed = readStudioChapterInfo(response);
  ok(parsed !== null, "chapter info round-trips");
  eq(parsed!.reviewedAt, "2026-07-15T09:30:00.000Z", "reviewedAt survives the round trip");
  eq(parsed!.imageModel, "gpt-image-2", "imageModel survives the round trip");
}
eq(readStudioChapterInfo(null), null, "chapter info parse rejects null");
eq(readStudioChapterInfo({ ok: false }), null, "chapter info parse rejects ok:false");
eq(
  readStudioChapterInfo({ ok: true, buildId: "", textModel: "a", imageModel: "b" }),
  null,
  "chapter info parse rejects an empty build id",
);
{
  const parsed = readStudioChapterInfo({
    ok: true,
    reviewedAt: "not-a-timestamp",
    buildId: "r1",
    textModel: "a",
    imageModel: "b",
  });
  ok(parsed !== null && parsed.reviewedAt === null, "malformed reviewedAt degrades to null");
}

// =====================================================================
// 4. Cost history shaping (metadata privacy boundary) + strict parse
// =====================================================================
const NASTY_ROW: CostHistoryRow = {
  id: "1",
  request_type: "chapter_workup_text",
  provider: "openai",
  model: "gpt-5.5",
  image_count: null,
  estimated_cost_usd: 0.11,
  actual_cost_usd: null,
  created_at: "2026-07-15T09:00:00.000Z",
  metadata: {
    slug: "mark-7",
    error: "SECRET provider error text",
    manifestDigest: "a".repeat(64),
    jobId: "job-123",
  },
};
{
  const shaped = shapeStudioCostHistory([
    NASTY_ROW,
    { ...NASTY_ROW, id: "2", metadata: { slug: "Bad Slug!" } },
    {
      ...NASTY_ROW,
      id: "3",
      request_type: "chapter_image_generation",
      model: "gpt-image-2",
      image_count: 3,
      estimated_cost_usd: 0.495,
      actual_cost_usd: 0.51,
      metadata: null,
    },
  ]);
  eq(shaped[0].slug, "mark-7", "well-formed metadata slug passes through");
  eq(shaped[1].slug, null, "malformed metadata slug is dropped");
  for (const event of shaped) {
    ok(!("metadata" in event), "shaped events carry no metadata object");
    const text = JSON.stringify(event);
    ok(!text.includes("SECRET"), "error text never reaches the shaped payload");
    ok(!text.includes("a".repeat(64)), "digests never reach the shaped payload");
    ok(!text.includes("job-123"), "job ids never reach the shaped payload");
  }
  const parsed = readStudioCostHistory({ ok: true, events: shaped });
  ok(parsed !== null, "shaped history parses on the client");
  eq(parsed!.events.length, 3, "all shaped events parse");
  // Totals prefer actual over estimate: 0.11 + 0.11 + 0.51 (not 0.495).
  eq(parsed!.totalUsd, 0.73, "total prefers actual cost over the estimate");
}
eq(readStudioCostHistory({ ok: true, events: [{}] }), null, "malformed event rejects the payload");
eq(readStudioCostHistory({ ok: false, events: [] }), null, "ok:false rejects the payload");
{
  const parsed = readStudioCostHistory({
    ok: true,
    events: [
      {
        createdAt: "2026-07-15T09:00:00.000Z",
        requestType: "chapter_workup_text",
        model: "gpt-5.5",
        imageCount: null,
        estimatedCostUsd: -4,
        actualCostUsd: Number.NaN,
        slug: null,
      },
    ],
  });
  ok(
    parsed !== null &&
      parsed.events[0].estimatedCostUsd === null &&
      parsed.events[0].actualCostUsd === null &&
      parsed.totalUsd === 0,
    "negative/NaN costs degrade to null and never poison the total",
  );
}

// =====================================================================
// 5. REAL route — chapter_info and cost_history are authed + read-only
// =====================================================================
const ADMIN = process.env.DEV_ADMIN_TOKEN!;
const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: false,
  image_generation_enabled: false,
  allowed_slugs: [],
  selected_text_model: "gpt-5.5",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: true,
  updated_at: "T0",
};
function adminReq(body: Record<string, unknown>, token = ADMIN): Request {
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
}

const routeSuite = async () => {
  const auditCapture: Array<Record<string, unknown>> = [];
  const costCapture: CostEventInput[] = [];
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: auditCapture });
  __setCostCaptureForTesting(costCapture);
  __setReviewedAtForTesting(
    new Map([
      ["mark-7", "2026-07-15T09:30:00.000Z"],
      ["exodus-27", null],
    ]),
  );
  __setCostHistoryForTesting([NASTY_ROW]);
  try {
    // R1. Both new actions refuse a bad token before reading anything.
    for (const action of ["chapter_info", "cost_history"]) {
      const res = await adminPost(adminReq({ action, slug: "mark-7" }, "wrong-token"));
      ok(res.status === 401, `R1 ${action} refuses a bad studio key`);
    }

    // R2. chapter_info returns the allowlisted launch facts.
    {
      const res = await adminPost(adminReq({ action: "chapter_info", slug: "mark-7" }));
      ok(res.status === 200, "R2 chapter_info responds");
      const body = (await res.json()) as Record<string, unknown>;
      const parsed = readStudioChapterInfo(body);
      ok(parsed !== null, "R2 chapter_info parses with the strict client reader");
      eq(parsed!.reviewedAt, "2026-07-15T09:30:00.000Z", "R2 last launch (reviewed_at) surfaces");
      eq(parsed!.buildId, BUILD_ID, "R2 build id is the live BUILD_ID");
      eq(parsed!.textModel, "gpt-5.5", "R2 text model comes from settings");
      eq(parsed!.imageModel, "gpt-image-2", "R2 protected chapters pin gpt-image-2");
    }
    {
      const res = await adminPost(adminReq({ action: "chapter_info", slug: "exodus-27" }));
      const parsed = readStudioChapterInfo(await res.json());
      ok(parsed !== null && parsed.reviewedAt === null, "R2b unpublished chapter reports no launch");
      eq(parsed!.imageModel, "offline-test-image-model", "R2b legacy chapters use the selected image model");
    }
    ok(
      (await adminPost(adminReq({ action: "chapter_info" }))).status === 400,
      "R2c chapter_info requires a slug",
    );

    // R3. cost_history exposes ONLY the allowlisted spend fields.
    {
      const res = await adminPost(adminReq({ action: "cost_history" }));
      ok(res.status === 200, "R3 cost_history responds");
      const text = JSON.stringify(await res.json());
      ok(text.includes("mark-7"), "R3 slug survives shaping");
      ok(!text.includes("SECRET"), "R3 raw metadata error text never reaches the browser");
      ok(!text.includes("a".repeat(64)), "R3 digests never reach the browser");
      ok(!text.includes("job-123"), "R3 job ids never reach the browser");
    }

    // R4. Both actions are strictly read-only: no audit rows, no cost rows,
    // and generation stays exactly as configured (both switches OFF).
    eq(auditCapture.length, 0, "R4 read-only actions write no audit rows");
    eq(costCapture.length, 0, "R4 read-only actions record no cost events");

    // R5. P1-2 regression: a failed read is a distinct safe error — never a
    // reassuring empty fact — and leaks no database detail.
    __setCostHistoryForTesting("unavailable");
    {
      const res = await adminPost(adminReq({ action: "cost_history" }));
      ok(res.status === 503, "R5 failed spend read → 503, not an empty list");
      const body = (await res.json()) as Record<string, unknown>;
      ok(body.ok === false, "R5 failed spend read reports ok:false");
      ok(
        readStudioCostHistory(body) === null,
        "R5 client reader treats the failure as failed, not as $0 spent",
      );
      ok(
        !JSON.stringify(body).match(/supabase|postgres|insert|select|column/iu),
        "R5 failure reveals no database detail",
      );
    }
    __setCostHistoryForTesting([]);
    {
      const res = await adminPost(adminReq({ action: "cost_history" }));
      const body = (await res.json()) as Record<string, unknown>;
      const parsed = readStudioCostHistory(body);
      ok(
        res.status === 200 && parsed !== null && parsed.events.length === 0,
        "R5b TRUE-empty history still reads as a real, empty ledger",
      );
    }
    __setReviewedAtForTesting("unavailable");
    {
      const res = await adminPost(adminReq({ action: "chapter_info", slug: "mark-7" }));
      ok(res.status === 503, "R5c failed chapter-info read → 503");
      const body = (await res.json()) as Record<string, unknown>;
      ok(
        body.ok === false && readStudioChapterInfo(body) === null,
        "R5c failure never parses into 'Not published yet' facts",
      );
    }
    __setReviewedAtForTesting(new Map([["mark-7", null]]));
    {
      const res = await adminPost(adminReq({ action: "chapter_info", slug: "mark-7" }));
      const parsed = readStudioChapterInfo(await res.json());
      ok(
        res.status === 200 && parsed !== null && parsed.reviewedAt === null,
        "R5d TRUE never-published still reads as real facts with no launch",
      );
    }

    // R6. The status action carries no draft revision when the store is
    // unreachable — the client guard then fails closed (P1-1). The outage is
    // forced through a seam: this test must NOT depend on Supabase env being
    // absent (in the production build the real keys exist, and an unseamed
    // call queried the LIVE database mid-build — the 2026-07-16 deploy break).
    {
      __setStudioStatusUnavailableForTesting(true);
      try {
        const res = await adminPost(adminReq({ action: "status", slug: "mark-7" }));
        const body = (await res.json()) as Record<string, unknown>;
        const revision = readStudioDraftRevision(body);
        ok(
          revision === null && !restoredReviewStillValid("anything", revision),
          "R6 unproven store → no revision → remembered approvals fail closed",
        );
      } finally {
        __setStudioStatusUnavailableForTesting(false);
      }
    }
  } finally {
    __setGenerationTestOverrides(null);
    __setCostCaptureForTesting(null);
    __setReviewedAtForTesting(null);
    __setCostHistoryForTesting(null);
  }
};

routeSuite()
  .then(() => {
    console.log(
      `verify:studio-polish ✓ ${checks} checks passed (real pricing + progress strip + read-only chapter_info/cost_history through the REAL route)`,
    );
  })
  .catch((e) => {
    console.error("verify:studio-polish FAILED:", e);
    process.exit(1);
  });
