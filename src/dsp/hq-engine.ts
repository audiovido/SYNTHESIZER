/**
 * SY-1 DSP — HQ engine: voices, parameters, rendering.
 *
 * PORTABILITY RULE (same as analog.ts): no Web Audio, DOM or worklet code.
 * Plain numbers and typed arrays, no allocation after construction, so it
 * translates line by line to C++ (native/dsp/hq.hpp). The web worklet
 * (src/engine/worklet/sy1-processor.ts) is a thin wrapper around it.
 *
 * Used by every machine without a special engine (SY-1, Yazd, Baku, Merv,
 * Isfahan, Konya, Bam, Kerman, Bushehr, Rasht, Hormoz). Behaviour mirrors
 * the Classic engine and the spec (SY-1-synth-spec.md section 4): same
 * envelope math, LFO depths, voice caps and gain staging. On top of that:
 *  - Band-limited mip-mapped wavetables (half-octave steps) for saw, square and
 *    triangle, with Web Audio's own phase convention
 *  - Unison: up to 7 voices per oscillator, symmetric detune, stereo width
 *  - Zero-delay-feedback (TPT) state-variable filter: LP, LP24 (two stages),
 *    BP, HP; Web Audio's Q mapping (dB for LP/HP, linear for BP). The
 *    resonant node is soft-saturated (tanh), resonance-dependent, so the
 *    filter overloads gracefully like an analog one instead of ringing with
 *    infinite headroom (same idea as the Tabriz ladder).
 *  - Analog character, shared with Tabriz: DRIFT (each oscillator wanders a
 *    few cents, random walk + per-note offset), filter DRIVE (tanh into the
 *    filter, loudness-compensated), KEY TRK (cutoff follows the note), and a
 *    LADDER filter type (the Tabriz transistor ladder, 2x oversampled, stereo)
 *  - Sample-accurate note offsets (the host converts times to offsets)
 *  - Glide (mono/legato), per-note tuning offsets (dastgah tunings)
 *  - LFO shapes: sine, triangle, square, saw, sample-and-hold
 *  - Ornaments: scoop into the note, delayed vibrato, tahrir (vocal flip)
 *
 * Host API (same shape as AnalogEngine):
 *   setParam(key, value), snapParams()
 *   noteOn(id, midi, cents, vel, offset, fromHz, glide)
 *   noteOff(id, offset, fast), glideTo(id, midi, cents, glide)
 *   allOff(), setBend(v -1..1), setMod(v 0..1)
 *   render(L, R, n)      adds n samples into L (and R when not null)
 */

import { Ladder, resToLadder } from "./analog";

export const HQ_POOL = 24;        // voice slots
export const HQ_MAX_SOUNDING = 10; // held/ringing voices before the oldest is stolen (spec 6)
export const HQ_MAX_ACTIVE = 16;  // including release tails
export const HQ_MAX_UNI = 7;
const PEAK = 0.42;

// ---- lookup sine (linear interpolation) ----
const SINE_N = 2048;
const SINE = new Float32Array(SINE_N + 1);
for (let i = 0; i <= SINE_N; i++) SINE[i] = Math.sin((2 * Math.PI * i) / SINE_N);
export function sineAt(ph: number): number {
  const x = ph * SINE_N;
  const i = x | 0;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
}

