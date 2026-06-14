-- Selah database schema (Phase: storage-ready, before live AI).
-- One shared global workup per Bible chapter. Generate once, save forever,
-- personalize only when needed.
--
-- Apply in the Supabase SQL editor (or via the CLI). Idempotent-ish: uses
-- "if not exists" where practical.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ============================================================
-- chapter_workups — the canonical global workup per chapter
-- ============================================================
create table if not exists chapter_workups (
  id uuid primary key default gen_random_uuid(),
  book text not null,
  chapter int not null,
  slug text not null unique,
  title text not null,
  subtitle text,
  -- draft | generating | ready | failed | reviewed
  status text not null default 'draft',
  -- generated | hand-authored
  source text not null default 'generated',
  workup_json jsonb not null,
  bible_version text,
  reviewed_at timestamptz,
  version text,
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  generation_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint chapter_workups_book_chapter_unique unique (book, chapter),
  constraint chapter_workups_status_check
    check (status in ('draft', 'generating', 'ready', 'failed', 'reviewed'))
);

create index if not exists chapter_workups_status_idx on chapter_workups (status);

-- ============================================================
-- cost_events — every AI-related cost event (admin/analytics)
-- ============================================================
create table if not exists cost_events (
  id uuid primary key default gen_random_uuid(),
  chapter_workup_id uuid references chapter_workups(id) on delete set null,
  user_id uuid null,
  -- chapter_workup_text | image_prompt_generation | image_generation |
  -- personalized_reflection | user_question
  request_type text not null,
  provider text not null,
  model text not null,
  input_tokens int,
  cached_input_tokens int,
  output_tokens int,
  image_count int,
  image_size text,
  image_quality text,
  estimated_cost_usd numeric(10, 4),
  actual_cost_usd numeric(10, 4),
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists cost_events_chapter_idx on cost_events (chapter_workup_id);

-- ============================================================
-- generation_jobs — lazy first-time generation tracking
-- ============================================================
create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  book text not null,
  chapter int not null,
  -- queued | running | complete | failed
  status text not null default 'queued',
  attempts int not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint generation_jobs_status_check
    check (status in ('queued', 'running', 'complete', 'failed'))
);

create index if not exists generation_jobs_slug_idx on generation_jobs (slug);

-- ============================================================
-- user_chapter_layers — future per-user personalization (PLACEHOLDER)
-- Not used yet. Personalized content never lives in chapter_workups.
-- ============================================================
create table if not exists user_chapter_layers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chapter_workup_id uuid references chapter_workups(id) on delete cascade,
  saved_notes jsonb,
  saved_prayers jsonb,
  personalized_reflections jsonb,
  dive_deeper_threads jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- Intent:
--   * chapter_workups: rows with status 'ready' or 'reviewed' are readable by
--     everyone; draft/generating/failed are admin-only.
--   * cost_events: admin-only (no public policy).
--   * generation_jobs: admin-only (no public policy).
--   * user_chapter_layers: private to the owning user.
-- The service-role key bypasses RLS, so the server repository (which uses the
-- service role) can read/write everything. With RLS enabled and no anon policy,
-- a table is effectively locked to the service role — safe by default.
-- ============================================================
alter table chapter_workups enable row level security;
alter table cost_events enable row level security;
alter table generation_jobs enable row level security;
alter table user_chapter_layers enable row level security;

-- Public can read only published chapter content.
drop policy if exists "public read ready workups" on chapter_workups;
create policy "public read ready workups"
  on chapter_workups for select
  using (status in ('ready', 'reviewed'));

-- TODO: when auth is added —
--   * user_chapter_layers: policy using (auth.uid() = user_id) for select/insert/update/delete.
--   * admin role policies for draft workups / cost_events / generation_jobs.
-- cost_events, generation_jobs, draft/failed workups: no anon policy → service-role only.
