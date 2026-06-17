// Netlify BACKGROUND function (note the "-background" suffix): runs up to 15 min,
// so deep OpenAI generation isn't killed by the request timeout. Triggered by
// the chapter route / regenerate route via fetch; returns 202 immediately.
import { generateAndStoreChapter, generationAllowed } from "../../lib/server/generate-chapter-workup";

export default async (req: Request) => {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  if (!(await generationAllowed(slug))) {
    return new Response(JSON.stringify({ ok: false, error: "not allowed" }), { status: 403 });
  }
  try {
    const workup = await generateAndStoreChapter(slug);
    return new Response(JSON.stringify({ ok: Boolean(workup), slug }));
  } catch (e) {
    console.error("[selah] background generation error:", (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500,
    });
  }
};
