/**
 * SY-1 Engine — Drum sound models for the drum machines
 *
 * The sequencer, patterns and 8 slots are shared (see drums.ts). Each drum
 * machine picks a model that decides how the 8 slots sound:
 *
 *   persian  (Bushehr) DOHOL, TAK, DAF, ZANG, DAYEREH, DOM, PELANG, SENJ
 *   acoustic (Rasht)   KICK, SNARE, BRUSH, HAT, RIDE, TOM, X-STICK, SHAKER
 *   minimal  (Hormoz)  KICK, SNAP, CLAP, SHAKER, HAT, CONGA, CLAVE, KALIMBA
 *
 * Every hit is built from Web Audio nodes (no samples). Per slot the TUNE,
 * DECAY, TONE and LEVEL knobs work the same way on every model: TUNE
 * transposes, DECAY scales the tail, TONE moves the brightness or the
 * character described next to each voice.
 *
 * Voices are designed at full velocity. triggerDrum (drums.ts) makes softer
 * hits darker, shorter and less bent (via HitCtx.strike), and varies each hit
 * slightly, like a real player.
 */

import { getSharedNoiseBuffer } from "./bus";

type Slot = "kick" | "snare" | "clap" | "ch" | "oh" | "tom" | "rim" | "bell";

export interface HitCtx {
  ctx: AudioContext;
  out: GainNode;
  t: number;
  tune: number; // frequency ratio from TUNE
  dec: number;  // decay scale
  tone: number; // 0..1
  vel: number;  // 0..1
  life: number; // seconds the hit may last
  /** Pitch-drop depth for this hit (1 = full, as voiced at full velocity): softer strikes bend the skin less. */
  strike?: number;
}

// Strike depth of the hit being built (set at the top of each model function;
// hits are built synchronously, one at a time).
let strike = 1;

// ------------------------------------------------------------- helpers ----
function env(g: GainNode, t: number, peak: number, decay: number, attack = 0.001): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0.0001, t + attack, Math.max(0.002, decay / 4));
}

function gain(h: HitCtx, peak: number, decay: number, attack = 0.001): GainNode {
  const g = h.ctx.createGain();
  env(g, h.t, peak, decay, attack);
  g.connect(h.out);
  return g;
}

function osc(h: HitCtx, type: OscillatorType, f: number, dest: AudioNode, stopAfter = h.life): OscillatorNode {
  const o = h.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(10, Math.min(20000, f)), h.t);
  o.connect(dest);
  o.start(h.t);
  o.stop(h.t + stopAfter);
  return o;
}

/** Pitch drop: from f*from to f over `time` seconds (depth scaled by the hit's strike). */
function drop(o: OscillatorNode, t: number, f: number, from: number, time: number): void {
  const fromS = 1 + (from - 1) * strike;
  o.frequency.setValueAtTime(Math.max(10, f * fromS), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(10, f), t + Math.max(0.003, time));
}

function noise(h: HitCtx, dest: AudioNode, dur = h.life): AudioBufferSourceNode {
  const n = h.ctx.createBufferSource();
  n.buffer = getSharedNoiseBuffer(h.ctx);
  n.loop = true;
  n.connect(dest);
  n.start(h.t, Math.random() * 1.5);
  n.stop(h.t + dur);
  return n;
}

function filt(h: HitCtx, type: BiquadFilterType, f: number, q = 0.7, dest?: AudioNode): BiquadFilterNode {
  const b = h.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = Math.max(20, Math.min(h.ctx.sampleRate * 0.45, f));
  b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}

/** Several quick taps on one gain (jingles, claps, rattles). */
function taps(g: GainNode, t: number, times: number[], peak: number, tail: number): void {
  g.gain.setValueAtTime(0.0001, t);
  times.forEach((dt, i) => {
    const p = peak * (1 - i * 0.12);
    g.gain.setValueAtTime(Math.max(0.0001, p), t + dt);
    g.gain.setTargetAtTime(p * 0.25, t + dt + 0.0008, 0.004);
  });
  const end = times[times.length - 1] || 0;
  g.gain.setTargetAtTime(0.0001, t + end + 0.003, Math.max(0.004, tail / 4));
}

const crushCurves = new Map<number, Float32Array>();
function crushCurve(levels: number): Float32Array {
  let c = crushCurves.get(levels);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.round(x * levels) / levels;
    }
    crushCurves.set(levels, c);
  }
  return c;
}

const driveCurves = new Map<number, Float32Array>();
export function driveCurve(k: number): Float32Array {
  const key = Math.round(k * 20);
  let c = driveCurves.get(key);
  if (!c) {
    c = new Float32Array(1024);
    const kk = 1 + key * 1.5;
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(kk * x) / Math.tanh(kk);
    }
    driveCurves.set(key, c);
  }
  return c;
}

// ------------------------------------------------------- modal synthesis ----
/**
 * A struck membrane, bar or bell rings as a set of decaying sine "modes" at
 * physically fixed frequency ratios; where and how it is struck decides which
 * modes sound. Each mode: [frequency ratio, amplitude, decay seconds].
 */
