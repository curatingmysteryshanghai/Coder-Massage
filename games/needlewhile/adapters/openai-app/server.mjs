#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const IMPORT_PLUGIN_ROOT = join(ADAPTER_DIR, "..", "..");
const PORTAL_HTML_PATH = join(ADAPTER_DIR, "portal.html");
const PORTAL_ICON_PATH = join(ADAPTER_DIR, "assets", "portal-icon.gif");
const PORTAL_STATIC_ICON_PATH = join(ADAPTER_DIR, "assets", "portal-icon.png");
const RESOURCE_URI = "ui://needlewhile/portal-v0.2.4.html";
const LEGACY_RESOURCE_URIS = new Set([
  "ui://needlewhile/portal-v0.2.1.html",
  "ui://needlewhile/portal-v0.2.2.html",
  "ui://needlewhile/portal-v0.2.3.html",
]);
const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const APP_VERSION = "0.2.4";
const MAX_LINE_BYTES = 1024 * 1024;

const [portalHtml, portalIcon, portalStaticIcon] = await Promise.all([
  readFile(PORTAL_HTML_PATH, "utf8"),
  readFile(PORTAL_ICON_PATH),
  readFile(PORTAL_STATIC_ICON_PATH),
]);
const widgetHtml = portalHtml
  .replace(
    "__NEEDLEWHILE_PORTAL_ICON_DATA_URI__",
    `data:image/gif;base64,${portalIcon.toString("base64")}`,
  )
  .replace(
    "__NEEDLEWHILE_PORTAL_STATIC_ICON_DATA_URI__",
    `data:image/png;base64,${portalStaticIcon.toString("base64")}`,
  );
const RUNTIME_SNAPSHOT_ROOT = await prepareRuntimeSnapshot();
// Release the installed plugin directory before Codex moves or replaces its
// cache. This is required on Windows, where a process cwd locks directory moves.
process.chdir(RUNTIME_SNAPSHOT_ROOT);

const portalTool = {
  name: "show_needlewhile_portal",
  title: "Needlewhile",
  description:
    "Render the tiny borderless Needlewhile pixel-art Portal icon when the user explicitly asks, or exactly once when the trusted Needlewhile UserPromptSubmit hook requests it for a top-level turn. This tool never opens a browser; the full game opens only after the user clicks the Portal.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    ui: {
      resourceUri: RESOURCE_URI,
      visibility: ["model"],
    },
    "openai/outputTemplate": RESOURCE_URI,
    "openai/widgetAccessible": true,
  },
};

const openGameTool = {
  name: "open_needlewhile_game",
  title: "Open Needlewhile",
  description:
    "Open the already-prepared local Needlewhile game in the system default browser after the user clicks the inline Portal.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  _meta: {
    ui: {
      visibility: ["app"],
    },
    "openai/widgetAccessible": true,
    "openai/visibility": "private",
  },
};

const resourceMeta = {
  ui: {
    csp: {
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
    },
    prefersBorder: false,
  },
  "openai/widgetShowCodexWidgetInline": true,
  "openai/widgetHeightHint": 44,
  "openai/widgetMinFrameHeight": 44,
  "openai/widgetDescription":
    "A tiny saturated unlabeled borderless pixel-art time portal icon. It opens the local Needlewhile game only after the user clicks it; no accompanying narration is needed.",
  "openai/widgetPrefersBorder": false,
  "openai/widgetCSP": {
    connect_domains: [],
    resource_domains: [],
    frame_domains: [],
    redirect_domains: [],
  },
};

