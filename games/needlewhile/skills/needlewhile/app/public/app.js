import { createNeedleAudio } from "/needle-audio.js";

const body = document.body;
const toy = document.querySelector("#toy");
const ball = document.querySelector("#wool-ball");
const pinBackLayer = document.querySelector("#pin-layer-back");
const pinLayer = document.querySelector("#pin-layer");
const pinLayers = [pinBackLayer, pinLayer];
const taskTitle = document.querySelector("#task-title");
const phaseLabel = document.querySelector("#phase-label");
const elapsedLabel = document.querySelector("#elapsed-label");
const toolLabel = document.querySelector("#tool-label");
const pinCountText = document.querySelector("#pin-count");
const inputHint = document.querySelector("#input-hint");
const liveCount = document.querySelector("#live-count");
const portalGate = document.querySelector("#portal-gate");
const portalButton = document.querySelector("#portal-button");
const portalTitle = document.querySelector("#portal-title");
const portalSubtitle = document.querySelector("#portal-subtitle");
const completion = document.querySelector("#completion");
const completionCopy = document.querySelector("#completion-copy");
const closeCountdown = document.querySelector("#close-countdown");
const closeNow = document.querySelector("#close-now");
const soundToggle = document.querySelector("#sound-toggle");
const soundLabel = document.querySelector("#sound-label");
const paletteToggle = document.querySelector("#palette-toggle");

const token = location.hash.slice(1).replace(/[^a-f0-9]/gi, "");
const pinSprites = [
  "/assets/pin-coral.png",
  "/assets/pin-cream.png",
  "/assets/pin-mustard.png",
];
const palettes = [
  { name: "teal", background: "#f2cf62", ink: "#171a17", accent: "#287e73", cream: "#f2e5bd", filter: "none" },
  { name: "berry", background: "#d9c4e8", ink: "#22172a", accent: "#c65d72", cream: "#f5e6c8", filter: "hue-rotate(72deg) saturate(.88)" },
  { name: "mint", background: "#bfe0c9", ink: "#17231d", accent: "#6f3f74", cream: "#f3d9a8", filter: "hue-rotate(118deg) saturate(.82) brightness(.93)" },
  { name: "sky", background: "#add9e6", ink: "#142128", accent: "#b75039", cream: "#f2deb8", filter: "hue-rotate(162deg) saturate(.95)" },
  { name: "peach", background: "#efb997", ink: "#281a18", accent: "#315f85", cream: "#f5e4bc", filter: "hue-rotate(205deg) saturate(.82)" },
];
const audio = createNeedleAudio();

let phase = "idle";
let activeRuns = 0;
let roundRevision = null;
let currentState = {};
let entered = false;
let pinCount = 0;
let paletteIndex = 0;
let lastInputAt = 0;
let impactTimer = null;
let events = null;
let elapsedTimer = null;
let closeTimer = null;
let closeDeadline = null;

function clientLabel(clientKind) {
  return {
    codex: "Codex",
    "claude-code": "Claude Code",
    workbuddy: "WorkBuddy",
    coze: "Coze",
    generic: "Agent",
  }[clientKind] ?? clientKind ?? "Agent";
}

function phaseCopy(nextPhase, runs, clientKind) {
  if (nextPhase === "active") return runs > 1 ? `${runs} agents working` : `${clientLabel(clientKind)} is working`;
  if (nextPhase === "complete") return `${clientLabel(clientKind)} finished`;
  if (nextPhase === "error") return `${clientLabel(clientKind)} stopped`;
  return "Waiting for task";
}

function countLabel(value, width = 3) {
  return String(value).padStart(width, "0");
}

function updateCount() {
  pinCountText.textContent = countLabel(pinCount);
  liveCount.textContent = `${pinCount} pins placed`;
}

function clearPins() {
  for (const layer of pinLayers) layer.replaceChildren();
  pinCount = 0;
  updateCount();
}

