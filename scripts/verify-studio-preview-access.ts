import { __setStoredSetupApprovalStoreForTesting } from "../lib/server/chapter-setup-approvals";
import assert from "node:assert/strict";
import {
  mintStudioPreviewAccess,
  STUDIO_PREVIEW_MAX_AGE_SECONDS,
  verifyStudioPreviewAccess,
} from "../lib/server/studio-preview-access";
import { devMutationTokenAuthorized } from "../lib/server/dev-guard";
import { studioPreviewUrl } from "../lib/studio-preview";

const ADMIN = "offline-preview-admin-token";
const REGEN = "offline-preview-regen-token";
const NOW = Date.parse("2026-07-13T12:00:00Z");

function adminRequest(
  body: Record<string, unknown>,
  token?: string,
  cookie?: string,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("x-admin-token", token);
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  process.env.DEV_ADMIN_TOKEN = ADMIN;
  // Hermetic approval store (2026-07-17): production builds must never read
  // the live chapter_setup_approvals table from a gate.
  __setStoredSetupApprovalStoreForTesting({
    async read() { return null; },
    async upsert(): Promise<void> { throw new Error("offline gate: approval store is read-only"); },
  });
  try {
  const pass = mintStudioPreviewAccess("mark-8", NOW);
  assert.ok(pass);
  assert.equal(verifyStudioPreviewAccess(pass, "mark-8", NOW), true);
  assert.equal(verifyStudioPreviewAccess(pass, "mark-9", NOW), false);
  assert.equal(
    verifyStudioPreviewAccess(
      pass,
      "mark-8",
      NOW + STUDIO_PREVIEW_MAX_AGE_SECONDS * 1000,
    ),
    false,
  );
  assert.equal(
    verifyStudioPreviewAccess(`${pass.slice(0, -1)}x`, "mark-8", NOW),
    false,
  );
  const savedAdmin = process.env.DEV_ADMIN_TOKEN;
  delete process.env.DEV_ADMIN_TOKEN;
  assert.equal(mintStudioPreviewAccess("mark-8", NOW), null);
  assert.equal(verifyStudioPreviewAccess(pass, "mark-8", NOW), false);
  process.env.DEV_ADMIN_TOKEN = savedAdmin;

  const previewUrl = studioPreviewUrl("mark-8");
  assert.equal(previewUrl, "/dev/preview/mark-8");
  assert.doesNotMatch(previewUrl ?? "", /token|DEV_ADMIN_TOKEN|\?/u);
  assert.equal(studioPreviewUrl("../admin"), null);

  const adminRoute = await import("../app/api/admin/generation/route");
  const unauthorized = await adminRoute.POST(
    adminRequest({ action: "preview_access", slug: "mark-8" }, "wrong"),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("set-cookie"), null);

  const granted = await adminRoute.POST(
    adminRequest({ action: "preview_access", slug: "mark-8" }, ADMIN),
  );
  assert.equal(granted.status, 200);
  assert.deepEqual(await granted.json(), { ok: true });
  const setCookie = granted.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^selah_draft_preview=/u);
  assert.match(setCookie, /HttpOnly/iu);
  assert.match(setCookie, /SameSite=Strict/iu);
  assert.match(setCookie, /Path=\/dev\/preview\/mark-8/iu);
  assert.match(setCookie, /Max-Age=600/iu);
  assert.doesNotMatch(setCookie, new RegExp(ADMIN, "u"));

  // The preview cookie never substitutes for the permanent admin header.
  const cookieOnly = await adminRoute.POST(
    adminRequest(
      { action: "status", slug: "mark-8" },
      undefined,
      setCookie.split(";", 1)[0],
    ),
  );
  assert.equal(cookieOnly.status, 401);

  process.env.ENABLE_DEV_ROUTES = "true";
  delete process.env.REGEN_TOKEN;
  const missingTokenRequest = new Request(
    "http://localhost:3000/dev/regenerate?slug=mark-8&confirm=yes",
  );
  assert.equal(devMutationTokenAuthorized(missingTokenRequest), false);
  const regenerateRoute = await import("../app/dev/regenerate/route");
  const publishRoute = await import("../app/dev/publish/route");
  assert.equal((await regenerateRoute.GET(missingTokenRequest)).status, 401);
  assert.equal(
    (
      await publishRoute.GET(
        new Request("http://localhost:3000/dev/publish?slug=mark-8&confirm=yes"),
      )
    ).status,
    401,
  );

  process.env.REGEN_TOKEN = REGEN;
  assert.equal(devMutationTokenAuthorized(missingTokenRequest), false);
  assert.equal(
    devMutationTokenAuthorized(
      new Request(
        `http://localhost:3000/dev/regenerate?slug=mark-8&confirm=yes&token=${REGEN}`,
      ),
    ),
    true,
  );
  assert.equal(
    (
      await regenerateRoute.GET(
        new Request(
          "http://localhost:3000/dev/regenerate?slug=mark-8&confirm=yes&token=wrong",
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await publishRoute.GET(
        new Request(
          "http://localhost:3000/dev/publish?slug=mark-8&confirm=yes&token=wrong",
        ),
      )
    ).status,
    401,
  );

  console.log(
    "Studio preview access verification passed (short-lived cookie + locked dev routes).",
  );
  } finally {
    __setStoredSetupApprovalStoreForTesting(null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