/** Rational tanh approximation (exact at 0, saturates to +-1 beyond |x| = 3). Bounded, so it can never diverge. */
function fastTanh(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

// ---- band-limited wavetables ----
// Tables hold only harmonics below Nyquist for their pitch range. One table per
// half octave; playback picks the richest table that cannot alias.
const TBL_N = 4096;
const TBL_MASK = TBL_N - 1;
const H_MAX = 1024;
const TBL_COUNT = 21; // H = 1024 * 2^(-j/2), j = 0..20
const TBL_H: number[] = [];
for (let j = 0; j < TBL_COUNT; j++) TBL_H.push(Math.max(1, Math.floor(H_MAX * Math.pow(2, -j / 2))));

/** Build tables for one wave by adding harmonics cumulatively (fast: one pass). */
function buildWave(coef: (h: number) => number): Float32Array[] {
  const acc = new Float64Array(TBL_N);
  const out: Float32Array[] = new Array(TBL_COUNT);
  let next = TBL_COUNT - 1; // ascending harmonic count = descending j
  for (let h = 1; h <= H_MAX && next >= 0; h++) {
    const a = coef(h);
    if (a !== 0) {
      const w = (2 * Math.PI * h) / TBL_N;
      const cw = Math.cos(w), sw = Math.sin(w);
      let c = 1, s = 0;
      for (let n = 0; n < TBL_N; n++) {
        acc[n] += a * s;
        const c2 = c * cw - s * sw;
        s = s * cw + c * sw;
        c = c2;
      }
    }
    while (next >= 0 && TBL_H[next] === h) {
      const t = new Float32Array(TBL_N + 1);
      let m = 0;
      for (let n = 0; n < TBL_N; n++) m = Math.max(m, Math.abs(acc[n]));
      const g = m > 0 ? 1 / m : 1; // peak-normalised, like Web Audio's periodic waves
      for (let n = 0; n < TBL_N; n++) t[n] = acc[n] * g;
      t[TBL_N] = t[0];
      out[next] = t;
      next--;
    }
  }
  return out;
}
// Same Fourier series (and so the same phase) as Web Audio's built-in waves:
// saw b_n ~ (-1)^(n+1)/n, square b_n ~ 1/n (odd), triangle b_n ~ sin(n*pi/2)/n^2 (odd)
const TABLES: Float32Array[][] = [
  buildWave((h) => (h % 2 ? 1 : -1) / h),
  buildWave((h) => (h % 2 ? 1 / h : 0)),
  buildWave((h) => (h % 2 ? (((h - 1) / 2) % 2 ? -1 : 1) / (h * h) : 0))
];

function tableFor(dt: number): number {
  const limit = 0.5 / Math.max(1e-9, dt);
  if (limit >= H_MAX) return 0;
  const j = Math.ceil(2 * Math.log2(H_MAX / limit));
  return j < 0 ? 0 : j >= TBL_COUNT ? TBL_COUNT - 1 : j;
}

function readTable(t: Float32Array, ph: number): number {
  const x = ph * TBL_N;
  const i = (x | 0) & TBL_MASK;
  return t[i] + (t[i + 1] - t[i]) * (x - (x | 0));
}

const WAVE: Record<string, number> = { sawtooth: 0, square: 1, triangle: 2, sine: 3 };
const FILT: Record<string, number> = { lowpass: 0, bandpass: 1, highpass: 2, lp24: 3, ladder: 4 };
const C4 = Math.log2(261.6256); // key tracking pivot: cutoff unchanged at middle C
const LFOT: Record<string, number> = { pitch: 0, filter: 1, amp: 2 };
const LFOS: Record<string, number> = { sine: 0, triangle: 1, square: 2, sawtooth: 3, sh: 4 };

class Smooth {
  target: number;
  cur: number;
  prev: number;
  constructor(v: number) {
    this.target = v;
    this.cur = v;
    this.prev = v;
  }
  step(a: number): void {
    this.prev = this.cur;
    this.cur += (this.target - this.cur) * a;
    if (Math.abs(this.target - this.cur) < 1e-9) this.cur = this.target;
  }
  snap(): void {
    this.cur = this.prev = this.target;
  }
}

/** xorshift32 step; returns the new state (unsigned). */
function xorshift(x: number): number {
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x;
}

export class HQVoice {
  active = false;
  released = false;
  id = 0;
  order = 0;
  vel = 1;
  delay = 0;            // samples until the note starts (sample-accurate scheduling)
  relDelay = -1;        // samples until release (-1 = none pending)
  relFast = 0;
  // pitch: log2(frequency), with glide
  lf = 0;
  lfTarget = 0;
  glideC = 1;
  ph1 = new Float64Array(HQ_MAX_UNI);
  ph2 = new Float64Array(HQ_MAX_UNI);
  tb1 = new Int32Array(HQ_MAX_UNI);
  tb2 = new Int32Array(HQ_MAX_UNI);
  subPh = 0;
  lfoPh = 0;
  lfoHold = 0;
  vibPh = 0;
  // envelopes
  t = 0;
  amp = 0.0001;
  fenv = 0;
  out = 1;
  relCoef = 0;
  scoopC = 0;
  tahrirOn = false;
  // filter state (L/R, two stages)
  aL1 = 0; aL2 = 0; aR1 = 0; aR2 = 0;
  bL1 = 0; bL2 = 0; bR1 = 0; bR2 = 0;
  // ladder filter type (L/R) and its 2x-oversampling input memory
  ladL = new Ladder();
  ladR = new Ladder();
  xPrevL = 0; xPrevR = 0;
  // analog drift per oscillator: random-walk state and fixed per-note offset (-1..1)
  drift = new Float64Array(2);
  driftFix = new Float64Array(2);
}

export class HQEngine {
  sr: number;
  // discrete params
  w1 = 0; w2 = 1; oct1 = 0; oct2 = 0; ftype = 0; lfoTarget = 0; lfoShape = 0; uni = 1;
  oriental = false;
  // time params (seconds)
  aA = 0.008; aD = 0.3; aR = 0.35; fA = 0.01; fD = 0.35;
  scoop = 0; scoopTime = 0.08; vibDelay = 0.3; tahrir = 0; tahrirSpeed = 12;
  // continuous, smoothed
  mix = new Smooth(0.45);
  sub = new Smooth(0.2);
  noise = new Smooth(0);
  cutoff = new Smooth(2200);
  res = new Smooth(2);
  envAmt = new Smooth(0.45);
  fS = new Smooth(0.25);
  aS = new Smooth(0.75);
  velSens = new Smooth(0.6);
  lfoRate = new Smooth(5);
  lfoDepth = new Smooth(0);
  detune2 = new Smooth(8);
  bendRange = new Smooth(2);
  uniDetune = new Smooth(20);
  uniWidth = new Smooth(0.5);
  vibDepth = new Smooth(0);
  vibRate = new Smooth(5.5);
  bend = new Smooth(0);
  modWheel = new Smooth(0);
  keyTrack = new Smooth(0);
  fDrive = new Smooth(0);
  driftAmt = new Smooth(0);
  smooths: Smooth[];

  voices: HQVoice[] = [];
  counter = 0;
  rng = 0x9e3779b9;   // noise
  rngInit = 0x2545f491; // start phases and S&H seeds

  uRatio = new Float64Array(HQ_MAX_UNI);
  uGL = new Float64Array(HQ_MAX_UNI);
  uGR = new Float64Array(HQ_MAX_UNI);

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    for (let i = 0; i < HQ_POOL; i++) this.voices.push(new HQVoice());
    this.smooths = [this.mix, this.sub, this.noise, this.cutoff, this.res, this.envAmt, this.fS, this.aS,
      this.velSens, this.lfoRate, this.lfoDepth, this.detune2, this.bendRange, this.uniDetune, this.uniWidth,
      this.vibDepth, this.vibRate, this.bend, this.modWheel, this.keyTrack, this.fDrive, this.driftAmt];
  }

  setParam(key: string, v: unknown): void {
    const n = Number(v);
    switch (key) {
      case "oriental": this.oriental = v === "on"; break;
      case "osc1Wave": this.w1 = WAVE[String(v)] ?? 0; break;
      case "osc2Wave": this.w2 = WAVE[String(v)] ?? 1; break;
      case "osc1Oct": this.oct1 = n; break;
      case "osc2Oct": this.oct2 = n; break;
      case "filterType": this.ftype = FILT[String(v)] ?? 0; break;
      case "lfoTarget": this.lfoTarget = LFOT[String(v)] ?? 0; break;
      case "lfoShape": this.lfoShape = LFOS[String(v)] ?? 0; break;
      case "unison": this.uni = Math.max(1, Math.min(HQ_MAX_UNI, Math.round(n))); break;
      case "aA": this.aA = n; break;
      case "aD": this.aD = n; break;
      case "aR": this.aR = n; break;
      case "fA": this.fA = n; break;
      case "fD": this.fD = n; break;
      case "scoop": this.scoop = n; break;
      case "scoopTime": this.scoopTime = n; break;
      case "vibDelay": this.vibDelay = n; break;
      case "tahrir": this.tahrir = n; break;
      case "tahrirSpeed": this.tahrirSpeed = n; break;
      case "oscMix": this.mix.target = n; break;
      case "sub": this.sub.target = n; break;
      case "noise": this.noise.target = n; break;
      case "cutoff": this.cutoff.target = n; break;
      case "res": this.res.target = n; break;
      case "envAmt": this.envAmt.target = n; break;
      case "fS": this.fS.target = n; break;
      case "aS": this.aS.target = n; break;
      case "velSens": this.velSens.target = n; break;
      case "lfoRate": this.lfoRate.target = n; break;
      case "lfoDepth": this.lfoDepth.target = n; break;
      case "osc2Detune": this.detune2.target = n; break;
      case "bendRange": this.bendRange.target = n; break;
      case "uniDetune": this.uniDetune.target = n; break;
      case "uniWidth": this.uniWidth.target = n; break;
      case "vibDepth": this.vibDepth.target = n; break;
      case "vibRate": this.vibRate.target = n; break;
      case "keyTrack": this.keyTrack.target = n; break;
      case "filterDrive": this.fDrive.target = n; break;
      case "drift": this.driftAmt.target = n; break;
      default: break;
    }
  }

  snapParams(): void {
    for (let i = 0; i < this.smooths.length; i++) this.smooths[i].snap();
  }

  setBend(v: number): void { this.bend.target = v; }
  setMod(v: number): void { this.modWheel.target = v; }

  /** Noise source, -1..1 (xorshift32). */
  nextNoise(): number {
    this.rng = xorshift(this.rng);
    return this.rng / 2147483648 - 1;
  }

  /** Uniform 0..1 for start phases and S&H seeds (separate stream, so noise stays reproducible). */
  nextInit(): number {
    this.rngInit = xorshift(this.rngInit);
    return this.rngInit / 4294967296;
  }

  release(v: HQVoice, fastTau: number): void {
    if (v.released) return;
    v.released = true;
    const tau = fastTau || Math.max(0.005, this.aR / 4);
    v.relCoef = 1 - Math.exp(-1 / (tau * this.sr));
  }

  find(id: number): HQVoice | null {
    for (const v of this.voices) if (v.active && v.id === id) return v;
    return null;
  }

  noteOn(id: number, midi: number, cents: number, vel: number, offset: number, fromHz: number, glide: number): void {
    let sounding = 0, active = 0;
    let oldestSounding: HQVoice | null = null, oldestActive: HQVoice | null = null;
    for (const v of this.voices) {
      if (!v.active) continue;
      active++;
      if (!oldestActive || v.order < oldestActive.order) oldestActive = v;
      if (!v.released) {
        sounding++;
        if (!oldestSounding || v.order < oldestSounding.order) oldestSounding = v;
      }
    }
    if (sounding >= HQ_MAX_SOUNDING && oldestSounding) this.release(oldestSounding, 0.02);
    if (active >= HQ_MAX_ACTIVE && oldestActive) this.release(oldestActive, 0.005);
    let slot: HQVoice | null = null;
    for (const v of this.voices) if (!v.active) { slot = v; break; }
    if (!slot) for (const v of this.voices) if (!slot || v.order < slot.order) slot = v;
    const target = 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200);
    const s = slot!;
    const startHz = fromHz > 0 ? fromHz : target;
    // reset the slot
    s.active = true;
    s.released = false;
    s.id = id;
    s.order = ++this.counter;
    s.vel = Math.max(0, Math.min(1, vel));
    s.delay = Math.max(0, offset | 0);
    s.relDelay = -1;
    s.relFast = 0;
    s.lf = s.lfTarget = Math.log2(startHz);
    s.glideC = 1;
    for (let k = 0; k < HQ_MAX_UNI; k++) {
      s.ph1[k] = k === 0 ? 0 : this.nextInit();
      s.ph2[k] = k === 0 ? 0 : this.nextInit();
    }
    s.subPh = 0;
    s.lfoPh = 0;
    s.lfoHold = this.nextInit() * 2 - 1;
    s.vibPh = 0;
    s.t = 0;
    s.amp = 0.0001;
    s.fenv = 0;
    s.out = 1;
    s.relCoef = 0;
    s.aL1 = s.aL2 = s.aR1 = s.aR2 = 0;
    s.bL1 = s.bL2 = s.bR1 = s.bR2 = 0;
    s.ladL.reset(); s.ladR.reset();
    s.xPrevL = s.xPrevR = 0;
    for (let k = 0; k < 2; k++) {
      s.drift[k] = (this.nextInit() * 2 - 1) * 0.5;
      s.driftFix[k] = this.nextInit() * 2 - 1;
    }
    if (fromHz > 0 && glide > 0.004) {
      s.lfTarget = Math.log2(target);
      s.glideC = 1 - Math.exp(-1 / ((glide / 3) * this.sr));
    }
    s.scoopC = this.oriental && this.scoop > 0 ? -this.scoop * 200 : 0;
    s.tahrirOn = this.oriental && this.tahrir > 0 && s.vel >= 0.7;
  }

  /** Release after `offset` samples of this block (fast = 5 ms kill instead of the RELEASE knob). */
  noteOff(id: number, offset: number, fast: boolean): void {
    const v = this.find(id);
    if (!v) return;
    v.relDelay = Math.max(offset | 0, v.delay);
    v.relFast = fast ? 0.005 : 0;
  }

  glideTo(id: number, midi: number, cents: number, glide: number): void {
    const v = this.find(id);
    if (!v) return;
    v.lfTarget = Math.log2(440 * Math.pow(2, (midi - 69) / 12 + cents / 1200));
    v.glideC = glide > 0.004 ? 1 - Math.exp(-1 / ((glide / 3) * this.sr)) : 1;
  }

  allOff(): void {
    for (const v of this.voices) if (v.active) this.release(v, 0);
  }

  lfoValue(v: HQVoice, shape: number): number {
    const p = v.lfoPh;
    switch (shape) {
      case 1: return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      case 2: return p < 0.5 ? 1 : -1;
      case 3: return 1 - 2 * p;
      case 4: return v.lfoHold;
      default: return sineAt(p);
    }
  }

  render(L: Float32Array, R: Float32Array | null, n: number): void {
    const sr = this.sr;
    const blockA = 1 - Math.exp(-n / (0.01 * sr)); // ~10 ms smoothing
    for (let i = 0; i < this.smooths.length; i++) this.smooths[i].step(blockA);

    const N = this.uni;
    const norm = 1 / Math.sqrt(N);
    for (let k = 0; k < N; k++) {
      const pos = N === 1 ? 0 : k / (N - 1) - 0.5;
      this.uRatio[k] = Math.pow(2, (pos * this.uniDetune.cur) / 1200);
      const pan = N === 1 ? 0 : 2 * pos * this.uniWidth.cur;
      const ang = ((pan + 1) * Math.PI) / 4;
      this.uGL[k] = Math.cos(ang) * Math.SQRT2 * norm;
      this.uGR[k] = Math.sin(ang) * Math.SQRT2 * norm;
    }

    const res = this.res.cur;
    const ft = this.ftype;
    const kq = ft === 1 ? 1 / Math.max(0.1, res) : 1 / Math.pow(10, res / 20);
    // Resonance-dependent drive into the resonant node's soft saturator: near-unity at
    // low resonance, growing toward the self-oscillation end of the RESO range. drvInv
    // undoes the gain on the way out, so it only bites once the signal pushes into it.
    const drv = 1 + res * 0.12;
    const drvInv = 1 / drv;
    const base = this.cutoff.cur;
    const top = Math.min(20000, base * Math.pow(2, this.envAmt.cur * 6));
    const fS = this.fS.cur;
    const depth = Math.min(1, this.lfoDepth.cur + this.modWheel.cur);
    const bendCents = this.bend.cur * this.bendRange.cur * 100;
    const lfoInc = this.lfoRate.cur / sr;
    const ratio1 = Math.pow(2, this.oct1);
    const ratio2 = Math.pow(2, this.oct2) * Math.pow(2, this.detune2.cur / 1200);
    const ratioSub = Math.pow(2, this.oct1 - 1);
    const attackA = Math.max(1e-4, this.aA);
    const decayC = 1 - Math.exp(-1 / (Math.max(0.005, this.aD / 3) * sr));
    const attackF = Math.max(1e-4, this.fA);
    const fDecayC = 1 - Math.exp(-1 / (Math.max(0.005, this.fD / 3) * sr));
    const scoopC = 1 - Math.exp(-1 / (Math.max(0.003, this.scoopTime / 3) * sr));
    const vibDepthC = this.vibDepth.cur * 50;
    const vibInc = this.vibRate.cur / sr;
    const vibDelay = this.vibDelay;
    const tahrirAmt = this.oriental ? this.tahrir * 200 : 0;
    const tahrirSpeed = this.tahrirSpeed;
    const velS = this.velSens.cur;
    const aS = this.aS.cur;
    const maxFc = sr * 0.45;
    const invN = 1 / n;
    const invSr = 1 / sr;
    const w1 = this.w1, w2 = this.w2, lt = this.lfoTarget, shape = this.lfoShape;
    const T1 = w1 < 3 ? TABLES[w1] : null;
    const T2 = w2 < 3 ? TABLES[w2] : null;
    const BW = Math.SQRT2; // first LP24 stage: Butterworth damping
    const oriental = this.oriental;
    // analog character
    const kt = this.keyTrack.cur;
    const fd = this.fDrive.cur;
    const driveK = 1 + 4 * fd;                    // pre-gain into the tanh
    const driveG = (1 + 0.55 * fd) / driveK;      // back out, with makeup so typical mixes keep their loudness
    const driftC = this.driftAmt.cur;
    const rL = resToLadder(res);                  // RESO knob -> ladder feedback (1 = self-oscillation)
    const ladComp = 1 + 2.5 * rL;               // makes up most of the ladder's resonance bass loss (Tabriz keeps more of it)
    const fsOs = sr * 2;

    for (const v of this.voices) {
      if (!v.active) continue;
      const peak = PEAK * (1 - velS + velS * v.vel);
      const sus = Math.max(0.0001, peak * aS);
      let g = 0, a1 = 0, a2 = 0, a3 = 0, b1 = 0, b2 = 0, b3 = 0;

      // slow analog drift: random walk per oscillator, once per block (+-6 cents walk, +-2 cents fixed, at 100%)
      let dr1 = 1, dr2 = 1;
      if (driftC > 0) {
        for (let k = 0; k < 2; k++) {
          let d = v.drift[k] + (this.nextInit() * 2 - 1) * 0.06;
          d *= 0.996;
          v.drift[k] = d > 1 ? 1 : d < -1 ? -1 : d;
        }
        dr1 = Math.pow(2, (driftC * (6 * v.drift[0] + 2 * v.driftFix[0])) / 1200);
        dr2 = Math.pow(2, (driftC * (6 * v.drift[1] + 2 * v.driftFix[1])) / 1200);
      }

      // wavetables for this block, chosen at the highest pitch the block can reach
      const fb = Math.pow(2, Math.max(v.lf, v.lfTarget)) * Math.pow(2, (Math.max(0, bendCents) + 60) / 1200);
      for (let k = 0; k < N; k++) {
        v.tb1[k] = tableFor((fb * ratio1 * this.uRatio[k]) / sr);
        v.tb2[k] = tableFor((fb * ratio2 * this.uRatio[k]) / sr);
      }

      for (let i = 0; i < n; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        if (v.relDelay === 0) { this.release(v, v.relFast); v.relDelay = -1; }
        else if (v.relDelay > 0) v.relDelay--;
        const fr = i * invN;

        // LFO (with sample-and-hold refresh on wrap)
        const lfo = depth > 0 ? this.lfoValue(v, shape) : 0;
        v.lfoPh += lfoInc;
        if (v.lfoPh >= 1) { v.lfoPh -= 1; v.lfoHold = this.nextNoise(); }

        // pitch: glide + bend + LFO + scoop + delayed vibrato + tahrir
        if (v.lf !== v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (Math.abs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }
        let cents = bendCents;
        if (lt === 0) cents += lfo * depth * 60;
        if (oriental && v.scoopC !== 0) {
          cents += v.scoopC;
          v.scoopC -= v.scoopC * scoopC;
          if (Math.abs(v.scoopC) < 0.05) v.scoopC = 0;
        }
        const t = v.t;
        if (vibDepthC > 0 && t > vibDelay) {
          const ramp = Math.min(1, (t - vibDelay) / 0.3);
          cents += sineAt(v.vibPh) * vibDepthC * ramp;
        }
        v.vibPh += vibInc;
        if (v.vibPh >= 1) v.vibPh -= 1;
        if (oriental && v.tahrirOn) {
          const x = (t - 0.05) * tahrirSpeed;
          if (x > 0 && x < 2) {
            const s = Math.sin(Math.PI * x);
            cents += tahrirAmt * s * s * (x < 1 ? 1 : 0.6);
          } else if (x >= 2) v.tahrirOn = false;
        }
        const f0 = Math.pow(2, v.lf + cents / 1200);

        const mixV = this.mix.prev + (this.mix.cur - this.mix.prev) * fr;
        const l1 = 1 - mixV;
        const l2 = mixV;
        const subG = (this.sub.prev + (this.sub.cur - this.sub.prev) * fr) * 0.8;
        const noiseG = (this.noise.prev + (this.noise.cur - this.noise.prev) * fr) * 0.5;

        let xl = 0, xr = 0;
        for (let k = 0; k < N; k++) {
          const ur = this.uRatio[k];
          if (l1 > 0) {
            let ph = v.ph1[k];
            const s = (T1 ? readTable(T1[v.tb1[k]], ph) : sineAt(ph)) * l1;
            ph += (f0 * ratio1 * dr1 * ur) * invSr; if (ph >= 1) ph -= Math.floor(ph); v.ph1[k] = ph;
            xl += s * this.uGL[k]; xr += s * this.uGR[k];
          }
          if (l2 > 0) {
            let ph = v.ph2[k];
            const s = (T2 ? readTable(T2[v.tb2[k]], ph) : sineAt(ph)) * l2;
            ph += (f0 * ratio2 * dr2 * ur) * invSr; if (ph >= 1) ph -= Math.floor(ph); v.ph2[k] = ph;
            xl += s * this.uGL[k]; xr += s * this.uGR[k];
          }
        }
        let c = 0;
        if (subG > 0) c += sineAt(v.subPh) * subG;
        v.subPh += f0 * ratioSub * dr1 * invSr;
        if (v.subPh >= 1) v.subPh -= Math.floor(v.subPh);
        if (noiseG > 0) c += this.nextNoise() * noiseG;
        xl = (xl + c) * 0.5;
        xr = (xr + c) * 0.5;
        // filter drive: soft overdrive into the filter, like a hot analog mixer
        if (fd > 0) {
          xl = fastTanh(xl * driveK) * driveG;
          xr = fastTanh(xr * driveK) * driveG;
        }

        // envelopes (spec section 4)
        if (t < attackA) v.amp = 0.0001 + (peak - 0.0001) * (t / attackA);
        else v.amp += (sus - v.amp) * decayC;
        if (t < attackF) v.fenv = t / attackF;
        else v.fenv += (fS - v.fenv) * fDecayC;
        v.t = t + invSr;

        if ((i & 3) === 0) {
          let fc = base + (top - base) * v.fenv;
          if (lt === 1) fc *= Math.pow(2, lfo * depth * 2);
          if (kt !== 0) fc *= Math.pow(2, kt * (v.lf + cents / 1200 - C4));
          if (fc < 20) fc = 20; else if (fc > maxFc) fc = maxFc;
          if (ft === 4) {
            v.ladL.setCutoff(fc, fsOs, rL);
            v.ladR.setCutoff(fc, fsOs, rL);
          } else {
            g = Math.tan((Math.PI * fc) * invSr);
            a1 = 1 / (1 + g * (g + kq)); a2 = g * a1; a3 = g * a2;
            if (ft === 3) { b1 = 1 / (1 + g * (g + BW)); b2 = g * b1; b3 = g * b2; }
          }
        }

        let yl: number, yr: number;
        if (ft === 4) {
          // LADDER: the Tabriz transistor ladder, 2x oversampled. Fed at 2x level so it
          // saturates like Tabriz's mixer does, then halved back.
          const inL = xl * 2, inR = xr * 2;
          v.ladL.tick(0.5 * (v.xPrevL + inL)); v.ladL.tick(inL); v.xPrevL = inL;
          v.ladR.tick(0.5 * (v.xPrevR + inR)); v.ladR.tick(inR); v.xPrevR = inR;
          yl = v.ladL.s4 * ladComp * 0.5;
          yr = v.ladR.s4 * ladComp * 0.5;
        } else if (ft === 3) {
          // LP24: Butterworth stage, then the resonant stage
          let v3 = xl - v.bL2;
          let v1 = b1 * v.bL1 + b2 * v3;
          let v2 = v.bL2 + b2 * v.bL1 + b3 * v3;
          v.bL1 = 2 * v1 - v.bL1; v.bL2 = 2 * v2 - v.bL2;
          let u = v2;
          v3 = u - v.aL2; v1 = a1 * v.aL1 + a2 * v3; v2 = v.aL2 + a2 * v.aL1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aL1 = 2 * v1 - v.aL1; v.aL2 = 2 * v2 - v.aL2;
          yl = v2;
          v3 = xr - v.bR2; v1 = b1 * v.bR1 + b2 * v3; v2 = v.bR2 + b2 * v.bR1 + b3 * v3;
          v.bR1 = 2 * v1 - v.bR1; v.bR2 = 2 * v2 - v.bR2;
          u = v2;
          v3 = u - v.aR2; v1 = a1 * v.aR1 + a2 * v3; v2 = v.aR2 + a2 * v.aR1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aR1 = 2 * v1 - v.aR1; v.aR2 = 2 * v2 - v.aR2;
          yr = v2;
        } else {
          let v3 = xl - v.aL2;
          let v1 = a1 * v.aL1 + a2 * v3;
          let v2 = v.aL2 + a2 * v.aL1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aL1 = 2 * v1 - v.aL1; v.aL2 = 2 * v2 - v.aL2;
          yl = ft === 0 ? v2 : ft === 1 ? kq * v1 : xl - kq * v1 - v2;
          v3 = xr - v.aR2; v1 = a1 * v.aR1 + a2 * v3; v2 = v.aR2 + a2 * v.aR1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aR1 = 2 * v1 - v.aR1; v.aR2 = 2 * v2 - v.aR2;
          yr = ft === 0 ? v2 : ft === 1 ? kq * v1 : xr - kq * v1 - v2;
        }

        const trem = lt === 2 ? 1 + lfo * depth * 0.5 : 1;
        if (v.released) v.out -= v.out * v.relCoef;
        const gain = v.amp * trem * v.out;
        L[i] += yl * gain;
        if (R) R[i] += yr * gain;
      }

      if (Math.abs(v.aL1) < 1e-20) v.aL1 = 0;
      if (Math.abs(v.aL2) < 1e-20) v.aL2 = 0;
      if (Math.abs(v.aR1) < 1e-20) v.aR1 = 0;
      if (Math.abs(v.aR2) < 1e-20) v.aR2 = 0;
      if (Math.abs(v.bL1) < 1e-20) v.bL1 = 0;
      if (Math.abs(v.bL2) < 1e-20) v.bL2 = 0;
      if (Math.abs(v.bR1) < 1e-20) v.bR1 = 0;
      if (Math.abs(v.bR2) < 1e-20) v.bR2 = 0;
      v.ladL.flush();
      v.ladR.flush();
      if (v.released && v.out < 2e-5) v.active = false;
    }
  }
}
