/**
 * SY-1 HQ engine — AudioWorklet processor.
 *
 * Renders every voice inside one processor (stereo out) and feeds the same
 * FX bus as the Classic engine. Behaviour mirrors the Classic engine and the
 * spec (SY-1-synth-spec.md section 4): same envelope math, same LFO depths,
 * same voice caps, same gain staging. Differences are quality upgrades:
 *  - Band-limited mip-mapped wavetables (half-octave steps) for saw, square and
 *    triangle: as clean as the browser's own oscillators, and cheap per voice
 *  - Unison: up to 7 voices per oscillator, symmetric detune, stereo width
 *  - Zero-delay-feedback (TPT) state-variable filter, coefficients per sample,
 *    so envelope and LFO sweeps are smooth; resonance matches Web Audio's
 *    dB-based Q for LP/HP and linear Q for BP
 *  - Filter envelope follows live knob moves instead of being cancelled
 *
 * Rule: no allocations inside process(). Everything is preallocated.
 */
export {};

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

const POOL = 24;          // voice slots
const MAX_SOUNDING = 10;  // held/ringing voices before the oldest is stolen (spec 6)
const MAX_ACTIVE = 16;    // including release tails
const MAX_UNI = 7;
const PEAK = 0.42;

// ---- lookup sine (linear interpolation) ----
const SINE_N = 2048;
const SINE = new Float32Array(SINE_N + 1);
for (let i = 0; i <= SINE_N; i++) SINE[i] = Math.sin((2 * Math.PI * i) / SINE_N);
function sineAt(ph: number): number {
  const x = ph * SINE_N;
  const i = x | 0;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
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
function buildWave(coef: (h: number) => number, cosine: boolean): Float32Array[] {
  const acc = new Float64Array(TBL_N);
  const out: Float32Array[] = new Array(TBL_COUNT);
  // tables in ascending harmonic count = descending j
  let next = TBL_COUNT - 1;
  for (let h = 1; h <= H_MAX && next >= 0; h++) {
    const a = coef(h);
    if (a !== 0) {
      // rotate a phasor instead of calling sin() per sample
      const w = (2 * Math.PI * h) / TBL_N;
      const cw = Math.cos(w), sw = Math.sin(w);
      let c = 1, s = 0;
      for (let n = 0; n < TBL_N; n++) {
        acc[n] += a * (cosine ? c : s);
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
// Same Fourier series (and so the same phase) as Web Audio's built-in waves,
// so HQ and Classic line up sample for sample:
// saw b_n ~ (-1)^(n+1)/n, square b_n ~ 1/n (odd), triangle b_n ~ sin(n*pi/2)/n^2 (odd)
const TABLES: Float32Array[][] = [
  buildWave((h) => (h % 2 ? 1 : -1) / h, false),
  buildWave((h) => (h % 2 ? 1 / h : 0), false),
  buildWave((h) => (h % 2 ? (((h - 1) / 2) % 2 ? -1 : 1) / (h * h) : 0), false)
];

/** Index of the richest table that stays below Nyquist for phase step dt. */
function tableFor(dt: number): number {
  const limit = 0.5 / Math.max(1e-9, dt);
  if (limit >= H_MAX) return 0;
  const j = Math.ceil(2 * Math.log2(H_MAX / limit));
  return j < 0 ? 0 : j >= TBL_COUNT ? TBL_COUNT - 1 : j;
}

function readTable(t: Float32Array, ph: number): number {
  const x = ph * TBL_N;
  const i = x | 0;
  return t[i & TBL_MASK] + (t[(i & TBL_MASK) + 1] - t[i & TBL_MASK]) * (x - i);
}

const WAVE: Record<string, number> = { sawtooth: 0, square: 1, triangle: 2, sine: 3 };
const FILT: Record<string, number> = { lowpass: 0, bandpass: 1, highpass: 2 };
const LFOT: Record<string, number> = { pitch: 0, filter: 1, amp: 2 };

// One smoothed parameter (one-pole per block, linear per sample for gains)
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
}

class Voice {
  active = false;
  released = false;
  id = 0;
  order = 0;
  freq = 440;
  vel = 1;
  // oscillators
  ph1 = new Float64Array(MAX_UNI);
  ph2 = new Float64Array(MAX_UNI);
  tb1 = new Int32Array(MAX_UNI); // wavetable index per unison voice (per block)
  tb2 = new Int32Array(MAX_UNI);
  subPh = 0;
  lfoPh = 0;
  // envelopes
  t = 0;          // seconds since note on
  amp = 0.0001;
  fenv = 0;
  out = 1;        // release stage
  relCoef = 0;
  // filter state (L/R)
  aL1 = 0; aL2 = 0; aR1 = 0; aR2 = 0;

  reset(id: number, order: number, freq: number, vel: number): void {
    this.active = true;
    this.released = false;
    this.id = id;
    this.order = order;
    this.freq = freq;
    this.vel = vel;
    for (let k = 0; k < MAX_UNI; k++) {
      // unison voices start at random phases; voice 0 starts at 0 like Classic
      this.ph1[k] = k === 0 ? 0 : Math.random();
      this.ph2[k] = k === 0 ? 0 : Math.random();
    }
    this.subPh = 0;
    this.lfoPh = 0;
    this.t = 0;
    this.amp = 0.0001;
    this.fenv = 0;
    this.out = 1;
    this.relCoef = 0;
    this.aL1 = this.aL2 = this.aR1 = this.aR2 = 0;
  }
}

class SY1Processor extends AudioWorkletProcessor {
  // discrete params
  w1 = 0; w2 = 1; oct1 = 0; oct2 = 0; ftype = 0; lfoTarget = 0; uni = 1;
  // time params (seconds)
  aA = 0.008; aD = 0.3; aR = 0.35; fA = 0.01; fD = 0.35;
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
  bend = new Smooth(0);
  modWheel = new Smooth(0);
  smooths: Smooth[];

  voices: Voice[] = [];
  counter = 0;
  rng = 0x9e3779b9;

  // per-block unison tables
  uRatio = new Float64Array(MAX_UNI);
  uGL = new Float64Array(MAX_UNI);
  uGR = new Float64Array(MAX_UNI);

  constructor() {
    super();
    for (let i = 0; i < POOL; i++) this.voices.push(new Voice());
    this.smooths = [this.mix, this.sub, this.noise, this.cutoff, this.res, this.envAmt, this.fS, this.aS,
      this.velSens, this.lfoRate, this.lfoDepth, this.detune2, this.bendRange, this.uniDetune, this.uniWidth,
      this.bend, this.modWheel];
    this.port.onmessage = (e: MessageEvent) => this.onMessage(e.data);
  }

  setParam(key: string, v: unknown): void {
    const n = Number(v);
    switch (key) {
      case "osc1Wave": this.w1 = WAVE[String(v)] ?? 0; break;
      case "osc2Wave": this.w2 = WAVE[String(v)] ?? 1; break;
      case "osc1Oct": this.oct1 = n; break;
      case "osc2Oct": this.oct2 = n; break;
      case "filterType": this.ftype = FILT[String(v)] ?? 0; break;
      case "lfoTarget": this.lfoTarget = LFOT[String(v)] ?? 0; break;
      case "unison": this.uni = Math.max(1, Math.min(MAX_UNI, Math.round(n))); break;
      case "aA": this.aA = n; break;
      case "aD": this.aD = n; break;
      case "aR": this.aR = n; break;
      case "fA": this.fA = n; break;
      case "fD": this.fD = n; break;
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
      default: break;
    }
  }

  onMessage(m: any): void {
    if (!m) return;
    if (m.t === "patch") {
      for (const k in m.patch) this.setParam(k, m.patch[k]);
      // jump smoothed values on a full patch load
      for (let i = 0; i < this.smooths.length; i++) this.smooths[i].cur = this.smooths[i].prev = this.smooths[i].target;
    } else if (m.t === "param") this.setParam(m.key, m.value);
    else if (m.t === "on") this.noteOn(m.id, m.midi, m.vel);
    else if (m.t === "off") this.noteOff(m.id, 0);
    else if (m.t === "kill") this.noteOff(m.id, 0.005);
    else if (m.t === "alloff") for (const v of this.voices) if (v.active) this.release(v, 0);
    else if (m.t === "bend") this.bend.target = Number(m.v) || 0;
    else if (m.t === "mod") this.modWheel.target = Number(m.v) || 0;
  }

  release(v: Voice, fastTau: number): void {
    if (v.released) return;
    v.released = true;
    const tau = fastTau || Math.max(0.005, this.aR / 4);
    v.relCoef = 1 - Math.exp(-1 / (tau * sampleRate));
  }

  noteOff(id: number, fastTau: number): void {
    for (const v of this.voices) if (v.active && v.id === id) this.release(v, fastTau);
  }

  noteOn(id: number, midi: number, vel: number): void {
    // Voice stealing (same rules as Classic): count only sounding voices
    let sounding = 0;
    let oldestSounding: Voice | null = null;
    let active = 0;
    let oldestActive: Voice | null = null;
    for (const v of this.voices) {
      if (!v.active) continue;
      active++;
      if (!oldestActive || v.order < oldestActive.order) oldestActive = v;
      if (!v.released) {
        sounding++;
        if (!oldestSounding || v.order < oldestSounding.order) oldestSounding = v;
      }
    }
    if (sounding >= MAX_SOUNDING && oldestSounding) this.release(oldestSounding, 0.02);
    if (active >= MAX_ACTIVE && oldestActive) this.release(oldestActive, 0.005);

    let slot: Voice | null = null;
    for (const v of this.voices) if (!v.active) { slot = v; break; }
    if (!slot) {
      // pool exhausted (only possible with extreme note storms): reuse the oldest
      for (const v of this.voices) if (!slot || v.order < slot.order) slot = v;
    }
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    slot!.reset(id, ++this.counter, freq, Math.max(0, Math.min(1, vel)));
  }

  nextNoise(): number {
    let x = this.rng;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.rng = x;
    return x / 2147483648 - 1;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0];
    const R = out.length > 1 ? out[1] : out[0];
    const n = L.length;
    L.fill(0);
    if (R !== L) R.fill(0);

    const sr = sampleRate;
    const blockA = 1 - Math.exp(-n / (0.01 * sr)); // ~10 ms smoothing
    for (let i = 0; i < this.smooths.length; i++) this.smooths[i].step(blockA);

    // unison tables (shared by all voices this block)
    const N = this.uni;
    const norm = 1 / Math.sqrt(N);
    for (let k = 0; k < N; k++) {
      const pos = N === 1 ? 0 : k / (N - 1) - 0.5;          // -0.5..0.5
      this.uRatio[k] = Math.pow(2, (pos * this.uniDetune.cur) / 1200);
      const pan = N === 1 ? 0 : 2 * pos * this.uniWidth.cur; // -w..w
      const ang = ((pan + 1) * Math.PI) / 4;
      this.uGL[k] = Math.cos(ang) * Math.SQRT2 * norm;
      this.uGR[k] = Math.sin(ang) * Math.SQRT2 * norm;
    }

    const res = this.res.cur;
    const kq = this.ftype === 1 ? 1 / Math.max(0.1, res) : 1 / Math.pow(10, res / 20);
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
    const velS = this.velSens.cur;
    const aS = this.aS.cur;
    const maxFc = sr * 0.45;
    const invN = 1 / n;
    const w1 = this.w1, w2 = this.w2, ft = this.ftype, lt = this.lfoTarget;

    for (const v of this.voices) {
      if (!v.active) continue;
      const peak = PEAK * (1 - velS + velS * v.vel);
      const sus = Math.max(0.0001, peak * aS);
      let g = 0, a1 = 0, a2 = 0, a3 = 0;
      // pick wavetables for this block (pitch incl. bend; LFO vibrato stays inside the margin)
      const fb = v.freq * (bendCents === 0 ? 1 : Math.pow(2, bendCents / 1200));
      for (let k = 0; k < N; k++) {
        v.tb1[k] = tableFor((fb * ratio1 * this.uRatio[k] * 1.04) / sr);
        v.tb2[k] = tableFor((fb * ratio2 * this.uRatio[k] * 1.04) / sr);
      }
      const T1 = w1 < 3 ? TABLES[w1] : null;
      const T2 = w2 < 3 ? TABLES[w2] : null;

      for (let i = 0; i < n; i++) {
        const fr = i * invN;
        // LFO
        const lfo = depth > 0 ? sineAt(v.lfoPh) : 0;
        v.lfoPh += lfoInc;
        if (v.lfoPh >= 1) v.lfoPh -= 1;

        // pitch (bend + LFO pitch target ±60 cents)
        let cents = bendCents;
        if (lt === 0) cents += lfo * depth * 60;
        const pm = cents === 0 ? 1 : Math.pow(2, cents / 1200);
        const f0 = v.freq * pm;

        // gains (linear per sample between block values: no zipper)
        const mixV = this.mix.prev + (this.mix.cur - this.mix.prev) * fr;
        const l1 = 1 - mixV;
        const l2 = mixV;
        const subG = (this.sub.prev + (this.sub.cur - this.sub.prev) * fr) * 0.8;
        const noiseG = (this.noise.prev + (this.noise.cur - this.noise.prev) * fr) * 0.5;

        let xl = 0, xr = 0;
        for (let k = 0; k < N; k++) {
          const ur = this.uRatio[k];
          // OSC 1
          if (l1 > 0) {
            const dt = (f0 * ratio1 * ur) / sr;
            let ph = v.ph1[k];
            const s = (T1 ? readTable(T1[v.tb1[k]], ph) : sineAt(ph)) * l1;
            ph += dt; if (ph >= 1) ph -= 1; v.ph1[k] = ph;
            xl += s * this.uGL[k]; xr += s * this.uGR[k];
          }
          // OSC 2
          if (l2 > 0) {
            const dt = (f0 * ratio2 * ur) / sr;
            let ph = v.ph2[k];
            const s = (T2 ? readTable(T2[v.tb2[k]], ph) : sineAt(ph)) * l2;
            ph += dt; if (ph >= 1) ph -= 1; v.ph2[k] = ph;
            xl += s * this.uGL[k]; xr += s * this.uGR[k];
          }
        }
        // SUB (sine, one octave below OSC 1) and NOISE, centred
        let c = 0;
        if (subG > 0) c += sineAt(v.subPh) * subG;
        v.subPh += (f0 * ratioSub) / sr;
        if (v.subPh >= 1) v.subPh -= 1;
        if (noiseG > 0) c += this.nextNoise() * noiseG;
        xl = (xl + c) * 0.5;
        xr = (xr + c) * 0.5;

        // envelopes (spec section 4)
        const t = v.t;
        if (t < attackA) v.amp = 0.0001 + (peak - 0.0001) * (t / attackA);
        else v.amp += (sus - v.amp) * decayC;
        if (t < attackF) v.fenv = t / attackF;
        else v.fenv += (fS - v.fenv) * fDecayC;
        v.t = t + 1 / sr;

        // filter coefficients every 4 samples (envelope + LFO sweeps stay smooth)
        if ((i & 3) === 0) {
          let fc = base + (top - base) * v.fenv;
          if (lt === 1) fc *= Math.pow(2, lfo * depth * 2);
          if (fc < 20) fc = 20; else if (fc > maxFc) fc = maxFc;
          g = Math.tan((Math.PI * fc) / sr);
          a1 = 1 / (1 + g * (g + kq));
          a2 = g * a1;
          a3 = g * a2;
        }
        // TPT state-variable filter, left
        let v3 = xl - v.aL2;
        let v1 = a1 * v.aL1 + a2 * v3;
        let v2 = v.aL2 + a2 * v.aL1 + a3 * v3;
        v.aL1 = 2 * v1 - v.aL1;
        v.aL2 = 2 * v2 - v.aL2;
        const yl = ft === 0 ? v2 : ft === 1 ? kq * v1 : xl - kq * v1 - v2;
        // right
        v3 = xr - v.aR2;
        v1 = a1 * v.aR1 + a2 * v3;
        v2 = v.aR2 + a2 * v.aR1 + a3 * v3;
        v.aR1 = 2 * v1 - v.aR1;
        v.aR2 = 2 * v2 - v.aR2;
        const yr = ft === 0 ? v2 : ft === 1 ? kq * v1 : xr - kq * v1 - v2;

        // amp, tremolo (LFO amp target ±50 %), release stage
        const trem = lt === 2 ? 1 + lfo * depth * 0.5 : 1;
        if (v.released) v.out -= v.out * v.relCoef;
        const gain = v.amp * trem * v.out;
        L[i] += yl * gain;
        if (R !== L) R[i] += yr * gain;
      }

      // flush denormals, end finished voices (below about -94 dB)
      if (Math.abs(v.aL1) < 1e-20) v.aL1 = 0;
      if (Math.abs(v.aL2) < 1e-20) v.aL2 = 0;
      if (Math.abs(v.aR1) < 1e-20) v.aR1 = 0;
      if (Math.abs(v.aR2) < 1e-20) v.aR2 = 0;
      if (v.released && v.out < 2e-5) v.active = false;
    }
    return true;
  }
}

registerProcessor("sy1-voices", SY1Processor);
