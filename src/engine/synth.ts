/**
 * SY-1 Engine — Core controller: machines, patches, presets and notes.
 *
 * One patch object is shared by both engines (HQ and Classic) and the FX bus.
 * Each machine (see src/machines) keeps its own saved patch and preset.
 * Notes from the keyboard, pads and MIDI enter through noteOn/noteOff and are
 * routed to the drum machine, the arpeggiator, or straight to the voices
 * (with mono/legato, HOLD, sustain pedal and tuning applied).
 */

import { getAudioCtx, getAudioCtxIfAny, getSynthBus, makeDriveCurve, makeReverbImpulse, unlockAudio } from "./bus";
import { getCustomTuning, setCustomTuning, SYNC_DIVS, SYNTH_PARAMS, SynthPatch, synthDefaults, TUNINGS, tuningCents } from "./params";
import { createHQVoice, EngineId, hqPost, initHQ, setEngine, useHQ } from "./hq";
import { createStringsVoice, initStrings, stringsPost, useStrings } from "./strings";
import { createFmVoice, fmPost, initFm, useFm } from "./fm";
import {
  activeSynthVoices,
  createSynthVoice,
  getVoiceModWheel,
  getVoicePitchBend,
  setVoiceModWheel,
  setVoicePitchBend,
  SynthVoice
} from "./voice";
import { arpAllOff, arpHeldNotes, arpNoteOff, arpNoteOn, arpReleaseLatched, arpReleasePhysical, configureArp } from "./arp";
import { getTempo, onTempoChange, setTempo } from "./tempo";
import {
  configureDrums,
  drumVoiceForNote,
  loadBank,
  setDrumKit,
  setDrumTempoSource,
  useDrumBank,
  stopDrums,
  triggerDrum
} from "./drums";
import { getMachineDef, MACHINES } from "../machines";
import type { MachineDef, PresetDef } from "../machines/types";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function midiToName(m: number): string {
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

// ------------------------------------------------------------------ state ----
const MACHINE_KEY = "sy1_machine";
const patchKey = (id: string) => `sy1.m.${id}.patch`;
const presetKey = (id: string) => `sy1.m.${id}.preset`;

/** The one shared patch object (mutated in place so engines keep their reference). */
const synthPatch: SynthPatch = synthDefaults();
let machine: MachineDef = getMachineDef("sy1");
let synthPresetId = "init";

try {
  const saved = localStorage.getItem(MACHINE_KEY);
  if (saved) machine = getMachineDef(saved);
  // one-time migration of the patch saved before machines existed
  const legacy = localStorage.getItem("musicher_synth_patch");
  if (legacy && !localStorage.getItem(patchKey("sy1"))) {
    localStorage.setItem(patchKey("sy1"), legacy);
    localStorage.setItem(presetKey("sy1"), localStorage.getItem("musicher_synth_preset") || "custom");
  }
} catch (e) {}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function savePatchSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  const id = machine.id;
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(patchKey(id), JSON.stringify(synthPatch));
      localStorage.setItem(presetKey(id), synthPresetId);
    } catch (e) {}
  }, 300);
}

export function getSynthPatch(): SynthPatch {
  return synthPatch;
}
export function getSynthPresetId(): string {
  return synthPresetId;
}
export function getMachine(): MachineDef {
  return machine;
}
export function getMachines(): MachineDef[] {
  return MACHINES;
}

export type ParamChangeCallback = (key: string, value: any) => void;
export type PresetChangeCallback = (presetId: string) => void;
const paramChangeListeners = new Set<ParamChangeCallback>();
const presetChangeListeners = new Set<PresetChangeCallback>();
const machineListeners = new Set<(m: MachineDef) => void>();

export function onParamChange(cb: ParamChangeCallback): () => void {
  paramChangeListeners.add(cb);
  return () => paramChangeListeners.delete(cb);
}
export function onPresetChange(cb: PresetChangeCallback): () => void {
  presetChangeListeners.add(cb);
  return () => presetChangeListeners.delete(cb);
}
export function onMachineChange(cb: (m: MachineDef) => void): () => void {
  machineListeners.add(cb);
  return () => machineListeners.delete(cb);
}