function safeLocalIdentity() {
  const identity = typeof process.getuid === "function"
    ? process.getuid()
    : process.env.USERNAME ?? "user";
  return String(identity).replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function prepareRuntimeSnapshot() {
  const sourceRoot = join(IMPORT_PLUGIN_ROOT, "skills", "needlewhile");
  const sourceDigest = await hashDirectory(sourceRoot);
  const injectedSnapshotBase = process.env.NEEDLEWHILE_MCP_SNAPSHOT_BASE;
  if (injectedSnapshotBase) {
    await mkdir(injectedSnapshotBase, { recursive: true, mode: 0o700 });
  }
  const snapshotPrefix = injectedSnapshotBase
    ? join(injectedSnapshotBase, `${APP_VERSION}-${sourceDigest.slice(0, 16)}-${process.pid}-`)
    : join(tmpdir(), `needlewhile-mcp-runtime-${safeLocalIdentity()}-${APP_VERSION}-${sourceDigest.slice(0, 16)}-${process.pid}-`);
  // mkdtemp atomically creates a private, unpredictable directory. Production
  // never relies on a shared predictable parent under /tmp.
  const snapshotRoot = await mkdtemp(snapshotPrefix);
  try {
    await cp(
      sourceRoot,
      join(snapshotRoot, "skills", "needlewhile"),
      { recursive: true },
    );
    const snapshotDigest = await hashDirectory(join(snapshotRoot, "skills", "needlewhile"));
    if (snapshotDigest !== sourceDigest) {
      throw new Error("Needlewhile runtime snapshot integrity check failed");
    }
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
  return snapshotRoot;
}

async function hashDirectory(root) {
  const hash = createHash("sha256");

  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absoluteName = join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D\0${relativeName}\0`);
        await visit(absoluteName, relativeName);
      } else if (entry.isFile()) {
        const contents = await readFile(absoluteName);
        hash.update(`F\0${relativeName}\0${contents.length}\0`);
        hash.update(contents);
      } else {
        throw new Error(`Unsupported Needlewhile runtime entry: ${relativeName}`);
      }
    }
  }

  await visit(root);
  return hash.digest("hex");
}

function lifecyclePathCandidates() {
  const roots = [
    RUNTIME_SNAPSHOT_ROOT,
    process.env.CLAUDE_PLUGIN_ROOT,
    // Startup moves cwd into the private snapshot. Resolve it at call time so
    // later child processes inherit that upgrade-safe directory as well.
    process.cwd(),
    IMPORT_PLUGIN_ROOT,
  ].filter((value) => typeof value === "string" && value.length > 0);

  return [...new Set(roots)].map((root) => join(
    root,
    "skills",
    "needlewhile",
    "scripts",
    "lifecycle.mjs",
  ));
}

async function resolveLifecyclePath() {
  for (const candidate of lifecyclePathCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through current cwd, environment, and import-path fallbacks.
    }
  }
  throw new Error("Needlewhile was updated while Codex was open; restart Codex once and try again");
}

function stateDirectory() {
  if (process.env.NEEDLEWHILE_STATE_DIR) return process.env.NEEDLEWHILE_STATE_DIR;
  const identity = typeof process.getuid === "function"
    ? process.getuid()
    : process.env.USERNAME ?? "user";
  const safeIdentity = String(identity).replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(tmpdir(), `needlewhile-${safeIdentity}`);
}

function parseControllerState(raw) {
  const state = JSON.parse(raw);
  const validPort = Number.isInteger(state.port) && state.port >= 1 && state.port <= 65535;
  const validToken = typeof state.token === "string" && /^[a-f0-9]{32,128}$/i.test(state.token);
  if (!validPort || !validToken) {
    throw new Error("Needlewhile controller wrote an invalid state file");
  }
  return state;
}

async function ensureLocalController() {
  await runLifecycle(["open", "--no-window"], { noWindow: true });

  const stateFile = join(stateDirectory(), "server.json");
  const state = parseControllerState(await readFile(stateFile, "utf8"));
  const loopbackOrigin = `http://127.0.0.1:${state.port}`;
  return {
    loopbackOrigin,
    portalHref: `${loopbackOrigin}/#${state.token}`,
  };
}

async function runLifecycle(args, { noWindow = false } = {}) {
  const lifecyclePath = await resolveLifecyclePath();
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [lifecyclePath, ...args],
      {
        cwd: RUNTIME_SNAPSHOT_ROOT,
        env: {
          ...process.env,
          NEEDLEWHILE_NO_WINDOW: noWindow ? "1" : "0",
        },
        // lifecycle.mjs reads hook data until EOF; an ignored stdin supplies EOF
        // immediately and avoids hanging a normal stdio MCP tool call.
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Needlewhile lifecycle timed out"));
    }, 10_000);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8_192) stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(
        `Needlewhile lifecycle exited with ${code ?? signal ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`,
      ));
    });
  });
}

