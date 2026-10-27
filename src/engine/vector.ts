/**
 * SY-1 Engine — Vector morph engine bridge (main thread) for Nishapur.
 *
 * Loads the "sy1-vector" AudioWorklet processor, connects it to the shared FX
 * bus, manages the DRAWN orbit path (max 256 points), and provides an
 * audio-clock-driven Classic Web Audio vector voice fallback so notes play
 * with full 4-corner vector morphing both in HQ and Classic modes (and on the
 * very first tap while the worklet module loads).
 */

import processorUrl from "./worklet/vector-processor.ts?worker&url";
import { getAudioCtxIfAny, getSharedNoiseBuffer, getSynthBus } from "./bus";
import { getEngine } from "./hq";
import { orbitSyncDivForRate, SynthPatch } from "./params";
import { getTempo } from "./tempo";
import {
  activeSynthVoices,
  getVoiceModWheel,
  getVoicePitchBend,
  SYNTH_MAX_VOICES,
  SynthVoice
} from "./voice";

type VectorState = "idle" | "loading" | "ready" | "failed";

let state: VectorState = "idle";
let node: AudioWorkletNode | null = null;
let nextId = 1;

const DRAWN_STORAGE_KEY = "sy1.m.nishapur.drawnPath";
const MAX_DRAWN_POINTS = 256;

// Default 64-point 3-petal star loop
function makeDefaultDrawnPath(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 64; i++) {
    const a = (2 * Math.PI * i) / 64;
    const r = 0.28 + 0.14 * Math.cos(3 * a);
    pts.push([
      Math.max(0.04, Math.min(0.96, 0.5 + Math.cos(a) * r)),
      Math.max(0.04, Math.min(0.96, 0.5 + Math.sin(a) * r))
    ]);
  }
  return pts;
}

let drawnPath: [number, number][] = makeDefaultDrawnPath();
let drawnCx = 0.5;
let drawnCy = 0.5;

function recomputeDrawnCenter(): void {
  if (!drawnPath.length) {
    drawnCx = 0.5;
    drawnCy = 0.5;
    return;
  }
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < drawnPath.length; i++) {
    sx += drawnPath[i][0];
    sy += drawnPath[i][1];
  }
  drawnCx = sx / drawnPath.length;
  drawnCy = sy / drawnPath.length;
}

try {
  const raw = JSON.parse(localStorage.getItem(DRAWN_STORAGE_KEY) || "null");
  if (Array.isArray(raw) && raw.length >= 2) {
    drawnPath = raw
      .slice(0, MAX_DRAWN_POINTS)
      .map((p: any) => [
        Math.max(0, Math.min(1, Number(p?.[0]) || 0.5)),
        Math.max(0, Math.min(1, Number(p?.[1]) || 0.5))
      ]);
    recomputeDrawnCenter();
  }
} catch (e) {}

export function getVectorDrawnPath(): [number, number][] {
  return drawnPath;
}

export function getVectorDrawnCenter(): [number, number] {
  return [drawnCx, drawnCy];
}

