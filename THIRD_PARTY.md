# Third-party code

These directories contain code or text adapted from other projects. Each keeps its upstream
license in `LICENSE` (or as noted) and its source and local changes in `UPSTREAM.json`.
Everything else in this repository is under the root `LICENSE`.

| Path | Upstream | License |
|---|---|---|
| `extensions/omp-compaction/` | [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) 18.1.16 | MIT |
| `extensions/multi-skills/` | [QuangThai/pi-multi-skills](https://github.com/QuangThai/pi-multi-skills) 1.2.1 | MIT |
| `skills/review/` | gstack (Garry Tan), with review axes from mattpocock/skills | MIT |
| `skills/qa/` | gstack (Garry Tan) | MIT |
| `skills/wayfinder/`, `skills/program/`, `skills/do/`, `skills/project-init/`, `skills/domain-modeling/`, `skills/make-plan/`, `skills/prototype/`, `skills/writing-for-agents/`, `skills/teach/` | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `skills/no-ai-slop/` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) v1.0.6 | MIT |
| `ext/frontend/skills/impeccable/` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 |
| `ext/frontend/skills/vercel-react-best-practices/`, `ext/frontend/skills/vercel-composition-patterns/` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | MIT (declared upstream; no LICENSE file is shipped there) |
| `ext/cloudflare/skills/wrangler/` | [cloudflare/skills](https://github.com/cloudflare/skills) | Apache-2.0 |
| `ext/google/skills/gcloud/`, `ext/google/skills/finding-google-skills/`, `ext/google/skills/retrieving-developer-knowledge/` | [google/skills](https://github.com/google/skills) | Apache-2.0 |
| `ext/mobile/skills/android-cli/` | [android/skills](https://github.com/android/skills) | Apache-2.0 (`LICENSE.txt`) |
| `ext/mobile/skills/ios-device-qa/` | gstack ios-qa (Garry Tan); touch synthesis from [KIF](https://github.com/kif-framework/KIF) | MIT; Apache-2.0 (`KIF-LICENSE`) |
| `ext/video/skills/watch/` | [bradautomates/claude-video](https://github.com/bradautomates/claude-video) v0.2.0 | MIT |
| `ext/dokploy/skills/dokploy/` | [andhikapraa/dokploy-kit](https://github.com/andhikapraa/dokploy-kit) | MIT |

`extensions/omp-compaction/` also downloads `@oh-my-pi/pi-natives-<platform>` (MIT) from npm at
install time; it is not committed. Pi packages listed in `packages.txt` and `ext/*/packages.txt`
are installed from their own sources under their own licenses.

Most skills were first adapted for oh-my-pi (OMP) and then for Pi, so their text differs from
upstream; `UPSTREAM.json` records the original source and the nature of the changes.
