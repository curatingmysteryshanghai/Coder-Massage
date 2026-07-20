#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GAME_DIR="$ROOT_DIR/games/needlewhile"
CODEX_MARKETPLACE_DIR="$ROOT_DIR"
CODEX_MARKETPLACE_NAME="jieya"
CODEX_PLUGIN_ID="needlewhile@jieya"
CODEX_LEGACY_PLUGIN_ID="needlewhile@needlewhile-local"
CODEX_GIT_SOURCE="https://github.com/magicfanshanghai-sys/jieya.git"
CODEX_DOCTOR="$GAME_DIR/scripts/codex-hook-doctor.mjs"
CODEX_MANIFEST="$GAME_DIR/.codex-plugin/plugin.json"
TARGET=${1:---all}
INSTALLED=0
CODEX_PENDING=0

case "$TARGET" in
  --codex|--claude|--all|--verify) ;;
  *)
    echo "usage: sh ./install.sh [--codex|--claude|--all|--verify]" >&2
    exit 64
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Jieya requires Node.js 18 or newer." >&2
  exit 69
fi

NODE_MAJOR=$(node -p "Number.parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || true)
case "$NODE_MAJOR" in
  ''|*[!0-9]*)
    echo "Could not determine the installed Node.js version." >&2
    exit 69
    ;;
esac
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Jieya requires Node.js 18 or newer; found $(node --version 2>/dev/null || echo unknown)." >&2
  exit 69
fi

if { [ "$TARGET" = "--codex" ] || [ "$TARGET" = "--verify" ]; } && ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI was not found; make the 'codex' command available on PATH, then retry." >&2
  exit 69
fi
if [ "$TARGET" = "--claude" ] && ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI was not found; make the 'claude' command available on PATH, then retry." >&2
  exit 69
fi

if ! EXPECTED_CODEX_VERSION=$(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (typeof manifest.version !== "string" || manifest.version.length === 0) process.exit(1);
  process.stdout.write(manifest.version);
' "$CODEX_MANIFEST" 2>/dev/null); then
  echo "Could not read the expected Needlewhile version from $CODEX_MANIFEST." >&2
  exit 65
fi

if [ "$TARGET" != "--verify" ]; then
  node "$ROOT_DIR/scripts/validate.mjs"
fi

marketplace_field() {
  field=$1
  printf '%s' "$MARKETPLACE_LIST_JSON" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const payload = JSON.parse(input);
      const entry = (payload.marketplaces || []).find((item) => item.name === "jieya");
      const field = process.argv[1];
      if (field === "exists") {
        process.stdout.write(entry ? "yes" : "no");
        return;
      }
      if (!entry) return;
      const source = entry.marketplaceSource || {};
      if (field === "type") process.stdout.write(String(source.sourceType || (entry.root ? "local" : "")));
      if (field === "source") process.stdout.write(String(source.source || entry.root || ""));
    });
  ' "$field"
}

same_local_path() {
  node - "$1" "$2" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function canonical(value) {
  const absolute = path.resolve(value);
  try {
    return fs.realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

process.exit(canonical(process.argv[2]) === canonical(process.argv[3]) ? 0 : 1);
NODE
}

same_git_source() {
  node - "$1" "$2" <<'NODE'
function canonical(value) {
  let source = String(value || "").trim().replace(/\\/g, "/").toLowerCase();
  source = source.replace(/^git@github\.com:/, "https://github.com/");
  source = source.replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  if (/^[^/:]+\/[^/]+$/.test(source)) source = `https://github.com/${source}`;
  return source.replace(/\.git$/, "").replace(/\/+$/, "");
}

process.exit(canonical(process.argv[2]) === canonical(process.argv[3]) ? 0 : 1);
NODE
}

prepare_codex_marketplace() {
  if ! MARKETPLACE_LIST_JSON=$(codex plugin marketplace list --json); then
    echo "Could not inspect configured Codex marketplaces." >&2
    exit 70
  fi

  if [ "$(marketplace_field exists)" = "no" ]; then
    if ! codex plugin marketplace add "$CODEX_MARKETPLACE_DIR" --json >/dev/null; then
      echo "Could not register the local Jieya marketplace at $CODEX_MARKETPLACE_DIR." >&2
      exit 70
    fi
    echo "Registered the local Jieya marketplace."
    return
  fi

  marketplace_type=$(marketplace_field type | tr '[:upper:]' '[:lower:]')
  marketplace_source=$(marketplace_field source)
  case "$marketplace_type" in
    git)
      if ! same_git_source "$marketplace_source" "$CODEX_GIT_SOURCE"; then
        echo "Codex marketplace 'jieya' already points to a different Git source." >&2
        echo "Expected: $CODEX_GIT_SOURCE" >&2
        exit 70
      fi
      if ! codex plugin marketplace upgrade "$CODEX_MARKETPLACE_NAME" --json >/dev/null; then
        echo "Could not refresh the configured Jieya Git marketplace." >&2
        exit 70
      fi
      echo "Refreshed the configured Jieya Git marketplace."
      ;;
    local)
      if ! same_local_path "$marketplace_source" "$CODEX_MARKETPLACE_DIR"; then
        echo "Codex marketplace 'jieya' already points to another local directory." >&2
        echo "Remove or rename the conflicting marketplace before installing Needlewhile." >&2
        exit 70
      fi
      echo "Reusing the configured local Jieya marketplace."
      ;;
    *)
      echo "Codex marketplace 'jieya' uses an unsupported source type: ${marketplace_type:-unknown}" >&2
      exit 70
      ;;
  esac
}

