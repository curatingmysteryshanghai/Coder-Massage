# Jieya · Ver.0.2

### Small tactile rituals for the time between a prompt and an answer.

Jieya is a private collection of low-attention decompression games for people working with AI agents. The first playable game is **Needlewhile / 扎会儿**.

<p align="center">
  <img src="./games/needlewhile/design/preview.png" alt="Needlewhile Ver.0.2 pixel Portal and refined yarn-ball game" width="100%">
</p>

## What changed in Ver.0.2

- **Browser-safe task start:** trusted Codex hooks quietly track state and request one small inline Portal. They never launch, maximize, resize, profile, or switch a browser. The system default browser opens a normal tab only after a user click or explicit `open` command.
- **Pixel time Portal:** the small animated time vortex appears with a top-level Codex task; the user still chooses when to enter the game.
- **Browser keys stay usable:** `Escape`, `F11`, Tab, and modifier shortcuts never place needles.
- **Concrete task state:** the upper-left readout shows a sanitized task label, agent client, elapsed time, tool steps, and pin count.
- **A real ending:** the final lifecycle event starts an eight-second close countdown and pixel closing performance.
- **More variation:** a control shuffles paired background/yarn palettes; needle targets cover the center, front face, rim, foreground, and background.
- **Finer yarn:** a masked fiber layer adds delicate strands over the transparent illustrated ball.
- **Safer multi-client runtime:** leases are namespaced by client/session/run, stale endings cannot kill replacement turns, and concurrent starts share a protocol-checked controller.

## Game 01

| No. | Game | Status | Ritual |
| --- | --- | --- | --- |
| 01 | **[Needlewhile / 扎会儿](./games/needlewhile/)** | Ver.0.2 | Open the Portal when you want it, then click or press an ordinary key to sink a needle into the yarn. |

<details>
  <summary>Open the Ver.0.2 visual concept</summary>
  <p align="center">
    <img src="./games/needlewhile/design/concept-ver-0.2.png" alt="Needlewhile Ver.0.2 visual concept" width="100%">
  </p>
</details>

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
npm run open
npm run status
npm run stop
npm run shutdown
npm run validate
```

## Install in Codex

This repository is currently private. A new user must first be granted GitHub access. Use an authenticated GitHub CLI session (`gh auth login`) for cloning, or a signed-in browser for ZIP download. Anonymous clone and ZIP download will fail until the repository is made public or a release package is shared separately.

Check that `node --version` is 18 or newer and `codex --version` works in the same terminal, then clone and run one installer command:

```bash
gh auth status
gh repo clone magicfanshanghai-sys/jieya
cd jieya
sh ./install.sh --codex
```

On macOS/Linux, a GitHub ZIP works too: unzip it, enter the extracted `jieya` folder, and run the same `sh ./install.sh --codex` command. No `npm install` or build step is needed. Keep the extracted or cloned folder at a stable path: Codex caches the installed plugin, while the configured local marketplace still points to this folder for diagnostics and updates.

On Windows PowerShell, after cloning or extracting the ZIP:

```powershell
.\install.ps1 -Target codex
```

If Windows blocks a downloaded script, use a process-scoped fallback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Target codex
```

The installer attempts to open `codex://plugins/needlewhile@jieya` for review. In Codex desktop, typing `hooks` or `/hooks` in the chat box does not open Hook authorization. Use **Settings → Plugins → Needlewhile → Review → Trust all**, after inspecting the commands. Hook authorization is complete only when all three Needlewhile hooks show **Trusted**.

In Codex CLI, use `/hooks` with the leading slash, inspect the same three commands, and trust them there. Installing or updating may change an exact command hash, which intentionally requires another review. Never edit or bypass Hook trust. The hooks update local state; they do not open a window. Ask Codex to “打开 Needlewhile 时空门” when you want to play.

Until review is complete, the installer prints `NEEDLEWHILE_STATUS=pending` and exits with code `2`; this means the files are installed and only user authorization remains. After trusting all three Hooks, verify with:

```bash
sh ./install.sh --verify
```

Windows PowerShell:

```powershell
.\install.ps1 -Target verify
```

When verification reports ready, fully quit and reopen Codex once so existing projects discard old Hook, skill, and MCP-process snapshots. Start a fresh top-level task after the restart. The small inline time Portal should appear once for that task; clicking it opens a normal browser tab, and clicking the page Portal enters the game. Automatic browser launch is intentionally disabled.

## Install in Claude Code

```bash
gh repo clone magicfanshanghai-sys/jieya
cd jieya
sh ./install.sh --claude
```

On Windows PowerShell:

```powershell
.\install.ps1 -Target claude
```

Claude Code additionally uses `StopFailure` and `SessionEnd` cleanup hooks. Ask Claude Code to open the Needlewhile Portal when you want the normal browser tab.

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

The shared protocol accepts JSON on standard input and one command per lifecycle phase:

```text
node skills/needlewhile/scripts/lifecycle.mjs start     --client workbuddy
node skills/needlewhile/scripts/lifecycle.mjs heartbeat --client workbuddy
node skills/needlewhile/scripts/lifecycle.mjs stop      --client workbuddy
node skills/needlewhile/scripts/lifecycle.mjs error     --client workbuddy
node skills/needlewhile/scripts/lifecycle.mjs cleanup   --client workbuddy
node skills/needlewhile/scripts/lifecycle.mjs open
```

Replace `workbuddy` with `coze` or another stable client name. Native packaging is included for Codex and Claude Code. WorkBuddy/扣子 adaptation uses this command bridge when the host offers local lifecycle hooks or command execution. A cloud-only bot cannot reach a user's loopback UI. See [`CLIENT_ADAPTERS.md`](./games/needlewhile/CLIENT_ADAPTERS.md).

## Privacy and safety

- The controller binds only to `127.0.0.1` and uses a random access token.
- The sanitized task label is capped at 88 characters and stays in controller memory.
- Raw prompt text is never written to disk.
- No global keyboard monitoring, Accessibility permission, analytics, accounts, ads, or remote game service.
- The persistent discovery file contains only PID, port, token, version, protocol version, and startup time.

## Versions

- Jieya/design release: **0.2.0 / Ver.0.2**
- Needlewhile plugin/runtime: **0.4.6** (infinite-loop inline Portal, shared task clock, refined needle perspective, and verified three-Hook install handoff)
- Lifecycle protocol: **2**

## Repository layout

```text
.agents/plugins/marketplace.json       Codex collection catalog
.claude-plugin/marketplace.json        Claude Code collection catalog
games/needlewhile/                     Self-contained Game 01 plugin
games/needlewhile/.codex-plugin/       Codex plugin manifest
games/needlewhile/.claude-plugin/      Claude Code plugin manifest
games/needlewhile/skills/              Shared skill, bridge, and local game
games/needlewhile/design/              Concepts and browser-verified preview
scripts/validate.mjs                   Collection validator
install.sh / install.ps1               Collection installers
MANIFEST.sha256                        Repository integrity hashes
```

## License

MIT. The repository remains private while the collection is being developed.
