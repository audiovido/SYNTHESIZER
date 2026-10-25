/**
 * SY-1 Engine — Web MIDI Input & MIDI Learn
 */

import { PARAM_CHOICES, SYNTH_PARAMS, synthDenorm } from "./params";
import { allNotesOff, noteOff, noteOn, setModWheel, setPitchBend, setSustainPedal, setSynthParam } from "./synth";

export interface MidiInputInfo {
  id: string;
  name: string;
}

const STORAGE_MAP_KEY = "musicher_synth_midi_map";
const STORAGE_DEV_KEY = "musicher_synth_midi_device";
const STORAGE_CH_KEY = "musicher_synth_midi_channel";

let midiAccess: any = null;
let midiEnabled = false;
let midiStatusMessage = "";

let selectedDeviceId = ""; // "" = All inputs
let selectedChannel = 0;   // 0 = Omni, 1..16 = specific channel

// cc (0..127) -> paramKey
const ccToParam: (string | undefined)[] = new Array(128);
// paramKey -> cc (0..127)
const paramToCc: Record<string, number> = {};

let learnMode = false;
let learnTargetParam: string | null = null;

// Load saved MIDI settings from localStorage
try {
  const savedDev = localStorage.getItem(STORAGE_DEV_KEY);
  if (savedDev !== null) selectedDeviceId = savedDev;

  const savedCh = localStorage.getItem(STORAGE_CH_KEY);
  if (savedCh !== null) {
    const ch = parseInt(savedCh, 10);
    if (!isNaN(ch) && ch >= 0 && ch <= 16) selectedChannel = ch;
  }

  const savedMap = JSON.parse(localStorage.getItem(STORAGE_MAP_KEY) || "null");
  if (savedMap && typeof savedMap === "object") {
    Object.keys(savedMap).forEach((k) => {
      const cc = parseInt(k, 10);
      const param = savedMap[k];
      if (!isNaN(cc) && cc >= 0 && cc < 128 && typeof param === "string" && SYNTH_PARAMS[param]) {
        ccToParam[cc] = param;
        paramToCc[param] = cc;
      }
    });
  }
} catch (e) {}

function saveMidiState(): void {
  try {
    localStorage.setItem(STORAGE_DEV_KEY, selectedDeviceId);
    localStorage.setItem(STORAGE_CH_KEY, String(selectedChannel));
    const mapObj: Record<number, string> = {};
    for (let i = 0; i < 128; i++) {
      if (ccToParam[i]) mapObj[i] = ccToParam[i]!;
    }
    localStorage.setItem(STORAGE_MAP_KEY, JSON.stringify(mapObj));
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

export function isMidiEnabled(): boolean {
  return midiEnabled;
}

export function getMidiStatusMessage(): string {
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
  return selectedChannel;
}

export function setSelectedMidiChannel(ch: number): void {
  selectedChannel = Math.max(0, Math.min(16, ch));
  saveMidiState();
  notifyMidiState();
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
  return learnMode;
}

export function getLearnTargetParam(): string | null {
  return learnTargetParam;
}

export function toggleLearnMode(force?: boolean): void {
  learnMode = force !== undefined ? force : !learnMode;
  if (!learnMode) {
    learnTargetParam = null;
  }
  notifyMidiState();
}

export function selectLearnParam(paramKey: string): void {
  if (!learnMode || !SYNTH_PARAMS[paramKey]) return;
  learnTargetParam = learnTargetParam === paramKey ? null : paramKey;
  notifyMidiState();
}

export function isParamMapped(paramKey: string): boolean {
  return paramToCc[paramKey] !== undefined;
}

export function getParamMappedCc(paramKey: string): number | undefined {
  return paramToCc[paramKey];
}

export function mapCcToParam(cc: number, paramKey: string): void {
  if (cc < 0 || cc >= 128 || !SYNTH_PARAMS[paramKey]) return;
  // Remove previous CC for this param if any
  const prevCc = paramToCc[paramKey];
  if (prevCc !== undefined) {
    ccToParam[prevCc] = undefined;
  }
  // Remove previous param for this CC if any
  const prevParam = ccToParam[cc];
  if (prevParam !== undefined) {
    delete paramToCc[prevParam];
  }
  ccToParam[cc] = paramKey;
  paramToCc[paramKey] = cc;
  saveMidiState();
  notifyMidiState();
}

export function removeParamMapping(paramKey: string): boolean {
  const cc = paramToCc[paramKey];
  if (cc === undefined) return false;
  ccToParam[cc] = undefined;
  delete paramToCc[paramKey];
  saveMidiState();
  notifyMidiState();
  return true;
}

function applyCcToParam(paramKey: string, ccVal: number): void {
  const def = SYNTH_PARAMS[paramKey];
  if (!def) return;
  if (def.type) {
    const choices = PARAM_CHOICES[def.type];
    if (choices && choices.length > 0) {
      const idx = Math.min(choices.length - 1, Math.floor((ccVal / 128) * choices.length));
      setSynthParam(paramKey, choices[idx]);
    }
  } else {
    setSynthParam(paramKey, synthDenorm(paramKey, ccVal / 127));
  }
}

// Allocation-free MIDI message handler
function handleMidiMessage(e: any): void {
  const data = e.data;
  if (!data || data.length < 2) return;

  const status = data[0];
  // Ignore system real-time / sysex messages (>= 0xF0)
  if (status >= 0xf0) return;

  const ch = (status & 0x0f) + 1;
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
    if (learnMode && learnTargetParam) {
      const target = learnTargetParam;
      learnTargetParam = null;
      mapCcToParam(d1, target);
      applyCcToParam(target, d2);
      return;
    }

    if (d1 === 120 || d1 === 123) {
      allNotesOff();
      return;
    }

    const mappedParam = ccToParam[d1];
    if (mappedParam !== undefined) {
      applyCcToParam(mappedParam, d2);
      return;
    }

    // Built-in CCs when not overridden by custom mapping
    if (d1 === 1) {
      setModWheel(d2 / 127);
    } else if (d1 === 64) {
      setSustainPedal(d2 >= 64);
    }
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
  if (!nav.requestMIDIAccess) {
    midiStatusMessage = "MIDI needs Chrome or Edge on desktop or Android";
    notifyMidiState();
    return;
  }

  try {
    const access = await nav.requestMIDIAccess({ sysex: false });
    midiAccess = access;
    midiEnabled = true;
    midiStatusMessage = "";
    bindMidiInputs();
    access.onstatechange = () => {
      bindMidiInputs();
      notifyMidiState();
    };
    notifyMidiState();
  } catch (err) {
    midiStatusMessage = "MIDI needs Chrome or Edge on desktop or Android";
    notifyMidiState();
  }
}
