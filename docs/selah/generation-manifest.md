# Generation Manifest v2 and protected v3 candidate

> Offline, review-only groundwork. This does not read or write Supabase, alter
> Studio, allowlist a slug, create a draft row, dispatch a job, call a model, or
> authorize generation.

V2 is preserved unchanged as historical evidence. V3 is a separate contract;
it does not reinterpret or auto-upgrade a v2 approval. V3 binds the exact safe
ESV source-bundle projection (assembler/normalizer/validator revisions, fixed
request options, passage and response evidence, ranges, marker counts, and
bundle digest) plus the one exact, deeply frozen OpenAI Chat Completions request.
The request explicitly sets `store: false`; this is a provider-side storage
opt-out request, not a claim of zero retention.

Before a future Mark 8–11 authoring run can spend money or mutate a chapter, a
server-owned preflight must bind the exact:

- chapter identity and reader-display version;
- model and reasoning effort;
- prompt revision and digest of the complete canonical model request, including
  system and user messages, response-format/schema identity, model controls,
  token limit, and reasoning settings—not merely the visible user prompt;
- live-approved Brain version, library digest, ordered rule IDs, and rule-text
  digests;
- approved guidance packet and ordered, stored chapter-note identities;
- one active Mark 6 voice exemplar by stored ID and content digest;
- owner-selected generation source provider, ESV edition, endpoint, published
  terms status, owner-directed use basis, noncommercial constraint, and
  owner-decision digest;
- fixed API-option digest plus ordered context-before/primary/context-after
  references and individual text digests;
- a canonical digest for the complete ordered source bundle; and
- owner-approved digest of the resulting manifest.

The manifest contains identities, status flags, and SHA-256 digests only. It
does not return source text, rule prose, note prose, exemplar content, benchmark
wording, or the assembled prompt.

Text digests bind normalized text: remove one leading BOM, convert CRLF/CR to
LF, and normalize Unicode to NFC. Other whitespace remains significant. They do
not claim byte-for-byte file identity.

## Current result

The version-controlled Mark policy must remain blocked. Brain v1.7 and the Mark
guidance packet are review-only; the live Brain match has not been proved. The
owner selected ESV on 2026-07-12. A protected assembler, fixed request-option
digest, source-overlap gate, and v3 request/manifest composition candidate now
exist only as synthetic-tested offline code. No real passage digest, stored
example identity, live Brain/note snapshot, owner-approved per-run manifest,
one-use fetch/run/persistence authorization, or connected Studio worker exists.

The source decision is documented in `scripture-source-policy.md`. The manifest
records the published-terms ambiguity honestly and never contains ESV text or
an API key.

Run the offline proof with:

```text
npm run verify:manifest
npm run verify:source
npm run verify:manifest-v3
```

The verifiers include synthetic approved manifests and reject changed,
missing, duplicated, reordered, inactive, ambiguous, or unapproved material.
The normal `npm run build` preflight runs this verifier after the Brain and
authoring-contract checks.

## Future integration boundary

Only after the protected Studio safety work lands, the authenticated route may
prepare live materials and call this preflight. That call belongs after access
checks but before allowlist mutation, chapter-row mutation, job creation,
dispatch, or cost. A worker must receive an immutable private snapshot, verify
the same approved manifest digest, and dispatch the exact request object whose
canonical digest was approved. It must use that snapshot rather than re-reading
mutable rules, notes, examples, source, model, or settings.

The current verifier mirrors the runtime request field names and controls, but
that is only a fixture. Before wiring, one server-only request builder must
produce the immutable object used both for hashing and for the SDK call; the
worker must recompute its digest immediately before dispatch. Separately
constructing a “manifest request” and a “runtime request” is not acceptable.

V3 readiness, preflight, and passing-overlap capabilities are process-local,
non-transferable evidence. They are deliberately reusable for exact verification
and do not authorize a fetch, model call, database write, or publication. Runtime
must add separately authenticated, expiring, slug/scope/revision-bound nonces and
atomically consume them once at the corresponding external boundary.

Run authorization, expiry, one-use tokens, concurrency locking, runtime draft
QA, freshness comparison, and publish approval are intentionally separate
future controls. A green offline manifest is necessary; it is never sufficient
to publish a chapter.
