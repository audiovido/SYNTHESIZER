/**
 * SY-1 Engine — Drum machine (Kerman)
 *
 * Eight synthesized drum voices built from Web Audio nodes per hit (no
 * samples), a 16-step sequencer (12 steps for 6/8 grooves) with accents and
 * swing, and 8 pattern slots. Hits are scheduled ahead on the audio clock, so
 * timing stays tight even when the page is busy.
 */

import { mirrorCall } from "./mirror";

import { getAudioCtxIfAny, getSharedNoiseBuffer } from "./bus";
import { acousticHit, classicHit, ClassicModel, driveCurve, HAT808, HitCtx, minimalHit, persianHit } from "./drum-models";

export const DRUM_VOICES = ["kick", "snare", "clap", "ch", "oh", "tom", "rim", "bell"] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const DRUM_LABELS: Record<DrumVoice, string> = {
  kick: "KICK", snare: "SNARE", clap: "CLAP", ch: "HAT", oh: "OPEN", tom: "TOM", rim: "RIM", bell: "BELL"
};

export type DrumModel = "analog" | "persian" | "acoustic" | "minimal" | ClassicModel;
/** Every sound model a kit (or a single slot of a kit) can use. */
export const DRUM_MODELS: DrumModel[] = ["analog", "tr909", "tr707", "tr606", "cr78", "lm80", "acoustic", "persian", "minimal"];
const CLASSIC = new Set<string>(["tr909", "tr707", "tr606", "cr78", "lm80"]);
/** Models whose closed hat chokes a ringing open hat (drum machines with a hi-hat pair). */
const CHOKES = new Set<string>(["analog", "tr909", "tr707", "tr606", "cr78", "lm80"]);
let drumModel: DrumModel = "analog";
let drumLabels: Record<DrumVoice, string> = { ...DRUM_LABELS };

/** The active drum machine's sound model and slot names (set on machine switch). */
export function setDrumKit(model: DrumModel | undefined, labels: Partial<Record<DrumVoice, string>> | undefined): void {
  drumModel = model || "analog";
  drumLabels = { ...DRUM_LABELS, ...(labels || {}) };
}
export function drumLabel(v: DrumVoice): string {
  return drumLabels[v];
}

/** General MIDI drum notes (used for pads, the keyboard and MIDI input). */
export const DRUM_NOTES: Record<DrumVoice, number> = {
  kick: 36, rim: 37, snare: 38, clap: 39, ch: 42, tom: 45, oh: 46, bell: 56
};
const NOTE_TO_VOICE: Record<number, DrumVoice> = {
  35: "kick", 36: "kick", 37: "rim", 38: "snare", 40: "snare", 39: "clap", 42: "ch", 44: "ch",
  46: "oh", 41: "tom", 43: "tom", 45: "tom", 47: "tom", 48: "tom", 50: "tom", 56: "bell"
};
export function drumVoiceForNote(midi: number): DrumVoice | null {
  return NOTE_TO_VOICE[midi] || null;
}

export interface DrumPattern {
  len: number; // 16 or 12
  steps: Record<DrumVoice, number[]>; // 0 off, 1 on, 2 accent, 3 ghost
  /** Per step: hits inside the step (1 = normal, 2-4 = roll / riz). Missing = 1. */
  roll?: Partial<Record<DrumVoice, number[]>>;
  /** Per step: 1 = flam (a soft grace note just before the hit). Missing = 0. */
  flam?: Partial<Record<DrumVoice, number[]>>;
  /** Per step: chance to play, in % (25-100). Missing = 100. */
  prob?: Partial<Record<DrumVoice, number[]>>;
}

/** What tapping a step does (the EDIT button cycles through these). */
export type StepEdit = "hit" | "accent" | "ghost" | "roll" | "flam" | "chance";
export const STEP_EDITS: StepEdit[] = ["hit", "accent", "ghost", "roll", "flam", "chance"];

