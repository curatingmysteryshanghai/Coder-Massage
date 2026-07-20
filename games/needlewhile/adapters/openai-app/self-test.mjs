#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, chmod, cp, mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(ADAPTER_DIR, "..", "..");
const SERVER_PATH = join(ADAPTER_DIR, "server.mjs");
const SELF_PATH = join(ADAPTER_DIR, "self-test.mjs");
const PORTAL_HTML_PATH = join(ADAPTER_DIR, "portal.html");
const PORTAL_GIF_PATH = join(ADAPTER_DIR, "assets", "portal-icon.gif");
const PORTAL_STATIC_PATH = join(ADAPTER_DIR, "assets", "portal-icon.png");
const RESOURCE_URI = "ui://needlewhile/portal-v0.2.3.html";
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

function extractInlineScript(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes));
  assert.equal(scripts.length, 1, "portal.html must contain exactly one inline script");
  return scripts[0][2];
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function within(promise, label, timeoutMs = 1_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createPortalScriptHarness(inlineScript, { openAiCallTool = true, serverTools }) {
  const windowListeners = new Map();
  const clickListeners = [];
  const clickPromises = [];
  const postedMessages = [];
  const openAiToolCalls = [];
  const initialized = deferred();
  const fallbackToolResult = deferred();
  let pendingServerToolCallId = null;
  let animationFrameId = 0;

  const portal = {
    disabled: true,
    attributes: new Map([["aria-disabled", "true"]]),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    addEventListener(type, listener) {
      assert.equal(type, "click", `Unexpected portal listener: ${type}`);
      clickListeners.push(listener);
    },
    click() {
      for (const listener of clickListeners) {
        const result = listener.call(this, { type: "click", target: this, currentTarget: this });
        if (result && typeof result.then === "function") clickPromises.push(result);
      }
    },
  };

  const portalShell = {
    getBoundingClientRect() {
      return { width: 44, height: 44 };
    },
  };

  const emitWindowEvent = (type, event) => {
    for (const listener of windowListeners.get(type) ?? []) listener(event);
  };

  const parent = {
    postMessage(message) {
      postedMessages.push(message);
      if (message.method === "ui/initialize" && message.id !== undefined) {
        const hostCapabilities = serverTools ? { serverTools: {} } : {};
        queueMicrotask(() => {
          emitWindowEvent("message", {
            source: parent,
            data: {
              jsonrpc: "2.0",
              id: message.id,
              result: { hostCapabilities },
            },
          });
        });
      } else if (message.method === "ui/notifications/initialized") {
        initialized.resolve();
      } else if (message.method === "tools/call") {
        assert.equal(pendingServerToolCallId, null, "Portal sent a second tools/call while one was pending");
        pendingServerToolCallId = message.id;
      }
    },
  };

  const openai = {
    notifyIntrinsicHeight() {},
  };
  if (openAiCallTool) {
    openai.callTool = (name, args) => {
      openAiToolCalls.push({ name, args });
      return fallbackToolResult.promise;
    };
  }

  const window = {
    parent,
    openai,
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
  };

  const document = {
    getElementById(id) {
      assert.equal(id, "portal");
      return portal;
    },
    querySelector(selector) {
      assert.equal(selector, ".portal-shell");
      return portalShell;
    },
  };

  runInNewContext(inlineScript, {
    URL,
    document,
    window,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      const id = ++animationFrameId;
      queueMicrotask(() => callback(Date.now()));
      return id;
    },
  }, { filename: PORTAL_HTML_PATH });

  return {
    portal,
    postedMessages,
    openAiToolCalls,
    initialized: initialized.promise,
    injectPortalHref(portalHref) {
      emitWindowEvent("message", {
        source: parent,
        data: {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: { _meta: { portalHref } },
        },
      });
    },
    resolveServerTool(result = {}) {
      assert.notEqual(pendingServerToolCallId, null, "No pending tools/call to resolve");
      const id = pendingServerToolCallId;
      pendingServerToolCallId = null;
      emitWindowEvent("message", {
        source: parent,
        data: { jsonrpc: "2.0", id, result },
      });
    },
    resolveFallbackTool(result = {}) {
      fallbackToolResult.resolve(result);
    },
    async settleClicks() {
      await within(Promise.all(clickPromises), "Portal click handler");
    },
  };
}

