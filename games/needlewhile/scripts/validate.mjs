import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LIFECYCLE = join(ROOT, "skills", "needlewhile", "scripts", "lifecycle.mjs");
const SERVER = join(ROOT, "skills", "needlewhile", "app", "server.mjs");
const CLIENT = join(ROOT, "skills", "needlewhile", "app", "public", "app.js");
const AUDIO = join(ROOT, "skills", "needlewhile", "app", "public", "needle-audio.js");
const STATE_DIR = mkdtempSync(join(tmpdir(), "needlewhile-validate-"));
const fixtureEnv = {
  ...process.env,
  NEEDLEWHILE_NO_WINDOW: "1",
  NEEDLEWHILE_STATE_DIR: STATE_DIR,
};
let checks = 0;

function pass(message) {
  checks += 1;
  process.stdout.write(`✓ ${message}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath));
}

function json(relativePath) {
  return JSON.parse(read(relativePath).toString("utf8"));
}

function runLifecycle(action, payload = {}) {
  return spawnSync(process.execPath, [LIFECYCLE, action, "--no-window"], {
    encoding: "utf8",
    env: fixtureEnv,
    input: JSON.stringify(payload),
    timeout: 5_000,
  });
}

function readStatus() {
  const result = runLifecycle("status");
  assert(result.status === 0, `status command failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function assertHookResult(result, label) {
  assert(result.status === 0, `${label} hook exited ${result.status}: ${result.stderr}`);
  assert(result.stdout.trim() === "{}", `${label} hook stdout must be exactly {}`);
}

function assertPng(relativePath) {
  const signature = read(relativePath).subarray(0, 8).toString("hex");
  assert(signature === "89504e470d0a1a0a", `${relativePath} is not a PNG`);
}

try {
  const codexManifest = json(".codex-plugin/plugin.json");
  const claudeManifest = json(".claude-plugin/plugin.json");
  const codexHooks = json("hooks.json");
  const claudeHooks = json("hooks/claude-hooks.json");
  json(".agents/plugins/marketplace.json");
  json(".claude-plugin/marketplace.json");
  json("package.json");
  json("release-manifest.json");
  pass("all manifests and hook files are valid JSON");

  assert(codexManifest.name === "needlewhile", "Codex manifest name mismatch");
  assert(claudeManifest.name === "needlewhile", "Claude manifest name mismatch");
  assert(codexManifest.version === claudeManifest.version, "plugin versions differ");
  assert(codexManifest.hooks === "./hooks.json", "Codex hook path mismatch");
  assert(claudeManifest.hooks === "./hooks/claude-hooks.json", "Claude hook path mismatch");
  pass("dual plugin manifests share one version and route platform-specific hooks");

  const codexEvents = Object.keys(codexHooks.hooks);
  const supportedCodexEvents = new Set([
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PreCompact",
    "PostCompact",
    "SessionStart",
    "UserPromptSubmit",
    "SubagentStart",
    "SubagentStop",
    "Stop",
  ]);
  assert(codexEvents.every((event) => supportedCodexEvents.has(event)), "Codex hooks contain an unsupported event");
  assert(codexEvents.includes("UserPromptSubmit") && codexEvents.includes("Stop"), "Codex lifecycle pair is incomplete");
  assert(Object.hasOwn(claudeHooks.hooks, "StopFailure"), "Claude error cleanup hook is missing");
  assert(Object.hasOwn(claudeHooks.hooks, "SessionEnd"), "Claude session cleanup hook is missing");
  pass("hook event sets match the current Codex and Claude Code schemas");

  const skill = read("skills/needlewhile/SKILL.md").toString("utf8");
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert(frontmatter, "SKILL.md frontmatter is missing");
  const keys = frontmatter[1]
    .split("\n")
    .map((line) => line.split(":", 1)[0].trim())
    .filter(Boolean);
  assert(keys.length === 2 && keys.includes("name") && keys.includes("description"), "SKILL.md frontmatter must contain only name and description");
  assert(/^name: needlewhile$/m.test(frontmatter[1]), "SKILL.md name must be lowercase hyphen-case");
  pass("SKILL.md uses minimal, validator-safe frontmatter");

  for (const file of [SERVER, LIFECYCLE, CLIENT, AUDIO]) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert(result.status === 0, `${file} failed syntax check: ${result.stderr}`);
  }
  pass("server, lifecycle bridge, browser client, and audio engine pass Node syntax checks");

  for (const asset of [
    "skills/needlewhile/app/public/assets/wool-ball-teal.png",
    "skills/needlewhile/app/public/assets/pin-coral.png",
    "skills/needlewhile/app/public/assets/pin-cream.png",
    "skills/needlewhile/app/public/assets/pin-mustard.png",
  ]) {
    assertPng(asset);
  }
  pass("teal yarn ball and long transparent needle sprites are present");

  const audioModule = await import(`${pathToFileURL(AUDIO).href}?validate=${Date.now()}`);
  let seed = 0x12345678;
  const seededRandom = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const texture = audioModule.buildFiberTexture(8_192, seededRandom);
  const peak = texture.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
  const rms = (from, to) => Math.sqrt(
    texture.slice(from, to).reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, to - from),
  );
  assert(texture.every(Number.isFinite), "audio texture contains a non-finite sample");
  assert(peak > 0.02 && peak <= 0.87, `audio texture peak is out of bounds: ${peak}`);
  assert(rms(6_000, 8_192) < rms(1_000, 3_000), "audio rustle tail does not decay");
  assert(audioModule.cadenceGain(35) < 1 && audioModule.cadenceGain(120) === 1, "cadence gain is not bounded");
  pass("offline fiber-noise texture is finite, bounded, decaying, and cadence-aware");

  const lifecycleSource = read("skills/needlewhile/scripts/lifecycle.mjs").toString("utf8");
  assert(lifecycleSource.includes('"--start-fullscreen"'), "desktop launcher is not configured for full screen");
  assert(!lifecycleSource.includes("--window-size=420,630"), "legacy compact window size is still active");
  pass("desktop browser-app launch uses the full-screen mode");

  const startA = runLifecycle("start", { session_id: "session-a", turn_id: "turn-a" });
  assertHookResult(startA, "start A");
  let status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "start did not create one active run");

  const restartA = runLifecycle("start", { session_id: "session-a", turn_id: "turn-a-replacement" });
  assertHookResult(restartA, "replacement start A");
  status = readStatus();
  assert(status.activeRuns === 1, "a replacement turn retained an interrupted stale lease");

  const startB = runLifecycle("start", { session_id: "session-b", prompt_id: "prompt-b" });
  assertHookResult(startB, "start B");
  status = readStatus();
  assert(status.activeRuns === 2, "concurrent session lease was not retained");

  const stopA = runLifecycle("stop", { session_id: "session-a", turn_id: "turn-a-replacement" });
  assertHookResult(stopA, "stop A");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "one session stopped another session's game");

  const backgroundStop = runLifecycle("stop", {
    session_id: "session-b",
    prompt_id: "prompt-b",
    background_tasks: [{ id: "still-running" }],
  });
  assertHookResult(backgroundStop, "background-aware stop");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "Claude background task incorrectly ended the game");

  const stopB = runLifecycle("stop", { session_id: "session-b", prompt_id: "prompt-b" });
  assertHookResult(stopB, "stop B");
  status = readStatus();
  assert(status.phase === "complete" && status.activeRuns === 0, "final stop did not freeze the game");
  pass("start, interrupted-turn replacement, concurrent leases, background work, and stop lifecycle pass");

  const serverState = jsonFromStateFile();
  const rootResponse = await fetch(`http://127.0.0.1:${serverState.port}/`);
  const assetResponse = await fetch(`http://127.0.0.1:${serverState.port}/assets/wool-ball-teal.png`);
  const needleResponse = await fetch(`http://127.0.0.1:${serverState.port}/assets/pin-coral.png`);
  const audioResponse = await fetch(`http://127.0.0.1:${serverState.port}/needle-audio.js`);
  assert(rootResponse.ok && (await rootResponse.text()).includes("扎会儿毛线球等待小游戏"), "game HTML was not served");
  assert(assetResponse.ok && assetResponse.headers.get("content-type") === "image/png", "wool-ball asset was not served");
  assert(needleResponse.ok && needleResponse.headers.get("content-type") === "image/png", "needle sprite was not served");
  assert(audioResponse.ok && (await audioResponse.text()).includes("createNeedleAudio"), "audio module was not served");
  pass("loopback server delivers the game, generated artwork, and audio engine");

  const shutdown = runLifecycle("shutdown");
  assertHookResult(shutdown, "shutdown");
  pass(`Needlewhile validation passed (${checks + 1} checks)`);
} finally {
  try {
    runLifecycle("shutdown");
  } catch {
    // Best-effort cleanup for a failed validation.
  }
  rmSync(STATE_DIR, { recursive: true, force: true });
}

function jsonFromStateFile() {
  return JSON.parse(readFileSync(join(STATE_DIR, "server.json"), "utf8"));
}
