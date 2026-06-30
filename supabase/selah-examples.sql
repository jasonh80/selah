-- Selah Brain — Approved Examples layer. Run ONCE in the Supabase SQL editor.
-- A small set of approved exemplars (voice, structure, scene_check, application,
-- image_direction) retrieved 1–2 at a time by genre to demonstrate the desired
-- register. Service role bypasses RLS.
create table if not exists public.selah_approved_examples (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_title text,
  genre text not null,
  example_type text not null default 'voice',
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.selah_approved_examples enable row level security;
create index if not exists selah_approved_examples_genre_idx on public.selah_approved_examples (genre, active);
