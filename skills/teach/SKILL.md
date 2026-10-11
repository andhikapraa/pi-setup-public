---
name: teach
description: Teach the user a concept or skill across multiple sessions using a durable learning workspace, primary sources, short lessons, retrieval practice, and learning records. Use only when the user explicitly invokes teach or asks to establish a stateful learning program, not for ordinary questions or one-off explanations.
disable-model-invocation: true
version: 1.0.0
---

# Teach

Build durable understanding around the user's real mission. Teaching owns pedagogy and learning state; it does not become a product-development workflow.

## Workspace

Default to a Pi-owned workspace:

```text
~/.pi/learning/<topic-slug>/
```

Use a repository-local learning directory only when the user explicitly wants project-specific training and approves the location. Never seed teaching files into whichever product repository happens to be open.

The workspace may contain:

```text
MISSION.md
RESOURCES.md
NOTES.md
learning-records/
lessons/
reference/
assets/
```

Create files and directories lazily. Do not prebuild an asset library; extract a shared asset when a second lesson genuinely needs it.

## Durable authorities

- `MISSION.md`: why the user is learning, the practical outcome, current baseline, constraints, and evidence of success.
- `RESOURCES.md`: high-trust primary sources and what each contributes.
- `learning-records/NNNN-<slug>.md`: durable insights, demonstrated skills, misconceptions corrected, and changes to the teaching plan.
- `lessons/NNNN-<slug>.html`: one short, self-contained lesson tied to the mission.
- `reference/*.html`: compressed quick-reference material worth revisiting.
- `NOTES.md`: teaching preferences and temporary planning notes.

The installed Hindsight memory integration may retain high-level teaching preferences, mission changes, and durable milestones. Do not duplicate lessons, reference sheets, resource catalogs, or learning records into memory.

## Establish or resume the mission

On a new topic, resolve:

1. what the user wants to be able to do;
2. why that outcome matters now;
3. what they can already explain or perform;
4. constraints on time, tools, format, accessibility, or prior knowledge;
5. what observable evidence would show success.

Write `MISSION.md` only after the user confirms the mission. A compact format is:

```markdown
# Mission

## Outcome
<What the learner will be able to do.>

## Why it matters
<The practical reason.>

## Current baseline
<Demonstrated knowledge and skills, not assumed level.>

## Constraints
<Time, tools, accessibility, and scope.>

## Evidence of success
<Observable performance or artifact.>
```

On later sessions, read the mission, notes, resource index, and latest relevant learning records. Do not reload every prior lesson unless the current lesson depends on it.

Mission changes require user confirmation and a learning record explaining why the route changed.

## Ground knowledge in sources

Read the installed `web-research` skill using the filesystem location supplied in Pi's skill catalog before load-bearing research. Prefer official documentation, specifications, source code, original papers, first-party courses, and respected practitioners with direct expertise.

Record sources in `RESOURCES.md` with:

- title and URL;
- source owner;
- which question or lesson it supports;
- trust level and any version or date qualification;
- unresolved gaps or conflicting evidence.

Parametric knowledge may suggest what to investigate, but it is not sufficient evidence for claims that shape the curriculum.

## Choose the next lesson

Estimate the user's zone of proximal development from demonstrated performance and learning records. Choose one tightly scoped win that is challenging but achievable in a short session.

Design for both:

- **fluency strength:** what the user can retrieve now;
- **storage strength:** what the user can retrieve later without cues.

Use desirable difficulty for skill practice:

- retrieval before re-explanation;
- spaced review of earlier ideas;
- interleaving related skills when it improves discrimination;
- immediate feedback on an attempted answer or action.

Do not add difficulty to basic explanation merely to make it feel rigorous. Preserve working memory for understanding, then make practice effortful.

## Lesson contract

A lesson is one self-contained HTML file under `lessons/`, numbered monotonically. It should contain:

1. the single mission-linked outcome;
2. a concise explanation using the established glossary;
3. one primary source and any necessary citations;
4. a worked example or demonstration;
5. an active exercise, retrieval prompt, or real-world action;
6. immediate feedback or a clear rubric;
7. one spaced-recall prompt from an earlier lesson when relevant;
8. a short checkpoint that determines the next lesson.

Keep the lesson usable without external scripts or network access. Use accessible semantic HTML and restrained styling. Do not open a browser automatically.

When the user explicitly wants a shareable or Postplan lesson, read the installed `html-communication` skill using its Pi catalog filesystem location, create the lesson through that workflow, publish it, and record the URL. Otherwise keep lessons private and local.

## Reference material

Create a reference sheet only when the material has repeat value beyond the current lesson, such as:

- syntax and verified code patterns;
- algorithms or decision flowcharts;
- checklists and operating sequences;
- canonical terminology;
- comparison tables.

Reference sheets compress; lessons teach. Do not turn every lesson into a permanent reference document.

## Learning records

After a meaningful session, create one numbered record:

```markdown
# <Insight or skill>

## Evidence
<What the user explained, built, recalled, or performed.>

## Durable learning
<The non-obvious lesson that should affect future teaching.>

## Misconceptions or gaps
<What remains unstable or incorrect.>

## Teaching consequence
<How the next lessons should adapt.>

## Retrieval prompt
<A future question that tests storage strength.>
```

Record demonstrated outcomes, not praise or a transcript. Update `NOTES.md` for durable format preferences, pacing, accessibility needs, or feedback style.

## Wisdom and real-world practice

When mastery depends on real practitioners, production constraints, or physical feedback, help the user find a reputable community, mentor, class, code review setting, or real project. Respect a preference to learn privately. State clearly when an answer is informed judgment rather than source-verifiable knowledge.

## Completion for each session

A teaching session is complete when:

- the lesson advances the confirmed mission by one observable step;
- claims are sourced appropriately;
- the user attempts retrieval or practice and receives feedback;
- demonstrated learning and remaining gaps are recorded;
- the next lesson follows from evidence rather than a generic syllabus;
- no product repository or public Postplan artifact was created without the relevant explicit choice.

## Provenance

Adapted from Matt Pocock's `teach` workflow with an OMP-owned default workspace, primary-source routing, bounded memory use, and optional rather than mandatory public HTML publication. The upstream MIT license is preserved in `LICENSE`.
