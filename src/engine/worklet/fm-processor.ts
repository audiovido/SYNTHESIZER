/**
 * SY-1 FM engine — AudioWorklet processor ("sy1-fm") for Kashan.
 *
 * 4-operator phase modulation, 8 algorithms, 8 sounding voices.
 *  - Each operator: frequency RATIO, LEVEL and its own ADSR envelope.
 *    A carrier's LEVEL is its loudness; a modulator's LEVEL is its modulation
 *    index (how much it bends the operator it feeds).
 *  - FEEDBACK on operator 4 (it modulates itself: saw/noise-like edges).
 *  - BRIGHT scales every modulator at once; VEL→MOD makes soft notes darker;
 *    modulation also eases off towards the top of the keyboard (key scaling).
 *  - TONE: a gentle output low-pass. Mod wheel adds vibrato.
 *
 * Algorithms (operators feed downwards, "+" = sounds together):
 *   1  4→3→2→1          2  (3+4)→2→1        3  3→2→1 + 4→1     4  4→3→1 + 2→1
 *   5  4→3 + 2→1         6  4→(1+2+3)         7  4→3 + 2 + 1     8  1+2+3+4
 *
 * Rule: no allocations inside process(). Everything is preallocated.
 */
export {};

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

const POOL = 16;
const MAX_SOUNDING = 8;
const MAX_ACTIVE = 12;
const QUEUE = 512;
const TAB_N = 4096;
const TAB_MASK = TAB_N - 1;
const SINE = new Float32Array(TAB_N + 1);
for (let i = 0; i <= TAB_N; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TAB_N);

// Which operators modulate each operator (index 0..3 = op1..op4), and which are carriers.
const ALGOS: { mods: number[][]; car: number[] }[] = [
  { mods: [[1], [2], [3], []], car: [0] },
  { mods: [[1], [2, 3], [], []], car: [0] },
  { mods: [[1, 3], [2], [], []], car: [0] },
  { mods: [[1, 2], [], [3], []], car: [0] },
  { mods: [[1], [], [3], []], car: [0, 2] },
  { mods: [[3], [3], [3], []], car: [0, 1, 2] },
  { mods: [[], [], [3], []], car: [0, 1, 2] },
  { mods: [[], [], [], []], car: [0, 1, 2, 3] }
];

class Smooth {
  target: number;
  cur: number;
  constructor(v: number) {
    this.target = v;
    this.cur = v;
  }
  step(a: number): void {
    this.cur += (this.target - this.cur) * a;
  }
}

class Ev {
  type = 0; // 1 on, 2 off, 3 kill, 4 glide
  at = 0;
  id = 0;
  midi = 60;
  cents = 0;
  vel = 1;
  from = 0;
  glide = 0;
}

class FmVoice {
  active = false;
  released = false;
  id = 0;
  order = 0;
  vel = 1;
  midi = 60;
  delay = 0;
  relDelay = -1;
  relFast = 0;
  lf = 0;
  lfTarget = 0;
  glideC = 1;
  phase = new Float64Array(4);
  env = new Float64Array(4);
  stage = new Int32Array(4); // 0 attack, 1 decay, 2 sustain, 3 release, 4 off
  fb1 = 0;
  fb2 = 0;
  silent = 0;

  start(id: number, order: number, hz: number, vel: number, midi: number, delay: number): void {
    this.active = true;
    this.released = false;
    this.id = id;
    this.order = order;
    this.vel = vel;
    this.midi = midi;
    this.delay = delay;
    this.relDelay = -1;
    this.relFast = 0;
    this.lf = Math.log2(hz);
    this.lfTarget = this.lf;
    this.glideC = 1;
    for (let k = 0; k < 4; k++) {
      this.phase[k] = 0;
      this.env[k] = 0;
      this.stage[k] = 0;
    }
    this.fb1 = 0;
    this.fb2 = 0;
    this.silent = 0;
  }
}

class SY1FmProcessor extends AudioWorkletProcessor {
  voices: FmVoice[] = [];
  queue: Ev[] = [];
  qLen = 0;
  counter = 0;

