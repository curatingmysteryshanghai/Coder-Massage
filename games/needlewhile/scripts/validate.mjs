import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LIFECYCLE = join(ROOT, "skills", "needlewhile", "scripts", "lifecycle.mjs");
const SERVER = join(ROOT, "skills", "needlewhile", "app", "server.mjs");
const CLIENT = join(ROOT, "skills", "needlewhile", "app", "public", "app.js");
const AUDIO = join(ROOT, "skills", "needlewhile", "app", "public", "needle-audio.js");
const OPENAI_ADAPTER_DIR = join(ROOT, "adapters", "openai-app");
const OPENAI_ADAPTER_SERVER = join(OPENAI_ADAPTER_DIR, "server.mjs");
const OPENAI_ADAPTER_TEST = join(OPENAI_ADAPTER_DIR, "self-test.mjs");
const CODEX_HOOK_DOCTOR = join(ROOT, "scripts", "codex-hook-doctor.mjs");
const CODEX_HOOK_DOCTOR_TEST = join(ROOT, "scripts", "codex-hook-doctor.test.mjs");
const EXPECTED_RUNTIME_VERSION = "0.4.3";
const EXPECTED_DESIGN_VERSION = "Ver. 0.2";
const EXPECTED_PROTOCOL_VERSION = 2;
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

function runLifecycle(action, payload = {}, extraArgs = [], envOverrides = {}) {
  return spawnSync(process.execPath, [LIFECYCLE, action, "--no-window", ...extraArgs], {
    encoding: "utf8",
    env: { ...fixtureEnv, ...envOverrides },
    input: JSON.stringify(payload),
    timeout: 5_000,
  });
}