const getArr = (rec: Partial<Record<DrumVoice, number[]>> | undefined, v: DrumVoice, i: number, def: number) => {
  const a = rec?.[v];
  return a && typeof a[i] === "number" ? a[i] : def;
};
export const stepRoll = (p: DrumPattern, v: DrumVoice, i: number) => getArr(p.roll, v, i, 1);
export const stepFlam = (p: DrumPattern, v: DrumVoice, i: number) => getArr(p.flam, v, i, 0);
export const stepProb = (p: DrumPattern, v: DrumVoice, i: number) => getArr(p.prob, v, i, 100);
function setArr(p: DrumPattern, key: "roll" | "flam" | "prob", v: DrumVoice, i: number, val: number, def: number): void {
  const rec = (p[key] = p[key] || {});
  const a = (rec[v] = rec[v] || new Array(16).fill(def));
  a[i] = val;
}

export function emptyPattern(len = 16): DrumPattern {
  const steps = {} as Record<DrumVoice, number[]>;
  DRUM_VOICES.forEach((v) => (steps[v] = new Array(16).fill(0)));
  return { len, steps };
}

/**
 * Pattern from compact strings, one character per step:
 *   "x" hit · "X" accent · "g" ghost · "2" "3" "4" roll (riz) of that many hits
 *   "f" flam · "F" accented flam · "?" hit with a 50% chance · anything else off
 */
export function patternFrom(len: number, rows: Partial<Record<DrumVoice, string>>): DrumPattern {
  const p = emptyPattern(len);
  (Object.keys(rows) as DrumVoice[]).forEach((v) => {
    const s = rows[v] || "";
    for (let i = 0; i < 16 && i < s.length; i++) {
      const c = s[i];
      p.steps[v][i] = c === "X" || c === "F" ? 2 : c === "g" ? 3 : "x234f?".includes(c) ? 1 : 0;
      if (c === "2" || c === "3" || c === "4") setArr(p, "roll", v, i, Number(c), 1);
      if (c === "f" || c === "F") setArr(p, "flam", v, i, 1, 0);
      if (c === "?") setArr(p, "prob", v, i, 50, 100);
    }
  });
  return p;
}

// ---------------------------------------------------------------- sound ----
type Patch = Record<string, any>;
let getPatch: () => Patch = () => ({});
/** Where hits go: `main` = the FX bus input (dry path), `send` = its effects-only input. */
export interface DrumDest { main: AudioNode; send: AudioNode }
let getDest: () => DrumDest | null = () => null;
let openHatOut: GainNode | null = null;

export function configureDrums(patchGetter: () => Patch, destGetter: () => DrumDest | null): void {
  getPatch = patchGetter;
  getDest = destGetter;
}

// ------------------------------------------------------------ drum bus ----
// Every hit's dry signal passes through one bus before the shared FX bus: a
// compressor that "glues" the kit together (slow-ish attack keeps the
// transients, the body comes up), then gentle tanh saturation. GLUE 0 = clean.
interface DrumBus { input: GainNode; comp: DynamicsCompressorNode; makeup: GainNode; sat: WaveShaperNode; glue: number }
const drumBuses = new WeakMap<BaseAudioContext, DrumBus>();

function glueCurve(glue: number): Float32Array {
  const c = new Float32Array(1024);
  const k = 0.001 + 1.6 * glue;
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

function applyGlue(b: DrumBus, glue: number): void {
  if (Math.abs(b.glue - glue) < 1e-3) return;
  b.glue = glue;
  b.comp.threshold.value = -4 - 20 * glue;    // dB
  b.comp.ratio.value = 1 + 3 * glue;           // up to 4:1, a classic bus ratio
  b.comp.knee.value = 8;
  b.comp.attack.value = 0.012;                 // lets the stick / beater click through
  b.comp.release.value = 0.14;
  b.makeup.gain.value = Math.pow(10, (3 * glue) / 20); // measured: keeps kits within ~1-2 dB of their GLUE-0 loudness
  b.sat.curve = glueCurve(glue) as any;
}

function getDrumBus(ctx: BaseAudioContext, main: AudioNode, glue: number): DrumBus {
  let b = drumBuses.get(ctx);
  if (!b) {
    const input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    const sat = ctx.createWaveShaper();
    sat.oversample = "2x";
    input.connect(comp);
    comp.connect(makeup);
    makeup.connect(sat);
    sat.connect(main);
    b = { input, comp, makeup, sat, glue: -1 };
    drumBuses.set(ctx, b);
  }
  applyGlue(b, glue);
  return b;
}

function vp(v: DrumVoice, key: "Tune" | "Decay" | "Tone" | "Level" | "Pan" | "Color" | "Drive" | "Send", def: number): number {
  const x = getPatch()[v + key];
  return typeof x === "number" ? x : def;
}

function env(g: GainNode, t: number, peak: number, decay: number, attack = 0.001): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0.0001, t + attack, Math.max(0.003, decay / 4));
}

