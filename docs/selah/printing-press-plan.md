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
| P0 · this week | Process refinement + **finish Mark** (chs 1–4, 12–16 = 9 chapters) | ~2/day machine, owner reviews in 2–3 bundled sessions | ~$30–60 | Codex full editorial on all; owner bundled review |
| P1 · next ~30 days | **New Testament** (260 chapters, ~251 remaining) | ~9/day | ~$600–900 | Codex all; owner samples ~5–10%; doctrine board samples |
| P2 · the following quarter | **Old Testament** (929 chapters) → full Bible | ~11/day sustained | ~$2,000–3,500 | same sampling model |
| P3 · then | **Languages** (see below) | 2–5 languages/month at first | ~$1–2k per language | native reviewer per language |

Honest note on "the rest of the Bible in a month": that is ~39 chapters/day.
The machines can generate at that rate; no honest review process can read at
that rate. NT-in-a-month → full-Bible-in-a-quarter keeps a real quality gate
on every chapter. Shipping unread Scripture commentary faster than anyone
can read it would break the owner's own quality convictions, so this plan
does not propose it.

Per-chapter basis (Mark-sprint actuals): text ~$0.61 first-try; 3–5 images
~$0.17–0.25 each; retries/redos roughly double image spend. All-in planning
number: **~$2.50/chapter**.

## Languages — the big win and the big wall

- **Win:** images and maps are language-independent. The whole visual
  library (the expensive, slow, owner-directed part) is built ONCE and
  reused in every language. A language edition is a text-only regeneration
  (~$700–1,500) plus native review.
- **Wall: translation licensing.** ESV is licensed English text — Crossway
  permission is required before full-Bible-scale display, and it does not
  cover other languages. Path: (1) a Crossway license conversation this
  month for English; (2) open-licensed / public-domain texts per language
  (World English Bible, unfoldingWord/Door43, eBible.org corpus) as the
  default international base; (3) per-language licensed upgrades later.
- **Reality of "every language":** ~7,100 living languages; complete Bibles
  exist in roughly 700+; AI text quality is strong in maybe the top 30–50
  languages today and thins fast beyond that. Sequence: top-10 mission
  languages first (Spanish, Portuguese, Mandarin, Hindi, French, Arabic,
  Swahili, Indonesian, Russian, Tagalog), each with a native reviewer.
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

- **Entity:** a 501(c)(3) nonprofit fits the mission and unlocks the two
  big Bible-technology funders (ETEN / illumiNations) whose entire purpose
  is "Scripture in every language" — P3's budget likely comes from grants,
  not the owner's card.
- **Cost custody (standing rule kept):** spend caps + billing alerts on
  every API key; owner confirms every spend; monthly cost report.
- **Governance:** published doctrinal statement, visible correction/errata
  process, and the honesty gates stay senior to growth — at every scale.
- **Storage (a non-problem):** full English Bible ≈ 1,189 chapters × ~5
  images × ~2 MB ≈ **12 GB** + trivial text. A hundred language editions
  add text only. Supabase Pro (~$25/mo) + Netlify (~$19/mo) carry this
  until real user scale; six figures of users is a few hundred $/mo.

## Tip of the whip (owner's phrase) — model currency

Audit finding (2026-07-21): the code's DEFAULT model pins are stale —
`lib/server/openai.ts` defaults chapter text to `gpt-4o-mini` (its own
comment admits a newer model "was requested, but that is not a current
OpenAI model name" — written when it was); `generation-settings.ts`
defaults `gpt-4o` text / `gpt-image-1` image; only the sprint image lane
pins the newer `gpt-image-2`. Production may override via
`CHAPTER_WORKUP_TEXT_MODEL` / `CHAPTER_IMAGE_MODEL` env vars — **only the
owner can read those in Netlify**, so step one is: owner reads and reports
the two values.

Standing ritual — **Model Day, first Studio session of each month**:
1. Owner reads the two env pins (or Studio's diagnostics shows resolved
   models — small build item).
2. Claude regenerates the benchmark chapter on the newest available text
   and image models (existing `verify:benchmark` fixture lane).
3. Codex judges old vs new blind, against the Voice brief and Selah Eyes.
4. Winner gets pinned deliberately — upgrades are a decision, never a
   drift, and never a rumor ("5.6" claims get benchmarked, not believed).

## This week (P0), concretely

1. Owner calls the fork (A or B above).
2. Owner reads the two Netlify model env vars → first Model Day runs.
3. Close the current batch: #94 Megas applied, Mark 6 image landed.
4. Crossway + entity + trademark: three emails/calls, owner-initiated.
5. Claude + Codex spec the P1 batch lane (queue, sampling QA, grader) as
   the week's build — the press itself.