type Mode = [ratio: number, amp: number, decay: number];

/** Ideal circular membrane, mode (m,n) -> ratio to the fundamental (0,1). */
const MEMBRANE = {
  m01: 1, m11: 1.594, m21: 2.136, m02: 2.296, m31: 2.653, m12: 2.918, m41: 3.156, m22: 3.501, m03: 3.6, m51: 3.652
};

/**
 * Ring a set of modes from frequency f. `bend` = how much sharper the modes start
 * (skin tension rises with the strike, then settles) over `bendTime` seconds;
 * scaled by the hit's strike depth like every pitch drop. Each mode gets a
 * small random amplitude and the bend a small random depth, as in a real hit.
 */
function ring(h: HitCtx, f: number, list: Mode[], peak: number, bend = 0, bendTime = 0.05, type: OscillatorType = "sine"): void {
  for (const [r, a, d] of list) {
    if (a <= 0.001) continue;
    const g = gain(h, peak * a * (0.92 + Math.random() * 0.16), Math.max(0.005, d * h.dec));
    const o = osc(h, type, f * r, g);
    if (bend > 0) drop(o, h.t, f * r, 1 + bend * (0.85 + Math.random() * 0.3), bendTime);
  }
}

/** Contact noise of the strike (hand, finger, stick): filtered noise burst. */
function contact(h: HitCtx, type: BiquadFilterType, f: number, q: number, peak: number, decay: number, attack = 0.0007): void {
  noise(h, filt(h, type, Math.max(30, f), q, gain(h, peak, decay, attack)), Math.min(h.life, decay * 3 + 0.02));
}

function shaper(h: HitCtx, curve: Float32Array, dest: AudioNode): WaveShaperNode {
  const w = h.ctx.createWaveShaper();
  w.curve = curve as any;
  w.connect(dest);
  return w;
}

// --------------------------------------------------- PERSIAN (Bushehr) ----
export function persianHit(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  strike = h.strike ?? 1;
  if (v === "kick") {
    // DOHOL: big double-headed drum, heavy beater on the bass skin. The membrane's modes
    // ring with a tension bend; the beater adds a felt thump. TONE = beater brightness.
    const f = 60 * tune;
    ring(h, f, [[MEMBRANE.m01, 1, 0.8], [MEMBRANE.m11, 0.42, 0.32], [MEMBRANE.m21, 0.22, 0.22], [MEMBRANE.m02, 0.18, 0.18], [MEMBRANE.m31, 0.1, 0.12]], 1, 0.45, 0.05);
    contact(h, "lowpass", 450 + 2400 * tone, 0.9, 0.5, 0.045);
  } else if (v === "tom") {
    // DOM: tombak bass stroke in the centre of the skin. A centre strike excites only the
    // symmetric modes (0,1), (0,2), (0,3); the goblet's air adds a low thump. TONE = ring.
    const f = 98 * tune;
    ring(h, f, [[MEMBRANE.m01, 1, 0.55], [MEMBRANE.m02, 0.2 + 0.35 * tone, 0.2], [MEMBRANE.m03, 0.06 + 0.12 * tone, 0.12]], 1, 0.16, 0.08);
    ring(h, f * 0.62, [[1, 0.3, 0.16]], 1, 0.1, 0.05); // Helmholtz resonance of the goblet body
    contact(h, "bandpass", 380 * tune, 1.1, 0.22, 0.03);
  } else if (v === "snare") {
    // TAK: tombak edge stroke, bright and ringing. An edge strike excites the asymmetric
    // modes (1,1), (2,1), (3,1)...; TONE brings up the upper ones.
    const F = 445 * tune;
    ring(h, F, [
      [MEMBRANE.m01, 0.25, 0.08], [MEMBRANE.m11, 0.75, 0.1], [MEMBRANE.m21, 0.55, 0.075],
      [MEMBRANE.m31, 0.3 + 0.4 * tone, 0.055], [MEMBRANE.m41, 0.15 + 0.35 * tone, 0.04], [MEMBRANE.m51, 0.08 + 0.25 * tone, 0.03]
    ], 1, 0.04, 0.02);
    contact(h, "highpass", 3000, 0.7, 0.4, 0.008);
  } else if (v === "rim") {
    // PELANG: finger snap / slap on the skin: a sharp burst plus the high modes it shakes.
    contact(h, "bandpass", (1600 + 2600 * tone) * tune, 1.6, 1, 0.035 * dec);
    ring(h, 445 * tune, [[MEMBRANE.m21, 0.28, 0.03], [MEMBRANE.m41, 0.2, 0.025], [MEMBRANE.m51, 0.12, 0.02]], 1);
  } else if (v === "clap") {
    // DAF: large frame drum with metal ringlets inside the frame. The thin skin booms
    // briefly; the ringlets (random small pitches each hit) sizzle and keep rattling a
    // moment after the stroke. TONE = ringlets vs skin.
    const f = 78 * tune;
    ring(h, f, [[MEMBRANE.m01, 0.85 * (1 - 0.4 * tone), 0.22], [MEMBRANE.m11, 0.3 * (1 - 0.4 * tone), 0.12], [MEMBRANE.m21, 0.15, 0.08]], 1, 0.35, 0.03);
    const gj = h.ctx.createGain();
    gj.connect(h.out);
    const jt = () => Math.random() * 0.003;
    taps(gj, t, [0, 0.006 + jt(), 0.014 + jt(), 0.024 + jt(), 0.037 + jt()], 0.35 + 0.55 * tone, 0.3 * dec);
    const bp = filt(h, "bandpass", 5600 * Math.sqrt(tune), 0.7, gj);
    const rings = h.ctx.createGain();
    rings.gain.value = 4 / 7; // seven ringlets, same loudness as the old four partials
    rings.connect(bp);
    for (let i = 0; i < 7; i++) osc(h, "square", (2900 + i * 780 + Math.random() * 300) * tune, rings);
    noise(h, filt(h, "highpass", 6000, 0.7, gj));
  } else if (v === "oh") {
    // DAYEREH: frame drum shaken, rattling jingles. TONE = rattle speed.
    const gj = h.ctx.createGain();
    gj.connect(h.out);
    const n = 5 + Math.round(tone * 6);
    const span = 0.09 + 0.12 * dec;
    const times: number[] = [];
    for (let i = 0; i < n; i++) times.push((i / n) * span + Math.random() * 0.006);
    taps(gj, t, times, 0.7, 0.18 * dec);
    noise(h, filt(h, "bandpass", 6500 * Math.sqrt(tune), 1.1, gj));
    [3900, 5600].forEach((fr) => osc(h, "square", fr * tune, filt(h, "bandpass", 5000, 1, gj)));
    osc(h, "sine", 190 * tune, gain(h, 0.3, 0.08 * dec));
  } else if (v === "ch") {
    // ZANG: finger cymbals, a bright beating ring. TONE = upper partial.
    const base = 2640 * tune;
    osc(h, "sine", base, gain(h, 0.5, 0.9 * dec));
    osc(h, "sine", base * 1.0045, gain(h, 0.45, 0.85 * dec));
    osc(h, "sine", base * 1.502, gain(h, 0.18 + 0.3 * tone, 0.55 * dec));
    osc(h, "sine", base * 2.005, gain(h, 0.1 + 0.25 * tone, 0.35 * dec));
    noise(h, filt(h, "highpass", 7000, 0.7, gain(h, 0.2, 0.01)), 0.03);
  } else if (v === "bell") {
    // SENJ: hand cymbals of the Bushehr sang-o-senj. TONE = brightness.
    const hp = filt(h, "highpass", 2500 + 4000 * tone, 0.6);
    hp.connect(gain(h, 0.75, 1.1 * dec, 0.003));
    const sum = h.ctx.createGain();
    sum.gain.value = 0.22;
    sum.connect(hp);
    [287, 421, 563, 739, 912, 1187].forEach((fr) => osc(h, "square", fr * tune, sum));
    noise(h, filt(h, "highpass", 4000, 0.7, gain(h, 0.35, 0.6 * dec, 0.003)));
  }
}

