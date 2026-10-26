/**
 * SY-1 DSP — Analog engine (Tabriz): voices, parameters, event handling.
 *
 * PORTABILITY RULE: no Web Audio / DOM / worklet code here (see analog.ts).
 * The host calls:
 *   setParam(key, value)              parameter change (strings for choices)
 *   noteOn(id, midi, cents, vel, offset, fromHz, glide)
 *   noteOff(id, offset) / kill(id, offset) / glideTo(id, midi, cents, glide)
 *   allOff(), setBend(v -1..1), setMod(v 0..1)
 *   render(L, R, n)                   adds n samples into L and R
 *
 * Signal per voice:
 *   OSC1 + OSC2 + OSC3 (PolyBLEP, analog drift) + SUB + NOISE
 *     -> mixer saturation -> LADDER (2x oversampled, key track, contour)
 *     -> amp contour (RC envelope) -> out
 */

import { AnalogEnv, fastTanh, Ladder, LADDER_MODE, oscSample, PEAK, resToLadder, WAVE_ID } from "./analog";

export const POOL = 24;
export const MAX_SOUNDING = 10;
export const MAX_ACTIVE = 16;

class Smooth {
  target: number; cur: number; prev: number;
  constructor(v: number) { this.target = v; this.cur = v; this.prev = v; }
  step(a: number): void {
    this.prev = this.cur;
    this.cur += (this.target - this.cur) * a;
    if (Math.abs(this.target - this.cur) < 1e-9) this.cur = this.target;
  }
  snap(): void { this.cur = this.prev = this.target; }
}

export class AnalogVoice {
  active = false;
  released = false;
  fast = false;
  id = 0;
  order = 0;
  vel = 1;
  delay = 0;       // samples until the note starts
  relDelay = -1;   // samples until release (-1 = none)
  relFast = 0;
  lf = 0;          // log2(frequency)
  lfTarget = 0;
  glideC = 1;
  ph = new Float64Array(4);       // osc1, osc2, osc3, sub
  drift = new Float64Array(3);    // random-walk state per oscillator (-1..1)
  driftFix = new Float64Array(3); // fixed per-note offset (-1..1)
  lfoPh = 0;
  lfoHold = 0;
  amp = new AnalogEnv();
  fenv = new AnalogEnv();
  ladder = new Ladder();
  xPrev = 0;
}

export class AnalogEngine {
  sr: number;
  voices: AnalogVoice[] = [];
  counter = 0;
  rng = 0x2545f491;

  // discrete / time params
  w1 = 0; w2 = 1; w3 = 2;
  oct1 = 0; oct2 = 0; oct3 = -1;
  mode = 0;
  lfoTarget = 0; lfoShape = 0;
  aA = 0.008; aD = 0.3; aR = 0.35; fA = 0.01; fD = 0.35;

