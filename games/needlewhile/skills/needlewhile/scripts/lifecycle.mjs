import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(SCRIPT_DIR, "..", "app", "server.mjs");
const identity = typeof process.getuid === "function" ? process.getuid() : process.env.USERNAME ?? "user";
const defaultStateDir = join(tmpdir(), `needlewhile-${String(identity).replace(/[^a-zA-Z0-9_-]/g, "_")}`);
const STATE_DIR = process.env.NEEDLEWHILE_STATE_DIR || defaultStateDir;
const STATE_FILE = join(STATE_DIR, "server.json");
const verbose = process.argv.includes("--verbose");
const noWindow = process.argv.includes("--no-window") || process.env.NEEDLEWHILE_NO_WINDOW === "1";

function log(message) {
  if (verbose) process.stderr.write(`[needlewhile] ${message}\n`);
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
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  let state = readServerState();
  if (state && (await health(state))) return state;

  rmSync(STATE_FILE, { force: true });
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });

  const child = spawn(process.execPath, [SERVER_PATH, "--state-dir", STATE_DIR], {
    detached: true,
    env: process.env,
    stdio: "ignore",
  });
  child.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    state = readServerState();
    if (state && (await health(state))) return state;
  }
  return null;
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
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function launchWindow(state) {
  const url = `http://127.0.0.1:${state.port}/#${state.token}`;
  if (noWindow) return;

  if (process.platform === "darwin") {
    const chrome = "/Applications/Google Chrome.app";
    const edge = "/Applications/Microsoft Edge.app";
    const appName = existsSync(chrome) ? "Google Chrome" : existsSync(edge) ? "Microsoft Edge" : null;
    if (appName) {
      detach("open", [
        "-na",
        appName,
        "--args",
        `--app=${url}`,
        "--start-maximized",
        "--start-fullscreen",
        `--user-data-dir=${join(STATE_DIR, "browser-profile")}`,
        "--no-first-run",
        "--disable-default-apps",
      ]);
      return;
    }
    detach("open", [url]);
    return;
  }

  if (process.platform === "win32") {
    const edge = join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe");
    const chrome = join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
    const browser = existsSync(edge) ? edge : existsSync(chrome) ? chrome : "msedge";
    detach(browser, [`--app=${url}`, "--start-maximized", "--start-fullscreen"]);
    return;
  }

  for (const browser of ["google-chrome", "chromium", "microsoft-edge"]) {
    const found = spawnSync("which", [browser], { encoding: "utf8" });
    if (found.status === 0) {
      detach(browser, [`--app=${url}`, "--start-maximized", "--start-fullscreen"]);
      return;
    }
  }
  detach("xdg-open", [url]);
}

function hookOutput() {
  process.stdout.write("{}\n");
}

const input = await readHookInput();
const action = actionFromInput(input);

if (input.agent_id || input.agent_type || input.is_subagent) {
  log("ignored a subagent lifecycle event");
  hookOutput();
  process.exit(0);
}

if (process.env.CLAUDE_CODE_REMOTE === "true" && action === "start") {
  log("remote session detected; skipped GUI launch");
  hookOutput();
  process.exit(0);
}

let state = readServerState();
if (action === "status") {
  const running = Boolean(state && (await health(state)));
  const payload = running
    ? await fetch(`http://127.0.0.1:${state.port}/api/state?token=${state.token}`).then((response) => response.json())
    : { phase: "offline", activeRuns: 0 };
  process.stdout.write(`${JSON.stringify({ running, ...payload }, null, 2)}\n`);
  process.exit(0);
}

if (!state || !(await health(state))) {
  if (action !== "start") {
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

const backgroundWork = Array.isArray(input.background_tasks) && input.background_tasks.length > 0;
const scheduledWork = Array.isArray(input.session_crons) && input.session_crons.length > 0;
const effectiveAction = action === "stop" && (backgroundWork || scheduledWork) ? "heartbeat" : action;
const payload = {
  action: effectiveAction,
  sessionId: input.session_id ?? input.thread_id ?? input.conversation_id ?? "manual",
  runId: input.prompt_id ?? input.turn_id ?? "current",
};
const result = await sendControl(state, payload);

if (action === "start" && result?.needsWindow) launchWindow(state);
log(`${effectiveAction}: ${result?.ok ? "ok" : "no response"}`);
hookOutput();