// ---------------------------------------------------- ACOUSTIC (Rasht) ----
export function acousticHit(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  strike = h.strike ?? 1;
  if (v === "kick") {
    // KICK: felt beater on a ported bass drum. TONE = beater click.
    const f = 56 * tune;
    const g = gain(h, 1.25, 0.32 * dec);
    drop(osc(h, "sine", f, g), t, f, 2.1, 0.028);
    // batter-head modes above the fundamental (the "skin" of a real kick)
    ring(h, f, [[MEMBRANE.m11, 0.16, 0.06], [MEMBRANE.m21, 0.09, 0.045], [MEMBRANE.m02, 0.06, 0.04]], 1, 0.6, 0.025);
    noise(h, filt(h, "bandpass", 3200, 0.9, gain(h, 0.12 + 0.5 * tone, 0.007)), 0.03);
    noise(h, filt(h, "lowpass", 160, 0.7, gain(h, 0.45, 0.06 * dec)), 0.2);
  } else if (v === "snare") {
    // SNARE: wood shell + snare wires. TONE = wires (snappy) vs shell.
    const body = 1 - 0.45 * tone;
    const g = gain(h, 0.55 * body, 0.09 * dec);
    drop(osc(h, "triangle", 188 * tune, g), t, 188 * tune, 1.25, 0.02);
    // batter-head modes: (1,1) is the classic ~330 Hz "ring" of a snare
    ring(h, 188 * tune, [[MEMBRANE.m11, 0.25, 0.05], [MEMBRANE.m21, 0.14 * body, 0.04], [MEMBRANE.m02, 0.1 * body, 0.035]], 1, 0.08, 0.02);
    const wires = gain(h, 0.45 + 0.5 * tone, 0.19 * dec);
    const hp = filt(h, "highpass", 1700 * tune, 0.7, wires);
    noise(h, filt(h, "peaking", 5200, 0.8, hp));
    noise(h, filt(h, "highpass", 4500, 0.7, gain(h, 0.3, 0.006)), 0.02);
  } else if (v === "clap") {
    // BRUSH: wire brush swept on the snare. TONE = brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    const att = 0.012 + (1 - h.vel) * 0.04;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.75, t + att);
    g.gain.setTargetAtTime(0.0001, t + att, Math.max(0.01, (0.32 * dec) / 4));
    const bp = filt(h, "bandpass", (1800 + 4200 * tone) * tune, 0.55, g);
    noise(h, filt(h, "lowpass", 9000, 0.5, bp));
  } else if (v === "ch") {
    // HAT: closed hi-hat, a tight "chick". TONE = brightness.
    const g = gain(h, 1.2, 0.045 * dec);
    const bp = filt(h, "bandpass", 9500 * tune, 1, g);
    noise(h, filt(h, "highpass", 6000 + 2000 * tone, 0.7, bp));
    const m = h.ctx.createGain();
    m.gain.value = 0.08;
    m.connect(bp);
    [342, 513, 707, 911].forEach((fr) => osc(h, "square", fr * 2.3 * tune, m));
  } else if (v === "oh") {
    // RIDE: ride cymbal, bell ping over a long wash. TONE = bell vs wash.
    osc(h, "sine", 612 * tune, gain(h, 0.18 + 0.4 * tone, 0.5 * dec));
    osc(h, "sine", 1650 * tune, gain(h, 0.1 + 0.25 * tone, 0.4 * dec));
    const wash = gain(h, 0.7, 1.7 * dec, 0.002);
    const hp = filt(h, "highpass", 4200, 0.6, wash);
    const sum = h.ctx.createGain();
    sum.gain.value = 0.16;
    sum.connect(hp);
    [331, 467, 619, 803, 1011, 1259].forEach((fr) => osc(h, "square", fr * tune, sum));
    noise(h, filt(h, "highpass", 8000, 0.6, gain(h, 0.15, 0.5 * dec)));
  } else if (v === "tom") {
    // TOM: rack tom. TONE = stick attack.
    const f = 112 * tune;
    const g = gain(h, 0.95, 0.42 * dec);
    drop(osc(h, "sine", f, g), t, f, 1.35, 0.06);
    ring(h, f, [[MEMBRANE.m11, 0.22, 0.12], [MEMBRANE.m21, 0.12, 0.09], [MEMBRANE.m02, 0.09, 0.08], [MEMBRANE.m31, 0.05, 0.06]], 1, 0.25, 0.05);
    noise(h, filt(h, "bandpass", 2500, 0.8, gain(h, 0.1 + 0.4 * tone, 0.01)), 0.03);
  } else if (v === "rim") {
    // X-STICK: cross-stick on the rim, woody click. TONE = wood vs metal.
    osc(h, "sine", 1180 * tune, gain(h, 0.6, 0.03 * dec));
    osc(h, "triangle", 2430 * tune, gain(h, 0.25 + 0.4 * tone, 0.018 * dec));
    noise(h, filt(h, "bandpass", 3200, 1.4, gain(h, 0.35, 0.01)), 0.03);
  } else if (v === "bell") {
    // SHAKER: grains in a tube. TONE = brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.1, t + 0.014);
    g.gain.setTargetAtTime(0.0001, t + 0.016, Math.max(0.005, (0.08 * dec) / 4));
    noise(h, filt(h, "bandpass", (5000 + 4000 * tone) * tune, 1.1, g));
  }
}

