#!/usr/bin/env bash
# Set up Pi on this machine from this repo. Pi itself must already be installed
# (https://pi.dev/install.sh or `npm i -g --ignore-scripts @earendil-works/pi-coding-agent`).
#
# Usage:  ./setup.sh [--ext LIST] [--dev]
#   --ext LIST  optional extras to enable: comma-separated names from ext/, "all", or "none".
#               Without it, setup asks in a terminal and otherwise keeps this machine's choice.
#   --dev       load this checkout directly instead of installing from GitHub, so edits here
#               take effect on the next Pi start (use on the machine where you edit the setup)
#
# Idempotent. Before changing any existing file it copies it to
# ~/.pi/agent/backups/pi-setup-<timestamp>/. Never writes secrets: credentials stay in the
# OS keyring (macOS Keychain / libsecret) and are read at runtime.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
STATE_FILE="$AGENT_DIR/pi-setup.json"
DEV=0
EXT_ARG=""
HAS_EXT_ARG=0
while (( $# )); do
  case "$1" in
    --ext) [[ $# -ge 2 ]] || { printf -- '--ext needs a value\n' >&2; exit 2; }; EXT_ARG="$2"; HAS_EXT_ARG=1; shift ;;
    --ext=*) EXT_ARG="${1#--ext=}"; HAS_EXT_ARG=1 ;;
    --dev) DEV=1 ;;
    *) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

# The GitHub source Pi installs this package from (repo mode). Override for forks.
SETUP_SOURCE="${PI_SETUP_SOURCE:-git:github.com/andhikapraa/pi-setup-public}"
# Releases: a checkout on a release tag (detached HEAD, as `git checkout vX.Y.Z` leaves it)
# installs the package at that tag, so `pi update` keeps it there. A checkout on a branch
# follows that branch, even when its tip happens to be tagged.
RELEASE=""
if (( ! DEV )) && [[ "$SETUP_SOURCE" != *@* ]] && ! git -C "$REPO_DIR" symbolic-ref -q HEAD >/dev/null 2>&1; then
  RELEASE="$(git -C "$REPO_DIR" describe --tags --exact-match --match 'v[0-9]*' HEAD 2>/dev/null || true)"
  [[ -n "$RELEASE" ]] && SETUP_SOURCE="$SETUP_SOURCE@$RELEASE"
fi

say() { printf '\033[1m[pi-setup]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[pi-setup]\033[0m %s\n' "$*" >&2; exit 1; }
interactive() { [[ -t 0 && -t 1 ]]; }

command -v pi >/dev/null || die "pi is not installed. Install it first: curl -fsSL https://pi.dev/install.sh | sh"
command -v node >/dev/null || die "node is required (Pi needs Node.js >= 22.19)"
command -v git >/dev/null || die "git is required"

