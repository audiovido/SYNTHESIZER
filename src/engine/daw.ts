/**
 * SY-1 Engine — working with a DAW (Ableton Live, Logic Pro, any host).
 *
 * - MIDI out: every note the app plays (keys, MIDI in, arpeggiator, drum
 *   sequencer, pads) goes to a MIDI output port, so a DAW track can record it.
 *   Mac: IAC Driver bus. Windows: loopMIDI.
 * - Follow DAW clock: MIDI clock Start / Stop / tempo from the DAW drives the
 *   drum sequencer and the global tempo.
 * - Take recorder: records the app's output (24-bit WAV, before the master
 *   volume, so the take is always full level) and, in the same take, a MIDI
 *   file of every note, aligned to the audio's first sample.
 *
 * Nothing here touches the sound: the recorder only listens to the output.
 */

import { DRUM_NOTES, DRUM_VOICES, DrumPattern, DrumVoice, stepFlam, stepProb, stepRoll } from "./drums";
import { getTempo, onTempoChange, setTempo } from "./tempo";
import { mirrorCall } from "./mirror";

const PLUGIN_MIDI_KEY = "sy1.pluginMidiOut";
let pluginMidiOut = true;
try { pluginMidiOut = localStorage.getItem(PLUGIN_MIDI_KEY) !== "off"; } catch (e) {}
export function getPluginMidiOut(): boolean { return pluginMidiOut; }
function setPluginMidiOut__impl(on: boolean): void {
  pluginMidiOut = !!on;
  const host = (globalThis as any).__wa;
  if (!pluginMidiOut && typeof host?.midiOut === "function") host.midiOut(0xb9, 123, 0, audioNow());
  try { localStorage.setItem(PLUGIN_MIDI_KEY, pluginMidiOut ? "on" : "off"); } catch (e) {}
  notify();
}
export function setPluginMidiOut(...a: Parameters<typeof setPluginMidiOut__impl>): void {
  mirrorCall("setPluginMidiOut", setPluginMidiOut__impl, a);
}

// ---------------------------------------------------------------- hooks ----
interface DawHooks {
  isDrums: () => boolean;
  /** Final output (unity, after the soft clipper) and its context, or null before audio starts. */
  getTap: () => { ctx: AudioContext; tap: AudioNode } | null;
  startDrums: (at?: number) => void;
  stopDrums: () => void;
  isDrumPlaying: () => boolean;
  takeName: () => string;
}
let hooks: DawHooks | null = null;
export function configureDaw(h: DawHooks): void {
  hooks = h;
}

// --------------------------------------------------------------- storage ----
const OUT_KEY = "sy1.midiOut";
const OUT_CH_KEY = "sy1.midiOutCh";
const CLOCK_KEY = "sy1.followClock";
let outId = "";     // "" = off
let outCh = 1;      // 1..16
let followClock = false;
try {
  outId = localStorage.getItem(OUT_KEY) || "";
  const ch = Number(localStorage.getItem(OUT_CH_KEY));
  if (ch >= 1 && ch <= 16) outCh = ch;
  followClock = localStorage.getItem(CLOCK_KEY) === "1";
} catch (e) {}

const listeners = new Set<() => void>();
export function onDawChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify(): void {
  listeners.forEach((cb) => cb());
}

// ------------------------------------------------------------- MIDI out ----
let access: any = null;
let accessError = "";

export function isMidiOutSupported(): boolean {
  return typeof navigator !== "undefined" && typeof (navigator as any).requestMIDIAccess === "function";
}
export function getMidiOutError(): string {
  return accessError;
}
export function hasMidiOutAccess(): boolean {
  return !!access;
}

/** Ask the browser for MIDI (needs a user gesture the first time). */
export async function enableMidiOut(): Promise<boolean> {
  if (access) return true;
  if (!isMidiOutSupported()) {
    accessError = "MIDI needs Chrome or Edge";
    notify();
    return false;
  }
  try {
    access = await (navigator as any).requestMIDIAccess({ sysex: false });
    accessError = "";
    access.onstatechange = () => notify();
    notify();
    return true;
  } catch (e) {
    accessError = "MIDI was blocked: allow it in the browser's site settings";
    notify();
    return false;
  }
}

