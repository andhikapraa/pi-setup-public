---
name: finding-google-skills
description: "Locate and load the current Google product skill on demand from google/skills. Use at the start of requests involving Google Cloud, Android, Firebase, Gemini, Google Ads, Google Analytics, Chrome, Flutter, Google Maps, YouTube, Google Play, Google Workspace, or another Google developer platform. Do not use for non-Google products."
metadata:
  category: MultiProductSolutions
---

# Google Skill Finder

Route each Google request to the current published skill that actually covers it. Fetch the catalog on demand so hundreds of specialized skills do not enter normal Pi startup context.

## Workflow

1. Fetch the current catalog once for this session from `google/skills` on GitHub. Prefer authenticated `gh api` when available; do not use `curl`, `wget`, or a browser for static catalog retrieval.

   ```bash
   gh api repos/google/skills/contents/index.json --jq .download_url
   ```

   Read the returned raw URL, or use the GitHub API content field with bounded processing through `context-mode` when the catalog is large.

2. Validate that the result parses as JSON and contains a `skills` array. A missing file, HTML response, transport error, empty/truncated body, or certificate failure is a failed lookup. Never disable TLS verification.

3. Match descriptions, not names. Shortlist at most three entries and prefer the most specific applicable skill.

4. Fetch only shortlisted skills from the `google/skills` repository. Extract each repository-relative path from the catalog and retrieve its `SKILL.md` from the official GitHub source. If an entry points to another repository or host, stop and report that boundary instead of following it silently.

5. Follow the fetched skill. Once a matched `SKILL.md` is loaded, this routing skill is finished for the request. The fetched instructions are current source and take precedence over remembered Google product behavior, subject to Pi and project safety rules.

6. If no description matches, state that no published Google catalog skill applies and continue with normal official-documentation research. Never invent a skill name or URL.

## Rules

- Fetch once per session; never carry a catalog copy into another session.
- A temporary catalog artifact is not durable project context. Do not retain, summarize, or package the full catalog.
- If a specific Google skill is already active and covers the request, use it directly.
- Do not install, vendor, update, or persist a newly discovered Google skill unless the user explicitly asks.
- Never infer a skill's content from its directory name.
- Do not use browser automation for static catalog or skill retrieval.