export function setVectorDrawnPath(points: [number, number][]): void {
  if (!points || points.length < 2) return;
  let out: [number, number][];
  if (points.length <= MAX_DRAWN_POINTS) {
    out = points.map(([x, y]) => [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
  } else {
    out = [];
    for (let i = 0; i < MAX_DRAWN_POINTS; i++) {
      const idx = Math.min(points.length - 1, Math.floor((i * points.length) / MAX_DRAWN_POINTS));
      const [x, y] = points[idx];
      out.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
    }
  }
  drawnPath = out;
  recomputeDrawnCenter();
  if (node) node.port.postMessage({ t: "path", pts: drawnPath });
  try {
    localStorage.setItem(DRAWN_STORAGE_KEY, JSON.stringify(drawnPath));
  } catch (e) {}
}

// Audio-clock orbit state (synced with AudioWorklet when running, or AudioContext.currentTime)
let workletXY: { x: number; y: number; phase: number; atAudioTime: number } | null = null;
let fallbackPhase = 0;
let lastAudioTime = -1;

export function computeOrbitRateHz(patch: SynthPatch): number {
  const raw = Math.max(0.05, Math.min(8, Number(patch.orbitRate) || 0.35));
  if (patch.orbitSync === "on") {
    const div = orbitSyncDivForRate(raw);
    return Math.max(0.02, getTempo() / 60 / div.beats);
  }
  return raw;
}

export function evalOrbitPoint(
  mode: string,
  phase: number,
  cx: number,
  cy: number,
  effSize: number
): [number, number] {
  if (mode === "off" || effSize <= 1e-4) {
    return [cx, cy];
  }
  const p = ((phase % 1) + 1) % 1;
  if (mode === "circle") {
    const ang = 2 * Math.PI * p;
    return [
      Math.max(0, Math.min(1, cx + Math.cos(ang) * 0.42 * effSize)),
      Math.max(0, Math.min(1, cy + Math.sin(ang) * 0.42 * effSize))
    ];
  }
  if (mode === "figure8") {
    const ang = 2 * Math.PI * p;
    return [
      Math.max(0, Math.min(1, cx + Math.sin(ang) * 0.44 * effSize)),
      Math.max(0, Math.min(1, cy + Math.sin(2 * ang) * 0.36 * effSize))
    ];
  }
  if (mode === "drawn" && drawnPath.length >= 2) {
    const len = drawnPath.length;
    const pos = p * len;
    const i0 = pos | 0;
    const i1 = (i0 + 1) % len;
    const fr = pos - i0;
    const px = drawnPath[i0][0] + (drawnPath[i1][0] - drawnPath[i0][0]) * fr;
    const py = drawnPath[i0][1] + (drawnPath[i1][1] - drawnPath[i0][1]) * fr;
    const anchorX = drawnCx + (cx - 0.5);
    const anchorY = drawnCy + (cy - 0.5);
    return [
      Math.max(0, Math.min(1, anchorX + (px - drawnCx) * effSize)),
      Math.max(0, Math.min(1, anchorY + (py - drawnCy) * effSize))
    ];
  }
  return [cx, cy];
}

/** Returns current [x, y, phase] driven strictly by the audio clock (never setTimeout). */
export function getVectorLiveXY(patch: SynthPatch): { x: number; y: number; phase: number } {
  const cx = Math.max(0, Math.min(1, Number(patch.vecX) ?? 0.5));
  const cy = Math.max(0, Math.min(1, Number(patch.vecY) ?? 0.5));
  const mode = String(patch.orbitMode || "off");
  if (mode === "off") {
    return { x: cx, y: cy, phase: 0 };
  }
  const ctx = getAudioCtxIfAny();
  const now = ctx ? ctx.currentTime : 0;
  if (useVector() && workletXY && ctx && now - workletXY.atAudioTime < 0.15) {
    return { x: workletXY.x, y: workletXY.y, phase: workletXY.phase };
  }
  if (ctx && ctx.state === "running") {
    if (lastAudioTime >= 0 && now > lastAudioTime) {
      const dt = Math.min(0.25, now - lastAudioTime);
      fallbackPhase = (fallbackPhase + dt * computeOrbitRateHz(patch)) % 1;
    }
    lastAudioTime = now;
  }
  const effSize = Math.min(1, (Number(patch.orbitSize) ?? 0.55) + getVoiceModWheel());
  const [x, y] = evalOrbitPoint(mode, fallbackPhase, cx, cy, effSize);
  if (classicOrbitUpdaters.size > 0) updateClassicVectorOrbit(x, y);
  return { x, y, phase: fallbackPhase };
}

export function getVectorState(): VectorState {
  return state;
}

export function useVector(): boolean {
  return getEngine() === "hq" && state === "ready";
}

export function initVector(ctx: AudioContext, busInput: AudioNode, getPatch: () => SynthPatch): void {
  if (state !== "idle") return;
  if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
    state = "failed";
    return;
  }
  state = "loading";
  ctx.audioWorklet
    .addModule(processorUrl)
    .then(() => {
      node = new AudioWorkletNode(ctx, "sy1-vector", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      node.connect(busInput);
      const patch = getPatch();
      node.port.postMessage({
        t: "patch",
        patch: { ...patch },
        orbitRateHz: computeOrbitRateHz(patch)
      });
      node.port.postMessage({ t: "path", pts: drawnPath });
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d && d.t === "xy") {
          workletXY = { x: d.x, y: d.y, phase: d.phase, atAudioTime: ctx.currentTime };
          fallbackPhase = d.phase;
          lastAudioTime = ctx.currentTime;
          updateClassicVectorOrbit(d.x, d.y);
        }
      };
      state = "ready";
    })
    .catch(() => {
      state = "failed";
    });
}

