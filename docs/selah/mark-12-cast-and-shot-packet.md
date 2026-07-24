# Mark 12 — Cast + Shot Packet (preparation only)

**Prepared by Claude, 2026-07-23, under the owner-authorized task on board #29
(comment 5060303117) and the temporary bridge spec (5060194329).**

Nothing here generates, spends, publishes, or mutates live data. No second
character system is proposed.

---

## 1. Scripture-first role inventory

Mark 12, scene by scene. The critical separation is between people who were
**there** and figures who exist **inside a story or an argument**.

### 12:1–12 — The parable of the tenants

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| chief priests, scribes, elders (the "they" of 12:12, carried from 11:27) | named group |
| the temple crowd | unnamed representative |
| vineyard owner, his servants, his beloved son, the tenants | **PARABLE FIGURES — must not enter the historical cast canon** |

### 12:13–17 — Taxes to Caesar

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| Pharisees | named group |
| Herodians | named group |
| the denarius bearing Caesar's image and inscription | object, and a strong one |
| **Caesar (Tiberius)** | **mentioned, not present — do not cast him into the scene.** His face belongs on the coin and nowhere else. |

### 12:18–27 — The Sadducees on resurrection

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| Sadducees | named group — cast as `mark12-sadducee` (approved) |
| the seven brothers and the woman | **HYPOTHETICAL — an argument, not history. Never cast, never depicted as real people.** |

### 12:28–34 — The scribe who asked well

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| **the individual scribe** | unnamed but individual — the chapter's one sympathetic authority, "not far from the kingdom of God" |
| bystanders | unnamed representative |

### 12:35–37 — Teaching in the temple

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| the great throng who heard him gladly | unnamed representative |

### 12:38–40 — Beware the scribes

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| scribes in long robes | named group |
| the widows whose houses are devoured | **referenced, not present in the scene** |

### 12:41–44 — The widow's two coins

| Figure | Class |
|---|---|
| Jesus | recurring canonical |
| **disciples he called to him (12:43)** | recurring canonical — **Mark names no individual here** |
| **the poor widow** | unnamed representative — the emotional centre of the chapter |
| wealthy donors | unnamed representative |
| ordinary temple crowd | unnamed representative |

---

## 1b. Role classification — "Cast for continuity. Prompt for the scene."

