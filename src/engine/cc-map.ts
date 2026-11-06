/**
 * SY-1 Engine — MIDI CC mapping and MIDI Learn (shared by the web app's Web MIDI input and the
 * plugin, where MIDI comes from the DAW).
 *
 * One table maps a controller to a knob: CC 0..127, and in the plugin the 16 DAW automation
 * macros as slots 128..143. Learn: LEARN on, click a knob, move a controller (or a SY-1 macro in
 * the DAW) and the mapping is saved. In the plugin every call that changes this state is mirrored,
 * so the plugin's engine and its window keep the same table and learn state, and the table is
 * saved with the DAW project (it lives in localStorage, which is the plugin's state).
 */

import { mirrorCall } from "./mirror";
import { PARAM_CHOICES, SYNTH_PARAMS, synthDenorm, synthNorm } from "./params";
import { allNotesOff, getSynthPatch, setModWheel, setSustainPedal, setSynthParam } from "./synth";

const STORAGE_MAP_KEY = "musicher_synth_midi_map";
const STORAGE_CH_KEY = "musicher_synth_midi_channel";
const STORAGE_PICKUP_KEY = "sy1_midi_pickup";
const STORAGE_MODE_KEY = "sy1_midi_cc_mode";
export const MIDI_MODES = ["absolute", "twos-complement", "signed-bit", "offset-binary"] as const;
export type MidiMode = typeof MIDI_MODES[number];

/** The plugin's 16 DAW automation parameters ("Macro 1".."Macro 16") use mapping slots 128..143. */
export const MACRO_BASE = 128;
export const MACRO_COUNT = 16;
const SLOTS = MACRO_BASE + MACRO_COUNT;

/** Inside the plugin (its engine and its window): MIDI comes from the DAW, not Web MIDI. */
export const HOST_MIDI = typeof (globalThis as any).__wa !== "undefined";

const ccToParam: (string | undefined)[] = new Array(SLOTS);
const paramToCc: Record<string, number> = {};
const paramToMacro: Record<string, number> = {};
let channel = 0; // 0 = omni, 1..16
let pickup = true; // soft takeover for CCs; existing explicit OFF is respected
let mode: MidiMode = "absolute";
const lastCc: (number | undefined)[] = new Array(SLOTS);
const lastApplied: (number | undefined)[] = new Array(SLOTS);
let learnMode = false;
let learnTarget: string | null = null;

try {
  const ch = parseInt(localStorage.getItem(STORAGE_CH_KEY) || "", 10);
  if (!isNaN(ch) && ch >= 0 && ch <= 16) channel = ch;
  pickup = localStorage.getItem(STORAGE_PICKUP_KEY) !== "off";
  const savedMode = localStorage.getItem(STORAGE_MODE_KEY);
  if (MIDI_MODES.includes(savedMode as MidiMode)) mode = savedMode as MidiMode;
  const saved = JSON.parse(localStorage.getItem(STORAGE_MAP_KEY) || "null");
  if (saved && typeof saved === "object") {
    Object.keys(saved).forEach((k) => {
      const cc = Number(k);
      const param = saved[k];
      if (Number.isInteger(cc) && cc >= 0 && cc < SLOTS && cc !== 120 && cc !== 123 && typeof param === "string" && SYNTH_PARAMS[param]) {
        const reverse = cc < MACRO_BASE ? paramToCc : paramToMacro;
        if (reverse[param] !== undefined) ccToParam[reverse[param]] = undefined;
        ccToParam[cc] = param;
        reverse[param] = cc;
      }
    });
  }
} catch (e) {}

function saveMap(): void {
  try {
    const m: Record<number, string> = {};
    for (let i = 0; i < SLOTS; i++) if (ccToParam[i]) m[i] = ccToParam[i]!;
    localStorage.setItem(STORAGE_MAP_KEY, JSON.stringify(m));
  } catch (e) {}
}

const listeners = new Set<() => void>();
export function onCcMapChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify(): void {
  listeners.forEach((cb) => cb());
}

// ---- state ----
export function isCcLearnMode(): boolean { return learnMode; }
export function getCcLearnTarget(): string | null { return learnTarget; }
export function isParamMapped(paramKey: string): boolean { return getParamMappedCc(paramKey) !== undefined; }
export function getParamMappedCc(paramKey: string): number | undefined { return paramToCc[paramKey] ?? paramToMacro[paramKey]; }
export function getParamMacro(paramKey: string): number | undefined {
  const slot = paramToMacro[paramKey];
  return slot === undefined ? undefined : slot - MACRO_BASE;
}
export function mappingLabel(paramKey: string): string {
  return [paramToCc[paramKey], paramToMacro[paramKey]].filter((s) => s !== undefined).map((s) => slotName(s!)).join(" + ");
}
export function getMidiChannel(): number { return channel; }
export function getMidiPickup(): boolean { return pickup; }
export function getMidiMode(): MidiMode { return mode; }

