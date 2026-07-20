import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(SCRIPT_DIR, "..", "app", "server.mjs");
const identity = typeof process.getuid === "function" ? process.getuid() : process.env.USERNAME ?? "user";
const defaultStateDir = join(tmpdir(), `needlewhile-${String(identity).replace(/[^a-zA-Z0-9_-]/g, "_")}`);
const STATE_DIR = process.env.NEEDLEWHILE_STATE_DIR || defaultStateDir;
const STATE_FILE = join(STATE_DIR, "server.json");
const START_LOCK = join(STATE_DIR, "starting.lock");
const VERSION = "0.4.4";
const PROTOCOL_VERSION = 2;
const verbose = process.argv.includes("--verbose");
const noWindow = process.argv.includes("--no-window") || process.env.NEEDLEWHILE_NO_WINDOW === "1";
const inlinePortal = process.argv.includes("--inline-portal");
const INLINE_PORTAL_CONTEXT = [
  "Needlewhile's trusted top-level task-start hook is active.",
  "Before substantive work, call `mcp__needlewhile_portal__show_needlewhile_portal` exactly once with `{}` so Codex renders the small inline time Portal.",
  "The tool prepares localhost state but does not open a browser; the full game opens only if the user clicks the Portal.",
  "Do not call it for a subagent, repeat it during this turn, or narrate the Portal in the assistant response. If the tool is unavailable, continue silently.",
].join(" ");
const INLINE_PORTAL_TOOL_NAMES = new Set([
  "show_needlewhile_portal",
  "mcp__needlewhile_portal__show_needlewhile_portal",
]);

function log(message) {
  if (verbose) process.stderr.write(`[needlewhile] ${message}\n`);
}

function cliValue(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

async function readHookInput() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 64 * 1024) return {};
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function actionFromInput(input) {
  const explicit = process.argv[2];
  if (explicit && !explicit.startsWith("--")) return explicit;
  const event = input.hook_event_name;
  return {
    UserPromptSubmit: "start",
    PostToolUse: "heartbeat",
    Stop: "stop",
    StopFailure: "error",
    SessionEnd: "cleanup",
  }[event] ?? "status";
}

function cleanLabel(value, limit = 96) {
  if (typeof value !== "string") return null;
  const firstLine = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!firstLine) return null;
  return firstLine.slice(0, limit);
}

function taskTitleFromInput(input) {
  return cleanLabel(
    input.task_title
    ?? input.thread_title
    ?? input.conversation_title
    ?? input.prompt
    ?? input.user_prompt,
    88,
  );
}

function clientKindFromInput(input) {
  return cleanLabel(
    cliValue("--client")
    ?? input.client_kind
    ?? input.client_name
    ?? input.client
    ?? "generic",
    32,
  )?.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "generic";
}

function readServerState() {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (!Number.isInteger(state.port) || typeof state.token !== "string") return null;
    return state;
  } catch {
    return null;
  }
}

async function health(state) {
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health?token=${state.token}`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload.version === VERSION && payload.protocolVersion === PROTOCOL_VERSION;
  } catch {
    return false;
  }
}

async function retireStaleServer(state) {
  if (!state) return;
  try {
    await fetch(`http://127.0.0.1:${state.port}/api/control?token=${state.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "shutdown", clientKind: "bridge-upgrade" }),
      signal: AbortSignal.timeout(500),
    });
  } catch {
    // A stale state file or dead controller is safe to replace.
  }
}

function lockIsStale() {
  try {
    return Date.now() - statSync(START_LOCK).mtimeMs > 5_000;
  } catch {
    return false;
  }
}

async function waitForServer(attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const state = readServerState();
    if (state && (await health(state))) return state;
  }
  return null;
}

