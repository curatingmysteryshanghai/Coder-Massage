const DEFAULT_TEXTURE_SECONDS = 0.16;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function randomUnit(random) {
  const value = Number(random());
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}

function randomBetween(random, minimum, maximum) {
  return minimum + (maximum - minimum) * randomUnit(random);
}

function decibelsToGain(decibels) {
  return 10 ** (decibels / 20);
}

export function cadenceGain(cadenceMs) {
  if (!Number.isFinite(cadenceMs) || cadenceMs >= 90) return 1;
  const compression = 1 - clamp(cadenceMs / 90, 0, 1);
  return decibelsToGain(-1.6 * compression);
}

export function buildFiberTexture(length, random = Math.random) {
  const size = Math.max(1, Math.floor(length));
  const samples = new Float32Array(size);
  let brown = 0;
  let pink = 0;

  for (let index = 0; index < size; index += 1) {
    const progress = index / Math.max(1, size - 1);
    const white = randomUnit(random) * 2 - 1;
    brown = brown * 0.955 + white * 0.045;
    pink = pink * 0.79 + white * 0.21;
    const grain = randomUnit(random) > 0.982 ? (randomUnit(random) * 2 - 1) * 0.38 : 0;
    const attack = Math.min(1, progress / 0.035);
    const decay = Math.exp(-progress * 1.85);
    const sample = (brown * 1.15 + pink * 0.48 + white * 0.09 + grain) * attack * decay;
    samples[index] = clamp(sample, -0.86, 0.86);
  }

  return samples;
}

function setParam(param, value, atTime) {
  param.cancelScheduledValues(atTime);
  param.setValueAtTime(Math.max(0.0001, param.value || 0.0001), atTime);
  param.exponentialRampToValueAtTime(Math.max(0.0001, value), atTime + 0.012);
}