// ----------------------------------------------------------- parameters ----
function syncedLfoRate(): number | null {
  const s = Math.round(synthPatch.lfoSync || 0);
  if (s <= 0) return null;
  const div = SYNC_DIVS[Math.min(SYNC_DIVS.length, s) - 1];
  return getTempo() / 60 / div.beats; // cycles per second
}

export function setSynthParam(
  key: string,
  value: any,
  { fromPreset = false, internal = false }: { fromPreset?: boolean; internal?: boolean } = {}
): void {
  const def = SYNTH_PARAMS[key];
  if (!def) return;
  const before = synthPatch[key];
  if (def.type) {
    synthPatch[key] = value;
  } else {
    let v = Math.max(def.min!, Math.min(def.max!, Number(value)));
    if (def.step) v = Math.round(v / def.step) * def.step;
    synthPatch[key] = v;
  }

  if (!fromPreset && !internal && key !== "hold" && key !== "oriental") {
    synthPresetId = "custom";
    presetChangeListeners.forEach((cb) => cb(synthPresetId));
  }

  // Side effects of performance params
  if (!internal) {
    if (key === "lfoRate" && !fromPreset && (synthPatch.lfoSync || 0) > 0) {
      // turning RATE by hand frees the LFO from the tempo
      synthPatch.lfoSync = 0;
      paramChangeListeners.forEach((cb) => cb("lfoSync", 0));
    }
    if (key === "lfoSync") {
      const r = syncedLfoRate();
      if (r !== null) setSynthParam("lfoRate", r, { internal: true });
    }
    if (key === "tuning" && !fromPreset && TUNINGS[value] && value !== "custom") {
      setSynthParam("tuneRoot", TUNINGS[value].tonic, { internal: true });
    }
    if (key === "hold" && value !== "on" && before === "on") {
      releaseHeldByHold();
      arpReleaseLatched().forEach((m) => markKey(m, false));
    }
    if (key === "arpOn" && value !== before) releaseEverything();
    if (key === "polyMode" && value !== before) releaseEverything();
  }

  // Shared FX bus
  const ctx = getAudioCtxIfAny();
  const bus = ctx ? getSynthBus(ctx, synthPatch) : null;
  if (bus && ctx) {
    const now = ctx.currentTime;
    const v = synthPatch[key];
    if (key === "drive") {
      bus.drive.curve = makeDriveCurve(v) as any;
      bus.driveComp.gain.setTargetAtTime(1 / (1 + v * 1.5), now, 0.02);
    } else if (key === "eqLow") bus.eqLow.gain.setTargetAtTime(v, now, 0.02);
    else if (key === "eqMid") bus.eqMid.gain.setTargetAtTime(v, now, 0.02);
    else if (key === "eqHigh") bus.eqHigh.gain.setTargetAtTime(v, now, 0.02);
    else if (key === "delayTime") bus.delay.delayTime.setTargetAtTime(v, now, 0.05);
    else if (key === "delayFb") bus.fb.gain.setTargetAtTime(v, now, 0.02);
    else if (key === "delayMix") bus.delayWet.gain.setTargetAtTime(v * 0.7, now, 0.02);
    else if (key === "revMix") bus.revWet.gain.setTargetAtTime(v * 0.9, now, 0.02);
    else if (key === "chorusMix") bus.chorusWet.gain.setTargetAtTime(v * 0.9, now, 0.03);
    else if (key === "chorusRate") bus.chorusLfo.frequency.setTargetAtTime(v, now, 0.05);
    else if (key === "chorusDepth") {
      bus.chorusDepthL.gain.setTargetAtTime(0.004 * v, now, 0.05);
      bus.chorusDepthR.gain.setTargetAtTime(-0.004 * v, now, 0.05);
    } else if (key === "volume") bus.master.gain.setTargetAtTime(v, now, 0.02);
    else if (key === "revSize") {
      if (bus.revTimer) clearTimeout(bus.revTimer);
      bus.revTimer = setTimeout(() => {
        if (Math.abs(bus.revSizeApplied - synthPatch.revSize) > 0.01) {
          bus.reverb.buffer = makeReverbImpulse(ctx, synthPatch.revSize);
          bus.revSizeApplied = synthPatch.revSize;
        }
      }, 180);
    }
  }

  activeSynthVoices.forEach((vc) => vc.update(key));
  hqPost({ t: "param", key, value: synthPatch[key] });
  stringsPost({ t: "param", key, value: synthPatch[key] });
  fmPost({ t: "param", key, value: synthPatch[key] });
  if (!fromPreset && (key === "oriental" || key === "tuning" || key === "tuneRoot")) {
    retuneActiveVoices();
  }
  paramChangeListeners.forEach((cb) => cb(key, synthPatch[key]));
  savePatchSoon();
}

