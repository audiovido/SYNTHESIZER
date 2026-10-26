/**
 * SY-1 Strings engine — AudioWorklet processor ("sy1-strings").
 *
 * Extended Karplus-Strong physical-modelling string synthesizer for Shiraz:
 *  - Fractional delay line (exact all-pass phase compensation at f0)
 *  - Pluck (noise burst) or Hammer (raised-cosine pulse) excitation, filtered
 *    by a one-pole low-pass following HARDNESS and velocity, with a pick-position
 *    comb notch at POSITION p
 *  - Pitch-compensated T60 DECAY loss + one-pole loop filter (DAMP, BRIGHT)
 *  - 1 to 4 first-order all-pass stages in the loop for STIFFNESS inharmonicity,
 *    with loop delay retuned to compensate their phase delay at f0
 *  - 1 to 3 COURSES per note, detuned by DETUNE cents and stereo-panned
 *  - Sympathetic bridge BUZZ (|x| nonlinearity, AC-coupled) for setar/tar
 *  - RIZ (santur mallet tremolo): re-excites while held at RIZRATE Hz with
 *    alternating 100% / 75% mallet velocity; stops on note-off
 *  - 3 resonant band-pass BODY filters per stereo channel (per-model formants
 *    scaled by TONE, mixed by BODY)
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

const POOL = 24;
const MAX_SOUNDING = 10;
const MAX_ACTIVE = 16;
const MAX_COURSES = 3;
const BUF_N = 4096;
const BUF_MASK = BUF_N - 1;
const EXC_N = 512;
const EXC_MASK = EXC_N - 1;
const QUEUE = 512;

const MODELS: Record<string, number> = {
  santur: 0,
  setar: 1,
  tar: 2,
  kanun: 3,
  oud: 4,
  harp: 5
};

// Fixed 3-band body resonator center frequencies (Hz) and Qs per model
const BODY_FREQS: number[][] = [
  [290, 680, 1650], // 0: santur (walnut trapezoid box)
  [240, 560, 1450], // 1: setar (small mulberry bowl)
  [190, 460, 1180], // 2: tar (double-chamber skin top)
  [260, 620, 1800], // 3: kanun (zither with skin bridges)
  [135, 310, 780],  // 4: oud (deep pear bowl)
  [175, 420, 1050]  // 5: harp (open soundboard)
];

const BODY_QS: number[][] = [
  [4.5, 5.5, 6.0],
  [5.0, 6.5, 7.0],
  [5.5, 7.0, 6.0],
  [4.5, 5.0, 6.5],
  [5.0, 5.5, 5.0],
  [3.5, 4.0, 4.5]
];

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

class StringVoice {
  active = false;
  released = false;
  id = 0;
  order = 0;
  vel = 1;
  delay = 0;
  relDelay = -1;
  relFast = 0;

  lf = 0;
  lfTarget = 0;
  glideC = 1;

  // Delay lines and per-course state
  buf = new Float32Array(MAX_COURSES * BUF_N);
  wIdx = new Int32Array(MAX_COURSES);
  delL = new Int32Array(MAX_COURSES);
  apEta = new Float64Array(MAX_COURSES);
  apX1 = new Float64Array(MAX_COURSES);
  apY1 = new Float64Array(MAX_COURSES);
  lpCoef = new Float64Array(MAX_COURSES);
  lpState = new Float64Array(MAX_COURSES);
  fbGain = new Float64Array(MAX_COURSES);
  stiffA = new Float64Array(MAX_COURSES);
  stiffX = new Float64Array(MAX_COURSES * 4);
  stiffY = new Float64Array(MAX_COURSES * 4);
  panL = new Float64Array(MAX_COURSES);
  panR = new Float64Array(MAX_COURSES);
  stiffStages = 1;

  // Excitation state (with pick-position comb notch buffer)
  excBuf = new Float32Array(EXC_N);
  excW = 0;
  excPos = 0;
  excLen = 0;
  excTotal = 0;
  excCombM = 8;
  excGain = 0;
  excLpCoef = 0.5;
  excLpState = 0;

  // RIZ tremolo state
  rizSamples = 0;
  rizAlt = false;

  // Sympathetic buzz AC-coupling state & output envelope
  dcX = 0;
  dcY = 0;
  out = 1;
  relCoef = 0;
  relTau = 0.35;
  silentCount = 0;

  clearBuffers(): void {
    this.buf.fill(0);
    this.wIdx.fill(0);
    this.apX1.fill(0);
    this.apY1.fill(0);
    this.lpState.fill(0);
    this.stiffX.fill(0);
    this.stiffY.fill(0);
    this.excBuf.fill(0);
    this.excW = 0;
    this.excLpState = 0;
    this.dcX = 0;
    this.dcY = 0;
  }

  reset(id: number, order: number, freqHz: number, vel: number, delay: number): void {
    this.active = true;
    this.released = false;
    this.id = id;
    this.order = order;
    this.vel = vel;
    this.delay = delay;
    this.relDelay = -1;
    this.relFast = 0;
    this.lf = this.lfTarget = Math.log2(freqHz);
    this.glideC = 1;
    this.out = 1;
    this.relCoef = 0;
    this.rizAlt = false;
    this.silentCount = 0;
    this.clearBuffers();
  }
}

class SY1StringsProcessor extends AudioWorkletProcessor {
  model = 0; // 0: santur, 1: setar, 2: tar, 3: kanun, 4: oud, 5: harp
  courses = 2;
  rizOn = false;
  aR = 0.35;

  strHard = new Smooth(0.55);
  strPos = new Smooth(0.18);
  strDecay = new Smooth(3.5);
  strDamp = new Smooth(0.3);
  strBright = new Smooth(0.65);
  strStiff = new Smooth(0.25);
  strDetune = new Smooth(4);
  strBody = new Smooth(0.45);
  strTone = new Smooth(0.5);
  strBuzz = new Smooth(0);
  rizRate = new Smooth(11);
  velSens = new Smooth(0.6);
  bendRange = new Smooth(2);
  bend = new Smooth(0);
  modWheel = new Smooth(0);
  smooths: Smooth[];

  voices: StringVoice[] = [];
  counter = 0;
  rng = 0x7f4a7c15;

  queue: Ev[] = [];
  qLen = 0;

  // 3 resonant band-pass body filters per stereo channel
  bL1 = new Float64Array(3);
  bL2 = new Float64Array(3);
  bR1 = new Float64Array(3);
  bR2 = new Float64Array(3);
  bA1 = new Float64Array(3);
  bA2 = new Float64Array(3);
  bA3 = new Float64Array(3);
  bKq = new Float64Array(3);

  constructor() {
    super();
    for (let i = 0; i < POOL; i++) this.voices.push(new StringVoice());
    for (let i = 0; i < QUEUE; i++) this.queue.push(new Ev());
    this.smooths = [
      this.strHard, this.strPos, this.strDecay, this.strDamp, this.strBright,
      this.strStiff, this.strDetune, this.strBody, this.strTone, this.strBuzz,
      this.rizRate, this.velSens, this.bendRange, this.bend, this.modWheel
    ];
    this.port.onmessage = (e: MessageEvent) => this.onMessage(e.data);
  }

  setParam(key: string, v: unknown): void {
    const n = Number(v);
    switch (key) {
      case "strModel":
        this.model = MODELS[String(v)] ?? 0;
        break;
      case "strCourses":
        this.courses = Math.max(1, Math.min(MAX_COURSES, Math.round(n)));
        break;
      case "riz":
        this.rizOn = v === "on";
        break;
      case "aR":
        this.aR = Math.max(0.01, n);
        break;
      case "strHard": this.strHard.target = n; break;
      case "strPos": this.strPos.target = n; break;
      case "strDecay": this.strDecay.target = n; break;
      case "strDamp": this.strDamp.target = n; break;
      case "strBright": this.strBright.target = n; break;
      case "strStiff": this.strStiff.target = n; break;
      case "strDetune": this.strDetune.target = n; break;
      case "strBody": this.strBody.target = n; break;
      case "strTone": this.strTone.target = n; break;
      case "strBuzz": this.strBuzz.target = n; break;
      case "rizRate": this.rizRate.target = n; break;
      case "velSens": this.velSens.target = n; break;
      case "bendRange": this.bendRange.target = n; break;
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
        for (let i = 0; i < this.smooths.length; i++) {
          this.smooths[i].cur = this.smooths[i].prev = this.smooths[i].target;
        }
        break;
      case "param":
        this.setParam(m.key, m.value);
        break;
      case "on":
        this.enqueue(1, m);
        break;
      case "off":
        this.enqueue(2, m);
        break;
      case "kill":
        this.enqueue(3, m);
        break;
      case "glide":
        this.enqueue(4, m);
        break;
      case "alloff":
        this.qLen = 0;
        for (const v of this.voices) if (v.active) this.release(v, 0.015);
        break;
      case "bend":
        this.bend.target = Number(m.v) || 0;
        break;
      case "mod":
        this.modWheel.target = Number(m.v) || 0;
        break;
      default:
        break;
    }
  }

  nextNoise(): number {
    let x = this.rng;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.rng = x;
    return x / 2147483648 - 1;
  }

  release(v: StringVoice, fastTau: number): void {
    if (v.released && fastTau === 0) return;
    v.released = true;
    const tau = fastTau > 0 ? fastTau : Math.max(0.01, this.aR);
    v.relTau = tau;
    v.relCoef = 1 - Math.exp(-1 / (Math.max(0.005, tau / 3) * sampleRate));
  }

  find(id: number): StringVoice | null {
    for (const v of this.voices) if (v.active && v.id === id) return v;
    return null;
  }

  startStrike(v: StringVoice, strikeVel: number): void {
    const sr = sampleRate;
    const f0 = Math.max(20, Math.min(sr * 0.25, Math.pow(2, v.lf)));
    const P = sr / f0;
    const hard = this.strHard.cur;
    const pos = Math.max(0.05, Math.min(0.5, this.strPos.cur));
    const velS = this.velSens.cur;
    const amp = 0.36 * (1 - velS + velS * strikeVel);

    // One-pole low-pass cutoff on excitation follows HARDNESS and velocity
    const fcExc = Math.min(sr * 0.44, 360 * Math.pow(2, 4.4 * hard + 1.6 * strikeVel));
    v.excLpCoef = 1 - Math.exp((-2 * Math.PI * fcExc) / sr);
    v.excCombM = Math.max(1, Math.min(EXC_N - 4, Math.round(pos * P)));

    if (this.model === 0) {
      // Santur hammer: short raised-cosine mallet pulse
      const dur = 0.0042 - 0.0028 * hard;
      v.excLen = Math.max(6, Math.min(240, Math.round(sr * dur)));
      v.excGain = amp * 0.65;
    } else {
      // Plucked strings: burst proportional to string period
      v.excLen = Math.max(16, Math.min(360, Math.round(P * 0.7)));
      v.excGain = amp * 0.55;
    }
    v.excTotal = v.excLen + v.excCombM;
    v.excPos = 0;
  }

  noteOn(e: Ev, offset: number): void {
    let sounding = 0, active = 0;
    let oldestSounding: StringVoice | null = null, oldestActive: StringVoice | null = null;
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

    let slot: StringVoice | null = null;
    for (const v of this.voices) if (!v.active) { slot = v; break; }
    if (!slot) for (const v of this.voices) if (!slot || v.order < slot.order) slot = v;

    const target = 440 * Math.pow(2, (e.midi - 69) / 12 + e.cents / 1200);
    const s = slot!;
    const vel = Math.max(0.05, Math.min(1, e.vel));
    s.reset(e.id, ++this.counter, e.from > 0 ? e.from : target, vel, offset);
    if (e.from > 0 && e.glide > 0.004) {
      s.lfTarget = Math.log2(target);
      s.glideC = 1 - Math.exp(-1 / ((e.glide / 3) * sampleRate));
    }
    this.startStrike(s, vel);
    s.rizSamples = Math.max(200, Math.round(sampleRate / Math.max(4, this.rizRate.cur)));
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

  updateVoiceCourses(v: StringVoice, bendCents: number): void {
    const sr = sampleRate;
    const C = this.courses;
    const norm = 1 / Math.sqrt(C);
    const det = this.strDetune.cur;
    const damp = this.strDamp.cur;
    const bright = this.strBright.cur;
    const stiff = this.strStiff.cur;
    const t60 = Math.max(0.15, this.strDecay.cur);

    // 1 to 4 stiffness all-pass stages
    const M = stiff <= 0.001 ? 1 : Math.max(1, Math.min(4, Math.ceil(stiff * 4)));
    v.stiffStages = M;

    // Brightness + damping map to loop low-pass harmonic ceiling
    const bFactor = (1 - 0.82 * damp) * (1 - 0.82 * damp) * (0.22 + 0.78 * bright);
    const harmMult = 3.5 + 85 * bFactor;

    for (let c = 0; c < C; c++) {
      const pos = C === 1 ? 0 : c / (C - 1) - 0.5;
      const cDet = pos * det;
      const fc = Math.max(20, Math.min(sr * 0.24, Math.pow(2, v.lf + (bendCents + cDet) / 1200)));
      const P = sr / fc;
      const w0 = (2 * Math.PI) / P;
      const cosW = Math.cos(w0);
      const sinW = Math.sin(w0);

      // Stereo pan per course
      const pan = C === 1 ? 0 : pos * 0.45;
      const ang = ((pan + 1) * Math.PI) / 4;
      v.panL[c] = Math.cos(ang) * Math.SQRT2 * norm;
      v.panR[c] = Math.sin(ang) * Math.SQRT2 * norm;

      // 1. One-pole loop low-pass: H(z) = (1 - p) / (1 - p z^-1)
      const fLp = Math.min(sr * 0.45, fc * harmMult);
      const p = Math.max(0.002, Math.min(0.85, Math.exp((-2 * Math.PI * fLp) / sr)));
      v.lpCoef[c] = p;
      const tauLp = Math.atan2(p * sinW, 1 - p * cosW) / w0;
      const magLp = (1 - p) / Math.sqrt(Math.max(1e-12, 1 - 2 * p * cosW + p * p));

      // 2. Stiffness all-pass cascade (M stages)
      let aS = stiff <= 0.001 ? 0 : -0.52 * stiff;
      let tauAp = Math.atan2((1 - aS * aS) * sinW, 2 * aS + (1 + aS * aS) * cosW) / w0;
      if (tauLp + M * tauAp > P - 2.6) {
        aS = 0;
        tauAp = 1;
      }
      v.stiffA[c] = aS;

      // 3. Remaining loop delay D = P - tauLp - M * tauAp
      const D = Math.max(2.5, Math.min(BUF_N - 4, P - tauLp - M * tauAp - 0.035));
      const L = Math.max(2, Math.floor(D - 0.5));
      const delta = D - L; // in [0.5, 1.5)
      v.delL[c] = L;
      const sinDen = Math.sin(0.5 * (1 + delta) * w0);
      v.apEta[c] = Math.abs(sinDen) > 1e-9 ? Math.sin(0.5 * (1 - delta) * w0) / sinDen : (1 - delta) / (1 + delta);

      // 4. Pitch-compensated T60 decay loss gain (exact at fundamental w0)
      let gLoss = Math.exp(-6.90775527898 / (fc * t60));
      if (v.released) {
        // Note-off mute raises loop damping with tau = RELEASE
        gLoss *= Math.exp(-1 / (fc * Math.max(0.008, v.relTau)));
      }
      v.fbGain[c] = Math.min(0.99985, gLoss / Math.max(0.25, magLp));
    }
  }

  updateBodyFilters(sr: number): void {
    const freqs = BODY_FREQS[this.model] || BODY_FREQS[0];
    const qs = BODY_QS[this.model] || BODY_QS[0];
    const scale = Math.pow(2, (this.strTone.cur - 0.5) * 1.2);
    const maxFc = sr * 0.44;
    for (let b = 0; b < 3; b++) {
      const fc = Math.max(40, Math.min(maxFc, freqs[b] * scale));
      const g = Math.tan((Math.PI * fc) / sr);
      const kq = 1 / qs[b];
      const a1 = 1 / (1 + g * (g + kq));
      this.bA1[b] = a1;
      this.bA2[b] = g * a1;
      this.bA3[b] = g * this.bA2[b];
      this.bKq[b] = kq;
    }
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
    const blockA = 1 - Math.exp(-n / (0.01 * sr));
    for (let i = 0; i < this.smooths.length; i++) this.smooths[i].step(blockA);

    const bendCents = this.bend.cur * this.bendRange.cur * 100 + this.modWheel.cur * 35;
    const C = this.courses;
    const buzz = this.strBuzz.cur;
    const bodyMix = this.strBody.cur;
    const rizOn = this.rizOn;
    const rizPeriod = Math.max(200, Math.round(sr / Math.max(4, this.rizRate.cur)));
    const isHammer = this.model === 0;
    const hard = this.strHard.cur;

    this.updateBodyFilters(sr);

    for (const v of this.voices) {
      if (!v.active) continue;

      this.updateVoiceCourses(v, bendCents);
      const M = v.stiffStages;
      let peakBlock = 0;

      for (let i = 0; i < n; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        if (v.relDelay === 0) {
          this.release(v, v.relFast);
          v.relDelay = -1;
          this.updateVoiceCourses(v, bendCents);
        } else if (v.relDelay > 0) {
          v.relDelay--;
        }

        if (v.lf !== v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (Math.abs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
          if ((i & 15) === 0) this.updateVoiceCourses(v, bendCents);
        }

        // RIZ (santur mallet tremolo while held)
        if (rizOn && !v.released) {
          v.rizSamples--;
          if (v.rizSamples <= 0) {
            v.rizSamples = rizPeriod;
            v.rizAlt = !v.rizAlt;
            this.startStrike(v, v.vel * (v.rizAlt ? 0.75 : 1.0));
          }
        }

        // Excitation sample with hardness LP and pick-position comb notch
        let exc = 0;
        if (v.excPos < v.excTotal) {
          let raw = 0;
          if (v.excPos < v.excLen) {
            if (isHammer) {
              const ph = v.excPos / v.excLen;
              raw = 0.5 * (1 - Math.cos(2 * Math.PI * ph)) + 0.22 * hard * this.nextNoise() * Math.sin(Math.PI * ph);
            } else {
              const env = 1 - v.excPos / v.excLen;
              raw = (this.nextNoise() * 0.85 + 0.3 * Math.sin((Math.PI * v.excPos) / v.excLen)) * env;
            }
          }
          v.excLpState += v.excLpCoef * (raw - v.excLpState);
          const ew = (v.excW + 1) & EXC_MASK;
          v.excW = ew;
          v.excBuf[ew] = v.excLpState;
          const delayed = v.excBuf[(ew - v.excCombM) & EXC_MASK];
          exc = (v.excLpState - delayed) * v.excGain;
          v.excPos++;
        }

        let vl = 0, vr = 0;
        for (let c = 0; c < C; c++) {
          const bOff = c * BUF_N;
          const w = (v.wIdx[c] + 1) & BUF_MASK;
          v.wIdx[c] = w;
          const x0 = v.buf[bOff + ((w - v.delL[c]) & BUF_MASK)];

          // Fractional delay all-pass
          const eta = v.apEta[c];
          const yFrac = eta * x0 + v.apX1[c] - eta * v.apY1[c];
          v.apX1[c] = x0;
          v.apY1[c] = yFrac;

          // Loop one-pole low-pass (DAMP, BRIGHT)
          const p = v.lpCoef[c];
          const yLp = (1 - p) * yFrac + p * v.lpState[c];
          v.lpState[c] = yLp;

          // Stiffness all-pass cascade (1..4 stages)
          let yStiff = yLp;
          const aS = v.stiffA[c];
          const sBase = c * 4;
          for (let s = 0; s < M; s++) {
            const idx = sBase + s;
            const yn = aS * yStiff + v.stiffX[idx] - aS * v.stiffY[idx];
            v.stiffX[idx] = yStiff;
            v.stiffY[idx] = yn;
            yStiff = yn;
          }

          const yLoop = yStiff * v.fbGain[c] + exc;
          v.buf[bOff + w] = yLoop;

          vl += yLoop * v.panL[c];
          vr += yLoop * v.panR[c];
        }

        // Sympathetic bridge buzz (|x| clip, AC-coupled)
        if (buzz > 0.001) {
          const mono = 0.5 * (vl + vr);
          const absM = Math.abs(mono);
          v.dcY = absM - v.dcX + 0.995 * v.dcY;
          v.dcX = absM;
          const bz = buzz * 0.9 * v.dcY;
          const scale = 1 / (1 + buzz * 0.65 * absM);
          vl = (vl + bz) * scale;
          vr = (vr + bz) * scale;
        }

        if (v.released) v.out -= v.out * v.relCoef;
        vl *= v.out;
        vr *= v.out;

        // NaN / non-finite guard
        if (!Number.isFinite(vl) || !Number.isFinite(vr)) {
          v.clearBuffers();
          v.active = false;
          break;
        }

        const mag = Math.abs(vl) + Math.abs(vr);
        if (mag > peakBlock) peakBlock = mag;

        L[i] += vl;
        if (R !== L) R[i] += vr;
      }

      // Denormal flush on voice filter states
      for (let c = 0; c < C; c++) {
        if (Math.abs(v.apX1[c]) < 1e-20) v.apX1[c] = 0;
        if (Math.abs(v.apY1[c]) < 1e-20) v.apY1[c] = 0;
        if (Math.abs(v.lpState[c]) < 1e-20) v.lpState[c] = 0;
      }
      if (Math.abs(v.dcY) < 1e-20) v.dcY = 0;

      if (peakBlock < 2e-5 && v.excPos >= v.excTotal && (!rizOn || v.released)) {
        v.silentCount += n;
        if (v.silentCount > sr * 0.15 || (v.released && v.out < 2e-5)) {
          v.active = false;
        }
      } else {
        v.silentCount = 0;
      }
    }

    // Apply 3-band resonant BODY filter bank per output channel
    if (bodyMix > 0.001) {
      const dryG = 1 - bodyMix * 0.35;
      const wetG = bodyMix * 0.75;
      for (let i = 0; i < n; i++) {
        const xl = L[i];
        const xr = R[i];
        let sumL = 0, sumR = 0;
        for (let b = 0; b < 3; b++) {
          const a1 = this.bA1[b], a2 = this.bA2[b], a3 = this.bA3[b], kq = this.bKq[b];
          let v3 = xl - this.bL2[b];
          let v1 = a1 * this.bL1[b] + a2 * v3;
          let v2 = this.bL2[b] + a2 * this.bL1[b] + a3 * v3;
          this.bL1[b] = 2 * v1 - this.bL1[b];
          this.bL2[b] = 2 * v2 - this.bL2[b];
          sumL += kq * v1;

          v3 = xr - this.bR2[b];
          v1 = a1 * this.bR1[b] + a2 * v3;
          v2 = this.bR2[b] + a2 * this.bR1[b] + a3 * v3;
          this.bR1[b] = 2 * v1 - this.bR1[b];
          this.bR2[b] = 2 * v2 - this.bR2[b];
          sumR += kq * v1;
        }
        L[i] = xl * dryG + sumL * wetG;
        if (R !== L) R[i] = xr * dryG + sumR * wetG;
      }
      for (let b = 0; b < 3; b++) {
        if (Math.abs(this.bL1[b]) < 1e-20) this.bL1[b] = 0;
        if (Math.abs(this.bL2[b]) < 1e-20) this.bL2[b] = 0;
        if (Math.abs(this.bR1[b]) < 1e-20) this.bR1[b] = 0;
        if (Math.abs(this.bR2[b]) < 1e-20) this.bR2[b] = 0;
      }
    }

    return true;
  }
}

registerProcessor("sy1-strings", SY1StringsProcessor);
