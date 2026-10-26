/**
 * SY-1 Engine — Drum machine (Kerman)
 *
 * Eight synthesized drum voices built from Web Audio nodes per hit (no
 * samples), a 16-step sequencer (12 steps for 6/8 grooves) with accents and
 * swing, and 8 pattern slots. Hits are scheduled ahead on the audio clock, so
 * timing stays tight even when the page is busy.
 */

import { getAudioCtxIfAny, getSharedNoiseBuffer } from "./bus";
import { acousticHit, digitalHit, HitCtx, persianHit } from "./drum-models";

export const DRUM_VOICES = ["kick", "snare", "clap", "ch", "oh", "tom", "rim", "bell"] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const DRUM_LABELS: Record<DrumVoice, string> = {
  kick: "KICK", snare: "SNARE", clap: "CLAP", ch: "HAT", oh: "OPEN", tom: "TOM", rim: "RIM", bell: "BELL"
};

export type DrumModel = "analog" | "persian" | "acoustic" | "digital";
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
  steps: Record<DrumVoice, number[]>; // 0 off, 1 on, 2 accent
}

export function emptyPattern(len = 16): DrumPattern {
  const steps = {} as Record<DrumVoice, number[]>;
  DRUM_VOICES.forEach((v) => (steps[v] = new Array(16).fill(0)));
  return { len, steps };
}

/** Pattern from compact strings: "X" accent, "x" hit, anything else off. */
export function patternFrom(len: number, rows: Partial<Record<DrumVoice, string>>): DrumPattern {
  const p = emptyPattern(len);
  (Object.keys(rows) as DrumVoice[]).forEach((v) => {
    const s = rows[v] || "";
    for (let i = 0; i < 16 && i < s.length; i++) p.steps[v][i] = s[i] === "X" ? 2 : s[i] === "x" ? 1 : 0;
  });
  return p;
}

// ---------------------------------------------------------------- sound ----
type Patch = Record<string, any>;
let getPatch: () => Patch = () => ({});
let getDest: () => AudioNode | null = () => null;
let openHatGain: GainNode | null = null;

export function configureDrums(patchGetter: () => Patch, destGetter: () => AudioNode | null): void {
  getPatch = patchGetter;
  getDest = destGetter;
}

function vp(v: DrumVoice, key: "Tune" | "Decay" | "Tone" | "Level", def: number): number {
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

/** Play one drum hit at audio time `at` with velocity 0..1. */
export function triggerDrum(v: DrumVoice, vel: number, at?: number): void {
  const ctx = getAudioCtxIfAny();
  const dest = getDest();
  if (!ctx || !dest) return;
  // While the audio device is still starting (first tap), the clock can jump ahead:
  // schedule a few ms later so the attack of the very first hit is not lost.
  const warmup = ctx.state !== "running" || ctx.currentTime < 0.3 ? 0.04 : 0;
  const t = Math.max(ctx.currentTime + warmup, at || 0);
  const tune = Math.pow(2, vp(v, "Tune", 0) / 12);
  const dec = vp(v, "Decay", 1);
  const tone = vp(v, "Tone", 0.5);
  const lvl = vp(v, "Level", 0.8) * (0.25 + 0.75 * vel);
  const out = ctx.createGain();
  out.gain.value = lvl;
  out.connect(dest);
  const life = 3 * dec + 0.2;
  setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (t - ctx.currentTime + life) * 1000 + 100);

  if (drumModel !== "analog") {
    const h: HitCtx = { ctx, out, t, tune, dec, tone, vel, life };
    if (drumModel === "persian") persianHit(v, h);
    else if (drumModel === "acoustic") acousticHit(v, h);
    else digitalHit(v, h);
    return;
  }

  if (v === "kick") {
    const o = ctx.createOscillator();
    o.type = "sine";
    const f1 = 52 * tune;
    o.frequency.setValueAtTime(f1 * (2.6 + tone * 2), t);
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
    o.frequency.setValueAtTime(220 * tune, t);
    o.frequency.exponentialRampToValueAtTime(170 * tune, t + 0.05);
    const g = ctx.createGain(); env(g, t, 0.7 * (1 - tone * 0.6), 0.12 * dec);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + life);
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
    // six detuned square oscillators at metallic ratios (classic 808-style hats)
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const sum = ctx.createGain(); sum.gain.value = 0.25;
    ratios.forEach((r) => {
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 40 * r * tune;
      o.connect(sum); o.start(t); o.stop(t + life);
    });
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000 + 3000 * tone;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 10000; bp.Q.value = 0.8;
    const g = ctx.createGain();
    if (v === "ch") {
      env(g, t, 1, 0.06 * dec);
      if (openHatGain) {
        // closed hat chokes a ringing open hat
        openHatGain.gain.cancelScheduledValues(t);
        openHatGain.gain.setTargetAtTime(0.0001, t, 0.004);
        openHatGain = null;
      }
    } else {
      env(g, t, 0.9, 0.42 * dec);
      openHatGain = g;
    }
    sum.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
  } else if (v === "tom") {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(150 * tune * (1.4 + tone * 0.4), t);
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

export function selectPattern(i: number): void {
  current = Math.max(0, Math.min(7, i));
  notify();
}

export function loadBank(patterns: DrumPattern[]): void {
  bank = Array.from({ length: 8 }, (_, i) => (patterns[i] ? JSON.parse(JSON.stringify(patterns[i])) : emptyPattern()));
  current = 0;
  saveBank();
  notify();
}

export function toggleStep(v: DrumVoice, i: number, accentMode: boolean): void {
  const s = bank[current].steps[v];
  if (accentMode) s[i] = s[i] === 2 ? 1 : s[i] === 1 ? 2 : 2;
  else s[i] = s[i] ? 0 : 1;
  saveBank();
  notify();
}

export function setPatternLength(len: number): void {
  bank[current].len = len === 12 ? 12 : 16;
  saveBank();
  notify();
}

export function clearPattern(): void {
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
      if (s) triggerDrum(v, s === 2 ? 1 : 1 - 0.5 * accentAmt, at);
    });
    const shown = step;
    setTimeout(() => stepListeners.forEach((cb) => cb(shown)), Math.max(0, (at - ctx.currentTime) * 1000));
    step = (step + 1) % len;
    nextTime += stepDur;
  }
}

export function startDrums(): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx || playing) return;
  playing = true;
  step = 0;
  nextTime = ctx.currentTime + 0.05;
  scheduler();
  timer = setInterval(scheduler, 25);
  notify();
}

export function stopDrums(): void {
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
  stepListeners.forEach((cb) => cb(-1));
  notify();
}
