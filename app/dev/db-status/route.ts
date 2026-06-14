import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/server/supabase";

// DEV diagnostic. Returns only booleans/status — never any key values.
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {
    supabaseUrlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKeyPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseConfigured: isSupabaseConfigured(),
    exodus27Found: false,
    exodus27Status: null as string | null,
    queryError: null as string | null,
  };

  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data, error } = await db
        .from("chapter_workups")
        .select("slug,status")
        .eq("slug", "exodus-27")
        .maybeSingle();
      out.exodus27Found = Boolean(data);
      out.exodus27Status = data?.status ?? null;
      if (error) out.queryError = String(error.message).slice(0, 200);
    } catch (e) {
      out.queryError = String((e as Error).message).slice(0, 200);
    }
  }

  return NextResponse.json(out);
}
