# The Selah Eye — visual style guide v1

Named by the owner: **the Selah Eye**. Owner direction (2026-07-20, verbatim spine): *"A distinct Selah look: cinematic,
earthy, natural, historical-documentary realism. Not lacking color, realistic, but
not muted. Shallow depth of field for intimate moments. Variety of images for each
chapter if possible / makes sense. Close ups. Wide, medium, something creative and
unexpected that tells the story without being so obvious."*

Owner-named style reference: the Mark 10 "Jesus walking ahead" road shot — golden
hour, believable, cinematic-but-honest. (Style reference ONLY; that image's
geography is direction-flawed for its verse and is being redone.)

This guide turns that direction into promptable, reviewable language. It changes
NO pipeline behavior by itself — the Kelly-characters spec (IQ-026) decides how it
enters generation (image-stage prompt block and/or Selah Brain visuals rules).
Every existing honesty guardrail (no halos-as-shorthand, no modern objects, no
lettering, period accuracy, visualAccuracyNotes) stays senior to style.

## The Selah Eye, in one line

**A documentary photographer embedded in the first century** — not a painting,
not a pageant, not a movie poster.

## Palette & light

- Natural, available light: sun, sky, oil lamps, fire. Golden hour and blue hour
  welcome; studio light never.
- Earthy base (stone, dust, wool, olive, water) with REAL color present — the
  reds, indigos, and greens people actually wore and grew. Realistic saturation:
  never desaturated "gritty Bible drama," never HDR pop, never teal-and-orange
  grading.
- Skin reads alive; shadows have detail; highlights can bloom naturally at
  golden hour.

## Lens & depth

- Shallow depth of field for intimate moments — a face, hands, bread breaking,
  the fringe of a garment. Background falls away like an 85mm at f/2.
- Deep focus for establishing/wide scenes — geography is a character (ridges,
  lake, wilderness, city on a hill).
- Eye-level and human-height by default; low or high angles only when the story
  earns them (a kneeling beggar's view up; a rooftop view of a crowded courtyard).

## Shot variety per chapter (when the chapter supports it)

Aim for a mixed set, not five versions of the same distance:

| Slot | Feel | Example |
| --- | --- | --- |
| Wide / establishing | geography + scale, deep focus | the lake at dusk, the climb to Jerusalem |
| Medium | people in relationship, small groups | Jesus teaching at a table, disciples arguing |
| Close / intimate | shallow DOF, one truth | hands tearing bread, an unfocused blind gaze |
| Creative / unexpected | tells the story WITHOUT restating it | the empty seat at Herod's table; twelve baskets stacked at frame edge; a colt's tether still swinging |

The creative slot is the storyteller's shot: oblique, suggestive, never captioned
allegory and never symbolic inventions that assert unrecorded facts (honesty
rules unchanged — an empty basket is fine; a glowing dove is not).

## Cohesion (what makes it OURS)

- One chapter = one time of day arc where plausible (scenes feel like the same
  day's shoot, not stock from five sources).
- Recurring faces once the character library (Kelly lane) lands — the same
  Jesus, the same Twelve, aging and weathering consistently across chapters.
- Consistent wardrobe/material logic (wool, linen, leather; regional dyes) and
  consistent geography (the real lake, the real hills — matching our honest maps).
- The camera is a witness, not a director: no posed tableaus, no eye-contact
  with the lens, no choreographed crowds.

## Anti-look (never)

Pageant staging · identical palm-frond parades · European-fantasy Bible art ·
halos/glow as meaning · plastic-clean costumes · day-for-night murk · muted
sepia "old times" wash · modern objects, lettering, or landmarks.

## How this ships (sequencing)

1. Codex reviews this guide (docs-only PR).
2. The Kelly-characters spec (IQ-026) folds it in: character identity +
   THIS style contract, and decides the injection point (image-stage prompt
   block and/or seeded Brain visuals rules — owner-gated as always).
3. Until then, redo notes and new-chapter image prompts may quote this guide
   directly — it is owner-approved direction, not generated style.
