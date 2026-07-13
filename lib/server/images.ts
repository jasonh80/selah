// SERVER-ONLY. Chapter image generation → Supabase Storage → workup_json.images.
// Heavily gated and ALLOWLISTED. Never called from a public page load.
// Text generation is NOT touched here.
import type { ChapterWorkup, ImageKind } from "@/lib/types";
import { getOpenAI, isOpenAIConfigured } from "./openai";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { isChapterMutationError } from "./protected-chapters";
import { recordCostEvent } from "./cost-events-repository";
import { getGenerationSettings, logGenerationAudit } from "./generation-settings";
import {
  consumeImageClaim,
  completeImageJob,
  releaseImageJob,
  requireJobStore,
} from "./generation-jobs";

// Fallback default only — the ACTIVE model comes from Supabase settings
// (selected_image_model, Studio-controlled). Never silently falls back: the
// selected model is used exactly; if the API rejects it, the run fails loudly.
export const CHAPTER_IMAGE_MODEL = process.env.CHAPTER_IMAGE_MODEL || "gpt-image-1";

async function activeImageModel(): Promise<string> {
  const s = await getGenerationSettings();
  return s.selected_image_model || CHAPTER_IMAGE_MODEL;
}

// No-cost availability probe (models.retrieve — no image generated). Used by the
// admin console to confirm access BEFORE any generation with a new model.
export async function checkImageModel(model?: string): Promise<{ ok: boolean; model: string; error?: string }> {
  const m = model || (await activeImageModel());
  const client = getOpenAI();
  if (!client) return { ok: false, model: m, error: "OpenAI not configured" };
  try {
    await client.models.retrieve(m);
    return { ok: true, model: m };
  } catch (e) {
    return { ok: false, model: m, error: String((e as Error).message).slice(0, 300) };
  }
}

// Slugs that have a hand-authored IMAGE_PLAN. (Generated chapters' image prompts
// will come from their workup later; for now image gen needs a plan here.)
export const IMAGE_ALLOWED_SLUGS = ["psalm-23", "mark-6"];

// TEST SEAM (offline safety gate only): skip env-configured checks and supply
// a synthetic plan so the verify script can drive the REAL image pipeline —
// the settings kill switch and allowlist still apply. Never set in production.
let imageConfigBypassForTesting = false;
let imagePlansOverride: Record<string, ImagePlan[]> | null = null;
export function __setImageTestOverrides(overrides: {
  configBypass?: boolean;
  plans?: Record<string, ImagePlan[]> | null;
} | null): void {
  imageConfigBypassForTesting = overrides?.configBypass ?? false;
  imagePlansOverride = overrides?.plans ?? null;
}

function plansFor(slug: string): ImagePlan[] | undefined {
  return imagePlansOverride?.[slug] ?? IMAGE_PLANS[slug];
}

