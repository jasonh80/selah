import { NextResponse } from "next/server";
import { devRoutesEnabled } from "@/lib/server/dev-guard";
import { getDraftWorkup, publishChapter } from "@/lib/server/chapter-workups-repository";

// DEV/admin: promote a reviewed draft to published (status → reviewed, which the
// public read-through serves). Two steps:
//   GET /dev/publish?slug=mark-6              → preview current status
//   GET /dev/publish?slug=mark-6&confirm=yes  → publish
// Gated by ENABLE_DEV_ROUTES (+ optional REGEN_TOKEN).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!devRoutesEnabled()) return new NextResponse("Not found", { status: 404 });
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const token = url.searchParams.get("token") || "";
  const confirm = url.searchParams.get("confirm") === "yes";

  if (process.env.REGEN_TOKEN && token !== process.env.REGEN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const draft = await getDraftWorkup(slug);
  if (!draft) return NextResponse.json({ ok: false, error: "no stored row for slug" }, { status: 404 });

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      preview: true,
      slug,
      currentStatus: draft.status,
      note: `Preview the draft at /dev/preview/${slug}. Add &confirm=yes to publish (status → reviewed).`,
    });
  }

  const newStatus = await publishChapter(slug);
  return NextResponse.json({ ok: Boolean(newStatus), slug, status: newStatus, published: Boolean(newStatus) });
}
