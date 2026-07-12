# Mark 8–11 Scripture Source Policy — ESV

> Owner decision recorded 2026-07-12. This policy selects the source for a
> future protected authoring run; it does not authorize generation, database
> writes, image generation, or publication.

## Decision

Use the **English Standard Version, ESV Text Edition: 2025**, fetched server-side
from Crossway's official ESV API, as the prompt-time Scripture source for Mark
8–11. Do not use the Open English Bible for this sprint.

The owner selected ESV because it is the trusted translation used by the app
and the intended ministry purpose is to share the gospel and teach Scripture.
This is analysis context for original Selah teaching content; it is not model
training or fine-tuning.

## Use basis and honest limitation

- Operational basis: Crossway's published standard ESV API terms plus the
  owner's direction for noncommercial Christian ministry use.
- Crossway's published terms clearly permit qualifying noncommercial API use,
  but they do not explicitly address sending the text to a third-party model
  for prompt-time analysis.
- The owner accepts that uncertainty and directs Selah to proceed. Selah must
  not claim that Crossway issued a special AI-analysis license or endorsement.
- Commercial use is not authorized by this decision. Paid access, ads,
  sponsorships, donation-oriented commercial design, or another commercial
  model triggers a new licensing review before use.

Official references:

- ESV API terms: https://api.esv.org/
- ESV API text endpoint: https://api.esv.org/docs/passage-text/
- Crossway permissions: https://www.crossway.org/permissions/

## Technical contract

For each approved Mark sprint slug, the protected server runner must retrieve
exactly three complete chapters through the official text endpoint:

| Workup | Context before | Primary chapter | Context after |
|---|---|---|---|
| Mark 8 | Mark 7 | Mark 8 | Mark 9 |
| Mark 9 | Mark 8 | Mark 9 | Mark 10 |
| Mark 10 | Mark 9 | Mark 10 | Mark 11 |
| Mark 11 | Mark 10 | Mark 11 | Mark 12 |

The primary chapter governs the workup. Adjacent chapters may ground Book Flow
only; their events must not be blended into the primary chapter.

Before any model call or mutation, the manifest must bind:

- Crossway, ESV, ESV Text Edition: 2025, and the exact API endpoint;
- a digest of fixed API request options;
- ordered roles and requested/validated canonical references;
- a normalized text digest for each returned passage;
- a canonical digest of the complete ordered bundle;
- the owner source-decision digest; and
- the exact complete model-request digest containing the framed transient text.

Any API text change changes the passage, bundle, request, and manifest digests
and therefore invalidates the old run approval.

## Handling rules

- API key and ESV text are server-only.
- Never commit ESV chapter text to the repository.
- Never place ESV text or the API key in logs, manifests, audit messages, error
  payloads, generated workups, benchmark reports, or public source metadata.
- Use the source transiently for the approved request and source-overlap check;
  retain only nonreversible digests and verdicts in this groundwork.
- Do not alter ESV words or label another source as ESV.
- Generated Selah commentary must be original and must not reproduce passage
  text. Reader Scripture remains a separate official ESV API display with its
  required attribution and link.
- The protected runner must use fixed allowlisted Mark layouts, not arbitrary
  user-supplied passage references.

## Still blocked

The source translation is selected, but the source is not connected. Generation
remains blocked until the protected runner, exact API options, returned passage
validation, source-overlap review, owner-bound manifest, Studio safety flow,
Brain approval/live proof, voice exemplar identity, and per-run authorization
all pass. Both generation switches remain off.

The existing reader also needs a separate attribution review before Selah
expands its ESV use. It currently supplies a shortened hard-coded notice as
plain text; the implementation must be checked against the current ESV API
notice and link requirements. This policy branch does not change the reader
component because PR #6 already changes that area.

## Re-review triggers

Re-open this decision before:

- commercial or donation-oriented use;
- model training or fine-tuning;
- public Selah Brain/API distribution;
- durable storage beyond the standard ESV API limits;
- redistribution or synthetic narration of ESV text;
- a material Crossway terms, API, or ESV text-edition change; or
- a change in the third-party model provider or its applicable data controls.
