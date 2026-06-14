import { NextResponse } from "next/server";
import { generationAllowed } from "@/lib/server/generate-chapter-workup";
import { createGeneratingChapterWorkup } from "@/lib/server/chapter-workups-repository";
import { parseSlug } from "@/lib/server/generate-chapter-workup";
import { triggerBackgroundGeneration } from "@/lib/server/trigger-generation";

// DEV/admin: force-regenerate ONE allowlisted chapter in the background (e.g.
// after a prompt/model change). Returns immediately; poll /dev/db-status?slug=
// until status is "ready". Gated by generationAllowed + optional REGEN_TOKEN.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const token = url.searchParams.get("token") || "";

  const required = process.env.REGEN_TOKEN;
  if (required && token !== required) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!generationAllowed(slug)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "not allowed — needs ENABLE_CHAPTER_GENERATION=true, OpenAI+Supabase configured, and an allowlisted slug (psalm-23, mark-2)",
      },
      { status: 403 },
    );
  }

  const parsed = parseSlug(slug);
  if (parsed) {
    await createGeneratingChapterWorkup({
      book: parsed.book,
      chapter: parsed.chapter,
      slug,
      title: `${parsed.book} ${parsed.chapter}`,
      source: "generated",
    });
  }
  await triggerBackgroundGeneration(slug, url.host);

  return NextResponse.json({
    ok: true,
    slug,
    triggered: true,
    note: "Generating in the background. Poll /dev/db-status?slug=" + slug + " until status is 'ready'.",
  });
}