// --------------------------------------------- MINIMAL & PERCUSSION (Hormoz) ----
/** 808 hi-hat oscillator frequencies (Hz), from the original circuit. */
export const HAT808 = [205.3, 304.4, 369.6, 522.7, 540, 800];

export function minimalHit(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  strike = h.strike ?? 1;
  if (v === "kick") {
    // KICK: deep, round minimal kick: a sine with a short pitch dive, gently rounded by
    // saturation, and a soft beater click. TONE = click (0 pure sub, 1 clicky).
    const f = 50 * tune;
    const g = gain(h, 0.95, 0.55 * dec, 0.0015);
    drop(osc(h, "sine", f, shaper(h, driveCurve(0.25), g)), t, f, 2.4, 0.045);
    contact(h, "bandpass", 2600, 0.8, 0.05 + 0.4 * tone, 0.006);
  } else if (v === "snare") {
    // SNAP: finger snap: a bright skin-on-skin burst over a short, papery body. TONE = brightness.
    contact(h, "bandpass", (2100 + 1200 * tone) * tune, 2.2, 2.6, 0.06 * dec);
    contact(h, "bandpass", 1150 * tune, 1.5, 0.8, 0.025 * dec);
  } else if (v === "clap") {
    // CLAP: soft clap in a room: four hands slightly apart, then a diffuse tail. TONE = brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    const jt = () => Math.random() * 0.002;
    taps(g, t, [0, 0.009 + jt(), 0.018 + jt(), 0.029 + jt()], 1.4, 0.32 * dec);
    noise(h, filt(h, "bandpass", 1200 * tune * (0.75 + 0.6 * tone), 1.1, g));
    contact(h, "lowpass", 3500, 0.7, 0.15, 0.5 * dec, 0.01); // room
  } else if (v === "ch") {
    // SHAKER: seeds in a gourd: a cluster of tiny grain impacts on a soft swell. TONE = brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    const times = [0];
    for (let i = 1; i < 6; i++) times.push(0.004 + Math.random() * 0.026);
    times.sort((a, b) => a - b);
    taps(g, t, times, 0.8, 0.06 * dec);
    noise(h, filt(h, "bandpass", (5500 + 3500 * tone) * tune, 1.4, filt(h, "highpass", 4000, 0.7, g)));
  } else if (v === "oh") {
    // HAT: soft open hat: the 808's six metallic oscillators, low in the mix, over airy noise. TONE = brightness.
    const g = gain(h, 0.25, 0.35 * dec, 0.002);
    const hp = filt(h, "highpass", 6500 + 3000 * tone, 0.7, g);
    const m = h.ctx.createGain();
    m.gain.value = 0.06;
    m.connect(filt(h, "bandpass", 9000, 0.9, hp));
    HAT808.forEach((fr) => osc(h, "square", fr * tune, m));
    noise(h, filt(h, "highpass", 7000, 0.7, hp));
  } else if (v === "tom") {
    // CONGA: tuned hand drum. Open tone rings on the membrane modes; a slap (TONE up)
    // mutes the ring and adds a sharp crack.
    const f = 220 * tune;
    const open = 1 - 0.6 * tone;
    ring(h, f, [[MEMBRANE.m01, open, 0.3], [MEMBRANE.m11, 0.3 * open, 0.12], [MEMBRANE.m21, 0.18 * open, 0.09], [MEMBRANE.m02, 0.12, 0.07]], 1, 0.06, 0.03);
    contact(h, "bandpass", 2400 * tune, 1.2, 0.15 + 0.6 * tone, 0.012 + 0.02 * tone);
  } else if (v === "rim") {
    // CLAVE: hardwood bar. A free bar rings at 1 : 2.756 : 5.404. TONE morphs from a
    // hollow woodblock (low) to a bright clave (high).
    const f = (900 + 1700 * tone) * tune;
    ring(h, f, [[1, 1, 0.07], [2.756, 0.25, 0.025], [5.404, 0.08, 0.012]], 0.9);
    contact(h, "highpass", 3000, 0.7, 0.25, 0.004);
  } else if (v === "bell") {
    // KALIMBA: plucked steel tine (C5 at TUNE 0; tune it for melodies). The tine's first
    // overtone sits near 5.9x the note; TONE brings it up.
    const f = 523.25 * tune;
    ring(h, f, [[1, 0.8, 1.1], [5.9, 0.05 + 0.25 * tone, 0.12], [2, 0.06, 0.4]], 1);
    contact(h, "bandpass", 3200 * tune, 1, 0.12, 0.004);
  }
}

