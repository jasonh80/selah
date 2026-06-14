import { NextResponse } from "next/server";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import {
  createGeneratingChapterWorkup,
  getChapterStatus,
} from "@/lib/server/chapter-workups-repository";
import { triggerBackgroundGeneration } from "@/lib/server/trigger-generation";
import { CHAPTER_WORKUP_TEXT_MODEL } from "@/lib/server/openai";
import { devRoutesEnabled } from "@/lib/server/dev-guard";

// DEV/admin: the ONLY way to start a chapter generation. Two steps for safety:
//   1. GET /dev/regenerate?slug=psalm-23           → PREVIEW (no generation)
//   2. GET /dev/regenerate?slug=psalm-23&confirm=yes → starts a background job
// Add &force=yes to overwrite an existing ready/reviewed row. Gated by
// generationAllowed (flag + OpenAI + Supabase + allowlist) and optional REGEN_TOKEN.
export const dynamic = "force-dynamic";

function estimatedCostRange(model: string): string {
  if (/mini|nano/i.test(model)) return "~$0.01–0.05 per run";
  if (/^gpt-5/i.test(model)) return "~$0.10–1.00 per run (reasoning model; varies a lot)";
  if (/^gpt-4o/i.test(model)) return "~$0.02–0.10 per run";
  return "unknown";
}

export async function GET(request: Request) {
  if (!devRoutesEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const token = url.searchParams.get("token") || "";
  const confirm = url.searchParams.get("confirm") === "yes";
  const force = url.searchParams.get("force") === "yes";

  if (process.env.REGEN_TOKEN && token !== process.env.REGEN_TOKEN) {
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

  const status = await getChapterStatus(slug);
  const isReady = status === "ready" || status === "reviewed";
  const base = {
    slug,
    model: CHAPTER_WORKUP_TEXT_MODEL,
    estimatedCost: estimatedCostRange(CHAPTER_WORKUP_TEXT_MODEL),
    currentStatus: status,
  };

  // Step 1: preview only.
  if (!confirm) {
    return NextResponse.json({
      ...base,
      preview: true,
      willRegenerate: !isReady || force,
      note: isReady && !force
        ? "Already ready. Add &force=yes&confirm=yes to overwrite, or leave it."
        : "Add &confirm=yes to start the background generation.",
    });
  }

  // Step 2: confirmed — guard rails.
  if (status === "generating") {
    return NextResponse.json({ ...base, ok: false, error: "already generating — wait for it to finish" });
  }
  if (isReady && !force) {
    return NextResponse.json({
      ...base,
      ok: false,
      error: "already ready — add &force=yes to overwrite",
    });
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
    ...base,
    ok: true,
    triggered: true,
    note: `Generating in the background on ${CHAPTER_WORKUP_TEXT_MODEL}. Poll /dev/db-status?slug=${slug} until status is 'ready'.`,
  });
}
