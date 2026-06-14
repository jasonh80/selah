// Fire-and-forget trigger for the Netlify background function that generates a
// chapter (15-min budget, so it isn't killed by the request timeout).
export async function triggerBackgroundGeneration(slug: string, host: string): Promise<void> {
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const url = `${proto}://${host}/.netlify/functions/generate-chapter-background?slug=${encodeURIComponent(
    slug,
  )}`;
  try {
    // Background functions return 202 immediately; we don't await completion.
    await fetch(url, { method: "POST" });
  } catch (e) {
    console.warn("[selah] failed to trigger background generation:", (e as Error).message);
  }
}

// Same pattern for IMAGE generation (slow: 3 image calls). Background function.
export async function triggerBackgroundImageGeneration(slug: string, host: string): Promise<void> {
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const url = `${proto}://${host}/.netlify/functions/generate-images-background?slug=${encodeURIComponent(
    slug,
  )}`;
  try {
    await fetch(url, { method: "POST" });
  } catch (e) {
    console.warn("[selah] failed to trigger background image generation:", (e as Error).message);
  }
}
