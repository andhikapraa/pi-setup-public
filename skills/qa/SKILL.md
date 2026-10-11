---
name: qa
description: "Systematically test a web application as a real user with health scores, screenshots, reproducible findings, and acceptance-linked evidence. Use for QA, testing, checking what is broken, bug reports, confirming a feature, or test-and-fix work. Defaults to immutable report-only mode; source fixes require an explicit request to fix."
version: 2.0.0
---

# QA: Test, Report, Optional Fix

Exercise the real application through the `browser-automation` skill, using `agent-browser` by default, record evidence, and report observed behavior. One workflow supports two mutation modes: safe report-only QA and explicitly authorized test/fix/reverify QA. **Do not commit, push, open a pull request, post external comments, or modify unrelated code.**

Read `references/issue-taxonomy.md` and use `templates/qa-report-template.md`.

## Parameters

Infer these from the request and repository context. Ask only when two materially different choices remain unresolved.

| Parameter | Default |
|---|---|
| Target | Provided URL; otherwise running local app or preview |
| Tier | Standard |
| Scope mode | Diff-aware without a URL; full with a URL |
| Mutation mode | Report-only unless the user explicitly requests fixes |
| Output | `.omp/qa-reports/{run-id}/` |
| Scope | Changed user journeys in diff-aware mode; reachable app in full mode |
| Acceptance source | User request; approved plan or program ticket when supplied by the owning workflow |
| Authentication | Existing browser session or user-provided credentials |

## Mutation modes

Choose and record one mutation mode before testing. The mode is immutable for that QA run.

### Report-only

Use report-only for requests such as:

- QA, test, check, audit, inspect, or confirm a feature;
- find bugs, tell me what is broken, or produce a bug report;
- test without fixing, report only, or do not change code.

Allowed writes are limited to:

```text
.omp/qa-reports/{run-id}/report.md
.omp/qa-reports/{run-id}/baseline.json
.omp/qa-reports/{run-id}/screenshots/*
```

In report-only mode:

- never modify source, tests, configuration, dependencies, CI, application setup, or git state;
- do not alter application data except reversible test data explicitly permitted by the user;
- source and diff reads may establish intended behavior, acceptance criteria, and affected journeys, but must not become implementation diagnosis or patch recommendations;
- report user-visible expected behavior and evidence, not suggested files, functions, commands, or code changes;
- do not convert the run into fix mode. If the user later requests fixes, complete this report and begin a separate fix run with a new run id.

### Fix

Use fix mode only for explicit instructions such as:

- test and fix;
- find and fix bugs;
- fix what is broken;
- QA this and repair qualifying defects.

Fix mode may modify source and focused tests only for safe, reproducible, source-owned findings within the selected tier. It does not authorize commits, pushes, pull requests, deployments, external messages, unrelated refactors, dependency upgrades, or infrastructure changes.

## Tiers

- **Quick:** smoke-test the landing page, primary journey, and up to five top navigation targets. In fix mode, only critical and high findings qualify for repair.
- **Standard:** test core journeys, relevant forms and states, and mobile where applicable. In fix mode, critical, high, and medium findings qualify.
- **Exhaustive:** expand to secondary journeys, edge states, responsiveness, accessibility, and polish. In fix mode, all severities may qualify.

Tiers control exploration depth. They never change report-only into fix mode. Third-party, infrastructure, permission-blocked, production-unsafe, or non-reproducible issues remain deferred in every tier.

## Browser requirement

Use the `browser-automation` skill as the browser execution contract. It routes normal navigation, interaction, authentication, accessibility snapshots, console/network inspection, uploads, downloads, and screenshots through `agent-browser`. Keep one persistent named session and re-observe after navigation or rerender before acting on elements.

Escalate to `chrome-use` only when CAPTCHA or anti-bot protection blocks `agent-browser`, or when the scenario requires the user's existing Chrome cookies or session. Read `../browser-automation/SKILL.md` before that handoff. For visual details that accessibility output cannot establish, read the screenshot at its plain absolute filesystem path with Pi `read` and inspect the returned image directly.

If the app is not running, identify the existing project start command and launch it through a bounded subprocess controller that records its PID, checks readiness, and terminates only its owned process in a finally block. In report-only mode, do not install dependencies, change configuration, or create setup files; report a startup blocker when the existing command cannot run.

