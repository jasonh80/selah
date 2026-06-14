# Supabase setup (storage for global chapter workups)

This connects Selah to Supabase so global chapter workups are loaded from the
database. **No OpenAI is involved yet** — we seed the existing generated Exodus 27
fixture and prove the read-through works.

> ⚠️ **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It is used
> server-side only (in `lib/server/*`). Only `NEXT_PUBLIC_*` values reach the
> client, and the app does not need the anon key yet.

## 1. Create a Supabase project
Go to https://supabase.com → New project. Note the project URL and keys from
**Project Settings → API**:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)

## 2. Run the schema
In the Supabase dashboard → **SQL Editor**, paste the contents of
[`supabase/schema.sql`](../supabase/schema.sql) and run it. This creates
`chapter_workups`, `cost_events`, `generation_jobs`, and the
`user_chapter_layers` placeholder, and enables RLS.

## 3. Add env vars to Netlify
**Site configuration → Environment variables**, add:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

## 4. Redeploy
Trigger a deploy so the new env vars take effect.

## 5. Seed Exodus 27
Locally, with the same env vars exported in your shell:
```
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm install
npm run seed:exodus-27
```
This validates the fixture, adapts it to the render model, and upserts it into
`chapter_workups` as **reviewed** (`source = generated-fixture`). The render-ready
`ChapterWorkup` is stored in `workup_json`.

Verify it landed:
```
npm run verify:supabase
```

## 6. Confirm `/today` still renders
Open https://selahlearn.netlify.app/today. With Supabase seeded, the bottom
transparency stamp should read **`Source: Supabase`**. If Supabase is empty or
unconfigured, it falls back to **`Source: generated fixture`** and still renders.

## Load priority
```
Supabase ready/reviewed workup  →  use Supabase
else generated fixture (dogfood) →  use generated fixture
else                              →  hand-authored
```

`/chapter/psalm-23` still 404s — lazy generation is a later phase.