function readStatus() {
  const result = runLifecycle("status");
  assert(result.status === 0, `status command failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function readServerState() {
  return JSON.parse(readFileSync(join(STATE_DIR, "server.json"), "utf8"));
}

function assertHookResult(result, label) {
  assert(result.status === 0, `${label} hook exited ${result.status}: ${result.stderr}`);
  assert(result.stdout.trim() === "{}", `${label} hook stdout must be exactly {}`);
}

function readHookOutput(result, label) {
  assert(result.status === 0, `${label} hook exited ${result.status}: ${result.stderr}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} hook stdout is not valid JSON: ${result.stdout}`);
  }
}

function assertPng(relativePath) {
  const signature = read(relativePath).subarray(0, 8).toString("hex");
  assert(signature === "89504e470d0a1a0a", `${relativePath} is not a PNG`);
}

function hookDefinition(hooks, event) {
  return JSON.stringify(hooks.hooks?.[event] ?? []);
}

try {
  const packageManifest = json("package.json");
  const releaseManifest = json("release-manifest.json");
  const codexManifest = json(".codex-plugin/plugin.json");
  const claudeManifest = json(".claude-plugin/plugin.json");
  const codexHooks = json("hooks.json");
  const claudeHooks = json("hooks/claude-hooks.json");
  const claudeMarketplace = json(".claude-plugin/marketplace.json");
  const codexMarketplace = json(".agents/plugins/marketplace.json");
  const mcpConfig = json(".mcp.json");
  pass("all manifests and hook files are valid JSON");

  assert(codexManifest.name === "needlewhile", "Codex manifest name mismatch");
  assert(claudeManifest.name === "needlewhile", "Claude manifest name mismatch");
  assert(packageManifest.version === EXPECTED_RUNTIME_VERSION, "package runtime version mismatch");
  assert(codexManifest.version === EXPECTED_RUNTIME_VERSION, "Codex runtime version mismatch");
  assert(claudeManifest.version === EXPECTED_RUNTIME_VERSION, "Claude runtime version mismatch");
  assert(claudeMarketplace.plugins?.[0]?.version === EXPECTED_RUNTIME_VERSION, "Claude marketplace version mismatch");
  assert(releaseManifest.version === EXPECTED_RUNTIME_VERSION, "release runtime version mismatch");
  assert(releaseManifest.designVersion === EXPECTED_DESIGN_VERSION, "release design version mismatch");
  assert(releaseManifest.protocolVersion === EXPECTED_PROTOCOL_VERSION, "release protocol version mismatch");
  assert(codexManifest.hooks === "./hooks.json", "Codex hook path mismatch");
  assert(codexManifest.mcpServers === "./.mcp.json", "Codex MCP App config path mismatch");
  assert(
    mcpConfig.mcpServers?.["needlewhile-portal"]?.args?.[0] === "./adapters/openai-app/server.mjs",
    "Needlewhile Portal MCP server entrypoint mismatch",
  );
  assert(claudeManifest.hooks === "./hooks/claude-hooks.json", "Claude hook path mismatch");
  assert(codexMarketplace.name === "jieya", "standalone Codex marketplace name mismatch");
  assert(codexMarketplace.plugins?.[0]?.name === "needlewhile", "standalone Codex plugin name mismatch");
  assert(codexMarketplace.plugins?.[0]?.source?.path === "./", "standalone Codex marketplace path mismatch");
  pass("runtime 0.4.3, design Ver. 0.2, and protocol 2 align across release manifests");

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

  const lifecycleSource = read("skills/needlewhile/scripts/lifecycle.mjs").toString("utf8");
  const codexStartHookDefinition = hookDefinition(codexHooks, "UserPromptSubmit");
  const claudeStartHookDefinition = hookDefinition(claudeHooks, "UserPromptSubmit");
  const startHookDefinitions = [codexStartHookDefinition, claudeStartHookDefinition];
  const browserTakeoverPatterns = [
    /--start-fullscreen/i,
    /--start-maximized/i,
    /--kiosk/i,
    /--user-data-dir/i,
    /(^|[\s"'])--app(?:=|[\s"'])/im,
    /--app-mode/i,
  ];
  for (const definition of startHookDefinitions) {
    assert(/lifecycle\.mjs/.test(definition) && /start/.test(definition), "prompt hook must invoke lifecycle start");
    assert(!/["'\]]open(?:["'\s,\]])/.test(definition), "prompt hook must not invoke the explicit open action");
  }
  assert(/--inline-portal/.test(codexStartHookDefinition), "Codex prompt hook does not request its inline Portal");
  assert(!/--inline-portal/.test(claudeStartHookDefinition), "Claude prompt hook unexpectedly requests a Codex inline Portal");
  for (const pattern of browserTakeoverPatterns) {
    assert(!pattern.test(lifecycleSource), `lifecycle retains browser takeover flag ${pattern}`);
    assert(startHookDefinitions.every((definition) => !pattern.test(definition)), `start hook retains browser takeover flag ${pattern}`);
  }
  assert(/if \(action === "open"\)/.test(lifecycleSource), "explicit open action is missing");
  assert(/function openPortal\(/.test(lifecycleSource), "system-default-browser Portal opener is missing");
  assert(/if \(noWindow\) return true;/.test(lifecycleSource), "open action has no safe no-window path");
  assert(lifecycleSource.includes("hookSpecificOutput"), "Codex inline Portal context output is missing");
  pass("Codex start requests an inline Portal; browser open stays click-only and takeover flags are absent");

  const skill = read("skills/needlewhile/SKILL.md").toString("utf8");
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert(frontmatter, "SKILL.md frontmatter is missing");
  const keys = frontmatter[1]
    .split("\n")
    .map((line) => line.split(":", 1)[0].trim())
    .filter(Boolean);
  assert(keys.length === 2 && keys.includes("name") && keys.includes("description"), "SKILL.md frontmatter must contain only name and description");
  assert(/^name: needlewhile$/m.test(frontmatter[1]), "SKILL.md name must be lowercase hyphen-case");
  assert(skill.includes("Escape") && skill.includes("F11"), "SKILL.md does not document browser-reserved keys");
  pass("SKILL.md keeps minimal frontmatter and documents opt-in keyboard behavior");

  for (const file of [
    SERVER,
    LIFECYCLE,
    CLIENT,
    AUDIO,
    OPENAI_ADAPTER_SERVER,
    OPENAI_ADAPTER_TEST,
    CODEX_HOOK_DOCTOR,
    CODEX_HOOK_DOCTOR_TEST,
  ]) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert(result.status === 0, `${file} failed syntax check: ${result.stderr}`);
  }
  pass("runtime, browser client, audio engine, Hook doctor, and OpenAI MCP App adapter pass Node syntax checks");

  const hookDoctorSource = read("scripts/codex-hook-doctor.mjs").toString("utf8");
  assert(hookDoctorSource.includes('method: "hooks/list"'), "Hook doctor does not inspect hooks/list");
  assert(!hookDoctorSource.includes("config/batchWrite"), "Hook doctor must not write Hook trust");
  assert(!hookDoctorSource.includes("dangerously-bypass-hook-trust"), "Hook doctor must not bypass Hook trust");
  const hookDoctorTest = spawnSync(process.execPath, ["--test", CODEX_HOOK_DOCTOR_TEST], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert(hookDoctorTest.status === 0, `Hook doctor fixture tests failed: ${hookDoctorTest.stderr}`);
  assert(hookDoctorTest.stdout.includes("# pass 9"), "Hook doctor did not pass all nine fixture tests");
  pass("Hook doctor distinguishes ready, review-needed, and invalid installs without writing trust");

  for (const installerPath of ["install.sh", "install.ps1"]) {
    const installerSource = read(installerPath).toString("utf8");
    assert(installerSource.includes("needlewhile@jieya"), `${installerPath} does not use the canonical plugin ID`);
    assert(installerSource.includes("plugin remove") && installerSource.includes("needlewhile@needlewhile-local"), `${installerPath} does not migrate the legacy plugin ID`);
    assert(installerSource.includes("codex-hook-doctor.mjs"), `${installerPath} does not run the Hook doctor`);
    assert(installerSource.includes("codex://plugins/needlewhile@jieya"), `${installerPath} does not open the desktop review page`);
    assert(installerSource.includes("NEEDLEWHILE_STATUS=pending"), `${installerPath} does not expose pending authorization`);
    assert(installerSource.toLowerCase().includes("version mismatch"), `${installerPath} does not reject an outdated plugin version`);
    assert(!installerSource.includes("trusted_hash"), `${installerPath} must not write trusted hashes`);
    assert(!installerSource.includes("config/batchWrite"), `${installerPath} must not write Hook trust`);
    assert(!installerSource.includes("dangerously-bypass-hook-trust"), `${installerPath} must not bypass Hook trust`);
  }
  if (process.platform !== "win32") {
    assert((statSync(join(ROOT, "install.sh")).mode & 0o111) !== 0, "install.sh must remain executable");
  }
  pass("standalone installers require explicit Hook authorization before reporting ready");

  const openaiAdapterTest = spawnSync(process.execPath, [OPENAI_ADAPTER_TEST], {
    cwd: OPENAI_ADAPTER_DIR,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert(openaiAdapterTest.status === 0, `OpenAI MCP App self-test failed: ${openaiAdapterTest.stderr}`);
  assert(openaiAdapterTest.stdout.includes("browser launch: not observed"), "OpenAI adapter test did not prove browser-launch safety");
  pass("OpenAI MCP App supports trusted hook rendering and returns a click-only Portal without launching a browser");

  const html = read("skills/needlewhile/app/public/index.html").toString("utf8");
  const clientSource = read("skills/needlewhile/app/public/app.js").toString("utf8");
  assert(html.includes("Ver. 0.2") && html.includes("VER. 0.2"), "visible Ver. 0.2 label is missing");
  for (const id of [
    "task-title",
    "phase-label",
    "elapsed-label",
    "tool-label",
    "portal-gate",
    "portal-button",
    "palette-toggle",
    "completion",
    "close-countdown",
  ]) {
    assert(html.includes(`id="${id}"`), `Ver. 0.2 DOM is missing #${id}`);
  }
  assert(html.includes("fiber-detail"), "fine-fiber overlay is missing");
  assert(clientSource.includes('portalButton.addEventListener("click", enterGame)'), "Portal is not click-to-enter");
  assert(clientSource.includes("function shufflePalette()"), "palette randomizer is missing");
  assert(clientSource.includes('paletteToggle.addEventListener("click"'), "palette button is not wired");
  assert(clientSource.includes("function startCloseSequence()"), "completion close sequence is missing");
  assert(/closeDeadline\s*=\s*Date\.now\(\)\s*\+\s*8_000/.test(clientSource), "eight-second completion countdown is missing");
  assert(clientSource.includes("ending-vortex") || html.includes("ending-vortex"), "ending performance is missing");
  assert(clientSource.includes("roundChanged") && /previous\s*!==\s*["']active["']\s*\|\|\s*roundChanged/.test(clientSource), "active-to-active round changes do not clear old pins");
  pass("Portal, task detail, palette shuffle, fine fibers, and completion countdown are present");

  const keydownStart = clientSource.indexOf('toy.addEventListener("keydown"');
  const keydownEnd = clientSource.indexOf("\n});", keydownStart);
  assert(keydownStart >= 0 && keydownEnd > keydownStart, "toy keydown handler is missing");
  const keydownHandler = clientSource.slice(keydownStart, keydownEnd);
  const escapeIndex = keydownHandler.indexOf('event.key === "Escape"');
  const f11Index = keydownHandler.indexOf('event.key === "F11"');
  const returnIndex = keydownHandler.indexOf(") return;", f11Index);
  const pinIndex = keydownHandler.lastIndexOf("addPin();");
  assert(escapeIndex >= 0 && f11Index >= 0, "Escape or F11 is missing from the reserved-key guard");
  assert(returnIndex > f11Index && pinIndex > returnIndex, "reserved keys are not returned before addPin");
  assert(clientSource.includes("frontFace") && /radial\s*=\s*frontFace/.test(clientSource), "front-face pin sampling is missing");
  pass("Escape and F11 bypass addPin, while front-face pin sampling remains enabled");

  for (const asset of [
    "skills/needlewhile/app/public/assets/wool-ball-teal.png",
    "skills/needlewhile/app/public/assets/pin-coral.png",
    "skills/needlewhile/app/public/assets/pin-cream.png",
    "skills/needlewhile/app/public/assets/pin-mustard.png",
  ]) {
    assertPng(asset);
  }
  pass("teal yarn ball and transparent needle sprites are present");

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

  const safeOpen = runLifecycle("open");
  assertHookResult(safeOpen, "no-window open");
  let status = readStatus();
  assert(status.running && status.phase === "idle", "explicit no-window open did not leave an idle controller");
  assert(status.version === EXPECTED_RUNTIME_VERSION, "live runtime version mismatch");
  assert(status.displayVersion === EXPECTED_DESIGN_VERSION, "live design version mismatch");
  assert(status.protocolVersion === EXPECTED_PROTOCOL_VERSION, "live protocol version mismatch");
  pass("explicit open is safe under --no-window and live version metadata aligns");

  const subagentPortalStart = runLifecycle("start", {
    hook_event_name: "UserPromptSubmit",
    session_id: "subagent-session",
    turn_id: "subagent-run",
    agent_id: "child-agent",
  }, ["--client", "codex", "--inline-portal"]);
  assertHookResult(subagentPortalStart, "subagent inline Portal start");

  const remotePortalStart = runLifecycle("start", {
    hook_event_name: "UserPromptSubmit",
    session_id: "remote-session",
    turn_id: "remote-run",
  }, ["--client", "codex", "--inline-portal"], { CLAUDE_CODE_REMOTE: "true" });
  assertHookResult(remotePortalStart, "remote inline Portal start");

  const missingFlagStart = runLifecycle("start", {
    hook_event_name: "UserPromptSubmit",
    session_id: "missing-flag-session",
    turn_id: "missing-flag-run",
  }, ["--client", "codex"]);
  assertHookResult(missingFlagStart, "missing-flag Portal start");
  assertHookResult(runLifecycle("stop", {
    session_id: "missing-flag-session",
    turn_id: "missing-flag-run",
  }, ["--client", "codex"]), "missing-flag Portal stop");

  const nonCodexStart = runLifecycle("start", {
    hook_event_name: "UserPromptSubmit",
    session_id: "non-codex-session",
    turn_id: "non-codex-run",
  }, ["--client", "claude-code", "--inline-portal"]);
  assertHookResult(nonCodexStart, "non-Codex inline Portal start");
  assertHookResult(runLifecycle("stop", {
    session_id: "non-codex-session",
    turn_id: "non-codex-run",
  }, ["--client", "claude-code"]), "non-Codex inline Portal stop");

  const wrongEventStart = runLifecycle("start", {
    hook_event_name: "PostToolUse",
    session_id: "wrong-event-session",
    turn_id: "wrong-event-run",
  }, ["--client", "codex", "--inline-portal"]);
  assertHookResult(wrongEventStart, "wrong-event inline Portal start");
  assertHookResult(runLifecycle("stop", {
    session_id: "wrong-event-session",
    turn_id: "wrong-event-run",
  }, ["--client", "codex"]), "wrong-event inline Portal stop");

  const inlinePortalStart = runLifecycle("start", {
    hook_event_name: "UserPromptSubmit",
    session_id: "inline-portal-session",
    turn_id: "inline-portal-run",
    prompt: "Show the Portal while this task runs",
  }, ["--client", "codex", "--inline-portal"]);
  const inlinePortalOutput = readHookOutput(inlinePortalStart, "top-level inline Portal start");
  assert(
    inlinePortalOutput.hookSpecificOutput?.hookEventName === "UserPromptSubmit",
    "inline Portal hook output uses the wrong event schema",
  );
  const additionalContext = inlinePortalOutput.hookSpecificOutput?.additionalContext;
  assert(
    typeof additionalContext === "string"
    && additionalContext.includes("mcp__needlewhile_portal__show_needlewhile_portal")
    && additionalContext.includes("exactly once")
    && additionalContext.includes("does not open a browser"),
    "inline Portal hook context is incomplete",
  );
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "inline Portal start did not create one active run");
  assert(status.toolSteps === 0, "inline Portal start incorrectly counted a task tool step");

  const portalHeartbeat = runLifecycle("heartbeat", {
    session_id: "inline-portal-session",
    turn_id: "inline-portal-run",
    tool_name: "mcp__needlewhile_portal__show_needlewhile_portal",
  }, ["--client", "codex"]);
  assertHookResult(portalHeartbeat, "inline Portal render heartbeat");
  status = readStatus();
  assert(status.toolSteps === 0, "inline Portal render was counted as a task tool step");

  const nearMatchHeartbeat = runLifecycle("heartbeat", {
    session_id: "inline-portal-session",
    turn_id: "inline-portal-run",
    tool_name: "other__show_needlewhile_portal",
  }, ["--client", "codex"]);
  assertHookResult(nearMatchHeartbeat, "near-match Portal heartbeat");
  status = readStatus();
  assert(status.toolSteps === 1, "an unrelated near-match tool was incorrectly suppressed");
  assertHookResult(runLifecycle("stop", {
    session_id: "inline-portal-session",
    turn_id: "inline-portal-run",
  }, ["--client", "codex"]), "inline Portal stop");
  pass("trusted top-level Codex hooks request one inline Portal and suppress subagent, remote, and self-heartbeat noise");

  const initialStateFile = readServerState();
  const startTask = runLifecycle("start", {
    client_kind: "Codex",
    session_id: "metadata-session",
    turn_id: "metadata-run",
    task_title: "细化毛线球\n视觉",
  });
  assertHookResult(startTask, "metadata start");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "metadata start did not create one active run");
  assert(status.taskTitle === "细化毛线球 视觉", "taskTitle was not sanitized and exposed");
  assert(status.clientKind === "codex", "clientKind was not normalized and exposed");
  assert(status.toolSteps === 0, "new task must start with zero tool steps");
  const metadataRoundRevision = status.roundRevision;
  assert(Number.isInteger(metadataRoundRevision) && metadataRoundRevision > 0, "new task has no round revision");

  const heartbeatTask = runLifecycle("heartbeat", {
    client_kind: "Codex",
    session_id: "metadata-session",
    turn_id: "metadata-run",
    tool_name: "apply_patch",
  });
  assertHookResult(heartbeatTask, "metadata heartbeat");
  status = readStatus();
  assert(status.toolSteps === 1 && status.currentTool === "apply_patch", "heartbeat did not expose toolSteps/currentTool");
  assert(status.roundRevision === metadataRoundRevision, "heartbeat unexpectedly changed the current round");
  assert(readServerState().pid === initialStateFile.pid, "lifecycle metadata unexpectedly replaced the controller");
  assertHookResult(runLifecycle("stop", {
    client_kind: "Codex",
    session_id: "metadata-session",
    turn_id: "metadata-run",
  }), "metadata stop");
  pass("taskTitle, toolSteps, currentTool, and clientKind flow through protocol 2");

  assertHookResult(runLifecycle("start", {
    client_kind: "codex",
    session_id: "replacement-session",
    turn_id: "old-run",
    task_title: "old task",
  }), "old replacement start");
  status = readStatus();
  const oldRoundRevision = status.roundRevision;
  assertHookResult(runLifecycle("start", {
    client_kind: "codex",
    session_id: "replacement-session",
    turn_id: "new-run",
    task_title: "replacement task",
  }), "new replacement start");
  status = readStatus();
  assert(status.roundRevision > oldRoundRevision, "replacement start did not advance the round revision");
  assertHookResult(runLifecycle("stop", {
    client_kind: "codex",
    session_id: "replacement-session",
    turn_id: "old-run",
  }), "delayed old stop");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "delayed old stop killed the replacement run");
  assert(status.taskTitle === "replacement task", "replacement run lost focus after delayed stop");
  assertHookResult(runLifecycle("stop", {
    client_kind: "codex",
    session_id: "replacement-session",
    turn_id: "new-run",
  }), "replacement stop");
  pass("a delayed stop from an interrupted run cannot kill its replacement");

  const collision = {
    session_id: "shared-session",
    turn_id: "shared-run",
  };
  assertHookResult(runLifecycle("start", {
    ...collision,
    client_kind: "codex",
    task_title: "Codex task",
  }), "Codex collision start");
  assertHookResult(runLifecycle("start", {
    ...collision,
    client_kind: "claude-code",
    task_title: "Claude task",
  }), "Claude collision start");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 2, "Codex and Claude collided on the same session/run IDs");
  assertHookResult(runLifecycle("stop", { ...collision, client_kind: "codex" }), "Codex collision stop");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1 && status.clientKind === "claude-code", "Codex stop removed Claude's matching lease");
  assertHookResult(runLifecycle("stop", { ...collision, client_kind: "claude-code" }), "Claude collision stop");
  pass("Codex and Claude Code leases do not collide even with identical session/run IDs");

  assertHookResult(runLifecycle("start", {
    client_kind: "workbuddy",
    session_id: "legacy-session",
    run_id: "legacy-run",
  }), "legacy start");
  assertHookResult(runLifecycle("stop", {
    client_kind: "workbuddy",
    session_id: "legacy-session",
  }), "legacy no-runId stop");
  status = readStatus();
  assert(status.phase === "complete" && status.activeRuns === 0, "no-runId compatibility stop did not clean its session");
  pass("ending events without runId retain compatibility session cleanup");

  assertHookResult(runLifecycle("start", {
    client_kind: "claude-code",
    session_id: "anonymous-race-session",
    task_title: "anonymous old task",
  }), "anonymous interrupted start");
  assertHookResult(runLifecycle("start", {
    client_kind: "claude-code",
    session_id: "anonymous-race-session",
    task_title: "anonymous replacement task",
  }), "anonymous replacement start");
  status = readStatus();
  assert(status.taskTitle === "anonymous replacement task", "anonymous replacement did not take focus");
  assertHookResult(runLifecycle("stop", {
    client_kind: "claude-code",
    session_id: "anonymous-race-session",
  }), "anonymous replacement stop");
  status = readStatus();
  assert(status.phase === "complete" && status.activeRuns === 0, "anonymous replacement did not stop after an interrupted prior turn");
  pass("a Claude-style anonymous replacement stops cleanly after an interrupted prior turn");

  assertHookResult(runLifecycle("start", {
    client_kind: "codex",
    session_id: "concurrent-a",
    turn_id: "run-a",
    task_title: "Concurrent Codex task",
  }), "concurrent start A");
  assertHookResult(runLifecycle("start", {
    client_kind: "claude-code",
    session_id: "concurrent-b",
    prompt_id: "run-b",
    task_title: "Concurrent Claude task",
  }), "concurrent start B");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 2, "concurrent sessions were not retained");
  assert(
    status.taskTitle === "Concurrent Claude task"
    && status.clientKind === "claude-code"
    && status.toolSteps === 0,
    "concurrent focus mixed title, client, or tool metrics from different runs",
  );
  const concurrentRoundRevision = status.roundRevision;
  assertHookResult(runLifecycle("heartbeat", {
    client_kind: "codex",
    session_id: "concurrent-a",
    turn_id: "run-a",
    tool_name: "read",
  }), "concurrent heartbeat A");
  status = readStatus();
  assert(
    status.taskTitle === "Concurrent Codex task"
    && status.clientKind === "codex"
    && status.toolSteps === 1,
    "focus heartbeat mixed metrics from another concurrent run",
  );
  assert(status.roundRevision === concurrentRoundRevision, "focus heartbeat changed the global round revision");
  assertHookResult(runLifecycle("stop", {
    client_kind: "codex",
    session_id: "concurrent-a",
    turn_id: "run-a",
  }), "concurrent stop A");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1, "one concurrent session stopped another");

  assertHookResult(runLifecycle("stop", {
    client_kind: "claude-code",
    session_id: "concurrent-b",
    prompt_id: "run-b",
    background_tasks: [{ id: "still-running" }],
  }), "background-aware stop");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1 && status.toolSteps === 1, "background task incorrectly ended the run");
  assertHookResult(runLifecycle("stop", {
    client_kind: "claude-code",
    session_id: "concurrent-b",
    prompt_id: "run-b",
    session_crons: [{ id: "scheduled" }],
  }), "scheduled-work-aware stop");
  status = readStatus();
  assert(status.phase === "active" && status.activeRuns === 1 && status.toolSteps === 2, "scheduled work incorrectly ended the run");
  assertHookResult(runLifecycle("stop", {
    client_kind: "claude-code",
    session_id: "concurrent-b",
    prompt_id: "run-b",
  }), "final concurrent stop B");
  status = readStatus();
  assert(status.phase === "complete" && status.activeRuns === 0, "final stop did not complete the controller");
  pass("concurrency plus background-task and scheduled-work heartbeat semantics pass");

  const serverState = readServerState();
  const baseUrl = `http://127.0.0.1:${serverState.port}`;
  const rootResponse = await fetch(`${baseUrl}/`);
  const cssResponse = await fetch(`${baseUrl}/styles.css`);
  const clientResponse = await fetch(`${baseUrl}/app.js`);
  const assetResponse = await fetch(`${baseUrl}/assets/wool-ball-teal.png`);
  const needleResponse = await fetch(`${baseUrl}/assets/pin-coral.png`);
  const audioResponse = await fetch(`${baseUrl}/needle-audio.js`);
  const unauthorizedResponse = await fetch(`${baseUrl}/api/state`);
  const healthResponse = await fetch(`${baseUrl}/health?token=${serverState.token}`);
  const healthPayload = await healthResponse.json();
  assert(rootResponse.ok && (await rootResponse.text()).includes("portal-button"), "Portal HTML was not served");
  assert(cssResponse.ok && (await cssResponse.text()).includes(".portal-gate"), "Portal CSS was not served");
  assert(clientResponse.ok && (await clientResponse.text()).includes("shufflePalette"), "Ver. 0.2 client was not served");
  assert(assetResponse.ok && assetResponse.headers.get("content-type") === "image/png", "wool-ball asset was not served");
  assert(needleResponse.ok && needleResponse.headers.get("content-type") === "image/png", "needle sprite was not served");
  assert(audioResponse.ok && (await audioResponse.text()).includes("createNeedleAudio"), "audio module was not served");
  assert(unauthorizedResponse.status === 403, "state API is accessible without its loopback token");
  assert(
    healthResponse.ok
    && healthPayload.version === EXPECTED_RUNTIME_VERSION
    && healthPayload.protocolVersion === EXPECTED_PROTOCOL_VERSION,
    "health metadata does not align with runtime/protocol versions",
  );
  pass("loopback server securely delivers Ver. 0.2 static, artwork, client, and audio assets");

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
