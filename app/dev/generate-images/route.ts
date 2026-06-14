import { NextResponse } from "next/server";
import { devRoutesEnabled } from "@/lib/server/dev-guard";
import { imageGenAllowed, isImageGenEnabled, CHAPTER_IMAGE_MODEL, IMAGE_ALLOWED_SLUGS } from "@/lib/server/images";
import { triggerBackgroundImageGeneration } from "@/lib/server/trigger-generation";

// DEV/ADMIN ONLY image generation trigger. Protected like /dev/regenerate:
//   - ENABLE_DEV_ROUTES must be true (else 404)
//   - ENABLE_CHAPTER_IMAGE_GENERATION must be true + OpenAI/Supabase configured
//   - slug must be allowlisted (psalm-23 only)
//   - confirm=yes required to actually generate
//   - optional REGEN_TOKEN
// No public page load can reach this. Generates IMAGES only — never text.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!devRoutesEnabled()) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const confirm = url.searchParams.get("confirm") === "yes";
  const token = url.searchParams.get("token") || "";

  if (process.env.REGEN_TOKEN && token !== process.env.REGEN_TOKEN) {
    return NextResponse.json({ ok: false, error: "bad token" }, { status: 401 });
  }

  if (!imageGenAllowed(slug)) {
    return NextResponse.json(
      {
        ok: false,
        error: "image generation not allowed",
        need: {
          enableImageGen: isImageGenEnabled(),
          allowedSlugs: IMAGE_ALLOWED_SLUGS,
          slug,
        },
        hint: "Set ENABLE_CHAPTER_IMAGE_GENERATION=true, ensure OpenAI+Supabase configured, and use an allowlisted slug.",
      },
      { status: 403 },
    );
  }

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      preview: true,
      slug,
      model: CHAPTER_IMAGE_MODEL,
      willGenerate: 3,
      note: "Preview only. Add &confirm=yes to generate 3 images and store them.",
    });
  }

  await triggerBackgroundImageGeneration(slug, url.host);
  return NextResponse.json({
    ok: true,
    triggered: true,
    slug,
    model: CHAPTER_IMAGE_MODEL,
    note: `Generating 3 images in the background. Poll /dev/db-status?slug=${slug} until imagesStored=true.`,
  });
}
