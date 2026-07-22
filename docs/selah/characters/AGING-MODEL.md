# The Selah Aging Rule (v1.3 — FINAL, ratified by owner in session 2026-07-21)

*Owner-defined and RATIFIED (Jason + Kelly, in session, 2026-07-21). This is the house rule
for how old any biblical character LOOKS in Selah imagery, in every era. It
exists so portraits are a policy, not a per-image guess — no one's Bible art
has ever had one. The final shape (weighed across three curves and two endpoints): you look
exactly as old as a MODERN person the same share of the way through their
life — they age like we do, just on their own clock — and completing a full
lifespan ends at the MAXIMUM human face, ~120 (the Genesis 6:3 cap; the
modern record is 122). Methuselah, the longest human life, dies wearing the
oldest human face there is.*

## The rule

1. **Childhood is universal.** From 0 to 20, everyone in every era grows up
   exactly like today. A ten-year-old looks ten, in Eden or in Galilee.
   (Fixed in every version of this rule.)
2. **After 20, the mirror.** Compute how far through their adult life the
   person is; they look as old as a modern person at the same fraction of a
   modern life. Two-thirds through 147 years looks like two-thirds through
   80 — mid-fifties, not elderly.
3. **The end is honest — and reaches the true maximum.** The final quarter
   steepens so a life completed "full of years" ends looking ~120 — the
   supercentenarian face: collapsed structure, parchment skin, extreme
   frailty. No one skips old age.
4. **Scripture's number sets the clock.** Use the person's recorded lifespan
   when the text gives it; otherwise the era-typical lifespan. A violent or
   early death does NOT change the clock — someone cut down young was aging
   on their era's schedule, not a compressed one.

## The formula

Let `p = (age − 20) / (lifespan − 20)`, clamped to 0…1.

```
apparentAge(age) =
  age                              when age ≤ 20
  20 + 60 × p                      when p ≤ 0.75   (the modern mirror)
  65 + ((p − 0.75) / 0.25) × 55    when p > 0.75   (honest final stretch → 120)
```

For an ordinary ~75-year life the curve tracks real aging closely (a
33-year-old looks ~34), so New Testament chapters simply look like reality.

## Era lifespans (for characters with no recorded number)

| Era | Typical lifespan |
|---|---|
| Pre-flood (Adam → Noah) | ~900 |
| Post-flood decline (Shem → Terah) | use recorded; ranges 600 → 205 |
| Patriarchs (Abraham → Joseph) | ~150 |
| Exodus generation | ~120 |
| Judges → Monarchy → Exile | ~75 |
| New Testament era | ~75 |

## Worked examples (the calibration set)

- **Adam** (930): created full-grown looking ~20 — never a newborn. At 100
  he looks **~25**; at Seth's birth (130) **~27**. He spends centuries in his
  prime and dies at 930 looking **~120** — as does Methuselah at 969, the
  longest life wearing the oldest face.
- **Sarah** (127): at 89 — taken into Abimelech's house — she reads
  **~59**. Remarkable, and the text itself treats it as remarkable.
- **Jacob** (147): flees at 77 reading **~47**; wrestles at Peniel at ~97
  reading **~56** — gray, weathered, formidable; stands before Pharaoh at
  130 reading **~91** ("few and evil have been my days"); dies at 147
  looking **~120**.
- **Moses** (120): burning bush at 80 → reads **~56**, gray from the desert
  years. Dies at exactly the 120 cap looking **~120**, yet "vigor unabated"
  (Deut 34:7) — vigor is not the same thing as looks.
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
Ordinary cases (NT-era adults) get nothing — no boilerplate, one entry point
per idea. The full rule lives ONCE as a short reader-facing note on the
People pages ("Why do they look that age?"); captions may reference it, never
restate it. Final reader wording goes through the Selah Voice editorial gate
like all copy.
