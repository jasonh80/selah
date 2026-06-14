import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/server/supabase";
import { devRoutesEnabled } from "@/lib/server/dev-guard";

// DEV diagnostic. Returns only booleans/status — never any key values.
// Inspect a specific chapter row with ?slug=psalm-23
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!devRoutesEnabled()) return new NextResponse("Not found", { status: 404 });
  const slug = new URL(request.url).searchParams.get("slug") || "exodus-27";

  const out: Record<string, unknown> = {
    slug,
    supabaseUrlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
    generationEnabled: process.env.ENABLE_CHAPTER_GENERATION === "true",
    supabaseConfigured: isSupabaseConfigured(),
    rowFound: false,
    status: null as string | null,
    imagesCount: null as number | null,
    generationError: null as string | null,
    queryError: null as string | null,
  };

  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data, error } = await db
        .from("chapter_workups")
        .select("status,generation_error,workup_json")
        .eq("slug", slug)
        .maybeSingle();
      if (error) out.queryError = String(error.message).slice(0, 200);
      if (data) {
        out.rowFound = true;
        out.status = data.status ?? null;
        out.generationError = data.generation_error
          ? String(data.generation_error).slice(0, 250)
          : null;
        const imgs = (data.workup_json as { images?: unknown[] } | null)?.images;
        out.imagesCount = Array.isArray(imgs) ? imgs.length : null;
      }
    } catch (e) {
      out.queryError = String((e as Error).message).slice(0, 200);
    }
  }

  return NextResponse.json(out);
}
