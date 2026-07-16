// SERVER-ONLY. Chapter image generation → Supabase Storage → workup_json.images.
// Heavily gated and ALLOWLISTED. Never called from a public page load.
// Text generation is NOT touched here.
import type { ChapterWorkup, ImageKind } from "@/lib/types";
import {
  inspectSourceOverlapReview,
  sourceOverlapReviewAccepted,
} from "@/lib/source-overlap-review";
import { getOpenAI, isOpenAIConfigured } from "./openai";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { ChapterMutationError, isChapterMutationError } from "./protected-chapters";
import { recordCostEvent, recordCostEventStrict } from "./cost-events-repository";
import { estimateImageCostUsd } from "../ai/costs";
import { getGenerationSettings, logGenerationAudit } from "./generation-settings";
import { connectedChapterReceiptAppliesIncludingStored } from "./chapter-setup-approvals";
import {
  consumeImageClaim,
  completeImageJob,
  markImageJobTerminalFailure,
  releaseImageJob,
  requireJobStore,
  type ImageJobBinding,
  type JobStorePort,
} from "./generation-jobs";
import {
  assertMarkSprintImagesArePlaceholders,
  deriveMarkSprintImagePlan,
  MARK_8_IMAGE_ESTIMATED_COST_USD,
  MARK_8_IMAGE_MODEL,
  type Mark8ImagePlanItem,
} from "./mark8-image-plan";
import {
  CONNECTED_STUDIO_SLUGS,
  connectedChapterLabel,
  isConnectedStudioSlug,
} from "../studio-mark8-preflight";

// Fallback default only — the ACTIVE model comes from Supabase settings
// (selected_image_model, Studio-controlled). Never silently falls back: the
// selected model is used exactly; if the API rejects it, the run fails loudly.
export const CHAPTER_IMAGE_MODEL = process.env.CHAPTER_IMAGE_MODEL || "gpt-image-1";

export async function activeImageModel(): Promise<string> {
  const s = await getGenerationSettings();
  return s.selected_image_model || CHAPTER_IMAGE_MODEL;
}

// No-cost availability probe (models.retrieve — no image generated). Used by the
// admin console to confirm access BEFORE any generation with a new model.
export async function checkImageModel(model?: string): Promise<{ ok: boolean; model: string; error?: string }> {
  const m = model || (await activeImageModel());
  if (imageModelProbeOverride) return imageModelProbeOverride(m);
  const client = getOpenAI();
  if (!client) return { ok: false, model: m, error: "OpenAI not configured" };
  try {
    await client.models.retrieve(m);
    return { ok: true, model: m };
  } catch (e) {
    return { ok: false, model: m, error: String((e as Error).message).slice(0, 300) };
  }
}

// Slugs with a supported paid-image path. Psalm 23 and Mark 6 keep their
// hand-authored static plans; connected protected chapters (Mark 8, then
// Mark 7) derive their plans from the stored draft.
export const IMAGE_ALLOWED_SLUGS = ["psalm-23", "mark-6", ...CONNECTED_STUDIO_SLUGS];

// TEST SEAM (offline safety gate only): skip env-configured checks and supply
// a synthetic plan so the verify script can drive the REAL image pipeline —
// the settings kill switch and allowlist still apply. Never set in production.
let imageConfigBypassForTesting = false;
let imagePlansOverride: Record<string, ImagePlan[]> | null = null;
let imageRunDeadlineMsOverride: number | null = null;
let imageModelProbeOverride:
  | ((model: string) => Promise<{ ok: boolean; model: string; error?: string }>)
  | null = null;
export function __setImageTestOverrides(overrides: {
  configBypass?: boolean;
  plans?: Record<string, ImagePlan[]> | null;
  runDeadlineMs?: number;
  modelProbe?: (model: string) => Promise<{ ok: boolean; model: string; error?: string }>;
} | null): void {
  imageConfigBypassForTesting = overrides?.configBypass ?? false;
  imagePlansOverride = overrides?.plans ?? null;
  imageRunDeadlineMsOverride =
    overrides?.runDeadlineMs !== undefined &&
    Number.isFinite(overrides.runDeadlineMs) &&
    overrides.runDeadlineMs > 0
      ? overrides.runDeadlineMs
      : null;
  imageModelProbeOverride = overrides?.modelProbe ?? null;
}

function plansFor(slug: string): ImagePlan[] | undefined {
  return imagePlansOverride?.[slug] ?? IMAGE_PLANS[slug];
}

