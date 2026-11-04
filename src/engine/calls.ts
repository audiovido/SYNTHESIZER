/**
 * SY-1 Engine — the engine calls that the plugin mirrors between its window (this app)
 * and its audio engine (the same code, run natively). See mirror.ts.
 */
import * as synth from "./synth";
import * as drums from "./drums";
import * as params from "./params";
import * as vector from "./vector";
import { setHostTempo, setTempo } from "./tempo";
import { setMasterVolume } from "./bus";
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
  hostStep,
  setHostTempo,
  uiStore
};

/** A setting only the plugin window keeps (open page, favourites): stored with the plugin's state. */
function uiStore(key: string, value: string): void {
  if (!/^sy1\.m\.[^.]+\.(page|favs)$/.test(String(key))) return;
  try { localStorage.setItem(String(key), String(value)); } catch (e) {}
}

/** DAW Play / Stop: while the DAW plays, the drum pattern runs on the DAW's 16th notes (hostStep). */
function hostTransport(playing: boolean): void {
  drums.hostDrums(!!playing);
}

/** The DAW's 16th note number `sixteenth` (from the song start) falls `inSec` seconds from now. */
function hostStep(sixteenth: number, inSec: number): void {
  if (synth.getMachine().kind === "drums") drums.hostStep(sixteenth, inSec);
}

/** Apply a call that came from the other side (not sent back). */
export function applyEngineCall(name: string, args: unknown[]): void {
  const f = ENGINE_CALLS[name];
  if (f) runUnmirrored(() => f(...(Array.isArray(args) ? args : [])));
}
