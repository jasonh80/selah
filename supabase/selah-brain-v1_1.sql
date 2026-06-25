-- Selah Brain v1.1 — upgrade the rules table to the full library schema.
-- Run ONCE in the Supabase SQL editor. Idempotent (safe to re-run). After this,
-- seed the 89 rules from the app (admin action). Service role bypasses RLS.

-- 1) Add the rich rule fields (keeps existing rows + the review→rule flow working).
alter table public.selah_brain_rules
  add column if not exists rule_id text,
  add column if not exists scope text not null default 'global',
  add column if not exists genre text,
  add column if not exists priority text not null default 'contextual',
  add column if not exists stages text[] not null default '{}',
  add column if not exists source_titles text[] not null default '{}',
  add column if not exists version text not null default '1.1',
  add column if not exists archived boolean not null default false,
  add column if not exists superseded_by text;

-- 2) Canonical rules are unique by rule_id (NULLs allowed for user/review rules).
create unique index if not exists selah_brain_rules_rule_id_key
  on public.selah_brain_rules (rule_id) where rule_id is not null;
create index if not exists selah_brain_rules_priority_idx on public.selah_brain_rules (priority);

-- 3) Preserve prior wording whenever a rule is re-seeded with changed text.
create table if not exists public.selah_brain_rule_history (
  id uuid primary key default gen_random_uuid(),
  rule_id text,
  rule_text text,
  version text,
  archived_at timestamptz not null default now()
);
alter table public.selah_brain_rule_history enable row level security;

-- 4) Archive (do NOT delete) the 6 legacy starter rules — each merges into a
--    canonical SB-xxx rule. Provenance is recorded in superseded_by. Idempotent.
update public.selah_brain_rules set
  active = false,
  archived = true,
  superseded_by = case title
    when 'Confident dates in the main UI' then 'SB-005'
    when 'No academic hedge phrases' then 'SB-006'
    when 'Visual, human Scene Check titles' then 'SB-007'
    when 'No empty Go Deeper links' then 'SB-125'
    when 'Warm, pastoral theology' then 'SB-004'
    when 'Complete before Publish Final' then 'SB-121'
    else superseded_by end
where rule_id is null
  and archived = false
  and title in (
    'Confident dates in the main UI',
    'No academic hedge phrases',
    'Visual, human Scene Check titles',
    'No empty Go Deeper links',
    'Warm, pastoral theology',
    'Complete before Publish Final'
  );