/** A readable name for a mapping slot: "CC 74" or "Macro 3". */
export function slotName(cc: number): string {
  return cc >= MACRO_BASE ? `Macro ${cc - MACRO_BASE + 1}` : `CC ${cc}`;
}

function setLearnMode__impl(on: boolean): void {
  learnMode = !!on;
  if (!learnMode) learnTarget = null;
  notify();
}
function selectLearnParam__impl(paramKey: string): void {
  if (!learnMode || !SYNTH_PARAMS[paramKey]) return;
  learnTarget = learnTarget === paramKey ? null : paramKey;
  notify();
}
function mapCcToParam__impl(cc: number, paramKey: string): void {
  cc = Math.floor(Number(cc));
  if (!(cc >= 0 && cc < SLOTS) || cc === 120 || cc === 123 || !SYNTH_PARAMS[paramKey]) return;
  // A hardware CC and a DAW macro can control the same knob independently.
  const reverse = cc < MACRO_BASE ? paramToCc : paramToMacro;
  const prevCc = reverse[paramKey];
  if (prevCc !== undefined) ccToParam[prevCc] = undefined;
  const prevParam = ccToParam[cc];
  if (prevParam !== undefined) delete reverse[prevParam];
  ccToParam[cc] = paramKey;
  reverse[paramKey] = cc;
  lastCc[cc] = undefined;
  lastApplied[cc] = undefined;
  saveMap();
  notify();
}
function removeParamMapping__impl(paramKey: string): boolean {
  const slots = [paramToCc[paramKey], paramToMacro[paramKey]];
  if (slots.every((s) => s === undefined)) return false;
  slots.forEach((s) => { if (s !== undefined) { ccToParam[s] = undefined; lastCc[s] = lastApplied[s] = undefined; } });
  delete paramToCc[paramKey];
  delete paramToMacro[paramKey];
  saveMap();
  notify();
  return true;
}
function setMidiChannel__impl(ch: number): void {
  const next = Math.max(0, Math.min(16, Math.floor(Number(ch)) || 0));
  if (next !== channel) allNotesOff(); // old-channel note-offs will no longer be accepted
  channel = next;
  lastCc.fill(undefined);
  lastApplied.fill(undefined);
  try { localStorage.setItem(STORAGE_CH_KEY, String(channel)); } catch (e) {}
  notify();
}
function setMidiPickup__impl(on: boolean): void {
  pickup = !!on;
  lastCc.fill(undefined);
  lastApplied.fill(undefined);
  try { localStorage.setItem(STORAGE_PICKUP_KEY, pickup ? "on" : "off"); } catch (e) {}
  notify();
}
function setMidiMode__impl(next: MidiMode): void {
  if (!MIDI_MODES.includes(next)) return;
  mode = next;
  lastCc.fill(undefined);
  lastApplied.fill(undefined);
  try { localStorage.setItem(STORAGE_MODE_KEY, mode); } catch (e) {}
  notify();
}

// mirrored for the plugin (see mirror.ts); without a sink (web app) they are plain calls
export function setLearnMode(...a: Parameters<typeof setLearnMode__impl>): void { mirrorCall("setLearnMode", setLearnMode__impl, a); }
export function selectLearnParam(...a: Parameters<typeof selectLearnParam__impl>): void { mirrorCall("selectLearnParam", selectLearnParam__impl, a); }
export function mapCcToParam(...a: Parameters<typeof mapCcToParam__impl>): void { mirrorCall("mapCcToParam", mapCcToParam__impl, a); }
export function removeParamMapping(...a: Parameters<typeof removeParamMapping__impl>): boolean { return mirrorCall("removeParamMapping", removeParamMapping__impl, a); }
export function setMidiChannel(...a: Parameters<typeof setMidiChannel__impl>): void { mirrorCall("setMidiChannel", setMidiChannel__impl, a); }
export function setMidiPickup(...a: Parameters<typeof setMidiPickup__impl>): void { mirrorCall("setMidiPickup", setMidiPickup__impl, a); }
export function setMidiMode(...a: Parameters<typeof setMidiMode__impl>): void { mirrorCall("setMidiMode", setMidiMode__impl, a); }

// ---- applying a controller ----
function applyNorm(paramKey: string, n: number): void {
  const def = SYNTH_PARAMS[paramKey];
  if (!def) return;
  n = Math.max(0, Math.min(1, n));
  if (def.type) {
    const choices = PARAM_CHOICES[def.type];
    if (choices && choices.length > 0) setSynthParam(paramKey, choices[Math.min(choices.length - 1, Math.floor(n * choices.length))]);
  } else {
    setSynthParam(paramKey, synthDenorm(paramKey, n));
  }
}

