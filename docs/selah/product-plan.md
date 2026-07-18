# Selah Product & Layout Plan

*Owner-approved direction, 2026-07-15. Planning document — features here are
sequenced intentions, not commitments. Mark 6 and Mark 8 are the quality
benchmarks. Preserve current typography and visual identity.*

## Selah's standard

A wise, human guide — not a Bible-summary machine. Helps people see Jesus
clearly, makes deep truth understandable, knows when to comfort and when to
challenge, moves people from learning to responding, speaks like a trusted
friend without unnecessary church language, and keeps the experience simple.

**Guiding build principle (owner-set, 2026-07-14):** fail-closed protects the
money, the live site, and Scripture — it never protects the owner from his own
judgment. The machine advises; the owner decides. No new gates on owner-facing
flows; every proposed gate must name whom it protects.

## Decisions already made (owner)

- **Reactions: dead.** Removed from the plan entirely.
- **Personalized challenges: in, full strength** (reader's first name).
- **Quiz/trivia: parked** (identity risk).
- **Per-chapter visual themes: parked** (subtle hero treatment only).
- **Stages (Curious → Believe → Follow → Disciple-Maker): private routing
  logic only — never a visible rank.**
- **Mark 7 ships before any major upgrade** (owner's small group is studying it).
- **Kelly's character library: the 9 review fixes are APPROVED (2026-07-15)**
  per `character-library-report.md`. Claude applies them; owner/Kelly
  spot-check. Text fixes are free; 3–5 refreshed portraits generated via
  ChatGPT (no API cost), chapter scenes stay on the manifest pipeline.
- **Maps: every chapter gets a map** built from a shared location library
  (each place defined once: coordinates, name, certainty level) rendered by
  the single MapsSection component under a written style contract (solid dot =
  known, shaded area = debated). Esri stays; vendor revisit only if the style
  contract hits limits.

## Shared improvement queue

Improvement candidates from launches, QA, and reviews live in
[`improvement-queue.yml`](improvement-queue.yml) (owner-approved 2026-07-17):
one entry per candidate — ID · area · improvement · evidence ·
priority/trigger · status (`queued|working|finished|declined`) ·
completion PR. Both AIs read it on "catch up" and nightly homework; before
any chapter refresh, review that chapter's queued notes. Jason does no
recordkeeping here.

## Inventory

**Already exists:** date chip · whole-Bible timeline ("Where It Fits") ·
maps + Map Notes (Psalm 23, Mark 6 configs) · Key Person/Object cards · FAQ ·
Scene Checks · Original Language · Go Deeper · version selector · reading
mode + themes · Brain-enforced modern comparisons and responsible
Jesus-centrality · model-recommended hero scene with owner review · Studio
5-step flow with spend confirmation, kill switches, plain-English failures,
history with reasons.

**Exists, needs improvement:** Studio ergonomics (key lost on reload,
checklist resets, duplicate confirmations) · Key People (portraits, ages,
multiple people — wire Kelly data) · map uncertainty as visuals · "years ago"
beside dates · Book Flow as a reader-facing section (fold into "Where It
Fits") · people-group vs region separation · real cost rates + Studio ledger
(owner stewardship directive).

**New (buildable):** expanding photos on click · text-size control ·
"Standing Here Today" · visual chapter path · character pages (Kelly data) ·
disciple-making module (Brain rule + prompt v7, Gospels-strong) ·
**accounts-dependent:** bookmarks/continue · reading history/checkmarks ·
highlights + notes · personalized challenges · shareable "thought of you"
messages · prayer builder (Lord's Prayer shape) · new-user start experience
(one reading, one prayer, one next step — never auto-push year plans).

**Long-term (parked):** Selah Brain as a service · WWJD · "How do I answer my
kid?" · Kids/Jr versions · personal Bible-training · Bible-wide Brain ·
read-aloud audio (ElevenLabs — real per-chapter cost, decide later) ·
original-language audio · manuscript images · worship songs (link-out
approach when built).

## This week (owner committing ~3 hrs/day; compressed target 4–5 days)

1. **Mark 7 live first** — Codex specs movement boundaries overnight → owner
   approves → preload PR (extend protected contract + admit mark-7) → one
   text run + one image run → owner publishes. Target: Monday/Tuesday.
2. Layout session with owner live (his change list + expanding photos +
   text size) · finish quality-notes-save-for-review.
3. Studio polish: key persistence, no checklist resets, single confirmation ·
   real cost rates + ledger · Mark 8 map config.
4. Kelly's 9 fixes + portrait prompts → wire Key People (portraits + ages) ·
   disciple-making module in prompt v7.

## Next: automation sprint (owner-committed 2026-07-15 — "fix this band-aid ASAP")

Teach Studio to "Prepare Chapter": Brain drafts the preload pack (movements,
guidance notes, map pins) → owner approves on screen. Preparation stops being
a PR and becomes a click. Concrete path, in order:

1. Generalize what PR #30 seeded: the per-chapter setup-contract factory
   (`mark-sprint-setup-contracts.ts`) becomes the single preparation surface;
   the remaining mark-8-literal modules (setup seeding, preflight loader,
   Studio client constants) go fully slug-parameterized. Mark 9/10/11 then
   land as fixture entries + approval receipts (~20 lines each), not
   expeditions.
2. Studio "Prepare Chapter" screen: Brain proposes movements/notes/map pins →
   owner reads and approves on screen → receipt recorded, notes seeded — no
   code change, no PR, no Claude in the loop for preparation.
3. Scheduled cloud agents take over the overnight homework loop (Mac no
   longer needs to stay awake).

## Roadmap after that

Understanding features (Book Flow, years-ago, map honesty, Standing Here
Today) → accounts foundation → start experience → personal layer (notes,
highlights, prayer builder, sharing) → media layer. Prioritize understanding
Scripture and following Jesus over engagement mechanics, always.
