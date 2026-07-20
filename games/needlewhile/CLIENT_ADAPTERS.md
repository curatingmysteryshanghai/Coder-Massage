# Needlewhile Ver.0.2 · Client Adapters

Needlewhile uses one local game/runtime and adapts the entry surface to each agent client. A trusted Codex task-start hook may request the small inline launcher once. The full browser game still opens only after a user click or explicit `open` request.

## Capability matrix

| Client | Lifecycle source | Best Portal surface | Ver.0.2 status |
| --- | --- | --- | --- |
| Codex desktop / compatible ChatGPT host | bundled Codex hooks + local MCP App | tiny borderless pixel-art Portal icon at top-level task start; click opens the normal local game URL | Packaged and adapter-tested; complete after all three hooks are Trusted |
| Codex CLI / IDE | bundled hooks where supported | explicit local URL in the system browser | Shared bridge works; no inline-widget promise |
| Claude Code local | bundled Claude hooks | ordinary clickable `http://127.0.0.1` URL / explicit browser open | Packaged and fixture-tested; no arbitrary HTML widget surface |
| Tencent WorkBuddy desktop | host Skill/Hook wrapper around the generic bridge | right-side built-in browser preview of the local Web app | Protocol ready; host-specific wrapper and runtime smoke test remain |
| Coze / 扣子 native cloud chat | Chat API events or platform card/link | platform card or URL; local loopback is unreachable from cloud | Link/card boundary documented; no arbitrary inline HTML promise |
| Coze Chat SDK in a custom Web host | Chat API/SSE mapped to the generic bridge or shared Web state | Needlewhile layer beside/over the embedded chat | Recommended architecture; host implementation remains product-specific |

## Shared lifecycle command contract

Run commands from the directory containing `skills/needlewhile/SKILL.md`:

```text
start:     node skills/needlewhile/scripts/lifecycle.mjs start     --client <client-kind>
heartbeat: node skills/needlewhile/scripts/lifecycle.mjs heartbeat --client <client-kind>
stop:      node skills/needlewhile/scripts/lifecycle.mjs stop      --client <client-kind>
error:     node skills/needlewhile/scripts/lifecycle.mjs error     --client <client-kind>
cleanup:   node skills/needlewhile/scripts/lifecycle.mjs cleanup   --client <client-kind>
open:      node skills/needlewhile/scripts/lifecycle.mjs open
status:    node skills/needlewhile/scripts/lifecycle.mjs status
```

Each lifecycle command reads one JSON object from standard input. Recommended fields:

```json
{
  "session_id": "stable-conversation-id",
  "run_id": "stable-turn-id",
  "task_title": "Short user-visible task label",
  "tool_name": "optional-current-tool"
}
```

Accepted run aliases are `prompt_id`, `turn_id`, and `run_id`. Accepted session aliases are `session_id`, `thread_id`, and `conversation_id`. If no explicit task title exists, a sanitized first line from `prompt`/`user_prompt` may be shown. It is capped at 88 characters, kept only in memory, and never written to the discovery file.

Protocol 2 keys leases as `clientKind:sessionId:runId`. Explicit stale run endings are no-ops. A stop event that truly omits a run ID can clean the matching client/session for compatibility.

New generic adapters should always provide a stable per-turn run ID; this is what makes delayed end events deterministic. Claude Code is the documented exception: its Stop payload has no turn ID, and its official contract says a user-interrupted turn emits no Stop, so the next anonymous Stop belongs to the active replacement turn.

## Codex and ChatGPT-compatible hosts

The plugin keeps two surfaces separate:

1. `hooks.json` updates the local lifecycle controller. On a successful, trusted, top-level Codex `UserPromptSubmit`, it returns official `hookSpecificOutput.additionalContext` asking Codex to call the Portal tool once. Other lifecycle events return `{}`. Hooks never start a browser.
2. The local MCP Apps adapter exposes `show_needlewhile_portal`. The user may request it directly, and the trusted prompt hook may request it once at task start. Its bundled `text/html;profile=mcp-app` resource renders one generated transparent pixel-art Portal icon in a 44×44 surface, with no visible copy or card. Clicking it calls the host's vetted external-navigation API and opens the tokenized loopback game URL.