function noiseSrc(ctx: AudioContext, t: number, dur: number): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = getSharedNoiseBuffer(ctx);
  n.loop = true;
  n.start(t, Math.random() * 1.5);
  n.stop(t + dur);
  return n;
}

/**
 * How each model reacts to the player (0 = machine-exact, 1 = full):
 *  - vel: velocity changes timbre, not only level. Softer = darker (a low-pass
 *    on the hit closing from open at full velocity), less pitch bend at the
 *    attack, slightly shorter ring. Every voice is designed at full velocity,
 *    so accented / full-velocity hits sound exactly as before.
 *  - human: hit-to-hit variation (pitch +-8 cents, level +-0.7 dB, decay and
 *    tone a few %), so repeated hits are never identical copies.
 * Acoustic and Persian drums get the full amounts, the analog machine a
 * little (free-running analog circuits drift too), Hormoz (minimal & percussion) most of the way.
 */
const FEEL: Record<DrumModel, { vel: number; human: number }> = {
  persian: { vel: 1, human: 1 },
  acoustic: { vel: 1, human: 1 },
  analog: { vel: 0.6, human: 0.4 },
  minimal: { vel: 0.8, human: 0.6 }, // hand percussion breathes; the electronic voices stay tight enough
  tr909: { vel: 0.6, human: 0.35 },
  tr707: { vel: 0.4, human: 0.15 },  // samples: the same hit every time, only louder or softer
  tr606: { vel: 0.5, human: 0.35 },
  cr78: { vel: 0.5, human: 0.4 },
  lm80: { vel: 0.45, human: 0.2 }
};

/** The model that plays slot `v`: the slot's own MODEL, else the kit's, else the machine's. */
export function drumModelFor(v: DrumVoice): DrumModel {
  const p = getPatch();
  const own = p[v + "Model"];
  if (typeof own === "string" && own && (DRUM_MODELS as string[]).includes(own)) return own as DrumModel;
  const kit = p.kitModel;
  if (typeof kit === "string" && kit && (DRUM_MODELS as string[]).includes(kit)) return kit as DrumModel;
  return drumModel;
}

let hitListener: ((v: DrumVoice, vel: number, at: number) => void) | null = null;
/** Called for every drum hit with its audio time (MIDI out and take recording). */
export function setDrumHitListener(fn: ((v: DrumVoice, vel: number, at: number) => void) | null): void {
  hitListener = fn;
}

