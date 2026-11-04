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

/** Tempo for display: whole numbers as they are, a DAW's fractional tempo with up to 2 decimals. */
export function fmtBpm(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export function getTempo(): number {
  return bpm;
}

export function onTempoChange(cb: (bpm: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- SYNC with the DAW (plugin only) ----
// SYNC on (default) and the DAW reports a tempo: the tempo is the DAW's (exact, not rounded) and the
// app's own tempo controls do nothing. SYNC off: the app keeps its own tempo (−/+/TAP, style tempo)
// and the drums run on their own clock even while the DAW plays. The web app never gets a DAW
// tempo, so nothing here changes it.
const SYNC_KEY = "sy1_sync";
let ownBpm = bpm;          // the app's own tempo (saved)
let hostBpm = 0;           // the DAW's last tempo (0 = no DAW)
let syncOn = true;
try { if (localStorage.getItem(SYNC_KEY) === "off") syncOn = false; } catch (e) {}
const syncListeners = new Set<() => void>();

/** true while the tempo comes from the DAW (plugin, SYNC on, DAW tempo known). */
export function isHostSynced(): boolean {
  return syncOn && hostBpm > 0;
}
/** The SYNC switch (plugin). */
export function getSync(): boolean {
  return syncOn;
}
/** A DAW is reporting a tempo (plugin). */
export function hasHostTempo(): boolean {
  return hostBpm > 0;
}
export function onSyncChange(cb: () => void): () => void {
  syncListeners.add(cb);
  return () => syncListeners.delete(cb);
}

function applyBpm(next: number): void {
  if (next === bpm) return;
  bpm = next;
  listeners.forEach((cb) => cb(bpm));
}

/** The app's own tempo. While the DAW sets the tempo (SYNC) it is only remembered (a style's tempo,
 *  say) and used when SYNC goes off. */
function setTempo__impl(v: number): void {
  const next = Math.max(40, Math.min(240, Math.round(v)));
  if (!(next >= 40)) return;
  ownBpm = next;
  try { localStorage.setItem(KEY, String(ownBpm)); } catch (e) {}
  if (!isHostSynced()) applyBpm(ownBpm);
}

/** Tap tempo: average of the last taps within 2 seconds of each other. */
export function tapTempo(): void {
  if (isHostSynced()) return;
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
  const first = hostBpm <= 0;
  hostBpm = Math.max(20, Math.min(999, Number(v)));
  if (syncOn) applyBpm(hostBpm);
  if (first) syncListeners.forEach((cb) => cb());
}

/** The DAW's tempo (plugin): exact. Used while SYNC is on. */
export function setHostTempo(...args: Parameters<typeof setHostTempo__impl>): ReturnType<typeof setHostTempo__impl> {
  return mirrorCall("setHostTempo", setHostTempo__impl, args);
}

function setSync__impl(on: boolean): void {
  const next = !!on;
  if (next === syncOn) return;
  syncOn = next;
  try { localStorage.setItem(SYNC_KEY, syncOn ? "on" : "off"); } catch (e) {}
  applyBpm(isHostSynced() ? hostBpm : ownBpm);
  syncListeners.forEach((cb) => cb());
}

/** SYNC on/off (plugin): follow the DAW's tempo and transport, or run free. mirrored. */
export function setSync(...args: Parameters<typeof setSync__impl>): ReturnType<typeof setSync__impl> {
  return mirrorCall("setSync", setSync__impl, args);
}
