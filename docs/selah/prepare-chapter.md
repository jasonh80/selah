# Prepare Chapter (owner decision A5, board #29, 2026-07-16)

Preparation is one owner click, not a PR. Studio shows the Brain's whole
proposal for a chapter — verse movements, the ten guidance notes, locations,
and watch-outs — on one scrollable screen. The owner reads it once and clicks
**Approve & prepare**. That records a digest-bound approval row and seeds the
exact reviewed notes; nothing is generated, fetched from the ESV, or
published.

## What moved, and what did not

- **Moved to the database:** only the *approval itself* (who, when, evidence,
  and the three digests). Table: `chapter_setup_approvals`, one row per slug.
- **Still version-controlled code:** all the *content* the approval binds —
  `mark-sprint-guidance.v1.json` and `mark-sprint-acceptance.v1.json`. Every
  digest is recomputed from those artifacts at read time, so a stored row can
  only ever approve the exact reviewed packet. Mark 7 and Mark 8 keep their
  frozen code-literal receipts unchanged.
- **Unchanged gates:** confirm-before-spend, manifest binding, kill switches,
  publish review digests, and the alias-aware serve boundary (which now also
  requires the receipt, so connecting a chapter never loosens serving).

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