/** Play one drum hit at audio time `at` with velocity 0..1. */
export function triggerDrum(v: DrumVoice, vel: number, at?: number): void {
  const ctx = getAudioCtxIfAny();
  const dest = getDest();
  if (!ctx || !dest) return;
  // While the audio device is still starting (first tap), the clock can jump ahead:
  // schedule a few ms later so the attack of the very first hit is not lost.
  const warmup = ctx.state !== "running" || ctx.currentTime < 0.3 ? 0.04 : 0;
  const t = Math.max(ctx.currentTime + warmup, at || 0);
  if (hitListener) hitListener(v, vel, t);
  const model = drumModelFor(v);
  const feel = FEEL[model] || FEEL.analog;
  const velC = Math.max(0, Math.min(1, vel));
  const soft = feel.vel * (1 - velC);                   // 0 at full velocity
  const jit = () => (Math.random() * 2 - 1) * feel.human; // -human..+human
  const tune = Math.pow(2, vp(v, "Tune", 0) / 12 + (jit() * 8 - soft * 12) / 1200);
  const dec = vp(v, "Decay", 1) * (1 + jit() * 0.05) * (1 - 0.15 * soft);
  const tone = Math.max(0, Math.min(1, vp(v, "Tone", 0.5) + jit() * 0.04));
  const lvl = vp(v, "Level", 0.8) * (0.25 + 0.75 * vel) * (1 + jit() * 0.08);
  const strike = 1 - 0.45 * soft;
  const out = ctx.createGain();
  out.gain.value = lvl;
  // Per-hit chain: level -> velocity brightness -> COLOR -> DRIVE -> PAN -> drum bus (+ SEND to the effects)
  const chain: AudioNode[] = [out];
  const link = (n: AudioNode) => { chain[chain.length - 1].connect(n); chain.push(n); };
  // velocity brightness: open at full velocity, ~2.5 octaves darker at the softest touch
  const cut = 20000 * Math.pow(2, -2.5 * soft);
  const nyq = ctx.sampleRate * 0.45;
  if (cut < Math.min(19000, nyq)) {
    const bright = ctx.createBiquadFilter();
    bright.type = "lowpass";
    bright.frequency.value = cut;
    bright.Q.value = -3; // dB: flat (Butterworth), no resonant bump
    link(bright);
  }
  // COLOR: one knob, DJ-style: left closes a low-pass (to ~150 Hz), right opens a high-pass (to ~14 kHz)
  const color = vp(v, "Color", 0);
  if (Math.abs(color) > 0.02) {
    const f = ctx.createBiquadFilter();
    f.type = color < 0 ? "lowpass" : "highpass";
    f.frequency.value = Math.min(nyq, color < 0 ? 20000 * Math.pow(2, color * 7) : 20 * Math.pow(2, color * 9.5));
    f.Q.value = 1; // dB, a touch of edge like a mixer filter
    link(f);
  }
  // DRIVE: per-voice tanh saturation, loudness-compensated
  const drv = vp(v, "Drive", 0);
  if (drv > 0.01) {
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(drv) as any;
    sh.oversample = "2x";
    link(sh);
    const comp = ctx.createGain();
    comp.gain.value = 1 / (1 + 0.8 * drv);
    link(comp);
  }
  // PAN
  const pan = vp(v, "Pan", 0);
  if (Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === "function") {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    link(p);
  }
  const last = chain[chain.length - 1];
  const glue = typeof getPatch().drumGlue === "number" ? getPatch().drumGlue : 0.35;
  last.connect(getDrumBus(ctx, dest.main, glue).input);
  // SEND: this voice's share of delay + reverb (the main signal itself no longer feeds them on drum machines)
  const send = vp(v, "Send", v === "kick" ? 0.2 : 1);
  if (send > 0.001) {
    const sg = ctx.createGain();
    sg.gain.value = send;
    last.connect(sg);
    sg.connect(dest.send);
    chain.push(sg);
  }
  const life = 3 * dec + 0.2;
  setTimeout(() => {
    for (const n of chain) { try { n.disconnect(); } catch (e) {} }
  }, (t - ctx.currentTime + life) * 1000 + 100);

  // hi-hat pair: the closed hat chokes a ringing open hat (on machines that have one)
  if (CHOKES.has(model)) {
    if (v === "ch" && openHatOut) {
      openHatOut.gain.cancelScheduledValues(t);
      openHatOut.gain.setTargetAtTime(0.0001, t, 0.004);
      openHatOut = null;
    } else if (v === "oh") openHatOut = out;
  }

  if (model !== "analog") {
    const h: HitCtx = { ctx, out, t, tune, dec, tone, vel, life, strike };
    if (CLASSIC.has(model)) classicHit(model as ClassicModel, v, h);
    else if (model === "persian") persianHit(v, h);
    else if (model === "acoustic") acousticHit(v, h);
    else minimalHit(v, h);
    return;
  }

  if (v === "kick") {
    const o = ctx.createOscillator();
    o.type = "sine";
    const f1 = 52 * tune;
    o.frequency.setValueAtTime(f1 * (1 + (1.6 + tone * 2) * strike), t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.06 * dec + 0.01);
    const g = ctx.createGain();
    env(g, t, 1.0, 0.5 * dec);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + life);
    // click
    const n = noiseSrc(ctx, t, 0.02);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
    const gc = ctx.createGain(); env(gc, t, 0.25 * tone, 0.008);
    n.connect(hp); hp.connect(gc); gc.connect(out);
  } else if (v === "snare") {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(170 * tune * (1 + (220 / 170 - 1) * strike), t);
    o.frequency.exponentialRampToValueAtTime(170 * tune, t + 0.05);
    const g = ctx.createGain(); env(g, t, 0.7 * (1 - tone * 0.6), 0.12 * dec);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + life);
    // second tone oscillator, like the 808 snare's upper "ring"
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 330 * tune;
    const g2 = ctx.createGain(); env(g2, t, 0.28 * (1 - tone * 0.6), 0.07 * dec);
    o2.connect(g2); g2.connect(out); o2.start(t); o2.stop(t + life);
    const n = noiseSrc(ctx, t, life);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200 * tune;
    const bp = ctx.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 3500 + 4000 * tone; bp.gain.value = 6;
    const gn = ctx.createGain(); env(gn, t, 0.6 + 0.4 * tone, 0.22 * dec);
    n.connect(hp); hp.connect(bp); bp.connect(gn); gn.connect(out);
  } else if (v === "clap") {
    const n = noiseSrc(ctx, t, life);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100 * tune * (0.7 + tone * 0.8); bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // three quick bursts, then the tail
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.011;
      g.gain.setValueAtTime(1, s);
      g.gain.setTargetAtTime(0.1, s + 0.001, 0.003);
    }
    g.gain.setValueAtTime(0.9, t + 0.034);
    g.gain.setTargetAtTime(0.0001, t + 0.035, Math.max(0.01, (0.28 * dec) / 4));
    n.connect(bp); bp.connect(g); g.connect(out);
  } else if (v === "ch" || v === "oh") {
    // the 808's six square oscillators at the circuit's own frequencies (205-800 Hz);
    // they put ~4 dB more through the hat filters than the old ratios, hence 0.16
    const sum = ctx.createGain(); sum.gain.value = 0.16;
    HAT808.forEach((fr) => {
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = fr * tune;
      o.connect(sum); o.start(t); o.stop(t + life);
    });
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000 + 3000 * tone;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 10000; bp.Q.value = 0.8;
    const g = ctx.createGain();
    if (v === "ch") env(g, t, 1, 0.06 * dec);
    else env(g, t, 0.9, 0.42 * dec);
    sum.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
  } else if (v === "tom") {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(110 * tune * (1 + ((150 * (1.4 + tone * 0.4)) / 110 - 1) * strike), t);
    o.frequency.exponentialRampToValueAtTime(110 * tune, t + 0.12);
    const g = ctx.createGain(); env(g, t, 0.95, 0.38 * dec);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + life);
  } else if (v === "rim") {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 1700 * tune;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200 * tune; bp.Q.value = 2 + tone * 4;
    const g = ctx.createGain(); env(g, t, 1.2, 0.035 * dec);
    o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3 + dec * 0.1);
  } else if (v === "bell") {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.002);
    g.gain.setTargetAtTime(0.3, t + 0.002, 0.01);
    g.gain.setTargetAtTime(0.0001, t + 0.03, Math.max(0.01, (0.3 * dec) / 4));
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2640 * tune; bp.Q.value = 1 + tone * 3;
    [540, 800].forEach((f) => {
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f * tune;
      o.connect(bp); o.start(t); o.stop(t + life);
    });
    bp.connect(g); g.connect(out);
  }
}