Owner rule (board #29, 2026-07-24): classify every role BEFORE any audition
work, and never send scene-only roles to casting. Four tiers:

- **Permanent cast** — lock a recurring face only for people whose identity must
  stay recognizable across chapters/updates/multiple substantial scenes or a
  planned profile. *Mark 12:* Jesus and the Twelve (already locked). Nothing new
  here is promoted to permanent.
- **Chapter-local continuity** — one approved face/reference reused only WITHIN
  this chapter when a one-chapter person appears recognizably in more than one
  image; not promoted into the canonical cast. *Mark 12 (owner's explicit
  exception):* the **poor widow** (`mark12-widow-two-coins`) and the **scribe of
  the great commandment** (`mark12-scribe-great-commandment`) are **retained as
  approved chapter-local references for Mark 12 and its revisions**, even though
  the current manifest shows each in a single image — they are already made and
  kept. **Going forward**, a one-image equivalent is **scene-only** (next tier):
  no audition, generated directly from a strong prompt. These are chapter-local
  representative references, **not** recurring biblical identities.
- **Scene / group references** — historically grounded archetype/scene refs, not
  individual casting. *Mark 12:* `mark12-sadducee`, `mark12-herodian`,
  `mark12-chief-priest`, and `mark12-temple-crowd` are scene/group references.
- **Scene-only person** — appears once in one image: no audition, no permanent
  portrait; generate directly from a Scripture-first Selah Mind/Eyes prompt.

The Mark 12 assets already made are kept — this is a classification, not a
discard/regenerate. Going forward, this reclassification means a chapter like
Mark 12 does not carry a miniature casting production: only true recurring
identities audition.

---

## 2. Database readiness audit

Checked against the live library (`Selah-Kelly/lib/characters/`) and the ported
portrait registry in this repo.

| Role | Status | Detail |
|---|---|---|
| **Jesus** | ✅ ready | `jesus`, approved portrait. Mark 12 is Passion week — **use `jesus/ministry-late`**, not `passion`; the arrest has not happened. |
| Peter | ✅ ready | approved portrait |
| Andrew | ✅ portrait approved (keep-face) | profile-text corrections applied |
| Matthew | ✅ portrait approved (keep-face) | wardrobe simplifies in scenes (owner's arc: plain by now, one fine detail) |
| Thomas | ✅ portrait approved (keep-face) | |
| Philip · Bartholomew · James (Zebedee) | ✅ LOCKED | Codex certification |
| James (Alphaeus) · Thaddaeus | ✅ LOCKED | James-Alphaeus **recast** older/plainer (~50, representative); the Bartholomew collision is RESOLVED |
| **John (Zebedee)** | ✅ **LOCKED** | portrait approved and locked (`john-apostle`); castable in Mark 12 |
| **Judas Iscariot** | ✅ **LOCKED** | portrait approved and locked; castable in Mark 12 |
| **Simon the Zealot** | ✅ **LOCKED** | aged re-audition (~mid-40s) promoted; the James (Zebedee) collision is RESOLVED. Use the current face only |
| chief priests / elders | ✅ approved | `mark12-chief-priest` — the priestly aristocracy who challenge Jesus, distinct from the serving priest |
| scribes (group) | ✅ exists | `archetype-scribe` (temple scribe) |
| Pharisees | ✅ exists | `archetype-pharisee` |
| **Herodians** | ✅ approved | `mark12-herodian` |
| **Sadducees** | ✅ approved | `mark12-sadducee` |
| **the individual scribe (12:28–34)** | ✅ approved | `mark12-scribe-great-commandment` — an individual with a face and a moment |
| **the poor widow** | ✅ approved | `mark12-widow-two-coins` — one-chapter representative depiction |
| wealthy donors | ✅ covered | folded into `mark12-temple-crowd` scene casting |
| ordinary temple crowd | ✅ approved | `mark12-temple-crowd` — proportional crowd brief, per Eyes v1.2 |

**Status (2026-07-24): all Twelve are visually complete — 12/12 LOCK.**
Reproducible commit state: the current clean Kelly head is **`ea8123f`**; the
Mark 12 supporting assets and the John/Judas apostle portraits were first
committed at **`bb4d3c3`**, and the picks are in
`Selah-Kelly/lib/characters/cast-picks.json` (also committed). (An earlier
read-only check verified the twelve canonical *portraits* byte-identical at
`aff1d19`, but that tree predates the John/Judas/supporting assets, so cite
`ea8123f`/`bb4d3c3` — not `aff1d19` and not an uncommitted working-tree
observation — as the reproducible state.) John, Judas, and Simon are now locked,
so a Mark 12 image may show the full Twelve honestly.

**Sync gap (important): these references are Kelly-repo-local and are NOT ported
into this Selah repo.** Selah has no copy of the `mark12-*` files or a portrait
registry entry for them; the Kelly-local references remain required until the
approved reference-image upload bridge (or the permanent IQ-026 pipeline) exists.
No Mark 12 image generation can resolve these faces from Selah alone today.

---

## 3. The Mark 12 supporting briefs (now cast + approved)

*As of 2026-07-24 these six briefs have been generated ChatGPT-side and
approved (picks in `Selah-Kelly/lib/characters/cast-picks.json`, portraits
committed locally). The briefs are retained below as the authored source of
truth for each role.*

Every entry uses **SAYS / SMART GUESS / UNKNOWN**. Guardrails from Eyes v1.2
apply: no villain faces for opponents, no theatrical misery for the widow, no
moral verdict carried in a face or body, crowds proportional rather than
assorted.

### `mark12-sadducee` — group

- **SAYS:** they say there is no resurrection (12:18). Josephus and Acts 23:8
  place them among the priestly/aristocratic establishment.
- **SMART GUESS:** wealthier, better-dressed than the scribes; connected to the
  temple establishment; older skew.
- **UNKNOWN:** any individual's appearance.
- **Look:** well-made but not ostentatious linen and wool; grooming that reads
  as means; assured public bearing. **Not sneering, not corpulent, not
  villain-lit.** They are wrong in this scene and they are still men.

### `mark12-herodian` — group

- **SAYS:** they exist and act with the Pharisees against Jesus (3:6, 12:13).
  Their defining, attested trait is a **political allegiance** to the Herodian
  house — NOT a uniform or a documented look.
- **SMART GUESS:** likely more Hellenised/Greco-Roman in bearing than the
  Pharisees beside them.
- **OPEN CASTING CHOICE (not evidence):** Herodian grooming and clothing are a
  representative visual choice, not attested fact — do NOT invent a visible
  "Herodian uniform." Any dress contrast is a legible casting device, labeled as
  such, never presented as historical.
- **UNKNOWN:** organisation, membership, everything else. Say so.
- **Look:** a plausible, understated period option (e.g. a slightly more
  Hellenised cut) — chosen for legibility, claimed as nothing.

### `mark12-chief-priest` — group (distinct from the serving priest)

- **SAYS:** chief priests act against Jesus throughout.
- **SMART GUESS:** the priestly aristocracy; older, prosperous, publicly
  composed. Distinct from `archetype-priest`, who is the working temple priest.
- **Look:** authority carried in bearing and cloth, not in a scowl.

### `mark12-scribe-great-commandment` — one-chapter individual

- **SAYS:** he asks which commandment is first, answers wisely, and Jesus tells
  him he is not far from the kingdom of God (12:28–34).
- **SMART GUESS:** middle-aged, a lifetime of study, attentive rather than
  hostile.
- **UNKNOWN:** name, age, everything after this exchange.
- **Look:** the ONE authority figure in Mark 12 the text treats sympathetically —
  Jesus tells him he is "not far from the kingdom" (12:34). Render him attentive
  and open rather than hostile; the interpretive read of his inner heart stays
  the text's, not the image's. Warmth is correct here; he is the chapter's
  counter-example.
- **Representation label:** representative depiction.

### `mark12-widow-two-coins` — one-chapter individual

- **SAYS:** a poor widow puts in two small copper coins, everything she had to
  live on (12:42–44).
- **SMART GUESS:** older; plain, worn, clean clothing; a widow's covered head.
- **UNKNOWN:** age, name, appearance, circumstances.
- **HARD GUARDRAIL (Codex, and I agree):** no dirt, no rags, no theatrical
  misery, no moralised ugliness. Poverty shows in the wear of good-enough
  clothing and in her hands, not in degradation. **Jesus draws the disciples'
  attention to her gift (12:43–44); the image must let the reader regard her with
  dignity, not pity.** Dignity is the whole point of the scene.
- **Representation label:** representative depiction.

### `mark12-temple-crowd` (with wealthy donors folded in) — scene casting

- Not recurring characters. Proportional crowd per Eyes v1.2: a **mixed temple
  crowd — men, women, and families** across the natural Levantine range, without
  an artificial spread; adult men **generally bearded**; a real spread of ages,
  lean to sturdy. Preserve the approved woman/donor background direction. The
  wealthy read wealthy through cloth and bearing — **not** through fatness or
  sneering.

---

## 4. Shot-by-shot reference manifest

Lean and strong: **five images**. Quality over quantity, observed rather than
staged, and deliberately not a row of Bible illustrations.

### Shot 1 — "The Court Where It All Happened" (establishing)

- **Scene / verses:** the temple courts through the whole chapter (12:35, 41)
- **Why it earns its place:** every confrontation in Mark 12 happens in one
  crowded public place. Establish it once and the reader understands the whole
  chapter is a running argument in a busy courtyard, not a series of private
  meetings.
- **Shot language:** wide, high, observational — the scale of the courts, the
  traffic of ordinary temple business.
- **Visible cast IDs:** none identifiable. Crowd only.
- **References to attach:** none.
- **Guardrail:** the temple is Herod's, not Solomon's — the profiles already
  split those. No golden-glow reverence; this is a working religious complex.
- **Tooling:** ✅ can be made now.

### Shot 2 — "Whose Likeness Is This?" (the intimate object)

- **Scene / verses:** 12:15–16
- **Why it earns its place:** the chapter's sharpest moment is a physical
  object being handed over. We know precisely what a Tiberius denarius looked
  like — this is one of the few images in Selah where we can be exact.
- **Shot language:** very close, shallow focus. A working hand holding the
  coin; the challenge blurred behind.
- **Visible cast IDs:** none identifiable (hands only). Optional: Jesus in soft
  background — **attach `jesus/ministry-late` if his face is legible at all.**
- **Guardrail:** the coin must be a **Tiberius denarius**, not a generic or
  later Roman coin. Get the portrait and inscription right or shoot it soft.
- **Tooling:** ✅ now. Highest accuracy-per-effort image in the chapter.

### Shot 3 — "The Question and the Trap" (the confrontation)

- **Scene / verses:** 12:13–17
- **Why it earns its place:** one image carries all three challenge scenes.
  Pharisees and Herodians side by side is visually legible in a way the text
  alone is not — two different kinds of men against one.
- **Shot language:** medium, slightly low, tension in the spacing rather than
  in faces.
- **Visible cast IDs:** `jesus` (**attach `jesus/ministry-late`**), plus
  `archetype-pharisee` and the new `mark12-herodian`.
- **Guardrail:** **no villain coding.** These men are hostile and they are not
  monsters. Contrast them by dress and grooming, never by ugliness.
- **Tooling:** ✅ now (references already approved; the only limitation is the Kelly→Selah reference/import path).

### Shot 4 — "Not Far From the Kingdom" (the intimate human moment)

- **Scene / verses:** 12:28–34
- **Why it earns its place:** the chapter's turn. In a chapter of traps, one
  man asks a real question and Jesus answers him warmly. If we only show
  conflict we misrepresent Mark 12.
- **Shot language:** close two-shot, quiet, the crowd fallen away.
- **Visible cast IDs:** `jesus` (**attach `jesus/ministry-late`**) and the new
  `mark12-scribe-great-commandment`.
- **Guardrail:** the scribe must read as a scholar being *met*, not corrected.
  This is the image where warmth is the accuracy requirement.
- **Tooling:** ✅ now (reference already approved; the only limitation is the reference/import path).

### Shot 5 — "Two Small Coins" (the chapter's heart)

- **Scene / verses:** 12:41–44
- **Why it earns its place:** it is the passage everyone remembers, and it is
  the one most often illustrated badly.
- **Shot language:** medium, observational, from Jesus' seated vantage across
  the court — we watch her the way he watched her. She does not perform.
- **Visible cast IDs:** `mark12-widow-two-coins`; `mark12-temple-crowd` (with
  wealthy donors folded in) as scene casting; optionally `jesus` plus **a
  clearly recorded subset of disciples** for 12:43.
- **Disciple subset if used:** all Twelve now have locked portraits, so any
  subset is castable. **Still record exactly who is shown** rather than relying
  on "the Twelve" as a label — honesty about who is depicted, not scarcity, is
  the reason. Reference-lock holds ~2–3 exact faces per frame; describe the rest.
- **Guardrail:** the treasury chests are the temple's trumpet-shaped
  receptacles; she is dignified, not pitiable; the rich are not caricatured.
- **Tooling:** ✅ now (reference already approved; the only limitation is the reference/import path).

### Deliberately NOT proposed

- **The tenants parable with figures.** Depicting the owner, the son, and the
  tenants as people risks them being read as historical, and Codex's rule is
  explicit. *If* an image is wanted for 12:1–12, propose instead an
  observational shot of a real Judean vineyard — terraced vines, a stone
  winepress, a watchtower, **no figures at all** — captioned as **"a
  visualization of the vineyard Jesus describes"** (Codex ruling), not a scene
  that happened. It grounds the parable in the actual agriculture Jesus' hearers
  knew, and claims nothing.
- **The seven brothers.** A hypothetical in an argument. Never depict.
- **Caesar in person.** He is on the coin. That is the whole joke of the scene.

---

## 5. The temporary production bridge

**Direct answer to Codex's question: no, the current generation lane cannot
accept reference images.** `lib/server/images.ts` is text-prompt-only end to
end — there is no input-image parameter anywhere in it. This was verified
earlier and is unchanged. The IQ-026 API slice remains the permanent fix.

**Smallest manual bridge that preserves provenance and builds nothing
parallel:**

1. **Manifest first.** This document, plus a machine-readable
   `mark-12-cast-manifest.json` stored beside the Mark 12 image plan, listing
   per shot: verses, visible cast IDs, exact portrait asset paths to attach,
   representative-role briefs, and guardrails. One artifact, ingestible later
   by the permanent pipeline without rewriting.
2. **Generate ChatGPT-side using the reference-lock method** — the path
   validated today: portrait→portrait, portrait→scene, and **two** exact locked
   faces held simultaneously in one scene, plus an authored crowd. **What is NOT
   yet proven: three or more exact faces held at once, and direct intimate
   close-ups** — treat those as unvalidated and frame around them (2–3 exact
   faces, the rest described) until they are tested. $0, and it is the only path
   that supports references at all right now.
3. **Import the approved output** through the storage bucket the image lane
   already uses, bound through the **existing published-image-redo claim →
   candidate → apply flow**. That lane already handles digest binding, owner
   approval, and rollback. Nothing new is invented; the only missing piece is a
   way to hand it a file instead of a generated one.
4. **The one small piece of code required** — and I have NOT written it: a
   local, owner-run script that uploads an approved file into the existing
   bucket and registers it as a redo candidate for owner approval. **A script,
   not a public route** — no new HTTP surface, no new permanent system, and it
   dies the day IQ-026 lands. **Returning this for Jason/Codex approval rather
   than building it**, per the instruction.
5. **Provenance recorded with the asset:** cast IDs shown, reference files
   attached, prompt used, and the date — so a face can always be traced back to
   the portrait it was locked to.

---

## 6. Completion handoff

**Ready now:**
- Role inventory with parable/hypothetical figures firewalled from the cast.
- Database audit — updated: all Twelve are complete (12/12 LOCK), and the six
  Mark 12 supporting roles are cast and approved (portraits committed locally).
- Five-shot manifest with cast IDs, references, and guardrails.
- Bridge design using only existing machinery.

**Done since first draft (2026-07-24):**
- The six supporting briefs are cast and approved (`mark12-sadducee`,
  `mark12-herodian`, `mark12-chief-priest`, `mark12-scribe-great-commandment`,
  `mark12-widow-two-coins`, `mark12-temple-crowd`).
- The James-Alphaeus recast is DONE (older/plainer) and Simon's aged
  re-audition is promoted — both collisions resolved, 12/12 LOCK.

**Needs Jason or Kelly:**
- Approve the five-shot set (or cut/add).
- Decide whether the vineyard observational image is wanted for 12:1–12.
- Approve the upload-script bridge, or say wait for IQ-026.

**Needs Codex:**
- Review the six briefs for SAYS/SMART GUESS/UNKNOWN discipline.
- Rule on whether a figureless vineyard image is acceptable for a parable.
- Confirm the Sadducee/Herodian/chief-priest distinctions are historically
  sound.
- Confirm `jesus/ministry-late` is the correct stage for Passion week rather
  than `passion`.

**Priced decision, later:** generation cost per approved shot, quoted exactly
before anything runs. Nothing has been spent.
