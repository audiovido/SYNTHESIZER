/**
 * SY-1 Engine — Arpeggiator
 *
 * Collects the held notes and plays them one at a time on the global tempo,
 * scheduled ahead on the audio clock (25 ms loop, 120 ms lookahead).
 * Modes: up, down, up/down, random, as played. Octave range, gate, swing.
 * LATCH (the "hold" param) keeps the chord running after the keys are released;
 * a new chord replaces it.
 */

import { getAudioCtxIfAny } from "./bus";
import { SYNC_DIVS } from "./params";
import { getTempo } from "./tempo";

type Patch = Record<string, any>;
export interface ArpHooks {
  getPatch: () => Patch;
  /** Start a note at audio time `at`, release it at `off`. */
  play: (midi: number, vel: number, at: number, off: number) => void;
}

let hooks: ArpHooks | null = null;
const held: { midi: number; vel: number }[] = [];  // in played order
const physicalSet = new Set<number>();
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let stepIndex = 0;
let dir = 1;
let pos = -1;

export function configureArp(h: ArpHooks): void {
  hooks = h;
}

function sequence(): number[] {
  const p = hooks!.getPatch();
  const octs = Math.max(1, Math.min(4, Math.round(p.arpOct || 1)));
  const mode = p.arpMode || "up";
  const base = mode === "played" ? held.map((n) => n.midi) : held.map((n) => n.midi).sort((a, b) => a - b);
  const seq: number[] = [];
  for (let o = 0; o < octs; o++) base.forEach((m) => seq.push(m + 12 * o));
  return seq;
}

function nextNote(): number | null {
  const seq = sequence();
  if (!seq.length) return null;
  const mode = hooks!.getPatch().arpMode || "up";
  if (mode === "random") return seq[Math.floor(Math.random() * seq.length)];
  if (mode === "down") {
    pos = pos <= 0 || pos > seq.length - 1 ? seq.length - 1 : pos - 1;
    return seq[pos];
  }
  if (mode === "updown") {
    if (seq.length === 1) return seq[0];
    pos += dir;
    if (pos >= seq.length) { dir = -1; pos = seq.length - 2; }
    if (pos < 0) { dir = 1; pos = 1; }
    return seq[pos];
  }
  pos = (pos + 1) % seq.length;
  return seq[pos];
}

function velFor(midi: number): number {
  const base = ((midi % 12) + 12) % 12;
  const n = held.find((h) => h.midi % 12 === base);
  return n ? n.vel : 0.8;
}

function tick(): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx || !hooks) return;
  const p = hooks.getPatch();
  if (!held.length) return;
  while (nextTime < ctx.currentTime + 0.12) {
    const div = SYNC_DIVS[Math.max(0, Math.min(SYNC_DIVS.length - 1, Math.round(p.arpRate || 6) - 1))];
    const stepDur = (60 / getTempo()) * div.beats;
    const swing = (p.arpSwing || 0) * stepDur;
    const at = nextTime + (stepIndex % 2 === 1 ? swing : 0);
    const m = nextNote();
    if (m !== null) {
      const gate = Math.max(0.05, Math.min(1, p.arpGate ?? 0.6));
      hooks.play(m, velFor(m), at, at + stepDur * gate * 0.98);
    }
    stepIndex++;
    nextTime += stepDur;
  }
}

function ensureRunning(): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx || timer) return;
  nextTime = ctx.currentTime + 0.02;
  stepIndex = 0;
  pos = -1;
  dir = 1;
  tick();
  timer = setInterval(tick, 25);
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function arpNoteOn(midi: number, vel: number): void {
  const latch = hooks?.getPatch().hold === "on";
  if (latch && !physicalSet.has(midi)) {
    const idx = held.findIndex((n) => n.midi === midi);
    if (idx >= 0) {
      held.splice(idx, 1);
      if (!held.length) stop();
      return;
    }
  }
  physicalSet.add(midi);
  if (!held.some((n) => n.midi === midi)) held.push({ midi, vel });
  ensureRunning();
}

export function arpNoteOff(midi: number): void {
  if (!physicalSet.has(midi)) return;
  physicalSet.delete(midi);
  const latch = hooks?.getPatch().hold === "on";
  if (!latch) {
    const i = held.findIndex((n) => n.midi === midi);
    if (i >= 0) held.splice(i, 1);
  }
  if (!held.length) stop();
}

/** Latch turned off: drop notes that are no longer physically held. */
export function arpReleaseLatched(): number[] {
  const dropped: number[] = [];
  for (let i = held.length - 1; i >= 0; i--) {
    if (!physicalSet.has(held[i].midi)) {
      dropped.push(held[i].midi);
      held.splice(i, 1);
    }
  }
  if (!held.length) stop();
  return dropped;
}

/** Window blur / tab hidden: release physically held notes while preserving latched notes if hold is on. */
export function arpReleasePhysical(keepLatched: boolean): number[] {
  physicalSet.clear();
  if (keepLatched) return [];
  const dropped = held.map((n) => n.midi);
  held.length = 0;
  stop();
  return dropped;
}

export function arpAllOff(): void {
  held.length = 0;
  physicalSet.clear();
  stop();
}

export function arpHeldNotes(): number[] {
  return held.map((n) => n.midi);
}
