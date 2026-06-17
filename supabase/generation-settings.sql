-- Selah admin generation control (v1). Run once in the Supabase SQL editor.
-- Routine generation toggles live here (changeable from /admin/generation without
-- a redeploy). Secrets (OpenAI key, service-role key, DEV_ADMIN_TOKEN) stay in
-- Netlify. RLS is ON with no policies → only the service-role key (server-side)
-- can read/write these; the anon/browser key cannot.

create table if not exists generation_settings (
  id                       text primary key default 'global',
  text_generation_enabled  boolean not null default false,
  image_generation_enabled boolean not null default false,
  allowed_slugs            text[]  not null default '{}',
  selected_text_model      text    not null default 'gpt-4o',
  selected_image_model     text    not null default 'gpt-image-1',
  daily_budget_limit_usd   numeric,
  require_confirm          boolean not null default true,
  updated_at               timestamptz not null default now()
);

insert into generation_settings (id) values ('global') on conflict (id) do nothing;

create table if not exists generation_audit_log (
  id             uuid primary key default gen_random_uuid(),
  action         text not null,
  slug           text,
  model          text,
  estimated_cost numeric,
  actual_cost    numeric,
  status         text not null,         -- started | succeeded | failed
  message        text,
  created_at     timestamptz not null default now()
);

alter table generation_settings  enable row level security;
alter table generation_audit_log enable row level security;