// ------------------------------------------- CLASSIC MACHINES (Kerman kits) ----
/**
 * The rhythm machines that defined electronic music, each rebuilt from how its
 * circuit (or sample chip) makes sound. The 808 itself lives in drums.ts.
 *
 *   tr909  analog kick / snare / toms, 6-bit sampled hats and ride: punchy, house & techno
 *   tr707  8-bit PCM samples: tight, clean, a little crunchy (cowbell, tambourine)
 *   tr606  small analog box: thin boomy kick, crisp noise snare, bright tiny hats
 *   cr78   1978 preset box: soft "pup" kick, guiro, bongo, clave, cowbell, warm and round
 *   lm80   80s sample machine: tight kick, huge gated snare and toms, cabasa
 */
export type ClassicModel = "tr909" | "tr707" | "tr606" | "cr78" | "lm80";

/** A hit whose voice is built into a shared colour stage (sample chip, vintage filter). */
function stage(h: HitCtx, crush: number, lowpass: number): HitCtx {
  let dest: AudioNode = h.out;
  if (lowpass < 19000) dest = filt(h, "lowpass", lowpass, 0.6, dest);
  if (crush > 0) dest = shaper(h, crushCurve(crush), dest);
  const input = h.ctx.createGain();
  input.connect(dest);
  return { ...h, out: input };
}

/** Metallic cluster of square oscillators (hats, cymbals, cowbells). */
function metal(h: HitCtx, freqs: number[], level: number, dest: AudioNode): void {
  const sum = h.ctx.createGain();
  sum.gain.value = level;
  sum.connect(dest);
  freqs.forEach((fr) => osc(h, "square", fr * h.tune, sum));
}

/** A gated burst: rises fast, holds flat for `hold` seconds, then is cut short (80s gated reverb). */
function gated(h: HitCtx, peak: number, hold: number, dest: AudioNode = h.out): GainNode {
  const g = h.ctx.createGain();
  const t = h.t;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(peak * 0.55, t + 0.004, 0.03);
  g.gain.setTargetAtTime(0.0001, t + 0.004 + hold, 0.012);
  g.connect(dest);
  return g;
}

export function classicHit(model: ClassicModel, v: Slot, h0: HitCtx): void {
  strike = h0.strike ?? 1;
  if (model === "tr909") return tr909(v, h0);
  if (model === "tr707") return tr707(v, stage(h0, 110, 11000));
  if (model === "tr606") return tr606(v, h0);
  if (model === "cr78") return cr78(v, stage(h0, 0, 8500));
  return lm80(v, stage(h0, 180, 15000));
}

