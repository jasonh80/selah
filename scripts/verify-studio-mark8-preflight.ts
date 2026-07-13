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

const ADMIN_TOKEN = "offline-mark8-studio-token";
const MANIFEST_DIGEST = "a".repeat(64);
const SOURCE_DIGEST = "b".repeat(64);

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

  process.env.DEV_ADMIN_TOKEN = ADMIN_TOKEN;
  const loader = await import("../lib/server/studio-mark8-preflight-loader");
  const route = await import("../app/api/admin/generation/route");
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
  }

  console.log(
    "Studio Mark 8 preflight verification passed (read-only route + owner UX logic).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
