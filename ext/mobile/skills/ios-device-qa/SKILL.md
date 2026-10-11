---
name: ios-device-qa
description: Run, review, repair, synchronize, or clean a real-device iOS DebugBridge workflow with authenticated evidence and Release-build protection.
triggers:
  - ios qa
  - test the iphone app
  - test my ios app
  - find bugs on the device
  - qa the ios app
  - review the ios design
  - fix this ios bug
  - resync the ios debug bridge
  - regenerate ios accessors
  - clean the ios debug bridge
  - remove debugbridge
---

# Real-device iOS workflow

This is the single lifecycle owner for OMP iOS device work. Select exactly one mode: `qa` for live testing, `review` for read-only visual audit, `fix` for snapshot-first repair, `sync` for bridge/accessor regeneration, or `cleanup` for explicit reversible removal. Do not substitute a simulator, XCTest, WebDriverAgent, a browser, or fabricated device responses.

## Resolve bundled assets

Set `SKILL_DIR` to the directory containing this `SKILL.md`. All runtime assets resolve only from:

```text
SKILL_DIR/device-bridge/templates/
SKILL_DIR/device-bridge/daemon/src/
SKILL_DIR/device-bridge/scripts/gen-accessors-tool/
SKILL_DIR/device-bridge/docs/
```

Runtime state belongs in the current project's `.scratch/ios-qa/` directory. Set `OMP_IOS_QA_HOME` to its absolute path for every bridge and generator invocation, and `OMP_IOS_CACHE_ROOT` to its `cache/gen-accessors` subdirectory for the TypeScript generator. Preserve the bundled `OMP_*` environment names and edit markers as protocol identifiers, not OMP tool dependencies. Never search another framework's skill root or install/update this skill during a run.

## Modes

- **qa:** source-guided real-device acquisition, typed accessors, authenticated screenshot/elements/state loops, visible interactions, coverage scoring, and a durable report.
- **review:** read-only ten-dimension visual review. It may start an already-installed daemon and rotate a token, but never installs, builds, launches, navigates, mutates, restores, edits, or deletes.
- **fix:** require a reproducing state snapshot and screenshot, trace the root cause, make the smallest source edit, rebuild/redeploy, and prove the before/after behavior with a regression fixture.
- **sync:** compare installed bridge templates, generator inputs, markers, hashes, and schema; preserve only explicit `OMP-EDIT-BEGIN/END` regions; regenerate and verify the Release guard.
- **cleanup:** inventory only bridge-owned package references, wiring, markers, generated accessors, and temporary token files; ask before each destructive removal set; keep normal restore operations available.

## Shared tool routing

- Installation, capability, or destructive choices: use the available `ask_question` tool, or ask in plain text when non-interactive.
- Coverage and phased progress: keep a concise checklist in the run report; do not assume a task tool is installed.
- Source discovery and impact tracing: Pi `find`, `grep`, and `read`; use language-server tools only if actually available.
- Source changes: `edit`/`write` only after explicit consent where required.
- Screenshot evidence: read each screenshot's plain absolute image path and inspect the returned image directly. Do not append URL query selectors to local paths.
- Device/build/runtime: direct `xcrun`, `xcodebuild`, `swift`, `bun`, and HTTP commands. Start and stop the daemon through a bounded subprocess controller that records its PID, waits for `READY`, checks `/healthz`, and terminates only its owned process in `finally`. Do not assume OMP's process supervisor exists in Pi.

## Prerequisites

- macOS with Xcode and Swift 5.9 or newer;
- a USB-connected, paired, trusted iPhone;
- app source with a buildable scheme and at least one `@Observable` type;
- `bun` for the bundled Mac daemon;
- Tailscale only when remote access is explicitly requested.

## QA mode: acquire, exercise, report

1. Create a private `.scratch/ios-qa/<run-id>/` directory for metadata, screenshots, elements, snapshots, and reports.
2. Discover devices with `xcrun devicectl list devices --json-output <run-dir>/devices.json`; select a connected paired device. Ask when multiple eligible devices exist.
3. Resolve the app scheme and bundle identifier from project files. Read navigation, views, and state to build a screen/state inventory, including loading, empty, error, validation, permission, destructive, and recovery states where reachable.
4. Generate typed accessors from the bundled Swift tool. Record generated classes, fields, and schema hash. Ask before changing `Package.swift` or app source.
5. On consent, copy `TEMPLATE-MAP.json` assets into a project-local DebugBridge package. Add only Debug-conditional product dependencies, wire the server and UI resolvers inside `#if DEBUG`, and keep the Release dependency absent. The structural guard is mandatory: `swift build -c release` and binary inspection must show no DebugBridge symbols.
6. Build, install, and launch with direct commands:

```text
xcodebuild -scheme <SchemeName> -destination 'platform=iOS,id=<UDID>' build install
xcrun devicectl device process launch --device <UDID> --console <bundle-id>
```