// Routine image control lives in Supabase (generation_settings.image_generation_enabled,
// defaults OFF). Fail-CLOSED. Still requires an IMAGE_PLAN for the slug.
export async function imageGenAllowed(slug: string): Promise<boolean> {
  if (!imageConfigBypassForTesting && (!isOpenAIConfigured() || !isSupabaseConfigured())) return false;
  if (!isConnectedStudioSlug(slug) && !plansFor(slug)) return false;
  const s = await getGenerationSettings();
  return s.image_generation_enabled && s.allowed_slugs.includes(slug);
}

const BUCKET = "chapter-images";

// Netlify gives the background worker 15 minutes. Mark 8 stops all image work
// at 12 minutes, leaving a full three minutes for the existing cost, audit,
// and terminal-state writes. Legacy plans are intentionally unchanged.
export const MARK_8_IMAGE_RUN_DEADLINE_MS = 12 * 60 * 1000;
export const MARK_8_IMAGE_RUN_CLEANUP_RESERVE_MS = 3 * 60 * 1000;

class ImageRunDeadlineError extends Error {
  constructor() {
    super(
      "Mark 8 image run reached its 12-minute safety deadline; stopping before the hosting limit",
    );
    this.name = "ImageRunDeadlineError";
  }
}

interface ImageRunDeadline {
  signal: AbortSignal;
  run<T>(operation: () => Promise<T>): Promise<T>;
  dispose(): void;
}

function createMark8ImageRunDeadline(): ImageRunDeadline {
  const controller = new AbortController();
  const durationMs = imageRunDeadlineMsOverride ?? MARK_8_IMAGE_RUN_DEADLINE_MS;
  const timer = setTimeout(() => controller.abort(), durationMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (controller.signal.aborted) return Promise.reject(new ImageRunDeadlineError());
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          callback();
        };
        const onAbort = () => finish(() => reject(new ImageRunDeadlineError()));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve()
          .then(operation)
          .then(
            (value) => finish(() => resolve(value)),
            (error) => finish(() => reject(error)),
          );
      });
    },
    dispose(): void {
      clearTimeout(timer);
    },
  };
}

function withinImageRunDeadline<T>(
  deadline: ImageRunDeadline | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  return deadline ? deadline.run(operation) : operation();
}

const STYLE =
  " Historical documentary realism, earthy and restrained. Ancient Judean terrain, believable shepherding world, natural light, cinematic but not theatrical, reverent not staged. No halos, no glowing figures or angels, no fantasy effects, no modern objects, no European fantasy Bible-art look, no clean costumes, no text or lettering of any kind.";

interface ImagePlan {
  kind: ImageKind;
  prompt: string;
  alt: string;
  caption: string;
  wide?: boolean; // landscape output (hero-suited); default portrait
}

function dynamicProtectedPlans(
  slug: string,
  workup: ChapterWorkup,
): readonly Mark8ImagePlanItem[] {
  return deriveMarkSprintImagePlan(slug, workup).images;
}

/** Read-only route preflight; claimImageJob re-derives before its atomic write. */
export interface PreparedImageJobBinding extends ImageJobBinding {
  imageCount: number;
}