plugin_state() {
  printf '%s' "$PLUGIN_LIST_JSON" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const payload = JSON.parse(input);
      const plugin = (payload.installed || []).find((item) => item.pluginId === "needlewhile@jieya");
      process.stdout.write(!plugin ? "missing" : plugin.enabled ? "enabled" : "disabled");
    });
  '
}

plugin_version() {
  printf '%s' "$PLUGIN_LIST_JSON" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const payload = JSON.parse(input);
      const plugin = (payload.installed || []).find((item) => item.pluginId === "needlewhile@jieya");
      if (plugin && typeof plugin.version === "string") process.stdout.write(plugin.version);
    });
  '
}

legacy_plugin_state() {
  printf '%s' "$PLUGIN_LIST_JSON" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const payload = JSON.parse(input);
      const plugin = (payload.installed || []).find((item) => item.pluginId === "needlewhile@needlewhile-local");
      process.stdout.write(plugin ? "installed" : "missing");
    });
  '
}

ensure_codex_plugin() {
  if ! PLUGIN_LIST_JSON=$(codex plugin list --available --json); then
    echo "Could not inspect installed Codex plugins." >&2
    exit 70
  fi

  if [ "$(legacy_plugin_state)" = "installed" ]; then
    if ! codex plugin remove "$CODEX_LEGACY_PLUGIN_ID" --json >/dev/null; then
      echo "Could not remove the legacy Needlewhile plugin identity." >&2
      echo "Run: codex plugin remove $CODEX_LEGACY_PLUGIN_ID" >&2
      exit 70
    fi
    echo "Removed the legacy Needlewhile plugin identity."
    if ! PLUGIN_LIST_JSON=$(codex plugin list --available --json); then
      echo "Could not refresh the Codex plugin list after legacy migration." >&2
      exit 70
    fi
  fi

  state=$(plugin_state)
  case "$state" in
    missing)
      if ! codex plugin add "$CODEX_PLUGIN_ID" --json >/dev/null; then
        echo "Could not install $CODEX_PLUGIN_ID." >&2
        exit 70
      fi
      echo "Registered and enabled the Needlewhile Codex plugin."
      ;;
    disabled)
      # Codex currently has no separate plugin-enable command. Re-adding the
      # same canonical plugin is idempotent and restores its enabled flag.
      if ! codex plugin add "$CODEX_PLUGIN_ID" --json >/dev/null; then
        echo "Needlewhile is installed but Codex could not enable it." >&2
        exit 70
      fi
      echo "Re-enabled the installed Needlewhile Codex plugin."
      ;;
    enabled)
      installed_version=$(plugin_version)
      if [ "$installed_version" = "$EXPECTED_CODEX_VERSION" ]; then
        echo "Needlewhile Codex plugin is already enabled at version $EXPECTED_CODEX_VERSION."
      else
        if ! codex plugin add "$CODEX_PLUGIN_ID" --json >/dev/null; then
          echo "Could not synchronize the installed Needlewhile Codex plugin." >&2
          exit 70
        fi
        echo "Synchronized the installed and enabled Needlewhile Codex plugin."
      fi
      ;;
    *)
      echo "Could not determine the Needlewhile plugin state." >&2
      exit 70
      ;;
  esac

  if ! PLUGIN_LIST_JSON=$(codex plugin list --json); then
    echo "Could not verify the Needlewhile Codex plugin after installation." >&2
    exit 70
  fi
  if [ "$(plugin_state)" != "enabled" ]; then
    echo "Needlewhile did not reach the installed-and-enabled state." >&2
    exit 70
  fi
  if [ "$(legacy_plugin_state)" != "missing" ]; then
    echo "The legacy Needlewhile plugin identity is still installed." >&2
    exit 70
  fi
  actual_version=$(plugin_version)
  if [ "$actual_version" != "$EXPECTED_CODEX_VERSION" ]; then
    echo "Needlewhile version mismatch: expected $EXPECTED_CODEX_VERSION, found ${actual_version:-unknown}." >&2
    echo "The configured marketplace may be pinned to an older ref; update it and run this installer again." >&2
    exit 70
  fi
}

is_interactive_terminal() {
  case "${CI:-}" in
    1|true|TRUE|yes|YES) return 1 ;;
  esac
  [ -t 0 ] && [ -t 1 ]
}

open_codex_plugin_details() {
  if [ "$(uname -s 2>/dev/null || true)" = "Darwin" ] && command -v open >/dev/null 2>&1; then
    if ! open 'codex://plugins/needlewhile@jieya' >/dev/null 2>&1; then
      echo "Could not open Codex automatically. Open the Needlewhile plugin details manually." >&2
    fi
  else
    echo "Open the Needlewhile plugin details in Codex." >&2
  fi
}

