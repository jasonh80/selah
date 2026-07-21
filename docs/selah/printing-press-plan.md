# The Printing Press — scale plan (owner brief, 2026-07-21)

Owner's north star, verbatim: refine the process this week, crank up the
printing press — "mega is built in through training… launch the whole book of
Mark this week and the rest of the bible in a month. then multiple languages
per month, until we get it in every language, to the ends of the earth."

This doc turns that into numbers, sequencing, and the decisions only the
owner can make. It is a plan, not a commitment device — every phase still
runs through the standing gates (Codex editorial, owner spends, honesty
suite).

## The one fork the owner must call

**"Mega" is owner-defined as: compared against Jason's Daily Workup/Rundown
chat.** That definition makes the press's top speed equal to Jason's personal
devotional pace (~1 chapter/day). Two ways to keep both the standard and the
speed:

- **A. Two-seal model (recommended).** Chapters launch at *Selah standard*
  (trained voice + Eyes + honesty gates + Codex editorial approval — the
  full pipeline minus the workup comparison). The **Mega seal** is added
  later, whenever Jason's workup for that chapter exists and Codex runs the
  comparison. Mark can ship this week; seals catch up at his pace, forever.
- **B. Mega-only publishing.** Nothing ships without the workup comparison.
  Highest bar, but the Bible takes ~3 years at 1/day, not a month.

Everything below assumes **A**. If the owner picks B, multiply every
timeline by his workup pace.

## Phases, time, cost (order-of-magnitude; all spends owner-confirmed)

| Phase | Scope | Pace needed | Est. cost | Human gate |
| --- | --- | --- | --- | --- |
| P0 · this week | Process refinement + **finish Mark** (chs 1–5 and 12–16 = 10 chapters) | ~2/day machine, owner reviews in 2–3 bundled sessions | ~$35–65 | Codex full editorial on all; owner bundled review |
| P1 · next ~30 days | **New Testament** (260 chapters; **244** remain once Mark is complete) | ~9/day | ~$600–900 | Codex all; owner samples ~5–10%; doctrine board samples |
| P2 · the following quarter | **Old Testament** (929 chapters) → full Bible | ~11/day sustained | ~$2,000–3,500 | same sampling model |
| P3 · then | **Languages** (see below) | 2–5 languages/month at first | ~$1–2k per language | native reviewer per language |

Three stages stay separate at every speed: **machine-generated draft →
reviewed launch candidate → public release.** Accuracy is the public-release
gate, always. "The rest of the Bible in a month" is ~39 chapters/day — more
than one reviewer can read, but not more than review CELLS can: ~13 parallel
cells (a trusted reviewer + Codex each) clearing ~3 chapters/day would hit
it. So the 30-day full Bible is a **recruiting problem, not an impossibility**
— the table's NT-month → Bible-quarter pace is what the CURRENT team (owner
+ 2 AIs + a small sampling board) can gate honestly; the sprint unlocks the
moment the owner stands up parallel cells.

Per-chapter basis (Mark-sprint actuals): text ~$0.61 first-try; 3–5 images
~$0.17–0.25 each; retries/redos roughly double image spend. All-in planning
number: **~$2.50/chapter**.

## Languages — the big win and the big wall

- **Win:** images and maps are language-independent. The whole visual
  library (the expensive, slow, owner-directed part) is built ONCE and
  reused in every language. A language edition is a text-only regeneration
  (~$700–1,500) plus native review.
- **Wall: translation licensing — edition-specific, always.** Crossway's
  standard ESV terms do not grant blanket commentary/reference use at
  full-Bible scale; eBible.org texts carry MIXED licenses; unfoldingWord
  texts generally carry CC BY-SA share-alike duties. Standing rule: a
  **per-translation ledger** (license, attribution text, AI-use terms) plus
  counsel review is REQUIRED before each language launch — no edition ships
  on an assumed license. Path: (1) a Crossway conversation this month for
  English; (2) per-language open-licensed bases chosen via the ledger;
  (3) licensed upgrades later.
