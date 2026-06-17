-- Selah Brain: managed review rules + chapter-specific notes.
-- Run ONCE in the Supabase SQL editor. Safe to re-run (seeds are guarded).
-- Service role bypasses RLS; RLS is enabled so nothing is readable anonymously.

-- 1) Active, toggleable global rules that shape future generation.
create table if not exists public.selah_brain_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  rule_text text not null,
  category text not null default 'voice',
  active boolean not null default true,
  source_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.selah_brain_rules enable row level security;
create index if not exists selah_brain_rules_active_idx on public.selah_brain_rules (active);

-- 2) Per-chapter review notes (re-applied when that chapter regenerates).
create table if not exists public.chapter_review_notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  tags text[] not null default '{}',
  note text not null default '',
  scope text not null default 'chapter', -- chapter | global | both
  created_at timestamptz not null default now()
);
alter table public.chapter_review_notes enable row level security;
create index if not exists chapter_review_notes_slug_idx on public.chapter_review_notes (slug);

-- 3) Seed the current known Selah rules as active global rules (idempotent).
insert into public.selah_brain_rules (title, rule_text, category, active)
select v.title, v.rule_text, v.category, v.active
from (values
  ('Confident dates in the main UI',
   'Main UI should use confident, simple date language. Put uncertainty in transparency notes, not timeline chips.',
   'voice', true),
  ('No academic hedge phrases',
   'Avoid academic hedge phrases in the main experience, such as "traditionally dated" or "exact dating is approximate." Keep nuance in the transparency drawer only.',
   'avoid', true),
  ('Visual, human Scene Check titles',
   'Scene Check titles should be visual and human, not academic.',
   'voice', true),
  ('No empty Go Deeper links',
   'Do not show empty Go Deeper links. Hide the link or show a graceful fallback.',
   'structure', true),
  ('Warm, pastoral theology',
   'Theology sections should sound warm, pastoral, and practical, not like a seminary worksheet.',
   'theology', true),
  ('Complete before Publish Final',
   'Do not Publish Final until maps, images, and verse notes are complete or intentionally marked as skipped.',
   'structure', true)
) as v(title, rule_text, category, active)
where not exists (
  select 1 from public.selah_brain_rules r where r.title = v.title
);