// Routine image control lives in Supabase (generation_settings.image_generation_enabled,
// defaults OFF). Fail-CLOSED. Still requires an IMAGE_PLAN for the slug.
export async function imageGenAllowed(slug: string): Promise<boolean> {
  if (!imageConfigBypassForTesting && (!isOpenAIConfigured() || !isSupabaseConfigured())) return false;
  if (!plansFor(slug)) return false;
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
  wide?: boolean; // landscape output (hero-suited); default portrait
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

  // Approved Mark 6 FIVE-image plan (chapter-driven roles — see CHAPTER_IMAGE_PLAN
  // for the concept descriptions). Prompts carry their own documentary style +
  // negative guardrails; the Judean STYLE suffix is intentionally NOT appended.
  // Distinct kinds/filenames — does NOT overwrite the earlier establishing/
  // detail/human files.
  "mark-6": [
    {
      kind: "nazareth",
      wide: true,
      caption: "Nazareth: Familiar Faces, Closed Hearts",
      alt: "Jesus teaching in a modest stone synagogue in Nazareth while familiar townspeople react with skepticism and offense.",
      prompt:
        "Photorealistic historical scene inside a modest first-century village synagogue in Nazareth, around AD 29. Jesus, an ordinary Galilean Jewish man in simple worn wool, stands teaching before a room of townspeople who have known Him since childhood. Their faces show skepticism, discomfort, and quiet offense — crossed arms, sideways glances, murmuring neighbors. Small stone room, plastered walls, simple benches, oil-lamp and window light, dust in the air. True photorealism, documentary realism, natural light, believable Middle Eastern faces, worn fabrics. No halos, no glow, no text or lettering, no modern objects, no stained glass, no pews, no church architecture, no theatrical posing.",
    },
    {
      kind: "sending",
      caption: "Sent Out Two by Two",
      alt: "Two disciples with staffs and sandals on a dusty Galilean road, dressed simply, setting out with serious faces.",
      prompt:
        "Photorealistic historical scene of two first-century Jewish disciples being sent out on mission in Galilee, around AD 29: standing on a dusty village road with simple wooden staffs, leather sandals, single travel-worn tunics and cloaks, no bags, no provisions. Serious, resolved faces — ordinary working men, not heroes. Behind them, other pairs set out toward different villages, and Jesus sees them off at a distance. Dry hills and village houses beyond. True photorealism, documentary realism, natural morning light, dusty feet, worn textures. No halos, no glow, no text, no modern objects, no staged posing.",
    },
    {
      kind: "herods-feast",
      wide: true,
      caption: "Herod's Feast: Power Without Courage",
      alt: "Herod's tense banquet hall — wealthy guests reclining at a lavish table, opulence with unease beneath it.",
      prompt:
        "Photorealistic historical scene of Herod Antipas's birthday banquet in a first-century Galilean palace hall: nobles, military commanders, and leading men reclining at low tables heavy with food and wine, oil lamps and torchlight, rich fabrics, gold vessels. The atmosphere is tense and morally uneasy rather than festive — Herod on his couch looks troubled and cornered, guests watch him, whispers at the edges. Serious and unsettling, not sensational; no gore, no severed head shown, nothing lurid. True photorealism, documentary realism, warm low torchlight and deep shadows, believable Middle Eastern and Roman-era faces. No halos, no text, no modern objects, no cartoon villainy, no theatrical posing.",
    },
    {
      kind: "feeding",
      wide: true,
      caption: "The Feeding of the 5,000",
      alt: "Jesus and the disciples among a vast crowd of men, women, and children seated on green spring grass by the Sea of Galilee as baskets move through the crowd.",
      prompt:
        "Photorealistic historical scene from Mark 6, the feeding of the 5,000, on a remote hillside of GREEN SPRING GRASS above the Sea of Galilee, around AD 29 near Passover season. A massive crowd of ordinary first-century Jewish villagers — 5,000 men counted, with women and children clearly present — seated and reclining in loose, uneven family groups on the green grass. Jesus, an ordinary Galilean Jewish man in worn earth-toned clothing, not glowing, not idealized, naturally placed among the people, breaks rough barley flatbreads; disciples move through the crowd with simple woven baskets of small barley loaves and small dried fish. Woven wool and linen garments, leather sandals, dusty feet, sun-worn faces, wind, cloaks spread on the grass, the lake visible beyond. True photorealism, anamorphic 35mm film still, late-afternoon directional light, warm rim light. No halos, no text, no modern objects, no Europeanized faces, no oversized bakery bread, no movie-poster posing.",
    },
    {
      kind: "walking-water",
      wide: true,
      caption: "Walking on the Water: Do Not Miss Who He Is",
      alt: "Disciples strain at the oars of a low wooden boat in wind and waves at night as Jesus approaches across the dark water.",
      prompt:
        "Photorealistic historical night scene on the Sea of Galilee, fourth watch of the night: a low first-century wooden fishing boat with exhausted disciples straining at the oars against wind and rough waves, cloaks soaked, faces fearful. Approaching across the dark water is Jesus, an ordinary Galilean Jewish man in worn robes, walking on the sea — mysterious and quietly powerful, seen through wind and spray, NOT glowing, no halo, no supernatural light effects; the awe comes from the impossibility itself. Moonlit clouds, deep blues and shadows, realistic water, wind-blown fabric. Fearful, mysterious, revealing — not fantasy. True photorealism, documentary realism. No halos, no glow, no lightning, no text, no modern objects, no fantasy effects, no theatrical posing.",
    },
  ],
};

