import { NextResponse } from "next/server";
import { getEsvPassage, isEsvConfigured } from "@/lib/server/esv";

// Server-side proxy for ESV text. The browser calls this; the ESV key stays
// server-only. ESV is the only wired translation for now.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ref = (new URL(request.url).searchParams.get("ref") || "").trim();

  // Only allow simple passage references.
  if (!ref || !/^[A-Za-z0-9 .:–-]{2,40}$/.test(ref)) {
    return NextResponse.json({ error: "invalid reference" }, { status: 400 });
  }
  if (!isEsvConfigured()) {
    return NextResponse.json({ configured: false, found: false });
  }

  const passage = await getEsvPassage(ref);
  if (!passage) {
    return NextResponse.json({ configured: true, found: false });
  }
  return NextResponse.json({ configured: true, found: true, ...passage });
}
