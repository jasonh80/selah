-- Run ONCE in the Supabase SQL editor (owner action, same convention as
-- chapter_prepare_proposals). Until this table exists, the published-chapter
-- single-image redo lane fails closed: no candidates can be created, and the
-- live chapters are untouched.
--
-- chapter_published_image_redo (Codex APPROVE WITH CONDITIONS, board #29
-- 2026-07-19): the DEDICATED lane for redoing one image on an already
-- published (reviewed) chapter. Candidate state NEVER lives in the live
-- chapter row — it lives here, one row per attempt, append-only except the
-- status transitions
--   queued      -> running     (atomic worker consume, BEFORE any spend)
--   queued      -> failed      (failed trigger: worker provably never invoked)
--   queued      -> rejected    (owner dismisses a provably-stale claim — older
--                               than the worker-token TTL, so zero spend)
--   running     -> candidate | failed | blocked
--   candidate   -> applied | rejected
--   rejected    -> applied     (repair only: a reject that raced an apply is
--                               settled back to the truth — the candidate IS live)
--   failed      -> rejected    (owner dismisses; spend already durably recorded)
--   applied     -> rolled_back (owner-confirmed, revision-bound rollback)
-- enforced by conditional writes in lib/server/published-image-redo.ts.
-- "blocked" (paid work without a durable cost row) stays locked for manual
-- attention, exactly like the draft lane. The partial unique index makes the
-- row insert itself the single-use claim: one live attempt per chapter.
create table if not exists chapter_published_image_redo (
  id uuid primary key,
  slug text not null,
  status text not null check (status in ('queued','running','candidate','failed','blocked','rejected','applied','rolled_back')),
  kind text not null,
  notes text not null,
  binding_digest text not null,
  -- The live row's updated_at at claim time; the binding digest includes it,
  -- so any change to the published chapter makes the claim provably stale.
  base_revision text not null,
  -- The exact live image URL being replaced — the rollback target, and the
  -- "conflicting chapter" check on apply.
  base_src text not null,
  model text not null,
  candidate_url text,
  spent_count numeric not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create unique index if not exists chapter_published_image_redo_one_active
  on chapter_published_image_redo (slug)
  where status in ('queued','running','candidate','blocked');

create index if not exists chapter_published_image_redo_slug_created
  on chapter_published_image_redo (slug, created_at desc);

alter table chapter_published_image_redo enable row level security;
-- No policies on purpose: service-role access only, like the other tables.
grant select, insert, update on chapter_published_image_redo to service_role;