function tr909(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // The 909 kick: a sine through a soft clipper (rounded triangle-ish wave) with a fast
    // two-stage pitch sweep, plus the noise/pulse "attack" click. TONE = attack.
    const f = 50 * tune;
    const g = gain(h, 1.0, 0.36 * dec, 0.0008);
    const o = osc(h, "sine", f, shaper(h, driveCurve(0.6), g));
    const s = strike;
    o.frequency.setValueAtTime(f * (1 + 4.5 * s), t);
    o.frequency.exponentialRampToValueAtTime(f * (1 + 0.5 * s), t + 0.012);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09 * Math.sqrt(dec));
    contact(h, "lowpass", 5500, 0.7, 0.15 + 0.6 * tone, 0.004);
    osc(h, "square", 1100, gain(h, 0.08 + 0.25 * tone, 0.0025), 0.01);
  } else if (v === "snare") {
    // Two detuned tone oscillators + noise through the "snappy" filters. TONE = snappy.
    const body = gain(h, 0.55 * (1 - 0.35 * tone), 0.1 * dec);
    drop(osc(h, "triangle", 180 * tune, body), t, 180 * tune, 1.4, 0.015);
    drop(osc(h, "triangle", 330 * tune, gain(h, 0.3 * (1 - 0.35 * tone), 0.07 * dec)), t, 330 * tune, 1.3, 0.015);
    const sn = gain(h, 0.45 + 0.55 * tone, 0.2 * dec);
    noise(h, filt(h, "lowpass", 7000 + 5000 * tone, 0.7, filt(h, "highpass", 600, 0.7, sn)));
  } else if (v === "clap") {
    // 909 clap: four close bursts, then a longer diffuse tail. TONE = brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    taps(g, t, [0, 0.008, 0.016, 0.025], 1.1, 0.36 * dec);
    noise(h, filt(h, "bandpass", 1150 * tune * (0.75 + 0.6 * tone), 1.3, g));
  } else if (v === "ch" || v === "oh") {
    // 909 hats were 6-bit samples of real cymbals: metallic, gritty. TONE = brightness.
    const open = v === "oh";
    const g = gain(h, (open ? 0.85 : 1.1) * 0.22, (open ? 0.4 : 0.05) * dec, 0.0008);
    const cr = shaper(h, crushCurve(24), filt(h, "highpass", 7000 + 2500 * tone, 0.7, g));
    metal(h, [263, 400, 421, 474, 587, 845].map((x) => x * 1.9), 0.13, cr);
    noise(h, filt(h, "highpass", 8000, 0.7, cr));
  } else if (v === "tom") {
    // 909 tom: a pitch-swept sine with a breath of noise on the skin. TONE = noise.
    const f = 105 * tune;
    drop(osc(h, "sine", f, gain(h, 0.95, 0.34 * dec)), t, f, 1.55, 0.09);
    noise(h, filt(h, "bandpass", 900 * tune, 1, gain(h, 0.08 + 0.3 * tone, 0.06 * dec)), 0.15);
  } else if (v === "rim") {
    // 909 rimshot: three tight resonances, very short. TONE = click.
    osc(h, "sine", 220 * tune, gain(h, 0.4, 0.015 * dec));
    osc(h, "triangle", 500 * tune, gain(h, 0.55, 0.02 * dec));
    osc(h, "square", 1720 * tune, filt(h, "bandpass", 1900 * tune, 3, gain(h, 0.45 + 0.3 * tone, 0.012 * dec)));
  } else if (v === "bell") {
    // RIDE: 6-bit sampled ride: shimmering metal with a long wash. TONE = brightness.
    const g = gain(h, 0.5, 1.3 * dec, 0.002);
    const cr = shaper(h, crushCurve(24), filt(h, "highpass", 4500 + 2500 * tone, 0.6, g));
    metal(h, [331, 467, 619, 803, 1011, 1259].map((x) => x * 2.4), 0.12, cr);
    osc(h, "sine", 3150 * tune, gain(h, 0.06 + 0.1 * tone, 0.6 * dec));
  }
}

