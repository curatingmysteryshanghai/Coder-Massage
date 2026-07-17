# Needlewhile / 扎会儿 — Package Info

- Version: 0.3.0
- Build date: 2026-07-17
- Runtime: Node.js 18+
- Targets: Codex plugins and Claude Code plugins
- Recommended Claude Code: 2.1.196+
- Local UI: Chrome or Edge app window; default browser fallback
- Network: loopback (`127.0.0.1`) only

## What is included

- One shared `needlewhile` skill
- Separate Codex and Claude Code plugin manifests
- Platform-appropriate lifecycle hook files
- Zero-dependency local game server and browser client
- Generated flat illustrated teal yarn-ball and long-needle production art
- Layered procedural Web Audio needle tip, wool compression, and dry rustle sound
- macOS/Linux shell installer and Windows PowerShell installer
- Package validator, concept image, implementation preview, and SHA-256 manifest

## Validation status

Validated on macOS with Node.js 22.22.2 and Codex CLI 0.145.0-alpha.18. The hook contract was tested for start, interrupted-turn replacement, heartbeat, concurrent sessions, background tasks, stop, and shutdown. The UI was visually checked at 1440×900 and a mobile-sized viewport. Claude Code was not installed on the build machine; its manifest and hooks were validated against the current documented schema and the shared bridge was exercised with Claude-shaped fixtures.

## MVP boundary

This build asks Chrome or Edge to open the local browser app full-screen. A system-browser fallback cannot guarantee full-screen launch. A future native shell can add a menu-bar/tray icon, signed installers, always-on-top behavior, and stronger cross-platform window control while keeping the same skill and hook protocol.