// a port chosen in an earlier visit opens again by itself (when the browser already allowed MIDI)
if (outId && isMidiOutSupported()) {
  try {
    const perm = (navigator as any).permissions?.query?.({ name: "midi" });
    if (perm) perm.then((st: any) => { if (st.state === "granted") enableMidiOut(); }).catch(() => {});
  } catch (e) {}
}

export function getMidiOutputs(): { id: string; name: string }[] {
  if (!access) return [];
  const list: { id: string; name: string }[] = [];
  access.outputs.forEach((o: any) => list.push({ id: o.id, name: o.name || `MIDI Output ${list.length + 1}` }));
  return list;
}
export function getMidiOut(): string {
  return outId;
}
/** Name of the chosen output port: notes arriving on an input of the same name are our own echo. */
export function getMidiOutName(): string {
  const o = port();
  return o ? String(o.name || "") : "";
}
export function getMidiOutChannel(): number {
  return outCh;
}
function port(): any {
  if (!outId || !access) return null;
  return access.outputs.get(outId) || null;
}
export function setMidiOut(id: string): void {
  allOff();
  outId = id;
  try { localStorage.setItem(OUT_KEY, id); } catch (e) {}
  notify();
}
export function setMidiOutChannel(ch: number): void {
  allOff();
  outCh = Math.max(1, Math.min(16, Math.round(ch)));
  try { localStorage.setItem(OUT_CH_KEY, String(outCh)); } catch (e) {}
  notify();
}

/** Audio time -> performance.now() time (when that audio is heard), for timestamped MIDI. */
function perfTimeOf(at: number): number {
  const now = performance.now();
  const ctx = hooks?.getTap()?.ctx;
  if (!ctx) return now;
  let ms = now + (at - ctx.currentTime) * 1000;
  try {
    const ts = ctx.getOutputTimestamp();
    if (ts && ts.performanceTime && ts.contextTime !== undefined) ms = ts.performanceTime + (at - ts.contextTime) * 1000;
  } catch (e) {}
  return Math.max(now, ms);
}
function audioNow(): number {
  return hooks?.getTap()?.ctx.currentTime ?? 0;
}

// Notes that arrived from MIDI input are not sent back out (the DAW already has them,
// and echoing them into the same port would loop). They still go into a recorded take.
let fromIn = 0;
export function beginMidiIn(): void { fromIn++; }
export function endMidiIn(): void { fromIn = Math.max(0, fromIn - 1); }

function emit(bytes: number[], at: number | undefined, toPort: boolean): void {
  if (toPort) {
    const o = port();
    if (o) {
      try {
        if (at === undefined) o.send(bytes);
        else o.send(bytes, perfTimeOf(at));
      } catch (e) {}
    }
  }
  if (take) take.events.push({ at: at ?? audioNow(), bytes });
}

const vel7 = (v: number) => Math.max(1, Math.min(127, Math.round(v * 127)));

/** Held synth notes as they sound now: midi -> sent to the port. */
const held = new Map<number, boolean>();

/**
 * Bring MIDI out in line with the notes the synth is holding (keys, HOLD, sustain
 * pedal, mono and legato are all handled by asking the synth what sounds).
 */
export function syncHeldNotes(candidates: Iterable<number>, isOn: (m: number) => boolean, velOf: (m: number) => number): void {
  const all = new Set<number>(held.keys());
  for (const m of candidates) all.add(m);
  all.forEach((m) => {
    const on = isOn(m);
    if (on && !held.has(m)) {
      const toPort = fromIn === 0;
      held.set(m, toPort);
      emit([0x90 | (outCh - 1), m & 0x7f, vel7(velOf(m))], undefined, toPort);
    } else if (!on && held.has(m)) {
      const toPort = held.get(m)!;
      held.delete(m);
      emit([0x80 | (outCh - 1), m & 0x7f, 0], undefined, toPort);
    }
  });
}

