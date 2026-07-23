# The Selah Aging Rule (v1.3 — FINAL, ratified by owner in session 2026-07-21)

*Owner-defined and RATIFIED (Jason + Kelly, in session, 2026-07-21).*

**What this is: a Selah visual convention, not a claim about history.** Nothing
here is taught by Scripture. It is a house rule for how old a biblical
character LOOKS in Selah imagery so that portraits are a consistent policy
rather than a per-image guess. The shape the owner chose (weighed across three
curves and two endpoints): a person looks as old as a MODERN person the same
share of the way through their life — they age like we do, on their own clock —
and a full completed lifespan ends at an extreme old-age face, which this
convention fixes at ~120. **The 120 endpoint is a drawing convention we
adopted, not a biblical maximum**: Genesis 6:3's "120 years" is read by many
interpreters as a countdown to the flood rather than a lifespan cap, and
Scripture records longer lives after it. We picked ~120 because it is roughly
the edge of documented human age (the modern record is 122) and therefore the
oldest face anyone can honestly draw.

## The rule

1. **Childhood is universal.** From 0 to 20, everyone in every era grows up
   exactly like today. A ten-year-old looks ten, in Eden or in Galilee.
   (Fixed in every version of this rule.)
2. **After 20, the mirror.** Compute how far through their adult life the
   person is; they look as old as a modern person at the same fraction of a
   modern life. Two-thirds through 147 years looks like two-thirds through
   80 — mid-fifties, not elderly.
3. **The end is drawn, not skipped.** The final quarter steepens so a life
   completed "full of years" ends at the convention's oldest face: collapsed
   structure, parchment skin, extreme frailty. No one skips old age. This
   stretch is deliberately stylized — it is the part of the curve that is
   least like real aging.
4. **A recorded lifespan sets the clock.** Use the person's recorded lifespan
   when the text gives it; otherwise the era-typical figure below. A violent or
   early death does NOT change the clock — someone cut down young was aging
   on their era's schedule, not a compressed one.

## The formula

Let `p = (age − 20) / (lifespan − 20)`, clamped to 0…1.

```
apparentAge(age) =
  age                              when age ≤ 20
  20 + 60 × p                      when p ≤ 0.75   (the modern mirror)
  65 + ((p − 0.75) / 0.25) × 55    when p > 0.75   (stylized final stretch)
```

For an ordinary ~75-year life the curve stays close to real aging through
early and mid-adulthood (a 33-year-old looks ~34), so New Testament chapters
simply look like reality. Past `p = 0.75` it accelerates hard toward the ~120
face by design — that final quarter is convention, not observation.

## Era lifespans (for characters with no recorded number)

These are working defaults for a drawing rule, not demographic claims.

| Era | Working default |
|---|---|
| Pre-flood (Adam → Noah) | ~900 (recorded) |
| Post-flood decline (Shem → Terah) | use recorded; ranges 600 → 205 |
| Patriarchs (Abraham → Joseph) | ~150 (recorded range) |
| Exodus era | ~75 |
| Judges → Monarchy → Exile | ~75 |
| New Testament era | ~75 |

**On the Exodus era:** ~120 is NOT the default. Moses (120) and Aaron (123)
are recorded exceptions and are treated as such; Psalm 90:10 — attributed to
Moses — puts an ordinary life at seventy, or eighty with strength. An unnamed
Israelite of that generation gets ~75 like any other unknown figure.

## Worked examples (the calibration set)

- **Adam** (930): created full-grown looking ~20 — never a newborn. At 100
  he looks **~25**; at Seth's birth (130) **~27**. He spends centuries in his
  prime and dies at 930 at the convention's oldest face. Methuselah (969) is
  drawn the same way — the curve is proportional, so the longest life and a
  merely long life both finish at the same endpoint.
- **Sarah** (127): at 89 — taken into Abimelech's house — she reads **~59**
  under the rule. Note honestly: Genesis does not say her appearance was
  remarkable for her age, and Selah must not imply that it does. The number is
  the convention's output, nothing more.
- **Jacob** (147): flees at 77 reading **~47**; wrestles at Peniel at ~97
  reading **~56** — gray, weathered, formidable; stands before Pharaoh at
  130 reading **~91** ("few and evil have been my days"); dies at 147 at the
  oldest face.
- **Moses** (120): burning bush at 80 → reads **~56**, gray from the desert
  years. **Guardrail:** Deuteronomy 34:7 says that at his death his eye was
  undimmed and his vigor unabated, so Selah never draws Moses frail, stooped,
  clouded-eyed, or infirm — however old the curve says he looks. Weathered and
  old, yes; diminished, never. Where the convention and the text disagree, the
  text wins.
- **Jesus** (~33 in a ~75 era): reads **~34**. The rule collapses to
  ordinary reality, exactly as the profiles already render Him.

## How profiles carry it

`RepositoryLifeStage.apparentAge` states the LOOK for that stage, computed
from this rule; `approxAge` keeps the chronological truth. Image generation
reads `apparentAge`; study text may cite both ("97 years old — carrying it
like a man of 56").

## Reader-facing disclosure (owner decision, same session)

Explain the look ONLY where it would surprise — an age-gap image (Jacob at
97, Sarah at 89, Moses at 80, any pre-flood adult) gets ONE quiet
"Look closer" line, e.g.: "Jacob is 97 here — in a 147-year life, that's a
man in his mid-50s. Selah ages characters by the share of their life lived."
Any such line must read as Selah's drawing convention, never as something the
Bible says. Ordinary cases (NT-era adults) get nothing — no boilerplate, one
entry point per idea. The full rule lives ONCE as a short reader-facing note on
the People pages ("Why do they look that age?"); captions may reference it,
never restate it. Final reader wording goes through the Selah Voice editorial
gate like all copy.
