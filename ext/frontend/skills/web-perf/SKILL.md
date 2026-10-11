---
name: web-perf
description: "Audit and diagnose web performance with a repository-local Lighthouse CLI when available, or agent-browser Web Vitals, network, trace, and profiler evidence otherwise. Use for Lighthouse scores, Core Web Vitals, loading waterfalls, render blocking, long tasks, layout shifts, asset weight, caching, and page-speed optimization."
---

# Web Performance Audit

Measure the page before recommending changes. Prefer reproducible lab data plus field data when available. Never present one local run as field performance.

## Current references

Read current primary documentation before quoting thresholds, scoring weights, or audit behavior:

- `https://web.dev/articles/vitals`
- `https://developer.chrome.com/docs/lighthouse/overview`
- `https://github.com/GoogleChrome/lighthouse/tree/main/docs`
- `https://developer.chrome.com/docs/lighthouse/performance/performance-scoring`
- `https://developer.mozilla.org/docs/Web/API/Performance_API`

Current Core Web Vitals are LCP, INP, and CLS. Lighthouse is a lab tool: it reports LCP and CLS but uses TBT as a lab proxy for interactivity rather than field INP. Label lab, observed-browser, and field data separately.

## Measurement route

1. Identify exact URL, authentication state, device class, cache condition, and mobile/desktop target.
2. If repository provides `node_modules/.bin/lighthouse` or a package script, use that pinned version.
3. Otherwise use an already-installed `lighthouse` binary and record its version.
4. If Lighthouse is unavailable, use `browser-automation` with `agent-browser` Web Vitals, network, trace, and profiler evidence. Do not install a package merely to run an audit.
5. Escalate to `chrome-use` only when CAPTCHA/anti-bot blocks the controlled browser or the scenario requires the user's existing cookies/session. Read the installed `browser-automation` skill (its Pi skill catalog location) for that handoff.

An agent-browser audit does not produce an official Lighthouse score. Report measured metrics without inventing one.

## Lighthouse route

Use a unique report path outside source directories unless the user requests a committed artifact:

```bash
URL='https://example.com/'
REPORT="/tmp/lighthouse-$(date +%s).json"
LIGHTHOUSE='./node_modules/.bin/lighthouse'
"$LIGHTHOUSE" --version
"$LIGHTHOUSE" "$URL" \
  --quiet \
  --chrome-flags='--headless=new' \
  --only-categories=performance \
  --output=json \
  --output-path="$REPORT"
```

Extract:

- performance score;
- FCP, LCP, Speed Index, TBT, CLS, and server response time;
- non-zero opportunity savings and material diagnostics;
- final URL, Lighthouse version, fetch time, form factor, throttling, cache assumptions, and warnings.

Run three comparable passes when variance matters and report median plus range. Keep URL, profile, throttling, cache state, and machine conditions consistent. Warm-cache is a separate scenario.

Route large JSON reports through `context-mode` rather than loading raw output into conversation.

## agent-browser route

Use a dedicated named session and follow the installed `browser-automation` skill (its Pi skill catalog location):

```bash
SESSION=perf-example
agent-browser --session "$SESSION" vitals https://example.com --json
```

For authenticated pages, establish state in the same isolated session before measuring. Collect supporting evidence only when needed:

```bash
agent-browser --session "$SESSION" network requests
agent-browser --session "$SESSION" network har start
agent-browser --session "$SESSION" reload
agent-browser --session "$SESSION" wait --load networkidle
agent-browser --session "$SESSION" network har stop /tmp/perf-example.har
agent-browser --session "$SESSION" profiler start
agent-browser --session "$SESSION" reload
agent-browser --session "$SESSION" wait --load networkidle
agent-browser --session "$SESSION" profiler stop /tmp/perf-example-profile.json
```

Use `trace start`/`trace stop` when a full DevTools trace is required. Process large HAR, JSON, and trace artifacts through `context-mode`. Label results `agent-browser lab` or `observed browser`, not field Core Web Vitals.

## Diagnosis

1. **Reproduce:** confirm intended page/state loads without unrelated console, auth, or server errors.
2. **Measure:** collect versioned Lighthouse JSON or browser metrics.
3. **Locate:** connect poor metrics to requests, long tasks, layout shifts, or code paths.
4. **Verify source:** inspect repository code and callers; do not claim an asset or dependency is unused without evidence.
5. **Prioritize:** rank by measured user impact and credible savings; ignore zero-impact opportunities.
6. **Re-measure:** after a change, repeat the same scenario and compare equivalent metrics.

Evidence mappings:

- slow TTFB → document timing, redirects, server/cache headers;
- slow LCP → LCP element, resource discovery, transfer, decode, render delay;
- high TBT/long tasks → named scripts/tasks and durations;
- poor observed interaction latency → exact interaction, event duration, blocking work;
- CLS → shifted elements and dimensions, injected content, font swaps;
- excess transfer → largest resources, compression, cache policy, critical-path relevance;
- render blocking → prove blocking resource and quantify impact.

## Output

Report:

1. scenario, tool/version, URL, auth route, device/throttling/cache conditions, and run count;
2. metric table with value, source, and rating;
3. top issues tied to observable evidence and measured or estimated impact;
4. specific fixes and owning files when repository access exists;
5. limitations and unavailable metrics;
6. before/after evidence when changes were made.

Close disposable browser sessions after collecting evidence. Do not claim performance improvement without a comparable post-change measurement.