export function updateCustomTuningOffsets(offsets?: number[]): number[] {
  const machineId = machine.id;
  const clean = offsets ? setCustomTuning(machineId, offsets) : getCustomTuning(machineId);
  retuneActiveVoices();
  paramChangeListeners.forEach((cb) => cb("tuning", synthPatch.tuning));
  return clean;
}

// tempo changes re-sync a synced LFO
onTempoChange(() => {
  const r = syncedLfoRate();
  if (r !== null) setSynthParam("lfoRate", r, { internal: true });
});

function applyPatchObject(next: Record<string, unknown>): void {
  Object.keys(next).forEach((k) => setSynthParam(k, next[k], { fromPreset: true }));
  const r = syncedLfoRate();
  if (r !== null) setSynthParam("lfoRate", r, { internal: true });
}

function findPreset(id: string): PresetDef | undefined {
  return machine.presets.find((p) => p.id === id);
}

export function applySynthPreset(id: string): void {
  const preset = findPreset(id);
  if (!preset) return;
  releaseEverything();
  const next = Object.assign(synthDefaults(), machine.base, preset.patch);
  if (machine.kind === "synth" && machine.base.arpOn === undefined && preset.patch.arpOn === undefined) {
    ["arpOn", "arpMode", "arpRate", "arpOct", "arpGate", "arpSwing"].forEach((k) => (next[k] = synthPatch[k]));
  }
  applyPatchObject(next);
  if (machine.kind === "drums" && preset.patterns) {
    loadBank(preset.patterns);
  }
  if (preset.bpm) setTempo(preset.bpm);
  synthPresetId = id;
  presetChangeListeners.forEach((cb) => cb(synthPresetId));
  savePatchSoon();
}

export function stepPreset(dir: number): void {
  const list = machine.presets;
  const i = list.findIndex((p) => p.id === synthPresetId);
  const next = list[(Math.max(0, i) + dir + list.length) % list.length];
  if (next) applySynthPreset(next.id);
}

/** Switch instrument: stop everything, load its saved patch (or first preset). */
export function setMachine(id: string): void {
  const next = getMachineDef(id);
  releaseEverything();
  stopDrums();
  machine = next;
  TUNINGS.custom.offsets = getCustomTuning(machine.id).slice();
  if (machine.kind === "drums") {
    setDrumKit(machine.drumModel, machine.drumLabels);
    useDrumBank(machine.id, machine.presets[0]?.patterns);
  }
  try { localStorage.setItem(MACHINE_KEY, machine.id); } catch (e) {}
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(patchKey(machine.id)) || "null");
    if (saved && typeof saved === "object") {
      const full = Object.assign(synthDefaults(), machine.base);
      Object.keys(SYNTH_PARAMS).forEach((k) => { if (k in saved) full[k] = saved[k]; });
      applyPatchObject(full);
      synthPresetId = localStorage.getItem(presetKey(machine.id)) || "custom";
      restored = true;
    }
  } catch (e) {}
  if (!restored) {
    synthPresetId = machine.presets[0]?.id || "custom";
    if (machine.presets[0]) applySynthPreset(machine.presets[0].id);
    // Every machine opens with oriental off by default
    setSynthParam("oriental", "off", { internal: true });
    if (machine.id === "isfahan" || machine.id === "shiraz") {
      setSynthParam("glide", 0, { internal: true });
      setSynthParam("scoop", 0, { internal: true });
      setSynthParam("tahrir", 0, { internal: true });
    }
  }
  // already playing: start loading this machine's engine now
  if (getAudioCtxIfAny()) prepareAudio();
  machineListeners.forEach((cb) => cb(machine));
  presetChangeListeners.forEach((cb) => cb(synthPresetId));
}

