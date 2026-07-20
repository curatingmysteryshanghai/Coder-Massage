#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const LIFECYCLE_PATH = join(
  ADAPTER_DIR,
  "..",
  "..",
  "skills",
  "needlewhile",
  "scripts",
  "lifecycle.mjs",
);
const PORTAL_HTML_PATH = join(ADAPTER_DIR, "portal.html");
const RESOURCE_URI = "ui://needlewhile/portal-v0.2.html";
const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const APP_VERSION = "0.2.0";
const MAX_LINE_BYTES = 1024 * 1024;

const widgetHtml = await readFile(PORTAL_HTML_PATH, "utf8");

const tool = {
  name: "show_needlewhile_portal",
  title: "Show Needlewhile Portal",
  description:
    "Render the small Needlewhile pixel Portal when the user explicitly asks, or exactly once when the trusted Needlewhile UserPromptSubmit hook requests it for a top-level turn. This tool never opens a browser; the full game opens only after the user clicks the Portal.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      ready: { type: "boolean" },
      loopbackOrigin: { type: "string" },
      displayVersion: { type: "string" },
    },
    required: ["ready", "loopbackOrigin", "displayVersion"],
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
    "openai/toolInvocation/invoking": "Preparing the Needlewhile portal…",
    "openai/toolInvocation/invoked": "Needlewhile portal ready.",
  },
};

const resourceMeta = {
  ui: {
    csp: {
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
    },
    prefersBorder: true,
  },
  "openai/widgetDescription":
    "A compact pixel-art time vortex. It opens the local Needlewhile game only after the user clicks the portal.",
  "openai/widgetPrefersBorder": true,
  "openai/widgetCSP": {
    connect_domains: [],
    resource_domains: [],
    frame_domains: [],
    redirect_domains: ["http://127.0.0.1"],
  },
};

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
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [LIFECYCLE_PATH, "open", "--no-window"],
      {
        env: {
          ...process.env,
          NEEDLEWHILE_NO_WINDOW: "1",
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

  const stateFile = join(stateDirectory(), "server.json");
  const state = parseControllerState(await readFile(stateFile, "utf8"));
  const loopbackOrigin = `http://127.0.0.1:${state.port}`;
  return {
    loopbackOrigin,
    portalHref: `${loopbackOrigin}/#${state.token}`,
  };
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
    name: "needlewhile_portal_v0_2",
    title: "Needlewhile Portal · Ver. 0.2",
    description: "Small opt-in pixel portal for entering the local Needlewhile game.",
    mimeType: RESOURCE_MIME_TYPE,
    _meta: resourceMeta,
  };
}

async function callPortalTool() {
  try {
    const { loopbackOrigin, portalHref } = await ensureLocalController();
    return {
      structuredContent: {
        ready: true,
        loopbackOrigin,
        displayVersion: "Ver. 0.2",
      },
      content: [
        {
          type: "text",
          text: "Needlewhile Ver. 0.2 is ready on localhost. Open it only by clicking the inline portal.",
        },
      ],
      _meta: {
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
        title: "Needlewhile Portal",
        version: APP_VERSION,
        description: "Opt-in inline portal for the local Needlewhile decompression game.",
      },
      instructions:
        "Call show_needlewhile_portal after an explicit user request, or exactly once when the trusted Needlewhile UserPromptSubmit hook asks for the inline Portal on a top-level turn. Never repeat it during that turn. The tool never opens a browser by itself.",
    });
  }

  if (method === "ping") return success(id, {});

  if (method === "tools/list") {
    return success(id, { tools: [tool] });
  }

  if (method === "tools/call") {
    const params = message.params;
    if (!params || params.name !== tool.name) {
      return failure(id, -32602, "Unknown tool", { name: params?.name ?? null });
    }
    const args = params.arguments ?? {};
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length > 0) {
      return failure(id, -32602, "show_needlewhile_portal does not accept arguments");
    }
    return success(id, await callPortalTool());
  }

  if (method === "resources/list") {
    return success(id, { resources: [resourceDescriptor()] });
  }

  if (method === "resources/read") {
    if (message.params?.uri !== RESOURCE_URI) {
      return failure(id, -32002, "Resource not found", { uri: message.params?.uri ?? null });
    }
    return success(id, {
      contents: [
        {
          uri: RESOURCE_URI,
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
