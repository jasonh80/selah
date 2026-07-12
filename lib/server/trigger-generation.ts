// Triggers for the Netlify background functions. NOT fire-and-forget anymore:
// network errors and non-2xx responses are returned to the caller, which must
// fail the claimed job and surface a real error (issue #8 re-review item 3 —
// a chapter must never be stranded as "generating" by a failed trigger).
export interface TriggerResult {
  ok: boolean;
  status?: number;
  error?: string;
}

async function trigger(url: string): Promise<TriggerResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    // Background functions answer 2xx (typically 202) immediately.
    if (!res.ok) return { ok: false, status: res.status, error: `trigger returned HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 200) };
  }
}

export async function triggerBackgroundGeneration(slug: string, host: string, jobId: string): Promise<TriggerResult> {
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return trigger(
    `${proto}://${host}/.netlify/functions/generate-chapter-background?slug=${encodeURIComponent(slug)}&job=${encodeURIComponent(jobId)}`,
  );
}

export async function triggerBackgroundImageGeneration(slug: string, host: string): Promise<TriggerResult> {
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return trigger(
    `${proto}://${host}/.netlify/functions/generate-images-background?slug=${encodeURIComponent(slug)}`,
  );
}