// ------------------------------------------------------- pitch bend etc. ----
export function setPitchBend(norm: number): void {
  setVoicePitchBend(norm);
  const v = getVoicePitchBend();
  hqPost({ t: "bend", v });
  stringsPost({ t: "bend", v });
  fmPost({ t: "bend", v });
}
export function getPitchBend(): number {
  return getVoicePitchBend();
}
export function setModWheel(norm: number): void {
  setVoiceModWheel(norm);
  const v = getVoiceModWheel();
  hqPost({ t: "mod", v });
  stringsPost({ t: "mod", v });
  fmPost({ t: "mod", v });
}
export function getModWheel(): number {
  return getVoiceModWheel();
}

/** Unlock audio and start loading the HQ and Strings engines. Call on any user gesture. */
export function prepareAudio(): void {
  unlockAudio();
  const ctx = getAudioCtx();
  if (ctx) {
    const input = getSynthBus(ctx, synthPatch).input;
    initHQ(ctx, input, () => synthPatch);
    // the special engines load only when their machine is used (less work on the first tap)
    if (machine.engine === "strings") initStrings(ctx, input, () => synthPatch);
    if (machine.engine === "fm") initFm(ctx, input, () => synthPatch);
  }
}

/** Switch engines (releases every note first so nothing hangs). */
export function switchEngine(id: EngineId): void {
  allNotesOff();
  setEngine(id);
}

// ------------------------------------------------------------------ notes ----
const heldVoices = new Map<number, SynthVoice>(); // midi -> voice
const physicallyHeld = new Set<number>();
const sustainedNotes = new Set<number>();
let sustainPedal = false;
// mono mode
const monoStack: number[] = [];
let monoVoice: SynthVoice | null = null;
let monoMidi = -1;
let lastMonoHz = 0;

export const downKeys = new Map<string, number>(); // computer key -> midi

export function centsFor(midi: number): number {
  if (synthPatch.oriental !== "on") return 0;
  return tuningCents(synthPatch.tuning || "12tet", midi, synthPatch.tuneRoot, machine.id);
}

export function freqFor(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12 + centsFor(midi) / 1200);
}

function retuneActiveVoices(): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx) return;
  const now = ctx.currentTime;
  heldVoices.forEach((v, m) => {
    if (!v.isReleased() && v.retune) v.retune(freqFor(m), 0.005, now);
  });
  if (monoVoice && !monoVoice.isReleased() && monoMidi >= 0 && monoVoice.retune) {
    const hz = freqFor(monoMidi);
    monoVoice.retune(hz, 0.005, now);
    lastMonoHz = hz;
  }
}

export function isNoteSounding(midi: number): boolean {
  if (synthPatch.arpOn === "on") return arpHeldNotes().includes(midi);
  if (synthPatch.polyMode === "mono") return monoVoice !== null && !monoVoice.isReleased() && monoMidi === midi;
  const v = heldVoices.get(midi);
  return !!v && !v.isReleased();
}

function holding(): boolean {
  return sustainPedal || synthPatch.hold === "on";
}

function startVoice(midi: number, vel: number, at: number, fromHz = 0, glide = 0): SynthVoice {
  const ctx = getAudioCtx();
  if (machine.engine === "strings" && useStrings()) {
    return createStringsVoice(midi, centsFor(midi), vel, at, fromHz, glide);
  }
  if (machine.engine === "fm" && useFm()) {
    return createFmVoice(midi, centsFor(midi), vel, at, fromHz, glide);
  }
  if (useHQ()) return createHQVoice(midi, centsFor(midi), vel, at, fromHz, glide);
  return createSynthVoice(ctx, freqFor(midi), Math.max(at, ctx.currentTime), synthPatch, vel, fromHz, glide);
}