function formatElapsed(startedAt, endedAt) {
  if (!startedAt) return "00:00";
  const end = endedAt || Date.now();
  const seconds = Math.max(0, Math.floor((end - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${countLabel(hours, 2)}:${countLabel(minutes, 2)}:${countLabel(rest, 2)}`
    : `${countLabel(minutes, 2)}:${countLabel(rest, 2)}`;
}

function updateElapsed() {
  const endedAt = phase === "active" ? null : currentState.completedAt;
  elapsedLabel.textContent = formatElapsed(currentState.startedAt, endedAt);
}

function setPortalCopy() {
  if (phase === "active") {
    portalTitle.textContent = "Open time portal";
    portalSubtitle.textContent = "Task in progress · click to place a few pins";
    portalButton.disabled = false;
    return;
  }
  if (phase === "complete") {
    portalTitle.textContent = "This round is complete";
    portalSubtitle.textContent = "Open to see the pin trail";
    portalButton.disabled = false;
    return;
  }
  if (phase === "error") {
    portalTitle.textContent = "The task stopped";
    portalSubtitle.textContent = "Open to see this round's pin trail";
    portalButton.disabled = false;
    return;
  }
  portalTitle.textContent = "Waiting for the portal";
  portalSubtitle.textContent = "Submit a task to light it up";
  portalButton.disabled = true;
}

function stopCloseSequence() {
  globalThis.clearInterval(closeTimer);
  closeTimer = null;
  closeDeadline = null;
  completion.setAttribute("aria-hidden", "true");
  body.dataset.ending = "false";
}

function requestClose() {
  globalThis.clearInterval(closeTimer);
  closeTimer = null;
  window.close();
  globalThis.setTimeout(() => {
    if (!window.closed) {
      body.dataset.closeFailed = "true";
      completionCopy.textContent = "Your browser kept this page open. You can close this tab.";
      inputHint.textContent = "Task complete · you can close this tab";
    }
  }, 450);
}

function startCloseSequence() {
  if (closeTimer || phase === "active") return;
  completion.setAttribute("aria-hidden", "false");
  body.dataset.ending = "true";
  body.dataset.closeFailed = "false";
  completionCopy.textContent = phase === "error"
    ? "The task stopped. Put this round away gently."
    : "Let the yarn and your thoughts rest for a moment.";
  closeDeadline = Date.now() + 8_000;

  const tick = () => {
    const remaining = Math.max(0, Math.ceil((closeDeadline - Date.now()) / 1000));
    closeCountdown.textContent = countLabel(remaining, 2);
    if (remaining === 0) requestClose();
  };
  tick();
  closeTimer = globalThis.setInterval(tick, 250);
}

function applyState(state) {
  const previous = phase;
  const previousRoundRevision = roundRevision;
  currentState = state;
  phase = state.phase ?? "idle";
  activeRuns = state.activeRuns ?? 0;
  roundRevision = state.roundRevision ?? null;
  const roundChanged = roundRevision !== null && roundRevision !== previousRoundRevision;
  body.dataset.phase = phase;
  audio.setActive(phase === "active" && entered);

  taskTitle.textContent = state.taskTitle || (phase === "active" ? "Current agent task" : "Waiting for an agent task");
  phaseLabel.textContent = phaseCopy(phase, activeRuns, state.clientKind);
  toolLabel.textContent = countLabel(state.toolSteps ?? 0, 2);
  toolLabel.title = state.currentTool ? `Latest step: ${state.currentTool}` : "No tool steps yet";
  updateElapsed();
  setPortalCopy();

  if (phase === "active") {
    stopCloseSequence();
    if (previous !== "active" || roundChanged) clearPins();
    inputHint.textContent = entered
      ? "Click or press an ordinary key to place a pin · ESC stays with the browser"
      : "Open the time portal to enter · ESC stays with the browser";
  } else if (phase === "complete" || phase === "error") {
    inputHint.textContent = entered ? "Round ended · closing the time portal" : "Task ended · open to see the pin trail";
    if (entered) startCloseSequence();
  } else {
    inputHint.textContent = "Waiting for a task · ESC stays with the browser";
  }
}

export function projectPinPerspective({
  frontFace,
  radial,
  outward,
  ballWidth,
  approachSeed,
  lengthSeed,
}) {
  const projection = Math.max(0, Math.min(1, radial / 0.5));
  const angleRange = frontFace ? 10 + projection * 18 : 36;
  const angle = outward + (approachSeed - 0.5) * angleRange;
  const lengthRatio = frontFace
    ? 0.052 + projection * 0.21 + lengthSeed * 0.035
    : 0.18 + projection * 0.22 + lengthSeed * 0.08;
  const width = frontFace
    ? Math.max(12, Math.min(16, ballWidth * (0.022 - projection * 0.005)))
    : Math.max(10, Math.min(15, ballWidth * 0.019));

  return {
    angle,
    desiredLength: ballWidth * lengthRatio,
    width,
    projection,
    entryOcclusion: frontFace ? 12 + (1 - projection) * 10 : 5,
    contactSquash: Math.max(0.38, 0.9 - projection * 0.52),
    contactOpacity: 0.52 + (1 - projection) * 0.2,
    headOn: frontFace && projection < 0.22,
  };
}

function pinCoordinates() {
  const toyRect = toy.getBoundingClientRect();
  const ballRect = ball.getBoundingClientRect();
  const centerX = ballRect.left + ballRect.width * 0.5;
  const centerY = ballRect.top + ballRect.height * 0.51;
  const frontFace = Math.random() < 0.44;
  const theta = Math.random() * Math.PI * 2;
  const radial = frontFace
    ? Math.random() ** 0.82 * 0.27
    : 0.12 + Math.sqrt(Math.random()) * 0.38;
  const targetX = centerX + Math.cos(theta) * ballRect.width * radial;
  const targetY = centerY + Math.sin(theta) * ballRect.height * radial * 0.9;
  const outward = Math.atan2(targetY - centerY, targetX - centerX) * (180 / Math.PI) + 90;
  const perspective = projectPinPerspective({
    frontFace,
    radial,
    outward,
    ballWidth: ballRect.width,
    approachSeed: Math.random(),
    lengthSeed: Math.random(),
  });
  const angle = perspective.angle;
  const angleRadians = angle * (Math.PI / 180);
  const headX = Math.sin(angleRadians);
  const headY = -Math.cos(angleRadians);
  const xRoom = headX > 0.001
    ? (toyRect.right - targetX) / headX
    : headX < -0.001
      ? (targetX - toyRect.left) / -headX
      : Number.POSITIVE_INFINITY;
  const yRoom = headY > 0.001
    ? (toyRect.bottom - targetY) / headY
    : headY < -0.001
      ? (targetY - toyRect.top) / -headY
      : Number.POSITIVE_INFINITY;
  const minimumLength = frontFace ? Math.max(32, ballRect.width * 0.046) : Math.max(48, ballRect.width * 0.075);
  const pinLength = Math.max(minimumLength, Math.min(perspective.desiredLength, Math.min(xRoom, yRoom) - 26));
  const layerSeed = Math.random();

  return {
    x: targetX - toyRect.left,
    y: targetY - toyRect.top,
    angle,
    length: pinLength,
    zone: frontFace ? "front" : "rim",
    layer: !frontFace && layerSeed < 0.34 ? "back" : "front",
    projection: perspective.projection,
    width: perspective.width,
    entryOcclusion: perspective.entryOcclusion,
    contactSquash: perspective.contactSquash,
    contactOpacity: perspective.contactOpacity,
    contactAngle: outward - angle,
    headOn: perspective.headOn,
  };
}

function agePins() {
  for (const pin of pinLayers.flatMap((layer) => [...layer.children])) {
    const age = pinCount - Number(pin.dataset.born ?? pinCount);
    let sink = 0;
    if (age > 40) sink = 90;
    else if (age > 24) sink = 42 + ((age - 24) / 16) * 36;
    else if (age > 10) sink = ((age - 10) / 14) * 42;
    pin.style.setProperty("--sink", `${sink}%`);

    if (age > 72 && pin.dataset.retiring !== "true") {
      pin.dataset.retiring = "true";
      pin.classList.add("retiring");
      globalThis.setTimeout(() => pin.remove(), 280);
    }
  }
}

function makePin({
  x,
  y,
  angle,
  length,
  zone,
  layer,
  projection,
  width,
  entryOcclusion,
  contactSquash,
  contactOpacity,
  contactAngle,
  headOn,
}) {
  const pin = document.createElement("span");
  const sleeve = document.createElement("span");
  const sprite = document.createElement("img");
  const contact = document.createElement("span");
  pin.className = `pin pin--${zone}`;
  if (headOn) pin.classList.add("pin--head-on");
  pin.dataset.born = String(pinCount);
  pin.dataset.projection = projection.toFixed(3);
  pin.dataset.entryOcclusion = entryOcclusion.toFixed(1);
  pin.dataset.layer = layer;
  pin.style.left = `${(x / toy.clientWidth) * 100}%`;
  pin.style.top = `${(y / toy.clientHeight) * 100}%`;
  pin.style.setProperty("--angle", `${angle}deg`);
  pin.style.setProperty("--pin-length", `${length}px`);
  pin.style.setProperty("--pin-width", `${width}px`);
  pin.style.setProperty("--entry-occlusion", `${entryOcclusion}%`);
  pin.style.setProperty("--contact-squash", String(contactSquash));
  pin.style.setProperty("--contact-opacity", String(contactOpacity));
  pin.style.setProperty("--contact-angle", `${contactAngle}deg`);
  sleeve.className = "pin-occlusion";
  sprite.className = "pin-sprite";
  sprite.src = pinSprites[Math.floor(Math.random() * pinSprites.length)];
  sprite.alt = "";
  sprite.draggable = false;
  contact.className = "pin-contact";
  contact.setAttribute("aria-hidden", "true");
  sleeve.append(sprite);
  pin.append(contact, sleeve);
  (layer === "back" ? pinBackLayer : pinLayer).append(pin);
}

function impact(angle) {
  ball.style.setProperty("--impact-rotation", `${Math.sin(angle * Math.PI / 180) * 0.78}deg`);
  ball.classList.remove("impact");
  void ball.offsetWidth;
  ball.classList.add("impact");
  globalThis.clearTimeout(impactTimer);
  impactTimer = globalThis.setTimeout(() => ball.classList.remove("impact"), 220);
}

function addPin() {
  if (!entered || phase !== "active") return;
  const now = performance.now();
  const cadenceMs = lastInputAt > 0 ? now - lastInputAt : Number.POSITIVE_INFINITY;
  if (cadenceMs < 28) return;
  lastInputAt = now;

  audio.prime();
  const point = pinCoordinates();
  makePin(point);
  impact(point.angle);
  audio.trigger({ cadenceMs });
  pinCount += 1;
  agePins();
  updateCount();
}

function focusToy() {
  if (!entered) return;
  requestAnimationFrame(() => toy.focus({ preventScroll: true }));
}

function restoreToyFocusAfterPointer(event) {
  if (event.detail > 0) focusToy();
}

function enterGame() {
  if (portalButton.disabled) return;
  entered = true;
  body.dataset.entry = "game";
  portalGate.setAttribute("aria-hidden", "true");
  audio.setActive(phase === "active");
  if (!audio.muted) audio.prime();
  toy.setAttribute("tabindex", "0");
  focusToy();
  inputHint.textContent = phase === "active"
    ? "Click or press an ordinary key to place a pin · ESC stays with the browser"
    : "This round has ended · closing the time portal";
  if (phase === "complete" || phase === "error") startCloseSequence();
}

function shufflePalette() {
  let next = paletteIndex;
  while (next === paletteIndex) next = Math.floor(Math.random() * palettes.length);
  paletteIndex = next;
  const palette = palettes[paletteIndex];
  document.documentElement.style.setProperty("--sun", palette.background);
  document.documentElement.style.setProperty("--ink", palette.ink);
  document.documentElement.style.setProperty("--accent", palette.accent);
  document.documentElement.style.setProperty("--cream", palette.cream);
  document.documentElement.style.setProperty("--ball-filter", palette.filter);
  body.dataset.palette = palette.name;
  liveCount.textContent = `Palette changed to ${palette.name}`;
}

portalButton.addEventListener("click", enterGame);

toy.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button") || event.target.closest(".portal-gate") || event.target.closest(".completion")) return;
  if (event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  addPin();
});

toy.addEventListener("contextmenu", (event) => {
  if (entered && phase === "active") event.preventDefault();
});

toy.addEventListener("keydown", (event) => {
  if (event.target.closest("button")) return;
  if (
    event.metaKey
    || event.ctrlKey
    || event.altKey
    || event.key === "Tab"
    || event.key === "Escape"
    || event.key === "F11"
  ) return;
  event.preventDefault();
  addPin();
});

soundToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  const muted = audio.setMuted(!audio.muted);
  soundToggle.setAttribute("aria-pressed", String(muted));
  soundToggle.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
  soundLabel.textContent = muted ? "Muted" : "Sound";
  if (!muted) audio.prime();
  restoreToyFocusAfterPointer(event);
});

paletteToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  shufflePalette();
  restoreToyFocusAfterPointer(event);
});

closeNow.addEventListener("click", requestClose);

async function connect() {
  if (!token) {
    applyState({ phase: "error", activeRuns: 0, taskTitle: "Missing launch signal" });
    portalTitle.textContent = "No task connection";
    portalSubtitle.textContent = "Open the game again from the Needlewhile skill";
    portalButton.disabled = true;
    return;
  }

  try {
    const response = await fetch(`/api/state?token=${token}`);
    if (!response.ok) throw new Error("unauthorized");
    applyState(await response.json());
  } catch {
    applyState({ phase: "error", activeRuns: 0, taskTitle: "Connection lost" });
    portalTitle.textContent = "The time portal lost its connection";
    portalSubtitle.textContent = "Open the game again from the Needlewhile skill";
    portalButton.disabled = true;
    return;
  }

  events = new EventSource(`/api/events?token=${token}`);
  events.addEventListener("state", (event) => {
    try {
      applyState(JSON.parse(event.data));
    } catch {
      // Keep the last valid local state when a malformed event arrives.
    }
  });
}

window.addEventListener("beforeunload", () => {
  events?.close();
  audio.destroy();
  globalThis.clearInterval(elapsedTimer);
  globalThis.clearInterval(closeTimer);
});

updateCount();
updateElapsed();
elapsedTimer = globalThis.setInterval(updateElapsed, 1_000);
connect();
