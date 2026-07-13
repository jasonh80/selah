# Mark 8–11 Owner Acceptance Card

> Review-only template for the July 2026 Mark sprint. It does not authorize
> generation, rule/note activation, images, Supabase changes, publishing, or a
> public status change.

Use one copy of this card per chapter after the fail-closed generation manifest
and offline copy-review report are available. Tuesday should be an approval
session for an already-audited release candidate, not the first quality check.

## Exact artifact

- Chapter / slug:
- Draft version:
- Workup digest:
- Generation manifest ID / digest:
- Brain library:
- Prompt revision:
- Model:
- Generation source / version / digest:
- Reader display version:
- Structural QA contract / report / digest:
- Source-overlap report / digest:
- Freshness report / digest:
- Benchmark set / digest:
- Benchmark rubric / digest:
- Artifact registry / resolver version / evidence and remediation reports:
- Trusted registry record / revision / current-head digest:
- Evidence authority policy / approval key / assignment key / validation key:
- Active review ID / assignment ID / verification time:
- Benchmark review / digest:

The structural machine gate must say **PASS** and contain zero blockers. The
benchmark review contract must also validate, but validation only proves that
the required evidence and ratings are complete and bound to the right draft; it
does not prove the editorial judgments are true. Any content, image, rule,
note, example, source, model, prompt, or review change invalidates this card
and requires new digests and reports.

An owner-ready v2 report requires the content gate and authenticated-evidence
gate together. Browser-supplied keys, clocks, assignment IDs, report verdicts,
or registry heads are never acceptable evidence. Until the protected Studio
assembler loads those values from current server state, this card remains an
offline review template only.

The separate local copy-review evaluator is only a structural floor. The v2
benchmark evaluator binds manifest and workup identities, but neither evaluator
is connected to real canonical Studio records yet. Therefore the offline suite
still cannot prove operationally that Selah Brain, the approved model, rules,
notes, source, prompt, or exemplar authored a real draft. The protected server
assembler must load and bind those identities before this card can be used.

## Independent benchmark review

Rate each dimension from **0–4** and cite resolved evidence paths. A 4 means
comparable to Mark 6, Selah's only refined app-quality benchmark; relevant Mark
study chats may support coverage and accuracy checks. A 3 means responsible and
publishable but not consistently benchmark-level; 2 requires targeted
remediation; 1 or 0 blocks. A remediation must name an exact workup, manifest,
review-process, or clean-generation target and describe the quality needed
without quoting private reference or exemplar wording.

| ID | Weight | Review dimension | Rating / evidence / targeted revision |
|---|---:|---|---|
| BMQ-01 | 12 | Complete, proportionate chapter and book-flow coverage | |
| BMQ-02 | 11 | Textual grounding and Mark-local accuracy | |
| BMQ-03 | 8 | Text / inference / interpretation / unknown honesty | |
| BMQ-04 | 11 | Jesus-centered theological depth | |
| BMQ-05 | 9 | Explanatory and discovery value | |
| BMQ-06 | 12 | Selah voice and memorability | |
| BMQ-07 | 7 | Historical, geographic, and Jewish-context integrity | |
| BMQ-08 | 8 | Pastoral, medical, and human dignity | |
| BMQ-09 | 9 | Chapter-shaped application and prayer | |
| BMQ-10 | 4 | FAQ, flow, timeline, map, and Quick/Deep usefulness | |
| BMQ-11 | 4 | Copy-stage Scene Check and visual-direction truthfulness | |
| BMQ-12 | 2 | Source and rights integrity | |
| BMQ-13 | 3 | Fresh authorship without copied or disguised benchmark wording | |

The provisional internal weighted score must be at least **85/100**, every
criterion must be at least 3, and Selah voice, source integrity, and fresh
authorship (BMQ-06, BMQ-12, and BMQ-13) must be 4. Averaging can never hide a
weak or unsafe area. The 85 threshold is not yet calibrated against scored
strong and weak workups, so the code calls a qualifying result
`benchmark_ready`, not “proven comparable.” It still remains
`needs_owner_review`; it is not a publication approval.

The versioned rubric is
`lib/ai/quality/selah-benchmark-rubric.v2.json`. The pure validator and scorer
are `lib/server/selah-benchmark-review.ts`, verified offline by
`npm run verify:benchmark`. Private benchmark wording may be consulted by the
independent post-generation reviewer, but it must not enter the persisted
review artifact or targeted revision instructions. Studio must bind passing
source-overlap, draft-freshness, evidence-resolution, and private-text scan
reports before showing the review snapshot.

## Deterministic evidence

The structural offline contract currently verifies:

- exact book, chapter, slug, reference title, and draft status;
- all eight required core section types with unique IDs;
- non-placeholder, minimum-length summary, context, movement, Jesus connection,
  theology, application, and prayer fields;
- 3–7 minimum-length, uniquely labeled topic records;
- Biblical Timeline, Behind the Chapter, and 1–3 Scene Checks;
- modern/historic map-completion descriptions with uncertainty notes;
- exactly one active timeline item;
- 5–8 minimum-length FAQ items with unique questions and answers;
- ordered numeric passage-flow ranges with no gaps or overlaps;
- every reviewed Mark movement represented as its own flow entry;
- one ordered `establishing`, `detail`, and `human` placeholder with
  minimum-length title, description, prompt, alt, and caption fields;
- no populated `bibleText.verses` array;
- deterministic blocker ordering and identical repeat results.

This does **not** prove that an actual map is configured or rendered, that the
future five-scene image plan is complete, or that Scripture wording does not
appear elsewhere in generated prose. Those remain separate completion,
source-aware comparison, and human-review gates.

The movement fixtures are versioned in
`lib/ai/quality/mark-sprint-acceptance.v1.json`. The evaluator is
`lib/ai/quality/mark-sprint-quality.ts` and runs offline with
`npm run verify:authoring`.

## Human-only judgments

Automation cannot responsibly approve:

- proportionate depth rather than mere verse-range mention;
- semantic accuracy, good interpretive labeling, or theological soundness;
- Selah voice, warmth, memorability, or non-derivative phrasing;
- whether the draft was actually produced by the approved Selah Brain inputs
  until a server-owned manifest and artifact digests are bound to the report;
- historical, Jewish-context, disability, medical, and pastoral nuance;
- whether a prayer is emotionally wise and useful;
- image composition, dignity, continuity, or visual truthfulness;
- whether a map genuinely teaches rather than merely exists;
- legal approval of a source license;
- owner authorization or publication judgment.

The benchmark validator adds no semantic magic: it binds the exact generation
manifest, structural report, draft, benchmark set, rubric, reviewer identity,
attestations, ratings, evidence paths, and targeted revisions. A separate
human or independent reviewer must still do the comparison honestly.

## Acceptance rule

A chapter advances only when:

1. the pre-generation manifest was green and bound to the run;
2. deterministic copy QA reports no blockers;
3. every warning is fixed or explicitly accepted with rationale;
4. the benchmark review validates, scores at least 85, meets every floor, and
   remains bound to the exact draft;
5. the owner passes the exact draft and review digests;
6. any targeted revisions are revalidated against new digests;
7. copy is frozen before image generation;
8. completion, image, mobile/desktop, and published-chapter regression gates
   pass separately;
9. the owner explicitly approves that exact chapter to publish.

Current status: the authoring, manifest, and benchmark contracts are local
candidate code only. They are not connected to Selah Studio or the live
generation path and authorize no generation or publishing.
