// Netlify BACKGROUND function (note the "-background" suffix): runs up to 15 min,
// so deep OpenAI generation isn't killed by the request timeout.
//
// AUTHENTICATED single-use worker: POST-only, and every request must carry a
// signed, expiring job token bound to (text, slug, jobId) and, when present,
// the approved manifest digest minted by the route that took the atomic claim.
// The worker then atomically CONSUMES the claim
// (queued → running) inside generateAndStoreChapter — a duplicated delivery
// loses at that conditional write, before any paid model call. Refusals are
// durably audited, not just logged.
import { generateAndStoreChapter, generationAllowed } from "../../lib/server/generate-chapter-workup";
import { verifyJobToken } from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";

async function refuse(slug: string, reason: string, status: number): Promise<Response> {
  await logGenerationAudit({
    action: "refused:worker_generate",
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
  if (body.approvedManifestDigest !== undefined && typeof body.approvedManifestDigest !== "string") {
    return refuse(slug, "invalid approved manifest digest — refusing unauthenticated work", 400);
  }
  const approvedManifestDigest = body.approvedManifestDigest as string | undefined;
  if (!slug || !jobId) {
    return refuse(slug, "missing slug or job id — refusing unclaimed work", 400);
  }
  const auth = verifyJobToken("text", slug, jobId, token, undefined, approvedManifestDigest);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }
  if (!(await generationAllowed(slug))) {
    return refuse(slug, "generation not allowed for this slug", 403);
  }
  try {
    const workup = await generateAndStoreChapter(slug, jobId, approvedManifestDigest);
    return new Response(JSON.stringify({ ok: Boolean(workup), slug, jobId }), {
      status: workup ? 200 : 409,
    });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background generation error:", msg);
    await logGenerationAudit({ action: "refused:worker_generate", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