## Scope modes

### Diff-aware

When no URL is supplied and repository changes exist:

1. Establish intended behavior from the user request, approved acceptance source, and diff or branch context.
2. When `do` or the user supplies a program manifest, ticket, spec, or plan reference, load only the acceptance criteria relevant to this QA scope.
3. Map changed routes, controllers, pages, components, APIs, styles, and adjacent journeys using `lsp`, `grep`, `glob`, and targeted `read`.
4. In report-only mode, use source only for scope and expected behavior. Do not diagnose or recommend an implementation fix.
5. Test every directly affected journey plus the nearest upstream and downstream interaction.
6. If no UI route can be inferred, run Quick browser smoke testing rather than skipping QA.

### Full

Start from the supplied URL, map reachable navigation breadth-first, and prioritize core workflows over secondary or legal pages. Aim for 5-10 strongly evidenced findings rather than many vague observations.

### Regression

Run the selected scope, then compare against a supplied prior `baseline.json`. Report fixed, persistent, and new issue IDs plus health-score deltas. In report-only mode, "fixed" means absent under the same reproduction attempt and does not authorize source changes.

## Acceptance mapping

When an approved plan or program ticket is available, create a compact acceptance matrix before browsing:

| Acceptance id or criterion | Browser-observable journey or state | Evidence required | Status |
|---|---|---|---|
| <pointer or concise criterion> | <route and action> | <screenshot, DOM, console, network, or persisted state> | NOT EXERCISED |

Classify each criterion at completion as:

- **VERIFIED:** exercised browser evidence satisfies the observable criterion;
- **FAILED:** the journey reproduces behavior that violates it;
- **NOT EXERCISED:** an environment or scope blocker prevented the scenario;
- **NOT BROWSER-OBSERVABLE:** the criterion requires another verification surface and QA makes no claim about it.

QA may record evidence pointers for `do`, but only `do` owns durable program status and may mark a ticket completed.

## Workflow

### Phase 1: Initialize artifacts

Create:

```text
.omp/qa-reports/{run-id}/
├── report.md
├── baseline.json
└── screenshots/
```

Copy the report template into `report.md`. Preserve prior runs. Record mutation mode, target, tier, scope mode, scope, acceptance source and matrix when present, start time, and environment limitations.

### Phase 2: Authenticate safely

Use an existing authenticated browser session when available. If credentials, OTP, or a manual CAPTCHA step are required, use `ask` without echoing secrets. Never put credentials, tokens, cookies, or personal data in the report or screenshots; use `[REDACTED]` in repro steps.

### Phase 3: Orient

1. Open the target in `agent-browser`.
2. Capture the initial accessibility snapshot and screenshot.
3. Record console errors and failed requests.
4. Map navigation and primary task paths.
5. Map each supplied acceptance criterion to a reachable journey, state, or explicit non-browser boundary.
6. Identify framework or runtime signals only when they change the test plan.

### Phase 4: Establish baseline

For each page or state in scope, exercise:

1. visual layout and content;
2. buttons, links, menus, and controls;
3. forms with valid, empty, invalid, boundary, and special-character inputs where safe;
4. navigation, refresh, back/forward, deep links, and persistence;
5. loading, empty, error, success, disabled, and overflow states;
6. console and failed requests after each meaningful interaction;
7. mobile or tablet viewport when relevant;
8. logged-out and role boundaries when permitted.

Never perform destructive production actions. Use a safe test environment or reversible data.

### Phase 5: Record findings immediately

Reproduce every issue a second time before reporting it.

For an interactive issue:

1. save a before screenshot;
2. perform the exact action;
3. save the result screenshot;
4. record the accessibility or DOM-relevant state change;
5. write numbered repro steps, expected and actual behavior, user impact, URL, console/network evidence, severity, category, and any blocked acceptance criterion.

For a static issue, save one screenshot that visibly contains the defect and describe the expected presentation. Every issue gets a stable `ISSUE-NNN` identifier and at least one screenshot.

### Phase 6: Score the baseline

Score each category from 0-100.

