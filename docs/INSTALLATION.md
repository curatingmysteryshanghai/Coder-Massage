# Coder Massage / coder马杀鸡 · Installation Guide

This is the canonical installation and operations runbook for the repository whose technical marketplace identifier remains `jieya`. The only game currently distributed for user testing is **[Needlewhile / 扎会儿](../games/needlewhile/)**.

Return to the [Coder Massage project overview](../README.md), or read the [repository architecture](./ARCHITECTURE.md).

## Requirements

- Node.js 18 or newer
- A local default browser
- Codex or Claude Code for bundled native lifecycle hooks
- Any other local agent host capable of invoking lifecycle commands for the generic adapter

There are no npm runtime dependencies and no build step.

## Run locally

An explicit demo both starts a manual interval and opens the Portal:

```bash
npm run demo
```

Useful commands:

```bash
npm --prefix games/needlewhile run open
npm run status
npm run stop
npm run shutdown
npm run validate
```

## Installation responsibilities

This guide is written so a person, Codex, or another AI assistant can perform the mechanical steps and recognize the exact point where the owner must take over.

> **Automation boundary:** an AI assistant may check prerequisites, download the repository, run the installer, inspect its result, and run verification. Hook approval is an owner-only security action. The owner must inspect `UserPromptSubmit`, `PostToolUse`, and `Stop`. An assistant must never approve **Trust all** for the owner, edit Codex trust records, suppress validation, or bypass Hook trust.

## Prerequisites

- Node.js 18 or newer: `node --version`
- Codex CLI on `PATH` for Codex installation: `codex --version`
- Claude Code CLI on `PATH` only for the Claude target: `claude --version`
- Git for cloning; GitHub CLI (`gh`) additionally supports authenticated private-repository cloning
- A local default browser
- PowerShell when installing on Windows

No `npm install` or build step is required. `npm` is used only by demo and validation shortcuts.

## Download the repository

When the repository is public:

```bash
git clone https://github.com/magicfanshanghai-sys/jieya.git
cd jieya
```

When it is private, the account needs collaborator access:

```bash
gh auth login
gh auth status
gh repo clone magicfanshanghai-sys/jieya
cd jieya
```