function markKey(midi: number, on: boolean): void {
  const el = document.querySelector(`.key[data-midi="${midi}"]`);
  if (el) el.classList.toggle("is-pressed", on);
}

function releaseVoiceNow(midi: number): void {
  const v = heldVoices.get(midi);
  if (v) {
    heldVoices.delete(midi);
    const ctx = getAudioCtxIfAny();
    if (ctx) v.release(ctx.currentTime);
  }
  markKey(midi, false);
}

function releaseHeldByHold(): void {
  if (holding()) return;
  sustainedNotes.forEach((m) => { if (!physicallyHeld.has(m)) releaseVoiceNow(m); });
  sustainedNotes.clear();
  if (synthPatch.polyMode === "mono" && monoVoice && monoStack.length === 0) {
    const ctx = getAudioCtxIfAny();
    if (ctx) monoVoice.release(ctx.currentTime);
    monoVoice = null;
    markKey(monoMidi, false);
    monoMidi = -1;
  }
}

export function setSustainPedal(down: boolean): void {
  sustainPedal = down;
  if (!down) releaseHeldByHold();
}
export function getSustainPedal(): boolean {
  return sustainPedal;
}

// mono/legato voice handling
function monoOn(midi: number, vel: number): void {
  const ctx = getAudioCtx();
  // Pressing the currently HOLD-latched mono note stops it (toggle)
  if (synthPatch.hold === "on" && monoVoice && !monoVoice.isReleased() && monoMidi === midi && monoStack.length === 0) {
    monoVoice.release(ctx.currentTime);
    monoVoice = null;
    markKey(monoMidi, false);
    monoMidi = -1;
    return;
  }
  const i = monoStack.indexOf(midi);
  if (i >= 0) monoStack.splice(i, 1);
  monoStack.push(midi);
  const glide = synthPatch.glide || 0;
  const hz = freqFor(midi);
  if (monoVoice && !monoVoice.isReleased() && synthPatch.legato === "on" && monoVoice.retune) {
    monoVoice.retune(hz, Math.max(0.003, glide), ctx.currentTime);
  } else {
    if (monoVoice) monoVoice.release(ctx.currentTime, 0.01);
    monoVoice = startVoice(midi, vel, ctx.currentTime, glide > 0.004 && lastMonoHz ? lastMonoHz : 0, glide);
  }
  if (monoMidi >= 0) markKey(monoMidi, false);
  monoMidi = midi;
  lastMonoHz = hz;
  markKey(midi, true);
}

function monoOff(midi: number): void {
  const ctx = getAudioCtxIfAny();
  const i = monoStack.indexOf(midi);
  if (i >= 0) monoStack.splice(i, 1);
  if (midi !== monoMidi) return;
  if (monoStack.length && ctx) {
    // fall back to the previous held note (classic mono behaviour)
    const prev = monoStack[monoStack.length - 1];
    const hz = freqFor(prev);
    const glide = synthPatch.glide || 0;
    if (monoVoice && !monoVoice.isReleased() && synthPatch.legato === "on" && monoVoice.retune) {
      monoVoice.retune(hz, Math.max(0.003, glide), ctx.currentTime);
    } else {
      if (monoVoice) monoVoice.release(ctx.currentTime, 0.01);
      monoVoice = startVoice(prev, 0.8, ctx.currentTime, glide > 0.004 ? lastMonoHz : 0, glide);
    }
    markKey(monoMidi, false);
    monoMidi = prev;
    lastMonoHz = hz;
    markKey(prev, true);
    return;
  }
  if (holding()) return;
  if (monoVoice && ctx) monoVoice.release(ctx.currentTime);
  monoVoice = null;
  markKey(monoMidi, false);
  monoMidi = -1;
}