export function vectorPost(msg: Record<string, unknown>): void {
  if (node) node.port.postMessage(msg);
}

export function syncVectorOrbitRate(patch: SynthPatch): void {
  const hz = computeOrbitRateHz(patch);
  vectorPost({ t: "param", key: "orbitRateHz", value: hz });
}

// ============================================================================
// Classic Web Audio Vector Voice Fallback (when HQ is off or loading)
// ============================================================================
const VOWEL_F1 = [730, 530, 270, 570, 300];
const VOWEL_F2 = [1090, 1840, 2290, 840, 870];

let cachedPeriodicWaves = new WeakMap<AudioContext, PeriodicWave[]>();

function getWavetablePeriodicWaves(ctx: AudioContext): PeriodicWave[] {
  let waves = cachedPeriodicWaves.get(ctx);
  if (waves) return waves;
  const spectra: number[][] = [
    [1.0, 0.55, 0.3, 0.12, 0.06, 0.03],
    [1.0, 0, 0.65, 0, 0.42, 0, 0.25, 0, 0.14, 0, 0.08],
    [0.7, 0.35, 0.25, 0.65, 0.85, 0.7, 0.45, 0.2, 0.1],
    [0.9, 0.6, 0.5, 0.45, 0.1, 0.4, 0.05, 0.35, 0.3, 0, 0, 0.25],
    [0.5, 0.3, 0.25, 0.35, 0.55, 0.8, 0.9, 0.75, 0.55, 0.35, 0.2, 0.1],
    [0.85, 0.15, 0.6, 0.05, 0.1, 0.55, 0, 0.08, 0.45, 0, 0, 0.35],
    [0.9, -0.5, 0.45, -0.4, 0.35, -0.3, 0.26, -0.22, 0.18, -0.15],
    [0.65, 0.1, 0.15, 0.1, 0.55, 0.05, 0.45, 0.05, 0.4, 0, 0.35, 0, 0.3]
  ];
  waves = spectra.map((amps) => {
    const real = new Float32Array(amps.length + 1);
    const imag = new Float32Array(amps.length + 1);
    for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
    return ctx.createPeriodicWave(real, imag);
  });
  cachedPeriodicWaves.set(ctx, waves);
  return waves;
}

const classicOrbitUpdaters = new Set<(x: number, y: number) => void>();

function updateClassicVectorOrbit(x: number, y: number): void {
  classicOrbitUpdaters.forEach((fn) => fn(x, y));
}