A browser download also works: open [the Jieya repository](https://github.com/magicfanshanghai-sys/jieya), choose **Code → Download ZIP**, extract it, and move or rename the extracted folder to a stable path before installing. A private repository may appear as `404` when the signed-in account lacks access. Keep this folder at the same absolute path; Codex records it as the local marketplace source for diagnostics and updates.

## Install in Codex

### macOS or Linux

Run from the repository root:

```bash
sh ./install.sh --codex
```

For an AI assistant or other non-interactive runner, prevent the installer from waiting for terminal input:

```bash
CI=1 sh ./install.sh --codex
```

### Windows PowerShell

Run from the repository root:

```powershell
$env:CI = "1"
.\install.ps1 -Target codex
$LASTEXITCODE
```

If Windows blocks a downloaded script, use a process-scoped fallback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Target codex
```

### Interpret the installer result

- Exit `0`: the plugin is installed, enabled, and all three Hooks already verify as trusted.
- Exit `2` with `NEEDLEWHILE_STATUS=pending`: expected owner handoff. The plugin is installed and enabled; Hook approval remains. Do not rerun the installer yet.
- Any other nonzero exit: installation failed. Read the first error, correct the prerequisite, access, manifest, or marketplace problem, then retry once.

### Owner-only Hook review

In Codex Desktop, the owner opens **Settings → Plugins → Needlewhile → Review**, inspects all three commands, and chooses **Trust all**. Typing `hooks` or `/hooks` in the Desktop chat does not open this screen.

In Codex CLI, the owner uses `/hooks` with the leading slash and reviews the same commands. Installing or updating can change an exact command hash and require another review. The installer never writes or bypasses trust settings.

### Verify, restart, and test

After the owner completes Hook review:

```bash
sh ./install.sh --verify
```

Windows PowerShell:

```powershell
.\install.ps1 -Target verify
```

Verification must exit `0`. Fully quit every Codex Desktop window and reopen the app so old Hook, skill, and MCP snapshots are discarded. For Codex CLI or an IDE integration, end the current session and launch a fresh session. Start a new top-level task and ask `打开 Needlewhile 时空门`.

In Codex Desktop, expect one small inline Portal and no automatic browser launch. Click it to open a normal default-browser tab, then click the page Portal to enter the game. In Codex CLI or an IDE, request the Portal explicitly and expect a normal browser/URL flow; an inline widget is not guaranteed.

## Instructions for Codex and other AI assistants

When asked to install Needlewhile for an owner:

1. Confirm `node --version` is 18+ and `codex --version` works.
2. Obtain the repository through the public, authenticated private, or ZIP route above and keep it at a stable path.
3. Run `CI=1 sh ./install.sh --codex` on macOS/Linux, or the PowerShell equivalent on Windows.
4. If the result is exit `2`, report that installation succeeded up to the security handoff. Direct the owner to review the three named Hooks. Never alter trust records yourself.
5. After the owner confirms approval, run `sh ./install.sh --verify` and require exit `0`.
6. Tell the owner to fully restart Codex, then guide the first-run test described above.
7. If verification fails, run `node games/needlewhile/scripts/codex-hook-doctor.mjs --cwd "$PWD"` and report its exact status without exposing local tokens or changing trust.

## Upgrade an existing Codex installation

Git checkout:

```bash
cd /stable/path/to/jieya
git pull --ff-only
CI=1 sh ./install.sh --codex
```

ZIP installation: replace the repository contents at the same stable absolute path. Avoid extracting into a new folder such as `jieya-main (1)`, because the existing local marketplace still points to the original location.

An upgrade may return exit `2` when Hook command hashes change. Repeat owner review, run `--verify`, and fully restart Codex.

For Claude Code, update the same stable checkout, run `sh ./install.sh --claude` (or `.\install.ps1 -Target claude` on Windows), require exit `0`, and fully restart the local Claude Code client. The Codex `--verify` target does not verify Claude Code.

## Troubleshooting an older pinned marketplace

If installation reports a version mismatch after refreshing—for example, `expected 0.4.6, found 0.4.5`—the existing `jieya` Git marketplace may still be pinned to an old PR branch. Confirm the repository URL is exactly `magicfanshanghai-sys/jieya`, then rebuild only that marketplace snapshot on `main`:

```bash
codex plugin marketplace remove jieya --json
codex plugin marketplace add magicfanshanghai-sys/jieya --ref main --json
CI=1 sh ./install.sh --codex
```

This replaces the stale marketplace checkout; it does not approve Hooks. Apply it only to the resolved `jieya` marketplace, then follow the same exit `2` owner-review and `--verify` contract.

## Install in Claude Code

Confirm `claude --version` works, then run from the repository root:

```bash
sh ./install.sh --claude
```

On Windows PowerShell:

```powershell
.\install.ps1 -Target claude
```

Require exit `0`, fully exit and restart the local Claude Code client, then ask it to `Open the Needlewhile Portal`. Claude Code uses a normal browser entry and has no inline HTML widget guarantee. The `--verify` target currently verifies Codex only. Claude Code additionally uses `StopFailure` and `SessionEnd` cleanup hooks.

## Lifecycle and entry flow

```text
prompt submitted ──► local state lease begins ──► agent works
                              │
explicit “open Portal” ───────┴──► default browser tab ─► click vortex ─► game
                                                                  │
turn ends ─────────────────────────────────────────────────────────┴──► countdown + ending
```

A new turn replaces only the stale lease from the same client and session. A delayed ending from an older run has no effect. Codex, Claude Code, and generic adapter clients can use identical session/run IDs without colliding.

## Other agent clients

The generic bridge has no automatic installer. From the repository root, pass hook JSON on standard input and use a stable client/session/run identity:

```bash
printf '%s\n' '{"session_id":"demo-session","run_id":"turn-1","task_title":"Demo"}' \
  | node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs start --client my-client
```

The shared protocol accepts one command per lifecycle phase:

```text
node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs start     --client workbuddy
node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs heartbeat --client workbuddy
node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs stop      --client workbuddy
node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs error     --client workbuddy
node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs cleanup   --client workbuddy
node games/needlewhile/skills/needlewhile/scripts/lifecycle.mjs open
```

Replace `workbuddy` with `coze` or another stable client name and keep stable session/run IDs. Native packaging is included for Codex and Claude Code. WorkBuddy/扣子 adaptation uses this command bridge only when the host offers local lifecycle hooks or command execution. A cloud-only bot cannot reach a user's loopback UI. See [`CLIENT_ADAPTERS.md`](../games/needlewhile/CLIENT_ADAPTERS.md).

## Privacy and safety

- The controller binds only to `127.0.0.1` and uses a random access token.
- The sanitized task label is capped at 88 characters and stays in controller memory.
- Raw prompt text is never written to disk.
- No global keyboard monitoring, Accessibility permission, analytics, accounts, ads, or remote game service.
- The persistent discovery file contains only PID, port, token, version, protocol version, and startup time.

## Versions

- Coder Massage collection information architecture: **0.3.0**
- Needlewhile experience/design label: **Ver.0.2**
- Needlewhile plugin/runtime: **0.4.6** (infinite-loop inline Portal, shared task clock, refined needle perspective, and verified three-Hook install handoff)
- Lifecycle protocol: **2**

## Repository layout

```text
.agents/plugins/marketplace.json       Codex collection catalog
.claude-plugin/marketplace.json        Claude Code collection catalog
games/catalog.json                     Machine-readable game registry
games/needlewhile/                     Self-contained Game 01 plugin
games/needlewhile/.codex-plugin/       Codex plugin manifest
games/needlewhile/.claude-plugin/      Claude Code plugin manifest
games/needlewhile/skills/              Shared skill, bridge, and local game
games/needlewhile/design/              Concepts and browser-verified preview
docs/PORTAL.md                         Future collection Portal contract
scripts/validate.mjs                   Collection validator
install.sh / install.ps1               Collection installers
MANIFEST.sha256                        Repository integrity hashes
```

## License

MIT. Repository visibility may change during controlled testing; the software remains an early-access development release.
