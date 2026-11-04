/**
 * SY-1 Engine — Audio Context & Shared FX Bus
 */

interface ReverbComb {
  delay: DelayNode;
  damp: AudioNode;
  fb: GainNode;
  delaySec: number;
}

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
  delayHP: BiquadFilterNode;
  delaySat: WaveShaperNode;
  delayWet: GainNode;
  reverbCombs: ReverbComb[];
  revWet: GainNode;
  sum: GainNode;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  /** Soft clipper after the limiter: transparent below 0.9, never above 1.0 (same curve as native fx.hpp). */
  clipIn: GainNode;
  clip: WaveShaperNode;
  /** Final output after the soft clipper (unity): the recorder taps here, before the master volume. */
  tap: GainNode;
  /** App master volume (one knob for every machine). Unity = the sound exactly as designed. */
  out: GainNode;
  analyser: AnalyserNode;
  chorusWet: GainNode;
  chorusLfo: OscillatorNode;
  chorusDepthL: GainNode;
  chorusDepthR: GainNode;
  revSizeApplied: number;
  dampPeakGain: number;
  /** Everything that feeds delay, chorus and reverb (main signal via mainToFx, plus sendIn). */
  fxIn: GainNode;
  /** Main signal into the effects: 1 for synths, 0 on drum machines (voices use per-voice sends). */
  mainToFx: GainNode;
  /** Effects-only input (no dry path): per-voice drum sends. */
  sendIn: GainNode;
}

let audioCtx: AudioContext | null = null;

// ------------------------------------------------- master volume & output ----
const VOL_KEY = "sy1.masterVol";
const SINK_KEY = "sy1.outputDevice";
let masterVol = 1;
let outputDevice = "";
try {
  const v = localStorage.getItem(VOL_KEY);
  if (v !== null && isFinite(Number(v))) masterVol = Math.max(0, Math.min(1, Number(v)));
  outputDevice = localStorage.getItem(SINK_KEY) || "";
} catch (e) {}
const volListeners = new Set<(v: number) => void>();

/** Master volume 0..1 as a knob position; the gain is position squared (0.5 = -12 dB). */
export function getMasterVolume(): number {
  return masterVol;
}
export function masterGainFor(v: number): number {
  return v * v;
}
export function setMasterVolume(v: number): void {
  const next = Math.max(0, Math.min(1, v));
  if (next === masterVol) return;
  masterVol = next;
  try { localStorage.setItem(VOL_KEY, String(next)); } catch (e) {}
  const b = audioCtx ? synthBuses.get(audioCtx) : undefined;
  if (b && audioCtx) b.out.gain.setTargetAtTime(masterGainFor(next), audioCtx.currentTime, 0.015);
  volListeners.forEach((cb) => cb(next));
}
export function onMasterVolumeChange(cb: (v: number) => void): () => void {
  volListeners.add(cb);
  return () => volListeners.delete(cb);
}

/** True when this browser can send the sound to a chosen output device (Chrome / Edge 110+). */
export function canChooseOutput(): boolean {
  return typeof AudioContext !== "undefined" && typeof (AudioContext.prototype as any).setSinkId === "function";
}
export function getOutputDevice(): string {
  return outputDevice;
}
/** Send the whole app to an audio output ("" = system default), e.g. BlackHole / Loopback / VB-Cable for a DAW. */
export async function setOutputDevice(id: string): Promise<boolean> {
  outputDevice = id;
  try { localStorage.setItem(SINK_KEY, id); } catch (e) {}
  return applyOutputDevice();
}
async function applyOutputDevice(): Promise<boolean> {
  const ctx = audioCtx as any;
  if (!ctx || typeof ctx.setSinkId !== "function") return false;
  try {
    if ((ctx.sinkId || "") !== outputDevice) await ctx.setSinkId(outputDevice);
    return true;
  } catch (e) {
    return false;
  }
}

export function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      audioCtx = new AC({ latencyHint: "interactive" });
      if (outputDevice) applyOutputDevice();
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

/** Gentle fixed tanh soft-clip used in the delay feedback loop so hot repeats warm up instead of distorting harshly. */
const CLIP_RANGE = 4;
/** soft(x): identity up to 0.9, then 0.9 + 0.1*tanh((|x|-0.9)/0.1): never above 1.0. Over x in +-CLIP_RANGE. */
function makeSoftClipCurve(): Float32Array {
  const n = 8193; // odd: exact 0 in the middle
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * CLIP_RANGE;
    const a = Math.abs(x);
    const y = a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1);
    c[i] = x < 0 ? -y : y;
  }
  return c;
}

function makeTanhCurve(): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1.6; // fixed, moderate drive — not user-controllable
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

