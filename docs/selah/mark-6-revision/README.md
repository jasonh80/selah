# Mega Mark 6 — review-only text revision artifact

Board #29 spec (Codex, 2026-07-20 03:18 UTC; owner-approved): a text-only editorial
revision of published Mark 6 — four-responses spine, two-banquet contrast, the owner's
exact approved lines, buddy voice. **No publish, no spend, no live-row writes.**

## What's in this lane

| Piece | Where |
| --- | --- |
| Base snapshot (live Mark 6 render model) | `docs/selah/mark-6-revision/base-workup.json` |
| Proposed revision (10 text paths changed) | `lib/ai/fixtures/mark-6-mega-revision.json` |
| Field-by-field diff (the review surface) | `docs/selah/mark-6-revision/diff.md` |
| Private preview | `/chapter/mark-6-revision-preview` — dev + Netlify previews ONLY (fail-closed; see `lib/chapters/mark-6-revision-preview.ts`; the deploy context is baked at build via `SELAH_DEPLOY_CONTEXT` in `next.config.mjs` because Netlify's raw `CONTEXT` is absent from the SSR runtime — Codex r2 finding) |
| Integrity gate | `npm run verify:mark6-revision` (in prebuild; temporary — remove with this lane) |

## Base provenance

- Fetched read-only from production `https://selahlearn.netlify.app/chapter/mark-6`
  on 2026-07-20, by decoding the page's RSC payload — the exact render model
  production served, byte-complete (no unresolved refs).
- Why not the Supabase row: neither AI holds Supabase credentials (by design), and
  `mark-6` is a protected slug — every repo write path refuses it. The public page is
  the only credential-free read, and it is exactly what readers see.
- SHA-256 of `base-workup.json`:
  `481e57468576d64528964056763796cccb02db7a2273c4176b9b03f987ff6fc0`
- Quirk to expect: the row's inner `workup_json` carries `status: "draft"` /
  `version: "1"` even though the DB row is `reviewed` — both files keep it verbatim.

## Gap report (per spec: "report that gap before expanding scope")

The codebase has **no protected text-revision path**. Versioning/preview machinery
(`chapter_workup_versions`, `/dev/preview/[slug]`, compare/merge) is draft-only and the
mutation guard refuses every write for protected slugs — the only published-row action
that exists at all is the single-IMAGE redo lane (#66), and even that refuses `mark-6`.

So this lane adds the **minimum**, not a framework: the two JSON artifacts, this doc +
diff, a fail-closed preview registration (~10 lines in `registry.ts`), and one
temporary integrity gate. Merging this PR changes **nothing** a production reader sees.

## Approval + apply path

1. **Codex** editorial-approved the artifact at `1e7fcb5` (2026-07-20).
2. **Jason** approved the copy at the same head (board #29, 2026-07-20).
3. **Apply = owner-run, snapshot-first SQL** (`apply-mark-6-revision.sql` in this
   directory; rollback in `rollback-mark-6-revision.sql`). One transaction: archive
   the live row into `chapter_workup_versions`, then update exactly the 10 approved
   text paths — every path guarded against drift; any mismatch aborts everything.
   Serving is unaffected structurally: `mark-6` has no sprint receipt gate, and
   `workup_json` serves as-is. Jason executes in the Supabase SQL editor (neither AI
   holds credentials); Claude verifies live read-only afterward.