function polyOn(midi: number, vel: number): void {
  const ctx = getAudioCtx();
  if (synthPatch.hold === "on" && sustainedNotes.has(midi) && !physicallyHeld.has(midi)) {
    sustainedNotes.delete(midi);
    releaseVoiceNow(midi);
    return;
  }
  physicallyHeld.add(midi);
  sustainedNotes.delete(midi);
  const prev = heldVoices.get(midi);
  if (prev) prev.release(ctx.currentTime);
  heldVoices.set(midi, startVoice(midi, vel, ctx.currentTime));
  markKey(midi, true);
}

function polyOff(midi: number): void {
  physicallyHeld.delete(midi);
  if (holding()) {
    if (heldVoices.has(midi)) sustainedNotes.add(midi);
    return;
  }
  releaseVoiceNow(midi);
}

/** Note on from keyboard, pads or MIDI (velocity 0..1). */
export function noteOn(midi: number, velocity = 1): void {
  prepareAudio();
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (machine.kind === "drums") {
    const v = drumVoiceForNote(midi);
    if (v) triggerDrum(v, velocity);
    markKey(midi, true);
    return;
  }
  if (synthPatch.arpOn === "on") {
    arpNoteOn(midi, velocity);
    markKey(midi, isNoteSounding(midi));
    return;
  }
  if (synthPatch.polyMode === "mono") monoOn(midi, velocity);
  else polyOn(midi, velocity);
}

export function noteOff(midi: number): void {
  if (machine.kind === "drums") {
    markKey(midi, false);
    return;
  }
  if (synthPatch.arpOn === "on") {
    arpNoteOff(midi);
    markKey(midi, isNoteSounding(midi));
    return;
  }
  if (synthPatch.polyMode === "mono") monoOff(midi);
  else polyOff(midi);
}

/** Release only physically held keys (window blur / tab hidden); keeps HOLD-latched notes and sustain pedal. */
export function releasePhysicalNotes(): void {
  const fromKeys = Array.from(downKeys.values());
  downKeys.clear();
  fromKeys.forEach((m) => noteOff(m));

  const heldArr = Array.from(physicallyHeld);
  heldArr.forEach((m) => polyOff(m));

  if (synthPatch.polyMode === "mono" && monoStack.length > 0) {
    const top = monoStack[monoStack.length - 1];
    monoStack.length = 0;
    monoOff(top);
  }

  if (synthPatch.arpOn === "on") {
    const dropped = arpReleasePhysical(synthPatch.hold === "on");
    dropped.forEach((m) => markKey(m, false));
  }
}

/** Stop every sound and forget held state (keeps the sustain pedal flag off too). */
function releaseEverything(): void {
  arpAllOff();
  physicallyHeld.clear();
  sustainedNotes.clear();
  Array.from(heldVoices.keys()).forEach((m) => releaseVoiceNow(m));
  const ctx = getAudioCtxIfAny();
  if (monoVoice && ctx) monoVoice.release(ctx.currentTime);
  monoVoice = null;
  monoStack.length = 0;
  monoMidi = -1;
  hqPost({ t: "alloff" });
  stringsPost({ t: "alloff" });
  fmPost({ t: "alloff" });
  document.querySelectorAll(".key.is-pressed").forEach((el) => el.classList.remove("is-pressed"));
}

export function allNotesOff(): void {
  sustainPedal = false;
  downKeys.clear();
  setVoicePitchBend(0);
  hqPost({ t: "bend", v: 0 });
  stringsPost({ t: "bend", v: 0 });
  fmPost({ t: "bend", v: 0 });
  releaseEverything();
}

// ------------------------------------------------------------ wiring up ----
configureArp({
  getPatch: () => synthPatch,
  play: (midi, vel, at, off) => {
    const v = startVoice(midi, vel, at);
    v.release(off);
  }
});
configureDrums(
  () => synthPatch,
  () => {
    const ctx = getAudioCtxIfAny();
    return ctx ? getSynthBus(ctx, synthPatch).input : null;
  }
);
setDrumTempoSource(getTempo);

/** Load the remembered machine at startup (call once, before the first render). */
export function initMachine(): void {
  setMachine(machine.id);
}
