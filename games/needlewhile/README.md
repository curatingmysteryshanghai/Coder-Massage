# Needlewhile / 扎会儿 · Ver.0.2

An opt-in local waiting game for AI agent sessions, and Game 01 in the early-access [Jieya](../../README.md) collection.

![Needlewhile Ver.0.2](./design/preview.png)

Lifecycle hooks quietly track a turn. After one-time trust in Codex, the top-level prompt hook asks the host to mount a tiny borderless pixel-art Portal icon at task start. Clicking it opens the yarn-ball game in a normal default-browser tab. Hooks themselves never launch or take over a browser.

## Controls

- Click the tiny inline pixel-art Portal to open Needlewhile, then use the page Portal to enter the game.
- Left-click or right-click to place a needle during an active turn.
- Space, arrow keys, and most ordinary keys also place needles.
- `Escape`, `F11`, Tab, and modifier shortcuts remain browser/OS controls and never place a needle.
- Use `Palette` to randomize a paired background and yarn palette.
- Use `Sound` to mute or unmute the local procedural audio.

Needles sample the front center, outer face, rim, foreground, and background. Older needles progressively sink so the interaction remains readable.

## Task and ending state

The upper-left readout shows the sanitized task label, active client, elapsed time, tool-step count, and local pin count. When the final tracked run ends, the game starts an eight-second countdown and a pixel closing performance. Browsers that reject script-driven tab closing leave a clear “close this tab” message.

## Quick demo

Requirements: Node.js 18+ and a local default browser. Run these commands from `games/needlewhile`:

```bash
npm run validate
npm run demo
```

Useful commands:

```bash
npm run open
npm run status
npm run stop
npm run shutdown
```

## Installation

Use the root [human and AI-assistant installation guide](../../README.md#installation-responsibilities) as the canonical runbook. It covers public and authenticated private downloads, ZIP installs, owner-only Hook approval, exit codes, verification, restart, first-run testing, upgrades, Windows, and Claude Code.

Node.js 18+ and a `codex` command on `PATH` are required for Codex installation. No `npm install` or build step is needed.

From the repository root on macOS or Linux:

```bash
sh ./install.sh --codex
sh ./install.sh --claude
```

Windows PowerShell:

```powershell
.\install.ps1 -Target codex
.\install.ps1 -Target claude
```

The root marketplace catalogs install this plugin as `needlewhile@jieya`.

Keep the cloned or extracted repository at a stable path. Codex caches the installed plugin, while the configured local marketplace continues to use that folder for diagnostics and updates.

The installer may return exit `2` with `NEEDLEWHILE_STATUS=pending`. This is the expected owner handoff: the plugin is installed and enabled. In Codex Desktop, the owner goes to **Settings → Plugins → Needlewhile → Review → Trust all**, inspects the commands, and confirms that `UserPromptSubmit`, `PostToolUse`, and `Stop` show **Trusted**.

In Codex CLI, use `/hooks` with the leading slash and review the same three commands. Installing or updating can change an exact command hash, so a previously trusted Hook may require review again. Never edit or bypass Hook trust.

An AI assistant may run the installer and verification, but it must never approve Hook trust for the owner or edit trust records. After owner approval, verify from the repository root with `sh ./install.sh --verify` or `.\install.ps1 -Target verify`. When verification exits `0`, fully quit and reopen Codex once. In Codex Desktop, a new top-level task can show the inline Portal; CLI and IDE surfaces may use an explicit normal-browser flow instead.

## Lifecycle protocol

`UserPromptSubmit` starts a lease, `PostToolUse` records a heartbeat/tool step, and `Stop` ends the exact run. Claude Code also uses `StopFailure` and `SessionEnd`. Protocol 2 namespaces every lease by `clientKind:sessionId:runId`, verifies runtime compatibility, and serializes concurrent cold starts with a short-lived local lock.

An ending with an explicit stale run ID has no effect. An ending that genuinely lacks a run ID uses session-level compatibility cleanup. A client can never clear another client's lease.

See [`CLIENT_ADAPTERS.md`](./CLIENT_ADAPTERS.md) for the generic WorkBuddy/Coze-compatible command bridge.

## Privacy

- Loopback network only (`127.0.0.1`).
- Random token authentication for state, SSE, control, and static game access.
- Sanitized task labels stay in volatile controller memory and are capped at 88 characters.
- Raw prompt text is never persisted.
- No global keyboard monitoring, forced browser profile, analytics, accounts, ads, or remote game service.

## Version map

- Experience label: `Ver.0.2`
- Plugin/runtime package: `0.4.6`
- Lifecycle protocol: `2`

Runtime 0.4.6 keeps the compact pixel-art Portal looping, preserves one shared task clock from prompt submission through browser entry and completion, and refines front-face needle perspective. The click invokes an app-only local launch tool instead of sending a dynamic loopback URL through Codex's external-link bridge. Runtime snapshots remain upgrade-safe, and installation remains gated on all three trusted Hooks.

See [`design-qa.md`](./design-qa.md) for visual and interaction evidence and [`PACKAGE_INFO.md`](./PACKAGE_INFO.md) for the tested boundary.

## License

MIT. The bundled production artwork was created for Needlewhile and is included with this early-access development release.
