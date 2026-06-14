// Netlify BACKGROUND function: generates the chapter's 3 images (slow), uploads
// them to Supabase Storage, and wires them into workup_json. 15-min budget.
// Allowlisted + flag-gated inside generateAndStoreChapterImages. No text gen.
import { generateAndStoreChapterImages, imageGenAllowed } from "../../lib/server/images";

export default async (req: Request) => {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  if (!imageGenAllowed(slug)) {
    return new Response(JSON.stringify({ ok: false, error: "not allowed" }), { status: 403 });
  }
  try {
    const result = await generateAndStoreChapterImages(slug);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
  } catch (e) {
    console.error("[selah] background image generation error:", (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500,
    });
  }
};
