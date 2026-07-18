# Selah Studio — Chapter Production Workflow

> The playbook for producing a chapter at Mark 6 quality. For project status
> and models, read `current-state.md` first. **Nothing here runs without the
> owner's explicit approval — generation and publishing are always opt-in.**

## The pipeline (locked language)

```
Choose Chapter → Generate Draft → Preview Draft → (Compare Versions)
→ Selah Brain review → completion pass → Image Preview → Last Looks → Publish Final
```

- **Selah Studio UI:** `/admin/generation` (token = `DEV_ADMIN_TOKEN`, entered as
  the "studio key"). Calm 4-step flow + Advanced Settings (kill switches, models,
  rules, examples, audit log).
- **Admin API:** `POST /api/admin/generation` with header `x-admin-token`.
  Actions: `generate`, `status`, `publish`, `feedback`, `save`,
  `rules_list/rule_toggle/rule_delete/rules_seed/rules_select`,
  `examples_list/example_add/example_toggle/example_delete/examples_select`,
  `versions_list/version_get/versions_snapshot/version_restore/version_apply`,
  `generate_images/images_status/image_model_check`, `audit`.
- **Draft preview:** `/dev/preview/<slug>?token=…` (shows draft banner + approved
  image plan panel — admin only, never public).
- **Compare/merge versions:** `/dev/compare/<slug>?token=…`.

## Step by step

1. **Choose chapter** in Studio (book + chapter pickers; slug is automatic).
2. **Generate Draft** — turn Text Generation ON (Advanced Settings), set model
   `gpt-5.5` for publish-quality, generate ONCE, then turn Text Generation OFF.
   - gpt-5.5 needs `reasoning_effort: "low"` (already coded) and ~3 min.
   - The prompt automatically assembles: core rules + ≤12 contextual rules (by
     genre) + chapter review notes + 1–2 approved voice examples.
   - Each successful save auto-archives a version — earlier drafts are never lost.
