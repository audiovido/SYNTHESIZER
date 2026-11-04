/**
 * SY-1 Engine — global tempo (shared by the arpeggiator, synced LFOs and the
 * drum sequencer), with tap tempo.
 */

import { mirrorCall } from "./mirror";

const KEY = "sy1_bpm";
let bpm = 110;
try {
  const v = Number(localStorage.getItem(KEY));
  if (v >= 40 && v <= 240) bpm = v;
} catch (e) {}

const listeners = new Set<(bpm: number) => void>();
let taps: number[] = [];

export function getTempo(): number {
  return bpm;
}

export function onTempoChange(cb: (bpm: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// In the plugin the DAW's tempo rules (exact, not rounded) and the app's own tempo controls are off.
let hostLocked = false;

function setTempo__impl(v: number): void {
  if (hostLocked) return;
  const next = Math.max(40, Math.min(240, Math.round(v)));
  if (next === bpm) return;
  bpm = next;
  try { localStorage.setItem(KEY, String(bpm)); } catch (e) {}
  listeners.forEach((cb) => cb(bpm));
}

/** Tap tempo: average of the last taps within 2 seconds of each other. */
export function tapTempo(): void {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2000);
  taps.push(now);
  if (taps.length >= 2) {
    const gaps = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    setTempo(60000 / avg);
  }
  if (taps.length > 6) taps.shift();
}

/** mirrored for the plugin (see mirror.ts) */
export function setTempo(...args: Parameters<typeof setTempo__impl>): ReturnType<typeof setTempo__impl> {
  return mirrorCall("setTempo", setTempo__impl, args);
}

function setHostTempo__impl(v: number): void {
  if (!(v > 0)) return;
  hostLocked = true;
  const next = Math.max(20, Math.min(999, Number(v)));
  if (next === bpm) return;
  bpm = next;
  listeners.forEach((cb) => cb(bpm));
}

/** The DAW's tempo (plugin): exact, and from then on the app's own tempo controls do nothing. */
export function setHostTempo(...args: Parameters<typeof setHostTempo__impl>): ReturnType<typeof setHostTempo__impl> {
  return mirrorCall("setHostTempo", setHostTempo__impl, args);
}
