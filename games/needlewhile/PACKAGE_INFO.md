# Needlewhile / 扎会儿 — Package Info

- Collection design release: Ver.0.2
- Plugin/runtime version: 0.4.0
- Lifecycle protocol: 2
- Build date: 2026-07-20
- Runtime: Node.js 18+
- Native plugin targets: Codex and Claude Code
- Adapter targets: any local client that can run start/heartbeat/stop commands, including WorkBuddy- or Coze-hosted local runners
- Local UI: normal tab in the operating system's default browser, opened only by an explicit command
- Network: loopback (`127.0.0.1`) only

## What is included

- Opt-in pixel time Portal; task hooks never launch or resize a browser
- Live task title, client, elapsed time, tool-step count, and pin count
- Eight-second closing countdown and pixel ending performance
- Random paired background/yarn palettes
- Center/front, rim, foreground, and background needle placement
- Fine-fiber rendering layered over the transparent yarn artwork
- One shared `needlewhile` skill and versioned local lifecycle protocol
- Separate Codex and Claude Code plugin manifests and hooks
- Generic command adapter contract for other local agent clients
- Zero-dependency loopback game server and browser client
- Layered procedural Web Audio needle tip, wool compression, and dry rustle sound
- macOS/Linux shell installer and Windows PowerShell installer
- Validator, design concept, browser screenshots, and SHA-256 manifests

## Validation status

The shared runtime is validated with Codex-shaped, Claude-shaped, WorkBuddy-shaped, and Coze-shaped lifecycle fixtures. Native hook packaging is supplied for Codex and Claude Code. Other clients use the documented command adapter when their local desktop or runner exposes lifecycle hooks; cloud-only sessions cannot reach a loopback browser UI.

## Privacy and window behavior

Task labels are sanitized, capped at 88 characters, kept only in controller memory, and never written to the state file. The raw prompt is never persisted. The Portal binds only to `127.0.0.1`, uses a random token, makes no remote requests, and never captures global keys. `Escape` and `F11` remain browser controls.

An explicit `open` command asks the operating system to open a normal URL in the current default browser. It does not select Chrome, create a browser profile, launch app/full-screen mode, maximize a window, or change browser settings.
