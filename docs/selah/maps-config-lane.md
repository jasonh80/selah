# Maps config lane — Mark 7 & Mark 8 (prep spec, NOT live)

Status: **owner-approved and implemented.** Jason approved the certainty →
map-treatment mapping and the proposed entries on 2026-07-17 ("yes, go
ahead"); this PR carries the implementation. The mapping is enforced by
`verify:maps-honesty` (wired into prebuild). Two small deviations from the
proposal, flagged for review: the Region-of-Tyre display now says the known
*city* is pinned (the proposed text said "the region is shown", which
contradicted the approved known→pin rule), and the Dalmanutha
Magadan/Magdala variant stays in the location display instead of moving to
`textual_variants` (Mark 8 is published; this lane only adds locations to its
bound fixture entry).

## Why this needs a decision first

Two certainty vocabularies exist in the tree and they do not line up:

| Layer | File | Vocabulary |
|---|---|---|
| **Prepare screen locations** (owner-approved, digest-bound) | `lib/server/prepare-chapter-proposal.ts`, `lib/studio-prepare-chapter.ts` | `known` · `debated` · `none` |
| **Map render overlays** | `lib/maps/chapter-maps.ts` (`BoundaryCertainty`) | `known` · `approximate` · `traditional` · `representative` |

The Prepare model is the one Jason already approved for Mark 9 (Capernaum
`known`, Transfiguration mount `none`, Galilee passage `none`). For a map to
render a Prepare-approved location honestly, the map's visual treatment must be
**derived from the Prepare certainty**, not authored independently — otherwise a
note could say "no pin" while the map drops a pin. So the map layer should stop
authoring its own certainty for *event locations* and instead render each
Prepare location entry through a fixed mapping:

| Prepare certainty | Map treatment | Meaning shown |
|---|---|---|
| `known` | **pin** at the real coordinate | specific, identified place |
| `debated` | **glow** area + label "· debated", no pin | area argued, no single agreed point |
| `none` | **no pin, no glow** — named in caption/text only | unnamed or unrecorded route; never invented |

Curated *background* geography (regions, territories, tribal allotments) keeps
the richer `BoundaryCertainty` vocabulary — that's landscape context, not the
chapter's event sites, and is never in tension with a Prepare "no pin".

**This mapping is the thing to approve.** Once approved it becomes a small pure
function (`prepareCertaintyToMapTreatment`) with a verifier, so no map config
can ever contradict an approved location entry.

## Proposed Mark 7 location entries (for the acceptance fixture)

Same shape as Mark 9's approved entries (`{ name, certainty, display }`).
Geography: Gennesaret → region of Tyre → Sidon → Decapolis (Sea of Galilee).

```jsonc
[
  { "name": "Gennesaret", "certainty": "known",
    "display": "Known plain on the NW shore of the Sea of Galilee (the crowd of 6:53–7:1 carries in); shown as a point." },
  { "name": "Region of Tyre", "certainty": "known",
    "display": "Jesus withdraws to the region of Tyre (7:24), a known Phoenician coastal city and its territory; the exact house is unrecorded, so the region is shown, not a house pin." },
  { "name": "Sidon", "certainty": "known",
    "display": "Named on the return route (7:31), a known coastal city north of Tyre; shown as a point." },
  { "name": "Decapolis", "certainty": "debated",
    "display": "The deaf man is healed 'in the region of the Decapolis' (7:31) — a league of cities SE of the Sea of Galilee. The exact spot is not given, so a general area is shown, no pin." },
  { "name": "Route Tyre→Sidon→Decapolis", "certainty": "none",
    "display": "The path of 7:31 is famously roundabout and its exact line is unrecorded — no drawn route, only the named places." }
]
```

## Proposed Mark 8 location entries

Geography: Dalmanutha → Bethsaida → Caesarea Philippi. Includes the best honest
teaching case in the sprint — **Dalmanutha, a genuinely unidentified place.**

```jsonc
[
  { "name": "Dalmanutha", "certainty": "none",
    "display": "'The district of Dalmanutha' (8:10) has never been securely identified — no site is agreed. No pin; the uncertainty is stated plainly (some manuscripts read Magadan/Magdala, itself debated)." },
  { "name": "Bethsaida", "certainty": "known",
    "display": "The blind man is healed at Bethsaida (8:22), a known town near where the Jordan enters the Sea of Galilee; shown as a point." },
  { "name": "Caesarea Philippi", "certainty": "known",
    "display": "Peter's confession comes 'on the way to the villages of Caesarea Philippi' (8:27), a known site at the foot of Mount Hermon; shown as a point." },
  { "name": "Feeding of the 4,000", "certainty": "debated",
    "display": "The feeding (8:1–9) is on the Decapolis / SE side, but Mark gives no exact spot — a general area, no pin." }
]
```

Notes: Dalmanutha's textual variant (Magadan/Magdala) should ride the chapter's
existing `textual_variants` field, not the location display, to keep the digest
binding clean.

## Map render configs (drafted, held)

Draft `CHAPTER_MAPS["mark-7"]` and `["mark-8"]` (bigPicture Galilee + local
satellite, overlays derived from the entries above via the mapping) are ready to
add once the model is approved. Both reuse the existing
`/img/maps/galilee-satellite.jpg` and `levant-region.jpg` bases — no new imagery
needed for a first pass. Street View stays `roadmap` (no key wired).

## Sequencing (all gated)

1. **Jason approves the certainty→treatment mapping** (below).
2. Add the location entries to the acceptance fixture → they flow into the
   Prepare screen and become **digest-bound** (so the map can trust them).
3. Land `prepareCertaintyToMapTreatment` + a verifier that fails if any map
   event-pin exists for a `none` location.
4. Add the drafted `CHAPTER_MAPS` configs, deriving event overlays from entries.
5. Owner reviews the rendered Mark 7/8 maps before they ship.

No generation, spend, or publish anywhere in this lane.

---

## ✅ DECISION — approved 2026-07-17

Jason approved the **certainty → map treatment** mapping:

- `known` → **pin** at the real coordinate
- `debated` → **glow area, no pin**, labelled "· debated"
- `none` → **no pin, no glow** — named in the caption/text only

It is now the enforced rule (`prepareCertaintyToMapTreatment` in
`lib/maps/chapter-maps.ts`, gated by `scripts/verify-maps-honesty.ts`). Final
step before ship remains the owner's look at the rendered Mark 7/8 maps.

Hardened after Codex's PR #41 review (both P2s): in a chapter with approved
entries, every pin/region must be explicitly classified — event
(`locationName`, treatment-checked) or `context: true` (label may never reuse
an approved location's name) — and every drawn path must reference a `known`
location, so a "none" route (Mark 7:31) can never be drawn. Clustered Levant
pins were also separated (contextual Galilee/Hermon markers became offset
labels; Sidon's label renders left of its dot).