function createClassicVectorVoice(
  ctx: AudioContext,
  freq: number,
  when: number,
  p: SynthPatch,
  velocity: number,
  fromHz: number,
  glide: number
): SynthVoice {
  const bus = getSynthBus(ctx, p);
  const sounding = Array.from(activeSynthVoices).filter((v) => !v.isReleased());
  if (sounding.length >= SYNTH_MAX_VOICES) {
    sounding[0].release(ctx.currentTime, 0.02);
  }
  const all = Array.from(activeSynthVoices);
  if (all.length >= SYNTH_MAX_VOICES + 6) {
    all[0].kill();
  }

  const out = ctx.createGain();
  out.gain.setValueAtTime(1, when);
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = p.filterType === "bandpass" ? "bandpass" : p.filterType === "highpass" ? "highpass" : "lowpass";
  filter.Q.setValueAtTime(p.res ?? 2, when);
  const mix = ctx.createGain();
  mix.gain.setValueAtTime(0.45, when);

  mix.connect(filter);
  filter.connect(amp);
  amp.connect(out);
  out.connect(bus.input);

  const srcs: (OscillatorNode | AudioBufferSourceNode)[] = [];
  const bendCents = getVoicePitchBend() * (p.bendRange ?? 2) * 100;
  const startHz = fromHz > 0 && glide > 0.004 ? fromHz : freq;

  const setPitch = (o: OscillatorNode, mult = 1) => {
    o.frequency.setValueAtTime(startHz * mult, when);
    if (fromHz > 0 && glide > 0.004) {
      o.frequency.setTargetAtTime(freq * mult, when, glide / 3);
    }
    o.detune.setValueAtTime(bendCents, when);
  };

  // Corner A: Saw + Square blend
  const gA = ctx.createGain();
  const oASaw = ctx.createOscillator();
  oASaw.type = "sawtooth";
  setPitch(oASaw);
  const oASq = ctx.createOscillator();
  oASq.type = "square";
  setPitch(oASq);
  oASq.detune.setValueAtTime(bendCents + 6, when);
  oASaw.connect(gA);
  oASq.connect(gA);
  gA.connect(mix);
  srcs.push(oASaw, oASq);

  // Corner B: 2-op FM bell
  const gB = ctx.createGain();
  const oBCar = ctx.createOscillator();
  oBCar.type = "sine";
  setPitch(oBCar);
  const oBMod = ctx.createOscillator();
  oBMod.type = "sine";
  setPitch(oBMod, p.vecBRatio ?? 3.5);
  const gBMod = ctx.createGain();
  gBMod.gain.setValueAtTime((p.vecBIndex ?? 0.45) * freq * 3.5, when);
  oBMod.connect(gBMod);
  gBMod.connect(oBCar.frequency);
  oBCar.connect(gB);
  gB.connect(mix);
  srcs.push(oBCar, oBMod);

  // Corner C: Procedural Wavetable
  const gC = ctx.createGain();
  const oC = ctx.createOscillator();
  const waves = getWavetablePeriodicWaves(ctx);
  const wtIdx = Math.min(waves.length - 1, Math.max(0, Math.round((p.vecCPos ?? 0.4) * (waves.length - 1))));
  oC.setPeriodicWave(waves[wtIdx]);
  setPitch(oC);
  oC.connect(gC);
  gC.connect(mix);
  srcs.push(oC);

  // Corner D: Filtered noise through 2 formant band-pass filters
  const gD = ctx.createGain();
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = getSharedNoiseBuffer(ctx);
  noiseSrc.loop = true;
  const bp1 = ctx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.Q.setValueAtTime(8, when);
  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.Q.setValueAtTime(8, when);
  const applyVowel = (v: number, t: number) => {
    const vs = Math.max(0, Math.min(0.999, v)) * 4;
    const vi = vs | 0;
    const vf = vs - vi;
    const f1 = VOWEL_F1[vi] * Math.pow(VOWEL_F1[vi + 1] / VOWEL_F1[vi], vf);
    const f2 = VOWEL_F2[vi] * Math.pow(VOWEL_F2[vi + 1] / VOWEL_F2[vi], vf);
    bp1.frequency.setTargetAtTime(f1, t, 0.015);
    bp2.frequency.setTargetAtTime(f2, t, 0.015);
  };
  applyVowel(p.vecDVowel ?? 0.3, when);
  noiseSrc.connect(bp1);
  noiseSrc.connect(bp2);
  bp1.connect(gD);
  bp2.connect(gD);
  gD.connect(mix);
  srcs.push(noiseSrc);

  const applyCornerWeights = (x: number, y: number, t: number) => {
    const wx0 = Math.cos(x * Math.PI * 0.5);
    const wx1 = Math.sin(x * Math.PI * 0.5);
    const wy0 = Math.cos(y * Math.PI * 0.5);
    const wy1 = Math.sin(y * Math.PI * 0.5);
    gA.gain.setTargetAtTime(wx0 * wy0 * (p.vecALevel ?? 0.85) * 0.5, t, 0.015);
    gB.gain.setTargetAtTime(wx1 * wy0 * (p.vecBLevel ?? 0.85), t, 0.015);
    gC.gain.setTargetAtTime(wx0 * wy1 * (p.vecCLevel ?? 0.85), t, 0.015);
    gD.gain.setTargetAtTime(wx1 * wy1 * (p.vecDLevel ?? 0.85) * 1.6, t, 0.015);
  };

  const live = getVectorLiveXY(p);
  applyCornerWeights(live.x, live.y, when);

  const onOrbitXY = (x: number, y: number) => {
    applyCornerWeights(x, y, ctx.currentTime);
  };
  classicOrbitUpdaters.add(onOrbitXY);

  // Amp ADSR
  const vel = Math.max(0, Math.min(1, velocity));
  const velSens = p.velSens ?? 0.6;
  const peak = 0.34 * (1 - velSens + velSens * vel);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(peak, when + (p.aA ?? 0.02));
  amp.gain.setTargetAtTime(
    Math.max(0.0001, peak * (p.aS ?? 0.75)),
    when + (p.aA ?? 0.02),
    Math.max(0.005, (p.aD ?? 0.5) / 3)
  );

  // Filter ADSR
  const base = p.cutoff ?? 2400;
  const top = Math.min(20000, base * Math.pow(2, (p.envAmt ?? 0.4) * 6));
  const sus = base + (top - base) * (p.fS ?? 0.35);
  filter.frequency.setValueAtTime(base, when);
  filter.frequency.linearRampToValueAtTime(top, when + (p.fA ?? 0.015));
  filter.frequency.setTargetAtTime(sus, when + (p.fA ?? 0.015), Math.max(0.005, (p.fD ?? 0.5) / 3));

  srcs.forEach((s) => s.start(when));

  let released = false;
  const voice: SynthVoice = {
    freq,
    isReleased() {
      return released;
    },
    kill() {
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0.0001, now, 0.005);
      srcs.forEach((s) => {
        try {
          s.stop(now + 0.05);
        } catch (e) {}
      });
      released = true;
      classicOrbitUpdaters.delete(onOrbitXY);
      activeSynthVoices.delete(voice);
    },
    release(t, fastTau) {
      if (released) return;
      released = true;
      classicOrbitUpdaters.delete(onOrbitXY);
      const at = Math.max(ctx.currentTime, t);
      const tau = fastTau || Math.max(0.005, (p.aR ?? 0.55) / 4);
      out.gain.setTargetAtTime(0.0001, at, tau);
      const fTau = Math.max(0.005, (p.fR ?? 0.45) / 4);
      filter.frequency.cancelScheduledValues(at);
      filter.frequency.setTargetAtTime(Math.max(40, p.cutoff ?? 2400), at, fTau);
      const stopAt = at + tau * 8 + 0.05;
      srcs.forEach((s) => {
        try {
          s.stop(stopAt);
        } catch (e) {}
      });
      setTimeout(() => activeSynthVoices.delete(voice), Math.max(0, (stopAt - ctx.currentTime) * 1000) + 50);
    },
    retune(freqHz, glideT, at) {
      const t0 = Math.max(ctx.currentTime, at);
      const tau = Math.max(0.002, glideT / 3);
      oASaw.frequency.setTargetAtTime(freqHz, t0, tau);
      oASq.frequency.setTargetAtTime(freqHz, t0, tau);
      oBCar.frequency.setTargetAtTime(freqHz, t0, tau);
      oBMod.frequency.setTargetAtTime(freqHz * (p.vecBRatio ?? 3.5), t0, tau);
      oC.frequency.setTargetAtTime(freqHz, t0, tau);
      voice.freq = freqHz;
    },
    update(key) {
      const now = ctx.currentTime;
      if (key === "vecX" || key === "vecY" || key.startsWith("vec") || key.startsWith("orbit")) {
        const cur = getVectorLiveXY(p);
        applyCornerWeights(cur.x, cur.y, now);
      }
      if (key === "vecBRatio" || key === "vecBIndex") {
        oBMod.frequency.setTargetAtTime(voice.freq * (p.vecBRatio ?? 3.5), now, 0.015);
        gBMod.gain.setTargetAtTime((p.vecBIndex ?? 0.45) * voice.freq * 3.5, now, 0.015);
      } else if (key === "vecCPos") {
        const w = getWavetablePeriodicWaves(ctx);
        const idx = Math.min(w.length - 1, Math.max(0, Math.round((p.vecCPos ?? 0.4) * (w.length - 1))));
        oC.setPeriodicWave(w[idx]);
      } else if (key === "vecDVowel") {
        applyVowel(p.vecDVowel ?? 0.3, now);
      } else if (key === "cutoff" || key === "envAmt" || key === "fS") {
        const b = p.cutoff ?? 2400;
        const tp = Math.min(20000, b * Math.pow(2, (p.envAmt ?? 0.4) * 6));
        filter.frequency.cancelScheduledValues(now);
        filter.frequency.setTargetAtTime(b + (tp - b) * (p.fS ?? 0.35), now, 0.02);
      } else if (key === "res") {
        filter.Q.setTargetAtTime(p.res ?? 2, now, 0.02);
      } else if (key === "filterType") {
        filter.type = p.filterType === "bandpass" ? "bandpass" : p.filterType === "highpass" ? "highpass" : "lowpass";
      } else if (key === "bendRange" || key === "pitchBend") {
        const bc = getVoicePitchBend() * (p.bendRange ?? 2) * 100;
        [oASaw, oASq, oBCar, oBMod, oC].forEach((o) => o.detune.setTargetAtTime(bc, now, 0.01));
      }
    }
  };

  activeSynthVoices.add(voice);
  return voice;
}

