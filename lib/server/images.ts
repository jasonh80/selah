// SERVER-ONLY. Chapter image generation → Supabase Storage → workup_json.images.
// Heavily gated and ALLOWLISTED. Never called from a public page load.
// Text generation is NOT touched here.
import type { ChapterWorkup, ImageKind } from "@/lib/types";
import { getOpenAI, isOpenAIConfigured } from "./openai";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getDraftWorkup, updateChapterWorkupJson } from "./chapter-workups-repository";
import { recordCostEvent } from "./cost-events-repository";
import { getGenerationSettings } from "./generation-settings";

export const CHAPTER_IMAGE_MODEL = process.env.CHAPTER_IMAGE_MODEL || "gpt-image-1";

// Slugs that have a hand-authored IMAGE_PLAN. (Generated chapters' image prompts
// will come from their workup later; for now image gen needs a plan here.)
export const IMAGE_ALLOWED_SLUGS = ["psalm-23", "mark-6"];

// Routine image control lives in Supabase (generation_settings.image_generation_enabled,
// defaults OFF). Fail-CLOSED. Still requires an IMAGE_PLAN for the slug.
export async function imageGenAllowed(slug: string): Promise<boolean> {
  if (!isOpenAIConfigured() || !isSupabaseConfigured() || !IMAGE_PLANS[slug]) return false;
  const s = await getGenerationSettings();
  return s.image_generation_enabled && s.allowed_slugs.includes(slug);
}

const BUCKET = "chapter-images";

const STYLE =
  " Historical documentary realism, earthy and restrained. Ancient Judean terrain, believable shepherding world, natural light, cinematic but not theatrical, reverent not staged. No halos, no glowing figures or angels, no fantasy effects, no modern objects, no European fantasy Bible-art look, no clean costumes, no text or lettering of any kind.";

interface ImagePlan {
  kind: ImageKind;
  prompt: string;
  alt: string;
  caption: string;
}

// Final prompts (user-provided) + style suffix, keyed by slug.
const IMAGE_PLANS: Record<string, ImagePlan[]> = {
  "psalm-23": [
    {
      kind: "establishing",
      caption: "The Shepherd's World",
      alt: "Ancient Judean hill country with a distant shepherd and scattered sheep in late afternoon light.",
      prompt:
        "Ancient Judean hill country near Bethlehem, around the Davidic era, dry golden limestone hills, sparse grass, scattered sheep, a shepherd in simple wool and linen clothing at a distance, late afternoon light." +
        STYLE,
    },
    {
      kind: "detail",
      caption: "Still Waters",
      alt: "A shepherd's rod and staff resting beside still water on rocky ground, with worn leather sandals nearby.",
      prompt:
        "Close-up of a shepherd's rod and staff resting beside still water in a rocky Judean landscape, sheep wool caught on a branch, worn leather sandals nearby, dust, stone, simple ancient textures, tactile realism, soft natural light." +
        STYLE,
    },
    {
      kind: "human",
      caption: "Through the Valley",
      alt: "A shepherd guiding sheep through a narrow shadowed ravine at dusk in the ancient Judean wilderness.",
      prompt:
        "A shepherd guiding sheep through a narrow shadowed ravine at dusk, protective posture, quiet danger, deep shadows, ancient Judean wilderness, emotionally reverent but realistic." +
        STYLE,
    },
  ],

  // Approved Mark 6 plan (CHAPTER_IMAGE_PLAN concepts — Orient Me / Reveal
  // Something / Let Me Feel It). Prompts carry their own style + negative
  // guardrails (from the approved feeding-of-the-5,000 image direction), so the
  // Judean STYLE suffix is intentionally NOT appended.
  "mark-6": [
    {
      kind: "establishing",
      caption: "The World of Mark 6: Galilee",
      alt: "The Sea of Galilee with low hills, a small stone hillside village, and a wooden fishing boat in late-afternoon light.",
      prompt:
        "Wide photorealistic historical landscape of Galilee around AD 29 in late-afternoon light: the freshwater Sea of Galilee, low brown hills, a small stone village on a hillside, a single wooden fishing boat on the water, dry grass, dust in the air. Documentary realism, natural light, no modern objects, no text, no fantasy glow.",
    },
    {
      kind: "detail",
      caption: "Five Barley Loaves and Two Fish",
      alt: "Small rough barley flatbreads and dried fish in worn woven baskets, with weathered hands breaking a coarse loaf.",
      prompt:
        "Honest close-up historical detail: small rough barley flatbreads and small dried fish in worn woven baskets, weathered first-century hands breaking a coarse loaf. Earthy, imperfect, real. Photorealistic documentary style, natural light, no modern bakery bread, no text, no fantasy glow.",
    },
    {
      kind: "human",
      caption: "A Wilderness Full of People, Fed",
      alt: "A vast crowd of first-century villagers seated in family groups on a grassy hillside above the Sea of Galilee as disciples distribute bread and fish.",
      prompt:
        "Photorealistic historical scene from Mark 6, the feeding of the 5,000, set in Galilee around AD 29 on a remote grassy hillside above the Sea of Galilee. A massive crowd of ordinary first-century Jewish villagers — 5,000 adult men counted, with women and children also present — seated and reclining in loose, uneven family groups. Jesus appears as an ordinary first-century Galilean Jewish man in worn earth-toned clothing, not glowing, not idealized, near the center but naturally placed, quietly breaking rough barley flatbreads and handing pieces to the disciples, who move through the crowd with simple baskets of barley loaves and dried fish. Woven wool and linen garments, leather sandals, dusty feet, sun-worn faces, wind, dry grass, cloaks on the ground, children with families, the Sea of Galilee visible beyond. True photorealism, anamorphic 35mm film still, strong late-afternoon directional light, dust haze, warm rim light. No halos, no text, no modern objects, no Europeanized faces, no oversized bakery bread, no movie-poster posing.",
    },
  ],
};

