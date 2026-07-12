import { NextResponse } from "next/server";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import { getChapterStatus } from "@/lib/server/chapter-workups-repository";
import { claimGenerationJob, failGenerationJob, requireJobStore } from "@/lib/server/generation-jobs";
import { isChapterMutationError } from "@/lib/server/protected-chapters";
import { triggerBackgroundGeneration } from "@/lib/server/trigger-generation";
import { CHAPTER_WORKUP_TEXT_MODEL } from "@/lib/server/openai";
import { devRoutesEnabled } from "@/lib/server/dev-guard";

// DEV/admin legacy generation trigger. Two steps for safety:
//   1. GET /dev/regenerate?slug=<slug>             → PREVIEW (no generation)
//   2. GET /dev/regenerate?slug=<slug>&confirm=yes → starts a background job
// There is NO force/overwrite path (issue #8): the mutation guard refuses
// protected, published, quarantined-ready, and mid-run rows — always.
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

  if (process.env.REGEN_TOKEN && token !== process.env.REGEN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!(await generationAllowed(slug))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "not allowed — enable text generation + allowlist this slug in /admin/generation (OpenAI + Supabase must be configured)",
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
      willRegenerate: !isReady,
      note: isReady
        ? "This chapter is published/ready — the mutation guard will refuse regeneration. There is no force override."
        : "Add &confirm=yes to start the background generation.",
    });
  }

  // Step 2: confirmed — the typed, race-safe claim IS the guard rail. Any
  // refusal/conflict is surfaced; no trigger follows a failed claim.
  const parsed = parseSlug(slug);
  if (!parsed) return NextResponse.json({ ...base, ok: false, error: "unparseable slug" }, { status: 400 });
  let jobId: string;
  try {
    jobId = await claimGenerationJob(requireJobStore(slug, "regenerate"), slug, {
      book: parsed.book,
      chapter: parsed.chapter,
      title: `${parsed.book} ${parsed.chapter}`,
      source: "generated",
    });
  } catch (e) {
    if (isChapterMutationError(e)) {
      const code = e.code === "REFUSED" ? 403 : e.code === "CONFLICT" ? 409 : 500;
      return NextResponse.json({ ...base, ok: false, error: `${e.code}: ${e.message}` }, { status: code });
    }
    return NextResponse.json({ ...base, ok: false, error: String((e as Error).message) }, { status: 500 });
  }
  const triggered = await triggerBackgroundGeneration(slug, url.host, jobId);
  if (!triggered.ok) {
    await failGenerationJob(requireJobStore(slug, "regenerate"), slug, jobId, `trigger failed: ${triggered.error ?? triggered.status}`);
    return NextResponse.json(
      { ...base, ok: false, error: `background trigger failed — job marked failed (${triggered.error ?? triggered.status})` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ...base,
    ok: true,
    triggered: true,
    note: `Generating in the background on ${CHAPTER_WORKUP_TEXT_MODEL}. Poll /dev/db-status?slug=${slug} until status is 'ready'.`,
  });
}
