/**
 * SY-1 Engine — Drum sound models for the drum machines
 *
 * The sequencer, patterns and 8 slots are shared (see drums.ts). Each drum
 * machine picks a model that decides how the 8 slots sound:
 *
 *   persian  (Bushehr) DOHOL, TAK, DAF, ZANG, DAYEREH, DOM, PELANG, SENJ
 *   acoustic (Rasht)   KICK, SNARE, BRUSH, HAT, RIDE, TOM, X-STICK, SHAKER
 *   digital  (Hormoz)  BOOM, SNAP, ZAP, TICK, METAL, FM TOM, GLITCH, BLIP
 *
 * Every hit is built from Web Audio nodes (no samples). Per slot the TUNE,
 * DECAY, TONE and LEVEL knobs work the same way on every model: TUNE
 * transposes, DECAY scales the tail, TONE moves the brightness or the
 * character described next to each voice.
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
}

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

/** Pitch drop: from f*from to f over `time` seconds. */
function drop(o: OscillatorNode, t: number, f: number, from: number, time: number): void {
  o.frequency.setValueAtTime(Math.max(10, f * from), t);
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
function driveCurve(k: number): Float32Array {
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

function shaper(h: HitCtx, curve: Float32Array, dest: AudioNode): WaveShaperNode {
  const w = h.ctx.createWaveShaper();
  w.curve = curve as any;
  w.connect(dest);
  return w;
}

// --------------------------------------------------- PERSIAN (Bushehr) ----
export function persianHit(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // DOHOL: big double-headed drum. TONE = beater brightness.
    const f = 62 * tune;
    const g = gain(h, 1, 0.75 * dec);
    drop(osc(h, "sine", f, g), t, f, 1.7, 0.05);
    const g2 = gain(h, 0.35, 0.18 * dec);
    drop(osc(h, "triangle", f * 1.52, g2), t, f * 1.52, 1.3, 0.04);
    const gb = gain(h, 0.55, 0.05 * dec);
    noise(h, filt(h, "lowpass", 500 + 2200 * tone, 0.9, gb), 0.12);
  } else if (v === "tom") {
    // DOM: tombak bass stroke in the middle of the skin. TONE = ring of the goblet.
    const f = 98 * tune;
    const g = gain(h, 1, 0.5 * dec);
    drop(osc(h, "sine", f, g), t, f, 1.18, 0.09);
    const g2 = gain(h, 0.18 + 0.35 * tone, 0.16 * dec);
    drop(osc(h, "sine", f * 2.25, g2), t, f * 2.25, 1.1, 0.06);
    const gs = gain(h, 0.25, 0.03);
    noise(h, filt(h, "bandpass", 420 * tune, 1.2, gs), 0.08);
  } else if (v === "snare") {
    // TAK: tombak edge stroke, bright and ringing. TONE = brightness.
    const parts: [number, number, number][] = [[710, 0.75, 0.1], [1185, 0.55, 0.07], [1660, 0.35 + 0.4 * tone, 0.05], [2410, 0.15 + 0.35 * tone, 0.035]];
    parts.forEach(([fr, a, d]) => osc(h, "sine", fr * tune, gain(h, a, d * dec)));
    const gc = gain(h, 0.4, 0.008);
    noise(h, filt(h, "highpass", 3000, 0.7, gc), 0.03);
  } else if (v === "rim") {
    // PELANG: finger snap / slap. TONE = snap brightness.
    const gn = gain(h, 1, 0.035 * dec);
    noise(h, filt(h, "bandpass", (1600 + 2600 * tone) * tune, 1.6, gn), 0.12);
    osc(h, "sine", 1050 * tune, gain(h, 0.35, 0.02 * dec));
  } else if (v === "clap") {
    // DAF: frame drum stroke with ring jingles. TONE = jingles vs skin.
    const f = 78 * tune;
    const g = gain(h, 0.85 * (1 - 0.4 * tone), 0.2 * dec);
    drop(osc(h, "sine", f, g), t, f, 1.5, 0.03);
    const gj = h.ctx.createGain();
    gj.connect(h.out);
    taps(gj, t, [0, 0.007, 0.016, 0.027], 0.35 + 0.55 * tone, 0.28 * dec);
    const bp = filt(h, "bandpass", 5200 * Math.sqrt(tune), 0.9, gj);
    [3120, 4380, 5910, 7340].forEach((fr) => osc(h, "square", fr * tune, bp));
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
  if (v === "kick") {
    // KICK: felt beater on a ported bass drum. TONE = beater click.
    const f = 56 * tune;
    const g = gain(h, 1.25, 0.32 * dec);
    drop(osc(h, "sine", f, g), t, f, 2.1, 0.028);
    osc(h, "sine", f * 1.6, gain(h, 0.2, 0.06 * dec));
    noise(h, filt(h, "bandpass", 3200, 0.9, gain(h, 0.12 + 0.5 * tone, 0.007)), 0.03);
    noise(h, filt(h, "lowpass", 160, 0.7, gain(h, 0.45, 0.06 * dec)), 0.2);
  } else if (v === "snare") {
    // SNARE: wood shell + snare wires. TONE = wires (snappy) vs shell.
    const g = gain(h, 0.55 * (1 - 0.45 * tone), 0.09 * dec);
    drop(osc(h, "triangle", 188 * tune, g), t, 188 * tune, 1.25, 0.02);
    osc(h, "sine", 332 * tune, gain(h, 0.25, 0.05 * dec));
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
    osc(h, "sine", f * 1.593, gain(h, 0.22, 0.12 * dec));
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

// ---------------------------------------------------- DIGITAL (Hormoz) ----
export function digitalHit(v: Slot, h: HitCtx): void {
  const { t, tune, dec, tone } = h;
  if (v === "kick") {
    // BOOM: long 808-style sub with a pitch dive. TONE = saturation.
    const f = 44 * tune;
    const g = gain(h, 0.75, 1.1 * dec, 0.002);
    const sh = shaper(h, driveCurve(tone), g);
    drop(osc(h, "sine", f, sh), t, f, 3.2, 0.035);
  } else if (v === "snare") {
    // SNAP: FM snare. TONE = noise vs FM body.
    const f = 232 * tune;
    const car = h.ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = f;
    const mod = h.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 3.7;
    const idx = h.ctx.createGain();
    idx.gain.setValueAtTime(f * 6, t);
    idx.gain.exponentialRampToValueAtTime(1, t + 0.04);
    mod.connect(idx);
    idx.connect(car.frequency);
    car.connect(gain(h, 0.6 * (1 - 0.5 * tone), 0.1 * dec));
    car.start(t); mod.start(t); car.stop(t + h.life); mod.stop(t + h.life);
    noise(h, filt(h, "highpass", 2500, 0.7, gain(h, 0.35 + 0.5 * tone, 0.13 * dec)));
  } else if (v === "clap") {
    // ZAP: laser sweep. TONE = sine to square.
    const o1 = osc(h, "sine", 3600 * tune, gain(h, 0.6 * (1 - tone), 0.12 * dec));
    const o2 = osc(h, "square", 3600 * tune, gain(h, 0.3 * tone, 0.12 * dec));
    [o1, o2].forEach((o) => {
      o.frequency.setValueAtTime(3600 * tune, t);
      o.frequency.exponentialRampToValueAtTime(70 * tune, t + 0.06 + 0.08 * dec);
    });
  } else if (v === "ch") {
    // TICK: short crushed digital hat. TONE = bit crush.
    const g = gain(h, 0.8, 0.025 * dec);
    const hp = filt(h, "highpass", 7500, 0.7, g);
    const cr = shaper(h, crushCurve(Math.round(2 + (1 - tone) * 14)), hp);
    noise(h, cr, 0.15);
  } else if (v === "oh") {
    // METAL: FM metallic open hat. TONE = brightness.
    const f = 420 * tune;
    const car = h.ctx.createOscillator();
    car.type = "square";
    car.frequency.value = f;
    const mod = h.ctx.createOscillator();
    mod.type = "square";
    mod.frequency.value = f * 1.41;
    const idx = h.ctx.createGain();
    idx.gain.value = f * 2.2;
    mod.connect(idx);
    idx.connect(car.frequency);
    const g = gain(h, 0.45, 0.38 * dec, 0.002);
    car.connect(filt(h, "highpass", 2200 + 4000 * tone, 0.7, g));
    car.start(t); mod.start(t); car.stop(t + h.life); mod.stop(t + h.life);
  } else if (v === "tom") {
    // FM TOM: pitched FM tom (long DECAY = log drum). TONE = FM amount.
    const f = 138 * tune;
    const car = h.ctx.createOscillator();
    car.type = "sine";
    drop(car, t, f, 1.5, 0.05);
    const mod = h.ctx.createOscillator();
    mod.type = "sine";
    drop(mod, t, f * 1.5, 1.5, 0.05);
    const idx = h.ctx.createGain();
    idx.gain.setValueAtTime(f * (0.4 + 3 * tone), t);
    idx.gain.setTargetAtTime(0.01, t, 0.05 * dec);
    mod.connect(idx);
    idx.connect(car.frequency);
    car.connect(gain(h, 0.85, 0.32 * dec));
    car.start(t); mod.start(t); car.stop(t + h.life); mod.stop(t + h.life);
  } else if (v === "rim") {
    // GLITCH: random pitched bursts that stutter. TONE = number of repeats.
    const g = h.ctx.createGain();
    g.connect(h.out);
    const n = 1 + Math.round(tone * 4);
    const gap = 0.006 + 0.008 * dec;
    const times: number[] = [];
    for (let i = 0; i < n; i++) times.push(i * gap);
    taps(g, t, times, 0.8, 0.015 * dec);
    const o = osc(h, "square", (300 + Math.random() * 3200) * tune, filt(h, "bandpass", 2400, 0.8, g), 0.25);
    for (let i = 1; i < n; i++) o.frequency.setValueAtTime((300 + Math.random() * 3200) * tune, t + i * gap);
  } else if (v === "bell") {
    // BLIP: a clean sine ping. TONE = octave.
    const f = 440 * Math.pow(2, Math.round(tone * 3)) * tune;
    osc(h, "sine", f, gain(h, 0.8, 0.07 * dec));
    osc(h, "sine", f * 2, gain(h, 0.12, 0.03 * dec));
  }
}