// ------------------------------------------------------------ sequencer ----
// Each drum machine keeps its own 8-pattern bank (Kerman keeps the original key).
const bankKey = (machineId: string) => (machineId === "kerman" ? "sy1.drums.bank" : `sy1.m.${machineId}.bank`);
let BANK_KEY = bankKey("kerman");
let bank: DrumPattern[] = Array.from({ length: 8 }, () => emptyPattern());
let current = 0;
let playing = false;
let step = 0;
let nextTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let getTempo: () => number = () => 110;
const listeners = new Set<() => void>();
const stepListeners = new Set<(s: number) => void>();

try {
  const saved = JSON.parse(localStorage.getItem(BANK_KEY) || "null");
  if (Array.isArray(saved) && saved.length === 8) bank = saved;
} catch (e) {}

/** Switch to a drum machine's own pattern bank (its saved one, or the given default kit patterns). */
export function useDrumBank(machineId: string, fallback?: DrumPattern[]): void {
  BANK_KEY = bankKey(machineId);
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(BANK_KEY) || "null"); } catch (e) {}
  if (Array.isArray(saved) && saved.length === 8) {
    bank = saved as DrumPattern[];
    current = 0;
    notify();
  } else {
    loadBank(fallback || []);
  }
}

function saveBank(): void {
  try { localStorage.setItem(BANK_KEY, JSON.stringify(bank)); } catch (e) {}
}
function notify(): void { listeners.forEach((cb) => cb()); }

