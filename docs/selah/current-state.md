# Selah — Current State

> Orientation doc for any Claude / ChatGPT session. Read this first, then
> `studio-workflow.md` for how chapters get made. Keep this file updated at
> every milestone (publish, system change, model change).

_Last updated: 2026-07-18 (visible build stamp r101 — later merges deploy
without bumping the stamp, so verify deploys by behavior, not stamp; Mark
7–10 are published; Mark 11+ remain fail-closed)._

## What Selah is

A daily Bible chapter app with one goal: **help people grow closer to Jesus
through Scripture.** Tagline: *Pause. Reflect. Elevate.* Principle:
**"Generate once. Save forever. Personalize only when needed."**

- Live site: https://selahlearn.netlify.app
- Repo: https://github.com/jasonh80/selah (branch `main` auto-deploys via Netlify)
- Stack: Next.js 14 App Router + Tailwind + TypeScript · Supabase (content, rules,
  settings, storage) · OpenAI (text + images) · ESV API (scripture) · Esri (maps)
- The owner's Mac uses Node 24. This launch branch moves Netlify builds to
  supported Node 24; production changes only after an owner-approved merge.

## Live chapters

| Chapter | Status | Notes |
|---|---|---|
| **Psalm 23** | Published | Original showcase chapter. 3-image set (gpt-image-1). Do not regenerate. |
| **Mark 6** | Published (2026-07-03) | **First chapter through the full Selah Brain + Selah Studio pipeline.** v6 copy (gpt-5.5), five-image set (gpt-image-2), FAQ, verse notes, Galilee map. The quality benchmark. |
| **Mark 8** | Published (2026-07-14) | First protected-sprint chapter (fail-closed manifest v3, owner receipts, per-run confirmation). gpt-5.5 copy, 3-image gpt-image-2 set. Took ten runs; the root causes were fixed the same day (PRs #18–#28). |
| **Mark 7** | Published (2026-07-15) | Second protected chapter — **first-try success on both runs** via preload receipts + movement boundaries (PRs #32/#34). Real MapLibre map since r100. |
| **Mark 9** | Published (2026-07-17) | First chapter prepared ON-SCREEN (digest-bound stored approval, PR #40 flow). First-try runs. Real MapLibre map. |
| **Mark 10** | Published (2026-07-18) | **First-try launch driven end-to-end under owner-delegated Studio control**, incl. the FIRST single-image redo (one candidate, $0.17, swapped with rollback snapshot). Landscape 3:2 images. No map config yet. |

All other `/chapter/*` slugs 404 publicly; alias forms (`mark-09`) fail
closed at publish and public read. Drafts stay hidden until Publish Final.
`/today` serves the NEWEST PUBLISHED chapter (Exodus 27 is the guaranteed
fallback) since r101.

## Generation state — CHECK BEFORE ASSUMING

- **Last owner-observed (2026-07-15, during the Mark 7 launch): Text
  Generation ON and Image Generation ON** (kill switches in Supabase
  `generation_settings`). **Verify in Studio before relying on this status**
  — this document cannot track the live switches.
- **NEVER generate, regenerate, or publish anything without the owner's
  explicit approval in that conversation.** Public page loads never trigger
  generation (fail-closed by design).

## Models (set in Selah Studio → Advanced Settings, stored in Supabase)

- **Publish-quality authorship: `gpt-5.5`** — use `reasoning_effort: "low"`
  (it rejects `"minimal"`); ~160s/run; ~$0.11. Produced the Mark 6 v6 voice.
  `gpt-4o` is kept as the idle default but could NOT match the Daily-Rundown
  voice (proven across v2–v5) — don't iterate voice on it.
  **Check the live selection in Studio**: the info panel showed `gpt-4o`
  selected during the 2026-07-18 Mark 10 launch — the selected model is a
  Studio setting, not this doc.
- **Images: `gpt-image-2`** — access confirmed. `checkImageModel` probes
  availability before every run; **no silent fallback** to gpt-image-1.

## Selah Brain (the quality system)

- **Rules live in Supabase** (`selah_brain_rules`). The owner-approved **v1.9
  library (99 rules) is the live, verified state**: it was seeded through the
  receipted Mark 8 Studio setup (2026-07-13) and re-verified by the Mark 7
  setup's exact post-write readback (2026-07-15) — both setups fail closed
  unless the live rules match the version-controlled artifact exactly. The
  recorded approval binds the owner, timestamp, review evidence, version, and
  exact content digest. `npm run build` runs the Brain verifier first.
  Supabase remains the live source of truth: a merged JSON change is not
  active until the owner separately approves seeding and a post-seed readback
  proves the live IDs, wording, stages, and provenance.
- Layers: core (always-on) · contextual (max 12 for copy and 18 for image
  stages, selected by genre/stage) ·
  qa (review only) · governance (never in prose prompts).
- The v1.9 candidate includes the recent-chat audit plus fresh-language
  abstraction: it adds humble fellow-learner voice, prevents visual
  details from smuggling unsupported claims, and makes text/inference/safety
  rules eligible for image stages. It also teaches useful surrounding-chapter
  book flow without conflating it with whole-Bible synthesis. Image-stage Brain
  retrieval is still not wired into production; metadata alone does not govern
  a generated image.
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
- Ordinary generation still treats some missing context as soft failures. The
  protected pipeline — now covering **Mark 7 and Mark 8** — fails closed on
  exact Brain rules, chapter notes, exemplar, source evidence, per-chapter
  owner receipts (checked BEFORE any settings write or job claim), manifest
  approval, and per-run owner authorization. Mark 9–11 remain disconnected
  and blocked at setup, generation, publish, and public read (aliases too).
- The Mark 8–11 guidance packet is versioned in
  `lib/server/mark-sprint-guidance.v1.json`. Its exact Mark 8 projection and ten
  notes are owner-approved for private Studio setup; Mark 9–11 remain
  review-only. The owner selected the official ESV API as the
  prompt-time analysis source on 2026-07-12; OEB is not used. The published
  terms do not explicitly address third-party model analysis, and the owner's
  decision accepts that uncertainty for this noncommercial ministry use without
  claiming a special Crossway license. The protected contract requires the
  primary ESV chapter plus one adjacent ESV chapter on each side, each and the
  ordered bundle digest-bound without storing text in the repo, manifest, logs,
  or workup. See `docs/selah/scripture-source-policy.md`.
- Generation Manifest v2 remains frozen historical groundwork. Manifest v3 now
  binds the richer protected ESV response evidence for the protected
  chapters (Mark 7 and Mark 8),
  exact frozen OpenAI Chat Completions request (`store: false`), Brain rules,
  chapter notes, exemplar, source-overlap result, and owner-approved manifest
  digest without persisting private text. V3 capabilities are process-local
  evidence, not run authorization; the authenticated worker also requires the
  exact owner-confirmed manifest and a single-use job. It is not connected for
  Mark 9–11; see `docs/selah/generation-manifest.md`.
- The protected ESV source assembler and overlap gate are synthetic-tested and
  connected only to the authenticated protected worker (Mark 7 and Mark 8).
  They validate the ESV's omitted disputed verse numbers in these Mark windows,
  reject partial/oversized/mismatched responses, retain cancellation through
  body reads, keep source text non-enumerable, and block copied wording hidden
  within or across JSON fields. Ordinary Mark 8–11 generation refuses before it
  can bypass the protected path; Mark 9–11 remain blocked.
- The `mark-sprint-copy-review-v1.0` authoring contract verifies the
  Mark 8–11 structural floor (full passage movements, FAQ, content modules,
  placeholder image shape, and no embedded verse array). It runs inside the
  protected Mark 7/Mark 8 draft pipeline but does not prove semantic accuracy, rendered
  map/image completion, or owner approval. Those remain fail-closed manifest,
  source-aware comparison, completion, and human-review gates.
- A local `selah-benchmark-rubric-v2` candidate now turns the refined Mark 6
  app-quality standard into a thirteen-dimension, evidence-backed
  editorial review. Its provisional gate requires at least 85/100, no criterion
  below the publishable floor, benchmark-level voice/source/freshness, and a
  sufficient typed remediation plan. It remains review-only, cannot perform the
  semantic judgment itself, calls a qualifying result `benchmark_ready`, and
  always leaves that draft at `needs_owner_review`. The v2 offline evaluator
  now refuses owner readiness unless three separately keyed authenticated
  receipts (owner approval, reviewer assignment, automated validation), the
  active review/registry heads, complete resolution/privacy reports, and the
  content score all agree. Its test keys are ephemeral; it is not wired to
  Studio and cannot be operational until a protected server assembler supplies
  the authority policy and current state; see
  `docs/selah/benchmark-quality-review.md`.

## Changes since 2026-07-15 (the launch-week sprint)

- **Prepare Chapter screen** (PR #40 flow): owner approval is a digest-bound
  Supabase row (`chapter_setup_approvals`), not a PR. Mark 9 and Mark 10 were
  both prepared on-screen.
- **Maps**: MapLibre engine live for Mark 7/8/9 (r100) — 3-D terrain, journey
  tour, honest uncertainty treatments. Owner UX review (2026-07-18) drove PR
  #59 (pending): whole-scene default frame, themed legend below the map,
  native terrain-aware pins (fixes drag desync), Compare removed for rethink.
- **Single-image redo** (PR #51): draft-only, one candidate, one confirmed
  spend, in-chapter candidate preview, rollback-snapshot swap. Used in anger
  on Mark 10 launch day.
- **Spend honesty** (PRs #51/#53): any post-dispatch failure records possible
  spend (`billingUncertain`), claims lock instead of silently releasing;
  public workers keep pre-auth refusals console-only (audit-flood fix).
- **Shared improvement queue** (`docs/selah/improvement-queue.yml`): 10
  entries on main, 16 pending PR #55. Both AIs read it on "catch up".
- **Self-serve Prepare (IQ-011)** built (PR #58, pending review): any
  non-protected chapter can be proposed/validated/approved on-screen; one
  bounded confirmed model call; fail-closed everywhere; Codex audits
  post-hoc. The `chapter_prepare_proposals` table SQL was run 2026-07-18.
- **Hydration fix** (PR #57, merged + verified on production): theme provider
  no longer mismatches server/client on saved non-default themes.
- Pending PRs at write time: #55 queue · #56 320px wrap · #58 self-serve
  Prepare · #59 maps UX · #60 published-neighbor nav (IQ-012) · #61 chapter
  metadata (IQ-016).

## Next up

- **Layout via Figma (IQ-008, owner-confirmed):** Codex owns the editable
  Mark 9 mobile mockup; Claude implements only after the owner approves the
  design. Goal: reduce visual competition (~87 bordered boxes today), one
  box level, ≤3 text sizes. (#33's newspaper draft is superseded by this
  lane.)
- **Navigation (IQ-007, owner decision):** remove the visible "Today"
  concept; canonical `/chapter/{slug}` everywhere; `/today` becomes a quiet
  redirect. Sequenced with the layout pass.
- **Mark 11:** publishable whenever the owner wants — fixture entries + the
  on-screen Prepare receipt (or, once #58 merges, any OTHER chapter through
  the self-serve lane).
- **Kelly's characters:** People/Connections uses Kelly's system as the
  canonical cast (owner direction 2026-07-18); spec day proposed for Mon
  2026-07-21, awaiting the owner's confirm.

## Cost reference (Mark 6 actuals, logged estimates)

~$0.75 total: ~5 gpt-4o drafts (~$0.30) + one gpt-5.5 draft ($0.11) + 3
gpt-image-1 (~$0.12) + 5 gpt-image-2 (~$0.20 at placeholder rate; real
gpt-image-2 pricing may be higher — check the OpenAI dashboard).

Mark 10 (2026-07-18) actuals: ≈ $0.77 — one text draft (~$0.10) + 3
gpt-image-2 at $0.165 each ($0.50 est) + one redo candidate ($0.17 max).
Every spend passed a Studio confirm; rows in Spend history.