  algo = 0;
  ratio = new Float64Array([1, 1, 1, 1]);
  level: Smooth[] = [new Smooth(1), new Smooth(0.5), new Smooth(0.3), new Smooth(0.2)];
  a = new Float64Array([0.002, 0.002, 0.002, 0.002]);
  d = new Float64Array([0.6, 0.6, 0.6, 0.6]);
  s = new Float64Array([0.5, 0.5, 0.5, 0.5]);
  r = new Float64Array([0.4, 0.4, 0.4, 0.4]);
  feedback = new Smooth(0);
  bright = new Smooth(0.5);
  velMod = 0.5;
  velSens = 0.6;
  tone = new Smooth(1);
  bendRange = 2;
  bend = new Smooth(0);
  modWheel = new Smooth(0);
  vibPhase = 0;
  lpL = 0;
  lpR = 0;
  // preallocated per-block scratch
  aInc = new Float64Array(4);
  dC = new Float64Array(4);
  rC = new Float64Array(4);
  isCar = [false, false, false, false];
  outs = new Float64Array(4);

  constructor() {
    super();
    for (let i = 0; i < POOL; i++) this.voices.push(new FmVoice());
    for (let i = 0; i < QUEUE; i++) this.queue.push(new Ev());
    this.port.onmessage = (e: MessageEvent) => this.onMessage(e.data);
  }

  setParam(key: string, v: unknown): void {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    const m = /^op([1-4])(Ratio|Level|A|D|S|R)$/.exec(key);
    if (m) {
      const k = Number(m[1]) - 1;
      switch (m[2]) {
        case "Ratio": this.ratio[k] = Math.max(0.25, Math.min(32, n)); break;
        case "Level": this.level[k].target = Math.max(0, Math.min(1, n)); break;
        case "A": this.a[k] = Math.max(0.001, n); break;
        case "D": this.d[k] = Math.max(0.005, n); break;
        case "S": this.s[k] = Math.max(0, Math.min(1, n)); break;
        case "R": this.r[k] = Math.max(0.005, n); break;
      }
      return;
    }
    switch (key) {
      case "fmAlgo": this.algo = Math.max(0, Math.min(7, Math.round(n) - 1)); break;
      case "fmFeedback": this.feedback.target = n; break;
      case "fmBright": this.bright.target = n; break;
      case "fmVelMod": this.velMod = n; break;
      case "fmTone": this.tone.target = n; break;
      case "velSens": this.velSens = n; break;
      case "bendRange": this.bendRange = n; break;
      default: break;
    }
  }

  enqueue(type: number, m: any): void {
    if (this.qLen >= QUEUE) return;
    const e = this.queue[this.qLen++];
    e.type = type;
    e.at = Number(m.at) || 0;
    e.id = m.id | 0;
    e.midi = Number(m.midi) || 60;
    e.cents = Number(m.cents) || 0;
    e.vel = m.vel === undefined ? 1 : Number(m.vel);
    e.from = Number(m.from) || 0;
    e.glide = Number(m.glide) || 0;
  }

  onMessage(m: any): void {
    if (!m) return;
    switch (m.t) {
      case "patch":
        for (const k in m.patch) this.setParam(k, m.patch[k]);
        for (let i = 0; i < 4; i++) this.level[i].cur = this.level[i].target;
        this.feedback.cur = this.feedback.target;
        this.bright.cur = this.bright.target;
        this.tone.cur = this.tone.target;
        break;
      case "param": this.setParam(m.key, m.value); break;
      case "on": this.enqueue(1, m); break;
      case "off": this.enqueue(2, m); break;
      case "kill": this.enqueue(3, m); break;
      case "glide": this.enqueue(4, m); break;
      case "alloff":
        this.qLen = 0;
        for (const v of this.voices) if (v.active) { v.released = true; v.relFast = 0.015; for (let k = 0; k < 4; k++) v.stage[k] = 3; }
        break;
      case "bend": this.bend.target = Number(m.v) || 0; break;
      case "mod": this.modWheel.target = Number(m.v) || 0; break;
      default: break;
    }
  }

  find(id: number): FmVoice | null {
    for (const v of this.voices) if (v.active && v.id === id) return v;
    return null;
  }

  release(v: FmVoice, fast: number): void {
    v.released = true;
    v.relFast = fast;
    for (let k = 0; k < 4; k++) if (v.stage[k] < 3) v.stage[k] = 3;
  }

