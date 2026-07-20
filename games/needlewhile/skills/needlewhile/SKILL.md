---
name: needlewhile
description: Control the opt-in Needlewhile waiting Portal while Codex, Claude Code, or another local agent client works. Use when the user asks to open, stop, inspect, demo, or troubleshoot the yarn-ball pin game; do not use for unrelated timers or code execution.
---

# Needlewhile / 扎会儿 · Ver.0.2

Needlewhile is a tiny local companion for the interval between a submitted prompt and the agent's answer. Lifecycle hooks quietly update task state. They never open, resize, maximize, or take over a browser.

## Commands

Resolve all paths relative to this `SKILL.md` file.

- Open the pixel Portal in the system default browser: `node scripts/lifecycle.mjs open`
- Start a manual demo interval: `node scripts/lifecycle.mjs start --client demo`
- Freeze that manual demo as completed: `node scripts/lifecycle.mjs stop --client demo`
- Inspect local state: `node scripts/lifecycle.mjs status --verbose`
- Close the local controller: `node scripts/lifecycle.mjs shutdown`

When the user explicitly asks to open or demo Needlewhile, start a manual interval only if there is no active task, then run `open`. Tell them that the normal browser tab first shows a pixel time Portal. The game accepts left-click, right-click, Space, arrow keys, and ordinary keyboard keys after the user enters. `Escape`, `F11`, Tab, and modifier shortcuts always remain available to the browser.

## Behavior contract

- Open the browser only after an explicit user request. A hook start is state-only.
- Use the operating system's default browser with a normal URL. Never pass full-screen, maximize, app-window, profile, or browser-selection flags.
- Never capture global keyboard input. Input belongs only to the focused toy tab.
- Never block the agent if the local controller is unavailable. Hook output must remain valid JSON and exit quickly.
- Treat `UserPromptSubmit` as one waiting interval and `Stop` as its ending.
- Do not claim semantic project completion: a hook ending means the current agent turn ended.
- Namespace leases by client, session, and run. A delayed ending from an older run must have no effect on its replacement.
- Multiple active sessions share one controller; one client cannot stop another client's game.
- Keep sanitized task labels only in memory. Never persist the raw prompt.
- On remote/headless sessions, skip the local UI and return cleanly.

## Other local clients

Any client that can run lifecycle commands can use the shared adapter:

```text
start:     node scripts/lifecycle.mjs start --client <client-name>
heartbeat: node scripts/lifecycle.mjs heartbeat --client <client-name>
stop:      node scripts/lifecycle.mjs stop --client <client-name>
error:     node scripts/lifecycle.mjs error --client <client-name>
cleanup:   node scripts/lifecycle.mjs cleanup --client <client-name>
open:      node scripts/lifecycle.mjs open
```

Pass hook JSON on standard input. Prefer stable `session_id` plus `turn_id`/`run_id`, `task_title` or `prompt`, and `tool_name`. WorkBuddy and Coze runners can use this contract only when they expose local hook/command execution; cloud-only runs cannot open a user's loopback Portal.

## Troubleshooting

Run `status --verbose`. The controller keeps only its PID, port, random token, protocol version, and start time in a short-lived file under the operating system temporary directory. It requires Node.js 18 or newer and a local default browser.

In Codex, installed hooks require user trust. Ask the user to open `/hooks`, inspect Needlewhile's commands, and enable them. Never bypass hook trust on their behalf.
