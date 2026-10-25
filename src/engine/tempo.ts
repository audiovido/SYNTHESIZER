/**
 * SY-1 Engine — global tempo (shared by the arpeggiator, synced LFOs and the
 * drum sequencer), with tap tempo.
 */

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

export function setTempo(v: number): void {
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
