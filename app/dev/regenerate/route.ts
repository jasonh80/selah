import { NextResponse } from "next/server";
import { generationAllowed, generateAndStoreChapter } from "@/lib/server/generate-chapter-workup";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { CHAPTER_WORKUP_TEXT_MODEL } from "@/lib/server/openai";

// DEV/admin: force-regenerate ONE allowlisted chapter (e.g. after a prompt/model
// change). Gated by generationAllowed (flag + OpenAI + Supabase + allowlist) and,
// if REGEN_TOKEN is set, a ?token= match. Costs an OpenAI call — use sparingly.
export const dynamic = "force-dynamic";
export const maxDuration = 90;

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

  const workup = await generateAndStoreChapter(slug);

  // Read back the row so the response shows exactly what happened.
  let status: string | null = null;
  let generationError: string | null = null;
  let imagesCount: number | null = null;
  let sectionsCount: number | null = null;
  const db = getSupabaseAdmin();
  if (db) {
    const { data } = await db
      .from("chapter_workups")
      .select("status,generation_error,workup_json")
      .eq("slug", slug)
      .maybeSingle();
    status = data?.status ?? null;
    generationError = data?.generation_error ? String(data.generation_error).slice(0, 300) : null;
    const wj = data?.workup_json as { images?: unknown[]; insights?: unknown[] } | null;
    imagesCount = Array.isArray(wj?.images) ? wj!.images!.length : null;
    sectionsCount = Array.isArray(wj?.insights) ? wj!.insights!.length : null;
  }

  return NextResponse.json({
    ok: Boolean(workup),
    slug,
    model: CHAPTER_WORKUP_TEXT_MODEL,
    status,
    imagesCount,
    deeperCardsCount: sectionsCount,
    generationError,
  });
}
