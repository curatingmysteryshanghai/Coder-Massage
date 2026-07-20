# Needlewhile / 扎会儿 — Package Info

- Collection design release: Ver.0.2
- Plugin/runtime version: 0.4.4
- Lifecycle protocol: 2
- Build date: 2026-07-20
- Runtime: Node.js 18+
- Native plugin targets: Codex and Claude Code
- Adapter targets: any local client that can run start/heartbeat/stop commands, including WorkBuddy- or Coze-hosted local runners
- Local UI: small inline Codex Portal requested at top-level task start; normal default-browser tab opens only after a user click or explicit command
- Network: loopback (`127.0.0.1`) only

## What is included

- Tiny borderless pixel-art Portal icon; the trusted Codex task-start hook requests it once and never launches or resizes a browser
- Live task title, client, elapsed time, tool-step count, and pin count
- Eight-second closing countdown and pixel ending performance
- Random paired background/yarn palettes
- Center/front, rim, foreground, and background needle placement
- Fine-fiber rendering layered over the transparent yarn artwork
- One shared `needlewhile` skill and versioned local lifecycle protocol
- Separate Codex and Claude Code plugin manifests and hooks
- Generic command adapter contract for other local agent clients
- Zero-dependency loopback game server and browser client
- User-supplied eight-frame transparent pixel-art Portal GIF, palette-recolored for the 44px inline MCP surface
- Layered procedural Web Audio needle tip, wool compression, and dry rustle sound
- macOS/Linux shell installer and Windows PowerShell installer
- Validator, design concept, browser screenshots, and SHA-256 manifests

## Validation status

The shared runtime is validated with Codex-shaped, Claude-shaped, WorkBuddy-shaped, and Coze-shaped lifecycle fixtures. Native hook packaging is supplied for Codex and Claude Code. Other clients use the documented command adapter when their local desktop or runner exposes lifecycle hooks; cloud-only sessions cannot reach a loopback browser UI.

Codex Hook trust is a required user review. The installer attempts to open `codex://plugins/needlewhile@jieya`. In Codex desktop, typing `hooks` or `/hooks` in chat does not open authorization; use **Settings → Plugins → Needlewhile → Review → Trust all**. In Codex CLI, use `/hooks` with the leading slash. Hook authorization is complete only when all three Needlewhile hooks show **Trusted**. Installing or updating may change an exact command hash and require review again; trust must never be edited or bypassed. Fully quit and reopen Codex once after install/update so existing projects do not retain an older skill or MCP-process snapshot.

## Privacy and window behavior

Task labels are sanitized, capped at 88 characters, kept only in controller memory, and never written to the state file. The raw prompt is never persisted. The Portal binds only to `127.0.0.1`, uses a random token, makes no remote requests, and never captures global keys. `Escape` and `F11` remain browser controls.

An explicit `open` command asks the operating system to open a normal URL in the current default browser. It does not select Chrome, create a browser profile, launch app/full-screen mode, maximize a window, or change browser settings.
