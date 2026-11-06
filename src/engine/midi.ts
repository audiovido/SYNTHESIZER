/**
 * SY-1 Engine — Web MIDI Input & MIDI Learn
 */

import { beginMidiIn, endMidiIn, getMidiOutName, handleRealtime } from "./daw";
import { allNotesOff, noteOff, noteOn, setPitchBend } from "./synth";
import * as cc from "./cc-map";
export { getParamMappedCc, isParamMapped, mapCcToParam, removeParamMapping } from "./cc-map";

export interface MidiInputInfo {
  id: string;
  name: string;
}

const STORAGE_DEV_KEY = "musicher_synth_midi_device";

let midiAccess: any = null;
let midiEnabled = false;
let midiRejected = false;
let midiStatusMessage = "";

let selectedDeviceId = ""; // "" = All inputs

// Load saved MIDI settings from localStorage
try {
  const savedDev = localStorage.getItem(STORAGE_DEV_KEY);
  if (savedDev !== null) selectedDeviceId = savedDev;


} catch (e) {}

function saveMidiState(): void {
  try {
    localStorage.setItem(STORAGE_DEV_KEY, selectedDeviceId);
  } catch (e) {}
}

type VoidCallback = () => void;
const stateListeners = new Set<VoidCallback>();
let activityBlinkCallback: VoidCallback | null = null;

export function onMidiStateChange(cb: VoidCallback): () => void {
  stateListeners.add(cb);
  return () => stateListeners.delete(cb);
}

export function setMidiActivityCallback(cb: VoidCallback): void {
  activityBlinkCallback = cb;
}

function notifyMidiState(): void {
  stateListeners.forEach((cb) => cb());
}
cc.onCcMapChange(notifyMidiState);

/** MIDI Learn works with Web MIDI, and in the plugin (MIDI from the DAW). */
export function isLearnUnavailable(): boolean {
  return !cc.HOST_MIDI && isMidiUnavailable();
}

export function isMidiEnabled(): boolean {
  return midiEnabled;
}

export function isMidiUnavailable(): boolean {
  const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
  return !nav || typeof nav.requestMIDIAccess !== "function" || midiRejected;
}

export function getMidiStatusMessage(): string {
  if (isMidiUnavailable()) {
    return "MIDI needs Chrome or Edge on desktop or Android";
  }
  return midiStatusMessage;
}

export function getSelectedMidiDevice(): string {
  return selectedDeviceId;
}

export function setSelectedMidiDevice(id: string): void {
  selectedDeviceId = id;
  saveMidiState();
  bindMidiInputs();
  notifyMidiState();
}

export function getSelectedMidiChannel(): number {
  return cc.getMidiChannel();
}

export function setSelectedMidiChannel(ch: number): void {
  cc.setMidiChannel(ch);
}

export function getMidiInputs(): MidiInputInfo[] {
  if (!midiAccess) return [];
  const list: MidiInputInfo[] = [];
  midiAccess.inputs.forEach((input: any) => {
    list.push({
      id: input.id,
      name: input.name || `MIDI Input ${list.length + 1}`
    });
  });
  return list;
}

export function isLearnMode(): boolean {
  return !isLearnUnavailable() && cc.isCcLearnMode();
}

export function getLearnTargetParam(): string | null {
  return cc.getCcLearnTarget();
}

export function toggleLearnMode(force?: boolean): void {
  if (isLearnUnavailable()) {
    if (cc.isCcLearnMode()) cc.setLearnMode(false);
    notifyMidiState();
    return;
  }
  cc.setLearnMode(force !== undefined ? force : !cc.isCcLearnMode());
}

export function selectLearnParam(paramKey: string): void {
  if (!isLearnMode()) return;
  cc.selectLearnParam(paramKey);
}

// Allocation-free MIDI message handler
function handleMidiMessage(e: any): void {
  const data = e.data;
  if (!data || !data.length) return;
  if (data[0] >= 0xf8) {
    if (data[0] <= 0xfc) handleRealtime(data[0], e.timeStamp || performance.now());
    return;
  }
  if (data.length < 2) return;
  // a loopback port (IAC bus, loopMIDI) hands our own MIDI out straight back: play it only once
  const outName = getMidiOutName();
  if (outName && e.target && e.target.name === outName) return;
  beginMidiIn();
  try {
    dispatchMidi(e, data);
  } finally {
    endMidiIn();
  }
}

function dispatchMidi(e: any, data: any): void {
  const status = data[0];
  // other system messages (sysex, song position...) are ignored
  if (status >= 0xf0) return;

  const ch = (status & 0x0f) + 1;
  const selectedChannel = cc.getMidiChannel();
  if (selectedChannel !== 0 && ch !== selectedChannel) return;

  if (activityBlinkCallback) activityBlinkCallback();

  const cmd = status & 0xf0;
  const d1 = data[1] & 0x7f;
  const d2 = data.length > 2 ? data[2] & 0x7f : 0;

  if (cmd === 0x90) {
    if (d2 > 0) {
      noteOn(d1, d2 / 127);
    } else {
      noteOff(d1);
    }
  } else if (cmd === 0x80) {
    noteOff(d1);
  } else if (cmd === 0xe0) {
    const val14 = (d2 << 7) | d1;
    setPitchBend((val14 - 8192) / 8192);
  } else if (cmd === 0xb0) {
    cc.handleControlChange(d1, d2);
  }
}

function bindMidiInputs(): void {
  if (!midiAccess) return;
  midiAccess.inputs.forEach((input: any) => {
    if (!selectedDeviceId || input.id === selectedDeviceId) {
      input.onmidimessage = handleMidiMessage;
    } else {
      input.onmidimessage = null;
    }
  });
}

export async function requestMidi(): Promise<void> {
  const nav = navigator as any;
  if (!nav || typeof nav.requestMIDIAccess !== "function") {
    midiEnabled = false;
    midiRejected = true;
    if (!cc.HOST_MIDI && cc.isCcLearnMode()) cc.setLearnMode(false);
    midiStatusMessage = "MIDI needs Chrome or Edge on desktop or Android";
    notifyMidiState();
    return;
  }

  try {
    const access = await nav.requestMIDIAccess({ sysex: false });
    midiAccess = access;
    midiEnabled = true;
    midiRejected = false;
    midiStatusMessage = "";
    bindMidiInputs();
    access.onstatechange = (event: any) => {
      if (event.port?.type === "input" && event.port?.state === "disconnected") allNotesOff();
      cc.setMidiPickup(cc.getMidiPickup()); // reconnect starts with pickup armed again
      bindMidiInputs();
      notifyMidiState();
    };
    notifyMidiState();
  } catch (err) {
    midiEnabled = false;
    midiRejected = true;
    if (!cc.HOST_MIDI && cc.isCcLearnMode()) cc.setLearnMode(false);
    midiStatusMessage = "MIDI needs Chrome or Edge on desktop or Android";
    notifyMidiState();
  }
}
