# Selah — Current State

> Orientation doc for any Claude / ChatGPT session. Read this first, then
> `studio-workflow.md` for how chapters get made. Keep this file updated at
> every milestone (publish, system change, model change).

_Last updated: 2026-07-06 (build r78, after Mark 6 publish)._

## What Selah is

A daily Bible chapter app with one goal: **help people grow closer to Jesus
through Scripture.** Tagline: *Pause. Reflect. Elevate.* Principle:
**"Generate once. Save forever. Personalize only when needed."**

- Live site: https://selahlearn.netlify.app
- Repo: https://github.com/jasonh80/selah (branch `main` auto-deploys via Netlify)
- Stack: Next.js 14 App Router + Tailwind + TypeScript · Supabase (content, rules,
  settings, storage) · OpenAI (text + images) · ESV API (scripture) · Esri (maps)
- No local Node on the owner's Mac — all builds happen on Netlify via git push.

## Live chapters

| Chapter | Status | Notes |
|---|---|---|
| **Psalm 23** | Published | Original showcase chapter. 3-image set (gpt-image-1). Do not regenerate. |
| **Mark 6** | Published (2026-07-03) | **First chapter through the full Selah Brain + Selah Studio pipeline.** v6 copy (gpt-5.5), five-image set (gpt-image-2), FAQ, verse notes, Galilee map. The quality benchmark. |

All other `/chapter/*` slugs 404 publicly. Drafts stay hidden until Publish Final.

## Generation state — CHECK BEFORE ASSUMING

- **Text Generation: OFF** (kill switch in Supabase `generation_settings`)
- **Image Generation: OFF** (separate kill switch, same table)
- **NEVER generate, regenerate, or publish anything without the owner's
  explicit approval in that conversation.** Public page loads never trigger
  generation (fail-closed by design).

## Models (set in Selah Studio → Advanced Settings, stored in Supabase)

- **Publish-quality authorship: `gpt-5.5`** — use `reasoning_effort: "low"`
  (it rejects `"minimal"`); ~160s/run; ~$0.11. Produced the Mark 6 v6 voice.
  `gpt-4o` is kept as the idle default but could NOT match the Daily-Rundown
  voice (proven across v2–v5) — don't iterate voice on it.
- **Images: `gpt-image-2`** — access confirmed. `checkImageModel` probes
  availability before every run; **no silent fallback** to gpt-image-1.

## Selah Brain (the quality system)

- **Rules live in Supabase** (`selah_brain_rules`, ~96 active; v1.4 library also
  in repo at `lib/server/selah-brain-library.v1_1.json` — Supabase is the live
  source of truth; the JSON is the seed).
- Layers: core (always-on) · contextual (max 12, selected by genre/stage) ·
  qa (review only) · governance (never in prose prompts).
- **Approved examples** (`selah_approved_examples`): the Mark 6 Daily Rundown is
  the gold-standard *voice* exemplar for gospel narrative; an image-direction
  example exists for the feeding scene. 1–2 examples retrieved per generation.
- Chapter review notes (`chapter_review_notes`) re-apply when that chapter regenerates.
- Managed in Selah Studio → Advanced Settings ("What Selah Has Learned",
  "Approved Examples").

## Mark 6 lessons learned (apply to future chapters)

1. **Voice = example + rules + strong model.** Rules alone barely moved prose;
   the voice example + gpt-5.5 produced the leap. Author publish-quality copy on
   gpt-5.5 in ONE shot; don't ladder through cheap drafts.
2. **Snapshot before every regeneration or image run.** Versioning saved us
   repeatedly (Mark 6 archive spans v1–v9).
3. **Chapter-driven images beat rigid buckets.** 5 people-first scenes for
   narrative chapters; 3 for simple ones. The hero should be a people scene.
4. **Scriptural physical details override style prompts** (Mark 6:39 "green
   grass" — check stated details when reviewing image prompts).
5. **Completion is config, not regeneration.** FAQ, verse notes, maps were added
   as slug-keyed config without touching approved copy.
6. **Fail-closed everything.** No accidental spend occurred in the entire build.

## Known gaps / not built yet (do not add unless asked)

- Verse notes, FAQ, image plans, and maps are **hand-authored per chapter in
  code** (see workflow doc) — not yet generated/stored via Studio.
- No auth, no personalization, no payments, no live "Ask Selah" tool,
  no Street View ("Standing There" shows a roadmap placeholder by design).
- Budget limit field in settings is stored but **not enforced**.

## Next up

- **Likely next chapter: Exodus 29** (priestly consecration). Scene-check
  accuracy notes already exist in `lib/content/chapter-content.ts`. Genre
  profile: tabernacle/priesthood. Requires explicit owner approval to start.

## Cost reference (Mark 6 actuals, logged estimates)

~$0.75 total: ~5 gpt-4o drafts (~$0.30) + one gpt-5.5 draft ($0.11) + 3
gpt-image-1 (~$0.12) + 5 gpt-image-2 (~$0.20 at placeholder rate; real
gpt-image-2 pricing may be higher — check the OpenAI dashboard).
