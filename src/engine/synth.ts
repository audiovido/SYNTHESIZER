/**
 * SY-1 Engine — Core Synth Controller & Note Management
 */

import { getAudioCtx, getAudioCtxIfAny, getSynthBus, makeDriveCurve, makeReverbImpulse, unlockAudio } from "./bus";
import { SYNTH_PARAMS, SynthPatch, synthDefaults } from "./params";
import { SYNTH_PRESETS } from "./presets";
import { activeSynthVoices, createSynthVoice, SynthVoice } from "./voice";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function midiToName(m: number): string {
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

let synthPatch: SynthPatch = synthDefaults();
let synthPresetId = "init";

try {
  const saved = JSON.parse(localStorage.getItem("musicher_synth_patch") || "null");
  if (saved && typeof saved === "object") {
    Object.keys(SYNTH_PARAMS).forEach((k) => {
      if (k in saved) synthPatch[k] = saved[k];
    });
    synthPresetId = localStorage.getItem("musicher_synth_preset") || "custom";
  }
} catch (e) {}

let synthSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveSynthPatchSoon() {
  if (synthSaveTimer) clearTimeout(synthSaveTimer);
  synthSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem("musicher_synth_patch", JSON.stringify(synthPatch));
      localStorage.setItem("musicher_synth_preset", synthPresetId);
    } catch (e) {}
  }, 300);
}

export function getSynthPatch(): SynthPatch {
  return synthPatch;
}

export function getSynthPresetId(): string {
  return synthPresetId;
}

export type ParamChangeCallback = (key: string, value: any) => void;
export type PresetChangeCallback = (presetId: string) => void;

const paramChangeListeners = new Set<ParamChangeCallback>();
const presetChangeListeners = new Set<PresetChangeCallback>();

export function onParamChange(cb: ParamChangeCallback): () => void {
  paramChangeListeners.add(cb);
  return () => paramChangeListeners.delete(cb);
}

export function onPresetChange(cb: PresetChangeCallback): () => void {
  presetChangeListeners.add(cb);
  return () => presetChangeListeners.delete(cb);
}

export function setSynthParam(
  key: string,
  value: any,
  { fromPreset = false }: { fromPreset?: boolean } = {}
): void {
  const def = SYNTH_PARAMS[key];
  if (!def) return;
  if (def.type) {
    synthPatch[key] = value;
  } else {
    let v = Math.max(def.min!, Math.min(def.max!, Number(value)));
    if (def.step) v = Math.round(v / def.step) * def.step;
    synthPatch[key] = v;
  }

  if (!fromPreset) {
    synthPresetId = "custom";
    presetChangeListeners.forEach((cb) => cb(synthPresetId));
  }

  // Update shared FX bus parameters
  const ctx = getAudioCtxIfAny();
  const bus = ctx ? getSynthBus(ctx, synthPatch) : null;
  if (bus && ctx) {
    const now = ctx.currentTime;
    const v = synthPatch[key];
    if (key === "drive") {
      bus.drive.curve = makeDriveCurve(v) as any;
      bus.driveComp.gain.setTargetAtTime(1 / (1 + v * 1.5), now, 0.02);
    } else if (key === "eqLow") {
      bus.eqLow.gain.setTargetAtTime(v, now, 0.02);
    } else if (key === "eqMid") {
      bus.eqMid.gain.setTargetAtTime(v, now, 0.02);
    } else if (key === "eqHigh") {
      bus.eqHigh.gain.setTargetAtTime(v, now, 0.02);
    } else if (key === "delayTime") {
      bus.delay.delayTime.setTargetAtTime(v, now, 0.05);
    } else if (key === "delayFb") {
      bus.fb.gain.setTargetAtTime(v, now, 0.02);
    } else if (key === "delayMix") {
      bus.delayWet.gain.setTargetAtTime(v * 0.7, now, 0.02);
    } else if (key === "revMix") {
      bus.revWet.gain.setTargetAtTime(v * 0.9, now, 0.02);
    } else if (key === "volume") {
      bus.master.gain.setTargetAtTime(v, now, 0.02);
    } else if (key === "revSize") {
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
  paramChangeListeners.forEach((cb) => cb(key, synthPatch[key]));
  saveSynthPatchSoon();
}

export function applySynthPreset(id: string): void {
  const preset = SYNTH_PRESETS[id];
  if (!preset) return;
  const next = Object.assign(synthDefaults(), preset);
  Object.keys(next).forEach((k) => setSynthParam(k, next[k], { fromPreset: true }));
  synthPresetId = id;
  presetChangeListeners.forEach((cb) => cb(synthPresetId));
  saveSynthPatchSoon();
}

// Held note tracking
const heldVoices = new Map<number, SynthVoice>(); // midi -> voice
export const downKeys = new Map<string, number>();  // computer key string -> midi

export function noteOn(midi: number): void {
  unlockAudio();
  const ctx = getAudioCtx();
  if (!ctx) return;
  const prev = heldVoices.get(midi);
  if (prev) prev.release(ctx.currentTime);
  heldVoices.set(midi, createSynthVoice(ctx, midiToFreq(midi), ctx.currentTime, synthPatch));

  const el = document.querySelector(`.key[data-midi="${midi}"]`);
  if (el) el.classList.add("is-pressed");
}

export function noteOff(midi: number): void {
  const v = heldVoices.get(midi);
  if (v) {
    heldVoices.delete(midi);
    const ctx = getAudioCtxIfAny();
    if (ctx) v.release(ctx.currentTime);
  }
  const el = document.querySelector(`.key[data-midi="${midi}"]`);
  if (el) el.classList.remove("is-pressed");
}

// BUG FIX 2c: Clear downKeys in allNotesOff so no stale computer key mappings remain when changing octave or window blur
export function allNotesOff(): void {
  downKeys.clear();
  const midis = Array.from(heldVoices.keys());
  midis.forEach((m) => noteOff(m));
}