async function testPortalScriptClicks() {
  const portalHtml = await readFile(PORTAL_HTML_PATH, "utf8");
  const inlineScript = extractInlineScript(portalHtml);
  const portalHref = "http://127.0.0.1:43123/#valid-test-token";

  const serverToolsHarness = createPortalScriptHarness(inlineScript, { serverTools: true });
  await within(serverToolsHarness.initialized, "Portal server-tools initialization");
  serverToolsHarness.injectPortalHref(portalHref);
  assert.equal(serverToolsHarness.portal.getAttribute("aria-disabled"), "false");
  assert.equal(serverToolsHarness.portal.disabled, false);

  serverToolsHarness.portal.click();
  serverToolsHarness.portal.click();
  assert.equal(serverToolsHarness.portal.disabled, true, "Portal button must lock while tools/call is pending");
  const serverToolCalls = serverToolsHarness.postedMessages.filter((message) => message.method === "tools/call");
  assert.equal(serverToolCalls.length, 1, "Portal click must send exactly one tools/call request");
  assert.deepEqual(JSON.parse(JSON.stringify(serverToolCalls[0].params)), {
    name: "open_needlewhile_game",
    arguments: {},
  });
  assert.equal(serverToolsHarness.openAiToolCalls.length, 0, "Server-tools hosts must not use window.openai.callTool");
  serverToolsHarness.resolveServerTool({});
  await serverToolsHarness.settleClicks();
  assert.equal(serverToolsHarness.portal.disabled, false, "Portal button must recover after tools/call settles");

  const fallbackHarness = createPortalScriptHarness(inlineScript, { serverTools: false });
  await within(fallbackHarness.initialized, "Portal callTool fallback initialization");
  fallbackHarness.injectPortalHref(portalHref);
  fallbackHarness.portal.click();
  fallbackHarness.portal.click();
  assert.equal(fallbackHarness.portal.disabled, true, "Fallback click must lock the Portal button");
  assert.equal(fallbackHarness.postedMessages.filter((message) => message.method === "tools/call").length, 0);
  assert.equal(fallbackHarness.openAiToolCalls.length, 1, "Fallback must call window.openai.callTool exactly once");
  assert.deepEqual(JSON.parse(JSON.stringify(fallbackHarness.openAiToolCalls[0])), {
    name: "open_needlewhile_game",
    args: {},
  });
  fallbackHarness.resolveFallbackTool({});
  await fallbackHarness.settleClicks();
  assert.equal(fallbackHarness.portal.disabled, false, "Portal button must recover after callTool settles");

  const unsupportedHarness = createPortalScriptHarness(inlineScript, {
    openAiCallTool: false,
    serverTools: false,
  });
  await within(unsupportedHarness.initialized, "Portal unsupported-host initialization");
  unsupportedHarness.injectPortalHref(portalHref);
  assert.equal(unsupportedHarness.portal.getAttribute("aria-disabled"), "true");
  assert.equal(unsupportedHarness.portal.disabled, true, "Portal must stay disabled without a tool bridge");
  unsupportedHarness.portal.click();
  assert.equal(unsupportedHarness.postedMessages.filter((message) => message.method === "tools/call").length, 0);
  assert.equal(unsupportedHarness.openAiToolCalls.length, 0);
}

await syntaxCheck(SERVER_PATH);
await syntaxCheck(SELF_PATH);

