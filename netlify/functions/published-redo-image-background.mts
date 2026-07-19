// Netlify BACKGROUND function: generates the PUBLISHED-chapter single-image
// redo candidate (Codex APPROVE WITH CONDITIONS, board #29 2026-07-19),
// uploads it to its own immutable storage directory, and records it in the
// dedicated lane table — the LIVE chapter row is never written here. Only the
// owner's later second confirmation ("Use on live chapter") swaps the one src.
//
// AUTHENTICATED single-use worker: POST-only with a signed, expiring job token
// bound to (published-image-redo, slug, jobId). The ROUTE already probed the
// model and took the atomic lane claim; this worker atomically CONSUMES it
// (queued → running, full binding incl. live revision revalidated) before any
// spend, so a duplicated delivery cannot double-spend.
import { runPublishedImageRedoJob } from "../../lib/server/images";
import { verifyJobToken } from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";

// PRE-AUTH refusals log to the console only (public URL — durable audit rows
// before the signature check would hand unauthenticated callers a flooding
// primitive). Post-auth failures stay durably audited inside the runner.
function refuse(slug: string, reason: string, status: number): Response {
  console.error(`[selah] worker_published_redo refused${slug ? ` (${slug})` : ""}: ${reason}`);
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
  const auth = verifyJobToken("published-image-redo", slug, jobId, token);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }
  try {
    const result = await runPublishedImageRedoJob(slug, jobId, { bindingDigest, model });
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background published image redo error:", msg);
    await logGenerationAudit({ action: "refused:worker_published_redo", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
