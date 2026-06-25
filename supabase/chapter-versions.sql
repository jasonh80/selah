-- Draft version history for chapter workups. Run ONCE in the Supabase SQL editor.
-- The chapter_workups row stays the single "working draft"; this table is an
-- append-only archive so a new generation never overwrites an earlier draft.
create table if not exists public.chapter_workup_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version int not null,
  label text,
  status text,
  workup_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (slug, version)
);
alter table public.chapter_workup_versions enable row level security;
create index if not exists chapter_workup_versions_slug_idx on public.chapter_workup_versions (slug);