/** A note with a known length scheduled in audio time (arpeggiator steps). */
export function scheduledNote(m: number, vel: number, at: number, off: number): void {
  if (!port() && !take) return;
  emit([0x90 | (outCh - 1), m & 0x7f, vel7(vel)], at, true);
  emit([0x80 | (outCh - 1), m & 0x7f, 0], Math.max(at + 0.005, off), true);
}

/** One drum hit (pads, MIDI in, sequencer) as its General MIDI drum note. */
export function drumHit(v: DrumVoice, vel: number, at: number): void {
  const note = DRUM_NOTES[v];
  if (note === undefined) return;
  // the plugin: every hit the drum machine makes itself (pattern, pads, keys) goes to the DAW as MIDI
  // (channel 10, General MIDI drums); hits played by the DAW's own MIDI are not sent back
  const host = (globalThis as any).__wa;
  if (pluginMidiOut && host && typeof host.midiOut === "function" && fromIn === 0) {
    const v7 = vel7(vel);
    host.midiOut(0x99, note, v7, at);
    host.midiOut(0x89, note, 0, at + 0.06);
  }
  if (!port() && !take) return;
  const toPort = fromIn === 0;
  emit([0x90 | (outCh - 1), note, vel7(vel)], at, toPort);
  emit([0x80 | (outCh - 1), note, 0], at + 0.06, toPort);
}

export function pitchBendOut(norm: number): void {
  if (!port() && !take) return;
  const v = Math.max(0, Math.min(16383, Math.round((norm + 1) * 8192)));
  emit([0xe0 | (outCh - 1), v & 0x7f, (v >> 7) & 0x7f], undefined, fromIn === 0);
}
export function modWheelOut(norm: number): void {
  if (!port() && !take) return;
  emit([0xb0 | (outCh - 1), 1, Math.max(0, Math.min(127, Math.round(norm * 127)))], undefined, fromIn === 0);
}

/** Release every note on the port (panic, machine change, port change). */
export function allOff(): void {
  held.forEach((toPort, m) => emit([0x80 | (outCh - 1), m, 0], undefined, toPort));
  held.clear();
  const o = port();
  if (o) {
    try {
      o.send([0xb0 | (outCh - 1), 123, 0]);
      o.send([0xb0 | (outCh - 1), 64, 0]);
    } catch (e) {}
  }
}

// ------------------------------------------------------ follow DAW clock ----
let clockTicks: number[] = [];
let tickCount = 0;
let clockRunning = false;
let lastTickAt = 0;

export function getFollowClock(): boolean {
  return followClock;
}
export function setFollowClock(on: boolean): void {
  followClock = on;
  try { localStorage.setItem(CLOCK_KEY, on ? "1" : "0"); } catch (e) {}
  clockTicks = [];
  notify();
}
/** True while clock ticks are arriving (in the last second). */
export function isClockActive(): boolean {
  return followClock && performance.now() - lastTickAt < 1000;
}
export function isClockRunning(): boolean {
  return followClock && clockRunning;
}

/** MIDI system real-time messages (clock 0xF8, start 0xFA, continue 0xFB, stop 0xFC). */
export function handleRealtime(status: number, timeStamp: number): void {
  if (!followClock || !hooks) return;
  if (status === 0xf8) {
    const wasActive = performance.now() - lastTickAt < 1000;
    lastTickAt = performance.now();
    if (!wasActive) notify();
    if (clockTicks.length && timeStamp - clockTicks[clockTicks.length - 1] > 250) clockTicks = [];
    clockTicks.push(timeStamp);
    if (clockTicks.length > 97) clockTicks.shift();
    tickCount++;
    // tempo: least-squares slope over up to the last four beats (MIDI arrival jitters by a few ms),
    // checked every sixteenth; changes under 0.7 BPM are jitter, not a tempo change
    const n = clockTicks.length;
    if (n >= 13 && tickCount % 6 === 0) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      const y0 = clockTicks[0];
      for (let i = 0; i < n; i++) {
        const y = clockTicks[i] - y0;
        sx += i; sy += y; sxx += i * i; sxy += i * y;
      }
      const perTick = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      if (perTick > 0) {
        const bpm = 60000 / (perTick * 24);
        if (bpm >= 40 && bpm <= 240 && Math.abs(bpm - getTempo()) > 0.7) setTempo(bpm);
      }
    }
    return;
  }
  if (status === 0xfa || status === 0xfb) {
    clockRunning = true;
    tickCount = 0;
    if (hooks.isDrums()) {
      if (hooks.isDrumPlaying()) hooks.stopDrums();
      const ctx = hooks.getTap()?.ctx;
      const at = ctx ? ctx.currentTime + Math.max(0, (timeStamp - performance.now()) / 1000) : undefined;
      hooks.startDrums(at);
    }
    notify();
    return;
  }
  if (status === 0xfc) {
    clockRunning = false;
    if (hooks.isDrumPlaying()) hooks.stopDrums();
    notify();
  }
}

