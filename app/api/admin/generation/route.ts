import { NextResponse } from "next/server";
import {
  getGenerationSettings,
  updateGenerationSettings,
  logGenerationAudit,
  type GenerationSettings,
} from "@/lib/server/generation-settings";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import {
  createGeneratingChapterWorkup,
  getChapterStatus,
  getDraftWorkup,
  publishChapter,
} from "@/lib/server/chapter-workups-repository";
import { triggerBackgroundGeneration } from "@/lib/server/trigger-generation";
import { getAuditLog } from "@/lib/server/selah-feedback";
import {
  submitReview,
  listGlobalRules,
  setRuleActive,
  deleteRule,
  type ReviewScope,
} from "@/lib/server/selah-brain";

// Admin generation control API. Auth = DEV_ADMIN_TOKEN (header x-admin-token).
// The Supabase service-role key never reaches the browser; all checks run here.
export const dynamic = "force-dynamic";

function authed(req: Request): boolean {
  const expected = process.env.DEV_ADMIN_TOKEN || "";
  const provided = req.headers.get("x-admin-token") || new URL(req.url).searchParams.get("token") || "";
  return Boolean(expected) && provided === expected;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await getGenerationSettings() });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  // ---- save settings ----
  if (action === "save") {
    const updated = await updateGenerationSettings((body.settings ?? {}) as Partial<GenerationSettings>);
    await logGenerationAudit({ action: "update_settings", status: updated ? "succeeded" : "failed" });
    return NextResponse.json({ ok: Boolean(updated), settings: updated });
  }

  // ---- publish a draft ----
  if (action === "publish") {
    const slug = String(body.slug ?? "");
    const draft = await getDraftWorkup(slug);
    if (!draft) return NextResponse.json({ ok: false, error: "no stored row for slug" }, { status: 404 });
    const status = await publishChapter(slug);
    await logGenerationAudit({ action: "publish", slug, status: status ? "succeeded" : "failed" });
    return NextResponse.json({ ok: Boolean(status), slug, status });
  }

  // ---- poll a chapter's status (for the Generate Draft progress UI) ----
  if (action === "status") {
    const slug = String(body.slug ?? "");
    return NextResponse.json({ ok: true, slug, status: await getChapterStatus(slug) });
  }

  // ---- Selah Brain review (does this feel like Selah?) ----
  // Saves a chapter note; future/both also creates an active global rule.
  if (action === "feedback") {
    const ok = await submitReview({
      slug: String(body.slug ?? ""),
      verdict: String(body.verdict ?? "yes") as "yes" | "needs_work",
      note: typeof body.note === "string" ? body.note : "",
      scope: String(body.scope ?? "chapter") as ReviewScope,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    });
    return NextResponse.json({ ok });
  }

  // ---- Selah Brain rules (Advanced Settings → What Selah Has Learned) ----
  if (action === "rules_list") {
    return NextResponse.json({ ok: true, rules: await listGlobalRules() });
  }
  if (action === "rule_toggle") {
    const ok = await setRuleActive(String(body.id ?? ""), body.active === true);
    return NextResponse.json({ ok });
  }
  if (action === "rule_delete") {
    const ok = await deleteRule(String(body.id ?? ""));
    return NextResponse.json({ ok });
  }

  // ---- recent activity (Advanced Settings audit panel) ----
  if (action === "audit") {
    return NextResponse.json({ ok: true, entries: await getAuditLog() });
  }

  // ---- generate a draft (text only) ----
  if (action === "generate") {
    const slug = String(body.slug ?? "");
    const confirm = body.confirm === true || body.confirm === "yes";
    const settings = await getGenerationSettings();

    if (settings.require_confirm && !confirm) {
      return NextResponse.json({ ok: false, error: "confirmation required", requireConfirm: true });
    }
    // Kill switch: text generation must be enabled.
    if (!settings.text_generation_enabled) {
      return NextResponse.json(
        { ok: false, error: "Text Generation is OFF — turn it on in Advanced Settings." },
        { status: 403 },
      );
    }
    // Temporarily allow the picked slug server-side (so the picker drives the
    // allowlist — no manual typing). Persists in allowed_slugs.
    if (!settings.allowed_slugs.includes(slug)) {
      await updateGenerationSettings({ allowed_slugs: [...settings.allowed_slugs, slug] });
    }
    if (!(await generationAllowed(slug))) {
      return NextResponse.json({ ok: false, error: "blocked — generation not allowed for this slug" }, { status: 403 });
    }
    const status = await getChapterStatus(slug);
    if (status === "generating") {
      return NextResponse.json({ ok: false, error: "already generating — wait for it to finish" });
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
    await triggerBackgroundGeneration(slug, new URL(req.url).host);
    return NextResponse.json({
      ok: true,
      triggered: true,
      slug,
      model: settings.selected_text_model,
      note: `Generating "${slug}" as a DRAFT in the background. It saves to Supabase (hidden from public). Preview it, then Publish.`,
    });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