  // continuous, smoothed per block
  mix = new Smooth(0.45);
  lvl3 = new Smooth(0);
  sub = new Smooth(0.2);
  noise = new Smooth(0);
  det2 = new Smooth(8);
  det3 = new Smooth(-5);
  cutoff = new Smooth(2200);
  res = new Smooth(2);
  envAmt = new Smooth(0.45);
  fS = new Smooth(0.25);
  aS = new Smooth(0.75);
  keyTrack = new Smooth(0.33);
  fDrive = new Smooth(0.3);
  driftAmt = new Smooth(0.25);
  velSens = new Smooth(0.5);
  lfoRate = new Smooth(5);
  lfoDepth = new Smooth(0);
  bendRange = new Smooth(2);
  bend = new Smooth(0);
  modWheel = new Smooth(0);
  smooths: Smooth[];

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    for (let i = 0; i < POOL; i++) this.voices.push(new AnalogVoice());
    this.smooths = [this.mix, this.lvl3, this.sub, this.noise, this.det2, this.det3, this.cutoff, this.res,
      this.envAmt, this.fS, this.aS, this.keyTrack, this.fDrive, this.driftAmt, this.velSens, this.lfoRate,
      this.lfoDepth, this.bendRange, this.bend, this.modWheel];
  }

  setParam(key: string, v: unknown): void {
    const n = Number(v);
    const s = String(v);
    switch (key) {
      case "osc1Wave": this.w1 = WAVE_ID[s] ?? 0; break;
      case "osc2Wave": this.w2 = WAVE_ID[s] ?? 1; break;
      case "osc3Wave": this.w3 = WAVE_ID[s] ?? 2; break;
      case "osc1Oct": this.oct1 = n; break;
      case "osc2Oct": this.oct2 = n; break;
      case "osc3Oct": this.oct3 = n; break;
      case "filterType": this.mode = LADDER_MODE[s] ?? 0; break;
      case "lfoTarget": this.lfoTarget = s === "filter" ? 1 : s === "amp" ? 2 : 0; break;
      case "lfoShape": this.lfoShape = ({ sine: 0, triangle: 1, square: 2, sawtooth: 3, sh: 4 } as Record<string, number>)[s] ?? 0; break;
      case "aA": this.aA = n; break;
      case "aD": this.aD = n; break;
      case "aR": this.aR = n; break;
      case "fA": this.fA = n; break;
      case "fD": this.fD = n; break;
      case "oscMix": this.mix.target = n; break;
      case "osc3Level": this.lvl3.target = n; break;
      case "sub": this.sub.target = n; break;
      case "noise": this.noise.target = n; break;
      case "osc2Detune": this.det2.target = n; break;
      case "osc3Detune": this.det3.target = n; break;
      case "cutoff": this.cutoff.target = n; break;
      case "res": this.res.target = n; break;
      case "envAmt": this.envAmt.target = n; break;
      case "fS": this.fS.target = n; break;
      case "aS": this.aS.target = n; break;
      case "keyTrack": this.keyTrack.target = n; break;
      case "filterDrive": this.fDrive.target = n; break;
      case "drift": this.driftAmt.target = n; break;
      case "velSens": this.velSens.target = n; break;
      case "lfoRate": this.lfoRate.target = n; break;
      case "lfoDepth": this.lfoDepth.target = n; break;
      case "bendRange": this.bendRange.target = n; break;
      default: break;
    }
  }

  snapParams(): void {
    for (let i = 0; i < this.smooths.length; i++) this.smooths[i].snap();
  }

  setBend(v: number): void { this.bend.target = v; }
  setMod(v: number): void { this.modWheel.target = v; }

  rand(): number {
    let x = this.rng;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.rng = x;
    return x / 2147483648 - 1;
  }

  find(id: number): AnalogVoice | null {
    for (const v of this.voices) if (v.active && v.id === id) return v;
    return null;
  }

  release(v: AnalogVoice, fastTau: number): void {
    if (v.released) return;
    v.released = true;
    if (fastTau > 0) {
      v.fast = true;
      v.amp.fastRelease(fastTau, this.sr);
      v.fenv.fastRelease(fastTau, this.sr);
    } else {
      v.amp.gate(false);
      v.fenv.gate(false);
    }
  }

  noteOn(id: number, midi: number, cents: number, vel: number, offset: number, fromHz: number, glide: number): void {
    let sounding = 0, active = 0;
    let oldS: AnalogVoice | null = null, oldA: AnalogVoice | null = null;
    for (const v of this.voices) {
      if (!v.active) continue;
      active++;
      if (!oldA || v.order < oldA.order) oldA = v;
      if (!v.released) {
        sounding++;
        if (!oldS || v.order < oldS.order) oldS = v;
      }
    }
    if (sounding >= MAX_SOUNDING && oldS) this.release(oldS, 0.02);
    if (active >= MAX_ACTIVE && oldA) this.release(oldA, 0.005);
    let slot: AnalogVoice | null = null;
    for (const v of this.voices) if (!v.active) { slot = v; break; }
    if (!slot) for (const v of this.voices) if (!slot || v.order < slot.order) slot = v;
    const v = slot!;
    const target = Math.log2(440) + (midi - 69) / 12 + cents / 1200;
    v.active = true;
    v.released = false;
    v.fast = false;
    v.id = id;
    v.order = ++this.counter;
    v.vel = Math.max(0, Math.min(1, vel));
    v.delay = Math.max(0, offset | 0);
    v.relDelay = -1;
    v.lfTarget = target;
    if (fromHz > 0 && glide > 0.004) {
      v.lf = Math.log2(fromHz);
      v.glideC = 1 - Math.exp(-1 / ((glide / 3) * this.sr));
    } else {
      v.lf = target;
      v.glideC = 1;
    }
    // free-running oscillators, like hardware: random start phase per note
    for (let k = 0; k < 4; k++) v.ph[k] = (this.rand() + 1) * 0.5;
    for (let k = 0; k < 3; k++) { v.drift[k] = this.rand() * 0.5; v.driftFix[k] = this.rand(); }
    v.lfoPh = 0;
    v.lfoHold = this.rand();
    v.amp.v = 0; v.fenv.v = 0;
    v.amp.gate(true); v.fenv.gate(true);
    v.ladder.reset();
    v.xPrev = 0;
  }

  noteOff(id: number, offset: number, fast: boolean): void {
    const v = this.find(id);
    if (!v) return;
    v.relDelay = Math.max(offset | 0, v.delay);
    v.relFast = fast ? 0.005 : 0;
  }

  glideTo(id: number, midi: number, cents: number, glide: number): void {
    const v = this.find(id);
    if (!v) return;
    v.lfTarget = Math.log2(440) + (midi - 69) / 12 + cents / 1200;
    v.glideC = glide > 0.004 ? 1 - Math.exp(-1 / ((glide / 3) * this.sr)) : 1;
  }

  allOff(): void {
    for (const v of this.voices) if (v.active) this.release(v, 0);
  }

  lfoValue(v: AnalogVoice): number {
    const p = v.lfoPh;
    switch (this.lfoShape) {
      case 1: return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      case 2: return p < 0.5 ? 1 : -1;
      case 3: return 1 - 2 * p;
      case 4: return v.lfoHold;
      default: return Math.sin(2 * Math.PI * p);
    }
  }

  render(L: Float32Array, R: Float32Array | null, n: number): void {
    const sr = this.sr;
    const fsOs = sr * 2;
    const blockA = 1 - Math.exp(-n / (0.01 * sr)); // ~10 ms parameter smoothing
    for (let i = 0; i < this.smooths.length; i++) this.smooths[i].step(blockA);

    const invSr = 1 / sr;
    const invN = 1 / n;
    const r = resToLadder(this.res.cur);
    const comp = 1 + 0.9 * r;                         // pass-band loss with resonance (ladder trait)
    const inGain = 1 + this.fDrive.cur * 4;           // drive into the ladder
    const outGain = comp / Math.min(2.2, inGain * 0.55 + 0.45);
    const ratio1 = Math.pow(2, this.oct1);
    const ratio2 = Math.pow(2, this.oct2 + this.det2.cur / 1200);
    const ratio3 = Math.pow(2, this.oct3 + this.det3.cur / 1200);
    const ratioSub = Math.pow(2, this.oct1 - 1);
    const depth = Math.min(1, this.lfoDepth.cur + this.modWheel.cur);
    const bendC = this.bend.cur * this.bendRange.cur * 100;
    const lfoInc = this.lfoRate.cur * invSr;
    const envOct = this.envAmt.cur * 6;
    const kt = this.keyTrack.cur;
    const driftC = this.driftAmt.cur;
    const velS = this.velSens.cur;
    const maxFc = sr * 0.45;
    const lt = this.lfoTarget;
    const mode = this.mode;
    const w1 = this.w1, w2 = this.w2, w3 = this.w3;
    const C4 = Math.log2(261.6256);

    for (const v of this.voices) {
      if (!v.active) continue;
      if (!v.fast) {
        v.amp.set(this.aA, this.aD, this.aS.cur, this.aR, sr);
        v.fenv.set(this.fA, this.fD, this.fS.cur, this.aR, sr);
      }
      const gainV = PEAK * (1 - velS + velS * v.vel);
      // slow analog drift: random walk per oscillator, updated once per block
      for (let k = 0; k < 3; k++) {
        let d = v.drift[k] + this.rand() * 0.06;
        d *= 0.996;
        v.drift[k] = d > 1 ? 1 : d < -1 ? -1 : d;
      }
      const dr1 = Math.pow(2, (driftC * (6 * v.drift[0] + 2 * v.driftFix[0])) / 1200);
      const dr2 = Math.pow(2, (driftC * (6 * v.drift[1] + 2 * v.driftFix[1])) / 1200);
      const dr3 = Math.pow(2, (driftC * (6 * v.drift[2] + 2 * v.driftFix[2])) / 1200);

      for (let i = 0; i < n; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        if (v.relDelay === 0) { this.release(v, v.relFast); v.relDelay = -1; }
        else if (v.relDelay > 0) v.relDelay--;
        const fr = i * invN;

        const lfo = depth > 0 ? this.lfoValue(v) : 0;
        v.lfoPh += lfoInc;
        if (v.lfoPh >= 1) { v.lfoPh -= 1; v.lfoHold = this.rand(); }

        if (v.lf !== v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (Math.abs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }
        let cents = bendC;
        if (lt === 0) cents += lfo * depth * 60;
        const lp = v.lf + cents / 1200;
        const f0 = Math.pow(2, lp);

        // oscillators
        const mixV = this.mix.prev + (this.mix.cur - this.mix.prev) * fr;
        const l3 = this.lvl3.prev + (this.lvl3.cur - this.lvl3.prev) * fr;
        let x = 0;
        let dt = f0 * ratio1 * dr1 * invSr;
        if (dt > 0.49) dt = 0.49;
        x += oscSample(w1, v.ph[0], dt) * (1 - mixV);
        v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1;
        dt = f0 * ratio2 * dr2 * invSr;
        if (dt > 0.49) dt = 0.49;
        x += oscSample(w2, v.ph[1], dt) * mixV;
        v.ph[1] += dt; if (v.ph[1] >= 1) v.ph[1] -= 1;
        if (l3 > 0) {
          dt = f0 * ratio3 * dr3 * invSr;
          if (dt > 0.49) dt = 0.49;
          x += oscSample(w3, v.ph[2], dt) * l3;
          v.ph[2] += dt; if (v.ph[2] >= 1) v.ph[2] -= 1;
        }
        const subG = this.sub.cur * 0.8;
        if (subG > 0) x += Math.sin(2 * Math.PI * v.ph[3]) * subG;
        v.ph[3] += f0 * ratioSub * dr1 * invSr; if (v.ph[3] >= 1) v.ph[3] -= 1;
        const nz = this.noise.cur * 0.5;
        if (nz > 0) x += this.rand() * nz;
        // mixer: gentle overdrive when the levels sum above 1 (like the hardware mixer)
        x = fastTanh(x * 0.6) * inGain;

        // contours
        const ae = v.amp.tick();
        const fe = v.fenv.tick();

        // cutoff: base * contour (exponential) * key tracking * LFO
        // (control rate: every 4 samples, which keeps CPU low on phones)
        const lad = v.ladder;
        if ((i & 3) === 0) {
          let fc = this.cutoff.prev + (this.cutoff.cur - this.cutoff.prev) * fr;
          fc *= Math.pow(2, envOct * fe + kt * (lp - C4) + (lt === 1 ? lfo * depth * 2 : 0));
          if (fc < 20) fc = 20; else if (fc > maxFc) fc = maxFc;
          lad.setCutoff(fc, fsOs, r);
        }
        // 2x oversampling: half-way input, then the new input
        lad.tick(0.5 * (v.xPrev + x));
        lad.tick(x);
        v.xPrev = x;
        let y = lad.out(mode) * outGain;

        const trem = lt === 2 ? 1 + lfo * depth * 0.5 : 1;
        y *= ae * gainV * trem;
        L[i] += y;
        if (R) R[i] += y;
      }
      v.ladder.flush();
      if (v.released && v.amp.stage === 0) v.active = false;
    }
  }
}