The widget directly bundles its HTML/CSS/JS resource and does not iframe a third-party page. The full game remains a normal local page because it needs sustained keyboard/pointer input, audio, and an SSE connection.

### Hook review and trust

The installer attempts to open `codex://plugins/needlewhile@jieya`. In Codex desktop, typing `hooks` or `/hooks` in the chat box does not open Hook authorization. Use **Settings → Plugins → Needlewhile → Review → Trust all**, after inspecting the commands. In Codex CLI, use `/hooks` with the leading slash. Installation is complete only when all three Needlewhile hooks show **Trusted**. Installing or updating may change an exact command hash and require review again. Never edit or bypass Hook trust.

OpenAI's official references:

- [Build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server/)
- [Build a ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui/)
- [Apps SDK reference](https://developers.openai.com/apps-sdk/reference/)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Official Apps SDK examples](https://github.com/openai/openai-apps-sdk-examples)
- [App guidelines](https://developers.openai.com/apps-sdk/app-guidelines/)

For remote ChatGPT development, an MCP endpoint needs reachable HTTPS. The bundled Codex plugin adapter is local stdio; it does not expose the game controller publicly.

## Claude Code

Claude Code plugins provide skills, hooks, MCP, commands, agents, and LSP integrations. The documented Claude Code UI does not provide a general arbitrary-HTML chat widget slot. Needlewhile therefore uses native hooks for task state and an explicit ordinary URL/browser entry.

The local CLI and the game may share `127.0.0.1`. Claude Code on the web runs remotely and cannot reach a user's Mac loopback address.

Official references:

- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Fullscreen terminal links](https://code.claude.com/docs/en/fullscreen)
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)

## Tencent WorkBuddy

WorkBuddy's results area can preview a locally started Web app in its built-in browser pane. This is the closest host-native fit for keeping Needlewhile beside the active task.

Recommended wrapper flow:

1. Map the host's local task-start/tool/end events to the shared commands with `--client workbuddy`.
2. On explicit user intent, start/ensure the controller with `open --no-window` and return the loopback URL as a Web result.
3. Let WorkBuddy open that result in its right-side built-in browser.

WorkBuddy and CodeBuddy Code are distinct products. The public WorkBuddy plugin page confirms Hook/Skill/MCP concepts but does not publish a complete lifecycle event schema. Do not copy a CodeBuddy Code Beta hook manifest into WorkBuddy without a runtime smoke test.

Official references:

- [WorkBuddy plugins](https://www.codebuddy.cn/docs/workbuddy/Plugins)
- [WorkBuddy results and built-in browser](https://www.codebuddy.cn/docs/workbuddy/Results)
- [Tencent WorkBuddy product](https://cloud.tencent.com/product/workbuddy)

## Coze / 扣子

Coze plugins expose API tools. A platform `card` response does not guarantee arbitrary iframe/JavaScript execution. A native cloud bot also cannot access the user's `127.0.0.1` controller.

Two supported product directions:

- **Native Coze conversation:** return a platform card or ordinary HTTPS link to a publicly hosted Needlewhile service. Keep the Portal opt-in.
- **Custom Web host with Coze Chat SDK/API:** embed Coze chat in a page that also owns Needlewhile. Map `conversation.chat.created` / `in_progress` to start, tool/message progress to heartbeat, and `chat.completed` / `chat.failed` to stop/error. This host may run the game as a side pane or overlay without relying on the native Coze client.

Official references:

- [Coze plugins](https://www.coze.com/open/docs/guides/plugin)
- [Coze Web Chat SDK](https://www.coze.com/open/docs/developer_guides/install_web_sdk)
- [Coze message types](https://www.coze.com/open/docs/developer_guides/message_type?_lang=en)
- [Coze Studio API reference](https://github.com/coze-dev/coze-studio/wiki/6.-API-Reference)

## Release rule

An adapter is called “native” only after its manifest/hook format is confirmed by that client's official documentation and smoke-tested in the target runtime. The generic command protocol is intentionally small so unverified host wrappers can be added without changing the game or reintroducing automatic window control.
