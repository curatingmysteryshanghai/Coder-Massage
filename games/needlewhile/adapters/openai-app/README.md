# Needlewhile OpenAI inline Portal adapter

This directory provides a zero-dependency, JSONL-over-stdio MCP server for hosts that can render MCP Apps resources. It exposes one click-safe render tool:

- `show_needlewhile_portal`: use after an explicit user request, or exactly once when Needlewhile's trusted top-level `UserPromptSubmit` hook asks Codex to mount the inline Portal.

The tool starts or reuses Needlewhile's loopback controller by executing the shared lifecycle command with both `open --no-window` and `NEEDLEWHILE_NO_WINDOW=1`. It then renders one saturated transparent pixel-art Portal icon inside a 44×44 borderless conversation surface. The browser opens only after the user clicks that icon.

## Architecture

Primary archetype: **interactive-decoupled**, implemented as a lightweight render-tool entry point.

- The inline resource is a small launcher, not an iframe of the full game.
- The existing local controller still owns the game and task state.
- The successful tool result has no visible text payload. The token-bearing loopback URL and launch metadata stay in widget-only `_meta`.
- Standard MCP Apps `ui/open-link` is attempted first. ChatGPT's allowlisted `window.openai.openExternal({ href, redirectUrl: false })` bridge and an ordinary user-clicked `<a target="_blank">` remain fallbacks.
- The resource requests no external CSP domains and no iframe permissions.

## MCP contract

Server entry point:

```text
node /absolute/path/to/games/needlewhile/adapters/openai-app/server.mjs
```

Implemented JSON-RPC methods:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`

The registered UI resource is versioned as:

```text
ui://needlewhile/portal-v0.2.2.html
text/html;profile=mcp-app
```

Example local stdio configuration:

```json
{
  "mcpServers": {
    "needlewhile-portal": {
      "command": "node",
      "args": [
        "/absolute/path/to/games/needlewhile/adapters/openai-app/server.mjs"
      ]
    }
  }
}
```

The host should call `show_needlewhile_portal` for an explicit request such as “打开 Needlewhile” or “我想玩扎针小游戏”, or once when the trusted Needlewhile prompt hook injects that instruction at the start of a top-level Codex turn. The tool mounts only the small inline launcher. The browser game still requires a user click.

## Validate

```bash
npm test
```

The self-test:

1. runs `node --check` on the server and test files;
2. exercises initialize, ping, tool discovery/call, and resource discovery/read over real JSONL stdio;
3. verifies the returned URL is loopback-only;
4. replaces OS browser launchers with marker scripts and confirms none are executed;
5. moves the live plugin directory aside and verifies the already-running adapter still resolves its lifecycle path;
6. repeats the tool call to verify idempotent controller reuse;
7. checks the Codex-host result metadata paths used to recover the click URL;
8. checks the injected animated GIF, saturated borderless surface, and intrinsic-size notification;
9. shuts down the temporary controller.

## Specification sources

The adapter follows the current OpenAI Apps SDK and MCP Apps guidance:

- [OpenAI Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)
- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- [Apps SDK reference](https://developers.openai.com/apps-sdk/reference)
- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Apps stable specification (2026-01-26)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [MCP stdio transport (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

`_meta.ui.resourceUri` is the standard tool-to-UI link. `_meta["openai/outputTemplate"]` is included as the ChatGPT compatibility alias. The resource uses `_meta.ui.csp` plus the OpenAI compatibility metadata documented by the Apps SDK.

## Host boundary

This package can be fully tested as a stdio MCP server locally. An actual inline render still depends on the host supporting MCP Apps for local stdio servers. ChatGPT's hosted Developer Mode normally expects a public HTTPS Streamable HTTP endpoint, so direct ChatGPT web testing requires a transport wrapper and tunnel/deployment that are intentionally outside this local adapter. Refresh the app/server registration after metadata changes so the host reloads the versioned resource.
