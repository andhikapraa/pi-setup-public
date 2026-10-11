---
name: html-communication
description: Package plans, specifications, findings, reports, comparisons, or completed mock sets as safe self-contained Postplan HTML. Use when the user explicitly requests HTML, Postplan, or a shareable artifact, or when another workflow hands off a deliverable for publication. Does not modify shipped product HTML or choose UI direction.
---

# HTML Communication

Package an already-owned deliverable as self-contained HTML, validate it for external hosting, and publish it through Postplan.

## Ownership

This skill owns the HTML container, redaction, artifact path, markup validation, and Postplan upload. It does not own the content, research, plan, review, specification, UI direction, mock generation, or product QA. Preserve the owning workflow's document type, hierarchy, terminology, evidence, and completion state. If the target is shipped product HTML, stop and route it to product implementation or the UI workflow.

## Artifact contract

Create one self-contained HTML file no larger than 524,288 bytes. Use a stable absolute path across revisions:

```text
~/.pi/agent/artifacts/postplan/<stable-topic-slug>.html
```

Resolve `~` before upload. Reuse the same file for revisions unless a separate draft is explicitly requested. Never include the local absolute path in the HTML.

## Presentation

Follow explicit user direction and the owning workflow first. Otherwise write a readable internal document: dark mode, true-black background, white text, short paragraphs, clear headings, compact lists, useful tables, evidence callouts, and explicit status labels. Avoid decorative chrome, filler, redundant summaries, and em dashes.

Every artifact needs a responsive viewport, semantic and correctly nested headings, accessible contrast, visible focus states, descriptive links, and text alternatives for visual information. Keep wide tables in a horizontal scroll container. Use inline CSS, inline SVG, or HTTPS/data-URL images only.

## Safe HTML

Prohibit external or module scripts, linked stylesheets, event-handler attributes, `javascript:` URLs, forms, frames, iframes, embeds, objects, applets, meta refresh, secrets, credentials, private URLs, user-specific absolute filesystem paths, and unpublished internal hostnames. External links in a script-free document must use `target="_blank" rel="noopener noreferrer"`. The document must remain useful without JavaScript.

## Procedure

1. Identify the owning workflow and preserve its content and presentation decisions.
2. Write or update the stable artifact path.
3. Validate doctype, language, UTF-8 charset, responsive viewport, balanced structural elements, size, prohibited constructs, external-link behavior, and absence of terminal-only references.
4. Upload with:

```sh
npx postplan upload "<absolute-file-path>"
```

Use `--new` only when a separate draft was explicitly requested. Report the successful Postplan URL and local artifact path. If authentication is required, report the actual error and ask the user to run `npx postplan auth login`.

## Completion

The artifact is complete only when it is self-contained, under the size limit, passes the safety checks, preserves the owning deliverable, and Postplan returns a URL. This skill does not claim visual verification of the hosted page.
