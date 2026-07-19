// Netlify BACKGROUND function: creates ONE chapter preparation proposal
// (IQ-011 self-serve Prepare). One bounded model request, no automatic retry;
// structured proposal data only — it cannot create chapter copy, images, or
// publish anything. The ROUTE already inserted the single-use claim row
// (status 'generating'); this worker consumes it by conditional update to
// 'proposed' (validated, digest-bound) or 'failed' (one plain reason), with
// durable spend accounting to the IQ-006 standard.
//
// AUTHENTICATED single-use worker: POST-only with a signed, expiring job
// token bound to (prepare, slug, jobId). Pre-auth refusals are console-only
// (IQ-005): the function URL is publicly reachable, so durable audit rows
// before the signature check would hand unauthenticated callers a flood
// primitive. Post-auth failures are durably audited.
import { runPrepareProposalJob } from "../../lib/server/prepare-proposals";
import { verifyJobToken } from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";

function refuse(slug: string, reason: string, status: number): Response {
  console.error(`[selah] worker_prepare_proposal refused${slug ? ` (${slug})` : ""}: ${reason}`);
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
  if (!slug || !jobId) {
    return refuse(slug, "missing slug or job id — refusing unclaimed proposal work", 400);
  }
  const auth = verifyJobToken("prepare", slug, jobId, token);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }
  try {
    const result = await runPrepareProposalJob(slug, jobId);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background prepare proposal error:", msg);
    await logGenerationAudit({ action: "prepare_proposal_failed", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