3. **Preview Draft** and run the **Selah Brain review** ("Does this feel like
   Selah?"). Chapter-scoped notes re-apply on regeneration; "Future chapters
   too" creates a global rule.
4. **Compare Versions** if multiple drafts exist — per-section pick of A/B;
   saving writes the working draft + a new version snapshot. `version_restore`
   sets an old version as the working draft WITHOUT creating a new one.
5. **Completion pass** (currently code edits — see Branch/PR below):
   - `CHAPTER_VERSE_NOTES` (section-anchored notes) and `CHAPTER_FAQ`
     ("What People Ask", 7-ish questions, Selah voice) in
     `lib/content/chapter-content.ts`
   - Map config in `lib/maps/chapter-maps.ts` + Esri satellite image in
     `public/img/maps/` (approximate regions for uncertain sites — never a
     false exact pin)
   - Image plan: concepts in `CHAPTER_IMAGE_PLAN` (display) **and**
     `IMAGE_PLANS` in `lib/server/images.ts` (generation) — keep them in sync
6. **Image Preview** — snapshot a version first, turn Image Generation ON,
   `generate_images`, poll `images_status`, turn Image Generation OFF, then
   eyeball every image (see QA below).
7. **Last Looks** — full QA checklist below, on the draft preview.
8. **Publish Final** — flips status draft → reviewed; the chapter is instantly
   public at `/chapter/<slug>` (DB reads are no-store, no cache lag).

## Versioning rules

- **Snapshot before every regeneration or image run** (`versions_snapshot` with
  a descriptive label). Old images/copy are preserved in the archive and in
  Supabase Storage (new image kinds use new filenames — nothing overwritten).
- The working draft (`chapter_workups` row) is what preview/publish read;
  `chapter_workup_versions` is the append-only history.

## Image rules

- Chapter-driven selection (no rigid buckets): **3 images default, 5 when the
  chapter has narrative breadth** (multiple scenes/turning points/contrast).
- People-first: the hero is a people scene, not an empty landscape.
- Every prompt carries guardrails: documentary photorealism; no halos, no glow,
  no text/lettering, no modern objects, no Europeanized faces, no staged posing.
  Scriptural physical details (e.g. "green grass", Mark 6:39) override style.
- Jesus: ordinary first-century Galilean Jewish man, never idealized/glowing.
  Divine presence via the text's own media — never a human-shaped God.
- Model `gpt-image-2`; `image_model_check` probes availability first; a failed
  probe STOPS the run (no fallback). Sizes: wide 1536×1024 (hero-suited),
  portrait 1024×1536 (grid cards).

## Redo one image (draft chapters only)

When one image of a completed draft set is wrong, redo exactly that one —
never the text and never the other images (board #29 owner decision,
2026-07-17; Codex spec 2026-07-18):

1. In **Create & Review Images**, open the image's card → **Redo this image**.
2. Type **what should change** (required, ≤600 chars). The redo prompt is the
   image's frozen approved prompt + your note; style/composition boundaries
   stay.
3. **Check cost (free)** — shows the exact model, size, and maximum charge,
   and binds a digest of the target, its current bytes, and your note.
4. **Create one candidate** — exactly one model request, one image, no
   automatic retry. The candidate is stored PRIVATELY under its own immutable
   `<slug>/<jobId>/` directory; the chapter stays byte-for-byte unchanged.
5. Compare current vs candidate, **Preview in chapter** (required — the
   preview shows the candidate in place with a banner), then **Use this
   image** (swaps only that one `src`, after an automatic rollback snapshot)
   or **Reject** (chapter untouched; the file stays orphaned).
6. Any unresolved redo NULLS the review digest — the set must be re-previewed
   and re-approved, and publish refuses until the candidate is decided.
- Gates: same kill switch, allowlist, owner receipt, model probe, atomic
  single-use claim, strict cost recording (`imageCount: 1`, `redo: true`),
  and audit trail as the full run. Published chapters always refuse.
- Offline gate: `verify:image-redo` (prebuild) proves one-spend, privacy,
  exact-swap, reject-changes-nothing, published-refuses, and fail-closed
  cost recording.

## Cost stewardship

- Both kill switches stay **OFF** except during an approved run; flip OFF
  immediately after. Confirm-before-generate stays ON.
- One gpt-5.5 authorship run ≈ $0.11 · one 5-image gpt-image-2 run ≈ $0.20+
  (placeholder rate — dashboard has real numbers). Every run logs a cost event
  + audit row.
- Don't ladder drafts on cheap models to "save money" — five gpt-4o drafts cost
  more than one gpt-5.5 draft and can't hit the voice.

## QA checklist (Last Looks)

1. Correct copy version active (spot-check signature lines)
2. Images: right set, right order, hero = people scene; check each image for
   guardrail violations (text, halos, anachronisms, wrong-era details)
3. Text Generation OFF · Image Generation OFF
4. `/chapter/<slug>` 404 (before publish) · published chapters still 200
5. Read the Chapter (ESV + copyright) · Verse-by-Verse notes render
6. What People Ask renders after Deeper Study
7. Map renders (both modes), pins sane, legend/scale/attribution present
8. Go Deeper has no dead links (empty sections are hidden automatically)
9. Mobile + desktop layout pass
10. Transparency drawer: source/build/images rows correct; dating nuance lives
    here, never in the timeline headline (confident main-UI dates)
11. No placeholder/prototype/coming-soon copy; no admin/dev leakage in public view

## Branch / PR workflow (for code changes)

- Small, low-risk changes have historically gone straight to `main` (each
  deploy bumps `BUILD_ID` in `lib/build.ts`, e.g. r78).
- **Preferred for larger changes:** branch → push → PR → review → merge
  (`feat/mark-6-completion` = PR #1 precedent). `gh` CLI is NOT installed;
  create PRs via the GitHub compare URL:
  `github.com/jasonh80/selah/compare/main...<branch>?expand=1`.
- Always bump `BUILD_ID` when deploying; verify live via the
  `<meta name="selah-build">` stamp (`curl … | grep r##`).

## Common gotchas

- **Netlify env vars need a FRESH BUILD** to apply — an env-only "redeploy" is
  not enough. Change the var, then push a build bump. (Runtime toggles now live
  in Supabase settings precisely to avoid this.)
- **Deploy Previews lack the runtime env vars** (`DEV_ADMIN_TOKEN`, Supabase
  keys are Production-scoped) — preview deploys 404 on chapters/admin. QA on
  production after merge, or temporarily widen var scopes (then revert).
- **Build failures:** the site silently stays on the last good deploy. If a
  push doesn't go live in ~2–3 min, check Netlify → Deploys → failed log.
- **Supabase reads are `no-store`** (fixed r78) — if pages ever show stale DB
  data again, check `lib/server/supabase.ts` fetch config first.
- **gpt-5.5 quirks:** rejects `reasoning_effort: "minimal"` and the
  `temperature` param; abort cap is 600s.
- **Generation runs in Netlify background functions** (15-min budget); trigger
  via admin API, poll `status` / `images_status` — never wait on the request.
- The old `/dev/*` routes are OFF in production (`ENABLE_DEV_ROUTES`); the
  token-gated preview/compare pages work regardless.
