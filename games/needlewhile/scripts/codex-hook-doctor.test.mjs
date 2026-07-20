import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CANONICAL_PLUGIN_ID,
  EXIT_CODES,
  EXPECTED_EVENTS,
  LEGACY_PLUGIN_ID,
  analyzeHooksResponse,
  codexAppServerInvocation,
  formatTextReport,
  isDirectExecution,
  parseArgs,
  windowsTaskkillInvocation,
} from "./codex-hook-doctor.mjs";

function hook(eventName, options = {}) {
  return {
    key: `fixture:${eventName}`,
    eventName,
    handlerType: "command",
    command: options.command ?? "node /secret/plugin/lifecycle.mjs",
    sourcePath: options.sourcePath ?? "/Users/secret/.codex/hooks.json",
    currentHash: options.currentHash ?? "super-secret-hook-hash",
    pluginId: options.pluginId ?? CANONICAL_PLUGIN_ID,
    enabled: options.enabled ?? true,
    isManaged: options.trustStatus === "managed",
    trustStatus: options.trustStatus ?? "trusted",
  };
}

function hooksList(hooks, options = {}) {
  return {
    data: [
      {
        cwd: "/Users/secret/project",
        hooks,
        warnings: options.warnings ?? [],
        errors: options.errors ?? [],
      },
    ],
  };
}

const fixtures = {
  trusted: hooksList([
    hook("userPromptSubmit", { trustStatus: "trusted" }),
    hook("postToolUse", { trustStatus: "managed" }),
    hook("stop", { trustStatus: "trusted" }),
  ]),
  pending: hooksList([
    hook("userPromptSubmit", { trustStatus: "modified" }),
    hook("postToolUse", { trustStatus: "untrusted" }),
    hook("stop", { trustStatus: "trusted" }),
  ]),
  disabled: hooksList([
    hook("userPromptSubmit"),
    hook("postToolUse", { enabled: false }),
    hook("stop"),
  ]),
  missing: hooksList([]),
  duplicateAndLegacy: hooksList([
    ...EXPECTED_EVENTS.map((eventName) => hook(eventName)),
    hook("stop"),
    hook("userPromptSubmit", { pluginId: LEGACY_PLUGIN_ID }),
  ]),
};

test("trusted and managed Hooks are ready", () => {
  const report = analyzeHooksResponse(fixtures.trusted, { cwd: "/tmp/project" });

  assert.equal(report.status, "ready");
  assert.equal(report.exitCode, EXIT_CODES.ready);
  assert.equal(report.ok, true);
  assert.deepEqual(
    report.events.map(({ eventName, trustStatus }) => ({ eventName, trustStatus })),
    [
      { eventName: "userPromptSubmit", trustStatus: "trusted" },
      { eventName: "postToolUse", trustStatus: "managed" },
      { eventName: "stop", trustStatus: "trusted" },
    ],
  );
});

test("untrusted and modified Hooks require authorization", () => {
  const report = analyzeHooksResponse(fixtures.pending);

  assert.equal(report.status, "authorization_required");
  assert.equal(report.exitCode, EXIT_CODES.authorizationRequired);
  assert.deepEqual(report.pendingEvents, ["userPromptSubmit", "postToolUse"]);
  assert.deepEqual(report.issues, []);
});

test("a disabled Hook is an invalid installation", () => {
  const report = analyzeHooksResponse(fixtures.disabled);

  assert.equal(report.status, "invalid");
  assert.equal(report.exitCode, EXIT_CODES.invalidInstallation);
  assert(report.issues.some((item) => item.code === "hook_disabled"));
});

test("a missing canonical plugin is an invalid installation", () => {
  const report = analyzeHooksResponse(fixtures.missing);

  assert.equal(report.status, "invalid");
  assert.equal(report.exitCode, EXIT_CODES.invalidInstallation);
  assert(report.issues.some((item) => item.code === "canonical_plugin_missing"));
});

test("duplicates and the legacy plugin identity are rejected", () => {
  const report = analyzeHooksResponse(fixtures.duplicateAndLegacy);
  const text = formatTextReport(report);

  assert.equal(report.status, "invalid");
  assert.equal(report.exitCode, EXIT_CODES.invalidInstallation);
  assert(
    report.issues.some((item) => item.code === "legacy_plugin_identity_detected"),
  );
  assert(report.issues.some((item) => item.code === "duplicate_event"));
  assert.equal(report.counts.legacyHooks, 1);
  assert(text.includes("codex plugin remove needlewhile@needlewhile-local"));
});

test("source errors are fatal while their sensitive details stay private", () => {
  const fixture = hooksList(EXPECTED_EVENTS.map((eventName) => hook(eventName)), {
    errors: [
      {
        path: "/Users/secret/private/hooks.json",
        message: "secret parse details and token=abc123",
      },
    ],
  });
  const report = analyzeHooksResponse(fixture, { cwd: "/Users/secret/project" });
  const serialized = JSON.stringify(report);
  const text = formatTextReport(report);

  assert.equal(report.exitCode, EXIT_CODES.invalidInstallation);
  assert(report.issues.some((item) => item.code === "source_errors"));
  for (const secret of [
    "/Users/secret",
    '"cwdName"',
    "token=abc123",
    "super-secret-hook-hash",
    "lifecycle.mjs",
  ]) {
    assert.equal(serialized.includes(secret), false);
    assert.equal(text.includes(secret), false);
  }
});

test("CLI arguments support --json and both --cwd forms", () => {
  const separate = parseArgs(["--json", "--cwd", "fixtures"]);
  const joined = parseArgs(["--cwd=fixtures"]);

  assert.equal(separate.json, true);
  assert.equal(separate.cwd.endsWith("/fixtures"), true);
  assert.equal(joined.cwd, separate.cwd);
  assert.throws(() => parseArgs(["--cwd"]));
  assert.throws(() => parseArgs(["--unexpected"]));
});

test("direct execution recognizes equivalent symlinked paths", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "needlewhile-doctor-path-"));
  const realFile = realpathSync(new URL("./codex-hook-doctor.mjs", import.meta.url));
  const linkedFile = join(directory, "doctor.mjs");

  try {
    try {
      symlinkSync(realFile, linkedFile);
    } catch (error) {
      context.skip(`symlink unavailable: ${error.code ?? "unknown"}`);
      return;
    }

    assert.equal(isDirectExecution(linkedFile, realFile), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Windows starts the Codex shim through a constant cmd command", () => {
  assert.deepEqual(codexAppServerInvocation("win32", "C:\\Windows\\System32\\cmd.exe"), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "codex app-server --stdio"],
  });
  assert.deepEqual(codexAppServerInvocation("darwin"), {
    command: "codex",
    args: ["app-server", "--stdio"],
  });
  assert.deepEqual(windowsTaskkillInvocation(321), {
    command: "taskkill.exe",
    args: ["/PID", "321", "/T", "/F"],
  });
  assert.throws(() => windowsTaskkillInvocation(0));
  assert.throws(() => windowsTaskkillInvocation("321"));
});
