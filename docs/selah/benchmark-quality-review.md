# Selah Benchmark Quality Review v1

> Offline, review-only groundwork. This does not call a model, read or write
> Supabase, change Studio, generate a chapter or image, or authorize publishing.

## Purpose

Selah Brain should write each chapter freshly from the approved Scripture
source, rules, chapter guidance, and one digest-bound voice exemplar. The
strongest recent Mark and Exodus workups establish the editorial quality bar;
their private wording is not an authoring source.

The benchmark review answers a different question from structural QA:

- structural QA asks whether the draft is complete and mechanically valid;
- benchmark review asks whether it is as useful, grounded, warm, deep, safe,
  memorable, and chapter-specific as Selah's strongest approved work;
- owner review decides whether the exact artifact may advance.

No one result can substitute for the other two.

## Required sequence

1. Freeze and approve the generation manifest.
2. Author a fresh chapter without private benchmark wording.
3. Run deterministic structural, source-overlap, and draft-freshness checks.
   Freshness covers both the private benchmark set and the exact approved voice
   exemplar the author was allowed to see.
4. Bind the exact draft, manifest, structural, overlap, freshness, benchmark,
   and exemplar digests.
5. Give an authenticated independent reviewer access to the draft and the
   appropriate benchmark mode. Mark 8–10 use same-chapter comparison; Mark 11,
   for which no recent private chapter workup was found, uses cross-chapter
   voice/quality comparison plus its independently researched guidance.
6. Resolve every evidence and remediation path against one versioned artifact
   registry that binds the draft, manifest, structural/overlap/freshness
   reports, guidance, render evidence, rubric policy, and resolver version;
   also scan all review prose for private benchmark or exemplar leakage.
7. Persist only conclusions, ratings, resolved evidence paths, and fresh targeted
   revision instructions—never private benchmark excerpts.
8. Revise only the failed fields—or correct the manifest/review process or run
   a clean generation when that is the honest remedy—then create new digests.
9. Send a qualifying review to the owner. It remains
   `needs_owner_review`, never auto-approved.

## Editorial bar

The versioned rubric is
`lib/ai/quality/selah-benchmark-rubric.v1.json`. It weighs thirteen dimensions
to 100 points. Advancement to owner review currently requires:

- at least a provisional 85/100;
- no criterion below 3 (responsible and publishable);
- a 4 for Selah voice, source/rights integrity, and fresh authorship;
- no invalid, missing, duplicated, or unresolved review evidence;
- a passing privacy scan over every persisted review field; and
- a remediation plan whose maximum possible improvement can actually reach
  the threshold whenever the current score is below it.

An average can never conceal one weak criterion. Ratings of 0 or 1 block; a 2
requires targeted revision. A score is internal editorial evidence, not a
public promise or a substitute for judgment.

The 85 threshold and weights are deliberately marked **provisional**. They must
be calibrated by scoring Mark 6, the strongest recent Mark/Exodus workups, and
several known weaker older workups. Until that exercise demonstrates useful
separation, a passing code result is called `benchmark_ready`, not “proven
comparable.”

BMQ-11 reviews only the truthfulness and usefulness of copy-stage Scene Checks
and visual directions. It does not prove the final image count, hero choice,
image-plan registry, generated assets, or rendered quality. The current
authoring scaffold still emits three rigid image concepts; issue #5 must
reconcile that with Selah's chapter-driven three-or-five system before a real
Mark 8–11 run can claim visual readiness. Final images remain a separate
completion gate after copy is frozen.

## What the validator proves

`lib/server/selah-benchmark-review.ts` is a pure validator and scorer. It can
prove that a review submission:

- names the exact chapter;
- is bound to lowercase SHA-256 identities for the generation manifest,
  structural, overlap, freshness, evidence-resolution, and privacy reports,
  draft, approved voice exemplar, benchmark set, and rubric;
- follows the complete ordered rubric;
- matches a server-owned benchmark approval and independent reviewer assignment;
- contains bounded rationale and criterion-appropriate evidence namespaces;
- is bound to a passing, versioned server resolution report for those evidence
  paths and the complete artifact-registry digest;
- includes typed, actionable workup, manifest, review-process, or clean-run
  remediation targets that also pass a criterion-aware resolver;
- cannot reach owner review below the score, criterion, source, or freshness
  floors; and
- produces separate deterministic requirements, submission, content, and final
  review digests; and
- returns an immutable, privacy-cleared owner snapshot only after the privacy
  binding passes.

It cannot prove that a rationale is true, that a score is wise, that private
wording was actually withheld, or that two passages are theologically
equivalent. Those require authenticated server context, source-aware tools,
and human/editorial judgment.

## Future trusted boundary

Studio must never accept the requirements object, approval state, benchmark
digest, reviewer identity, independence flag, or prerequisite readiness from
ordinary browser input. A protected server assembler must derive them from
immutable, authenticated records and re-check them before publication.

The assembler must load each canonical report and derive its digest and verdict
atomically; it may not accept a report digest and a separate caller-supplied
`pass`. The reproducible SHA-256 binding helpers prove consistency, not
authenticity. Issue #8 must sign and persist the complete run envelope before a
quality result can be trusted operationally.

The pure evaluator deep-freezes its returned report, but future persistence and
publishing must still reassemble trusted requirements, re-run the evaluator,
and re-hash the canonical snapshot at the boundary. A caller calculating the
documented digests or setting every verdict to `pass` is not authentication;
issue #8's signed, revision-bound owner workflow must authenticate the exact
approval records and artifacts.

Run the offline proof with:

```text
npm run verify:benchmark
```

The verifier uses synthetic prose only, exercises fail-closed mutations, and
does not claim that a real chapter passed the semantic rubric.
