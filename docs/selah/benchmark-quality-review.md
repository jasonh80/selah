# Selah Benchmark Quality Review v2

> Offline, review-only groundwork. This does not call a model, read or write
> Supabase, change Studio, generate a chapter or image, or authorize publishing.

## Purpose

Selah Brain should write each chapter freshly from the approved Scripture
source, rules, chapter guidance, and one digest-bound voice exemplar. Mark 6 is
Selah's only refined app-quality benchmark. Recent Mark study chats may provide
reusable lessons and same-chapter review references; Exodus 33–34 may provide
narrow lessons. Exodus 27 is only a weak technical render fixture. None of
their private wording is an authoring source.

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
5. Give an authenticated independent reviewer access to the draft, Mark 6 as
   the quality benchmark, and the appropriate study-reference mode. Mark 8–10
   may use their same-chapter chats for coverage and accuracy checks; Mark 11,
   for which no recent private chapter workup was found, uses Mark 6 quality
   comparison plus its independently researched guidance.
6. Resolve every evidence and remediation path against one versioned artifact
   registry. It always binds canonical roots for the draft, manifest,
   structural/overlap/freshness reports, voice exemplar, benchmark set, and
   rubric; it also binds guidance, render evidence, or another approved
   namespace whenever the review cites that namespace. The authenticated
   reports separately bind the resolver version. Also scan all review prose
   for private benchmark or exemplar leakage.
7. Persist only conclusions, ratings, resolved evidence paths, and fresh targeted
   revision instructions—never private benchmark excerpts.
8. Revise only the failed fields—or correct the manifest/review process or run
   a clean generation when that is the honest remedy—then create new digests.
9. Send a qualifying review to the owner. It remains
   `needs_owner_review`, never auto-approved.

## Editorial bar

The versioned rubric is
`lib/ai/quality/selah-benchmark-rubric.v2.json`. It weighs thirteen dimensions
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
be calibrated by scoring Mark 6 as the refined positive benchmark and several
known weaker workups as negative controls. Recent Mark chats may test
chapter-specific coverage and accuracy, but do not become app-quality
benchmarks. Until that exercise demonstrates useful separation, a passing code
result is called `benchmark_ready`, not “proven comparable.”

BMQ-11 reviews only the truthfulness and usefulness of copy-stage Scene Checks
and visual directions. It does not prove the final image count, hero choice,
image-plan registry, generated assets, or rendered quality. The current
authoring scaffold still emits three rigid image concepts; issue #5 must
reconcile that with Selah's chapter-driven three-or-five system before a real
Mark 8–11 run can claim visual readiness. Final images remain a separate
completion gate after copy is frozen.

## What the validator proves

`lib/server/selah-benchmark-review.ts` is a pure validator and scorer. Its v2
owner-readiness result now requires both the content/rubric gate and the
authenticated-evidence gate. It can prove that a review submission:

- names the exact chapter;
- is bound to lowercase SHA-256 identities for the generation manifest,
  structural, overlap, freshness, evidence-resolution, and privacy reports,
  draft, approved voice exemplar, benchmark set, and rubric;
- follows the complete ordered rubric;
- matches separately signed benchmark approval, reviewer-assignment, and
  review-validation receipts, with a different trusted key for each role;
- binds the authenticated assignment to one review ID, one active time window,
  the exact draft author, and a distinct independent reviewer;
- contains bounded rationale and criterion-appropriate evidence namespaces;
- carries the complete evidence-resolution, remediation-resolution, and privacy
  report records rather than accepting detached caller-supplied `pass` labels;
- derives each report verdict from exact path coverage, registry resolution,
  scan completion, and findings, then checks the signed validation receipt;
- binds every registry subpath to its canonical root record, revision, type,
  and digest, and rejects a bundle replayed after the trusted registry or draft
  head changes;
- includes typed, actionable workup, manifest, review-process, or clean-run
  remediation targets that also pass a criterion-aware resolver;
- cannot reach owner review below the score, criterion, source, or freshness
  floors; and
- produces separate deterministic requirements, submission, content, and final
  review digests; and
- returns an immutable, privacy-cleared owner snapshot only after content and
  authenticated evidence both pass.

It cannot prove that a rationale is true, that a score is wise, that private
wording was actually withheld, or that two passages are theologically
equivalent. A registry subpath is trusted only when the future protected
assembler derives it atomically from the canonical artifact; the pure contract
cannot reconstruct an artifact from a digest. Those limits still require
source-aware tools, protected server state, and human/editorial judgment.

The eight canonical roots named above are unconditional. Guidance, render, and
other approved namespace roots are conditional: the registry must contain and
bind them whenever a submitted evidence path or remediation target cites them;
unused namespaces are not claimed as part of a review snapshot.

## Future trusted boundary

Studio must never accept the requirements object, authority policy, trusted
clock, active review/assignment IDs, registry head, resolver/scanner versions,
approval state, reviewer identity, independence flag, or prerequisite readiness
from ordinary browser input. A protected server assembler must derive them from
immutable, authenticated records and re-check them before publication. The
current code deliberately has no route, worker, database, or Studio wiring.

The assembler must load each canonical artifact and report, derive registry
entries, digests, and verdicts atomically, and issue role-scoped receipts. It
may not accept an authority, public key, historical clock, registry entry,
report digest, or separate caller-supplied `pass`. The older reproducible
SHA-256 binding helpers remain content-identity checks, not authentication.
Issue #8 must persist the complete revision-bound run envelope before a quality
result can be trusted operationally.

No production private key exists in this branch. The offline verifier creates
three ephemeral Ed25519 test keypairs in memory. A later approved runtime design
must use protected, independently rotatable signing keys; it must not reuse
`DEV_ADMIN_TOKEN`, an API key, or any secret committed to the repository.

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

The verifier uses synthetic prose and ephemeral keys only. It exercises the
content mutations plus forged approvals, attacker keys, role collapse, expired
assignments, review replay, stale registry heads, unresolved reports, missing
privacy coverage, private-text findings, detached registry subpaths, sparse
arrays, and author/reviewer conflicts. It does not claim that a real chapter
passed the semantic rubric.
