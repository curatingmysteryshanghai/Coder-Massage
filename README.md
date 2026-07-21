**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md)

# Coder Massage / coder马杀鸡

> Small rituals for AI gap time.

**Coder Massage / coder马杀鸡** is a collection of opt-in, low-attention microgames for people who build with AI agents. The repository keeps the technical ID `jieya` so existing installs remain compatible.

<p align="center">
  <img src="./games/needlewhile/design/preview.png" alt="Needlewhile pixel Portal and yarn-ball game" width="100%">
</p>

## Why this exists

Vibe coding has created a new kind of pause. We send a prompt, an AI agent starts working, and our task remains open while the agent runs. We call this interval **AI gap time**.

Social feeds and short videos can fill it. Many work environments also make it difficult to leave the desk, begin another activity, or switch attention without friction. We wanted another option: tiny local experiences that begin in seconds, stop at any moment, ask very little of the mind, and make returning to work feel easy.

These experiences are deliberately aimless. They have no score, streak, feed, or required progress. We see that small, low-pressure play as a form of digital well-being.

In the AI era, some teams build engines and others build agents on top of them. Our team is interested in designing the relationship around those systems: how humans and AI work, wait, recover, and return to a shared task.

## Current game

The only game currently available for installation and user testing is **[Needlewhile / 扎会儿](./games/needlewhile/)**.

Click a mouse button or press an ordinary key to place a needle into a yarn ball. That small action is the whole ritual. The Portal remains opt-in: a browser opens only after the user chooses to enter.

| No. | Game | Category | Status | Installable |
| --- | --- | --- | --- | --- |
| 01 | **Needlewhile / 扎会儿** | Tactile | User testing | Yes |

## Where this is going

Today, the compatibility runtime is hardwired to Needlewhile, and the release catalog contains that one game. Later, a collection-level Portal will choose from eligible games at random. Once inside, the player will be able to move between games through an in-game switcher while the same AI task clock continues.

```text
today:  Portal → Needlewhile
later:  Portal → random eligible game ↔ in-game switcher ↔ other games
```

New concepts stay outside the installable catalog until they have a self-contained package, validation, and release status. See the [game catalog](./games/README.md), [repository architecture](./docs/ARCHITECTURE.md), and [Portal contract](./docs/PORTAL.md).

## Project status

| Layer | Status |
| --- | --- |
| Coder Massage / coder马杀鸡 collection | Early development |
| Needlewhile / 扎会儿 | Installable · user testing |
| Random Portal routing | Planned |
| In-game switcher | Planned |
| Additional games | No public release yet |

## Quick install

From the repository root:

```sh
sh ./install.sh --codex
```

The complete runbook covers public and private downloads, macOS/Linux, Windows, Claude Code, verification, updates, and recovery:

- [Installation guide](./docs/INSTALLATION.md)
- [Repository architecture](./docs/ARCHITECTURE.md)
- [Adding a game](./docs/ADDING_A_GAME.md)
- [Game catalog](./games/README.md)

## Installation responsibilities

An assistant may check prerequisites, download the repository, run the installer, and verify the result. Codex Hook approval remains an owner-only security action. The owner must inspect `UserPromptSubmit`, `PostToolUse`, and `Stop`; an assistant must never approve Hook trust or edit trust records on the owner's behalf. Follow the exact [installation and verification contract](./docs/INSTALLATION.md#installation-responsibilities).

## Naming

- **Coder Massage / coder马杀鸡** — product and collection name
- **`jieya`** — compatibility identifier for the repository and plugin marketplace
- **Needlewhile / 扎会儿** — Game 01 and the only current install target
- **`needlewhile@jieya`** — canonical Codex plugin ID

The visible product name can evolve while these technical IDs stay stable for installed users.

## Privacy

The current build runs locally. Its controller binds only to `127.0.0.1` and uses a random access token. A short sanitized task label stays in memory; raw prompt text is never written to disk. There is no global keyboard monitoring, Accessibility permission, analytics, account, advertising, or remote game service.

## License

MIT. This repository is an early-access development release by Magic Fan.
