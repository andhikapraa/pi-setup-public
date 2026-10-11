---
name: retrieving-developer-knowledge
description: "Retrieve and synthesize current official Google developer documentation for Google Cloud, Gemini, Android, Chrome, Web, Flutter, Go, Firebase, and other Google developer platforms. Use for API syntax, IAM permissions, architecture comparisons, official guidance, and product selection. Do not use for local files or non-Google documentation."
metadata:
  category: CloudInfrastructureAndServices
---

# Google Developer Knowledge

Retrieve documentation directly in the current session. Do not delegate a single lookup to a subagent.

## Routing

1. **Exact gcloud CLI syntax:** use the `gcloud` skill and validate with `gcloud help <exact leaf command>`. This takes precedence over documentation search for command flags.
2. **Mounted developer-knowledge tools:** use them when already available in the active Pi profile or project. Use conceptual query tools for guides, comparisons, architecture, and workflows; use document search for exact API fields, IAM permissions, flags, and syntax; fetch full official pages only after a relevant URI is known.
3. **Libraries, frameworks, or SDK APIs:** use Context7 first, then read the official source when a load-bearing claim needs confirmation.
4. **Known official documentation URL:** use `read` directly. Do not open a browser for static documentation.
5. **Unknown official page:** use the installed `web-research` skill and its Exa search tools with official-domain constraints, then read the strongest result. Prefer Google primary documentation over blogs and snippets.
6. **Developer Knowledge REST API:** use only when an API key already exists in the environment. Call it through `context-mode`, keep the secret out of output and files, and return only relevant fields. Never create, request, or persist a key during ordinary documentation work.

Do not globally configure Google's remote Developer Knowledge MCP server during ordinary work. MCP servers remain project- or profile-scoped and require explicit configuration.

## Official domains

Prefer:

```text
docs.cloud.google.com
cloud.google.com
firebase.google.com
ai.google.dev
adk.dev
geminicli.com
developer.android.com
developer.chrome.com
web.dev
docs.flutter.dev
dart.dev
go.dev
developers.google.com
mapsplatform.google.com
```

## Evidence and output

- Ground consequential claims in retrieved official documentation, not memory.
- Preserve exact API field names, IAM permission strings, composite values, and version constraints.
- Give a complete self-contained solution with placeholders such as `PROJECT_ID`, `REGION`, or `SERVICE_NAME`.
- Link the official pages used.
- If official retrieval fails, state the failure and distinguish remaining inference.
- Do not dump raw search results or API envelopes into the response.