function tr707(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // Short, punchy sampled kick. TONE = beater.
    const f = 58 * tune;
    drop(osc(h, "sine", f, gain(h, 1.15, 0.22 * dec)), t, f, 2.6, 0.022);
    contact(h, "bandpass", 2300, 1, 0.12 + 0.45 * tone, 0.006);
  } else if (v === "snare") {
    // Bright, tight snare sample. TONE = wires.
    drop(osc(h, "triangle", 205 * tune, gain(h, 0.5 * (1 - 0.3 * tone), 0.08 * dec)), t, 205 * tune, 1.3, 0.012);
    noise(h, filt(h, "bandpass", 4200, 0.5, gain(h, 0.55 + 0.45 * tone, 0.15 * dec)));
  } else if (v === "clap") {
    const g = h.ctx.createGain();
    g.connect(h.out);
    taps(g, t, [0, 0.01, 0.021], 1.15, 0.2 * dec);
    noise(h, filt(h, "bandpass", 1500 * tune * (0.75 + 0.6 * tone), 2, g));
  } else if (v === "ch" || v === "oh") {
    const open = v === "oh";
    const g = gain(h, (open ? 0.8 : 1) * 0.28, (open ? 0.32 : 0.04) * dec, 0.0008);
    noise(h, filt(h, "highpass", 7500 + 2500 * tone, 0.7, filt(h, "peaking", 10000, 1, g)));
    metal(h, HAT808.map((x) => x * 1.6), 0.05, filt(h, "highpass", 7000, 0.7, g));
  } else if (v === "tom") {
    const f = 120 * tune;
    drop(osc(h, "sine", f, gain(h, 0.95, 0.28 * dec)), t, f, 1.3, 0.05);
    noise(h, filt(h, "bandpass", 1800, 0.8, gain(h, 0.06 + 0.3 * tone, 0.01)), 0.03);
  } else if (v === "rim") {
    osc(h, "triangle", 1100 * tune, gain(h, 0.65, 0.022 * dec));
    osc(h, "triangle", 1880 * tune, gain(h, 0.3 + 0.3 * tone, 0.014 * dec));
  } else if (v === "bell") {
    // TAMB: the 707's tambourine: jingles shaken around one hit. TONE = jingle brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    taps(g, t, [0, 0.012, 0.022, 0.036, 0.05], 0.6, 0.16 * dec);
    const bp = filt(h, "bandpass", 7500, 0.8, g);
    metal(h, [2700, 3900, 5100, 6300].map((x) => x * (0.85 + 0.3 * tone)), 0.12, bp);
    noise(h, filt(h, "highpass", 7000, 0.7, g));
  }
}

function tr606(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // Small, boomy and thin: a short sine with almost no click. TONE = punch.
    const f = 64 * tune;
    drop(osc(h, "sine", f, shaper(h, driveCurve(0.2), gain(h, 1, 0.2 * dec))), t, f, 1.6 + 1.2 * tone, 0.018);
  } else if (v === "snare") {
    // Noise-heavy, crisp. TONE = snap.
    osc(h, "triangle", 240 * tune, gain(h, 0.3, 0.05 * dec));
    osc(h, "triangle", 410 * tune, gain(h, 0.15, 0.04 * dec));
    noise(h, filt(h, "highpass", 1800 + 1500 * tone, 0.7, gain(h, 0.85, 0.13 * dec)));
  } else if (v === "clap") {
    const g = h.ctx.createGain();
    g.connect(h.out);
    taps(g, t, [0, 0.009, 0.019], 1, 0.16 * dec);
    noise(h, filt(h, "bandpass", 1800 * tune * (0.8 + 0.5 * tone), 1.4, g));
  } else if (v === "ch" || v === "oh") {
    // The 606's tiny, bright, sizzling hats. TONE = brightness.
    const open = v === "oh";
    const g = gain(h, open ? 0.85 : 1.1, (open ? 0.26 : 0.032) * dec, 0.0006);
    const bp = filt(h, "bandpass", 11000, 0.9, filt(h, "highpass", 8000 + 2500 * tone, 0.7, g));
    metal(h, HAT808.map((x) => x * 1.28), 0.17, bp);
  } else if (v === "tom") {
    const f = 140 * tune;
    drop(osc(h, "sine", f, gain(h, 0.9, 0.2 * dec)), t, f, 1.3 + 0.3 * tone, 0.07);
  } else if (v === "rim") {
    // TICK: a short metallic click. TONE = pitch.
    const g = gain(h, 0.9, 0.018 * dec);
    metal(h, [800, 1170, 1600].map((x) => x * (1 + tone)), 0.3, filt(h, "bandpass", 3200 * (1 + 0.5 * tone), 2, g));
  } else if (v === "bell") {
    // CYMBAL: wide metal wash. TONE = brightness.
    const g = gain(h, 0.55, 1 * dec, 0.002);
    metal(h, HAT808.map((x) => x * 0.95), 0.13, filt(h, "highpass", 3800 + 2500 * tone, 0.6, g));
    noise(h, filt(h, "highpass", 6000, 0.7, gain(h, 0.12, 0.5 * dec)));
  }
}

