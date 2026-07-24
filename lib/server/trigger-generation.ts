// Triggers for the Netlify background functions. NOT fire-and-forget: network
// errors and non-2xx responses are returned to the caller, which must fail or
// release the claimed job and surface a real error (a chapter must never be
// stranded as "generating"/claimed by a failed trigger).
//
// Every trigger is authenticated: POST-only, carrying a signed, expiring job
// token bound to (purpose, slug, jobId) and, for an approved text run, its
// manifest digest. Workers verify the token before any work; a bare or
// replayed-after-expiry URL does nothing.
import { signJobToken, type ImageJobBinding, type JobPurpose } from "./generation-jobs";

export interface TriggerResult {
  ok: boolean;
  status?: number;
  error?: string;
}

interface TriggerRequest {
  url: string;
  body: {
    slug: string;
    job: string;
    token: string;
    approvedManifestDigest?: string;
    imagePlanDigest?: string;
    imageModel?: string;
    sourceOverlapReportDigest?: string;
    redoBindingDigest?: string;
    redoKind?: string;
  };
}

async function post(reqSpec: TriggerRequest): Promise<TriggerResult> {
  try {
    const res = await fetch(reqSpec.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reqSpec.body),
    });
    // Background functions answer 2xx (typically 202) immediately.
    if (!res.ok) return { ok: false, status: res.status, error: `trigger returned HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 200) };
  }
}

// TEST SEAM (offline safety gate only): capture/replace the outbound trigger so
// the verify script can drive the REAL route and hand the REAL worker the same
// signed token — or simulate delivery failure — without any network.
let triggerOverride: ((req: TriggerRequest) => Promise<TriggerResult>) | null = null;
export function __setTriggerTransportForTesting(
  fn: ((req: TriggerRequest) => Promise<TriggerResult>) | null,
): void {
  triggerOverride = fn;
}

function baseUrl(host: string): string {
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

async function trigger(
  purpose: JobPurpose,
  fn: string,
  slug: string,
  host: string,
  jobId: string,
  approvedManifestDigest?: string,
  imageBinding?: ImageJobBinding,
): Promise<TriggerResult> {
  let token: string;
  try {
    token = signJobToken(purpose, slug, jobId, undefined, approvedManifestDigest).token; // throws if invalid/unconfigured
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 200) };
  }
  const req: TriggerRequest = {
    url: `${baseUrl(host)}/.netlify/functions/${fn}`,
    body: {
      slug,
      job: jobId,
      token,
      ...(approvedManifestDigest === undefined ? {} : { approvedManifestDigest }),
      ...(imageBinding === undefined
        ? {}
        : {
            imagePlanDigest: imageBinding.planDigest,
            imageModel: imageBinding.model,
            ...(imageBinding.sourceOverlapReportDigest
              ? {
                  sourceOverlapReportDigest:
                    imageBinding.sourceOverlapReportDigest,
                }
              : {}),
          }),
    },
  };
  return triggerOverride ? triggerOverride(req) : post(req);
}

export async function triggerBackgroundGeneration(
  slug: string,
  host: string,
  jobId: string,
  approvedManifestDigest?: string,
): Promise<TriggerResult> {
  return trigger("text", "generate-chapter-background", slug, host, jobId, approvedManifestDigest);
}

/** Self-serve Prepare proposal worker trigger (IQ-011). Same signed-token
 * discipline; the claim is the inserted 'generating' proposal row. */
export async function triggerBackgroundPrepareProposal(
  slug: string,
  host: string,
  jobId: string,
): Promise<TriggerResult> {
  return trigger("prepare", "prepare-proposal-background", slug, host, jobId);
}

/** Model Day blind A/B worker trigger (printing-press plan ritual). Same
 * signed-token discipline; the claim is the inserted 'generating' run row. */
export async function triggerBackgroundModelDay(
  slug: string,
  host: string,
  jobId: string,
): Promise<TriggerResult> {
  return trigger("model-day", "model-day-background", slug, host, jobId);
}

export async function triggerBackgroundImageGeneration(
  slug: string,
  host: string,
  jobId: string,
  binding?: ImageJobBinding,
): Promise<TriggerResult> {
  return trigger("image", "generate-images-background", slug, host, jobId, undefined, binding);
}

/** Single-image redo worker trigger. Same signed-token discipline. */
export async function triggerBackgroundImageRedo(
  slug: string,
  host: string,
  jobId: string,
  redo: { bindingDigest: string; kind: string; model: string },
): Promise<TriggerResult> {
  let token: string;
  try {
    token = signJobToken("image", slug, jobId).token;
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 200) };
  }
  const req: TriggerRequest = {
    url: `${baseUrl(host)}/.netlify/functions/redo-image-background`,
    body: {
      slug,
      job: jobId,
      token,
      redoBindingDigest: redo.bindingDigest,
      redoKind: redo.kind,
      imageModel: redo.model,
    },
  };
  return triggerOverride ? triggerOverride(req) : post(req);
}

/** PUBLISHED-chapter single-image redo worker trigger (dedicated lane,
 * board #29 2026-07-19). Same signed-token discipline, dedicated purpose. */
export async function triggerBackgroundPublishedImageRedo(
  slug: string,
  host: string,
  jobId: string,
  redo: { bindingDigest: string; kind: string; model: string },
): Promise<TriggerResult> {
  let token: string;
  try {
    token = signJobToken("published-image-redo", slug, jobId).token;
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 200) };
  }
  const req: TriggerRequest = {
    url: `${baseUrl(host)}/.netlify/functions/published-redo-image-background`,
    body: {
      slug,
      job: jobId,
      token,
      redoBindingDigest: redo.bindingDigest,
      redoKind: redo.kind,
      imageModel: redo.model,
    },
  };
  return triggerOverride ? triggerOverride(req) : post(req);
}