/** Soft takeover: a CC moves the knob only once it reaches (or passes) the knob's position. */
function pickedUp(slot: number, paramKey: string, n: number): boolean {
  const prev = lastCc[slot];
  lastCc[slot] = n;
  if (!pickup || slot >= MACRO_BASE) return true;
  const def = SYNTH_PARAMS[paramKey];
  const v = getSynthPatch()[paramKey];
  if (!def || def.type || typeof v !== "number") return true;
  const cur = synthNorm(paramKey, v);
  if (Math.abs(n - cur) <= 2 / 127) return true;
  // Keep pickup latched while following this controller. A preset, mouse or automation
  // changing the parameter disarms it, even if the controller was previously picked up.
  return (lastApplied[slot] !== undefined && Math.abs(lastApplied[slot]! - cur) < 1e-5)
    || (prev !== undefined && (prev - cur) * (n - cur) <= 0);
}

export function paramNorm(key: string, value: unknown): number {
  const def = SYNTH_PARAMS[key];
  if (!def) return 0;
  const choices = def.type ? PARAM_CHOICES[def.type] : null;
  return choices ? Math.max(0, choices.indexOf(String(value))) / Math.max(1, choices.length - 1)
    : synthNorm(key, Number(value));
}

/** Controller -> host feedback only. Host automation never comes back through this path. */
function feedback(param: string): void {
  const i = getParamMacro(param);
  const host = (globalThis as any).__wa;
  if (i !== undefined && typeof host?.macroOut === "function") host.macroOut(i, paramNorm(param, getSynthPatch()[param]));
}

/** A mapping slot moved to n (0..1). Returns true when it was used (learned or mapped). */
export function handleSlot(slot: number, n: number): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS || !Number.isFinite(n)) return false;
  if (learnMode && learnTarget) {
    const target = learnTarget;
    learnTarget = null;
    mapCcToParam__impl(slot, target);
    if (pickedUp(slot, target, n)) {
      applyNorm(target, n);
      lastApplied[slot] = paramNorm(target, getSynthPatch()[target]);
    }
    return true;
  }
  const param = ccToParam[slot];
  if (param === undefined) return false;
  if (pickedUp(slot, param, n)) {
    applyNorm(param, n);
    lastApplied[slot] = paramNorm(param, getSynthPatch()[param]);
  }
  return true;
}

/** A Control Change (the web app's MIDI input and the plugin's DAW MIDI). */
export function handleControlChange(cc: number, value: number): void {
  if (!Number.isInteger(cc) || cc < 0 || cc > 127 || !Number.isFinite(value)) return;
  value = Math.max(0, Math.min(127, Math.round(value)));
  if (cc === 120 || cc === 123) { allNotesOff(); return; }
  if (mode !== "absolute" && (ccToParam[cc] !== undefined || (learnMode && learnTarget))) {
    if (learnMode && learnTarget) {
      const target = learnTarget;
      learnTarget = null;
      mapCcToParam__impl(cc, target);
    }
    const param = ccToParam[cc]!;
    const delta = mode === "twos-complement" ? (value < 64 ? value : value - 128)
      : mode === "signed-bit" ? (value < 64 ? value : -(value - 64)) : value - 64;
    if (delta) {
      const def = SYNTH_PARAMS[param];
      const choices = def.type ? PARAM_CHOICES[def.type] : null;
      const step = choices ? 1 / Math.max(1, choices.length - 1) : 1 / 127;
      applyNorm(param, paramNorm(param, getSynthPatch()[param]) + delta * step);
      feedback(param);
    }
    return;
  }
  if (handleSlot(cc, value / 127)) {
    const param = ccToParam[cc];
    if (param && lastApplied[cc] !== undefined) feedback(param);
    return;
  }
  if (cc === 1) setModWheel(value / 127);
  else if (cc === 64) setSustainPedal(value >= 64);
}

// ---- the plugin: CCs and macros from the DAW ----
function hostCC__impl(ch: number, cc: number, value: number): void {
  if (channel !== 0 && ch !== channel) return;
  handleControlChange(Math.floor(cc) & 0x7f, Math.max(0, Math.min(127, Number(value))));
}
function hostMacro__impl(slot: number, value: number): void {
  const i = Math.floor(slot);
  if (i < 0 || i >= MACRO_COUNT) return;
  handleSlot(MACRO_BASE + i, Number(value));
}

/** A DAW MIDI controller (channel 1..16, CC, value 0..127). */
export function hostCC(...a: Parameters<typeof hostCC__impl>): void { mirrorCall("hostCC", hostCC__impl, a); }
/** A DAW automation macro (0..15) moved to value (0..1). */
export function hostMacro(...a: Parameters<typeof hostMacro__impl>): void { mirrorCall("hostMacro", hostMacro__impl, a); }
