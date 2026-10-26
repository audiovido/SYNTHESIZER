/**
 * SY-1 Engine — Audio Context & Shared FX Bus
 */

export interface SynthFXBus {
  ctx: AudioContext;
  input: GainNode;
  drive: WaveShaperNode;
  driveComp: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  delay: DelayNode;
  fb: GainNode;
  delayTone: BiquadFilterNode;
  delayWet: GainNode;
  reverb: ConvolverNode;
  revWet: GainNode;
  sum: GainNode;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  analyser: AnalyserNode;
  chorusWet: GainNode;
  chorusLfo: OscillatorNode;
  chorusDepthL: GainNode;
  chorusDepthR: GainNode;
  revSizeApplied: number;
  revTimer?: ReturnType<typeof setTimeout>;
}

let audioCtx: AudioContext | null = null;

export function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      audioCtx = new AC({ latencyHint: "interactive" });
    }
  }
  return audioCtx!;
}

export function getAudioCtxIfAny(): AudioContext | null {
  return audioCtx;
}

let unlockedOnce = false;

/**
 * Wake the audio context. Browsers only allow this inside a user gesture, so it
 * is called from every touch, click and key press (see installAudioUnlock) and
 * the very first key you play makes sound: no separate "start audio" button.
 */
export function unlockAudio(): void {
  // iOS 17+: play through the speaker even when the ring/silent switch is on silent
  try {
    const nav = navigator as any;
    if (nav.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback";
  } catch (e) {}
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state !== "running") {
    ctx.resume().catch(() => {});
  }
  if (!unlockedOnce) {
    // Older iOS only unlocks after a sound is started inside the gesture: play one silent sample
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
      unlockedOnce = true;
    } catch (e) {}
  }
}

/** Resume audio on any gesture anywhere on the page (and again after the OS suspends it). */
export function installAudioUnlock(onGesture: () => void): void {
  const handler = () => {
    const ctx = getAudioCtxIfAny();
    if (ctx && ctx.state === "running" && unlockedOnce) return;
    onGesture();
  };
  ["pointerdown", "touchstart", "touchend", "mousedown", "click", "keydown"].forEach((type) => {
    window.addEventListener(type, handler, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    const ctx = getAudioCtxIfAny();
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  });
}

const synthBuses = new WeakMap<AudioContext, SynthFXBus>();
let synthNoiseBuffer: AudioBuffer | null = null;

export function getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!synthNoiseBuffer || synthNoiseBuffer.sampleRate !== ctx.sampleRate) {
    synthNoiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = synthNoiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }
  }
  return synthNoiseBuffer;
}

export function makeReverbImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
  }
  return buf;
}

export function makeDriveCurve(amount: number): Float32Array {
  const k = amount * 60;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export function getSynthBus(ctx: AudioContext, synthPatch: Record<string, any>): SynthFXBus {
  let bus = synthBuses.get(ctx);
  if (bus) return bus;

  const p = synthPatch;
  const input = ctx.createGain();
  const drive = ctx.createWaveShaper();
  drive.curve = makeDriveCurve(p.drive) as any;
  drive.oversample = "2x";

  const driveComp = ctx.createGain();
  driveComp.gain.value = 1 / (1 + p.drive * 1.5);

  const eqLow = ctx.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.value = 220;
  eqLow.gain.value = p.eqLow;

  const eqMid = ctx.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.value = 1100;
  eqMid.Q.value = 0.8;
  eqMid.gain.value = p.eqMid;

  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.value = 4200;
  eqHigh.gain.value = p.eqHigh;

  input.connect(drive);
  drive.connect(driveComp);
  driveComp.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);

  const sum = ctx.createGain();
  eqHigh.connect(sum); // dry

  const delay = ctx.createDelay(2);
  delay.delayTime.value = p.delayTime;
  const fb = ctx.createGain();
  fb.gain.value = p.delayFb;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 4500;
  const delayWet = ctx.createGain();
  delayWet.gain.value = p.delayMix * 0.7;

  eqHigh.connect(delay);
  delay.connect(delayTone);
  delayTone.connect(fb);
  fb.connect(delay);
  delayTone.connect(delayWet);
  delayWet.connect(sum);

  // Stereo chorus: two short modulated delays, LFO in opposite phase on L and R
  const chorusIn = ctx.createGain();
  eqHigh.connect(chorusIn);
  const dl = ctx.createDelay(0.05);
  const dr = ctx.createDelay(0.05);
  dl.delayTime.value = 0.012;
  dr.delayTime.value = 0.012;
  chorusIn.connect(dl);
  chorusIn.connect(dr);
  const chorusLfo = ctx.createOscillator();
  chorusLfo.type = "triangle";
  chorusLfo.frequency.value = p.chorusRate ?? 0.6;
  const chorusDepthL = ctx.createGain();
  const chorusDepthR = ctx.createGain();
  chorusDepthL.gain.value = 0.004 * (p.chorusDepth ?? 0.5);
  chorusDepthR.gain.value = -0.004 * (p.chorusDepth ?? 0.5);
  chorusLfo.connect(chorusDepthL);
  chorusLfo.connect(chorusDepthR);
  chorusDepthL.connect(dl.delayTime);
  chorusDepthR.connect(dr.delayTime);
  chorusLfo.start();
  const chorusMerge = ctx.createChannelMerger(2);
  dl.connect(chorusMerge, 0, 0);
  dr.connect(chorusMerge, 0, 1);
  const chorusWet = ctx.createGain();
  chorusWet.gain.value = (p.chorusMix ?? 0) * 0.9;
  chorusMerge.connect(chorusWet);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, p.revSize);
  const revWet = ctx.createGain();
  revWet.gain.value = p.revMix * 0.9;

  eqHigh.connect(reverb);
  reverb.connect(revWet);
  revWet.connect(sum);

  const master = ctx.createGain();
  master.gain.value = p.volume;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;

  chorusWet.connect(sum);
  sum.connect(master);
  master.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  bus = {
    ctx,
    input,
    drive,
    driveComp,
    eqLow,
    eqMid,
    eqHigh,
    delay,
    fb,
    delayTone,
    delayWet,
    reverb,
    revWet,
    sum,
    master,
    limiter,
    analyser,
    chorusWet,
    chorusLfo,
    chorusDepthL,
    chorusDepthR,
    revSizeApplied: p.revSize
  };

  synthBuses.set(ctx, bus);
  return bus;
}