export async function prepareImageJobBinding(
  store: JobStorePort,
  slug: string,
  approvedSourceOverlapReportDigest?: string,
): Promise<PreparedImageJobBinding | undefined> {
  if (!isConnectedStudioSlug(slug)) return undefined;
  // Protected chapters deliberately use the project-standard model directly.
  // The Studio model setting remains a legacy-plan control and cannot
  // downgrade this run.
  const model = MARK_8_IMAGE_MODEL;
  const row = await store.read(slug);
  if (!row || "error" in row) {
    throw new ChapterMutationError(
      "REFUSED",
      "prepareImageJobBinding",
      slug,
      `stored ${connectedChapterLabel(slug)} draft is unreadable`,
    );
  }
  try {
    const workup = row.workupJson as unknown as ChapterWorkup;
    const copyReview = sourceOverlapReviewAccepted(
      workup,
      approvedSourceOverlapReportDigest,
    );
    if (!copyReview.ok) throw new Error(copyReview.reason);
    const copyInspection = inspectSourceOverlapReview(workup);
    assertMarkSprintImagesArePlaceholders(slug, workup);
    const plan = deriveMarkSprintImagePlan(slug, workup);
    return {
      planDigest: plan.digest,
      model,
      imageCount: plan.images.length,
      ...(copyInspection.kind === "warning"
        ? { sourceOverlapReportDigest: copyInspection.warning.reportDigest }
        : {}),
    };
  } catch (error) {
    throw new ChapterMutationError(
      "REFUSED",
      "prepareImageJobBinding",
      slug,
      String((error as Error).message),
    );
  }
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
async function generateImageBytes(
  model: string,
  plan: ImagePlan,
  signal?: AbortSignal,
): Promise<Buffer> {
  const client = getOpenAI();
  if (!client) throw new Error("OpenAI not configured");
  const isDalle = /dall-e/i.test(model);
  const params: Record<string, unknown> = {
    model,
    prompt: plan.prompt,
    size: imageSize(model, plan),
    n: 1,
  };
  if (model === MARK_8_IMAGE_MODEL) params.quality = "high";
  if (isDalle) params.response_format = "b64_json";

  const res = (await client.images.generate(
    params as never,
    signal ? { signal, maxRetries: 0 } : undefined,
  )) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const item = res.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const r = await fetch(item.url, signal ? { signal } : undefined);
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
export async function generateAndStoreChapterImages(
  slug: string,
  jobId: string,
  binding?: ImageJobBinding,
): Promise<ImageGenResult> {
  const deadline = isConnectedStudioSlug(slug) ? createMark8ImageRunDeadline() : undefined;
  try {
    return await generateAndStoreChapterImagesWithinDeadline(slug, jobId, binding, deadline);
  } finally {
    deadline?.dispose();
  }
}

async function generateAndStoreChapterImagesWithinDeadline(
  slug: string,
  jobId: string,
  binding: ImageJobBinding | undefined,
  deadline: ImageRunDeadline | undefined,
): Promise<ImageGenResult> {
  // Dynamic protected chapters (Mark 8, then Mark 7) derive their paid plan
  // from the stored draft; every other slug keeps the legacy static-plan path.
  const isDynamicMark8 = isConnectedStudioSlug(slug);
  const protectedLabel = isDynamicMark8 ? connectedChapterLabel(slug) : slug;
  const store = requireJobStore(slug, "generateAndStoreChapterImages");
  let model = binding?.model ?? CHAPTER_IMAGE_MODEL;
  let workup: ChapterWorkup | undefined;
  let plans: readonly ImagePlan[] = [];
  let db: NonNullable<ReturnType<typeof getSupabaseAdmin>> | undefined;
  let consumed = false;

  // Every control and plan/model check happens before paid work. A valid
  // queued claim is released if a pre-spend check fails. If atomic consume
  // loses to a duplicate worker, queued-only release cannot cancel the winner.
  try {
    if (!(await withinImageRunDeadline(deadline, () => imageGenAllowed(slug)))) {
      throw new Error("image generation not allowed for this slug");
    }
    model = isDynamicMark8 ? MARK_8_IMAGE_MODEL : await activeImageModel();
    if (isDynamicMark8) {
      if (!binding) throw new Error(`${protectedLabel} image job is missing its exact binding`);
      if (model !== MARK_8_IMAGE_MODEL || binding.model !== MARK_8_IMAGE_MODEL) {
        throw new Error(`${protectedLabel} requires ${MARK_8_IMAGE_MODEL} exactly`);
      }
    }
    db = imageDepsOverride?.db ?? getSupabaseAdmin() ?? undefined;
    if (!db) throw new Error("Supabase not configured");

    // Do not race the atomic queued → running write against the timer: an
    // ambiguous database completion could otherwise strand the claim. The
    // next read/check observes an expired deadline before any paid work.
    workup = await consumeImageClaim(store, slug, jobId, binding);
    consumed = true;

    // Re-read the kill switch/allowlist and selected model after consume,
    // immediately before the storage/model envelope begins.
    if (!(await withinImageRunDeadline(deadline, () => imageGenAllowed(slug)))) {
      throw new Error("image generation was disabled before spend");
    }
    // The owner's setup receipt is recomputed IMMEDIATELY before spend (PR
    // #40 review, blocker 2): a receipt deleted or drifted between the
    // route's pre-claim check and this moment releases the claim unspent.
    if (isDynamicMark8 && !(await connectedChapterReceiptAppliesIncludingStored(slug))) {
      throw new Error(
        `${protectedLabel} owner setup receipt is missing or changed — refused before spend`,
      );
    }
    const recheckedModel = isDynamicMark8 ? MARK_8_IMAGE_MODEL : await activeImageModel();
    if (recheckedModel !== model) throw new Error("selected image model changed before spend");

    if (isDynamicMark8) {
      const derived = deriveMarkSprintImagePlan(slug, workup);
      if (derived.digest !== binding!.planDigest || model !== binding!.model) {
        throw new Error(`stored ${protectedLabel} image plan or model changed before spend`);
      }
      plans = dynamicProtectedPlans(slug, workup);
    } else {
      const staticPlans = plansFor(slug);
      if (!staticPlans) throw new Error("approved static image plan is missing");
      plans = staticPlans;
    }
  } catch (error) {
    const msg = isChapterMutationError(error)
      ? `${error.code}: ${error.message}`
      : String((error as Error).message);
    const released = await releaseImageJob(
      store,
      slug,
      jobId,
      consumed ? "running" : "queued",
    );
    console.error(`[selah] image pre-spend refusal for ${slug}: ${msg}`);
    await logGenerationAudit({
      action: "image_run_refused",
      slug,
      model,
      status: "failed",
      message: `${msg} (no spend occurred; ${released ? "claim released" : "claim not released or owned by another worker"})`.slice(0, 300),
    });
    return { ok: false, slug, model, error: msg };
  }

  const exactWorkup = workup!;
  const exactDb = db!;
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
  let startedCount = 0;
  try {
    await withinImageRunDeadline(deadline, () => ensureBucket(exactDb));
    for (const plan of plans) {
      if (isDynamicMark8) startedCount += 1;
      const bytes = await withinImageRunDeadline(deadline, () =>
        generate(model, plan, deadline?.signal),
      );
      generatedCount += 1; // model spend happened even if the upload below fails
      const url = await withinImageRunDeadline(deadline, () =>
        uploadImage(exactDb, `${slug}/${jobId}/${fileFor(plan.kind)}`, bytes),
      );
      stored.push({ kind: plan.kind, url, plan });
    }
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 200);
    const deadlineExceeded = e instanceof ImageRunDeadlineError;
    // A request aborted at the deadline may still be billed even though no
    // image response arrived. Record that one in-flight request as POSSIBLE
    // spend, but keep `generated` truthful and never call it a completed image.
    const possibleSpendCount = deadlineExceeded
      ? Math.max(generatedCount, startedCount)
      : generatedCount;
    const billingUncertain = possibleSpendCount > generatedCount;
    if (isDynamicMark8 && possibleSpendCount > 0) {
      let costRecorded = false;
      try {
        await recordCostEventStrict({
          requestType: "chapter_image_generation",
          provider: "openai",
          model,
          imageCount: possibleSpendCount,
          estimatedCostUsd: possibleSpendCount * MARK_8_IMAGE_ESTIMATED_COST_USD,
          imageQuality: "high",
          metadata: {
            slug,
            jobId,
            planDigest: binding!.planDigest,
            failed: true,
            error: msg,
            generated: generatedCount,
            requestsStarted: startedCount,
            possibleSpendCount,
            billingUncertain,
            deadlineExceeded,
            uploaded: stored.length,
            completedKinds: stored.map((x) => x.kind),
          },
        });
        costRecorded = true;
      } catch {
        // A paid run without a durable cost row must stay locked and visible.
      }
      const terminal = await markImageJobTerminalFailure(
        store,
        slug,
        jobId,
        costRecorded ? "failed" : "blocked",
        possibleSpendCount,
        costRecorded
          ? deadlineExceeded
            ? "image_run_deadline"
            : "image_run_failed"
          : "cost_record_failed",
        binding,
      );
      await logGenerationAudit({
        action: costRecorded ? "image_run_failed" : "image_run_blocked",
        slug,
        model,
        status: "failed",
        message:
          `${billingUncertain
            ? `deadline after ${generatedCount} completed image(s); ${possibleSpendCount} request(s) may be billed`
            : `generated ${generatedCount}/${plans.length}, uploaded ${stored.length}`}: ${msg}; ` +
          `${costRecorded ? "spend recorded" : "COST NOT RECORDED"}; ` +
          `${terminal ? "job locked" : "job lock write failed — manual inspection required"}; ` +
          `orphaned dir: ${slug}/${jobId}/`,
      });
      return {
        ok: false,
        slug,
        model,
        error: costRecorded
          ? billingUncertain
            ? `image run stopped at its safety deadline after ${generatedCount}/${plans.length} completed images; one in-flight request may be billed and retry requires owner confirmation`
            : `image run failed after ${generatedCount}/${plans.length} images; spend recorded and retry requires owner confirmation`
          : "image run blocked after spend because its cost could not be recorded",
      };
    }
    if (generatedCount > 0) {
      await recordCostEvent({
        requestType: "chapter_image_generation",
        provider: "openai",
        model,
        imageCount: generatedCount,
        estimatedCostUsd: estimateImageCostUsd(model, generatedCount),
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
    const released = await releaseImageJob(store, slug, jobId, "running");
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

  // Mark 8 replaces its exact stored placeholder array in exact order. Legacy
  // static plans keep their existing replace/append behavior unchanged.
  const updatedImages = isDynamicMark8
    ? exactWorkup.images.map((image, index) => ({
        ...image,
        src: stored[index].url,
        status: "complete" as const,
        prompt: stored[index].plan.prompt,
        alt: stored[index].plan.alt,
        caption: stored[index].plan.caption,
      }))
    : exactWorkup.images.map((img) => {
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
  if (!isDynamicMark8) {
    const existingKinds = new Set(exactWorkup.images.map((i) => i.kind));
    let nextIndex = exactWorkup.images.length;
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
  }

  // Mark 8 never claims success unless the paid spend has a durable cost row.
  if (isDynamicMark8) {
    try {
      await recordCostEventStrict({
        requestType: "chapter_image_generation",
        provider: "openai",
        model,
        imageCount: generatedCount,
        estimatedCostUsd: generatedCount * MARK_8_IMAGE_ESTIMATED_COST_USD,
        imageQuality: "high",
        metadata: {
          slug,
          jobId,
          planDigest: binding!.planDigest,
          imageTypes: plans.map((plan) => plan.kind),
        },
      });
    } catch {
      const terminal = await markImageJobTerminalFailure(
        store,
        slug,
        jobId,
        "blocked",
        generatedCount,
        "cost_record_failed",
        binding,
      );
      await logGenerationAudit({
        action: "image_run_blocked",
        slug,
        model,
        status: "failed",
        message:
          `all ${generatedCount} images generated but COST NOT RECORDED; ` +
          `${terminal ? "job locked" : "job lock write failed — manual inspection required"}; ` +
          `orphaned dir: ${slug}/${jobId}/`,
      });
      return { ok: false, slug, model, error: "image run blocked because its cost could not be recorded" };
    }
  }
  try {
    // Terminal write pinned to THIS job id: a superseded/stale run is a typed
    // CONFLICT and the uploaded bytes stay isolated in the job directory.
    await completeImageJob(store, slug, jobId, { ...exactWorkup, images: updatedImages });
  } catch (e) {
    const msg = isChapterMutationError(e) ? `${e.code}: ${e.message}` : String((e as Error).message);
    console.error(`[selah] image run for ${slug} not applied — ${msg}`);
    // Mark 8's spend was strictly recorded before this terminal write. Legacy
    // behavior records its conflicted spend here as before.
    if (!isDynamicMark8) {
      await recordCostEvent({
        requestType: "chapter_image_generation",
        provider: "openai",
        model,
        imageCount: generatedCount,
        estimatedCostUsd: estimateImageCostUsd(model, generatedCount),
        metadata: { slug, jobId, conflict: true, error: msg, generated: generatedCount, uploaded: stored.length },
      });
    } else {
      await markImageJobTerminalFailure(
        store,
        slug,
        jobId,
        "failed",
        generatedCount,
        "completion_conflict",
        binding,
      );
    }
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

  // Legacy plans retain their original best-effort post-success cost event.
  if (!isDynamicMark8) {
    await recordCostEvent({
      requestType: "chapter_image_generation",
      provider: "openai",
      model,
      imageCount: generatedCount,
      estimatedCostUsd: estimateImageCostUsd(model, generatedCount),
      metadata: { slug, jobId, imageTypes: plans.map((p) => p.kind) },
    });
  }

  return { ok: true, slug, model, images: stored.map((s) => ({ kind: s.kind, url: s.url })) };
}

// Storage filename per image kind. Classic kinds keep their legacy names
// (psalm-23 paths unchanged); chapter-driven kinds map to "<kind>.png".
function fileFor(kind: ImageKind): string {
  return `${String(kind).toLowerCase().replace(/[^a-z0-9-]/g, "-")}.png`;
}