7. Run the bundled daemon with the subprocess lifecycle above; set `OMP_IOS_QA_HOME`, `OMP_IOS_TARGET_UDID`, and `OMP_IOS_TARGET_BUNDLE_ID`, wait for `READY`, and verify loopback `/healthz`. The daemon opens the CoreDevice tunnel, reads the temporary boot token, rotates it immediately, then retains only the replacement in memory. Never record bearer tokens.
8. For each scenario, acquire the minimum capability, capture screenshot/elements/state before acting, inspect each screenshot through Pi `read` using its plain absolute path, perform visible UI actions or an explicitly snapshot-eligible state write, capture the result, and record exact evidence. Always release the session, including failure paths.
9. Report device/app/scheme/build/schema, coverage, score and confidence, findings ordered by severity, inspected screenshot paths, Release symbol guard, cleanup, daemon disposition, and remaining device state. Do not award points to untested behavior.

## Review mode: read-only visual audit

Require an already-installed bridge and healthy daemon. Use an `observe` token only. Never install, build, launch, navigate, tap, swipe, type, mutate, restore, edit, or delete. For every requested screen capture `/screenshot`, `/elements`, and `/state/snapshot`, inspect the screenshot, cross-check bounds and labels against source, and score these ten dimensions from 0–10: typography, spacing, color, touch targets, loading/empty/error states, accessibility, animation, iOS idiom alignment, information density, and AI-slop. Write `.scratch/ios-design-review/<run-id>/report.md` with connection evidence, coverage, scorecards, findings, uncertainty, and the read-only statement.

## Fix mode: snapshot-first repair

No fix without a reproducing snapshot. Read the finding, reproduce it on the same real device, save `pre-state.json`, `pre.png`, and `finding.json`, inspect the image, and confirm the schema. Trace the accessibility node through Swift view, view model, state mutation, and data source with `lsp` where available. Edit only the root cause. Rebuild, install, launch, rotate the token, restore the fixture, replay minimum steps, and save `post.png` plus post-state. Inspect pre/post images using the same question. If the bug persists, revert the attempted edit before another approach. Add `regression.json` and a project-native hardware-gated regression check when the repository has an applicable convention. Success requires the original observable failure to be gone, not merely a successful build.

## Sync mode: deterministic bridge regeneration

Read the installed version marker, generated headers, accessor hash, project-local package, `UPSTREAM.json`, and this skill's template inventory. If all hashes and schema match, report already up to date without rewriting. Otherwise regenerate accessors with a composite cache key containing Swift version, generator revision, platform triple, dependency state, and source contents, excluding generated output and fixtures. Synchronize every mapped template. Preserve project edits only inside unique, correctly nested `// OMP-EDIT-BEGIN <id>` and `// OMP-EDIT-END <id>` markers. For unmarked non-trivial differences, ask whether to replace, keep, or abort. Update markers and hashes only after the complete synchronization. Verify debug build, live schema, token rotation, and the Release symbol guard. Never forge an accessor hash or add markers to force a change.

## Cleanup mode: explicit reversible removal

Inventory exact paths, line counts, ownership, and Release guards before changing anything. Ask for one of: proceed with listed removals, dry run only, or abort. Remove only bridge package/product references, bridge imports and wiring, bridge-owned `@Snapshotable` markers, generated accessors, and the temporary device token path. Do not touch business logic, views, view models, unrelated tests, non-bridge debug code, package caches, or files outside the supplied project. If ownership is ambiguous, stop and ask. Run the project's Release build and inspect the binary for DebugBridge symbols. Report every changed/deleted path and the normal restore operation; never claim cleanup succeeded from source edits alone.

## Security and release invariants

- The embedded server accepts only loopback and CoreDevice RFC 4193 unique-local peers; never public interfaces.
- The local daemon binds loopback. Tailnet mode requires an explicit successful LocalAPI probe and a configured bind address; fail closed otherwise.
- Capability tiers are `observe`, `interact`, `mutate`, and `restore`; request the minimum tier.
- Every mutation requires the current session id, and the lock is released after each scenario.
- Audit mutation identities through the salted/redacted daemon logger. Never expose raw bearer tokens through logs, reports, or `/auth/sessions`.
- Rotate the bootstrap token immediately and remove the temporary file. The bootstrap token must never be logged as public data.
- A Release build containing DebugBridge symbols is a critical failure. Stop and report it.

## Failure recovery

| Symptom | Required action |
|---|---|
| Daemon health connection refused | Restart the owned Bun subprocess using the lifecycle above; verify readiness before continuing. |
| No eligible device | Re-run `devicectl` discovery, verify pairing/trust, and report exact state. |
| `409 schema_mismatch` | Regenerate accessors, rebuild, and capture a new snapshot. |
| `503 device_disconnected` | Reconnect USB and reacquire; never reuse stale evidence. |
| Token/identity denied | Verify local vs remote mode and minimum capability; update the project-local allowlist only by explicit owner action. |
| Release build contains DebugBridge symbols | Critical failure: stop and report the structural guard violation. |
