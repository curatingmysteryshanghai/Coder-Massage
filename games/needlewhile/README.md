# Needlewhile / 扎会儿 · Ver.0.2

An opt-in local waiting game for AI agent sessions, and Game 01 in the private [Jieya](../../README.md) collection.

![Needlewhile Ver.0.2](./design/preview.png)

Lifecycle hooks quietly track a turn. After one-time trust in Codex, the top-level prompt hook asks the host to mount a small inline pixel time Portal at task start. Clicking it opens the yarn-ball game in a normal default-browser tab. Hooks themselves never launch or take over a browser.

## Controls

- Click the pixel time Portal to enter.
- Left-click or right-click to place a needle during an active turn.
- Space, arrow keys, and most ordinary keys also place needles.
- `Escape`, `F11`, Tab, and modifier shortcuts remain browser/OS controls and never place a needle.
- Use `换配色` to randomize a paired background and yarn palette.
- Use `声音` to mute or unmute the local procedural audio.

Needles sample the front center, outer face, rim, foreground, and background. Older needles progressively sink so the interaction remains readable.

## Task and ending state

The upper-left readout shows the sanitized task label, active client, elapsed time, tool-step count, and local pin count. When the final tracked run ends, the game starts an eight-second countdown and a pixel closing performance. Browsers that reject script-driven tab closing leave a clear “close this tab” message.

## Quick demo

Requirements: Node.js 18+ and a local default browser.

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

From the repository root:

```bash
./install.sh --codex
./install.sh --claude
```

Windows PowerShell:

```powershell
.\install.ps1 -Target codex
.\install.ps1 -Target claude
```

The root marketplace catalogs install this plugin as `needlewhile@jieya`.

After installing or updating in Codex, open `/hooks`, review the three Needlewhile commands, and trust them once. Exact command changes intentionally require a fresh review.

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
- Plugin/runtime package: `0.4.1`
- Lifecycle protocol: `2`

Runtime 0.4.1 adds the trusted task-start inline Portal request and Codex-host result metadata compatibility.

See [`design-qa.md`](./design-qa.md) for visual and interaction evidence and [`PACKAGE_INFO.md`](./PACKAGE_INFO.md) for the tested boundary.

## License

MIT. The bundled production artwork was created for Needlewhile and is included with this private development release.
