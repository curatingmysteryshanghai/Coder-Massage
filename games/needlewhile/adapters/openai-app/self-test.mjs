#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(ADAPTER_DIR, "server.mjs");
const SELF_PATH = join(ADAPTER_DIR, "self-test.mjs");
const RESOURCE_URI = "ui://needlewhile/portal-v0.2.1.html";
const MIME_TYPE = "text/html;profile=mcp-app";

async function syntaxCheck(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node --check failed for ${file}`));
    });
  });
}

await syntaxCheck(SERVER_PATH);
await syntaxCheck(SELF_PATH);

if (process.argv.includes("--syntax-only")) {
  process.stdout.write("syntax: ok\n");
  process.exit(0);
}

const testRoot = await mkdtemp(join(tmpdir(), "needlewhile-openai-adapter-test-"));
const stateDir = join(testRoot, "state");
const fakeBin = join(testRoot, "bin");
const browserMarker = join(testRoot, "browser-launched.txt");
await mkdir(stateDir, { recursive: true });
await mkdir(fakeBin, { recursive: true });

const fakeLauncher = `#!/bin/sh\nprintf '%s' launched > "${browserMarker}"\n`;
for (const name of ["open", "xdg-open"]) {
  const path = join(fakeBin, name);
  await writeFile(path, fakeLauncher, { mode: 0o755 });
  await chmod(path, 0o755);
}

const child = spawn(process.execPath, [SERVER_PATH], {
  env: {
    ...process.env,
    NEEDLEWHILE_STATE_DIR: stateDir,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

const responses = new Map();
const waiters = new Map();
let stderr = "";

createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => {
  const message = JSON.parse(line);
  const waiter = waiters.get(message.id);
  if (waiter) {
    waiters.delete(message.id);
    waiter.resolve(message);
  } else {
    responses.set(message.id, message);
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });

function request(id, method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  if (responses.has(id)) {
    const response = responses.get(id);
    responses.delete(id);
    return Promise.resolve(response);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timed out waiting for ${method}; stderr=${stderr}`));
    }, 12_000);
    waiters.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject,
    });
  });
}

async function markerExists() {
  try {
    await stat(browserMarker);
    return true;
  } catch {
    return false;
  }
}

async function shutdownController() {
  try {
    const state = JSON.parse(await readFile(join(stateDir, "server.json"), "utf8"));
    await fetch(`http://127.0.0.1:${state.port}/api/control?token=${state.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "shutdown", clientKind: "adapter-self-test" }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Cleanup is best effort after an assertion failure.
  }
}

try {
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {
      extensions: {
        "io.modelcontextprotocol/ui": { mimeTypes: [MIME_TYPE] },
      },
    },
    clientInfo: { name: "needlewhile-self-test", version: "0.2.1" },
  });
  assert.equal(initialized.result.protocolVersion, "2025-11-25");
  assert.equal(initialized.result.serverInfo.name, "needlewhile-openai-portal");
  assert.match(initialized.result.instructions, /trusted Needlewhile UserPromptSubmit hook/);

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const ping = await request(2, "ping");
  assert.deepEqual(ping.result, {});

  const tools = await request(3, "tools/list");
  assert.equal(tools.result.tools.length, 1);
  const descriptor = tools.result.tools[0];
  assert.equal(descriptor.name, "show_needlewhile_portal");
  assert.equal(descriptor.title, "Needlewhile");
  assert.match(descriptor.description, /trusted Needlewhile UserPromptSubmit hook/);
  assert.match(descriptor.description, /never opens a browser/);
  assert.equal(descriptor._meta.ui.resourceUri, RESOURCE_URI);
  assert.equal(descriptor._meta["openai/outputTemplate"], RESOURCE_URI);
  assert.deepEqual(descriptor.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });

  const listedResources = await request(4, "resources/list");
  assert.equal(listedResources.result.resources[0].uri, RESOURCE_URI);
  assert.equal(listedResources.result.resources[0].title, "Needlewhile");
  assert.equal(listedResources.result.resources[0].mimeType, MIME_TYPE);

  const resource = await request(5, "resources/read", { uri: RESOURCE_URI });
  const content = resource.result.contents[0];
  assert.equal(content.mimeType, MIME_TYPE);
  assert.deepEqual(content._meta.ui.csp.connectDomains, []);
  assert.deepEqual(content._meta.ui.csp.resourceDomains, []);
  assert.equal(content._meta.ui.prefersBorder, false);
  assert.equal(content._meta["openai/widgetPrefersBorder"], false);
  assert.deepEqual(content._meta["openai/widgetCSP"].redirect_domains, ["http://127.0.0.1"]);
  assert.match(content.text, /request\("ui\/open-link", \{ url: portalHref \}/);
  assert.match(content.text, /window\.openai\.openExternal\(\{ href: portalHref, redirectUrl: false \}\)/);
  assert.match(content.text, /ui\/notifications\/size-changed/);
  assert.match(content.text, /notifyIntrinsicHeight/);
  assert.match(content.text, /toolResponseMetadata\?\.call_tool_result\?\._meta\?\.portalHref/);
  assert.match(content.text, /toolResponseMetadata\?\.mcp_tool_result\?\._meta\?\.portalHref/);
  assert.match(content.text, /<a[\s\S]+id="portal"/);
  assert.match(content.text, /<img[\s\S]+class="portal-icon"/);
  assert.match(content.text, /alt=""/);
  assert.match(content.text, /width:\s*44px/);
  assert.match(content.text, /height:\s*34px/);
  assert.match(content.text, /image-rendering:\s*pixelated/);
  assert.match(content.text, /data:image\/png;base64,/);
  assert.doesNotMatch(content.text, /__NEEDLEWHILE_PORTAL_ICON_DATA_URI__/);
  assert.doesNotMatch(content.text, /portal-card|<h1|class="copy"|enter-label|id="status"|class="ring|class="spark/);
  assert.doesNotMatch(content.text, /<iframe/i);

  const called = await request(6, "tools/call", {
    name: "show_needlewhile_portal",
    arguments: {},
  });
  assert.equal(called.result.isError, undefined, called.result.content?.[0]?.text);
  assert.deepEqual(called.result.content, []);
  assert.equal(called.result.structuredContent, undefined);
  assert.match(called.result._meta.loopbackOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(called.result._meta.portalHref, /^http:\/\/127\.0\.0\.1:\d+\/#\w+$/);
  assert.equal(called.result._meta.launchMode, "user-click");
  assert.equal(await markerExists(), false, "the adapter launched a real browser command");

  const secondCall = await request(7, "tools/call", {
    name: "show_needlewhile_portal",
    arguments: {},
  });
  assert.equal(secondCall.result._meta.portalHref, called.result._meta.portalHref);
  assert.equal(await markerExists(), false, "an idempotent repeat launched a browser command");

  process.stdout.write("syntax: ok\n");
  process.stdout.write("mcp jsonl initialize/ping/tools/resources: ok\n");
  process.stdout.write(`portal: ${called.result._meta.portalHref.replace(/#.+$/, "#<redacted>")}\n`);
  process.stdout.write("browser launch: not observed\n");
} finally {
  child.stdin.end();
  await shutdownController();
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve();
    }, 1_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(testRoot, { recursive: true, force: true });
}
