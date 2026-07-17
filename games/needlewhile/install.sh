#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET=${1:---all}
INSTALLED=0

if ! command -v node >/dev/null 2>&1; then
  echo "Needlewhile requires Node.js 18 or newer." >&2
  exit 69
fi

node "$ROOT_DIR/scripts/validate.mjs"

install_codex() {
  if ! command -v codex >/dev/null 2>&1; then
    echo "Codex CLI was not found; skipped Codex installation." >&2
    return
  fi
  codex plugin marketplace add "$ROOT_DIR"
  codex plugin add needlewhile@needlewhile-local
  INSTALLED=1
  echo "Codex installed. Restart it, open /hooks, inspect Needlewhile, and trust its hooks."
}

install_claude() {
  if ! command -v claude >/dev/null 2>&1; then
    echo "Claude Code was not found; skipped Claude Code installation." >&2
    return
  fi
  claude plugin validate "$ROOT_DIR"
  claude plugin marketplace add "$ROOT_DIR"
  claude plugin install needlewhile@needlewhile-local
  INSTALLED=1
  echo "Claude Code installed. Restart it before the first automatic round."
}

case "$TARGET" in
  --codex) install_codex ;;
  --claude) install_claude ;;
  --all) install_codex; install_claude ;;
  *)
    echo "usage: ./install.sh [--codex|--claude|--all]" >&2
    exit 64
    ;;
esac

if [ "$INSTALLED" -eq 0 ]; then
  echo "No supported local CLI was found." >&2
  exit 69
fi
