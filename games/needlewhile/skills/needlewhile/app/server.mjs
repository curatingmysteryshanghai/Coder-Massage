import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(APP_DIR, "public");
const stateArg = process.argv.indexOf("--state-dir");
const STATE_DIR = stateArg >= 0 ? process.argv[stateArg + 1] : null;

if (!STATE_DIR) {
  process.exitCode = 64;
  throw new Error("Needlewhile server requires --state-dir");
}

mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });

const STATE_FILE = join(STATE_DIR, "server.json");
const TOKEN = randomBytes(24).toString("hex");
const VERSION = "0.4.4";
const DISPLAY_VERSION = "Ver. 0.2";
const PROTOCOL_VERSION = 2;
const MAX_BODY_BYTES = 16 * 1024;
const ONE_HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

const staticFiles = new Map([
  ["/", [join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8"]],
  ["/index.html", [join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8"]],
  ["/styles.css", [join(PUBLIC_DIR, "styles.css"), "text/css; charset=utf-8"]],
  ["/app.js", [join(PUBLIC_DIR, "app.js"), "text/javascript; charset=utf-8"]],
  ["/needle-audio.js", [join(PUBLIC_DIR, "needle-audio.js"), "text/javascript; charset=utf-8"]],
  ["/assets/wool-ball-teal.png", [join(PUBLIC_DIR, "assets", "wool-ball-teal.png"), "image/png"]],
  ["/assets/pin-coral.png", [join(PUBLIC_DIR, "assets", "pin-coral.png"), "image/png"]],
  ["/assets/pin-cream.png", [join(PUBLIC_DIR, "assets", "pin-cream.png"), "image/png"]],
  ["/assets/pin-mustard.png", [join(PUBLIC_DIR, "assets", "pin-mustard.png"), "image/png"]],
]);

const activeRuns = new Map();
const clients = new Set();
let phase = "idle";
let lastError = null;
let lastActivityAt = Date.now();
let completedAt = null;
let shutdownRequested = false;
let lastSummary = null;
let nextRoundRevision = 0;
let currentRoundRevision = 0;

function normalizePart(value, fallback, limit = 180) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit) || fallback;
}

function runKey(control) {
  const clientKind = normalizePart(control.clientKind, "generic", 32);
  const sessionId = normalizePart(control.sessionId, "manual");
  const runId = normalizePart(control.runId, "current");
  return `${clientKind}:${sessionId}:${runId}`;
}

function newestRun(runs = [...activeRuns.values()]) {
  return runs.reduce((latest, run) => (
    !latest
    || run.heartbeatAt > latest.heartbeatAt
    || (run.heartbeatAt === latest.heartbeatAt && run.roundRevision > latest.roundRevision)
      ? run
      : latest
  ), null);
}

function summaryFromRun(run) {
  if (!run) return null;
  return {
    clientKind: run.clientKind,
    taskTitle: run.taskTitle,
    toolSteps: run.toolSteps,
    currentTool: run.currentTool,
    startedAt: run.startedAt,
    roundRevision: run.roundRevision,
  };
}

function stateForClient() {
  const runs = [...activeRuns.values()];
  const focus = newestRun(runs) ?? lastSummary;
  return {
    version: VERSION,
    displayVersion: DISPLAY_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    phase,
    activeRuns: activeRuns.size,
    taskTitle: focus?.taskTitle ?? null,
    clientKind: focus?.clientKind ?? null,
    toolSteps: focus?.toolSteps ?? 0,
    currentTool: focus?.currentTool ?? null,
    startedAt: focus?.startedAt ?? null,
    roundRevision: currentRoundRevision || focus?.roundRevision || null,
    completedAt,
    error: lastError,
  };
}

function sendSse(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast() {
  const snapshot = stateForClient();
  for (const client of clients) {
    sendSse(client, "state", snapshot);
  }
}

function removeRunsForSession(clientKind, sessionId) {
  const removed = [];
  for (const [key, run] of activeRuns) {
    if (run.clientKind === clientKind && run.sessionId === sessionId) {
      removed.push(run);
      activeRuns.delete(key);
    }
  }
  return removed;
}

function applyControl(control) {
  if (
    control.protocolVersion !== undefined
    && control.protocolVersion !== null
    && control.protocolVersion !== PROTOCOL_VERSION
  ) {
    throw new Error("protocol-version-mismatch");
  }

  const action = normalizePart(control.action, "status");
  const clientKind = normalizePart(control.clientKind, "generic", 32);
  const sessionId = normalizePart(control.sessionId, "manual");
  const key = runKey(control);
  const hasRunId = typeof control.hasRunId === "boolean"
    ? control.hasRunId
    : typeof control.runId === "string" && control.runId.length > 0;
  const now = Date.now();
  lastActivityAt = now;

  if (action === "start") {
    // A user interrupt may skip the ending hook. A new turn in the same session
    // supersedes that stale lease while other sessions keep running normally.
    const replaced = removeRunsForSession(clientKind, sessionId);
    const previous = newestRun(replaced);
    nextRoundRevision += 1;
    currentRoundRevision = nextRoundRevision;
    activeRuns.set(key, {
      clientKind,
      sessionId,
      runId: normalizePart(control.runId, "current"),
      hasRunId,
      taskTitle: normalizePart(control.taskTitle, previous?.taskTitle ?? `${clientKind} task`, 88),
      toolSteps: 0,
      currentTool: null,
      startedAt: now,
      heartbeatAt: now,
      roundRevision: nextRoundRevision,
    });
    phase = "active";
    lastError = null;
    completedAt = null;
  } else if (action === "heartbeat") {
    let run = activeRuns.get(key);
    if (!run && !hasRunId) {
      const candidates = [...activeRuns.values()].filter((candidate) => (
        candidate.clientKind === clientKind && candidate.sessionId === sessionId
      ));
      if (candidates.length === 1) [run] = candidates;
    }
    if (run) {
      run.heartbeatAt = now;
      run.toolSteps += 1;
      run.currentTool = normalizePart(control.toolName, run.currentTool, 48);
      run.taskTitle = normalizePart(control.taskTitle, run.taskTitle, 88);
    }
  } else if (action === "stop" || action === "error" || action === "cleanup") {
    let removed = [];
    if (action === "cleanup") {
      removed = removeRunsForSession(clientKind, sessionId);
    } else if (hasRunId) {
      const run = activeRuns.get(key);
      if (run) {
        activeRuns.delete(key);
        removed = [run];
      }
    } else {
      // Compatibility path for clients whose ending event has no run ID.
      // Claude Code does not emit Stop for a user-interrupted turn. Its next
      // anonymous Stop therefore belongs to the currently active replacement.
      removed = removeRunsForSession(clientKind, sessionId);
    }

    if (removed.length > 0) {
      lastSummary = summaryFromRun(newestRun(removed));
      if (activeRuns.size === 0) {
        phase = action === "error" ? "error" : "complete";
        lastError = action === "error" ? "agent-turn-failed" : null;
        completedAt = now;
      } else {
        phase = "active";
      }
    }
  } else if (action === "reset") {
    phase = activeRuns.size ? "active" : "idle";
    lastError = null;
    completedAt = null;
  } else if (action === "shutdown") {
    activeRuns.clear();
    phase = "complete";
    completedAt = now;
    shutdownRequested = true;
  }

  broadcast();
  return {
    ok: true,
    state: stateForClient(),
  };
}

function localRequest(request) {
  const address = request.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function authorized(url) {
  return url.searchParams.get("token") === TOKEN;
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request-too-large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (request, response) => {
  if (!localRequest(request)) {
    response.writeHead(403).end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health") {
    if (!authorized(url)) return json(response, 403, { ok: false });
    return json(response, 200, {
      ok: true,
      pid: process.pid,
      version: VERSION,
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    if (!authorized(url)) return json(response, 403, { ok: false });
    return json(response, 200, stateForClient());
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    if (!authorized(url)) return json(response, 403, { ok: false });
    response.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    clients.add(response);
    lastActivityAt = Date.now();
    sendSse(response, "state", stateForClient());
    request.on("close", () => {
      clients.delete(response);
      lastActivityAt = Date.now();
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/control") {
    if (!authorized(url)) return json(response, 403, { ok: false });
    try {
      const result = applyControl(await readJson(request));
      json(response, 200, result);
      if (shutdownRequested) setTimeout(closeServer, 80).unref();
    } catch (error) {
      json(response, 400, { ok: false, error: String(error.message ?? error) });
    }
    return;
  }

  const staticEntry = staticFiles.get(url.pathname);
  if (request.method === "GET" && staticEntry) {
    const [filePath, contentType] = staticEntry;
    if (!existsSync(filePath)) {
      response.writeHead(404).end();
      return;
    }
    const isAsset = url.pathname.startsWith("/assets/");
    response.writeHead(200, {
      "Cache-Control": isAsset ? "public, max-age=3600" : "no-cache",
      "Content-Security-Policy": "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": contentType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(readFileSync(filePath));
    return;
  }

  response.writeHead(404).end();
});

function removeStateFile() {
  try {
    const current = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (current.pid === process.pid) rmSync(STATE_FILE, { force: true });
  } catch {
    // A stale or already removed state file needs no further work.
  }
}

function closeServer() {
  for (const client of clients) client.end();
  clients.clear();
  server.close(() => {
    removeStateFile();
    process.exit(0);
  });
}

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      pid: process.pid,
      port,
      token: TOKEN,
      version: VERSION,
      protocolVersion: PROTOCOL_VERSION,
      startedAt: Date.now(),
    }),
    { mode: 0o600 },
  );
});

const heartbeat = setInterval(() => {
  for (const client of clients) client.write(": keepalive\n\n");

  const now = Date.now();
  const expired = [];
  for (const [key, run] of activeRuns) {
    if (now - run.heartbeatAt > ONE_HOUR) {
      expired.push(run);
      activeRuns.delete(key);
    }
  }
  if (phase === "active" && activeRuns.size === 0) {
    if (expired.length > 0) lastSummary = summaryFromRun(newestRun(expired));
    phase = "complete";
    completedAt = now;
    broadcast();
  }
  if (activeRuns.size === 0 && clients.size === 0 && now - lastActivityAt > FIVE_MINUTES) {
    closeServer();
  }
}, 20_000);
heartbeat.unref();

process.on("SIGTERM", closeServer);
process.on("SIGINT", closeServer);
process.on("exit", removeStateFile);
