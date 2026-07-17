# Maps config lane — Mark 7 & Mark 8 (PR #41)

Status: **corrected two-axis model, owner-approved 2026-07-17.** The first
version of this lane compressed everything into one axis (`known→pin,
debated→area, none→text`); Codex's PR #41 review rejected that — correctly —
because certainty alone cannot determine geometry, and because the corrected
entries had not been re-presented to the owner before the Mark 7 receipt
re-mint. The corrected model and the exact entries below were presented to
Jason in plain English in the 2026-07-17 working session and approved
("Approve as shown"); that approval is memorialized on PR #41. Final gates
before ship: Codex exact-head re-review and Jason's rendered-map look.

## The model (lib/prepare-locations.ts)

Two **independent** facts per place, plus why it is shown:

| axis | values | meaning |
|---|---|---|
| `featureKind` | point · region · route · text-only | what shape it honestly has |
| `certainty` | known · probable · debated · unknown | how sure the identification/extent is |
| `role` | event · context | where it happened vs. orientation |

Allowed combinations are enforced (`prepareLocationComboAllowed`): a
**debated point may not exist** — a disputed identification must widen to a
region (candidate sites) or drop to text-only rather than assert a single
dot. Map treatment derives from **featureKind** (`prepareLocationMapTreatment`),
never from certainty alone:

- `point` (always known) → pin
- `region` → glow area marked approx; label carries the certainty qualifier
  ("approx." / "probable" / "debated")
- `route known` → a precise drawn path is allowed — known endpoints alone
  never make the connecting road known
- `route probable` → the text gives the ORDER of places but not the road: a
  broad, obviously-stylized corridor sweep may be drawn, never a precise
  line (owner amendment 2026-07-17 — what the Mark 7 guardrail always said:
  "a broad possible route, never a false precise line")
- `route unknown` / `text-only` → nothing drawn; named in captions

Legacy entries (`known/debated/none` — the owner-approved Mark 9 packet,
digest-bound byte-identical) normalize losslessly at read time
(`normalizePrepareLocation`) and are never rewritten on disk, so the recorded
Mark 9 approval is undisturbed.

Enforcement is `scripts/verify-maps-honesty.ts` (prebuild gate): every
pin/region in a checked chapter is classified (event `locationName` or
`context: true`, never both), context overlays may not reuse approved names,
every path must reference a known **route** entry, every approved entry must
render with its exact treatment, and negative controls prove violations fail.

## The approved entries

**Mark 7** (all in `mark-sprint-acceptance.v1.json`):

| name | kind | certainty | role |
|---|---|---|---|
| Gennesaret | point | known | context |
| Tyre | point | known | context (the house: never pinned) |
| Sidon | point | known | context |
| Decapolis | region | known (approx boundary; healing spot unpinned) | event |
| Route Tyre to Sidon to Decapolis | route | probable — broad corridor sweep, never a precise line (owner amendment 2026-07-17) | event |

**Mark 8:**

| name | kind | certainty | role |
|---|---|---|---|
| Dalmanutha | text-only | unknown | event |
| Bethsaida | region | debated (et-Tell vs el-Araj — area covers both candidates) | event |
| Caesarea Philippi | point | known | context (confession = surrounding villages; no event pin) |
| Feeding of the 4,000 | region | probable (eastern shore) | event |

## Receipt impact

Locations are digest-bound (PR #40), so the Mark 7 entries re-mint that
chapter's literal receipt — `notes_digest` byte-identical, evidence text
records this approval trail honestly. Mark 8's frozen contract binds
guidance+notes only (not the acceptance fixture), so its live receipt is
untouched. Mark 9 entries are untouched.

## Rendering: real map engine (owner decision, 2026-07-17)

After seeing the static-image approach, the owner rejected it ("not refined")
and chose a **real map engine**: MapLibre GL (open-source, no API key, no
metered cost) with real satellite tiles, true zoom/pan, and genuine modern
borders/city labels as a toggleable layer. The hand-authored percentage
overlays for Mark 7/8 were therefore **stripped from this PR** — this lane
now lands only the data model, the fixture entries, the receipt re-mint, and
the honesty gate. Approved places become real lat/lng coordinates in the
engine lane (`feat/maps-engine-spike`), and `verify:maps-honesty`'s render
checks re-arm automatically the moment a chapter map config exists.

## Sequencing

1. ✅ Corrected model + exact entries owner-approved (2026-07-17 session,
   memorialized on PR #41).
2. ✅ Implemented: normalizer + combo rules, fixture entries, Mark 7 re-mint,
   hardened verifier. Static drawing configs stripped per the engine decision.
3. Codex exact-head re-review of the data-only PR.
4. Maps engine lane: MapLibre spike → owner screenshot review → wire the
   approved entries as geo-layers → verifier extension → its own PR.

No generation, spend, publish, or live-data change anywhere in this lane.
