# Generation Manifest v2 and protected v3

> V2 is offline historical groundwork. V3 is connected only to the protected
> Mark 8 pilot. A green manifest is evidence, never permission to generate or
> publish.

V2 is preserved unchanged as historical evidence. V3 is a separate contract;
it does not reinterpret or auto-upgrade a v2 approval. V3 binds the exact safe
ESV source-bundle projection (assembler/normalizer/validator revisions, fixed
request options, passage and response evidence, ranges, marker counts, and
bundle digest) plus the one exact, deeply frozen OpenAI Chat Completions request.
The request explicitly sets `store: false`; this is a provider-side storage
opt-out request, not a claim of zero retention.

Before a protected authoring run can spend money or mutate a chapter, a
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

Brain v1.9 and the exact Mark 8 guidance projection are owner-approved. The
owner selected the official ESV API on 2026-07-12 and directed the protected
source contract to proceed under the recorded permission uncertainty. The
assembler, fixed request options, overlap gate, exact request, v3 manifest,
Studio confirmation, single-use job, authenticated worker, and conditional
private-draft save are connected for Mark 8 only. The first real run has not
occurred; it must still prove the exact live Brain, notes, exemplar, returned
ESV bundle, and owner-confirmed per-run manifest. Mark 9–11 remain blocked.

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

## Runtime boundary

The authenticated route prepares the read-only preview before any allowlist
mutation, chapter-row mutation, job creation, dispatch, or cost. After the owner
confirms the exact digest, the worker rebuilds and verifies that same manifest,
then dispatches the exact frozen request object whose digest was approved.

One server-only request builder produces the immutable object used both for
hashing and for the SDK call. The worker recomputes its evidence before dispatch;
a separate “manifest request” and “runtime request” are not allowed.

V3 readiness, preflight, and passing-overlap capabilities are process-local,
non-transferable evidence. They are deliberately reusable for exact verification
and do not authorize a fetch, model call, database write, or publication. Runtime
must add separately authenticated, expiring, slug/scope/revision-bound nonces and
atomically consume them once at the corresponding external boundary.

Run authorization, signed one-use jobs, concurrency locking, runtime draft QA,
and conditional persistence are implemented for Mark 8. Editorial review,
completion work, image review, and owner publish approval remain separate. A
green manifest is necessary; it is never sufficient to publish a chapter.
