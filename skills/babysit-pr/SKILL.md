---
name: babysit-pr
description: "Monitor an existing GitHub pull request until the latest pushed commit has green required checks and resolved AI review-bot feedback. Verify every finding, make only goal-aligned fixes, reply and resolve false positives, track base-branch drift, and report ready status without merging unless explicitly requested. Use only when the user explicitly asks to babysit, monitor, watch, or keep a PR green."
disable-model-invocation: true
---

# Babysit PR

Monitor one existing pull request through review and CI convergence. AI review bots are fallible; verify every claim against current source before acting.

Explicitly invoking this skill authorizes monitoring, narrow goal-aligned fixes, commits, normal pushes to the existing PR branch, and written replies to review-bot feedback. It does not authorize merge, close, release, deployment, unrelated refactors, or product-scope expansion.

## Establish the baseline

1. Resolve repository and PR from an explicit URL/number or current branch.
2. Read the original user goal and PR title/body. Reduce them to one sentence defining allowed scope.
3. Record PR URL/number, base/head branches, latest head SHA, latest push time, required checks, workflow runs, reviews/comments/threads, and current base SHA.
4. Process only events newer than the latest push. Rebuild the baseline after every push.
5. Use `gh` for fresh PR, checks, reviews, comments, threads, and branch data unless an available GitHub integration provides the required operation.

Do not carry a green result or finding disposition from an older head SHA onto a new one.

## Process new feedback

For each newer check failure, review, or comment:

1. Identify exact file, line, failing job, or claimed behavior.
2. Read current source, callers, tests, configuration, and contracts.
3. Classify with evidence:
   - **real finding:** violates the PR goal or established contract;
   - **stale:** latest head already removed it;
   - **false positive:** cannot occur under the verified path;
   - **infrastructure flake:** failure outside repository behavior;
   - **out of scope:** valid idea but not required by the original goal.
4. Never change code solely because a bot sounded confident.

### Real findings and CI failures

- Make the smallest coherent correction within the original goal.
- Add or update a test only when it defends the corrected observable contract and matches repository practice.
- Run narrow relevant verification, then checks invalidated by the fix.
- Commit using repository conventions and push normally to the existing PR branch.
- Never use plain `--force`; a justified rebase may use `--force-with-lease` only after confirming the remote head has not advanced unexpectedly.
- Reset the baseline to the new head SHA after every push.

### False positives, stale findings, and out-of-scope feedback

Reply with a concise source-backed reason. Resolve the review thread when the GitHub workflow permits it. Do not dismiss feedback silently or post filler status comments.

When replying on the user's behalf, use exactly:

```markdown
[MODEL-SLUG] RESPONDING ON BEHALF OF <GITHUB-USERNAME>
----
✨
[actual evidence-backed reply]
```

Use the actual current model slug. Human reviewer replies require separate authorization unless the user's babysitting request explicitly covers them; bot-feedback replies belong to this workflow.

## Track base drift

1. Track the base branch while monitoring and refresh remote refs before comparing when stale.
2. Rebase onto current `main` only when the PR is stale, conflicting, or repository policy requires it.
3. Re-run invalidated checks after a rebase.
4. Before a history rewrite, confirm the remote PR head still matches the expected old SHA and use `--force-with-lease`.
5. If an overlapping PR or main change makes this PR obsolete, stop and report evidence. Ask before closing unless closure was explicitly authorized.

## Monitoring cadence

Use GitHub Actions watch where available. Otherwise poll checks and review data with `gh` at a moderate interval while work is active and back off when GitHub is idle. Do not hot-loop.

## Scope boundaries

Review feedback cannot expand the PR beyond the original goal. Do not add unrelated cleanup, dependency updates, telemetry, abstractions, or product behavior. Do not deploy, release, publish, or change production state.

## Completion

Stop only when all are true for the latest head SHA:

- required checks are green;
- observed AI review bots are green or actionable threads are resolved;
- every newer finding has an evidence-backed disposition;
- the branch is not stale or conflicting under repository policy;
- no newly observed feedback remains unprocessed.

If merge was explicitly requested, merge only under the requested disposition. Otherwise report the ready PR URL, latest head SHA, checks, and review dispositions without merging.
