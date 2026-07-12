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
- QA contract / report:

The machine gate must say **PASS**, contain zero blockers, and show a written
disposition for every warning. Any content, image, rule, note, example, source,
model, or prompt change invalidates this card and requires a new report.

The current local evaluator is only a structural floor. It is not yet bound to a
generation manifest or workup digest, so it cannot prove that Selah Brain, the
approved model, rules, notes, source, prompt, or exemplar authored the draft.
Those identities must fail closed in the future pre-generation manifest before
this card can be used operationally.

## Owner review

Choose **Pass**, **Targeted revision**, or **Block**. A revision must name exact
fields or sections; do not blindly regenerate an otherwise good chapter.

| ID | Owner question | Decision / evidence path |
|---|---|---|
| OWN-01 | Does every chapter movement receive meaningful treatment without one theme flattening the passage? | |
| OWN-02 | Are facts Mark-local, with parallel-Gospel details clearly labeled? | |
| OWN-03 | Are text, inference, interpretation, tradition, and unknown kept distinct? | |
| OWN-04 | Does it sound like Selah: warm, specific, memorable, and natural rather than generic or academic? | |
| OWN-05 | Is the Jesus connection grounded and deep without erasing the first meaning or forcing typology? | |
| OWN-06 | Is the historical, geographic, Jewish-context, medical, disability, and pastoral treatment responsible? | |
| OWN-07 | Are application and prayer chapter-shaped and free of guarantees, blame, coercion, self-harm, or unsafe counsel? | |
| OWN-08 | Are FAQ, passage flow, Scene Checks, image directions, maps, and completion inputs accurate enough for the next stage? | |
| OWN-09 | Is generated copy free of stored licensed Scripture and source mislabeling? | |
| OWN-10 | Is this fresh authorship rather than copied benchmark wording or disguised paraphrase? | |

## Deterministic evidence

The offline contract currently verifies:

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

## Acceptance rule

A chapter advances only when:

1. the pre-generation manifest was green and bound to the run;
2. deterministic copy QA reports no blockers;
3. every warning is fixed or explicitly accepted with rationale;
4. OWN-01 through OWN-10 are all **Pass**;
5. any targeted revisions are revalidated against new digests;
6. copy is frozen before image generation;
7. completion, image, mobile/desktop, and published-chapter regression gates
   pass separately;
8. the owner explicitly approves that exact chapter to publish.

Current status: the authoring contract and offline evaluator are local candidate
code only. They are not connected to Selah Studio or the live generation path.
