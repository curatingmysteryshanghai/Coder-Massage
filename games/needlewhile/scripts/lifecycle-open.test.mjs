#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIFECYCLE = join(ROOT, "skills", "needlewhile", "scripts", "lifecycle.mjs");
const TEST_ROOT = mkdtempSync(join(tmpdir(), "needlewhile-launch-test-"));
const STATE_DIR = join(TEST_ROOT, "state");
const LAUNCHER = join(TEST_ROOT, "launcher.mjs");

writeFileSync(LAUNCHER, [
  'import { writeFile } from "node:fs/promises";',
  'await writeFile(process.env.NEEDLEWHILE_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));',
  'await new Promise((resolve) => setTimeout(resolve, Number(process.env.NEEDLEWHILE_TEST_DELAY_MS ?? "0")));',
  'process.exit(Number(process.env.NEEDLEWHILE_TEST_EXIT_CODE ?? "0"));',
  "",
].join("\n"));

function runLifecycle(action, env = {}) {
  return spawnSync(process.execPath, [LIFECYCLE, action, "--verbose"], {
    encoding: "utf8",
    env: {
      ...process.env,
      NEEDLEWHILE_STATE_DIR: STATE_DIR,
      NEEDLEWHILE_NO_WINDOW: "0",
      NEEDLEWHILE_SELF_TEST: "1",
      NEEDLEWHILE_TEST_BROWSER_LAUNCHER: LAUNCHER,
      ...env,
    },
    input: "{}",
    timeout: 5_000,
  });
}

test.after(() => {
  runLifecycle("shutdown", { NEEDLEWHILE_NO_WINDOW: "1" });
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("macOS uses /usr/bin/open -n with the controller URL", () => {
  const capture = join(TEST_ROOT, "darwin.json");
  const result = runLifecycle("open", {
    NEEDLEWHILE_TEST_PLATFORM: "darwin",
    NEEDLEWHILE_TEST_CAPTURE: capture,
  });
  assert.equal(result.status, 0, result.stderr);

  const args = JSON.parse(readFileSync(capture, "utf8"));
  assert.equal(args[0], "/usr/bin/open");
  assert.equal(args[1], "-n");
  assert.match(args[2], /^http:\/\/127\.0\.0\.1:\d+\/#\w+$/);
});

test("launcher failure is reported from its non-zero exit code", () => {
  const capture = join(TEST_ROOT, "failure.json");
  const result = runLifecycle("open", {
    NEEDLEWHILE_TEST_PLATFORM: "darwin",
    NEEDLEWHILE_TEST_CAPTURE: capture,
    NEEDLEWHILE_TEST_EXIT_CODE: "23",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /open: failed/);
  assert.equal(JSON.parse(readFileSync(capture, "utf8"))[1], "-n");
});

test("a stuck launcher fails within the bounded wait", () => {
  const capture = join(TEST_ROOT, "timeout.json");
  const startedAt = Date.now();
  const result = runLifecycle("open", {
    NEEDLEWHILE_TEST_PLATFORM: "linux",
    NEEDLEWHILE_TEST_CAPTURE: capture,
    NEEDLEWHILE_TEST_DELAY_MS: "500",
    NEEDLEWHILE_TEST_LAUNCH_TIMEOUT_MS: "50",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /open: failed/);
  assert(Date.now() - startedAt < 1_000, "launcher timeout did not bound the wait");
});

test("Windows and Linux keep their existing launch commands", () => {
  const windowsCapture = join(TEST_ROOT, "win32.json");
  const windows = runLifecycle("open", {
    NEEDLEWHILE_TEST_PLATFORM: "win32",
    NEEDLEWHILE_TEST_CAPTURE: windowsCapture,
  });
  assert.equal(windows.status, 0, windows.stderr);
  assert.deepEqual(JSON.parse(readFileSync(windowsCapture, "utf8")).slice(0, 4), ["cmd", "/c", "start", ""]);

  const linuxCapture = join(TEST_ROOT, "linux.json");
  const linux = runLifecycle("open", {
    NEEDLEWHILE_TEST_PLATFORM: "linux",
    NEEDLEWHILE_TEST_CAPTURE: linuxCapture,
  });
  assert.equal(linux.status, 0, linux.stderr);
  assert.equal(JSON.parse(readFileSync(linuxCapture, "utf8"))[0], "xdg-open");
});