- **Console (15%):** 0 errors = 100; 1-3 = 70; 4-10 = 40; more than 10 = 10.
- **Links (10%):** start at 100; subtract 15 per broken link, floor 0.
- **Visual (10%), Functional (20%), UX (15%), Performance (10%), Content (5%), Accessibility (15%):** start each at 100; deduct 25 critical, 15 high, 8 medium, 3 low, floor 0.

The health score is the weighted sum. Save `baseline.json` with target, date, mutation mode, health score, category scores, and issue IDs, titles, severities, and categories.

### Phase 7: Triage

Sort critical -> high -> medium -> low.

In report-only mode, classify each finding as:

- **open:** reproduced and within the report scope;
- **deferred:** outside the tier, third-party, environment-blocked, or unsafe;
- **not reproducible:** remove from confirmed findings or place in an explicitly unconfirmed appendix.

In fix mode, classify each finding as:

- **fix now:** within tier, source-owned, safe, and reproducible;
- **deferred:** outside tier, third-party, environment-blocked, or unsafe;
- **not reproducible:** remove from confirmed findings or place in an explicitly unconfirmed appendix.

Do not require a clean working tree. Treat pre-existing changes as user work.

### Phase 8: Apply fixes only in fix mode

In report-only mode, skip this phase and record: **No fixes applied; mutation mode was report-only.**

In fix mode, process each "fix now" issue one at a time:

1. Use `lsp`, `grep`, and `glob` to locate the responsible source and closest tests.
2. Use targeted `read` to understand the complete failing path.
3. Apply the smallest source fix with `edit`; avoid unrelated refactors and features.
4. If the defect creates an uncovered observable contract, add one focused regression test following nearby conventions.
5. Re-run the exact browser reproduction in the same environment.
6. Capture the after screenshot, console/network state, and changed observable state.
7. Classify the result as verified, best-effort, or reverted.
8. Update the issue entry before proceeding.

Stop and reassess after three failed fix attempts on one issue, security-sensitive ambiguity, or evidence that the apparent bug is expected product behavior. Use `ask` only for the decision that blocks safe progress.

### Phase 9: Final QA

In report-only mode, complete the acceptance matrix, regression comparison when requested, current health score, environment blockers, and untested areas. Make no fix claim.

In fix mode, repeat every affected journey, not only the final issue. Recheck adjacent navigation, console errors, failed requests, relevant viewports, and every acceptance criterion exercised before fixes. Recompute the health score and acceptance matrix. If the final score is lower than baseline, an acceptance criterion remains failed, or a new regression appears, report it prominently and do not call the run verified.

### Phase 10: Report

Every report includes:

- mutation mode, tier, scope mode, target, and tested journeys;
- baseline or current health score with category breakdowns;
- acceptance source and VERIFIED, FAILED, NOT EXERCISED, or NOT BROWSER-OBSERVABLE matrix when supplied;
- issue counts by severity and category;
- top three user-impacting findings;
- per-issue reproduction and screenshot evidence;
- deferred or environment-blocked findings;
- regression comparison when requested;
- ship-readiness limited to exercised behavior.

Report-only additionally states that no fixes were applied and contains no implementation recommendations. Fix mode additionally includes files changed, before and after evidence, verification status, and final health score.

Report the artifact directory and important evidence paths in the final response. When invoked from `do`, return acceptance-linked evidence pointers without changing the program manifest.

## Non-negotiable rules

- Browser behavior is the proof; source inspection alone is not QA.
- Mutation mode is selected before testing and never escalates during the run.
- Every confirmed issue is reproduced twice and has screenshot evidence.
- Every claimed fix reruns the original reproduction.
- Never expose secrets or sensitive user data.
- Never commit, stash, push, create a PR, post external messages, deploy, or alter CI as part of QA.
- Never delete prior reports or screenshots.
- Never modify unrelated code or overwrite user changes.
- QA never marks a plan phase or program ticket completed; the execution owner reconciles durable state.

## Provenance and license

Consolidates the upstream test/fix/reverify and report-only web QA workflows into one mutation-mode contract. Retains their tier model, taxonomy, evidence discipline, health scoring, acceptance mapping, and strict authorization boundary. The upstream MIT license is preserved in `LICENSE`.