async function ensureServer() {
  let state = readServerState();
  if (state && (await health(state))) return state;

  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  if (lockIsStale()) rmSync(START_LOCK, { recursive: true, force: true });

  let ownsLock = false;
  try {
    mkdirSync(START_LOCK, { mode: 0o700 });
    ownsLock = true;
  } catch {
    const shared = await waitForServer();
    if (shared) return shared;
    if (lockIsStale()) {
      rmSync(START_LOCK, { recursive: true, force: true });
      return ensureServer();
    }
    return null;
  }

  try {
    state = readServerState();
    if (state && (await health(state))) return state;
    await retireStaleServer(state);
    rmSync(STATE_FILE, { force: true });

    const child = spawn(process.execPath, [SERVER_PATH, "--state-dir", STATE_DIR], {
      detached: true,
      env: process.env,
      stdio: "ignore",
    });
    child.unref();
    return await waitForServer();
  } finally {
    if (ownsLock) rmSync(START_LOCK, { recursive: true, force: true });
  }
}

async function sendControl(state, payload) {
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/api/control?token=${state.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(800),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function detach(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function openPortal(state) {
  const url = `http://127.0.0.1:${state.port}/#${state.token}`;
  if (noWindow) return true;
  if (process.platform === "darwin") return detach("open", [url]);
  if (process.platform === "win32") return detach("cmd", ["/c", "start", "", url]);
  return detach("xdg-open", [url]);
}

function hookOutput(additionalContext = null) {
  const output = additionalContext
    ? {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext,
        },
      }
    : {};
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

const input = await readHookInput();
const action = actionFromInput(input);
const clientKind = clientKindFromInput(input);
const toolName = cleanLabel(input.tool_name ?? input.tool?.name, 96);

if (input.agent_id || input.agent_type || input.is_subagent) {
  log("ignored a subagent lifecycle event");
  hookOutput();
  process.exit(0);
}

if (process.env.CLAUDE_CODE_REMOTE === "true" && action === "start") {
  log("remote session detected; local Portal is unavailable");
  hookOutput();
  process.exit(0);
}

if (action === "heartbeat" && INLINE_PORTAL_TOOL_NAMES.has(toolName)) {
  log("ignored the inline Portal render as a task tool step");
  hookOutput();
  process.exit(0);
}

let state = readServerState();
if (action === "status") {
  const running = Boolean(state && (await health(state)));
  const payload = running
    ? await fetch(`http://127.0.0.1:${state.port}/api/state?token=${state.token}`).then((response) => response.json())
    : { version: VERSION, protocolVersion: PROTOCOL_VERSION, phase: "offline", activeRuns: 0 };
  process.stdout.write(`${JSON.stringify({ running, ...payload }, null, 2)}\n`);
  process.exit(0);
}

if (!state || !(await health(state))) {
  if (action !== "start" && action !== "open") {
    log(`${action}: controller already offline`);
    hookOutput();
    process.exit(0);
  }
  state = await ensureServer();
}

if (!state) {
  log("controller could not start; allowing the agent turn to continue");
  hookOutput();
  process.exit(0);
}

if (action === "open") {
  const opened = openPortal(state);
  log(`open: ${opened ? "sent to the system default browser" : "failed"}`);
  hookOutput();
  process.exit(0);
}

const backgroundWork = Array.isArray(input.background_tasks) && input.background_tasks.length > 0;
const scheduledWork = Array.isArray(input.session_crons) && input.session_crons.length > 0;
const effectiveAction = action === "stop" && (backgroundWork || scheduledWork) ? "heartbeat" : action;
const rawRunId = input.prompt_id ?? input.turn_id ?? input.run_id ?? null;
const payload = {
  action: effectiveAction,
  protocolVersion: PROTOCOL_VERSION,
  clientKind,
  sessionId: input.session_id ?? input.thread_id ?? input.conversation_id ?? "manual",
  runId: rawRunId ?? "current",
  hasRunId: rawRunId !== null && rawRunId !== undefined && rawRunId !== "",
  taskTitle: taskTitleFromInput(input),
  toolName: cleanLabel(toolName, 48),
};
const result = await sendControl(state, payload);

log(`${effectiveAction}: ${result?.ok ? "ok" : "no response"}`);
const shouldRequestInlinePortal = result?.ok
  && inlinePortal
  && action === "start"
  && input.hook_event_name === "UserPromptSubmit"
  && clientKind === "codex";
hookOutput(shouldRequestInlinePortal ? INLINE_PORTAL_CONTEXT : null);