function imageSize(kind: ImageKind): string {
  const m = CHAPTER_IMAGE_MODEL.toLowerCase();
  const landscape = kind === "establishing";
  if (m.includes("dall-e")) return landscape ? "1792x1024" : "1024x1792";
  if (m.includes("gpt-image")) return landscape ? "1536x1024" : "1024x1536";
  return "1024x1024";
}

// Ensure the public storage bucket exists. Ignores "already exists".
async function ensureBucket(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<void> {
  const { error } = await db.storage.createBucket(BUCKET, { public: true });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`createBucket failed: ${error.message}`);
  }
}

// One image → PNG bytes. Handles gpt-image-1 (b64) and dall-e (url/b64).
async function generateImageBytes(prompt: string, kind: ImageKind): Promise<Buffer> {
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  const isDalle = /dall-e/i.test(CHAPTER_IMAGE_MODEL);
  const params: Record<string, unknown> = {
    model: CHAPTER_IMAGE_MODEL,
    prompt,
    size: imageSize(kind),
    n: 1,
  };
  if (isDalle) params.response_format = "b64_json";

  const res = (await client.images.generate(params as never)) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const item = res.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const r = await fetch(item.url);
    if (!r.ok) throw new Error(`image fetch ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("no image data returned");
}

async function uploadImage(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  path: string,
  bytes: Buffer,
): Promise<string> {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload failed (${path}): ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface ImageGenResult {
  ok: boolean;
  slug: string;
  model: string;
  images?: { kind: ImageKind; url: string }[];
  error?: string;
}

/**
 * Generate, store, and wire up the chapter's images. Allowlisted + flag-gated.
 * Does NOT generate or modify chapter text.
 */
export async function generateAndStoreChapterImages(slug: string): Promise<ImageGenResult> {
  if (!(await imageGenAllowed(slug))) {
    return { ok: false, slug, model: CHAPTER_IMAGE_MODEL, error: "image generation not allowed for this slug" };
  }
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, slug, model: CHAPTER_IMAGE_MODEL, error: "Supabase not configured" };

  const plans = IMAGE_PLANS[slug];
  // Works on ANY stored row including hidden drafts — images attach before
  // Publish Final in the Selah Studio flow. Never creates a row.
  const row = await getDraftWorkup(slug);
  const workup = row?.workup ?? null;
  if (!workup) {
    return { ok: false, slug, model: CHAPTER_IMAGE_MODEL, error: "no stored chapter row for slug" };
  }

  await ensureBucket(db);

  // Generate + upload each image (sequential — kinder to rate limits).
  const stored: { kind: ImageKind; url: string; plan: ImagePlan }[] = [];
  for (const plan of plans) {
    const bytes = await generateImageBytes(plan.prompt, plan.kind);
    const url = await uploadImage(db, `${slug}/${fileFor(plan.kind)}`, bytes);
    stored.push({ kind: plan.kind, url, plan });
  }

  // Wire the stored images into workup_json.images (status complete).
  const updatedImages = workup.images.map((img) => {
    const hit = stored.find((s) => s.kind === img.kind);
    if (!hit) return img;
    return {
      ...img,
      src: hit.url,
      status: "complete" as const,
      prompt: hit.plan.prompt,
      alt: hit.plan.alt,
      caption: hit.plan.caption,
    };
  });
  await updateChapterWorkupJson(slug, { ...workup, images: updatedImages });

  // Cost event (estimate; image APIs don't return per-call USD).
  await recordCostEvent({
    requestType: "chapter_image_generation",
    provider: "openai",
    model: CHAPTER_IMAGE_MODEL,
    imageCount: plans.length,
    estimatedCostUsd: plans.length * 0.04,
    metadata: { slug, imageTypes: plans.map((p) => p.kind) },
  });

  return { ok: true, slug, model: CHAPTER_IMAGE_MODEL, images: stored.map((s) => ({ kind: s.kind, url: s.url })) };
}

function fileFor(kind: ImageKind): string {
  if (kind === "establishing") return "establishing.png";
  if (kind === "detail") return "detail.png";
  return "human.png";
}
