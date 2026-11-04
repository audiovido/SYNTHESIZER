/**
 * SY-1 Engine — the engine calls that the plugin mirrors between its window (this app)
 * and its audio engine (the same code, run natively). See mirror.ts.
 */
import * as synth from "./synth";
import * as drums from "./drums";
import * as params from "./params";
import * as vector from "./vector";
import { setTempo } from "./tempo";
import { getAudioCtxIfAny, setMasterVolume } from "./bus";
import { runUnmirrored } from "./mirror";

export const ENGINE_CALLS: Record<string, (...a: any[]) => unknown> = {
  setSynthParam: synth.setSynthParam,
  applySynthPreset: synth.applySynthPreset,
  stepPreset: synth.stepPreset,
  setMachine: synth.setMachine,
  applyDrumKit: synth.applyDrumKit,
  applyDrumStyle: synth.applyDrumStyle,
  setKeepKit: synth.setKeepKit,
  updateCustomTuningOffsets: synth.updateCustomTuningOffsets,
  setPitchBend: synth.setPitchBend,
  setModWheel: synth.setModWheel,
  setSustainPedal: synth.setSustainPedal,
  noteOn: synth.noteOn,
  noteOff: synth.noteOff,
  releasePhysicalNotes: synth.releasePhysicalNotes,
  allNotesOff: synth.allNotesOff,
  switchEngine: synth.switchEngine,
  selectPattern: drums.selectPattern,
  editStep: drums.editStep,
  setPatternLength: drums.setPatternLength,
  clearPattern: drums.clearPattern,
  startDrums: drums.startDrums,
  stopDrums: drums.stopDrums,
  setTempo,
  setMasterVolume,
  playDrum: drums.playDrum,
  setCustomTuning: params.setCustomTuning,
  setVectorDrawnPath: vector.setVectorDrawnPath,
  hostTransport,
  uiStore
};

/** A setting only the plugin window keeps (open page, favourites): stored with the plugin's state. */
function uiStore(key: string, value: string): void {
  if (!/^sy1\.m\.[^.]+\.(page|favs)$/.test(String(key))) return;
  try { localStorage.setItem(String(key), String(value)); } catch (e) {}
}

/** DAW Play / Stop: a drum machine starts its pattern `delay` seconds from now (on the DAW's next
 *  16th note), at step `step` (that 16th's place in the DAW's song, so bars stay in line). */
function hostTransport(playing: boolean, delay = 0, step = 0): void {
  if (synth.getMachine().kind !== "drums") return;
  if (!playing) { drums.stopDrums(); return; }
  if (drums.isDrumPlaying()) drums.stopDrums();
  const ctx = getAudioCtxIfAny();
  drums.startDrums(ctx ? ctx.currentTime + Math.max(0, delay) : undefined, step);
}

/** Apply a call that came from the other side (not sent back). */
export function applyEngineCall(name: string, args: unknown[]): void {
  const f = ENGINE_CALLS[name];
  if (f) runUnmirrored(() => f(...(Array.isArray(args) ? args : [])));
}
