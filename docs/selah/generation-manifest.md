# Generation Manifest v1

> Offline, review-only groundwork. This does not read or write Supabase, alter
> Studio, allowlist a slug, create a draft row, dispatch a job, call a model, or
> authorize generation.

Before a future Mark 8–11 authoring run can spend money or mutate a chapter, a
server-owned preflight must bind the exact:

- chapter identity and reader-display version;
- model and reasoning effort;
- prompt revision and assembled-prompt digest;
- live-approved Brain version, library digest, ordered rule IDs, and rule-text
  digests;
- approved guidance packet and ordered, stored chapter-note identities;
- one active Mark 6 voice exemplar by stored ID and content digest;
- rights-cleared generation source identity, approval state, reference, and
  content digest; and
- owner-approved digest of the resulting manifest.

The manifest contains identities, status flags, and SHA-256 digests only. It
does not return source text, rule prose, note prose, exemplar content, benchmark
wording, or the assembled prompt.

Text digests bind normalized text: remove one leading BOM, convert CRLF/CR to
LF, and normalize Unicode to NFC. Other whitespace remains significant. They do
not claim byte-for-byte file identity.

## Current result

The version-controlled Mark policy must remain blocked. Brain v1.6 and the Mark
guidance packet are review-only; the live Brain match has not been proved; the
OEB source and its digest are not connected; the exact stored exemplar ID and
digest are absent; the assembled prompt does not yet exist; and no per-run owner
authorization has been recorded.

Run the offline proof with:

```text
npm run verify:manifest
```

The verifier includes one synthetic approved manifest and rejects changed,
missing, duplicated, reordered, inactive, ambiguous, or unapproved material.
The normal `npm run build` preflight runs this verifier after the Brain and
authoring-contract checks.

## Future integration boundary

Only after the protected Studio safety work lands, the authenticated route may
prepare live materials and call this preflight. That call belongs after access
checks but before allowlist mutation, chapter-row mutation, job creation,
dispatch, or cost. A worker must receive an immutable private snapshot, verify
the same approved manifest digest, and use that snapshot rather than re-reading
mutable rules, notes, examples, source, model, or settings.

Run authorization, expiry, one-use tokens, concurrency locking, runtime draft
QA, freshness comparison, and publish approval are intentionally separate
future controls. A green offline manifest is necessary; it is never sufficient
to publish a chapter.
