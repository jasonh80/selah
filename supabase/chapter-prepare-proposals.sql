-- Run ONCE in the Supabase SQL editor (owner action, same convention as every
-- table here). Until this table exists, the self-serve Prepare lane fails
-- closed: no proposals can be created, and nothing else changes.
--
-- chapter_prepare_proposals (IQ-011): immutable, digest-bound preparation
-- proposals for the self-serve Prepare step. One row per proposal attempt;
-- rows are never updated except the status transitions
--   generating -> running (atomic worker consume, BEFORE any spend)
--   generating -> failed  (failed trigger: worker provably never invoked)
--   running    -> proposed | failed
--   proposed   -> approved | superseded
--   (a stale generating/running claim past the worker's maximum lifetime may
--    be conditionally failed by the next create — see prepare-proposals.ts)
-- enforced by conditional writes in lib/server/prepare-proposals.ts. The
-- partial unique index makes the row insert itself the single-use claim:
-- only one 'generating' proposal can exist per chapter at a time.
create table if not exists chapter_prepare_proposals (
  id uuid primary key,
  slug text not null,
  status text not null check (status in ('generating','running','proposed','failed','approved','superseded')),
  job_id text not null,
  proposal_json jsonb,
  proposal_digest text,
  source_digest text,
  brain_digest text,
  model text,
  schema_version text,
  error text,
  cost_usd numeric,
  created_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  evidence text
);

create unique index if not exists chapter_prepare_proposals_one_generating
  on chapter_prepare_proposals (slug)
  where status in ('generating','running');

create index if not exists chapter_prepare_proposals_slug_created
  on chapter_prepare_proposals (slug, created_at desc);

alter table chapter_prepare_proposals enable row level security;
-- No policies on purpose: service-role access only, like the other tables.
-- Explicit minimum grants (current Supabase guidance no longer guarantees
-- automatic table grants for the Data API): service_role only; anon and
-- authenticated stay blocked by RLS-without-policies AND absent grants.
grant select, insert, update on chapter_prepare_proposals to service_role;
