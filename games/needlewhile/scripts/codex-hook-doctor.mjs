#!/usr/bin/env node

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_PLUGIN_ID = "needlewhile@jieya";
export const LEGACY_PLUGIN_ID = "needlewhile@needlewhile-local";
export const EXPECTED_EVENTS = Object.freeze([
  "userPromptSubmit",
  "postToolUse",
  "stop",
]);

export const EXIT_CODES = Object.freeze({
  ready: 0,
  runtimeError: 1,
  authorizationRequired: 2,
  invalidInstallation: 3,
  usageError: 64,
});

const READY_TRUST_STATUSES = new Set(["trusted", "managed"]);
const PENDING_TRUST_STATUSES = new Set(["untrusted", "modified"]);
const APP_SERVER_TIMEOUT_MS = 12_000;
const MAX_STDOUT_BYTES = 5 * 1024 * 1024;

function canonicalPath(value) {
  const absolute = resolve(value);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function isDirectExecution(
  entryPath = process.argv[1],
  modulePath = fileURLToPath(import.meta.url),
) {
  return (
    typeof entryPath === "string" &&
    canonicalPath(entryPath) === canonicalPath(modulePath)
  );
}

export function codexAppServerInvocation(
  platform = process.platform,
  comspec = process.env.ComSpec,
) {
  if (platform === "win32") {
    return {
      command: comspec || "cmd.exe",
      args: ["/d", "/s", "/c", "codex app-server --stdio"],
    };
  }
  return {
    command: "codex",
    args: ["app-server", "--stdio"],
  };
}

export function windowsTaskkillInvocation(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new TypeError("invalid child pid");
  }
  return {
    command: "taskkill.exe",
    args: ["/PID", String(pid), "/T", "/F"],
  };
}

class DoctorRuntimeError extends Error {
  constructor(code) {
    super(code);
    this.name = "DoctorRuntimeError";
    this.doctorCode = code;
  }
}

function issue(code, details = {}) {
  return { code, ...details };
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function publicTrustStatus(value) {
  return typeof value === "string" ? value : "unknown";
}

/**
 * Analyze a HooksListResponse without retaining commands, source paths, hashes,
 * or server error text. The returned object is safe to print to a terminal or
 * serialize with --json.
 */
export function analyzeHooksResponse(response, { cwd = process.cwd() } = {}) {
  if (!response || !Array.isArray(response.data)) {
    throw new DoctorRuntimeError("invalid_hooks_list_response");
  }

  const hooks = response.data.flatMap((entry) =>
    Array.isArray(entry?.hooks) ? entry.hooks : [],
  );
  const canonicalHooks = hooks.filter(
    (hook) => hook?.pluginId === CANONICAL_PLUGIN_ID,
  );
  const legacyHooks = hooks.filter((hook) => hook?.pluginId === LEGACY_PLUGIN_ID);
  const sourceErrors = response.data.reduce(
    (total, entry) => total + countItems(entry?.errors),
    0,
  );
  const sourceWarnings = response.data.reduce(
    (total, entry) => total + countItems(entry?.warnings),
    0,
  );
  const fatalIssues = [];

  if (sourceErrors > 0) {
    fatalIssues.push(issue("source_errors", { count: sourceErrors }));
  }
  if (legacyHooks.length > 0) {
    fatalIssues.push(
      issue("legacy_plugin_identity_detected", { count: legacyHooks.length }),
    );
  }

  if (canonicalHooks.length === 0) {
    fatalIssues.push(issue("canonical_plugin_missing"));
  } else if (canonicalHooks.length !== EXPECTED_EVENTS.length) {
    fatalIssues.push(
      issue("canonical_hook_count_mismatch", {
        expected: EXPECTED_EVENTS.length,
        actual: canonicalHooks.length,
      }),
    );
  }

  const expectedEventSet = new Set(EXPECTED_EVENTS);
  const unexpectedEvents = [
    ...new Set(
      canonicalHooks
        .map((hook) => hook?.eventName)
        .filter(
          (eventName) =>
            typeof eventName === "string" && !expectedEventSet.has(eventName),
        ),
    ),
  ].sort();
  for (const eventName of unexpectedEvents) {
    fatalIssues.push(issue("unexpected_event", { eventName }));
  }

  const pendingEvents = [];
  const events = EXPECTED_EVENTS.map((eventName) => {
    const matches = canonicalHooks.filter(
      (hook) => hook?.eventName === eventName,
    );

    if (canonicalHooks.length > 0 && matches.length === 0) {
      fatalIssues.push(issue("expected_event_missing", { eventName }));
    }
    if (matches.length > 1) {
      fatalIssues.push(
        issue("duplicate_event", { eventName, count: matches.length }),
      );
    }

    if (matches.length !== 1) {
      return {
        eventName,
        count: matches.length,
        enabled: null,
        trustStatus: null,
      };
    }

    const hook = matches[0];
    const trustStatus = publicTrustStatus(hook.trustStatus);
    if (hook.enabled !== true) {
      fatalIssues.push(issue("hook_disabled", { eventName }));
    }
    if (PENDING_TRUST_STATUSES.has(trustStatus)) {
      pendingEvents.push(eventName);
    } else if (!READY_TRUST_STATUSES.has(trustStatus)) {
      fatalIssues.push(
        issue("unknown_trust_status", { eventName, trustStatus }),
      );
    }

    return {
      eventName,
      count: 1,
      enabled: hook.enabled === true,
      trustStatus,
    };
  });

  let status = "ready";
  let exitCode = EXIT_CODES.ready;
  if (fatalIssues.length > 0) {
    status = "invalid";
    exitCode = EXIT_CODES.invalidInstallation;
  } else if (pendingEvents.length > 0) {
    status = "authorization_required";
    exitCode = EXIT_CODES.authorizationRequired;
  }

  return {
    schemaVersion: 1,
    tool: "needlewhile-codex-hook-doctor",
    pluginId: CANONICAL_PLUGIN_ID,
    status,
    ok: status === "ready",
    exitCode,
    counts: {
      canonicalHooks: canonicalHooks.length,
      legacyHooks: legacyHooks.length,
      sourceErrors,
      sourceWarnings,
    },
    events,
    pendingEvents,
    issues: fatalIssues,
  };
}

function sendRequest(child, payload, fail) {
  child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
    if (error) fail(new DoctorRuntimeError("app_server_write_failed"));
  });
}

