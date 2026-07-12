// Netlify BACKGROUND function (note the "-background" suffix): runs up to 15 min,
// so deep OpenAI generation isn't killed by the request timeout. Triggered by
// the admin route AFTER it took the single atomic job claim; the claimed job id
// arrives as &job= and this worker only VERIFIES ownership — it never re-claims.
import { generateAndStoreChapter, generationAllowed } from "../../lib/server/generate-chapter-workup";

export default async (req: Request) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  const jobId = url.searchParams.get("job") || "";
  if (!jobId) {
    return new Response(JSON.stringify({ ok: false, error: "missing job id — refusing unclaimed work" }), { status: 400 });
  }
  if (!(await generationAllowed(slug))) {
    return new Response(JSON.stringify({ ok: false, error: "not allowed" }), { status: 403 });
  }
  try {
    const workup = await generateAndStoreChapter(slug, jobId);
    return new Response(JSON.stringify({ ok: Boolean(workup), slug, jobId }));
  } catch (e) {
    console.error("[selah] background generation error:", (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500,
    });
  }
};
