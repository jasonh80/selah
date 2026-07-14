import { NextResponse } from "next/server";
import { devRoutesEnabled } from "@/lib/server/dev-guard";
import {
  imageGenAllowed,
  CHAPTER_IMAGE_MODEL,
  IMAGE_ALLOWED_SLUGS,
  prepareImageJobBinding,
} from "@/lib/server/images";
import { triggerBackgroundImageGeneration } from "@/lib/server/trigger-generation";
import { claimImageJob, releaseImageJob, requireJobStore } from "@/lib/server/generation-jobs";
import { isChapterMutationError } from "@/lib/server/protected-chapters";
import { logGenerationAudit } from "@/lib/server/generation-settings";
import { MARK_8_IMAGE_SLUG } from "@/lib/server/mark8-image-plan";

// DEV/ADMIN ONLY image generation trigger. ALL of these are required:
//   - ENABLE_DEV_ROUTES=true (else 404)
//   - correct DEV_ADMIN_TOKEN (query ?token= or header x-admin-token)
//   - ENABLE_CHAPTER_IMAGE_GENERATION=true + OpenAI/Supabase configured
//   - slug allowlisted (psalm-23 only)
//   - confirm=yes to actually generate
// No public page load can reach this. Generates IMAGES only — never text.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!devRoutesEnabled()) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const confirm = url.searchParams.get("confirm") === "yes";

  // Mandatory admin secret — a leaked/forgotten dev-routes flag is not enough.
  const provided = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  const expected = process.env.DEV_ADMIN_TOKEN || "";
  if (!expected || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "admin token required (set DEV_ADMIN_TOKEN and pass ?token= or x-admin-token header)" },
      { status: 401 },
    );
  }

  if (slug === MARK_8_IMAGE_SLUG) {
    return NextResponse.json(
      { ok: false, error: "Mark 8 images can be started only from Selah Studio." },
      { status: 403 },
    );
  }

  if (!(await imageGenAllowed(slug))) {
    return NextResponse.json(
      {
        ok: false,
        error: "image generation not allowed",
        need: {
          allowedSlugs: IMAGE_ALLOWED_SLUGS,
          slug,
        },
        hint: "Enable image generation + allowlist this slug in /admin/generation (and the slug needs an image plan).",
      },
      { status: 403 },
    );
  }

  const store = requireJobStore(slug, "dev_generate_images");
  let binding;
  try {
    binding = await prepareImageJobBinding(store, slug);
  } catch (error) {
    const msg = isChapterMutationError(error)
      ? `${error.code}: ${error.message}`
      : String((error as Error).message);
    return NextResponse.json({ ok: false, error: msg }, { status: 403 });
  }

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      preview: true,
      slug,
      model: binding?.model ?? CHAPTER_IMAGE_MODEL,
      willGenerate: 3,
      note: "Preview only. Add &confirm=yes to generate 3 images and store them.",
    });
  }

  // Same discipline as the Studio route: atomic single-use claim BEFORE the
  // trigger; a failed trigger releases the claim and every refusal is audited.
  let jobId: string;
  try {
    const claim = await claimImageJob(store, slug, binding);
    jobId = claim.jobId;
  } catch (e) {
    const msg = isChapterMutationError(e) ? `${e.code}: ${e.message}` : String((e as Error).message);
    await logGenerationAudit({ action: "refused:dev_generate_images", slug, status: "failed", message: msg.slice(0, 300) });
    const code = isChapterMutationError(e) ? (e.code === "REFUSED" ? 403 : e.code === "CONFLICT" ? 409 : 500) : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
  const triggered = await triggerBackgroundImageGeneration(slug, url.host, jobId, binding);
  if (!triggered.ok) {
    const released = await releaseImageJob(
      store,
      slug,
      jobId,
      "queued",
      binding,
    );
    const note = released ? "image claim released" : "image claim could NOT be released; the row may still hold a stale claim";
    await logGenerationAudit({
      action: "refused:dev_generate_images",
      slug,
      status: "failed",
      message: `trigger failed (${triggered.error ?? triggered.status}) — ${note}`,
    });
    return NextResponse.json(
      { ok: false, error: `background trigger failed — ${note} (${triggered.error ?? triggered.status})` },
      { status: released ? 502 : 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    triggered: true,
    slug,
    jobId,
    model: binding?.model ?? CHAPTER_IMAGE_MODEL,
    note: `Generating images in the background. Poll /dev/db-status?slug=${slug} until imagesStored=true.`,
  });
}
