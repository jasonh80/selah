# Mega Mark 7 — review artifact

The Mark 6 lane, generalized (see `lib/chapters/revision-previews.ts` +
`verify:mega-revisions` in prebuild). **This artifact is the RECEIVING dock
for Codex's rundown comparison** — the current draft is deliberately minimal.

| Piece | Where |
| --- | --- |
| Base snapshot (live render model) | `base-workup.json` (sha256 `7ac9c91d8ebb3cecc9d36a5800a4c3b06002cfd68373cb94486e02c729d0dfae`) |
| Proposed revision | `lib/ai/fixtures/mark-7-mega-revision.json` |
| Diff | `diff.md` |
| Preview | `/chapter/mark-7-revision-preview` — dev + Netlify previews ONLY (fail-closed) |
| Gate | `verify:mega-revisions` (prebuild): declared-paths-only + word-flat-or-shorter + churchy scan |

## Current state: Codex rundown comparison APPLIED (five fields, -286 words)

Codex compared Jason's Mark 7 Daily Workup/Rundown against the live chapter
(PR #89 review) and rewrote exactly five fields: `quickSummary` and the
`chapter-flow`, `jesus`, `theology`, and `application` insight bodies.
Combined changed copy: 879 -> 593 words. `summary` is NOT changed (it renders
nowhere in the reader UI - flagged for schema cleanup). Codex's final
editorial approval is the copy gate (owner decision 2026-07-20); apply rides
the batched snapshot-first script with the rest of the 7-10 queue.

## What makes it MEGA (owner definition)

Codex's comparison against Jason's Mark 7 Daily Workup/Rundown chats — Codex
holds those sources. Its deltas widen the gate manifest + fixture in review;
its editorial approval is the copy gate (owner decision 2026-07-20). Apply =
batched snapshot-first script with the rest of the 7→10 queue.