// --------------------------------------------------------- take recorder ----
onTempoChange((b) => {
  if (take) take.tempos.push({ at: audioNow(), bpm: b });
});
interface Take {
  ctx: AudioContext;
  node: AudioWorkletNode;
  sink: GainNode;
  chunks: Float32Array[][];
  frames: number;
  startAt: number;     // audio time of the first recorded sample (-1 until known)
  bpm: number;
  /** Tempo changes during the take (audio time), so the MIDI file stays on the DAW's grid. */
  tempos: { at: number; bpm: number }[];
  name: string;
  events: { at: number; bytes: number[] }[];
}
let take: Take | null = null;
let lastTake: { wav: Blob; mid: Blob | null; name: string; seconds: number; notes: number; bpm: number } | null = null;
const MAX_SECONDS = 30 * 60;
let workletReady: WeakSet<AudioContext> = new WeakSet();

const RECORDER_SRC = `
class SY1Recorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = true; this.n = 0; this.first = true;
    this.l = new Float32Array(8192); this.r = new Float32Array(8192);
    this.port.onmessage = (e) => { if (e.data === "stop") { this.flush(); this.on = false; this.port.postMessage({ done: true }); } };
  }
  flush() {
    if (!this.n) return;
    const l = this.l.slice(0, this.n), r = this.r.slice(0, this.n);
    this.port.postMessage({ l, r }, [l.buffer, r.buffer]);
    this.n = 0;
  }
  process(inputs) {
    if (!this.on) return false;
    const inp = inputs[0];
    const L = inp && inp[0], R = inp && (inp[1] || inp[0]);
    const len = L ? L.length : 128;
    if (this.first) { this.first = false; this.port.postMessage({ start: currentTime }); }
    for (let i = 0; i < len; i++) { this.l[this.n] = L ? L[i] : 0; this.r[this.n] = R ? R[i] : 0; this.n++; }
    if (this.n >= 8064) this.flush();
    return true;
  }
}
registerProcessor("sy1-recorder", SY1Recorder);
`;

export function isRecording(): boolean {
  return !!take;
}
export function getTakeSeconds(): number {
  if (!take) return 0;
  return take.frames / take.ctx.sampleRate;
}
export function getLastTake(): typeof lastTake {
  return lastTake;
}
export function canRecord(): boolean {
  return typeof AudioWorkletNode !== "undefined";
}