  noteOn(e: Ev, offset: number): void {
    let sounding = 0, active = 0;
    let oldS: FmVoice | null = null, oldA: FmVoice | null = null;
    for (const v of this.voices) {
      if (!v.active) continue;
      active++;
      if (!oldA || v.order < oldA.order) oldA = v;
      if (!v.released) { sounding++; if (!oldS || v.order < oldS.order) oldS = v; }
    }
    if (sounding >= MAX_SOUNDING && oldS) this.release(oldS, 0.02);
    if (active >= MAX_ACTIVE && oldA) this.release(oldA, 0.005);
    let slot: FmVoice | null = null;
    for (const v of this.voices) if (!v.active) { slot = v; break; }
    if (!slot) for (const v of this.voices) if (!slot || v.order < slot.order) slot = v;
    const target = 440 * Math.pow(2, (e.midi - 69) / 12 + e.cents / 1200);
    const s = slot!;
    s.start(e.id, ++this.counter, e.from > 0 ? e.from : target, Math.max(0.05, Math.min(1, e.vel)), e.midi, offset);
    if (e.from > 0 && e.glide > 0.004) {
      s.lfTarget = Math.log2(target);
      s.glideC = 1 - Math.exp(-1 / ((e.glide / 3) * sampleRate));
    }
  }

  handleEvents(n: number): void {
    const sr = sampleRate;
    let w = 0;
    for (let r = 0; r < this.qLen; r++) {
      const e = this.queue[r];
      let off = Math.round((e.at - currentTime) * sr);
      if (off >= n) {
        if (w !== r) { const tmp = this.queue[w]; this.queue[w] = e; this.queue[r] = tmp; }
        w++;
        continue;
      }
      if (off < 0) off = 0;
      if (e.type === 1) this.noteOn(e, off);
      else {
        const v = this.find(e.id);
        if (!v) continue;
        if (e.type === 2) { v.relDelay = Math.max(off, v.delay); v.relFast = 0; }
        else if (e.type === 3) { v.relDelay = Math.max(off, v.delay); v.relFast = 0.005; }
        else if (e.type === 4) {
          v.lfTarget = Math.log2(440 * Math.pow(2, (e.midi - 69) / 12 + e.cents / 1200));
          v.glideC = e.glide > 0.004 ? 1 - Math.exp(-1 / ((e.glide / 3) * sr)) : 1;
        }
      }
    }
    this.qLen = w;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0];
    const R = out.length > 1 ? out[1] : out[0];
    const n = L.length;
    L.fill(0);
    if (R !== L) R.fill(0);
    this.handleEvents(n);

    const sr = sampleRate;
    const sm = 1 - Math.exp(-n / (0.02 * sr));
    for (let k = 0; k < 4; k++) this.level[k].step(sm);
    this.feedback.step(sm);
    this.bright.step(sm);
    this.tone.step(sm);
    this.bend.step(sm);
    this.modWheel.step(sm);

    const algo = ALGOS[this.algo];
    const isCar = this.isCar;
    for (let k = 0; k < 4; k++) isCar[k] = false;
    for (let c = 0; c < algo.car.length; c++) isCar[algo.car[c]] = true;
    const carNorm = 0.32 / Math.sqrt(algo.car.length);
    const brightMul = 0.15 + 1.7 * this.bright.cur;
    const fbAmt = this.feedback.cur * 1.6;

    // envelope coefficients for this block (per op)
    const aInc = this.aInc;
    const dC = this.dC;
    const rC = this.rC;
    for (let k = 0; k < 4; k++) {
      aInc[k] = 1 / Math.max(1, this.a[k] * sr);
      dC[k] = 1 - Math.exp(-1 / ((this.d[k] / 3) * sr));
      rC[k] = 1 - Math.exp(-1 / ((this.r[k] / 3) * sr));
    }

    // vibrato from the mod wheel
    const vibDepth = this.modWheel.cur * 30; // cents
    const vibInc = (5.6 * TAB_N) / sr;
    const bendCents = this.bend.cur * this.bendRange * 100;
    const toneHz = 300 * Math.pow(2, this.tone.cur * 6);
    const lpA = this.tone.cur >= 0.999 ? 1 : 1 - Math.exp((-2 * Math.PI * toneHz) / sr);

