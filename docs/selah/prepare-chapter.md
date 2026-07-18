# Prepare Chapter (owner decision A5, board #29, 2026-07-16)

Preparation is one owner click, not a PR. Studio shows the Selah Brain's whole
proposal for a chapter — each verse movement with its name and reason, the ten
guidance notes (editable inline), honest location entries, and watch-outs —
on one scrollable screen. The owner reads it, optionally edits any note's
text, and clicks **Approve & prepare** once. That records a digest-bound
approval row binding the exact on-screen packet (including edits) and seeds
those exact notes; nothing is generated, fetched from the ESV, or published.

## What moved, and what did not

- **Moved to the database:** the *approval itself* (who, when, evidence, the
  three digests) plus, when the owner edited notes, the *exact edited note
  texts* the approval binds (`packet_notes`). Table:
  `chapter_setup_approvals`, one row per slug.
- **Still version-controlled code:** the proposal's base content —
  `mark-sprint-guidance.v1.json` (notes) and `mark-sprint-acceptance.v1.json`
  (verse count, movements with names/reasons, watch-outs, locations, textual
  variants). Note ids, order, and count are pinned to the artifact even when
  texts are edited. Every digest is recomputed at read time from the artifacts
  plus the row's own packet, so a stored row can only ever approve the exact
  packet the owner read — any drift in either source answers "no receipt".
  Mark 7 and Mark 8 keep their frozen code-literal receipts (re-minted in PR
  #40 when the projection additionally bound watch-outs and locations;
  content unchanged).
- **Digest-bound in the receipt:** notes (edited or not), verse count, every
  movement range with its name/reason, the displayed watch-outs, the location
  entries, and the shared packet settings (model, source policy, rule ids).
- **Unchanged gates:** confirm-before-spend, manifest binding, kill switches,
  publish review digests, and the alias-aware serve boundary (which also
  requires the receipt, so connecting a chapter never loosens serving). The
  paid-image path now re-verifies the receipt before the claim and again
  immediately before model spend.

## One-time table creation (Supabase SQL editor)

> Owner decision — do not run until the plain-English rationale on PR #40 is
> agreed. Until the table exists, everything fails closed: the screen's
> approval reports a plain error and no chapter becomes receipted.

```sql
create table if not exists chapter_setup_approvals (
  slug text primary key,
  scope text not null,
  approved_by text not null,
  approved_at timestamptz not null,
  evidence text not null,
  guidance_digest text not null,
  notes_digest text not null,
  receipt_digest text not null,
  packet_notes jsonb,
  created_at timestamptz not null default now()
);
alter table chapter_setup_approvals enable row level security;
-- No policies on purpose: service-role access only, like the other tables.
```

## Inline note editing (v1 semantics)

- The owner may edit note **text** only; ids, order, and count stay pinned to
  the reviewed artifact (fail-closed on any structural mismatch).
- On approve, the screen submits the exact on-screen texts; the server
  recomputes the packet digest for those texts (read-only
  `prepare_chapter_preview`) and the echoed digest must match — approval can
  never bind anything but what was displayed.
- The edited texts are stored with the approval row and every later gate —
  seeding, serve boundary, publish validation, manifest policy, runtime note
  validation — rebuilds the contract **from the stored packet** and verifies
  digests, deterministic row ids, and live DB rows against it. Editing a note
  after approval (in the DB or the artifact) fails closed exactly as before.

## Mark 9 specifics

- Connected to Studio (`CONNECTED_STUDIO_SLUGS`) **and** the runnable text
  path (`CONNECTED_PROTECTED_TEXT_SLUGS` derives from it), fail-closed until
  approved on-screen: no receipt row → no setup, no draft, no images, no
  serve, no publish.
- ESV window count is set to 138 (Mark 8 = 38, Mark 9 = 48 with 9:44/9:46
  omitted by the ESV, Mark 10 = 52) — **unverified against the live API**;
  the source-load preflight validates the real count before any credit is
  spent, so a wrong number blocks with a plain message rather than degrading.
- Locations are real, digest-bound entries using the approved certainty
  model — a **known** point (Capernaum), a **debated** area, or **none** (the
  unnamed Transfiguration mountain, the unrecorded Galilee route get no pin).
  Map rendering still rides a later config-only pass; the screen states each
  entry honestly today.

## Self-serve Prepare proposals (IQ-011, 2026-07-18)

One-time table creation (Supabase SQL editor) — run `supabase/chapter-prepare-proposals.sql`
ONCE. Until the table exists, the self-serve Prepare lane fails closed: no
proposals can be created and nothing else changes. Service-role access only
(RLS enabled, no policies), like the other tables.

The lane serves every chapter OUTSIDE the protected Mark fixture flow: one
explicitly-confirmed bounded model call proposes movements, guidance,
watch-outs, and honest three-axis locations only when useful; the current
Selah Brain rules ride into the proposal prompt and their digest is stored
as provenance; server validation is fail-closed; the owner's digest-bound
"Approve & set up" unlocks the separately confirmed generic draft flow,
whose prompt loads exactly the approved proposal (fail-closed at draft time
too). Codex reviews completed launches after the fact; it is not a
pre-launch gate.

Not built yet (v1, deliberate): on-screen editing of a proposal — reject and
regenerate instead. A stale generating claim past the worker's maximum
lifetime is cleared honestly by the next create attempt.
