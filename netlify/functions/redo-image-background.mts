// Netlify BACKGROUND function: generates the SINGLE-image redo candidate
// (board #29 owner decision, 2026-07-17), uploads it to its own immutable
// storage directory, and records it as a PRIVATE candidate. 15-min budget.
//
// AUTHENTICATED single-use worker: POST-only with a signed, expiring job token
// bound to (image, slug, jobId). The ROUTE already probed the model and took
// the atomic redo claim; this worker atomically CONSUMES it (queued → running,
// full binding revalidated) before any spend, so a duplicated delivery cannot
// double-spend. The chapter's images are NEVER modified here — only the
// owner's later approval swaps the one src. No text generation here.
import { runImageRedoJob } from "../../lib/server/images";
import { verifyJobToken } from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";

async function refuse(slug: string, reason: string, status: number): Promise<Response> {
  await logGenerationAudit({
    action: "refused:worker_image_redo",
    slug: slug || undefined,
    status: "failed",
    message: reason.slice(0, 300),
  });
  return new Response(JSON.stringify({ ok: false, error: reason }), { status });
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return refuse("", `method ${req.method} not allowed — worker accepts POST only`, 405);
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? body.slug : "";
  const jobId = typeof body.job === "string" ? body.job : "";
  const token = typeof body.token === "string" ? body.token : "";
  const bindingDigest =
    typeof body.redoBindingDigest === "string" ? body.redoBindingDigest : "";
  const model = typeof body.imageModel === "string" ? body.imageModel : "";
  if (!slug || !jobId) {
    return refuse(slug, "missing slug or job id — refusing unclaimed redo work", 400);
  }
  if (!bindingDigest || !model) {
    return refuse(slug, "missing redo binding — refusing unbound redo work", 400);
  }
  const auth = verifyJobToken("image", slug, jobId, token);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }
  try {
    // The orchestration owns worker-time kill-switch/receipt checks so a valid
    // queued redo is safely released when any pre-spend check fails.
    const result = await runImageRedoJob(slug, jobId, { bindingDigest, model });
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background image redo error:", msg);
    await logGenerationAudit({ action: "refused:worker_image_redo", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
