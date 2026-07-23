# Selah Casting Board

*Owner rulings (Jason + Kelly, in session, 2026-07-21), corrected 2026-07-23
per the Codex #105 honesty review.*

## Provenance is mandatory

Every claim in a character profile is labeled **SAYS** (Scripture states it),
**SMART GUESS** (Selah's defensible inference — occupation, era, geography, or
church tradition), or **UNKNOWN** (the text is silent; any depiction is
*representative*, one plausible person and not the person). Accurate-sounding
prose is not provenance. See `cast-profiles-digest.md` for the labels in use
and what they retired.

## Ruling: the Twelve

**All twelve disciples get distinct recurring faces.** No generic-disciple
background treatment for any of them — each is a cast member with his own
identity profile, continuity anchors, and (once auditioned) an approved
portrait.

### Roster status

Status as of 2026-07-23 (corrected twice — first because the "to author" column
contradicted the digest, then because **"12/12 cast" was wrong**: the twelve
counted was the new-profile batch, not the Twelve. **Ten of the Twelve have
portraits. John son of Zebedee and Judas Iscariot have none, and Mark cannot be
finished without them** — John is in the inner circle at the transfiguration,
Judas carries Mark 14):

| Disciple | Study profile | Portrait | Notes |
|---|---|---|---|
| Peter | ✅ drafted + reviewed | ✅ approved | corrected chronology 2026-07-21; NOT recast (Codex ruling 2026-07-23) |
| John (son of Zebedee) | ✅ drafted + reviewed | ❌ **NO PORTRAIT** | john-apostle; inner circle — Mark 5, 9, 13, 14 all need him. **Must be cast to finish Mark.** |
| Judas Iscariot | ✅ drafted + reviewed | ❌ **NO PORTRAIT** | Mark 14 needs him. **Must be cast to finish Mark.** |
| Andrew | ✅ drafted + reviewed | ✅ approved (keep face) | profile text correction owed: drop the injury/hardship bio |
| James (son of Zebedee) | ✅ drafted + reviewed | ✅ approved | **LOCKED** (Codex cert, candidate A) |
| Matthew (Levi) | ✅ drafted + reviewed | ✅ approved (keep face) | wardrobe simplified; Levi identification = smart guess |
| Thomas | ✅ drafted + reviewed | ✅ approved (keep face) | occupation → UNKNOWN; fringes corrected |
| Philip | ✅ drafted + reviewed | ✅ approved | **LOCKED** (candidate B) |
| Bartholomew (Nathanael) | ✅ drafted + reviewed | ✅ approved | **LOCKED** (candidate C, inference transparency kept) |
| James (son of Alphaeus) | ✅ drafted + reviewed | ✅ approved (keep face) | marked as smart guess throughout |
| Thaddaeus (Judas son of James) | ✅ drafted + reviewed | ✅ approved (keep face) | marked as smart guess throughout |
| Simon the Zealot | ✅ drafted + **corrected** | ⏳ re-audition staged | invented militant biography removed; neutral brief written, not yet run |