function success(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function failure(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

function resourceDescriptor() {
  return {
    uri: RESOURCE_URI,
    name: "needlewhile_portal_v0_2_4",
    title: "Needlewhile",
    description: "Tiny borderless pixel-art portal for entering the local Needlewhile game.",
    mimeType: RESOURCE_MIME_TYPE,
    _meta: resourceMeta,
  };
}

async function callPortalTool() {
  try {
    const { loopbackOrigin, portalHref } = await ensureLocalController();
    return {
      content: [],
      _meta: {
        loopbackOrigin,
        portalHref,
        launchMode: "user-click",
      },
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Needlewhile could not prepare its local portal: ${String(error.message ?? error)}`,
        },
      ],
    };
  }
}

async function callOpenGameTool() {
  try {
    await runLifecycle(["open", "--client", "codex"]);
    return {
      content: [],
      _meta: {
        launched: true,
        launchMode: "system-default-browser",
      },
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Needlewhile could not open its local game: ${String(error.message ?? error)}`,
        },
      ],
    };
  }
}

async function dispatch(message) {
  const hasId = Object.hasOwn(message, "id");
  const id = hasId ? message.id : null;
  const method = message.method;

  if (message.jsonrpc !== "2.0" || typeof method !== "string") {
    return hasId ? failure(id, -32600, "Invalid Request") : null;
  }

  if (!hasId) {
    // Initialization/cancellation notifications require no response.
    return null;
  }

  if (method === "initialize") {
    return success(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
      },
      serverInfo: {
        name: "needlewhile-openai-portal",
        title: "Needlewhile",
        version: APP_VERSION,
        description: "Tiny borderless inline portal for the local Needlewhile decompression game.",
      },
      instructions:
        "Call show_needlewhile_portal after an explicit user request, or exactly once when the trusted Needlewhile UserPromptSubmit hook asks for the inline Portal on a top-level turn. Never repeat or narrate it during that turn. The render tool never opens a browser; its app-only click action does so only after the user clicks.",
    });
  }

  if (method === "ping") return success(id, {});

  if (method === "tools/list") {
    return success(id, { tools: [portalTool, openGameTool] });
  }

  if (method === "tools/call") {
    const params = message.params;
    if (!params || ![portalTool.name, openGameTool.name].includes(params.name)) {
      return failure(id, -32602, "Unknown tool", { name: params?.name ?? null });
    }
    const args = params.arguments ?? {};
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length > 0) {
      return failure(id, -32602, `${params.name} does not accept arguments`);
    }
    return success(
      id,
      params.name === portalTool.name
        ? await callPortalTool()
        : await callOpenGameTool(),
    );
  }

  if (method === "resources/list") {
    return success(id, { resources: [resourceDescriptor()] });
  }

  if (method === "resources/read") {
    const requestedUri = message.params?.uri;
    if (requestedUri !== RESOURCE_URI && !LEGACY_RESOURCE_URIS.has(requestedUri)) {
      return failure(id, -32002, "Resource not found", { uri: message.params?.uri ?? null });
    }
    return success(id, {
      contents: [
        {
          uri: requestedUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: resourceMeta,
        },
      ],
    });
  }

  return failure(id, -32601, "Method not found", { method });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) continue;
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
    send(failure(null, -32700, "JSON-RPC message exceeds 1 MiB"));
    continue;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send(failure(null, -32700, "Parse error"));
    continue;
  }

  try {
    const response = await dispatch(message);
    if (response) send(response);
  } catch (error) {
    if (Object.hasOwn(message, "id")) {
      send(failure(message.id, -32603, "Internal error", String(error.message ?? error)));
    }
  }
}
