---
name: web-research
description: Route current web research, documentation lookup, academic paper research, and source verification through the smallest reliable Pi tool. Use for current information, comparisons, official-source lookup, library/API docs, literature reviews, or multi-source fact checking.
---

# Web Research

Choose the cheapest authoritative route that proves the answer. Do not use every provider by default.

## Routing

- Known static URL, official page, paper, or document: use Pi `read` directly.
- Library, framework, SDK, API, or CLI documentation: use Context7, starting with `resolve-library-id` and then `query-docs`. Use `/context7-docs` for a manual lookup.
- Unknown or current web information: use Exa through `web_search_exa`.
- Known page that needs JavaScript rendering, clean extraction, PDF handling, or structured extraction: use `firecrawl_scrape`.
- Site-wide discovery or multi-page extraction: use `firecrawl_map` before `firecrawl_crawl` when mapping is useful.
- Academic literature: use `firecrawl_research_search_papers`, preserve canonical IDs, verify claims with `firecrawl_research_read_paper`, and expand with `firecrawl_research_related_papers` when relevant.
- Large search/API/page output: use context-mode to filter, compare, or summarize before returning it to the model.
- Login, clicks, forms, uploads, downloads, or visual state: use browser automation only when direct retrieval cannot answer the question.

## Evidence workflow

1. State the concrete research question and the source type needed.
2. Start with one authoritative route and keep the query bounded.
3. Read the strongest primary sources directly before relying on snippets or summaries.
4. Corroborate consequential or disputed claims with independent sources when practical.
5. Return a synthesized answer with direct links for material claims.
6. Separate established facts from inference and state unavailable sources, access limits, publication dates, or retrieval limitations.

## Academic workflow

For a paper question, search the Research Index first. Keep each paper's `primaryId` such as `arxiv:`, `doi:`, `pmid:`, or `pmcid:`. Use passage-level reads for methods, results, datasets, limitations, and numeric claims. Do not infer details from an abstract when a relevant passage can be retrieved. Use Exa for grey literature, implementation pages, and papers outside the Research Index coverage.

## Tool boundaries

- Do not search for a URL that is already known.
- Do not use browser automation for ordinary static research.
- Do not use Firecrawl crawling when one scrape or direct read is enough.
- Do not use context-mode merely because it exists; use it when output is large or structured.
- Do not treat search snippets, index excerpts, or vendor benchmark claims as proof.
- Do not expose API keys in prompts, output, or artifacts.

## Completion

Research is complete when the route matched the question, primary evidence was read, material claims have citations, uncertainty and limitations are explicit, and the result is synthesized rather than copied raw tool output.