export function createNeedleAudio({
  maxVoices = 8,
  random = Math.random,
  initialMuted = false,
  AudioContextClass,
} = {}) {
  let context = null;
  let masterGain = null;
  let compressor = null;
  let textures = [];
  let textureIndex = 0;
  let muted = Boolean(initialMuted);
  let active = true;
  const voices = new Set();

  function targetMasterGain() {
    return muted || !active ? 0.0001 : 0.82;
  }

  function prime() {
    if (!context) {
      const Context = AudioContextClass ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) return null;

      context = new Context();
      masterGain = context.createGain();
      compressor = context.createDynamicsCompressor();
      masterGain.gain.value = targetMasterGain();
      compressor.threshold.value = -18;
      compressor.knee.value = 14;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;
      masterGain.connect(compressor).connect(context.destination);

      const frameCount = Math.floor(context.sampleRate * DEFAULT_TEXTURE_SECONDS);
      textures = Array.from({ length: 8 }, () => {
        const buffer = context.createBuffer(1, frameCount, context.sampleRate);
        buffer.copyToChannel(buildFiberTexture(frameCount, random), 0);
        return buffer;
      });
    }

    if (context.state === "suspended") context.resume().catch(() => {});
    return context;
  }

  function fadeVoice(voice, fadeMs = 14) {
    if (!context || voice.stopping) return;
    voice.stopping = true;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value || 0.0001), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000);
    globalThis.setTimeout(() => {
      for (const source of voice.sources) {
        try {
          source.stop();
        } catch {
          // A source that already ended needs no cleanup.
        }
      }
      voices.delete(voice);
    }, fadeMs + 8);
  }

  function enforceVoiceLimit() {
    while (voices.size >= maxVoices) {
      const oldest = voices.values().next().value;
      if (!oldest) break;
      fadeVoice(oldest, 12);
      voices.delete(oldest);
    }
  }

  function connectNoiseLayer(voice, {
    delay = 0,
    duration,
    offset = 0,
    playbackRate = 1,
    highpass,
    bandpass,
    q = 0.7,
    envelope,
  }) {
    const now = context.currentTime + delay;
    const source = context.createBufferSource();
    const high = context.createBiquadFilter();
    const band = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = textures[textureIndex % textures.length];
    textureIndex += 1;
    source.playbackRate.value = playbackRate;
    high.type = "highpass";
    high.frequency.value = highpass;
    high.Q.value = 0.35;
    band.type = "bandpass";
    band.frequency.value = bandpass;
    band.Q.value = q;
    gain.gain.setValueAtTime(0.0001, now);
    for (const [time, value] of envelope) {
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, value), now + time);
    }
    source.connect(high).connect(band).connect(gain).connect(voice.gain);
    source.start(now, offset, duration);
    source.stop(now + duration + 0.008);
    voice.sources.add(source);
  }

  function trigger({ cadenceMs = Number.POSITIVE_INFINITY } = {}) {
    if (muted || !active) return false;
    const audio = prime();
    if (!audio || textures.length === 0) return false;

    enforceVoiceLimit();
    const voiceGain = audio.createGain();
    voiceGain.gain.value = cadenceGain(cadenceMs);
    voiceGain.connect(masterGain);
    const voice = { gain: voiceGain, sources: new Set(), stopping: false };
    voices.add(voice);

    const rate = randomBetween(random, 0.975, 1.025);
    const frequencyShift = randomBetween(random, 0.92, 1.08);
    const rustleDuration = randomBetween(random, 0.082, 0.112);

    connectNoiseLayer(voice, {
      duration: 0.014,
      offset: randomBetween(random, 0, 0.012),
      playbackRate: rate,
      highpass: 1450,
      bandpass: randomBetween(random, 2850, 3900),
      q: 0.9,
      envelope: [[0.0025, 0.036], [0.013, 0.0001]],
    });

    connectNoiseLayer(voice, {
      delay: 0.002,
      duration: 0.042,
      offset: randomBetween(random, 0.015, 0.035),
      playbackRate: rate,
      highpass: 330,
      bandpass: randomBetween(random, 720, 1180),
      q: 0.58,
      envelope: [[0.006, 0.06], [0.038, 0.0001]],
    });

    connectNoiseLayer(voice, {
      delay: 0.01,
      duration: rustleDuration,
      offset: randomBetween(random, 0.025, 0.045),
      playbackRate: rate,
      highpass: 690,
      bandpass: 1820 * frequencyShift,
      q: 0.48,
      envelope: [
        [0.005, 0.034],
        [0.025, 0.071],
        [0.046, 0.029],
        [Math.min(0.071, rustleDuration * 0.72), 0.052],
        [rustleDuration, 0.0001],
      ],
    });

    const cleanupDelay = Math.ceil((rustleDuration + 0.045) * 1000);
    globalThis.setTimeout(() => voices.delete(voice), cleanupDelay);
    return true;
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    if (context && masterGain) setParam(masterGain.gain, targetMasterGain(), context.currentTime);
    return muted;
  }

  function stopAll({ fadeMs = 18 } = {}) {
    for (const voice of [...voices]) fadeVoice(voice, fadeMs);
  }

  function setActive(nextActive) {
    active = Boolean(nextActive);
    if (!active) stopAll({ fadeMs: 18 });
    if (context && masterGain) setParam(masterGain.gain, targetMasterGain(), context.currentTime);
    return active;
  }

  async function destroy() {
    stopAll({ fadeMs: 8 });
    if (context && context.state !== "closed") {
      await context.close().catch(() => {});
    }
    context = null;
    masterGain = null;
    compressor = null;
    textures = [];
  }

  return {
    prime,
    trigger,
    setMuted,
    setActive,
    stopAll,
    destroy,
    get muted() {
      return muted;
    },
    get supported() {
      return Boolean(AudioContextClass ?? globalThis.AudioContext ?? globalThis.webkitAudioContext);
    },
  };
}