STAMP="$(date +%Y%m%dT%H%M%S)"
BACKUP_DIR="$AGENT_DIR/backups/pi-setup-$STAMP"
backup() {
  [[ -e "$1" || -L "$1" ]] || return 0
  mkdir -p "$BACKUP_DIR"
  cp -a "$1" "$BACKUP_DIR/"
}
# Package sources from a list file: one per line, `#` comments and blank lines ignored.
read_sources() { [[ -e "$1" ]] || return 0; sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$1" | grep -v '^$' || true; }
# Run a settings.json transform (JS reading `s`, mutating it) atomically.
edit_settings() {
  node - "$AGENT_DIR/settings.json" "$@" <<EOF
const fs = require("node:fs");
const [file, ...args] = process.argv.slice(2);
const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
$(cat)
fs.writeFileSync(file + ".tmp", JSON.stringify(s, null, 2) + "\n");
fs.renameSync(file + ".tmp", file);
EOF
}

# --- Ext selection. Names are ext/ subdirectories; the choice is remembered in $STATE_FILE.
AVAILABLE=""
for dir in "$REPO_DIR"/ext/*/; do AVAILABLE="$AVAILABLE $(basename "$dir")"; done
has() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }
# Comma/space list, "all", or "none" → validated, de-duplicated, space-separated names.
normalize_ext() {
  local out="" name
  for name in $(printf '%s' "$1" | tr ',' ' '); do
    case "$name" in
      all) out="$AVAILABLE" ;;
      none) ;;
      *) has "$name" "$AVAILABLE" || die "unknown ext: $name (available:$AVAILABLE)"; out="$out $name" ;;
    esac
  done
  local result=""
  for name in $out; do has "$name" "$result" || result="$result $name"; done
  printf '%s' "${result# }"
}
PREV_EXT=""
[[ -e "$STATE_FILE" ]] && PREV_EXT="$(node -p '(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).ext ?? []).join(" ")' "$STATE_FILE")"

if (( HAS_EXT_ARG )); then
  EXT="$(normalize_ext "$EXT_ARG")"
elif interactive; then
  printf '\nOptional extras (ext/):\n'
  for name in $AVAILABLE; do
    mark=" "; has "$name" "$PREV_EXT" && mark="*"
    printf '  %s %-11s %s\n' "$mark" "$name" "$(head -1 "$REPO_DIR/ext/$name/ABOUT" 2>/dev/null)"
  done
  read -r -p "Enable which? (comma list, all, none; Enter keeps: ${PREV_EXT:-none}) " answer
  EXT="$(normalize_ext "${answer:-${PREV_EXT:-none}}")"
else
  EXT="$(normalize_ext "${PREV_EXT:-none}")"
fi
REMOVED_EXT=""
for name in $PREV_EXT; do has "$name" "$EXT" || REMOVED_EXT="$REMOVED_EXT $name"; done

mkdir -p "$AGENT_DIR"
say "Pi $(pi --version 2>/dev/null | head -1) · agent dir $AGENT_DIR · $(uname -sm) · $( (( DEV )) && echo dev || echo repo) mode${RELEASE:+ · release $RELEASE} · ext: ${EXT:-none}"
backup "$AGENT_DIR/settings.json"

# 1. This setup package. Dev mode points Pi at the checkout; repo mode installs from GitHub.
#    Both forms share one identity per mode, so switching removes the other one first.
if (( DEV )); then
  pi remove "$SETUP_SOURCE" >/dev/null 2>&1 || true
  say "Loading this setup package from $REPO_DIR"
  pi install "$REPO_DIR"
  package_dir="$REPO_DIR"
else
  pi remove "$REPO_DIR" >/dev/null 2>&1 || true
  say "Installing this setup package ($SETUP_SOURCE)"
  pi install "$SETUP_SOURCE"
  setup_path="${SETUP_SOURCE#git:}"; setup_path="${setup_path#https://}"; setup_path="${setup_path%%@*}"
  package_dir="$AGENT_DIR/git/${setup_path%.git}"
fi
# The package's postinstall fetches omp-compaction's renderer, but newer npm versions skip
# unapproved install scripts (and local packages never run them). Idempotent, sha512-verified.
node "$package_dir/scripts/fetch-native.mjs" \
  || say "snapcompact renderer not installed; other compaction methods still work"

# 2. Third-party packages: the core list plus each enabled ext's list. Deselected exts lose
#    theirs. `pi install` updates a same-identity entry in place (repins).
for name in $REMOVED_EXT; do
  while IFS= read -r source; do
    say "Removing $source (ext $name)"
    pi remove "$source" >/dev/null 2>&1 || true
  done < <(read_sources "$REPO_DIR/ext/$name/packages.txt")
done
install_list() {
  while IFS= read -r source; do
    say "Installing $source"
    pi install "$source"
  done < <(read_sources "$1")
}
install_list "$REPO_DIR/packages.txt"
for name in $EXT; do install_list "$REPO_DIR/ext/$name/packages.txt"; done

# Axon is a local package: copied out of the repo so its npm dependencies stay out of the checkout.
AXON_DIR="$AGENT_DIR/local-packages/pi-axon-ext"
if has axon "$EXT"; then
  say "Installing Axon provider (ext/axon)"
  rm -rf "$AXON_DIR"
  mkdir -p "$AGENT_DIR/local-packages"
  cp -a "$REPO_DIR/ext/axon/package" "$AXON_DIR"
  (cd "$AXON_DIR" && npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --silent)
  pi install "$AXON_DIR"
elif has axon "$REMOVED_EXT"; then
  say "Removing Axon provider"
  pi remove "$AXON_DIR" >/dev/null 2>&1 || true
  rm -rf "$AXON_DIR"
  if [[ -e "$AGENT_DIR/models.json" ]]; then
    backup "$AGENT_DIR/models.json"
    node -e 'const fs = require("fs"), f = process.argv[1], m = JSON.parse(fs.readFileSync(f, "utf8"));
      if (m.providers) delete m.providers.axon; fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");' "$AGENT_DIR/models.json"
  fi
fi

# 3. Settings Pi doesn't set through `pi install`: theme, model defaults, disabled builtins.
#    Keys already set on this machine win, except the builtin-MCP toggle
#    (pi-mcp-adapter replaces it).
edit_settings <<'EOF'
const defaults = { theme: "dark", defaultThinkingLevel: "medium" };
for (const [k, v] of Object.entries(defaults)) if (s[k] === undefined) s[k] = v;
s.extensions = [...new Set([...(s.extensions ?? []), "-builtin:mcp"])];
// extensions/mcp-adapter-rpc.ts loads pi-mcp-adapter itself; skip the adapter's own entry.
s.packages = (s.packages ?? []).map((p) => {
  const source = typeof p === "string" ? p : p.source;
  return /^npm:pi-mcp-adapter(@|$)/.test(source) ? { ...(typeof p === "string" ? {} : p), source, extensions: [] } : p;
});
EOF

# 4. Skills and extensions outside the package's own manifest (enabled exts, personal layer)
#    load by absolute path from the installed package, so `pi update` refreshes them too.
#    Entries pointing into this setup are rebuilt each run, so a deselected ext disappears.
layers=""
for name in $EXT; do layers="$layers ext/$name"; done
# $layers is unquoted on purpose: one argument per layer (names never contain spaces).
edit_settings "$package_dir" "$REPO_DIR" $layers <<'EOF'
const [packageDir, repoDir, ...layers] = args;
const dirs = layers.map((layer) => `${packageDir}/${layer}`);
const ours = (p) => typeof p === "string" && [packageDir, repoDir].some((root) => p.startsWith(root + "/"));
for (const key of ["skills", "extensions"]) {
  const added = dirs.map((d) => `${d}/${key}`).filter((p) => fs.existsSync(p));
  s[key] = [...(s[key] ?? []).filter((p) => !ours(p)), ...added];
  if (s[key].length === 0) delete s[key];
}
EOF

# 5. Extension configs (no secrets), only when missing so local edits survive re-runs.
install_config() {
  if [[ -e "$2" ]]; then say "Keeping existing $(basename "$2")"; return; fi
  mkdir -p "$(dirname "$2")"; cp "$1" "$2"; say "Wrote $2"
}
install_config "$REPO_DIR/config/subagent-config.json" "$AGENT_DIR/extensions/subagent/config.json"
install_config "$REPO_DIR/config/pi-exa.json" "$AGENT_DIR/pi-exa.json"

# 6. Ext configuration.
if has hindsight "$EXT" && [[ ! -e "$HOME/.hindsight/config" ]]; then
  mkdir -p "$HOME/.hindsight"
  if [[ ! -e "$HOME/.hindsight/config" ]] && interactive; then
    read -r -p "Hindsight server URL (e.g. http://localhost:8888; Enter to skip): " hs_url
    if [[ -n "$hs_url" ]]; then
      read -r -p "Global memory bank shared across projects (Enter for none): " hs_bank
      { printf 'api_url = "%s"\n' "$hs_url"; [[ -n "$hs_bank" ]] && printf 'global_bank = "%s"\n' "$hs_bank"; } > "$HOME/.hindsight/config"
      say "Wrote ~/.hindsight/config"
    fi
  fi
  [[ -e "$HOME/.hindsight/config" ]] || say "Hindsight: create ~/.hindsight/config with your server's api_url (see README)"
fi

if has axon "$EXT"; then
  # The extension reads the key through a resolver command: this OS's keyring by default
  # (the login keychain by path on macOS, since SSH sessions don't search it).
  resolver=""
  case "$(uname -s)" in
    Darwin) resolver="!security find-generic-password -s omp-axon-api -w $HOME/Library/Keychains/login.keychain-db" ;;
    Linux)  resolver='!secret-tool lookup service omp-axon account global:default' ;;
  esac

  # Base URL: $AXON_BASE_URL, else the one already configured, else ask.
  axon_url="${AXON_BASE_URL-}"
  has_url="$( [[ -e "$AGENT_DIR/axon-config.json" ]] && node -p 'Boolean(require(process.argv[1]).baseUrl)' "$AGENT_DIR/axon-config.json" || echo false)"
  if [[ -z "$axon_url" && "$has_url" != true ]] && interactive; then
    read -r -p "AxonHub base URL (e.g. https://axon.example.com; Enter to set later with /axon-config): " axon_url
  fi
  node - "$AGENT_DIR/axon-config.json" "$resolver" "$axon_url" <<'EOF'
const fs = require("node:fs");
const [file, resolver, baseUrl] = process.argv.slice(2);
const c = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
const before = JSON.stringify(c);
if (!c.apiKeyResolver && resolver) c.apiKeyResolver = resolver;
if (!c.baseUrl && baseUrl) c.baseUrl = baseUrl;
if (JSON.stringify(c) !== before) {
  fs.writeFileSync(file, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
  console.log("[pi-setup] Wrote axon-config.json (key resolved from the OS keyring)");
}
EOF
  has_url="$(node -p 'Boolean(require(process.argv[1]).baseUrl)' "$AGENT_DIR/axon-config.json" 2>/dev/null || echo false)"
  [[ "$has_url" == true ]] || say "Axon: no base URL yet. Run /axon-config in Pi or set AXON_BASE_URL."


  # Warm the Axon catalog: it is fetched on the first normal session start, so
  # `--model axon/...` works right away. Bounded to 60s (macOS has no `timeout`).
  if [[ "$has_url" == true ]]; then
    (cd "$(mktemp -d)" && pi -p --no-session --no-tools "Reply OK" </dev/null >/dev/null 2>&1) & warm=$!
    ( sleep 60; kill "$warm" 2>/dev/null ) & guard=$!
    disown "$guard"  # no "Terminated" job notice when it is killed below
    wait "$warm" 2>/dev/null || true
    kill "$guard" 2>/dev/null || true
    say "Model catalogs warmed"
  fi
fi


node - "$STATE_FILE" $EXT <<'EOF'
const fs = require("node:fs");
const [file, ...ext] = process.argv.slice(2);
fs.writeFileSync(file, JSON.stringify({ ext }, null, 2) + "\n");
EOF

# Outside tools some skills use. Setup never installs them; it only points them out.
missing=""
command -v agent-browser >/dev/null || missing="$missing
  agent-browser  browser-automation, qa (and web-perf): brew install agent-browser, or npm i -g agent-browser"
command -v gh >/dev/null || missing="$missing
  gh             file-pr, babysit-pr: https://cli.github.com, then gh auth login"
if [[ -n "$missing" ]]; then
  say "Optional tools not found (the skills that use them won't work until installed):$missing"
fi

# On a release, point out a newer one. Best effort: offline or no tags just skips it.
if [[ -n "$RELEASE" ]]; then
  latest="$(git -C "$REPO_DIR" ls-remote --tags --refs origin 'v*' 2>/dev/null | sed 's|.*refs/tags/||' \
    | node -e 'const t=require("fs").readFileSync(0,"utf8").split(/\s+/).filter(v=>/^v\d+\.\d+\.\d+$/.test(v));
      const n=v=>v.slice(1).split(".").map(Number); t.sort((a,b)=>{const x=n(a),y=n(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]});
      process.stdout.write(t.pop()??"")' 2>/dev/null || true)"
  if [[ -n "$latest" && "$latest" != "$RELEASE" ]]; then
    say "Release $latest is available (you're on $RELEASE). Upgrade: git fetch --tags && git checkout $latest && ./setup.sh"
  fi
fi

[[ -d "$BACKUP_DIR" ]] && say "Backups: $BACKUP_DIR"
say "Done. Remaining manual steps (see README): sign in with /login, and store keys in the OS keyring."
