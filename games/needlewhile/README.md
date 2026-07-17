# Needlewhile / 扎会儿

A tiny local waiting game for Codex and Claude Code sessions, and Game 01 in the private [Jieya](../../README.md) collection.

![Needlewhile during an active agent turn](./design/preview.png)

When a tracked agent turn starts, Needlewhile asks Chrome or Edge to open a local full-screen app window. While the agent works, click or press most ordinary keys to place illustrated needles in a floating yarn ball. Each placement uses layered procedural Web Audio. When the last tracked turn ends, the scene freezes and the sound fades.

## Controls

- Left-click or right-click to place a needle.
- Space, arrow keys, and most ordinary keys also place needles.
- Tab and modifier shortcuts remain available to the browser and operating system.
- Use the lower-left sound control to mute or unmute.
- Press `Escape` to leave browser full-screen mode.

## Quick demo

Requirements: Node.js 18+ and a local GUI browser.

```bash
npm run validate
npm run demo
```

Useful commands:

```bash
npm run status
npm run stop
npm run shutdown
```

## Installation

From the repository root, use the Jieya installer:

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

## Lifecycle

`UserPromptSubmit` starts a round, `PostToolUse` refreshes its lease, and `Stop` ends it. Claude Code additionally uses `StopFailure` and `SessionEnd` cleanup hooks. Multiple active sessions can share one window, and a new turn replaces a stale interrupted-turn lease from the same session.

“Done” means the tracked agent turn ended. A deliberately detached process may continue afterward.

## Privacy

- Loopback network only (`127.0.0.1`).
- No prompt capture or global keyboard monitoring.
- No analytics, accounts, ads, or remote game service.
- Runtime state and the random access token stay in the operating system temporary directory.

## Tested boundary

The package passes 11 automated checks and was exercised on macOS with Node.js 22 and Codex CLI. Claude-shaped lifecycle fixtures and the Claude manifest schema were validated; Claude Code CLI and Windows/Linux execution were not tested end-to-end on the build machine.

See [`design-qa.md`](./design-qa.md) for visual and interaction evidence, and [`PACKAGE_INFO.md`](./PACKAGE_INFO.md) for the release boundary.

## License

MIT. The bundled production artwork was created for Needlewhile and is included with this private development release.
