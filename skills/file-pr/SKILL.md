---
name: file-pr
description: "File a real GitHub pull request after checking for an existing branch PR, reviewing the local diff against the base, learning repository title conventions, and drafting a concise problem-first title and description. Use only when the user explicitly asks to file, open, or create a PR. Do not trigger for questions, generic review, commits, or pushes without a PR request."
disable-model-invocation: true
---

# File PR

File one review-ready GitHub pull request that matches the user's original goal. This skill does not authorize merge, deploy, release, or scope expansion.

## Preconditions

1. Resolve repository, current branch, remote, and base branch. Prefer a user-named base, otherwise `origin/main`; if unavailable, resolve the remote default and state the deviation.
2. Refuse to file from the base branch unless the user explicitly requested a repository-specific flow that permits it.
3. Check whether a PR already exists for the current branch before creating anything. Use the available GitHub integration or `gh pr view` / `gh pr list --head`. If one exists, report its URL and state; do not create a duplicate or rewrite it without explicit instruction.
4. Fetch remote refs only when needed for inspection. Do not merge, rebase, reset, stash, or change the working tree.
5. Review the complete intended branch diff against the merge base, including committed, staged, unstaged, and relevant untracked work.
6. Stop on unrelated scope, missing required work, secrets, unexplained generated artifacts, or unclear user-owned changes. Never discard or absorb unrelated work.
7. Run only relevant repository verification that has not already run after the latest change. Do not invent broad ceremony.

## Title convention

Inspect recent merged PR titles and history before drafting. Follow repository evidence. Use Conventional Commit style only when the repository uses it.

The title should explain user or operational impact, not merely the mechanism. Prefer concise, human-readable wording.

## Description

Write problem-first prose grounded in the user's request. Explain the problem first, then the solution. Do not lead with a file inventory, renamed symbols, or implementation dump.

Use the repository PR template when present. Keep the body proportionate to the change. Normally use only:

```markdown
## Problem
<what was wrong and why it mattered>

## Solution
<how the change resolves it, without an implementation dump>

## Verification
<commands or user-visible scenarios actually exercised>
```

Add migration, rollout, rollback, screenshot, or risk sections only when they carry real information. Do not add empty sections.

Use a short Pi disclosure only if the repository or user expects one; never include secrets or misleading model/version claims.

## Create the PR

Before external mutation, show the final title, base, head, and body unless the user already made them explicit. Then create a real, non-draft PR using the available GitHub integration or `gh pr create` with explicit title, body, base, and head.

Return the PR URL, number, base/head, title, and verification evidence. Never merge merely because filing succeeded.

## Handoff

If the user explicitly also asked to monitor or babysit the PR, continue through `../babysit-pr/SKILL.md`. Otherwise stop after reporting the created PR. Do not post follow-up comments or monitor indefinitely.
