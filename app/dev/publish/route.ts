import { NextResponse } from "next/server";
import { devMutationTokenAuthorized, devRoutesEnabled } from "@/lib/server/dev-guard";
import { getDraftWorkup, publishChapter } from "@/lib/server/chapter-workups-repository";
import { isChapterMutationError } from "@/lib/server/protected-chapters";
import { logGenerationAudit } from "@/lib/server/generation-settings";

// DEV/admin: promote a reviewed draft to published (status → reviewed, which the
// public read-through serves). Two steps:
//   GET /dev/publish?slug=mark-6              → preview current status
//   GET /dev/publish?slug=mark-6&confirm=yes  → publish
// Gated by ENABLE_DEV_ROUTES + a required exact REGEN_TOKEN.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!devRoutesEnabled()) return new NextResponse("Not found", { status: 404 });
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const confirm = url.searchParams.get("confirm") === "yes";

  if (!devMutationTokenAuthorized(request)) {
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

  try {
    const newStatus = await publishChapter(slug);
    await logGenerationAudit({ action: "publish", slug, status: "succeeded", message: "via /dev/publish" });
    return NextResponse.json({ ok: true, slug, status: newStatus, published: true });
  } catch (e) {
    // Every refusal is durably audited — legacy dev routes included.
    const msg = isChapterMutationError(e) ? `${e.code}: ${e.message}` : String((e as Error).message);
    await logGenerationAudit({ action: "refused:publish", slug, status: "failed", message: msg.slice(0, 300) });
    if (isChapterMutationError(e)) {
      const code = e.code === "REFUSED" ? 403 : e.code === "CONFLICT" ? 409 : 500;
      return NextResponse.json({ ok: false, slug, error: msg }, { status: code });
    }
    return NextResponse.json({ ok: false, slug, error: msg }, { status: 500 });
  }
}