/**
 * Read HooksListResponse from the local Codex app-server. This is deliberately
 * read-only: it sends only initialize and hooks/list requests.
 */
export function requestHooksList(
  { cwd = process.cwd(), timeoutMs = APP_SERVER_TIMEOUT_MS } = {},
) {
  return new Promise((resolveRequest, rejectRequest) => {
    let child;
    let settled = false;
    let initialized = false;
    let buffer = "";
    let stdoutBytes = 0;

    const timer = setTimeout(() => {
      fail(new DoctorRuntimeError("app_server_timeout"));
    }, timeoutMs);

    function forceStopWindowsTree() {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      let invocation;
      try {
        invocation = windowsTaskkillInvocation(child.pid);
      } catch {
        return;
      }
      const terminator = spawn(invocation.command, invocation.args, {
        stdio: "ignore",
        windowsHide: true,
      });
      terminator.on("error", () => {});
      terminator.unref();
    }

    function cleanup(graceful = false) {
      clearTimeout(timer);
      if (child && child.exitCode === null && child.signalCode === null) {
        if (!child.stdin.destroyed) child.stdin.end();
        if (process.platform === "win32") {
          if (graceful) {
            const fallback = setTimeout(forceStopWindowsTree, 250);
            fallback.unref();
          } else {
            forceStopWindowsTree();
          }
        } else {
          child.kill();
        }
      }
    }

    function succeed(value) {
      if (settled) return;
      settled = true;
      cleanup(true);
      resolveRequest(value);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      rejectRequest(error);
    }

    function handleMessage(message) {
      if (message?.id === 1) {
        if (message.error || !message.result) {
          fail(new DoctorRuntimeError("app_server_initialize_failed"));
          return;
        }
        if (initialized) return;
        initialized = true;
        sendRequest(
          child,
          {
            id: 2,
            method: "hooks/list",
            params: { cwds: [cwd] },
          },
          fail,
        );
        return;
      }

      if (message?.id === 2) {
        if (message.error || !message.result) {
          fail(new DoctorRuntimeError("hooks_list_failed"));
          return;
        }
        succeed(message.result);
      }
    }

    function consumeBuffer() {
      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          fail(new DoctorRuntimeError("invalid_app_server_output"));
          return;
        }
        handleMessage(message);
        if (settled) return;
      }
    }

    try {
      const invocation = codexAppServerInvocation();
      child = spawn(invocation.command, invocation.args, {
        cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      fail(new DoctorRuntimeError("app_server_spawn_failed"));
      return;
    }

      child.stdout.setEncoding("utf8");
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        fail(new DoctorRuntimeError("app_server_output_too_large"));
        return;
      }
      buffer += chunk;
      consumeBuffer();
    });
    child.stderr.resume();
    child.on("error", (error) => {
      const code =
        error?.code === "ENOENT" ? "codex_not_found" : "app_server_spawn_failed";
      fail(new DoctorRuntimeError(code));
    });
    child.on("exit", () => {
      if (!settled) fail(new DoctorRuntimeError("app_server_exited_early"));
    });

    sendRequest(
      child,
      {
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "needlewhile-codex-hook-doctor",
            version: "1.0.0",
          },
          capabilities: {},
        },
      },
      fail,
    );
  });
}

