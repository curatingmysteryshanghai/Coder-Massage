---
name: needlewhile
description: Control the Needlewhile waiting toy while Codex or Claude Code works. Use when the user asks to open, stop, inspect, demo, or troubleshoot the warm yarn-ball pin game; do not use for unrelated timers or code execution.
---

# Needlewhile / 扎会儿

Needlewhile is a tiny local companion for the interval between a submitted prompt and the agent's answer. The lifecycle hooks normally control it automatically.

## Commands

Resolve all paths relative to this `SKILL.md` file.

- Open or resume the toy: `node scripts/lifecycle.mjs start`
- Freeze it as completed: `node scripts/lifecycle.mjs stop`
- Inspect local state: `node scripts/lifecycle.mjs status --verbose`
- Close the local controller: `node scripts/lifecycle.mjs shutdown`

When the user explicitly asks for a demo, run `start`. Tell them that the opened window accepts left-click, right-click, Space, arrow keys, and ordinary keyboard keys. Run `stop` when the requested agent work ends.

## Behavior contract

- Never capture global keyboard input. Input belongs only to the focused toy window.
- Never block the agent if the local app cannot open. Hook output must remain valid JSON and exit quickly.
- Treat `UserPromptSubmit` as one waiting interval and `Stop` as its ending.
- Do not claim semantic project completion: a hook ending means the current agent turn ended.
- Multiple active sessions share one window and use leases so one session cannot stop another.
- On remote/headless sessions, skip GUI launch and return cleanly.

## Troubleshooting

Run `status --verbose`. The controller keeps only a short-lived state file under the operating system temporary directory. It requires Node.js 18 or newer and a local browser. Chrome or Edge gives the full-screen app window; the system browser is the fallback.

In Codex, installed hooks require user trust. Ask the user to open `/hooks`, inspect Needlewhile's commands, and enable them. Never bypass hook trust on their behalf.
