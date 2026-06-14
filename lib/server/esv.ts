// SERVER-ONLY. Reads ESV_API_KEY. Never import into a client component.
// Fetches passage text from the ESV API on demand. We do NOT persist full ESV
// text (licensing) — only a short-lived in-memory cache per server instance.

const ENDPOINT = "https://api.esv.org/v3/passage/text/";

export interface EsvPassage {
  reference: string;
  text: string;
  copyright: string;
}

const ESV_COPYRIGHT =
  "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © Crossway. Used by permission. All rights reserved.";

const cache = new Map<string, EsvPassage>();

export function isEsvConfigured(): boolean {
  return Boolean(process.env.ESV_API_KEY);
}

export async function getEsvPassage(reference: string): Promise<EsvPassage | null> {
  const apiKey = process.env.ESV_API_KEY;
  if (!apiKey) return null;

  const cacheKey = reference.trim().toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: reference,
    "include-headings": "true",
    "include-footnotes": "false",
    "include-verse-numbers": "true",
    "include-short-copyright": "false",
    "include-passage-references": "false",
  });

  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!res.ok) {
      console.error(`[selah] ESV fetch failed: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { canonical?: string; passages?: string[] };
    const text = (json.passages ?? []).join("\n\n").trim();
    if (!text) return null;

    const passage: EsvPassage = {
      reference: json.canonical ?? reference,
      text,
      copyright: ESV_COPYRIGHT,
    };
    cache.set(cacheKey, passage);
    return passage;
  } catch (e) {
    console.error("[selah] ESV error:", (e as Error).message);
    return null;
  }
}
