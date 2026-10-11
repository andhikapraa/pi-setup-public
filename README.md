# pi-setup

A portable [Pi](https://pi.dev) setup: OMP-style extensions, coding workflow skills, subagent
definitions, and a curated set of Pi packages, with opt-in extras ("exts") for niche tools.
Pi itself is installed the normal way; this repo installs everything on top of it as a Pi
package, so each machine builds its own native dependencies (macOS arm64 and Linux x64 are tested).

## Install

```bash
curl -fsSL https://pi.dev/install.sh | sh     # or: npm i -g --ignore-scripts @earendil-works/pi-coding-agent
git clone https://github.com/andhikapraa/pi-setup-public ~/.pi/setup
~/.pi/setup/setup.sh
```

In a terminal, setup lists the exts and asks which to enable. To choose without the prompt:

```bash
~/.pi/setup/setup.sh --ext frontend,fallow     # or --ext all, --ext none
```

Rerun with a different `--ext` list to add or remove exts; setup remembers the last choice in
`~/.pi/agent/pi-setup.json`. `setup.sh` is safe to rerun. It backs up anything it changes to
`~/.pi/agent/backups/pi-setup-<time>/`, keeps existing config files, and merges settings
instead of replacing them.

Update later with `pi update git:github.com/andhikapraa/pi-setup-public`, or
`cd ~/.pi/setup && git pull && ./setup.sh` when package lists changed.

## Core

**Extensions** (`extensions/`):

| Extension | What it does |
|---|---|
| `omp-compaction` | OMP-style `/compact [soft\|remote\|snapcompact] [focus]`, `/handoff [focus]`, `/shake [elide\|images\|thinking]`, and OMP's automatic compaction order. Ported from oh-my-pi 18.1.16 (MIT); see its `UPSTREAM.json`. |
| `btw` | `/btw <question>`: side questions that reuse the main prompt cache and never enter the transcript. Bare `/btw` browses saved ones. |
| `retry` | `/retry` resumes a failed or aborted turn; `/regen` reruns the last prompt (asks first if the turn changed files). |
| `turn-stats` | OMP's per-reply usage row: time, Δ, input, output, cache read, time to first token, tokens/s. |
| `input-bar` | OMP's powerline status bar and context gauge on the input box, edge to edge. Also opens the skill menu after a mid-prompt `/`. |
| `multi-skills` | Type `/` mid-prompt to insert `/skill:name`; several skills per prompt. Vendored from pi-multi-skills 1.2.1 (MIT). |
| `git-ai` | Records Pi edits in [git-ai](https://usegitai.com) checkpoints when git-ai is installed. |
| `keyring-env` | Loads keys that extensions read from env vars (pi-exa's `EXA_API_KEY`) from the OS keyring into Pi's own process, so they work however Pi is launched. |
| `mcp-adapter-rpc` | Loads pi-mcp-adapter so its project-server approval prompt can't block Pi's startup in RPC mode. Without this, Pi exits with code 0 in projects whose `.mcp.json` has unapproved servers. |

**Skills** (`skills/`): `review`, `qa`, `smart-explore`, `learn-codebase`, `make-plan`,
`prototype`, `file-pr`, `babysit-pr`, `web-research`, `browser-automation`, `writing-for-agents`,
`domain-modeling`, `no-ai-slop`, the planning set (`wayfinder`, `program`, `do`, `project-init`,
`teach`), and `html-communication` / `postplan-read` for shareable [Postplan](https://www.npmjs.com/package/postplan) HTML.

**Subagents** (`agents/`): `scout`, `worker`, `reviewer` for pi-subagents.

**Packages** (`packages.txt`, pinned): context-mode, pi-exa, context7, pi-ask-question,
pi-subagents, pi-mcp-adapter.

## Exts

Each `ext/<name>/` can hold skills, extensions, and a pinned `packages.txt`.

| Ext | What it adds | Needs |
|---|---|---|
| `axon` | [AxonHub](https://github.com/looplj/axonhub) model provider and `/axon-*` commands | Your own AxonHub server and member key |
| `hindsight` | [Hindsight](https://github.com/andhikapraa/pi-hindsight) long-term memory across sessions | A Hindsight server |
| `frontend` | `impeccable`, Vercel React skills, `web-perf`, and impeccable's post-edit UI check | |
| `cloudflare` | `wrangler` | |
| `google` | `gcloud`, Google developer docs lookup, Google skill finder | |
| `mobile` | `android-cli`, `android-rooted-avd`, `ios-device-qa` | Android SDK / Xcode |
| `video` | `watch`: analyze YouTube or local videos | yt-dlp, ffmpeg |
| `dokploy` | Dokploy infrastructure through the `dokploy` CLI | A Dokploy instance |
| `fallow` | Fallow codebase analysis for TS/JS (pi-fallow) | |
| `firecrawl` | Firecrawl scraping, crawling, and research-paper search | A Firecrawl API key |
| `trello` | Trello through the trelly CLI and MCP server | |
| `adhd` | [i-have-adhd](https://github.com/ayghri/i-have-adhd): shorter, more scannable replies | |

## Credentials

Nothing secret is stored in this repo or written by `setup.sh`.

- Model providers: run `pi`, then `/login`.
- Exa (web search, core): store the key in the OS keyring; `keyring-env` loads it into Pi. A key
  saved with pi-exa's `/exa-login` or an exported `EXA_API_KEY` also works.
- Axon and Hindsight read their keys from the OS keyring.

```bash
# macOS (login keychain)
security add-generic-password -s exa-api -a "$USER" -w          # Exa API key
security add-generic-password -s omp-axon-api -a "$USER" -w     # Axon member key
security add-generic-password -s hindsight -a "$USER" -w        # Hindsight API key
# Linux (libsecret)
secret-tool store --label "Exa" service exa-api
secret-tool store --label "Axon" service omp-axon account global:default
secret-tool store --label "Hindsight" service hindsight
```

### Ext configuration

- **axon:** setup asks for your AxonHub base URL (or reads `AXON_BASE_URL`). Change it later
  with `/axon-config`. Until a URL is set, the extension only offers `/axon-config`.
- **hindsight:** setup asks for the server URL and an optional global bank, and writes
  `~/.hindsight/config`. See the [pi-hindsight README](https://github.com/andhikapraa/pi-hindsight)
  for the other options.

## omp-compaction's renderer

`/compact snapcompact` draws history onto images with OMP's native renderer. The package's
`postinstall` downloads `@oh-my-pi/pi-natives-<platform>@18.1.16` from npm (sha512-pinned) into
`extensions/omp-compaction/native/`. It's available for macOS arm64 and Linux x64; elsewhere, or
offline, snapcompact reports itself unavailable and the other compaction methods still work.

## Layout

```
extensions/   Core Pi extensions (TypeScript, loaded via jiti)
skills/       Core skills
agents/       pi-subagents agent definitions
ext/          Opt-in exts: skills/, extensions/, packages.txt, ABOUT
config/       Non-secret extension configs copied on first install
packages.txt  Pinned core Pi packages
scripts/      Install helpers
```

Want your own variant? Fork it and set `PI_SETUP_SOURCE=git:github.com/<you>/<fork>` when running `setup.sh`.

## License

MIT for this repository's own code (`LICENSE`). Vendored skills and extensions keep their
upstream licenses; see `THIRD_PARTY.md`.