export function onDrumChange(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export function onDrumStep(cb: (s: number) => void): () => void { stepListeners.add(cb); return () => stepListeners.delete(cb); }
export function setDrumTempoSource(fn: () => number): void { getTempo = fn; }

export function getPattern(i = current): DrumPattern { return bank[i]; }
export function getPatternIndex(): number { return current; }
export function isDrumPlaying(): boolean { return playing; }

function selectPattern__impl(i: number): void {
  current = Math.max(0, Math.min(7, i));
  notify();
}

export function loadBank(patterns: DrumPattern[]): void {
  bank = Array.from({ length: 8 }, (_, i) => (patterns[i] ? JSON.parse(JSON.stringify(patterns[i])) : emptyPattern()));
  current = 0;
  saveBank();
  notify();
}

/** Tap on a step, by edit mode. Turning a step off also clears its roll, flam and chance. */
function editStep__impl(v: DrumVoice, i: number, mode: StepEdit): void {
  const p = bank[current];
  const s = p.steps[v];
  const clearMods = () => { setArr(p, "roll", v, i, 1, 1); setArr(p, "flam", v, i, 0, 0); setArr(p, "prob", v, i, 100, 100); };
  switch (mode) {
    case "hit": s[i] = s[i] ? 0 : 1; if (!s[i]) clearMods(); break;
    case "accent": s[i] = s[i] === 2 ? 1 : 2; break;
    case "ghost": s[i] = s[i] === 3 ? 1 : 3; break;
    case "roll": { if (!s[i]) s[i] = 1; const r = stepRoll(p, v, i); setArr(p, "roll", v, i, r >= 4 ? 1 : r + 1, 1); break; }
    case "flam": if (!s[i]) s[i] = 1; setArr(p, "flam", v, i, stepFlam(p, v, i) ? 0 : 1, 0); break;
    case "chance": { if (!s[i]) s[i] = 1; const c = stepProb(p, v, i); setArr(p, "prob", v, i, c <= 25 ? 100 : c - 25, 100); break; }
  }
  saveBank();
  notify();
}

function setPatternLength__impl(len: number): void {
  bank[current].len = len === 12 ? 12 : 16;
  saveBank();
  notify();
}

function clearPattern__impl(): void {
  bank[current] = emptyPattern(bank[current].len);
  saveBank();
  notify();
}

function scheduler(): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx || !playing) return;
  const p = getPatch();
  const swing = typeof p.drumSwing === "number" ? p.drumSwing : 0;
  const accentAmt = typeof p.drumAccent === "number" ? p.drumAccent : 0.5;
  while (nextTime < ctx.currentTime + 0.12) {
    const pat = bank[current];
    const len = pat.len || 16;
    const stepDur = 60 / getTempo() / 4;
    const at = nextTime + (step % 2 === 1 ? swing * stepDur : 0);
    DRUM_VOICES.forEach((v) => {
      const s = pat.steps[v][step];
      if (!s) return;
      const prob = stepProb(pat, v, step);
      if (prob < 100 && Math.random() * 100 >= prob) return;
      const vel = s === 2 ? 1 : s === 3 ? 0.3 : 1 - 0.5 * accentAmt;
      if (stepFlam(pat, v, step)) triggerDrum(v, vel * 0.45, at - 0.022); // grace note just before
      const n = Math.max(1, Math.min(4, stepRoll(pat, v, step)));
      for (let k = 0; k < n; k++) triggerDrum(v, k === 0 ? vel : vel * 0.82, at + (k * stepDur) / n);
    });
    const shown = step;
    setTimeout(() => stepListeners.forEach((cb) => cb(shown)), Math.max(0, (at - ctx.currentTime) * 1000));
    step = (step + 1) % len;
    nextTime += stepDur;
  }
}