const portalGif = await readFile(PORTAL_GIF_PATH);
assert.equal(portalGif.subarray(0, 6).toString("ascii"), "GIF89a");
assert.equal(portalGif.readUInt16LE(6), 32);
assert.equal(portalGif.readUInt16LE(8), 42);
let graphicsControlCount = 0;
for (let index = 0; index <= portalGif.length - 3; index += 1) {
  if (portalGif[index] === 0x21 && portalGif[index + 1] === 0xf9 && portalGif[index + 2] === 0x04) {
    graphicsControlCount += 1;
  }
}
assert.equal(graphicsControlCount, 8, "Portal GIF must retain all eight supplied frames");
const loopExtension = portalGif.indexOf(Buffer.from("NETSCAPE2.0", "ascii"));
assert(loopExtension >= 0, "Portal GIF loop extension is missing");
assert.equal(portalGif.readUInt16LE(loopExtension + 13), 5, "Portal GIF must stop after six total passes");
const portalStatic = await readFile(PORTAL_STATIC_PATH);
assert.equal(portalStatic.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");

if (process.argv.includes("--syntax-only")) {
  process.stdout.write("syntax: ok\n");
  process.exit(0);
}

await testPortalScriptClicks();

const testRoot = await mkdtemp(join(tmpdir(), "needlewhile-openai-adapter-test-"));
const stateDir = join(testRoot, "state");
const fakeBin = join(testRoot, "bin");
const browserMarker = join(testRoot, "browser-launched.txt");
const snapshotBase = join(testRoot, "runtime-snapshots");
const stagedPluginRoot = join(testRoot, "cache", "needlewhile", "0.4.5");
const stagedBackupRoot = join(testRoot, "cache", "plugin-backup", "needlewhile", "0.4.5");
await mkdir(stateDir, { recursive: true });
await mkdir(fakeBin, { recursive: true });
await mkdir(dirname(stagedBackupRoot), { recursive: true });
await cp(ADAPTER_DIR, join(stagedPluginRoot, "adapters", "openai-app"), { recursive: true });
await cp(join(PLUGIN_ROOT, "skills", "needlewhile"), join(stagedPluginRoot, "skills", "needlewhile"), { recursive: true });
const stagedLifecycle = join(stagedPluginRoot, "skills", "needlewhile", "scripts", "lifecycle.mjs");
await appendFile(stagedLifecycle, "\n// needlewhile-self-test-staged-runtime\n");

const fakeLauncher = `#!/bin/sh\nprintf '%s' launched > "${browserMarker}"\n`;
for (const name of ["open", "xdg-open"]) {
  const path = join(fakeBin, name);
  await writeFile(path, fakeLauncher, { mode: 0o755 });
  await chmod(path, 0o755);
}

const child = spawn(process.execPath, [join(stagedPluginRoot, "adapters", "openai-app", "server.mjs")], {
  cwd: stagedPluginRoot,
  env: {
    ...process.env,
    NEEDLEWHILE_MCP_SNAPSHOT_BASE: snapshotBase,
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

async function waitForMarker(timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await markerExists()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return markerExists();
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
    clientInfo: { name: "needlewhile-self-test", version: "0.2.3" },
  });
  assert.equal(initialized.result.protocolVersion, "2025-11-25");
  assert.equal(initialized.result.serverInfo.name, "needlewhile-openai-portal");
  assert.equal(initialized.result.serverInfo.version, "0.2.3");
  assert.match(initialized.result.instructions, /trusted Needlewhile UserPromptSubmit hook/);

  const snapshots = await readdir(snapshotBase);
  assert.equal(snapshots.length, 1, "adapter did not create one hermetic runtime snapshot");
  const snapshotLifecycle = await readFile(
    join(snapshotBase, snapshots[0], "skills", "needlewhile", "scripts", "lifecycle.mjs"),
    "utf8",
  );
  assert.match(snapshotLifecycle, /needlewhile-self-test-staged-runtime/);

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const ping = await request(2, "ping");
  assert.deepEqual(ping.result, {});

  const tools = await request(3, "tools/list");
  assert.equal(tools.result.tools.length, 2);
  const descriptor = tools.result.tools.find((item) => item.name === "show_needlewhile_portal");
  const openDescriptor = tools.result.tools.find((item) => item.name === "open_needlewhile_game");
  assert(descriptor, "Portal render tool is missing");
  assert(openDescriptor, "Portal click tool is missing");
  assert.equal(descriptor.name, "show_needlewhile_portal");
  assert.equal(descriptor.title, "Needlewhile");
  assert.match(descriptor.description, /trusted Needlewhile UserPromptSubmit hook/);
  assert.match(descriptor.description, /never opens a browser/);
  assert.equal(descriptor._meta.ui.resourceUri, RESOURCE_URI);
  assert.equal(descriptor._meta["openai/outputTemplate"], RESOURCE_URI);
  assert.equal(descriptor._meta["openai/widgetAccessible"], true);
  assert.deepEqual(descriptor.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(openDescriptor._meta.ui.visibility, ["app"]);
  assert.equal(openDescriptor._meta["openai/widgetAccessible"], true);
  assert.equal(openDescriptor._meta["openai/visibility"], "private");
  assert.equal(openDescriptor._meta.ui.resourceUri, undefined);
  assert.equal(openDescriptor._meta["openai/outputTemplate"], undefined);
  assert.deepEqual(openDescriptor.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });

  const listedResources = await request(4, "resources/list");
  assert.equal(listedResources.result.resources[0].uri, RESOURCE_URI);
  assert.equal(listedResources.result.resources[0].name, "needlewhile_portal_v0_2_3");
  assert.equal(listedResources.result.resources[0].title, "Needlewhile");
  assert.equal(listedResources.result.resources[0].mimeType, MIME_TYPE);

  const resource = await request(5, "resources/read", { uri: RESOURCE_URI });
  const content = resource.result.contents[0];
  assert.equal(content.mimeType, MIME_TYPE);
  assert.deepEqual(content._meta.ui.csp.connectDomains, []);
  assert.deepEqual(content._meta.ui.csp.resourceDomains, []);
  assert.equal(content._meta.ui.prefersBorder, false);
  assert.equal(content._meta["openai/widgetShowCodexWidgetInline"], true);
  assert.equal(content._meta["openai/widgetHeightHint"], 44);
  assert.equal(content._meta["openai/widgetMinFrameHeight"], 44);
  assert.equal(content._meta["openai/widgetPrefersBorder"], false);
  assert.deepEqual(content._meta["openai/widgetCSP"].redirect_domains, []);
  assert.match(content.text, /request\("tools\/call", \{/);
  assert.match(content.text, /name: "open_needlewhile_game"/);
  assert.match(content.text, /window\.openai\.callTool\("open_needlewhile_game", \{\}\)/);
  assert.doesNotMatch(content.text, /ui\/open-link/);
  assert.doesNotMatch(content.text, /openExternal/);
  assert.match(content.text, /ui\/notifications\/size-changed/);
  assert.match(content.text, /notifyIntrinsicHeight/);
  assert.match(content.text, /toolResponseMetadata\?\.call_tool_result\?\._meta\?\.portalHref/);
  assert.match(content.text, /toolResponseMetadata\?\.mcp_tool_result\?\._meta\?\.portalHref/);
  assert.match(content.text, /<button[\s\S]+id="portal"/);
  assert.match(content.text, /type="button"/);
  assert.match(content.text, /<img[\s\S]+class="portal-icon"/);
  assert.match(content.text, /alt=""/);
  assert.match(content.text, /width:\s*44px/);
  assert.match(content.text, /width:\s*auto/);
  assert.match(content.text, /height:\s*34px/);
  assert.match(content.text, /image-rendering:\s*pixelated/);
  assert.match(content.text, /data:image\/gif;base64,/);
  assert.match(content.text, /data:image\/png;base64,/);
  assert.match(content.text, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(content.text, /@keyframes\s+portal-/);
  assert.doesNotMatch(content.text, /grayscale\(/);
  assert.doesNotMatch(content.text, /__NEEDLEWHILE_PORTAL_ICON_DATA_URI__/);
  assert.doesNotMatch(content.text, /__NEEDLEWHILE_PORTAL_STATIC_ICON_DATA_URI__/);
  assert.doesNotMatch(content.text, /portal-card|<h1|class="copy"|enter-label|id="status"|class="ring|class="spark/);
  assert.doesNotMatch(content.text, /<iframe/i);

  for (const legacyUri of [
    "ui://needlewhile/portal-v0.2.1.html",
    "ui://needlewhile/portal-v0.2.2.html",
  ]) {
    const legacyResource = await request(
      legacyUri.endsWith("0.2.1.html") ? 51 : 52,
      "resources/read",
      { uri: legacyUri },
    );
    assert.equal(legacyResource.result.contents[0].uri, legacyUri);
    assert.match(legacyResource.result.contents[0].text, /open_needlewhile_game/);
  }

  // Codex moves old plugin caches aside during an upgrade. The already-running
  // MCP process must follow its live cwd after that rename instead of holding
  // the stale import URL that originally launched it.
  await rename(stagedPluginRoot, stagedBackupRoot);

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

  const opened = await request(8, "tools/call", {
    name: "open_needlewhile_game",
    arguments: {},
  });
  assert.equal(opened.result.isError, undefined, opened.result.content?.[0]?.text);
  assert.deepEqual(opened.result.content, []);
  assert.equal(opened.result._meta.launched, true);
  assert.equal(opened.result._meta.launchMode, "system-default-browser");
  assert.equal(await waitForMarker(), true, "the explicit Portal click tool did not launch the browser");

  process.stdout.write("syntax: ok\n");
  process.stdout.write("portal inline-script click bridge: ok\n");
  process.stdout.write("mcp jsonl initialize/ping/tools/resources: ok\n");
  process.stdout.write("cache relocation: ok\n");
  process.stdout.write(`portal: ${called.result._meta.portalHref.replace(/#.+$/, "#<redacted>")}\n`);
  process.stdout.write("browser launch: observed only after click tool\n");
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