    const mods = algo.mods;
    const outs = this.outs;

    for (const v of this.voices) {
      if (!v.active) continue;
      const velAmp = 1 - this.velSens * (1 - v.vel);
      const velIdx = 1 - this.velMod * (1 - v.vel);
      const keyScale = Math.pow(2, -Math.max(0, v.midi - 60) / 30);
      const idxScale = 4 * brightMul * velIdx * keyScale;
      let peak = 0;
      for (let i = 0; i < n; i++) {
        if (i < v.delay) continue;
        if (v.relDelay >= 0 && i >= v.relDelay) {
          this.release(v, v.relFast);
          v.relDelay = -1;
        }
        if (v.lf !== v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (Math.abs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }
        const vib = vibDepth > 0.01 ? SINE[(this.vibPhase | 0) & TAB_MASK] * vibDepth : 0;
        const f0 = Math.pow(2, v.lf + (bendCents + vib) / 1200);

        // envelopes
        for (let k = 0; k < 4; k++) {
          const st = v.stage[k];
          let e = v.env[k];
          if (st === 0) { e += aInc[k]; if (e >= 1) { e = 1; v.stage[k] = 1; } }
          else if (st === 1) { e += (this.s[k] - e) * dC[k]; if (Math.abs(e - this.s[k]) < 1e-4) v.stage[k] = 2; }
          else if (st === 3) { e -= e * (v.relFast > 0 ? 1 - Math.exp(-1 / (v.relFast * sr)) : rC[k]); }
          v.env[k] = e;
        }

        // operators 4 → 1
        for (let k = 3; k >= 0; k--) {
          let pm = 0;
          const src = mods[k];
          for (let j = 0; j < src.length; j++) pm += outs[src[j]];
          if (k === 3 && fbAmt > 0) pm += (v.fb1 + v.fb2) * 0.5 * fbAmt;
          const ph = v.phase[k] + pm * (TAB_N / (2 * Math.PI));
          const idx = ((ph % TAB_N) + TAB_N) % TAB_N;
          const i0 = idx | 0;
          const fr = idx - i0;
          const s = SINE[i0] + (SINE[i0 + 1] - SINE[i0]) * fr;
          v.phase[k] += f0 * this.ratio[k] * TAB_N / sr;
          if (v.phase[k] >= TAB_N) v.phase[k] -= TAB_N;
          const lvl = this.level[k].cur;
          if (isCar[k]) outs[k] = s * v.env[k] * lvl;
          else outs[k] = s * v.env[k] * lvl * lvl * idxScale;
          if (k === 3) { v.fb2 = v.fb1; v.fb1 = s * v.env[k]; }
        }
        let sum = 0;
        for (let c = 0; c < algo.car.length; c++) sum += outs[algo.car[c]];
        const y = sum * carNorm * velAmp;
        if (!Number.isFinite(y)) { v.active = false; break; }
        L[i] += y;
        if (R !== L) R[i] += y;
        const ay = y < 0 ? -y : y;
        if (ay > peak) peak = ay;
      }
      if (v.released) {
        let maxCar = 0;
        for (let c = 0; c < algo.car.length; c++) if (v.env[algo.car[c]] > maxCar) maxCar = v.env[algo.car[c]];
        if (maxCar < 1e-4) v.active = false;
      } else if (peak < 1e-6) {
        v.silent += n;
        if (v.silent > sr * 2) v.active = false;
      } else v.silent = 0;
      v.delay = 0;
    }
    this.vibPhase = (this.vibPhase + vibInc * n) % TAB_N;

    if (lpA < 1) {
      for (let i = 0; i < n; i++) {
        this.lpL += (L[i] - this.lpL) * lpA;
        L[i] = this.lpL;
        if (R !== L) { this.lpR += (R[i] - this.lpR) * lpA; R[i] = this.lpR; }
      }
      if (Math.abs(this.lpL) < 1e-20) this.lpL = 0;
      if (Math.abs(this.lpR) < 1e-20) this.lpR = 0;
    }
    return true;
  }
}

registerProcessor("sy1-fm", SY1FmProcessor);
