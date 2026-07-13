// Netlify BACKGROUND function: generates the chapter's images (slow), uploads
// them to Supabase Storage, and wires them into workup_json. 15-min budget.
//
// AUTHENTICATED single-use worker: POST-only with a signed, expiring job token
// bound to (image, slug, jobId). The ROUTE already probed the model and took
// the atomic image claim; this worker atomically CONSUMES it (queued →
// running) before any spend, so a duplicated delivery cannot double-spend.
// Refusals are durably audited. No text generation here.
import { generateAndStoreChapterImages } from "../../lib/server/images";
import { verifyJobToken, type ImageJobBinding } from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";

async function refuse(slug: string, reason: string, status: number): Promise<Response> {
  await logGenerationAudit({
    action: "refused:worker_images",
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
  const imagePlanDigest = typeof body.imagePlanDigest === "string" ? body.imagePlanDigest : "";
  const imageModel = typeof body.imageModel === "string" ? body.imageModel : "";
  const binding: ImageJobBinding | undefined =
    imagePlanDigest && imageModel
      ? { planDigest: imagePlanDigest, model: imageModel }
      : undefined;
  if (!slug || !jobId) {
    return refuse(slug, "missing slug or job id — refusing unclaimed image work", 400);
  }
  const auth = verifyJobToken("image", slug, jobId, token);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }
  try {
    // The orchestration owns worker-time kill-switch/allowlist checks so a
    // valid queued job is safely released when any pre-spend check fails.
    const result = await generateAndStoreChapterImages(slug, jobId, binding);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background image generation error:", msg);
    await logGenerationAudit({ action: "refused:worker_images", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
