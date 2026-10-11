---
name: postplan-read
description: Fetch and read an uploaded Postplan HTML artifact from its raw URL without web search or browser automation, then continue the user's request from the retrieved document. Use when the user provides a Postplan URL or asks to inspect, summarize, compare, or revise a Postplan artifact.
---

# Postplan Read

## Fetch protocol

1. Accept the Postplan URL supplied by the user.
2. Remove one trailing slash.
3. Append `/raw` unless the normalized URL already ends in `/raw`.
4. Construct the final raw URL before invoking a tool.
5. Fetch the final raw URL once. When the `context-mode` ext is installed, use its `ctx_execute` tool with one bounded `fetch()` call, saving the response to a fresh temporary file or returning only the document content. Otherwise run `curl -fsSL '<raw-url>' -o <fresh-temp-file>` and read that file. Do not use web search or browser automation.
6. Continue only from the fetched document contents. Use raw markup only when exact HTML matters; otherwise use extracted document content.

The raw URL must be explicit in the fetch. Do not use shell substitution, hidden URL normalization, or a cached local copy. Prefer context-mode when installed: it also blocks raw `curl` output into the conversation.

## Failure behavior

If the fetch fails, report the actual URL and error. Do not read or trust an older cached artifact. Do not retry through search results, a different fetch route, or a browser. Retry only after correcting a malformed URL or when the user asks after a transient failure.

## Postplan CLI rule

This skill normally reads through the raw URL and does not need the Postplan CLI. If a Postplan CLI operation is required while continuing the request, invoke it only as:

```sh
npx postplan ...
```

Never call a bare or globally installed `postplan` binary.

When the request becomes an HTML artifact revision, follow `../html-communication/SKILL.md` for the self-contained document, stable-path update, validation, and required upload.