function imageSize(model: string, plan: ImagePlan): string {
  const m = model.toLowerCase();
  const landscape = plan.wide ?? plan.kind === "establishing";
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

// One image → PNG bytes. Handles gpt-image models (b64) and dall-e (url/b64).
// Uses EXACTLY the given model — no fallback; unknown models fail loudly.
async function generateImageBytes(model: string, plan: ImagePlan): Promise<Buffer> {
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  const isDalle = /dall-e/i.test(model);
  const params: Record<string, unknown> = {
    model,
    prompt: plan.prompt,
    size: imageSize(model, plan),
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
    .upload(path, bytes, { contentType: "image/png", upsert: false });
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

// TEST SEAM (offline safety gate only): replaces storage + the paid image call
// so the verify script can drive the REAL worker pipeline — bucket failures,
// upload failures, conflicts — with zero network and zero spend.
interface ImageRuntimeDeps {
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  generateBytes: typeof generateImageBytes;
}
let imageDepsOverride: Partial<ImageRuntimeDeps> | null = null;
export function __setImageDepsForTesting(deps: Partial<ImageRuntimeDeps> | null): void {
  imageDepsOverride = deps;
}

/**
 * Generate, store, and wire up the chapter's images for an ALREADY-CLAIMED
 * image job. The ROUTE probed the model and took the atomic claim; this
 * worker-side flow atomically CONSUMES it (queued → running) before any
 * spend. Allowlisted + flag-gated. Does NOT generate or modify chapter text.
 */
export async function generateAndStoreChapterImages(slug: string, jobId: string): Promise<ImageGenResult> {
  const model = await activeImageModel();
  if (!(await imageGenAllowed(slug))) {
    return { ok: false, slug, model, error: "image generation not allowed for this slug" };
  }
  const db = imageDepsOverride?.db ?? getSupabaseAdmin();
  if (!db) return { ok: false, slug, model, error: "Supabase not configured" };

  // ATOMIC CONSUMPTION of the route's single-use claim: queued → running,
  // pinned to this exact job id and the row revision. A duplicated delivery
  // loses here with zero rows changed — BEFORE any model spend. Protected
  // slugs and null revisions are refused inside the helper.
  const store = requireJobStore(slug, "generateAndStoreChapterImages");
  let workup: ChapterWorkup;
  try {
    workup = await consumeImageClaim(store, slug, jobId);
  } catch (e) {
    const msg = isChapterMutationError(e) ? `${e.code}: ${e.message}` : String((e as Error).message);
    console.error(`[selah] image claim consumption failed for ${slug}: ${msg}`);
    await logGenerationAudit({ action: "image_run_refused", slug, model, status: "failed", message: `${msg} (no spend occurred)`.slice(0, 300) });
    return { ok: false, slug, model, error: msg };
  }
  if (!Array.isArray(workup.images)) {
    const released = await releaseImageJob(store, slug, jobId);
    await logGenerationAudit({
      action: "image_run_refused",
      slug,
      model,
      status: "failed",
      message: `stored row has no renderable workup${released ? "" : " (claim NOT released — manual cleanup needed)"}`,
    });
    return { ok: false, slug, model, error: "no stored chapter workup for slug" };
  }

  const plans = plansFor(slug)!; // imageGenAllowed already required a plan
  const generate = imageDepsOverride?.generateBytes ?? generateImageBytes;

  // Generate + upload each image (sequential — kinder to rate limits).
  // Every run writes to its OWN immutable directory named by the job id (never
  // upsert, never a stable path): a stale/concurrent run cannot overwrite
  // published bytes at any point.
  //
  // The ENTIRE spend envelope — bucket setup, generation, upload — is inside
  // one try/catch that (a) counts GENERATED images as spend even when their
  // upload failed, (b) durably audits, and (c) releases the claim for retry.
  const stored: { kind: ImageKind; url: string; plan: ImagePlan }[] = [];
  let generatedCount = 0;
  try {
    await ensureBucket(db);
    for (const plan of plans) {
      const bytes = await generate(model, plan);
      generatedCount += 1; // model spend happened even if the upload below fails
      const url = await uploadImage(db, `${slug}/${jobId}/${fileFor(plan.kind)}`, bytes);
      stored.push({ kind: plan.kind, url, plan });
    }
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 200);
    if (generatedCount > 0) {
      await recordCostEvent({
        requestType: "chapter_image_generation",
        provider: "openai",
        model,
        imageCount: generatedCount,
        estimatedCostUsd: generatedCount * 0.04,
        metadata: {
          slug,
          jobId,
          failed: true,
          error: msg,
          generated: generatedCount,
          uploaded: stored.length,
          completedKinds: stored.map((x) => x.kind),
        },
      });
    }
    const released = await releaseImageJob(store, slug, jobId);
    await logGenerationAudit({
      action: "image_run_failed",
      slug,
      model,
      status: "failed",
      message:
        `generated ${generatedCount}/${plans.length}, uploaded ${stored.length} before error: ${msg}; ` +
        `orphaned dir: ${slug}/${jobId}/${released ? "" : "; claim NOT released — manual cleanup needed"}`,
    });
    return { ok: false, slug, model, error: `image run failed after ${generatedCount}/${plans.length} images: ${msg}` };
  }

  // Wire stored images into workup_json.images: replace matching kinds, APPEND
  // new kinds (supports 3- or 5-image chapter-driven plans; earlier images with
  // other kinds are left in place, never overwritten here).
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
  const existingKinds = new Set(workup.images.map((i) => i.kind));
  let nextIndex = workup.images.length;
  for (const s of stored) {
    if (existingKinds.has(s.kind)) continue;
    nextIndex += 1;
    updatedImages.push({
      kind: s.kind,
      index: nextIndex,
      label: s.plan.caption,
      prompt: s.plan.prompt,
      caption: s.plan.caption,
      src: s.url,
      alt: s.plan.alt,
      status: "complete" as const,
    });
  }
  try {
    // Terminal write pinned to THIS job id: a superseded/stale run is a typed
    // CONFLICT and the uploaded bytes stay isolated in the job directory.
    await completeImageJob(store, slug, jobId, { ...workup, images: updatedImages });
  } catch (e) {
    const msg = isChapterMutationError(e) ? `${e.code}: ${e.message}` : String((e as Error).message);
    console.error(`[selah] image run for ${slug} not applied — ${msg}`);
    // The spend already happened even though the result can't be applied —
    // record it as a real cost event, not just an audit line.
    await recordCostEvent({
      requestType: "chapter_image_generation",
      provider: "openai",
      model,
      imageCount: generatedCount,
      estimatedCostUsd: generatedCount * 0.04,
      metadata: { slug, jobId, conflict: true, error: msg, generated: generatedCount, uploaded: stored.length },
    });
    await logGenerationAudit({
      action: "image_run_conflict",
      slug,
      model,
      status: "failed",
      message: `run not applied (${msg}); ${stored.length} orphaned files under ${slug}/${jobId}/`,
    });
    return { ok: false, slug, model, error: `image run not applied — ${msg}` };
  }
  await logGenerationAudit({
    action: "image_run_succeeded",
    slug,
    model,
    status: "succeeded",
    message: `stored ${stored.length} images under ${slug}/${jobId}/`,
  });

  // Cost event (estimate scales with image count; APIs don't return per-call USD).
  await recordCostEvent({
    requestType: "chapter_image_generation",
    provider: "openai",
    model,
    imageCount: generatedCount,
    estimatedCostUsd: generatedCount * 0.04,
    metadata: { slug, jobId, imageTypes: plans.map((p) => p.kind) },
  });

  return { ok: true, slug, model, images: stored.map((s) => ({ kind: s.kind, url: s.url })) };
}

// Storage filename per image kind. Classic kinds keep their legacy names
// (psalm-23 paths unchanged); chapter-driven kinds map to "<kind>.png".
function fileFor(kind: ImageKind): string {
  return `${String(kind).toLowerCase().replace(/[^a-z0-9-]/g, "-")}.png`;
}