- **Reality of "every language"** (figures are working hypotheses, not
  verified counts): ~7,100 living languages; complete Bibles in roughly
  700+. "AI is strong in the top 30–50 languages" and the proposed first
  ten (Spanish, Portuguese, Mandarin, Hindi, French, Arabic, Swahili,
  Indonesian, Russian, Tagalog) are HYPOTHESES — each language enters the
  queue only after a native-reviewer benchmark validates model quality.
  "Ends of the earth" is a direction we steer by, and the fleet grows as
  model coverage grows.

## Team (lean by design — AIs are the workforce)

| When | Who | Cost |
| --- | --- | --- |
| Now | Jason (vision/editorial owner) + Claude (build) + Codex (review) | API only |
| Before P1 | **Doctrine sampling board**: 2–5 trusted pastors/elders who sample chapters weekly and own a public correction process | volunteer |
| P1–P2 | A "grader" lane (automated checks + Codex) so sampling is targeted, not random | build time |
| P3 | **Native-reviewer network** per language — church/missionary partners, small stipends | ~$100–300/language/month |
| Once, this month | Licensing/legal: Crossway conversation, entity formation, trademark search on "Selah" (crowded name space) | one-time legal fees |

## Business infrastructure

- **Entity:** a 501(c)(3) nonprofit fits the mission and makes Selah a
  candidate for the Bible-technology funders (ETEN / illumiNations) whose
  purpose is "Scripture in every language." Those are **prospects to
  investigate, not entitlements** — grants may fund P3, but the plan cannot
  assume it.
- **Cost custody (standing rule kept):** spend caps + billing alerts on
  every API key; owner confirms every spend; monthly cost report.
- **Governance:** published doctrinal statement, visible correction/errata
  process, and the honesty gates stay senior to growth — at every scale.
- **Storage & serving (usage-based, not free):** raw image math is small —
  full English Bible ≈ 1,189 chapters × ~5 images × ~2 MB ≈ **12 GB**, and
  language editions add text only. But raw storage excludes bandwidth/CDN
  egress, image variants, backups, failed candidates, native review, and
  licensing costs. Today's floor is Supabase Pro (~$25/mo) + Netlify
  (~$19/mo); beyond that, cost scales with actual reader traffic and gets
  projected from measured usage — no flat promises.

## Tip of the whip (owner's phrase) — model currency

Source of truth (Codex correction 2026-07-21): the stored Studio settings
`generation_settings.selected_text_model` / `selected_image_model` drive
generation; the Netlify env vars and code defaults are fallbacks, and
**admin diagnostics already reports the selected models** — no env
spelunking required. Current facts (Codex-confirmed): Selah publishes on
**GPT-5.5**; **GPT-5.6 Sol** is OpenAI's flagship at the **same token
price** ($5 in / $30 out per M) and should be tested. The stale code
fallbacks (`gpt-4o-mini` in `lib/server/openai.ts`, `gpt-4o` /
`gpt-image-1` in `generation-settings.ts`) are cleanup items so a settings
wipe can never silently downgrade the press.

Standing ritual — **Model Day, first Studio session of each month**:
1. Read the selected models from admin diagnostics (already reported).
2. Run the approved private A/B (~$0.30): same chapter, current model vs
   the newest flagship — no saving, no publishing, no production switch.
3. Codex judges blind, against the Voice brief and Selah Eyes.
4. Winner gets selected deliberately in Studio — upgrades are a decision,
   never a drift, and never a rumor (model claims get benchmarked, not
   believed). First run: GPT-5.5 vs GPT-5.6 Sol, queued for Part 9.

## This week (P0), concretely

1. Two-seal model approved: launch at Selah standard; add Mega after the
   Daily Workup comparison.
2. Verify the approved selected text and image models in Admin diagnostics;
   inspect environment fallbacks only if settings/diagnostics are missing;
   then run the first Model Day.
3. Close the current batch: #94 Megas applied, Mark 6 image landed.
4. Crossway + entity + trademark: three emails/calls, owner-initiated.
5. Claude + Codex spec the P1 batch lane (queue, sampling QA, grader) as
   the week's build — the press itself.
