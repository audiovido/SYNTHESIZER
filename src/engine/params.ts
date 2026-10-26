/**
 * SY-1 Engine — Parameters and Normalization
 */

export interface ParamDef {
  type?: "wave" | "filter" | "lfo" | "poly" | "onoff" | "lfoShape" | "arpMode" | "tuning" | "strModel";
  min?: number;
  max?: number;
  step?: number;
  curve?: "log";
  def: any;
  fmt?: (v: number) => string;
}

export type SynthPatch = Record<string, any>;

export const PARAM_CHOICES: Record<string, string[]> = {
  wave: ["sawtooth", "square", "triangle", "sine"],
  filter: ["lowpass", "lp24", "bandpass", "highpass"],
  lfo: ["pitch", "filter", "amp"],
  poly: ["poly", "mono"],
  onoff: ["off", "on"],
  lfoShape: ["sine", "triangle", "square", "sawtooth", "sh"],
  arpMode: ["up", "down", "updown", "random", "played"],
  tuning: ["12tet", "shur", "homayoun", "chahargah", "segah", "bayati", "rast", "hijaz", "custom"],
  strModel: ["santur", "setar", "tar", "kanun", "oud", "harp"]
};

/** Musical note divisions used by tempo-synced LFO and arpeggiator (beats per step). */
export const SYNC_DIVS: { label: string; beats: number }[] = [
  { label: "1/1", beats: 4 },
  { label: "1/2", beats: 2 },
  { label: "1/4", beats: 1 },
  { label: "1/8", beats: 0.5 },
  { label: "1/8T", beats: 1 / 3 },
  { label: "1/16", beats: 0.25 },
  { label: "1/16T", beats: 1 / 6 },
  { label: "1/32", beats: 0.125 }
];
const NOTE_LABELS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function fmtSec(v: number): string {
  return v < 1 ? Math.round(v * 1000) + "ms" : v.toFixed(2) + "s";
}

export function fmtDb(v: number): string {
  return (v > 0 ? "+" : "") + v.toFixed(1) + "dB";
}

export function escapeHtml(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c] || c));
}

