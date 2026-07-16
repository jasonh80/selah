# Prepare Chapter (owner decision A5, board #29, 2026-07-16)

Preparation is one owner click, not a PR. Studio shows the Brain's whole
proposal for a chapter — verse movements, the ten guidance notes, locations,
and watch-outs — on one scrollable screen. The owner reads it once and clicks
**Approve & prepare**. That records a digest-bound approval row and seeds the
exact reviewed notes; nothing is generated, fetched from the ESV, or
published.

## What moved, and what did not

- **Moved to the database:** the *approval* (who, when, evidence, three
  digests) **plus the exact packet the owner approved** — movements with
  names/reasons, his possibly-edited notes, watch-outs, textual variants,
  and locations. Table: `chapter_setup_approvals`, one row per slug. At every
  read the contract is rebuilt from the stored packet and must match the
  recorded digests, so the row is tamper-evident end to end; the shared
  policy projection (model, source policy, rule set) stays pinned to the
  version-controlled artifacts and can never be smuggled through a packet.
- **Editing:** the ten guidance notes are editable inline before the one
  approval; everything else on the screen is pinned — a submission whose
  movements, watch-outs, variants, locations, or note IDs differ from the
  Brain's current default is refused with a plain reload message.
- **Unchanged gates:** confirm-before-spend, manifest binding, kill switches,
  publish review digests, and the alias-aware serve boundary (which now also
  requires the receipt, so connecting a chapter never loosens serving). The
  receipt is also rechecked before any image claim AND again immediately
  before image spend.

## One-time table creation (Supabase SQL editor)

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
  packet jsonb not null,
  created_at timestamptz not null default now()
);
alter table chapter_setup_approvals enable row level security;
-- No policies on purpose: service-role access only, like the other tables.
```

Until the table exists, everything fails closed: the screen's approval reports
a plain error and no chapter becomes receipted.

## Mark 9 specifics

- Connected to Studio (`CONNECTED_STUDIO_SLUGS`), fail-closed until approved.
- ESV window count is set to 138 (Mark 8 = 38, Mark 9 = 48 with 9:44/9:46
  omitted by the ESV, Mark 10 = 52) — **unverified against the live API**;
  the source-load preflight validates the real count before any credit is
  spent, so a wrong number blocks with a plain message rather than degrading.
- Locations render as "none yet" until the owner approves the location
  library's certainty model; maps ride a later config-only pass.
