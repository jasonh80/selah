// Netlify BACKGROUND function: runs ONE claimed Model Day blind A/B (printing-
// press plan standing ritual). At most two bounded model requests (incumbent
// first, challenger only inside the total cap), no automatic retry; it writes
// ONLY the model_day_runs row + cost events + audit lines — it can never
// touch chapter data, publish, or change the selected models. The ROUTE
// already inserted the single-use claim row (status 'generating'); this
// worker consumes it by conditional update.
//
// AUTHENTICATED single-use worker: POST-only with a signed, expiring job
// token bound to (model-day, slug, jobId). Pre-auth refusals are console-only
// (IQ-005): the function URL is publicly reachable, so durable audit rows
// before the signature check would hand unauthenticated callers a flood
// primitive. Post-auth failures are durably audited.
import { runModelDayJob } from "../../lib/server/model-day";
import { verifyJobToken } from "../../lib/server/generation-jobs";
import { logGenerationAudit } from "../../lib/server/generation-settings";

function refuse(slug: string, reason: string, status: number): Response {
  console.error(`[selah] worker_model_day refused${slug ? ` (${slug})` : ""}: ${reason}`);
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
    return refuse(slug, "missing slug or job id — refusing unclaimed Model Day work", 400);
  }
  const auth = verifyJobToken("model-day", slug, jobId, token);
  if (!auth.ok) {
    return refuse(slug, `job token rejected (${auth.reason}) — refusing unauthenticated work`, 401);
  }
  try {
    const result = await runModelDayJob(slug, jobId);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    console.error("[selah] background model day error:", msg);
    await logGenerationAudit({ action: "model_day_failed", slug, status: "failed", message: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