/** Freeverb-style comb delay lengths (seconds, derived from the classic 44.1kHz sample counts) and allpass delays. */
const REVERB_COMB_DELAYS_SEC = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((s) => s / 44100);
const REVERB_ALLPASS_DELAYS_SEC = [556, 441, 341, 225].map((s) => s / 44100);
/**
 * Comb damping: a ONE-POLE low-pass, as in the original Freeverb. Its gain falls
 * monotonically from exactly 1 at DC, so every lower frequency rings at least as
 * long as every higher one. (A biquad here had a passband bump near 2-3 kHz: once
 * the feedback was scaled for that bump, the lows died early and the tail turned
 * into a whistle around 2.5 kHz on every release.)
 */
const REVERB_COMB_DAMP_HZ = 4500;

function makeDamp(ctx: BaseAudioContext): AudioNode {
  const d = Math.exp((-2 * Math.PI * REVERB_COMB_DAMP_HZ) / ctx.sampleRate);
  if (typeof (ctx as any).createIIRFilter === "function") return ctx.createIIRFilter([1 - d], [1, -d]);
  const b = ctx.createBiquadFilter(); // fallback: no resonance
  b.type = "lowpass";
  b.frequency.value = REVERB_COMB_DAMP_HZ;
  b.Q.value = -6;
  return b;
}
const REVERB_ALLPASS_G = 0.5;
const REVERB_FB_MAX = 0.97;

/**
 * Web Audio's biquad lowpass does not stay <=1 near its cutoff at this frequency/sample-rate ratio
 * (bilinear-transform warping) — it has a real passband bump regardless of Q. Rather than guess the
 * size of that bump, measure it once per AudioContext with the filter's own getFrequencyResponse,
 * so the comb feedback can be compensated by the EXACT value and the reverb can run as close to its
 * requested decay time as safely possible (not an over-cautious fixed guess).
 */
function measureDampPeakGain(ctx: AudioContext): number {
  const probe = makeDamp(ctx) as BiquadFilterNode | IIRFilterNode;
  const n = 300;
  const freqs = new Float32Array(n);
  const nyquist = ctx.sampleRate / 2;
  for (let i = 0; i < n; i++) freqs[i] = (i / n) * nyquist;
  const mag = new Float32Array(n);
  const phase = new Float32Array(n);
  probe.getFrequencyResponse(freqs, mag, phase);
  let peak = 1;
  for (let i = 0; i < n; i++) if (Number.isFinite(mag[i]) && mag[i] > peak) peak = mag[i];
  return peak * 1.01; // the one-pole peaks at exactly 1 (DC); 1% margin
}

/** Per-comb feedback gain that targets an approximate RT60 (seconds) for that comb's own delay length,
 *  compensated by dampPeakGain so the damping filter's passband bump can never push the loop into runaway. */
function combFeedbackForRT60(delaySec: number, rt60: number, dampPeakGain: number): number {
  const t = Math.max(0.05, rt60);
  const g = Math.pow(10, (-3 * delaySec) / t) / dampPeakGain;
  return Math.min(REVERB_FB_MAX, Math.max(0, g));
}

/** input -> N parallel damped combs (feedback = f(revSize)) -> M series allpass diffusers -> output. No audio files. */
function buildReverb(ctx: AudioContext, input: AudioNode, revSize: number): { combs: ReverbComb[]; output: AudioNode; dampPeakGain: number } {
  const dampPeakGain = measureDampPeakGain(ctx);
  const combInputScale = ctx.createGain();
  combInputScale.gain.value = 0.14; // keeps 8 summed combs from building up too hot (the one-pole damping keeps more low end ringing than the old biquad)
  input.connect(combInputScale);

  const combSum = ctx.createGain();
  const combs: ReverbComb[] = REVERB_COMB_DELAYS_SEC.map((delaySec) => {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = delaySec;
    const damp = makeDamp(ctx);
    // a slow, tiny wobble of each comb's length (different rate per comb) smears its fixed
    // resonances, so long tails stay smooth instead of ringing on single metallic notes
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.13 + 0.11 * (REVERB_COMB_DELAYS_SEC.indexOf(delaySec) % 8);
    const wobAmt = ctx.createGain();
    wobAmt.gain.value = 0.00035; // ±0.35 ms
    wob.connect(wobAmt);
    wobAmt.connect(delay.delayTime);
    wob.start();
    const fb = ctx.createGain();
    fb.gain.value = combFeedbackForRT60(delaySec, revSize, dampPeakGain);

    combInputScale.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay); // feedback loop (sums with combInputScale at the delay's input)
    damp.connect(combSum);

    return { delay, damp, fb, delaySec };
  });

  // Series Schroeder allpass diffusers: y = -g*u + z, u = x + g*z, z = delay(u)
  let stage: AudioNode = combSum;
  for (const delaySec of REVERB_ALLPASS_DELAYS_SEC) {
    const u = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = delaySec;
    const fbGain = ctx.createGain();
    fbGain.gain.value = REVERB_ALLPASS_G;
    const negGain = ctx.createGain();
    negGain.gain.value = -REVERB_ALLPASS_G;
    const out = ctx.createGain();

    stage.connect(u);
    u.connect(delay);
    delay.connect(fbGain);
    fbGain.connect(u); // feedback: g*z back into u
    u.connect(negGain); // -g*u branch
    negGain.connect(out);
    delay.connect(out); // z branch
    stage = out;
  }

  return { combs, output: stage, dampPeakGain };
}