(Matthias, Judas's replacement — decide later whether he joins the cast.)

## Mark gaps (next chapters need them)

| Figure | Status | Why Mark needs them |
|---|---|---|
| Herod Antipas | ✅ drafted + reviewed · portrait approved | **LOCKED** (candidate B). Mark 6 (kills John the Baptist), Mark 8 ("leaven of Herod") |
| Herodias | ✅ drafted + reviewed · portrait approved (keep face) | age corrected to ~46 for Mark 6; engineer of John's death (Mark 6) |
| Syrophoenician woman | ✅ drafted + reviewed · portrait approved (keep face) | Mark 7 — unnamed; age is a placeholder, labeled a representative depiction |
| Sadducees (group archetype) | ❌ to author | Mark 12 |
| Scribes (group archetype) | partially (templeScribe exists) | throughout Mark |
| Gentile crowds (archetype) | ❌ to author | Decapolis scenes |

## Sequence (what happens in what order)

1. ✅ **Study profiles** (free, Kelly-reviewed): the 12 profiles above, each
   following the aging rule (AGING-MODEL.md, v1.3) and the era clock (~75).
   Drafted and reviewed in the 2026-07-21 session.
2. ✅ **Audition wall + candidate prompts** built locally; prompts hand-run in
   the owner's ChatGPT (ChatGPT-side path costs $0). The paid API lane still
   waits on the Codex IQ-026 spec with exact per-audition prices.
3. ✅ **Casting** — 12/12 cast by the owner, portraits promoted.
4. ✅ **Mind + Eyes certification** (Codex, 2026-07-23, read-only): 4 locks,
   7 keep-face/provisional with the profile-text corrections now applied here,
   1 true re-audition (Simon, neutral brief). Peter preserved, not recast.
5. ⏳ **Reference-lock test** (owner-run, gates everything visual): does
   attaching an approved portrait actually pin that individual, or is the
   prompt text doing the work? Protocol in the Kelly repo at
   `docs/reference-lock-test.md`. **No scene generation at scale until it
   passes.**
6. ⏳ **Certified re-auditions**, one at a time on the owner's explicit go
   (staged, deliberately not wired into the wall).
7. **Portraits locked** → recurring faces feed chapter images and the
   People pages.

Every visual follows Selah Eyes (house look) and the aging rule; no spend
without the owner's explicit priced confirmation.

## Ruling: bodies match occupations (owner, same session)

A character's build should be what their WORK would plausibly have made it.
Fishermen (Peter, Andrew, James, John) carry broad shoulders and rope-callused
hands; a tax collector (Matthew) may read less weathered than the laborers
beside him; a lifelong shepherd is lean and weathered; a tetrarch (Herod
Antipas) may carry a sedentary court body. Where Scripture records no
occupation, the build stays ordinary-working-man for the era — never
gym-sculpted, never movie-hero (the Samson principle applies to everyone:
extraordinary callings do not imply extraordinary physiques).

**Honesty limit (Codex #105 review, 2026-07-23):** occupation informs a
plausible casting choice; it never proves a physical fact. These are
**SMART GUESS / representative depictions** and the canon must label them so.
Specifically retired as invented detail: Matthew's pale softness and
ink-stained hands, Herod's "compulsory" body type and never-worked hands,
Herodias's litter-bearers, the Syrophoenician woman's water-hauling, and
Simon's hardened-fighter frame. Never let a body type carry a moral verdict.

## Eyes v1.1 audit (2026-07-21): 12-profile batch

11/12 clean on first pass; Herodias's "instrument of power" phrasing softened
per the seductress-villain guardrail. WATCH: some signatureObjects carry
later church iconography (Pentecost flame, winged man, medallion) — correctly
labeled as tradition, but they must NEVER leak into image prompts (no-halo
rule); exclude signatureObjects from prompt assembly when image profiles are
built.

## Studio locations (owner, 2026-07-21)

Portrait generation happens in the owner's ChatGPT web app: project
"Selah Auditions", subfolder "Selah Visual Cast" (project instructions =
docs/chatgpt-project-prompt.md). Local audition wall: /auditions in this
repo's dev app. Automation path: near-term, Codex may batch-run prompts
ChatGPT-side (asked on board #29); long-term, API-driven candidate
generation lands in Studio behind the IQ-026 spec with exact prices.

## Ruling: natural hair variety (owner, 2026-07-22 ET / 2026-07-23 UTC)

*Date verified per Codex #105: the owner exchange was the evening of July 22
Eastern; the earlier "2026-07-23" was the UTC stamp. Both are the same moment.*

Ancient people had normal human variety — Scripture itself discusses bald
and receding men (Leviticus 13:40–41). Never treat the stock "every biblical
man has thick shoulder-length hair" image as fact.

- MIND (knowledge): baldness/thinning/receding existed and is biblically
  acknowledged; the uniform-hair convention is iconography, not history.
- EYES (casting): cast believable variety — bald, thinning, receding, curly,
  short, gray — across ages, builds, complexions, and grooming, while
  maintaining each character's continuity once cast.
- GUARDRAIL: use variety naturally, but never claim a SPECIFIC person was
  bald (or anything else) unless Scripture or reliable evidence supports it.