export const SYNTH_PARAMS: Record<string, ParamDef> = {
  osc1Wave:   { type: "wave", def: "sawtooth" },
  osc1Oct:    { min: -2, max: 2, step: 1, def: 0, fmt: (v) => (v > 0 ? "+" : "") + v },
  osc2Wave:   { type: "wave", def: "square" },
  osc2Oct:    { min: -2, max: 2, step: 1, def: 0, fmt: (v) => (v > 0 ? "+" : "") + v },
  osc2Detune: { min: -50, max: 50, step: 1, def: 8, fmt: (v) => v + "¢" },
  oscMix:     { min: 0, max: 1, def: 0.45, fmt: (v) => Math.round(v * 100) + "%" },
  sub:        { min: 0, max: 1, def: 0.2, fmt: (v) => Math.round(v * 100) + "%" },
  noise:      { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  unison:     { min: 1, max: 7, step: 1, def: 1, fmt: (v) => (v === 1 ? "Off" : String(v)) },
  uniDetune:  { min: 0, max: 100, def: 20, fmt: (v) => Math.round(v) + "¢" },
  uniWidth:   { min: 0, max: 1, def: 0.5, fmt: (v) => Math.round(v * 100) + "%" },
  filterType: { type: "filter", def: "lowpass" },
  cutoff:     { min: 40, max: 18000, curve: "log", def: 2200, fmt: (v) => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "" },
  res:        { min: 0.1, max: 18, curve: "log", def: 2, fmt: (v) => v.toFixed(1) },
  envAmt:     { min: 0, max: 1, def: 0.45, fmt: (v) => Math.round(v * 100) + "%" },
  fA:         { min: 0.001, max: 3, curve: "log", def: 0.01, fmt: fmtSec },
  fD:         { min: 0.01, max: 4, curve: "log", def: 0.35, fmt: fmtSec },
  fS:         { min: 0, max: 1, def: 0.25, fmt: (v) => Math.round(v * 100) + "%" },
  aA:         { min: 0.001, max: 4, curve: "log", def: 0.008, fmt: fmtSec },
  aD:         { min: 0.01, max: 4, curve: "log", def: 0.3, fmt: fmtSec },
  aS:         { min: 0, max: 1, def: 0.75, fmt: (v) => Math.round(v * 100) + "%" },
  aR:         { min: 0.01, max: 6, curve: "log", def: 0.35, fmt: fmtSec },
  velSens:    { min: 0, max: 1, def: 0.6, fmt: (v) => Math.round(v * 100) + "%" },
  lfoRate:    { min: 0.05, max: 20, curve: "log", def: 5, fmt: (v) => v.toFixed(v < 1 ? 2 : 1) + "Hz" },
  lfoDepth:   { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  lfoTarget:  { type: "lfo", def: "pitch" },
  bendRange:  { min: 0, max: 12, step: 1, def: 2, fmt: (v) => v + "st" },
  drive:      { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  eqLow:      { min: -12, max: 12, def: 0, fmt: fmtDb },
  eqMid:      { min: -12, max: 12, def: 0, fmt: fmtDb },
  eqHigh:     { min: -12, max: 12, def: 0, fmt: fmtDb },
  delayTime:  { min: 0.05, max: 1.2, curve: "log", def: 0.32, fmt: fmtSec },
  delayFb:    { min: 0, max: 0.85, def: 0.35, fmt: (v) => Math.round(v * 100) + "%" },
  delayMix:   { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  revSize:    { min: 0.3, max: 6, curve: "log", def: 2.2, fmt: fmtSec },
  revMix:     { min: 0, max: 1, def: 0.18, fmt: (v) => Math.round(v * 100) + "%" },
  volume:     { min: 0, max: 1, def: 0.7, fmt: (v) => Math.round(v * 100) + "%" },

  // voice mode
  polyMode:   { type: "poly", def: "poly" },
  glide:      { min: 0, max: 1.5, def: 0, fmt: (v) => (v < 0.005 ? "Off" : fmtSec(v)) },
  legato:     { type: "onoff", def: "on" },
  hold:       { type: "onoff", def: "off" },

  // LFO extras
  lfoShape:   { type: "lfoShape", def: "sine" },
  lfoSync:    { min: 0, max: SYNC_DIVS.length, step: 1, def: 0, fmt: (v) => (v === 0 ? "Free" : SYNC_DIVS[v - 1].label) },

  // chorus (FX bus)
  chorusMix:  { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  chorusRate: { min: 0.1, max: 6, curve: "log", def: 0.6, fmt: (v) => v.toFixed(v < 1 ? 2 : 1) + "Hz" },
  chorusDepth:{ min: 0, max: 1, def: 0.5, fmt: (v) => Math.round(v * 100) + "%" },

  // arpeggiator
  arpOn:      { type: "onoff", def: "off" },
  arpMode:    { type: "arpMode", def: "up" },
  arpRate:    { min: 1, max: SYNC_DIVS.length, step: 1, def: 6, fmt: (v) => SYNC_DIVS[v - 1].label },
  arpOct:     { min: 1, max: 4, step: 1, def: 1, fmt: (v) => v + " oct" },
  arpGate:    { min: 0.05, max: 1, def: 0.6, fmt: (v) => Math.round(v * 100) + "%" },
  arpSwing:   { min: 0, max: 0.6, def: 0, fmt: (v) => Math.round(v * 100) + "%" },

  // tuning and ornaments (HQ & Strings engines)
  oriental:   { type: "onoff", def: "off" },
  tuning:     { type: "tuning", def: "12tet" },
  tuneRoot:   { min: 0, max: 11, step: 1, def: 7, fmt: (v) => NOTE_LABELS[v] },
  scoop:      { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  scoopTime:  { min: 0.01, max: 0.6, curve: "log", def: 0.08, fmt: fmtSec },
  vibDelay:   { min: 0, max: 1.5, def: 0.3, fmt: fmtSec },
  vibDepth:   { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 50) + "¢" },
  vibRate:    { min: 2, max: 9, def: 5.5, fmt: (v) => v.toFixed(1) + "Hz" },
  tahrir:     { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  tahrirSpeed:{ min: 6, max: 22, def: 12, fmt: (v) => v.toFixed(0) + "Hz" },

  // physical-modelling strings (Shiraz)
  strModel:   { type: "strModel", def: "santur" },
  strHard:    { min: 0, max: 1, def: 0.55, fmt: (v) => Math.round(v * 100) + "%" },
  strPos:     { min: 0.05, max: 0.5, def: 0.18, fmt: (v) => Math.round(v * 100) + "%" },
  strDecay:   { min: 0.2, max: 12, curve: "log", def: 3.5, fmt: fmtSec },
  strDamp:    { min: 0, max: 1, def: 0.3, fmt: (v) => Math.round(v * 100) + "%" },
  strBright:  { min: 0, max: 1, def: 0.65, fmt: (v) => Math.round(v * 100) + "%" },
  strStiff:   { min: 0, max: 1, def: 0.25, fmt: (v) => Math.round(v * 100) + "%" },
  strCourses: { min: 1, max: 3, step: 1, def: 2, fmt: (v) => String(Math.round(v)) },
  strDetune:  { min: 0, max: 20, def: 4, fmt: (v) => Math.round(v) + "¢" },
  strBody:    { min: 0, max: 1, def: 0.45, fmt: (v) => Math.round(v * 100) + "%" },
  strTone:    { min: 0, max: 1, def: 0.5, fmt: (v) => Math.round(v * 100) + "%" },
  strBuzz:    { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  riz:        { type: "onoff", def: "off" },
  rizRate:    { min: 4, max: 20, def: 11, fmt: (v) => v.toFixed(1) + "Hz" }
};

// Drum machine voice params (Kerman): TUNE, DECAY, TONE, LEVEL per voice
export const DRUM_PARAM_VOICES = ["kick", "snare", "clap", "ch", "oh", "tom", "rim", "bell"];
DRUM_PARAM_VOICES.forEach((v) => {
  SYNTH_PARAMS[v + "Tune"] = { min: -12, max: 12, def: 0, fmt: (x) => (x > 0 ? "+" : "") + x.toFixed(1) + "st" };
  SYNTH_PARAMS[v + "Decay"] = { min: 0.25, max: 3, curve: "log", def: 1, fmt: (x) => "×" + x.toFixed(2) };
  SYNTH_PARAMS[v + "Tone"] = { min: 0, max: 1, def: 0.5, fmt: (x) => Math.round(x * 100) + "%" };
  SYNTH_PARAMS[v + "Level"] = { min: 0, max: 1, def: 0.8, fmt: (x) => Math.round(x * 100) + "%" };
});
SYNTH_PARAMS.drumSwing = { min: 0, max: 0.6, def: 0, fmt: (x) => Math.round(x * 100) + "%" };
SYNTH_PARAMS.drumAccent = { min: 0, max: 1, def: 0.5, fmt: (x) => Math.round(x * 100) + "%" };

export interface TuningDef {
  name: string;
  tonic: number;
  /** Alias for `tonic` kept for compatibility. */
  root: number;
  offsets: number[];
  approx?: boolean;
  source: string;
}

/**
 * Tunings: cents offset from 12-TET for each of the 12 semitones relative to
 * the tonic (0..11), with default tonic and documented musicological source.
 * Koron and the Arabic half-flat lower a degree by a quarter-tone (-50 cents,
 * 24-TET Vaziri / Cairo 1932 convention).
 */
export const TUNINGS: Record<string, TuningDef> = {
  "12tet": {
    name: "Equal (12-TET)",
    tonic: 0,
    root: 0,
    offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    source: "Standard 12-tone equal temperament (A4 = 440 Hz)."
  },
  shur: {
    name: "Shur",
    tonic: 7,
    root: 7,
    offsets: [0, 0, -50, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    source: "Vaziri 24-TET & Farhat (1990, ch. 3): G A-koron Bb C D Eb F — 2nd degree (+2 st) is koron (−50¢)."
  },
  homayoun: {
    name: "Homayoun",
    tonic: 7,
    root: 7,
    approx: true,
    offsets: [0, 0, -50, 0, 0, 0, 0, 0, 0, -50, 0, 0],
    source: "Vaziri 24-TET & Farhat (1990, ch. 6, Homayoun/Bidad): G A-koron B C D Eb/E-koron F — 2nd (+2 st) & 6th (+9 st) degrees koron (−50¢, approximate)."
  },
  chahargah: {
    name: "Chahargah",
    tonic: 0,
    root: 0,
    offsets: [0, 0, -50, 0, 0, 0, 0, 0, 0, -50, 0, 0],
    source: "Vaziri 24-TET & Farhat (1990, ch. 5): C D-koron E F G A-koron B — symmetrical tetrachords with 2nd (+2 st) & 6th (+9 st) degrees koron (−50¢)."
  },
  segah: {
    name: "Segah",
    tonic: 4,
    root: 4,
    approx: true,
    offsets: [-50, 0, 0, 0, 0, -50, 0, 0, 0, 0, 0, 0],
    source: "Vaziri 24-TET & Farhat (1990, ch. 4): E-koron F G A-koron Bb C D — tonic (0 st) & 4th (+5 st) on koron degrees of the C staff (−50¢, approximate)."
  },
  bayati: {
    name: "Bayati (maqam)",
    tonic: 2,
    root: 2,
    offsets: [0, 0, -50, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    source: "Arabic 24-TET maqam theory (Touma 1996): D E-half-flat F G A Bb C — 2nd degree (+2 st) is half-flat (−50¢)."
  },
  rast: {
    name: "Rast (maqam)",
    tonic: 0,
    root: 0,
    offsets: [0, 0, 0, 0, -50, 0, 0, 0, 0, 0, 0, -50],
    source: "Arabic 24-TET maqam theory (Touma 1996): C D E-half-flat F G A B-half-flat — 3rd (+4 st) & 7th (+11 st) degrees are half-flat (−50¢)."
  },
  hijaz: {
    name: "Hijaz (maqam)",
    tonic: 2,
    root: 2,
    offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    source: "Arabic 24-TET maqam theory (Touma 1996): D Eb F# G A Bb C — augmented 2nd between Eb and F#, all 12-TET offsets 0¢."
  },
  custom: {
    name: "Custom",
    tonic: 0,
    root: 0,
    offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    source: "Custom per-key cent offsets (−100¢ to +100¢) or imported 12-note Scala (.scl) file, saved per machine."
  }
};

const customTuningKey = (machineId: string) => `sy1.m.${machineId}.customTuning`;
const customTuningCache: Record<string, number[]> = {};

function clampCentOffset(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(-100, Math.min(100, n));
  return Math.round(clamped * 10) / 10;
}

export function getCustomTuning(machineId = "sy1"): number[] {
  if (!customTuningCache[machineId]) {
    let arr: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    try {
      const raw = JSON.parse(localStorage.getItem(customTuningKey(machineId)) || "null");
      if (Array.isArray(raw) && raw.length === 12) {
        arr = raw.map((x) => clampCentOffset(Number(x)));
      }
    } catch (e) {}
    customTuningCache[machineId] = arr;
  }
  return customTuningCache[machineId];
}

export function setCustomTuning(machineId: string, offsets: number[]): number[] {
  const clean = Array.from({ length: 12 }, (_, i) => clampCentOffset(offsets[i] ?? 0));
  customTuningCache[machineId] = clean;
  TUNINGS.custom.offsets = clean.slice();
  try {
    localStorage.setItem(customTuningKey(machineId), JSON.stringify(clean));
  } catch (e) {}
  return clean;
}

/**
 * Parse a Scala (.scl) tuning file. Maps the first 12 steps to per-key cent
 * deviations from 12-TET (-100..+100 cents). Returns a clear error if the
 * file does not define 12 notes.
 */
export function parseScalaScl(text: string): { ok: true; offsets: number[]; description: string } | { ok: false; error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l, idx, arr) => !l.startsWith("!") && (l.length > 0 || idx < arr.length));

  // Filter non-comment lines while preserving a possibly blank description line
  const rawLines = text.split(/\r?\n/);
  const nonComment: string[] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("!")) continue;
    if (nonComment.length === 0) {
      nonComment.push(trimmed); // description line (may be empty)
    } else if (trimmed.length > 0) {
      nonComment.push(trimmed);
    }
  }

  if (nonComment.length < 2) {
    return { ok: false, error: "Invalid .scl file: missing header or note count." };
  }

  const description = nonComment[0] || "Scala tuning";
  const declaredCount = parseInt(nonComment[1].split(/\s+/)[0], 10);
  const pitchLines = nonComment.slice(2);

  if (isNaN(declaredCount) || declaredCount !== 12 || pitchLines.length < 12) {
    const found = !isNaN(declaredCount) && declaredCount !== 12 ? declaredCount : pitchLines.length;
    return { ok: false, error: `Scala file must have 12 notes (found ${found}).` };
  }

  const pitchesCents: number[] = [];
  for (let i = 0; i < 12; i++) {
    const token = pitchLines[i].split(/\s+/)[0];
    if (!token) return { ok: false, error: `Invalid pitch on step ${i + 1}.` };
    if (token.includes(".")) {
      const val = parseFloat(token);
      if (!Number.isFinite(val)) return { ok: false, error: `Invalid cent value "${token}" on step ${i + 1}.` };
      pitchesCents.push(val);
    } else if (token.includes("/")) {
      const [numStr, denStr] = token.split("/");
      const num = parseFloat(numStr);
      const den = parseFloat(denStr);
      if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
        return { ok: false, error: `Invalid ratio "${token}" on step ${i + 1}.` };
      }
      pitchesCents.push(1200 * Math.log2(num / den));
    } else {
      const n = parseFloat(token);
      if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `Invalid pitch "${token}" on step ${i + 1}.` };
      pitchesCents.push(1200 * Math.log2(n));
    }
  }

  // Standard 12-note .scl files have implicit 1/1 (0¢) at degree 0, steps 1..11 on lines 0..10, and 2/1 (1200¢) on line 11.
  // Also support files where line 0 is already unison (0.0 or 1/1) or where lines are direct cent offsets in [-100, 100].
  const allSmallOffsets = pitchesCents.every((c) => Math.abs(c) <= 100);
  const startsWithUnison = Math.abs(pitchesCents[0]) < 35 && pitchesCents[11] > 1000 && pitchesCents[11] < 1180;
  const offsets = new Array<number>(12).fill(0);

  if (allSmallOffsets) {
    for (let k = 0; k < 12; k++) offsets[k] = clampCentOffset(pitchesCents[k]);
  } else if (startsWithUnison) {
    for (let k = 0; k < 12; k++) offsets[k] = clampCentOffset(pitchesCents[k] - k * 100);
  } else {
    offsets[0] = 0;
    for (let k = 1; k < 12; k++) {
      offsets[k] = clampCentOffset(pitchesCents[k - 1] - k * 100);
    }
  }

  void lines;
  return { ok: true, offsets, description };
}

/** Cents offset for a MIDI note under a tuning (root override optional). */
export function tuningCents(tuningId: string, midi: number, root?: number, machineId?: string): number {
  const t = TUNINGS[tuningId];
  if (!t) return 0;
  const r = root === undefined ? t.tonic : root;
  const deg = (((midi - r) % 12) + 12) % 12;
  if (tuningId === "custom") {
    const custom = machineId ? getCustomTuning(machineId) : t.offsets;
    return custom[deg] ?? 0;
  }
  return t.offsets[deg] ?? 0;
}

export function synthDefaults(): SynthPatch {
  const p: SynthPatch = {};
  Object.keys(SYNTH_PARAMS).forEach((k) => {
    p[k] = SYNTH_PARAMS[k].def;
  });
  return p;
}

export function synthNorm(key: string, v: number): number {
  const d = SYNTH_PARAMS[key];
  if (!d || d.min === undefined || d.max === undefined) return 0.5;
  if (d.curve === "log") return Math.log(v / d.min) / Math.log(d.max / d.min);
  return (v - d.min) / (d.max - d.min);
}

export function synthDenorm(key: string, n: number): number {
  const d = SYNTH_PARAMS[key];
  if (!d || d.min === undefined || d.max === undefined) return n;
  n = Math.max(0, Math.min(1, n));
  if (d.curve === "log") return d.min * Math.pow(d.max / d.min, n);
  return d.min + n * (d.max - d.min);
}