export function parseArgs(argv) {
  const options = { cwd: process.cwd(), json: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--cwd") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new DoctorRuntimeError("missing_cwd_value");
      }
      options.cwd = resolve(value);
      index += 1;
    } else if (argument.startsWith("--cwd=")) {
      const value = argument.slice("--cwd=".length);
      if (!value) throw new DoctorRuntimeError("missing_cwd_value");
      options.cwd = resolve(value);
    } else {
      throw new DoctorRuntimeError("unknown_argument");
    }
  }

  return options;
}

function eventLabel(eventName) {
  return {
    userPromptSubmit: "UserPromptSubmit",
    postToolUse: "PostToolUse",
    stop: "Stop",
  }[eventName] ?? eventName;
}

export function formatTextReport(report) {
  const heading = {
    ready: "READY",
    authorization_required: "AUTHORIZATION REQUIRED",
    invalid: "INVALID INSTALLATION",
  }[report.status];
  const lines = [
    `Needlewhile Codex Hook Doctor: ${heading}`,
    `Plugin: ${report.pluginId}`,
  ];

  for (const event of report.events) {
    if (event.count === 0) {
      lines.push(`- ${eventLabel(event.eventName)}: missing`);
    } else if (event.count > 1) {
      lines.push(`- ${eventLabel(event.eventName)}: duplicate (${event.count})`);
    } else {
      lines.push(
        `- ${eventLabel(event.eventName)}: ${event.enabled ? "enabled" : "disabled"}, ${event.trustStatus}`,
      );
    }
  }

  if (report.counts.legacyHooks > 0) {
    lines.push(`Legacy plugin identity detected: ${report.counts.legacyHooks}`);
    lines.push(
      "Action: run `codex plugin remove needlewhile@needlewhile-local`, then rerun the installer.",
    );
  }
  if (report.counts.sourceErrors > 0) {
    lines.push(`Hook source errors detected: ${report.counts.sourceErrors}`);
  }
  if (report.status === "authorization_required") {
    lines.push("Action: review and allow all three Needlewhile Hooks in Codex.");
  }
  if (report.status === "invalid" && report.counts.legacyHooks === 0) {
    lines.push("Action: repair or reinstall Needlewhile, then run this check again.");
  }

  return `${lines.join("\n")}\n`;
}

function runtimeErrorReport(error) {
  return {
    schemaVersion: 1,
    tool: "needlewhile-codex-hook-doctor",
    status: "runtime_error",
    ok: false,
    exitCode: EXIT_CODES.runtimeError,
    error: {
      code:
        error instanceof DoctorRuntimeError
          ? error.doctorCode
          : "unexpected_runtime_error",
    },
  };
}

function printUsage(stream = process.stdout) {
  stream.write(
    "Usage: node scripts/codex-hook-doctor.mjs [--json] [--cwd <directory>]\n",
  );
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    const report = runtimeErrorReport(error);
    process.stderr.write(`Needlewhile Hook Doctor: ${report.error.code}\n`);
    printUsage(process.stderr);
    return EXIT_CODES.usageError;
  }

  if (options.help) {
    printUsage();
    return EXIT_CODES.ready;
  }

  try {
    const response = await requestHooksList({ cwd: options.cwd });
    const report = analyzeHooksResponse(response, { cwd: options.cwd });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatTextReport(report));
    }
    return report.exitCode;
  } catch (error) {
    const report = runtimeErrorReport(error);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stderr.write(
        `Needlewhile Codex Hook Doctor: RUNTIME ERROR (${report.error.code})\n`,
      );
    }
    return report.exitCode;
  }
}

const isMain = isDirectExecution();

if (isMain) {
  process.exitCode = await main();
}