/** Smoothly re-targets every comb's feedback gain for a new revSize (RT60-ish, seconds). No buffer rebuild, no debounce needed. */
export function setReverbSize(bus: SynthFXBus, revSize: number): void {
  const ctx = bus.ctx;
  const now = ctx.currentTime;
  bus.reverbCombs.forEach((c) => {
    c.fb.gain.setTargetAtTime(combFeedbackForRT60(c.delaySec, revSize, bus.dampPeakGain), now, 0.05);
  });
  bus.revSizeApplied = revSize;
}

// Whether the main signal feeds delay/chorus/reverb (synths) or only per-voice sends do (drum machines).
let mainFxOn = true;

/** Drum machines turn this off so reverb and delay come only from per-voice sends. */
export function setMainToFx(on: boolean): void {
  mainFxOn = on;
  const ctx = audioCtx;
  const b = ctx ? synthBuses.get(ctx) : undefined;
  if (b && ctx) b.mainToFx.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
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

  // Effects input: the main signal (unless a drum machine turns it off) plus per-voice sends
  const fxIn = ctx.createGain();
  const mainToFx = ctx.createGain();
  mainToFx.gain.value = mainFxOn ? 1 : 0;
  const sendIn = ctx.createGain();
  eqHigh.connect(mainToFx);
  mainToFx.connect(fxIn);
  sendIn.connect(fxIn);

  const delay = ctx.createDelay(2);
  delay.delayTime.value = p.delayTime;
  const fb = ctx.createGain();
  fb.gain.value = Math.min(0.95, p.delayFb);
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 4500;
  delayTone.Q.value = Math.SQRT1_2; // flat response — no resonant peak inside the feedback loop
  const delayHP = ctx.createBiquadFilter();
  delayHP.type = "highpass";
  delayHP.frequency.value = 180; // classic tape-delay feedback EQ: trims mud before it recirculates
  delayHP.Q.value = Math.SQRT1_2;
  const delaySat = ctx.createWaveShaper();
  delaySat.curve = makeTanhCurve() as any;
  delaySat.oversample = "2x";
  const delayWet = ctx.createGain();
  delayWet.gain.value = p.delayMix * 0.7;

  fxIn.connect(delay);
  delay.connect(delayTone);
  delayTone.connect(delayHP);
  delayHP.connect(delayWet); // wet tap: filtered, not yet saturated by the feedback-loop drive
  delayWet.connect(sum);
  delayHP.connect(delaySat);
  delaySat.connect(fb);
  fb.connect(delay); // feedback loop

  // Stereo chorus: two short modulated delays, LFO in opposite phase on L and R
  const chorusIn = ctx.createGain();
  fxIn.connect(chorusIn);
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

  const revWet = ctx.createGain();
  revWet.gain.value = p.revMix * 0.9;

  const { combs: reverbCombs, output: reverbOut, dampPeakGain } = buildReverb(ctx, fxIn, p.revSize);
  reverbOut.connect(revWet);
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
  // Soft clipper: the limiter's 3 ms attack lets the sharpest transients (acoustic drums)
  // slip past; this catches them smoothly instead of hard digital clipping. Input is
  // pre-scaled by 1/4 so the curve covers +-4 (a WaveShaper clamps beyond +-1).
  const clipIn = ctx.createGain();
  clipIn.gain.value = 1 / CLIP_RANGE;
  const clip = ctx.createWaveShaper();
  clip.curve = makeSoftClipCurve() as any;
  clip.oversample = "none"; // oversampling's filters ring ~5% past the curve; "none" keeps the 1.0 ceiling exact
  limiter.connect(clipIn);
  clipIn.connect(clip);
  const tap = ctx.createGain();
  const out = ctx.createGain();
  out.gain.value = masterGainFor(masterVol);
  clip.connect(tap);
  tap.connect(out);
  out.connect(analyser);
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
    delayHP,
    delaySat,
    delayWet,
    reverbCombs,
    revWet,
    sum,
    master,
    limiter,
    tap,
    out,
    analyser,
    chorusWet,
    chorusLfo,
    chorusDepthL,
    chorusDepthR,
    revSizeApplied: p.revSize,
    dampPeakGain,
    fxIn,
    mainToFx,
    sendIn,
    clipIn,
    clip
  };

  synthBuses.set(ctx, bus);
  return bus;
}