export async function startTake(): Promise<boolean> {
  if (take || !hooks) return false;
  const t = hooks.getTap();
  if (!t) return false;
  const { ctx, tap } = t;
  try {
    if (!workletReady.has(ctx)) {
      const url = URL.createObjectURL(new Blob([RECORDER_SRC], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletReady.add(ctx);
    }
  } catch (e) {
    return false;
  }
  const node = new AudioWorkletNode(ctx, "sy1-recorder", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers"
  });
  // keeps the recorder running; it only ever adds silence to the output
  const sink = ctx.createGain();
  sink.gain.value = 0;
  const rec: Take = { ctx, node, sink, chunks: [[], []], frames: 0, startAt: ctx.currentTime, bpm: getTempo(), tempos: [], name: hooks.takeName(), events: [] };
  node.port.onmessage = (e) => {
    const d = e.data;
    if (d.start !== undefined) rec.startAt = d.start;
    if (d.l) {
      rec.chunks[0].push(d.l);
      rec.chunks[1].push(d.r);
      rec.frames += d.l.length;
      if (take === rec && rec.frames / ctx.sampleRate >= MAX_SECONDS) stopTake();
    }
  };
  tap.connect(node);
  node.connect(sink);
  sink.connect(ctx.destination);
  take = rec;
  // notes already held when recording starts are written at the take's first sample
  held.forEach((_, m) => rec.events.push({ at: -1, bytes: [0x90 | (outCh - 1), m, 100] }));
  notify();
  return true;
}

export function stopTake(): Promise<void> {
  const rec = take;
  if (!rec) return Promise.resolve();
  take = null;
  return new Promise((resolve) => {
    const finish = () => {
      try {
        hooks?.getTap()?.tap.disconnect(rec.node);
      } catch (e) {}
      try { rec.node.disconnect(); rec.sink.disconnect(); } catch (e) {}
      const endAt = rec.startAt + rec.frames / rec.ctx.sampleRate;
      // notes still held at the end are closed on the last sample
      held.forEach((_, m) => rec.events.push({ at: endAt, bytes: [0x80 | (outCh - 1), m, 0] }));
      const wav = encodeWav(rec.chunks, rec.frames, rec.ctx.sampleRate);
      const mid = encodeMidi(rec.events, rec.startAt, endAt, rec.bpm, rec.name, rec.tempos);
      const lastBpm = rec.tempos.length ? rec.tempos[rec.tempos.length - 1].bpm : rec.bpm;
      lastTake = { wav, mid: mid.notes ? mid.blob : null, name: rec.name, seconds: rec.frames / rec.ctx.sampleRate, notes: mid.notes, bpm: lastBpm };
      notify();
      resolve();
    };
    const prev = rec.node.port.onmessage;
    const timer = setTimeout(finish, 400);
    rec.node.port.onmessage = (e) => {
      if (prev) (prev as any).call(rec.node.port, e);
      if (e.data && e.data.done) {
        clearTimeout(timer);
        finish();
      }
    };
    rec.node.port.postMessage("stop");
  });
}

/** 24-bit stereo PCM WAV. */
export function encodeWav(chunks: Float32Array[][], frames: number, rate: number): Blob {
  const bytesPer = 3;
  const dataLen = frames * 2 * bytesPer;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);           // PCM
  dv.setUint16(22, 2, true);           // stereo
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2 * bytesPer, true);
  dv.setUint16(32, 2 * bytesPer, true);
  dv.setUint16(34, 24, true);
  str(36, "data");
  dv.setUint32(40, dataLen, true);
  const out = new Uint8Array(buf);
  let o = 44;
  const [L, R] = chunks;
  for (let c = 0; c < L.length; c++) {
    const l = L[c], r = R[c];
    for (let i = 0; i < l.length; i++) {
      for (const x of [l[i], r[i]]) {
        const v = Math.max(-1, Math.min(1, x));
        let s = Math.round(v < 0 ? v * 8388608 : v * 8388607);
        if (s < 0) s += 16777216;
        out[o++] = s & 0xff;
        out[o++] = (s >> 8) & 0xff;
        out[o++] = (s >> 16) & 0xff;
      }
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Standard MIDI file (format 0, 480 ticks per quarter) at the tempo the take started with. */
export function encodeMidi(
  events: { at: number; bytes: number[] }[],
  startAt: number,
  endAt: number,
  bpm: number,
  name: string,
  tempos: { at: number; bpm: number }[] = []
): { blob: Blob; notes: number } {
  const PPQ = 480;
  // tempo map: piecewise, so seconds -> ticks follows every tempo change
  const map = [{ at: startAt, bpm, tick: 0 }];
  for (const t of tempos) {
    if (t.at <= startAt) { map[0].bpm = t.bpm; continue; }
    const last = map[map.length - 1];
    map.push({ at: t.at, bpm: t.bpm, tick: last.tick + (t.at - last.at) * (last.bpm / 60) * PPQ });
  }
  const tickOf = (at: number) => {
    const a = Math.max(at, startAt);
    let seg = map[0];
    for (const m of map) if (m.at <= a) seg = m;
    return Math.max(0, Math.round(seg.tick + (a - seg.at) * (seg.bpm / 60) * PPQ));
  };
  const evs = events
    .map((e, i) => ({ tick: e.at < 0 ? 0 : tickOf(e.at), bytes: e.bytes, i, end: e.at > endAt }))
    .filter((e) => !e.end || (e.bytes[0] & 0xf0) === 0x80)
    .map((e) => (e.end ? { ...e, tick: tickOf(endAt) } : e))
    .sort((a, b) => a.tick - b.tick || ((a.bytes[0] & 0xf0) === 0x80 ? -1 : 0) - ((b.bytes[0] & 0xf0) === 0x80 ? -1 : 0) || a.i - b.i);
  const notes = evs.filter((e) => (e.bytes[0] & 0xf0) === 0x90).length;
  const trk: number[] = [];
  const vlq = (n: number) => {
    const st = [n & 0x7f];
    while ((n >>= 7)) st.unshift((n & 0x7f) | 0x80);
    trk.push(...st);
  };
  const nameBytes = Array.from(new TextEncoder().encode(name.slice(0, 120)));
  vlq(0); trk.push(0xff, 0x03); vlq(nameBytes.length); trk.push(...nameBytes);
  const tempoEv = (b: number) => {
    const us = Math.round(60000000 / b);
    return [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
  };
  vlq(0); trk.push(...tempoEv(map[0].bpm));
  vlq(0); trk.push(0xff, 0x58, 0x04, 4, 2, 24, 8);
  const all = [...map.slice(1).map((m, i) => ({ tick: Math.round(m.tick), bytes: tempoEv(m.bpm), i: -1 - i })), ...evs]
    .sort((a, b) => a.tick - b.tick || (a.i < 0 ? -1 : 0) - (b.i < 0 ? -1 : 0));
  let last = 0;
  for (const e of all) {
    vlq(e.tick - last);
    last = e.tick;
    trk.push(...e.bytes);
  }
  vlq(Math.max(0, tickOf(endAt) - last));
  trk.push(0xff, 0x2f, 0x00);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const len = trk.length;
  const file = new Uint8Array([...head, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...trk]);
  return { blob: new Blob([file], { type: "audio/midi" }), notes };
}


/** Drum patterns as a MIDI file (GM drums on channel 10), one after the other, at `bpm`, with the
 *  machine's swing and accent; flams and rolls as played. Steps with a chance below 100% are kept
 *  (their velocity a little lower), so the file is the same every time. */
export function drumPatternsMidi(pats: DrumPattern[], bpm: number, swing: number, accentAmt: number, name: string): { blob: Blob; notes: number } {
  const stepDur = 60 / bpm / 4;
  const ev: { at: number; bytes: number[] }[] = [];
  let t0 = 0;
  for (const pat of pats) {
    const len = pat.len || 16;
    for (let step = 0; step < len; step++) {
      const at = t0 + step * stepDur + (step % 2 === 1 ? swing * stepDur : 0);
      for (const v of DRUM_VOICES) {
        const s = pat.steps[v][step];
        if (!s) continue;
        const note = DRUM_NOTES[v as DrumVoice];
        let vel = s === 2 ? 1 : s === 3 ? 0.3 : 1 - 0.5 * accentAmt;
        if (stepProb(pat, v, step) < 100) vel *= 0.85;
        const hit = (a: number, vv: number, dur: number) => {
          ev.push({ at: Math.max(0, a), bytes: [0x99, note, vel7(vv)] });
          ev.push({ at: Math.max(0, a) + dur, bytes: [0x89, note, 0] });
        };
        if (stepFlam(pat, v, step)) hit(at - 0.022, vel * 0.45, 0.015);
        const n = Math.max(1, Math.min(4, stepRoll(pat, v, step)));
        for (let k = 0; k < n; k++) hit(at + (k * stepDur) / n, k === 0 ? vel : vel * 0.82, Math.min(0.06, (stepDur / n) * 0.9));
      }
    }
    t0 += len * stepDur;
  }
  return encodeMidi(ev, 0, t0, bpm, name);
}