run_codex_doctor() {
  if [ ! -f "$CODEX_DOCTOR" ]; then
    echo "Needlewhile Hook doctor is missing: $CODEX_DOCTOR" >&2
    return 3
  fi
  node "$CODEX_DOCTOR" --cwd "$ROOT_DIR"
}

verify_codex_hooks() {
  doctor_status=0
  run_codex_doctor || doctor_status=$?

  if [ "$doctor_status" -eq 0 ]; then
    echo "Needlewhile Hooks are ready: the plugin is enabled and all three Hooks are trusted."
    echo "Restart Codex once now, then start a fresh top-level task to test the Portal; do not rerun this installer."
    return
  fi

  if [ "$doctor_status" -ne 2 ]; then
    echo "Needlewhile Hook verification failed (doctor exit $doctor_status)." >&2
    exit 70
  fi

  echo "Needlewhile authorization is pending: review its three Hook commands and choose 'Trust all' in Codex." >&2
  if is_interactive_terminal; then
    open_codex_plugin_details
    printf "After choosing 'Trust all' in Codex, press Enter here to verify again: " >&2
    IFS= read -r _ || true
    doctor_status=0
    run_codex_doctor || doctor_status=$?
    if [ "$doctor_status" -eq 0 ]; then
      echo "Needlewhile Hooks are ready: the plugin is enabled and all three Hooks are trusted."
      echo "Restart Codex once now, then start a fresh top-level task to test the Portal; do not rerun this installer."
      return
    fi
    if [ "$doctor_status" -ne 2 ]; then
      echo "Needlewhile Hook verification failed after review (doctor exit $doctor_status)." >&2
      exit 70
    fi
  fi

  CODEX_PENDING=1
  echo "NEEDLEWHILE_STATUS=pending" >&2
  echo "After review, run: sh \"$ROOT_DIR/install.sh\" --verify" >&2
  echo "After trusting all three Hooks, verify with: node \"$CODEX_DOCTOR\" --cwd \"$ROOT_DIR\"" >&2
  echo "When the doctor reports ready, restart Codex once; do not rerun this installer. No trust settings were changed automatically." >&2
}

verify_codex_install() {
  if ! command -v codex >/dev/null 2>&1; then
    echo "Codex CLI was not found; make the 'codex' command available on PATH, then retry." >&2
    return 69
  fi

  if ! PLUGIN_LIST_JSON=$(codex plugin list --json); then
    echo "Could not inspect the installed Needlewhile plugin. Keep the Jieya checkout at its configured path and retry." >&2
    return 70
  fi
  if [ "$(plugin_state)" != "enabled" ]; then
    echo "Needlewhile is missing or disabled; run: sh \"$ROOT_DIR/install.sh\" --codex" >&2
    return 70
  fi
  actual_version=$(plugin_version)
  if [ "$actual_version" != "$EXPECTED_CODEX_VERSION" ]; then
    echo "Needlewhile version mismatch: expected $EXPECTED_CODEX_VERSION, found ${actual_version:-unknown}." >&2
    echo "Run: sh \"$ROOT_DIR/install.sh\" --codex" >&2
    return 70
  fi

  doctor_status=0
  run_codex_doctor || doctor_status=$?
  case "$doctor_status" in
    0)
      echo "Needlewhile is installed and all three Codex Hooks are trusted."
      echo "Fully quit and reopen Codex once, then start a fresh top-level task to test the Portal."
      ;;
    2)
      echo "NEEDLEWHILE_STATUS=pending" >&2
      echo "Needlewhile is installed, but Hook review is still required." >&2
      echo "In Codex Desktop: Settings -> Plugins -> Needlewhile -> Review -> Trust all." >&2
      echo "Then run this verification command again." >&2
      return 2
      ;;
    *)
      echo "Needlewhile Hook verification failed (doctor exit $doctor_status)." >&2
      return 70
      ;;
  esac
}

install_codex() {
  if ! command -v codex >/dev/null 2>&1; then
    echo "Codex CLI was not found; skipped Codex installation." >&2
    return
  fi
  prepare_codex_marketplace
  ensure_codex_plugin
  INSTALLED=1
  verify_codex_hooks
}

install_claude() {
  if ! command -v claude >/dev/null 2>&1; then
    echo "Claude Code was not found; skipped Claude Code installation." >&2
    return
  fi
  claude plugin validate "$GAME_DIR"
  claude plugin marketplace add "$ROOT_DIR"
  claude plugin install needlewhile@jieya
  INSTALLED=1
  echo "Needlewhile installed for Claude Code. Restart it before the first automatic round."
}

case "$TARGET" in
  --codex) install_codex ;;
  --claude) install_claude ;;
  --all) install_codex; install_claude ;;
  --verify)
    verify_status=0
    verify_codex_install || verify_status=$?
    exit "$verify_status"
    ;;
esac

if [ "$INSTALLED" -eq 0 ]; then
  echo "No supported local CLI was found." >&2
  exit 69
fi

if [ "$CODEX_PENDING" -eq 1 ]; then
  exit 2
fi