/** Start the sequencer; `at` (audio time) lines the first step up with an external clock. */
function startDrums__impl(at?: number, fromStep = 0): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx || playing) return;
  playing = true;
  // fromStep: the DAW's position (the plugin starts the pattern where the DAW's bar is)
  step = fromStep > 0 ? Math.floor(fromStep) % (bank[current].len || 16) : 0;
  nextTime = at !== undefined ? Math.max(ctx.currentTime + 0.005, at) : ctx.currentTime + 0.05;
  scheduler();
  timer = setInterval(scheduler, 25);
  notify();
}

function stopDrums__impl(): void {
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
  stepListeners.forEach((cb) => cb(-1));
  notify();
}

/** mirrored for the plugin (see mirror.ts) */
export function selectPattern(...args: Parameters<typeof selectPattern__impl>): ReturnType<typeof selectPattern__impl> {
  return mirrorCall("selectPattern", selectPattern__impl, args);
}

/** mirrored for the plugin (see mirror.ts) */
export function editStep(...args: Parameters<typeof editStep__impl>): ReturnType<typeof editStep__impl> {
  return mirrorCall("editStep", editStep__impl, args);
}

/** mirrored for the plugin (see mirror.ts) */
export function setPatternLength(...args: Parameters<typeof setPatternLength__impl>): ReturnType<typeof setPatternLength__impl> {
  return mirrorCall("setPatternLength", setPatternLength__impl, args);
}

/** mirrored for the plugin (see mirror.ts) */
export function clearPattern(...args: Parameters<typeof clearPattern__impl>): ReturnType<typeof clearPattern__impl> {
  return mirrorCall("clearPattern", clearPattern__impl, args);
}

/** mirrored for the plugin (see mirror.ts) */
export function startDrums(...args: Parameters<typeof startDrums__impl>): ReturnType<typeof startDrums__impl> {
  return mirrorCall("startDrums", startDrums__impl, args);
}

/** mirrored for the plugin (see mirror.ts) */
export function stopDrums(...args: Parameters<typeof stopDrums__impl>): ReturnType<typeof stopDrums__impl> {
  return mirrorCall("stopDrums", stopDrums__impl, args);
}

/** A drum hit played from the UI (pads, kit audition), `inSec` seconds from now. */
function playDrum__impl(v: DrumVoice, vel: number, inSec?: number): void {
  const ctx = getAudioCtxIfAny();
  triggerDrum(v, vel, inSec !== undefined && ctx ? ctx.currentTime + inSec : undefined);
}

export function playDrum(...args: Parameters<typeof playDrum__impl>): ReturnType<typeof playDrum__impl> {
  return mirrorCall("playDrum", playDrum__impl, args);
}
