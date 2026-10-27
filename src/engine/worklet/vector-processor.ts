/**
 * SY-1 Vector Morph Engine — AudioWorklet processor ("sy1-vector") for Nishapur.
 *
 * Polyphonic 4-corner vector synthesis with audio-clock ORBIT:
 *  - Corner A (top-left, 0,0): band-limited PolyBLEP saw / variable-width pulse blend (PULSE WIDTH).
 *  - Corner B (top-right, 1,0): 2-operator phase-modulation FM bell (RATIO, INDEX).
 *  - Corner C (bottom-left, 0,1): procedurally generated 8-frame harmonic wavetable (POSITION).
 *  - Corner D (bottom-right, 1,1): filtered noise + breath excitation through 2 resonant
 *    formant band-pass filters morphing across vowels A / E / I / O / U (VOWEL).
 *  - Crossfaded per voice by equal-power bilinear weights from (x, y) + level trims.
 *  - Audio-clock ORBIT (OFF / CIRCLE / FIGURE-8 / DRAWN up to 256 points), scaled by
 *    SIZE + mod wheel around the orbit center.
 *  - Shared per-voice TPT State-Variable Filter (LP / BP / HP, cutoff, reso, envAmt),
 *    Filter ADSR (fA, fD, fS, fR) and Amp ADSR (aA, aD, aS, aR) + velocity sensitivity.
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
const MAX_SOUNDING = 10;
const MAX_ACTIVE = 16;
const QUEUE = 512;
const TAB_N = 2048;
const TAB_MASK = TAB_N - 1;
const WT_FRAMES = 8;
const MAX_PATH = 256;

const SINE = new Float32Array(TAB_N + 1);
for (let i = 0; i <= TAB_N; i++) {
  SINE[i] = Math.sin((2 * Math.PI * i) / TAB_N);
}

// Procedurally generated 8-frame band-limited wavetable (no audio files)
const WAVETABLES = new Float32Array(WT_FRAMES * (TAB_N + 1));
(function buildWavetables() {
  // Each frame defines harmonic amplitudes (up to 24 harmonics) for distinct sci-fi/glass/vocal timbres
  const spectra: number[][] = [
    // 0: Warm fundamental + glassy 2nd/3rd
    [1.0, 0.55, 0.3, 0.12, 0.06, 0.03],
    // 1: Hollow odd harmonics (wood/glass tube)
    [1.0, 0, 0.65, 0, 0.42, 0, 0.25, 0, 0.14, 0, 0.08],
    // 2: Vocal throat formant peak around 4..7
    [0.7, 0.35, 0.25, 0.65, 0.85, 0.7, 0.45, 0.2, 0.1],
    // 3: Metallic octave & fifth partials
    [0.9, 0.6, 0.5, 0.45, 0.1, 0.4, 0.05, 0.35, 0.3, 0, 0, 0.25, 0, 0, 0, 0.18],
    // 4: Sync-like upper sweep peak around 6..11
    [0.5, 0.3, 0.25, 0.35, 0.55, 0.8, 0.9, 0.75, 0.55, 0.35, 0.2, 0.1],
    // 5: Shimmering bell-pad cluster (1, 3, 6, 9, 12, 15)
    [0.85, 0.15, 0.6, 0.05, 0.1, 0.55, 0, 0.08, 0.45, 0, 0, 0.35, 0, 0, 0.25],
    // 6: Comb-saw alternating phase spectrum
    [0.9, -0.5, 0.45, -0.4, 0.35, -0.3, 0.26, -0.22, 0.18, -0.15, 0.12, -0.1, 0.08, -0.06],
    // 7: Crystalline high harmonics (starlight)
    [0.65, 0.1, 0.15, 0.1, 0.55, 0.05, 0.45, 0.05, 0.4, 0, 0.35, 0, 0.3, 0, 0.25, 0, 0.2, 0, 0.15]
  ];

  for (let f = 0; f < WT_FRAMES; f++) {
    const amps = spectra[f];
    const base = f * (TAB_N + 1);
    let maxAbs = 1e-6;
    for (let i = 0; i < TAB_N; i++) {
      const ph = (2 * Math.PI * i) / TAB_N;
      let sum = 0;
      for (let h = 0; h < amps.length; h++) {
        const a = amps[h];
        if (a !== 0) sum += a * Math.sin((h + 1) * ph + (h * 0.37));
      }
      WAVETABLES[base + i] = sum;
      const abs = sum < 0 ? -sum : sum;
      if (abs > maxAbs) maxAbs = abs;
    }
    const norm = 0.92 / maxAbs;
    for (let i = 0; i < TAB_N; i++) {
      WAVETABLES[base + i] *= norm;
    }
    WAVETABLES[base + TAB_N] = WAVETABLES[base];
  }
})();

// Vowel formant table (F1, F2, F3 in Hz) for A, E, I, O, U
const VOWEL_F1 = [730, 530, 270, 570, 300];
const VOWEL_F2 = [1090, 1840, 2290, 840, 870];

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

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

class VectorVoice {
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

  // Source A phases (main + subtle detuned companion)
  phA1 = 0;
  phA2 = 0;
  // Source B phases (carrier + modulator)
  phBc = 0;
  phBm = 0;
  bellEnv = 1;
  // Source C phases (dual slight-detune wavetable readers)
  phC1 = 0;
  phC2 = 0;
  // Source D state: two 2-pole SVF band-pass filters + glottal phase
  phD = 0;
  f1Ic1 = 0;
  f1Ic2 = 0;
  f2Ic1 = 0;
  f2Ic2 = 0;

  // Shared post-mix TPT SVF state (stereo L/R)
  svfIc1L = 0;
  svfIc2L = 0;
  svfIc1R = 0;
  svfIc2R = 0;

  // Amp ADSR & Filter ADSR
  ampEnv = 0;
  ampStage = 0; // 0 A, 1 D, 2 S, 3 R
  fltEnv = 0;
  fltStage = 0; // 0 A, 1 D, 2 S, 3 R
  silent = 0;

  start(id: number, order: number, hz: number, vel: number, midi: number, delay: number, seed: number): void {
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

    const s0 = (seed * 0.173) % 1;
    this.phA1 = s0;
    this.phA2 = (s0 + 0.37) % 1;
    this.phBc = 0;
    this.phBm = 0;
    this.bellEnv = 1;
    this.phC1 = (s0 * TAB_N) % TAB_N;
    this.phC2 = ((s0 + 0.5) * TAB_N) % TAB_N;
    this.phD = (s0 + 0.23) % 1;

    this.f1Ic1 = 0;
    this.f1Ic2 = 0;
    this.f2Ic1 = 0;
    this.f2Ic2 = 0;
    this.svfIc1L = 0;
    this.svfIc2L = 0;
    this.svfIc1R = 0;
    this.svfIc2R = 0;

    this.ampEnv = 0;
    this.ampStage = 0;
    this.fltEnv = 0;
    this.fltStage = 0;
    this.silent = 0;
  }
}

class SY1VectorProcessor extends AudioWorkletProcessor {
  voices: VectorVoice[] = [];
  queue: Ev[] = [];
  qLen = 0;
  counter = 0;
  rng = 22222;

  // Vector XY + Orbit
  vecX = new Smooth(0.5);
  vecY = new Smooth(0.5);
  curX = new Smooth(0.5);
  curY = new Smooth(0.5);
  orbitMode = 1; // 0 off, 1 circle, 2 figure8, 3 drawn
  orbitRateHz = 0.35;
  orbitSize = new Smooth(0.55);
  orbitPhase = 0;
  drawnX = new Float32Array(MAX_PATH);
  drawnY = new Float32Array(MAX_PATH);
  drawnLen = 64;
  drawnCx = 0.5;
  drawnCy = 0.5;
  uiPostCounter = 0;

  // Corner A..D params
  vecAPw = new Smooth(0.35);
  vecALevel = new Smooth(0.85);
  vecBRatio = 3.5;
  vecBIndex = new Smooth(0.45);
  vecBLevel = new Smooth(0.85);
  vecCPos = new Smooth(0.4);
  vecCLevel = new Smooth(0.85);
  vecDVowel = new Smooth(0.3);
  vecDLevel = new Smooth(0.85);

  // Shared filter + envelopes
  filterType = 0; // 0 lowpass, 1 bandpass, 2 highpass
  cutoff = new Smooth(2400);
  res = new Smooth(2.0);
  envAmt = new Smooth(0.4);
  fA = 0.015;
  fD = 0.5;
  fS = 0.35;
  fR = 0.45;
  aA = 0.02;
  aD = 0.5;
  aS = 0.75;
  aR = 0.55;
  velSens = 0.6;
  bendRange = 2;
  bend = new Smooth(0);
  modWheel = new Smooth(0);

  constructor() {
    super();
    for (let i = 0; i < POOL; i++) this.voices.push(new VectorVoice());
    for (let i = 0; i < QUEUE; i++) this.queue.push(new Ev());
    // Default 64-point 3-lobed star path for DRAWN mode before user records
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 64; i++) {
      const a = (2 * Math.PI * i) / 64;
      const r = 0.28 + 0.14 * Math.cos(3 * a);
      const px = 0.5 + Math.cos(a) * r;
      const py = 0.5 + Math.sin(a) * r;
      this.drawnX[i] = px;
      this.drawnY[i] = py;
      sx += px;
      sy += py;
    }
    this.drawnLen = 64;
    this.drawnCx = sx / 64;
    this.drawnCy = sy / 64;

    this.port.onmessage = (e: MessageEvent) => this.onMessage(e.data);
  }

  setParam(key: string, v: unknown): void {
    if (key === "orbitMode") {
      this.orbitMode = v === "off" ? 0 : v === "circle" ? 1 : v === "figure8" ? 2 : 3;
      return;
    }
    if (key === "filterType") {
      this.filterType = v === "bandpass" ? 1 : v === "highpass" ? 2 : 0;
      return;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    switch (key) {
      case "vecX": this.vecX.target = Math.max(0, Math.min(1, n)); break;
      case "vecY": this.vecY.target = Math.max(0, Math.min(1, n)); break;
      case "orbitRateHz": this.orbitRateHz = Math.max(0.01, Math.min(30, n)); break;
      case "orbitRate": this.orbitRateHz = Math.max(0.02, Math.min(20, n)); break;
      case "orbitSize": this.orbitSize.target = Math.max(0, Math.min(1, n)); break;
      case "vecAPw": this.vecAPw.target = Math.max(0.05, Math.min(0.95, n)); break;
      case "vecALevel": this.vecALevel.target = Math.max(0, Math.min(1, n)); break;
      case "vecBRatio": this.vecBRatio = Math.max(0.25, Math.min(16, n)); break;
      case "vecBIndex": this.vecBIndex.target = Math.max(0, Math.min(1, n)); break;
      case "vecBLevel": this.vecBLevel.target = Math.max(0, Math.min(1, n)); break;
      case "vecCPos": this.vecCPos.target = Math.max(0, Math.min(1, n)); break;
      case "vecCLevel": this.vecCLevel.target = Math.max(0, Math.min(1, n)); break;
      case "vecDVowel": this.vecDVowel.target = Math.max(0, Math.min(1, n)); break;
      case "vecDLevel": this.vecDLevel.target = Math.max(0, Math.min(1, n)); break;
      case "cutoff": this.cutoff.target = Math.max(40, Math.min(18000, n)); break;
      case "res": this.res.target = Math.max(0.1, Math.min(18, n)); break;
      case "envAmt": this.envAmt.target = Math.max(0, Math.min(1, n)); break;
      case "fA": this.fA = Math.max(0.001, n); break;
      case "fD": this.fD = Math.max(0.005, n); break;
      case "fS": this.fS = Math.max(0, Math.min(1, n)); break;
      case "fR": this.fR = Math.max(0.005, n); break;
      case "aA": this.aA = Math.max(0.001, n); break;
      case "aD": this.aD = Math.max(0.005, n); break;
      case "aS": this.aS = Math.max(0, Math.min(1, n)); break;
      case "aR": this.aR = Math.max(0.005, n); break;
      case "velSens": this.velSens = Math.max(0, Math.min(1, n)); break;
      case "bendRange": this.bendRange = Math.max(0, Math.min(12, n)); break;
      default: break;
    }
  }

  setDrawnPath(pts: unknown): void {
    if (!Array.isArray(pts) || pts.length < 2) return;
    const len = Math.min(MAX_PATH, pts.length);
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < len; i++) {
      const p = pts[i];
      const px = Math.max(0, Math.min(1, Number(p?.[0]) || 0.5));
      const py = Math.max(0, Math.min(1, Number(p?.[1]) || 0.5));
      this.drawnX[i] = px;
      this.drawnY[i] = py;
      sx += px;
      sy += py;
    }
    this.drawnLen = len;
    this.drawnCx = sx / len;
    this.drawnCy = sy / len;
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
        if (m.orbitRateHz !== undefined) this.setParam("orbitRateHz", m.orbitRateHz);
        this.vecX.cur = this.vecX.target;
        this.vecY.cur = this.vecY.target;
        this.curX.cur = this.vecX.target;
        this.curY.cur = this.vecY.target;
        this.orbitSize.cur = this.orbitSize.target;
        this.vecAPw.cur = this.vecAPw.target;
        this.vecALevel.cur = this.vecALevel.target;
        this.vecBIndex.cur = this.vecBIndex.target;
        this.vecBLevel.cur = this.vecBLevel.target;
        this.vecCPos.cur = this.vecCPos.target;
        this.vecCLevel.cur = this.vecCLevel.target;
        this.vecDVowel.cur = this.vecDVowel.target;
        this.vecDLevel.cur = this.vecDLevel.target;
        this.cutoff.cur = this.cutoff.target;
        this.res.cur = this.res.target;
        this.envAmt.cur = this.envAmt.target;
        break;
      case "param":
        this.setParam(m.key, m.value);
        break;
      case "path":
        this.setDrawnPath(m.pts);
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
        for (const v of this.voices) {
          if (v.active) {
            v.released = true;
            v.relFast = 0.015;
            v.ampStage = 3;
            v.fltStage = 3;
          }
        }
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

  find(id: number): VectorVoice | null {
    for (const v of this.voices) if (v.active && v.id === id) return v;
    return null;
  }

  release(v: VectorVoice, fast: number): void {
    v.released = true;
    v.relFast = fast;
    v.ampStage = 3;
    v.fltStage = 3;
  }

  noteOn(e: Ev, offset: number): void {
    let sounding = 0;
    let active = 0;
    let oldS: VectorVoice | null = null;
    let oldA: VectorVoice | null = null;
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

    let slot: VectorVoice | null = null;
    for (const v of this.voices) {
      if (!v.active) {
        slot = v;
        break;
      }
    }
    if (!slot) {
      for (const v of this.voices) if (!slot || v.order < slot.order) slot = v;
    }
    const target = 440 * Math.pow(2, (e.midi - 69) / 12 + e.cents / 1200);
    const s = slot!;
    const order = ++this.counter;
    s.start(e.id, order, e.from > 0 ? e.from : target, Math.max(0.05, Math.min(1, e.vel)), e.midi, offset, order);
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
        if (w !== r) {
          const tmp = this.queue[w];
          this.queue[w] = e;
          this.queue[r] = tmp;
        }
        w++;
        continue;
      }
      if (off < 0) off = 0;
      if (e.type === 1) this.noteOn(e, off);
      else {
        const v = this.find(e.id);
        if (!v) continue;
        if (e.type === 2) {
          v.relDelay = Math.max(off, v.delay);
          v.relFast = 0;
        } else if (e.type === 3) {
          v.relDelay = Math.max(off, v.delay);
          v.relFast = 0.005;
        } else if (e.type === 4) {
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
    const sm = 1 - Math.exp(-n / (0.015 * sr));
    this.vecX.step(sm);
    this.vecY.step(sm);
    this.orbitSize.step(sm);
    this.vecAPw.step(sm);
    this.vecALevel.step(sm);
    this.vecBIndex.step(sm);
    this.vecBLevel.step(sm);
    this.vecCPos.step(sm);
    this.vecCLevel.step(sm);
    this.vecDVowel.step(sm);
    this.vecDLevel.step(sm);
    this.cutoff.step(sm);
    this.res.step(sm);
    this.envAmt.step(sm);
    this.bend.step(sm);
    this.modWheel.step(sm);

    // Advance Orbit on the audio clock
    const effSize = Math.min(1, this.orbitSize.cur + this.modWheel.cur);
    let tx = this.vecX.cur;
    let ty = this.vecY.cur;
    if (this.orbitMode > 0) {
      this.orbitPhase = (this.orbitPhase + (this.orbitRateHz * n) / sr) % 1;
      const p = this.orbitPhase;
      if (this.orbitMode === 1) {
        // CIRCLE
        const ang = 2 * Math.PI * p;
        tx = Math.max(0, Math.min(1, tx + Math.cos(ang) * 0.42 * effSize));
        ty = Math.max(0, Math.min(1, ty + Math.sin(ang) * 0.42 * effSize));
      } else if (this.orbitMode === 2) {
        // FIGURE-8
        const ang = 2 * Math.PI * p;
        tx = Math.max(0, Math.min(1, tx + Math.sin(ang) * 0.44 * effSize));
        ty = Math.max(0, Math.min(1, ty + Math.sin(2 * ang) * 0.36 * effSize));
      } else if (this.orbitMode === 3 && this.drawnLen >= 2) {
        // DRAWN path scaled around its centroid and offset by (vecX - 0.5, vecY - 0.5)
        const pos = p * this.drawnLen;
        const i0 = pos | 0;
        const i1 = (i0 + 1) % this.drawnLen;
        const fr = pos - i0;
        const px = this.drawnX[i0] + (this.drawnX[i1] - this.drawnX[i0]) * fr;
        const py = this.drawnY[i0] + (this.drawnY[i1] - this.drawnY[i0]) * fr;
        const cx = this.drawnCx + (this.vecX.cur - 0.5);
        const cy = this.drawnCy + (this.vecY.cur - 0.5);
        tx = Math.max(0, Math.min(1, cx + (px - this.drawnCx) * effSize));
        ty = Math.max(0, Math.min(1, cy + (py - this.drawnCy) * effSize));
      }
    }
    this.curX.target = tx;
    this.curY.target = ty;
    this.curX.step(sm);
    this.curY.step(sm);

    // Report live audio-clock XY to UI at ~60 Hz
    this.uiPostCounter += n;
    if (this.uiPostCounter >= (sr / 60)) {
      this.uiPostCounter = 0;
      this.port.postMessage({ t: "xy", x: this.curX.cur, y: this.curY.cur, phase: this.orbitPhase });
    }

    // Equal-power bilinear weights from (curX, curY)
    const x = this.curX.cur;
    const y = this.curY.cur;
    const wx0 = Math.cos(x * Math.PI * 0.5);
    const wx1 = Math.sin(x * Math.PI * 0.5);
    const wy0 = Math.cos(y * Math.PI * 0.5);
    const wy1 = Math.sin(y * Math.PI * 0.5);

    const gA = wx0 * wy0 * this.vecALevel.cur;
    const gB = wx1 * wy0 * this.vecBLevel.cur;
    const gC = wx0 * wy1 * this.vecCLevel.cur;
    const gD = wx1 * wy1 * this.vecDLevel.cur;

    // Corner C wavetable frame interpolation setup
    const cPosScaled = this.vecCPos.cur * (WT_FRAMES - 1);
    const wtF0 = Math.min(WT_FRAMES - 2, cPosScaled | 0);
    const wtFrac = cPosScaled - wtF0;
    const wtBase0 = wtF0 * (TAB_N + 1);
    const wtBase1 = (wtF0 + 1) * (TAB_N + 1);

    // Corner D vowel formant frequencies & SVF coefficients
    const vScaled = this.vecDVowel.cur * 4;
    const vIdx = Math.min(3, vScaled | 0);
    const vFrac = vScaled - vIdx;
    const f1Hz = VOWEL_F1[vIdx] * Math.pow(VOWEL_F1[vIdx + 1] / VOWEL_F1[vIdx], vFrac);
    const f2Hz = VOWEL_F2[vIdx] * Math.pow(VOWEL_F2[vIdx + 1] / VOWEL_F2[vIdx], vFrac);
    const f1G = Math.tan((Math.PI * Math.min(sr * 0.42, f1Hz)) / sr);
    const f2G = Math.tan((Math.PI * Math.min(sr * 0.42, f2Hz)) / sr);
    const formK = 1 / 9.0; // Q = 9 formant band-pass
    const f1A1 = 1 / (1 + f1G * (f1G + formK));
    const f1A2 = f1G * f1A1;
    const f2A1 = 1 / (1 + f2G * (f2G + formK));
    const f2A2 = f2G * f2A1;

    // Envelope coefficients
    const aAInc = 1 / Math.max(1, this.aA * sr);
    const aDC = 1 - Math.exp(-1 / ((this.aD / 3) * sr));
    const aRC = 1 - Math.exp(-1 / ((this.aR / 4) * sr));
    const fAInc = 1 / Math.max(1, this.fA * sr);
    const fDC = 1 - Math.exp(-1 / ((this.fD / 3) * sr));
    const fRC = 1 - Math.exp(-1 / ((this.fR / 4) * sr));

    // Shared filter Q mapping
    const fType = this.filterType;
    const resVal = this.res.cur;
    const qLin = fType === 1 ? Math.max(0.5, resVal) : Math.max(0.5, Math.pow(10, resVal / 20));
    const svfK = 1 / Math.min(18, qLin);

    const pw = this.vecAPw.cur;
    const fmRatio = this.vecBRatio;
    const fmIdxBase = this.vecBIndex.cur * 6.5;
    const bendCents = this.bend.cur * this.bendRange * 100;
    const baseCut = this.cutoff.cur;
    const envOct = this.envAmt.cur * 6;
    const bellDecay = 1 - 1 / (1.8 * sr);

    let rng = this.rng | 0;

    for (const v of this.voices) {
      if (!v.active) continue;
      const velPeak = 0.25 * (1 - this.velSens + this.velSens * v.vel);
      const keyScale = Math.pow(2, -Math.max(0, v.midi - 60) / 32);
      const fmIndex = fmIdxBase * keyScale * (0.4 + 0.6 * v.vel);

      let svfA1 = 0;
      let svfA2 = 0;
      let svfA3 = 0;
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

        // Amp ADSR
        let ae = v.ampEnv;
        if (v.ampStage === 0) {
          ae += aAInc;
          if (ae >= 1) {
            ae = 1;
            v.ampStage = 1;
          }
        } else if (v.ampStage === 1) {
          ae += (this.aS - ae) * aDC;
          if (Math.abs(ae - this.aS) < 1e-4) v.ampStage = 2;
        } else if (v.ampStage === 3) {
          const rc = v.relFast > 0 ? 1 - Math.exp(-1 / (v.relFast * sr)) : aRC;
          ae -= ae * rc;
        }
        v.ampEnv = ae;

        // Filter ADSR
        let fe = v.fltEnv;
        if (v.fltStage === 0) {
          fe += fAInc;
          if (fe >= 1) {
            fe = 1;
            v.fltStage = 1;
          }
        } else if (v.fltStage === 1) {
          fe += (this.fS - fe) * fDC;
          if (Math.abs(fe - this.fS) < 1e-4) v.fltStage = 2;
        } else if (v.fltStage === 3) {
          fe -= fe * fRC;
        }
        v.fltEnv = fe;

        const f0 = Math.min(sr * 0.45, Math.pow(2, v.lf + bendCents / 1200));
        const dt = f0 / sr;

        // --- Corner A: Saw / Variable-Pulse blend ---
        let sigA = 0;
        if (gA > 1e-4) {
          let p1 = v.phA1;
          const saw1 = 2 * p1 - 1 - polyBlep(p1, dt);
          let pulse1 = (p1 < pw ? 1 : -1) - polyBlep(p1, dt);
          const p1w = (p1 + 1 - pw) % 1;
          pulse1 += polyBlep(p1w, dt);
          p1 += dt;
          if (p1 >= 1) p1 -= 1;
          v.phA1 = p1;

          const dt2 = dt * 1.0035;
          let p2 = v.phA2;
          const saw2 = 2 * p2 - 1 - polyBlep(p2, dt2);
          p2 += dt2;
          if (p2 >= 1) p2 -= 1;
          v.phA2 = p2;

          sigA = (0.45 * (saw1 + 0.5 * saw2) + 0.55 * pulse1) * gA;
        } else {
          v.phA1 = (v.phA1 + dt) % 1;
          v.phA2 = (v.phA2 + dt * 1.0035) % 1;
        }

        // --- Corner B: 2-Operator FM Bell ---
        let sigB = 0;
        v.bellEnv = 0.28 + (v.bellEnv - 0.28) * bellDecay;
        if (gB > 1e-4) {
          const mIdx = v.phBm & TAB_MASK;
          const mFrac = v.phBm - (v.phBm | 0);
          const modSin = SINE[mIdx] + (SINE[mIdx + 1] - SINE[mIdx]) * mFrac;
          const pm = modSin * fmIndex * v.bellEnv * (TAB_N / (2 * Math.PI));
          const cPh = ((v.phBc + pm) % TAB_N + TAB_N) % TAB_N;
          const cIdx = cPh | 0;
          const cFrac = cPh - cIdx;
          const carSin = SINE[cIdx] + (SINE[cIdx + 1] - SINE[cIdx]) * cFrac;
          sigB = carSin * gB * 0.9;
        }
        v.phBc += dt * TAB_N;
        if (v.phBc >= TAB_N) v.phBc -= TAB_N;
        v.phBm += dt * fmRatio * TAB_N;
        if (v.phBm >= TAB_N) v.phBm %= TAB_N;

        // --- Corner C: Procedural Wavetable ---
        let sigC = 0;
        if (gC > 1e-4) {
          const i1 = v.phC1 | 0;
          const fr1 = v.phC1 - i1;
          const w0a = WAVETABLES[wtBase0 + i1] + (WAVETABLES[wtBase0 + i1 + 1] - WAVETABLES[wtBase0 + i1]) * fr1;
          const w1a = WAVETABLES[wtBase1 + i1] + (WAVETABLES[wtBase1 + i1 + 1] - WAVETABLES[wtBase1 + i1]) * fr1;
          const s1 = w0a + (w1a - w0a) * wtFrac;

          const i2 = v.phC2 | 0;
          const fr2 = v.phC2 - i2;
          const w0b = WAVETABLES[wtBase0 + i2] + (WAVETABLES[wtBase0 + i2 + 1] - WAVETABLES[wtBase0 + i2]) * fr2;
          const w1b = WAVETABLES[wtBase1 + i2] + (WAVETABLES[wtBase1 + i2 + 1] - WAVETABLES[wtBase1 + i2]) * fr2;
          const s2 = w0b + (w1b - w0b) * wtFrac;

          sigC = (s1 + 0.6 * s2) * 0.65 * gC;
        }
        v.phC1 += dt * TAB_N;
        if (v.phC1 >= TAB_N) v.phC1 -= TAB_N;
        v.phC2 += dt * 0.997 * TAB_N;
        if (v.phC2 >= TAB_N) v.phC2 -= TAB_N;

        // --- Corner D: 2-Formant Band-Pass Filtered Noise + Glottal Excitation ---
        let sigD = 0;
        rng = (rng * 1664525 + 1013904223) | 0;
        const white = (rng >> 16) / 32768;
        let pd = v.phD;
        const glottal = 2 * pd - 1 - polyBlep(pd, dt);
        pd += dt;
        if (pd >= 1) pd -= 1;
        v.phD = pd;
        if (gD > 1e-4) {
          const dIn = white * 0.65 + glottal * 0.45;
          // Formant 1 band-pass SVF
          const v3_1 = dIn - v.f1Ic2;
          const v1_1 = f1A1 * v.f1Ic1 + f1A2 * v3_1;
          const v2_1 = v.f1Ic2 + f1G * v1_1;
          v.f1Ic1 = 2 * v1_1 - v.f1Ic1;
          v.f1Ic2 = 2 * v2_1 - v.f1Ic2;

          // Formant 2 band-pass SVF
          const v3_2 = dIn - v.f2Ic2;
          const v1_2 = f2A1 * v.f2Ic1 + f2A2 * v3_2;
          const v2_2 = v.f2Ic2 + f2G * v1_2;
          v.f2Ic1 = 2 * v1_2 - v.f2Ic1;
          v.f2Ic2 = 2 * v2_2 - v.f2Ic2;

          sigD = (v1_1 * 1.35 + v1_2 * 1.15) * gD;
        }

        // Stereo vector mix (subtle spatial placement for the 4 corners)
        const inL = sigA * 1.08 + sigB * 0.92 + sigC * 1.06 + sigD * 0.94;
        const inR = sigA * 0.92 + sigB * 1.08 + sigC * 0.94 + sigD * 1.06;

        // Update shared SVF filter coefficients every 4 samples
        if ((i & 3) === 0 || svfA1 === 0) {
          const cutHz = Math.max(40, Math.min(sr * 0.44, baseCut * Math.pow(2, fe * envOct)));
          const g = Math.tan((Math.PI * cutHz) / sr);
          svfA1 = 1 / (1 + g * (g + svfK));
          svfA2 = g * svfA1;
          svfA3 = g * svfA2;
        }

        // Filter Left
        const v3L = inL - v.svfIc2L;
        const v1L = svfA1 * v.svfIc1L + svfA2 * v3L;
        const v2L = v.svfIc2L + svfA2 * v.svfIc1L + svfA3 * v3L;
        v.svfIc1L = Math.max(-8, Math.min(8, 2 * v1L - v.svfIc1L));
        v.svfIc2L = Math.max(-8, Math.min(8, 2 * v2L - v.svfIc2L));
        const fltL = fType === 0 ? v2L : fType === 1 ? v1L : inL - svfK * v1L - v2L;

        // Filter Right
        const v3R = inR - v.svfIc2R;
        const v1R = svfA1 * v.svfIc1R + svfA2 * v3R;
        const v2R = v.svfIc2R + svfA2 * v.svfIc1R + svfA3 * v3R;
        v.svfIc1R = Math.max(-8, Math.min(8, 2 * v1R - v.svfIc1R));
        v.svfIc2R = Math.max(-8, Math.min(8, 2 * v2R - v.svfIc2R));
        const fltR = fType === 0 ? v2R : fType === 1 ? v1R : inR - svfK * v1R - v2R;

        const gain = ae * velPeak;
        const yL = fltL * gain;
        const yR = fltR * gain;
        if (!Number.isFinite(yL) || !Number.isFinite(yR)) {
          v.active = false;
          break;
        }
        L[i] += yL;
        if (R !== L) R[i] += yR;
        const ay = Math.abs(yL) > Math.abs(yR) ? Math.abs(yL) : Math.abs(yR);
        if (ay > peak) peak = ay;
      }

      if (v.released && v.ampEnv < 1e-4) {
        v.active = false;
      } else if (!v.released && peak < 1e-6) {
        v.silent += n;
        if (v.silent > sr * 2) v.active = false;
      } else {
        v.silent = 0;
      }
      v.delay = 0;
    }

    this.rng = rng;
    return true;
  }
}

registerProcessor("sy1-vector", SY1VectorProcessor);