export function createVectorVoice(
  ctx: AudioContext,
  patch: SynthPatch,
  midi: number,
  cents: number,
  velocity: number,
  at = 0,
  fromHz = 0,
  glide = 0
): SynthVoice {
  const freqHz = 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200);
  if (!useVector()) {
    return createClassicVectorVoice(ctx, freqHz, Math.max(at, ctx.currentTime), patch, velocity, fromHz, glide);
  }
  const id = nextId++;
  vectorPost({ t: "on", id, midi, cents, vel: velocity, at, from: fromHz, glide });
  let released = false;
  const voice: SynthVoice = {
    freq: freqHz,
    isReleased() {
      return released;
    },
    kill() {
      if (released) return;
      released = true;
      vectorPost({ t: "kill", id });
    },
    release(t?: number, fastTau?: number) {
      if (released) return;
      released = true;
      vectorPost({ t: fastTau ? "kill" : "off", id, at: t || 0 });
    },
    retune(targetHz: number, glideT: number, t: number) {
      const m = 69 + 12 * Math.log2(targetHz / 440);
      const base = Math.round(m);
      vectorPost({ t: "glide", id, midi: base, cents: (m - base) * 100, glide: glideT, at: t });
      voice.freq = targetHz;
    },
    update() {
      // Vector worklet receives parameter changes globally (see setSynthParam)
    }
  };
  return voice;
}