function cr78(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // A bridged-T resonator "pup": a damped low sine, no pitch sweep. TONE = body.
    const f = 68 * tune;
    osc(h, "sine", f, gain(h, 1.15, 0.14 * dec));
    osc(h, "sine", f * 2, gain(h, 0.08 + 0.2 * tone, 0.05 * dec));
  } else if (v === "snare") {
    // Small, soft vintage snare. TONE = noise.
    osc(h, "sine", 250 * tune, gain(h, 0.45, 0.05 * dec));
    noise(h, filt(h, "bandpass", 3000 * tune, 0.8, gain(h, 0.55 + 0.4 * tone, 0.09 * dec)));
  } else if (v === "clap") {
    // GUIRO: a stick scraped along a ridged gourd: a fast run of ticks. TONE = speed.
    const g = h.ctx.createGain();
    g.connect(h.out);
    const n = 8 + Math.round(tone * 6);
    const span = 0.11 * Math.sqrt(dec);
    const times: number[] = [];
    for (let i = 0; i < n; i++) times.push((i / n) * span);
    taps(g, t, times, 0.9, 0.03);
    noise(h, filt(h, "bandpass", 2600 * tune, 3, g));
  } else if (v === "ch") {
    noise(h, filt(h, "bandpass", 8500, 1.2, filt(h, "highpass", 6500 + 2000 * tone, 0.7, gain(h, 0.3, 0.035 * dec))));
  } else if (v === "oh") {
    // CYMBAL: soft vintage cymbal. TONE = brightness.
    const g = gain(h, 0.2, 0.55 * dec, 0.002);
    noise(h, filt(h, "highpass", 5500 + 2500 * tone, 0.7, g));
    metal(h, HAT808, 0.05, filt(h, "highpass", 5000, 0.7, g));
  } else if (v === "tom") {
    // BONGO: a small tuned skin. TONE = slap.
    const f = 330 * tune;
    drop(osc(h, "sine", f, gain(h, 0.9 * (1 - 0.3 * tone), 0.08 * dec)), t, f, 1.12, 0.02);
    contact(h, "bandpass", 1900 * tune, 1.2, 0.1 + 0.45 * tone, 0.008);
  } else if (v === "rim") {
    // CLAVE: resonant wood click. TONE = pitch.
    const f = (2000 + 900 * tone) * tune;
    ring(h, f, [[1, 1, 0.035], [2.756, 0.12, 0.012]], 0.85);
  } else if (v === "bell") {
    // COWBELL: two square waves through a band-pass. TONE = brightness.
    const g = gain(h, 0.9, 0.17 * dec, 0.001);
    metal(h, [587, 845], 0.5, filt(h, "bandpass", 1500 + 1500 * tone, 1.8, g));
  }
}

function lm80(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // Tight, punchy sampled kick. TONE = beater.
    const f = 60 * tune;
    drop(osc(h, "sine", f, gain(h, 1.2, 0.2 * dec)), t, f, 2.3, 0.02);
    contact(h, "bandpass", 3000, 0.9, 0.1 + 0.45 * tone, 0.007);
    noise(h, filt(h, "lowpass", 180, 0.7, gain(h, 0.35, 0.05 * dec)), 0.15);
  } else if (v === "snare") {
    // The 80s snare: shell + wires, then a big gated room cut off short. TONE = room vs body.
    drop(osc(h, "triangle", 190 * tune, gain(h, 0.55, 0.09 * dec)), t, 190 * tune, 1.3, 0.015);
    noise(h, filt(h, "highpass", 1500, 0.7, gain(h, 0.5, 0.12 * dec)));
    const room = gated(h, 0.3 + 0.35 * tone, 0.2 * dec);
    noise(h, filt(h, "lowpass", 6500, 0.6, filt(h, "bandpass", 2200, 0.5, room)));
  } else if (v === "clap") {
    const g = h.ctx.createGain();
    g.connect(h.out);
    taps(g, t, [0, 0.01, 0.019, 0.03], 1.1, 0.14 * dec);
    noise(h, filt(h, "bandpass", 1300 * tune * (0.75 + 0.6 * tone), 1.2, g));
    noise(h, filt(h, "bandpass", 1600, 0.6, gated(h, 0.18, 0.13 * dec)));
  } else if (v === "ch" || v === "oh") {
    const open = v === "oh";
    const g = gain(h, (open ? 0.75 : 1.05) * 0.24, (open ? 0.36 : 0.045) * dec, 0.0008);
    noise(h, filt(h, "bandpass", 9500, 0.9, filt(h, "highpass", 6500 + 2500 * tone, 0.7, g)));
    metal(h, [342, 513, 707, 911].map((x) => x * 2.3), 0.07, filt(h, "highpass", 6000, 0.7, g));
  } else if (v === "tom") {
    // Big 80s tom: a deep pitch fall into a gated room. TONE = room.
    const f = 96 * tune;
    drop(osc(h, "sine", f, gain(h, 0.95, 0.45 * dec)), t, f, 1.7, 0.16);
    noise(h, filt(h, "lowpass", 2500, 0.6, gated(h, 0.08 + 0.2 * tone, 0.24 * dec)));
  } else if (v === "rim") {
    // SIDESTICK. TONE = wood vs metal.
    osc(h, "sine", 1180 * tune, gain(h, 0.6, 0.03 * dec));
    osc(h, "triangle", 2430 * tune, gain(h, 0.25 + 0.4 * tone, 0.018 * dec));
    noise(h, filt(h, "bandpass", 3200, 1.4, gain(h, 0.35, 0.01)), 0.03);
  } else if (v === "bell") {
    // CABASA: steel beads rolled on a gourd. TONE = brightness.
    const g = h.ctx.createGain();
    g.connect(h.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.57, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + 0.01, Math.max(0.005, (0.07 * dec) / 4));
    noise(h, filt(h, "highpass", (6000 + 3000 * tone) * tune, 0.9, g));
  }
}
