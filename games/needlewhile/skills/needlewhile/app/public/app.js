import { createNeedleAudio } from "/needle-audio.js";

const body = document.body;
const toy = document.querySelector("#toy");
const ball = document.querySelector("#wool-ball");
const pinLayer = document.querySelector("#pin-layer");
const statusText = document.querySelector("#status-text");
const pinCountText = document.querySelector("#pin-count");
const inputHint = document.querySelector("#input-hint");
const liveCount = document.querySelector("#live-count");
const soundToggle = document.querySelector("#sound-toggle");
const soundLabel = document.querySelector("#sound-label");

const token = location.hash.slice(1).replace(/[^a-f0-9]/gi, "");
const pinSprites = [
  "/assets/pin-coral.png",
  "/assets/pin-cream.png",
  "/assets/pin-mustard.png",
];
const audio = createNeedleAudio();

let phase = "idle";
let activeRuns = 0;
let pinCount = 0;
let lastInputAt = 0;
let impactTimer = null;
let events = null;

function copyForState(state) {
  if (state.phase === "active") {
    return state.activeRuns > 1
      ? [`${state.activeRuns} AIS ARE WORKING`, "ANY KEY / ANY CLICK"]
      : ["AI IS WORKING", "ANY KEY / ANY CLICK"];
  }
  if (state.phase === "complete") return ["AI IS DONE", "THIS ROUND IS COMPLETE"];
  if (state.phase === "error") return ["AI STOPPED", "THIS ROUND IS OVER"];
  return ["WAITING FOR AI", "ANY KEY / ANY CLICK"];
}

function countLabel(value) {
  return String(value).padStart(3, "0");
}

function updateCount() {
  pinCountText.textContent = countLabel(pinCount);
  liveCount.textContent = `已经扎下 ${pinCount} 根针`;
}

function clearPins() {
  pinLayer.replaceChildren();
  pinCount = 0;
  updateCount();
}

function applyState(state) {
  const previous = phase;
  phase = state.phase ?? "idle";
  activeRuns = state.activeRuns ?? 0;
  body.dataset.phase = phase;
  audio.setActive(phase === "active");

  if (phase === "active" && previous !== "active") {
    clearPins();
    requestAnimationFrame(() => toy.focus({ preventScroll: true }));
  }

  const [status, hint] = copyForState({ phase, activeRuns });
  statusText.textContent = status;
  inputHint.textContent = hint;
}

function pinCoordinates() {
  const toyRect = toy.getBoundingClientRect();
  const ballRect = ball.getBoundingClientRect();
  const centerX = ballRect.left + ballRect.width * 0.5;
  const centerY = ballRect.top + ballRect.height * 0.51;
  const theta = Math.random() * Math.PI * 2;
  const radial = 0.18 + Math.random() ** 0.72 * 0.31;
  const targetX = centerX + Math.cos(theta) * ballRect.width * radial;
  const targetY = centerY + Math.sin(theta) * ballRect.height * radial * 0.94;
  const outward = Math.atan2(targetY - centerY, targetX - centerX) * (180 / Math.PI) + 90;
  const angle = outward + (Math.random() - 0.5) * 18;
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
  const desiredLength = ballRect.width * (0.35 + Math.random() * 0.16);
  const pinLength = Math.max(44, Math.min(desiredLength, Math.min(xRoom, yRoom) - 34));

  return {
    x: targetX - toyRect.left,
    y: targetY - toyRect.top,
    angle,
    length: pinLength,
  };
}

function agePins() {
  for (const pin of [...pinLayer.children]) {
    const age = pinCount - Number(pin.dataset.born ?? pinCount);
    let sink = 0;
    if (age > 40) sink = 90;
    else if (age > 24) sink = 42 + ((age - 24) / 16) * 36;
    else if (age > 10) sink = ((age - 10) / 14) * 42;
    pin.style.setProperty("--sink", `${sink}%`);

    if (age > 64 && pin.dataset.retiring !== "true") {
      pin.dataset.retiring = "true";
      pin.classList.add("retiring");
      globalThis.setTimeout(() => pin.remove(), 280);
    }
  }
}

function makePin({ x, y, angle, length }) {
  const pin = document.createElement("span");
  const sprite = document.createElement("img");
  pin.className = "pin";
  pin.dataset.born = String(pinCount);
  pin.style.left = `${(x / toy.clientWidth) * 100}%`;
  pin.style.top = `${(y / toy.clientHeight) * 100}%`;
  pin.style.setProperty("--angle", `${angle}deg`);
  pin.style.setProperty("--pin-length", `${length}px`);
  sprite.className = "pin-sprite";
  sprite.src = pinSprites[Math.floor(Math.random() * pinSprites.length)];
  sprite.alt = "";
  sprite.draggable = false;
  pin.append(sprite);
  pinLayer.append(pin);
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
  if (phase !== "active") return;
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

toy.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  if (event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  addPin();
});

toy.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

toy.addEventListener("keydown", (event) => {
  if (event.target.closest("button")) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab") return;
  event.preventDefault();
  addPin();
});

soundToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  const muted = audio.setMuted(!audio.muted);
  soundToggle.setAttribute("aria-pressed", String(muted));
  soundToggle.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");
  soundLabel.textContent = muted ? "SOUND OFF" : "SOUND ON";
  if (!muted) audio.prime();
});

async function connect() {
  if (!token) {
    applyState({ phase: "error", activeRuns: 0 });
    statusText.textContent = "NO START SIGNAL";
    inputHint.textContent = "OPEN FROM NEEDLEWHILE";
    return;
  }

  try {
    const response = await fetch(`/api/state?token=${token}`);
    if (!response.ok) throw new Error("unauthorized");
    applyState(await response.json());
  } catch {
    applyState({ phase: "error", activeRuns: 0 });
    statusText.textContent = "AI CONNECTION LOST";
    inputHint.textContent = "REOPEN NEEDLEWHILE";
    return;
  }

  events = new EventSource(`/api/events?token=${token}`);
  events.addEventListener("state", (event) => {
    try {
      applyState(JSON.parse(event.data));
    } catch {
      // Ignore malformed local events and keep the last valid state.
    }
  });
}

window.addEventListener("beforeunload", () => {
  events?.close();
  audio.destroy();
});

updateCount();
connect();
