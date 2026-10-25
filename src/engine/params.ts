/**
 * SY-1 Engine — Parameters and Normalization
 */

export interface ParamDef {
  type?: "wave" | "filter" | "lfo";
  min?: number;
  max?: number;
  step?: number;
  curve?: "log";
  def: any;
  fmt?: (v: number) => string;
}

export type SynthPatch = Record<string, any>;

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
  lfoRate:    { min: 0.05, max: 20, curve: "log", def: 5, fmt: (v) => v.toFixed(v < 1 ? 2 : 1) + "Hz" },
  lfoDepth:   { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  lfoTarget:  { type: "lfo", def: "pitch" },
  drive:      { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  eqLow:      { min: -12, max: 12, def: 0, fmt: fmtDb },
  eqMid:      { min: -12, max: 12, def: 0, fmt: fmtDb },
  eqHigh:     { min: -12, max: 12, def: 0, fmt: fmtDb },
  delayTime:  { min: 0.05, max: 1.2, curve: "log", def: 0.32, fmt: fmtSec },
  delayFb:    { min: 0, max: 0.85, def: 0.35, fmt: (v) => Math.round(v * 100) + "%" },
  delayMix:   { min: 0, max: 1, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  revSize:    { min: 0.3, max: 6, curve: "log", def: 2.2, fmt: fmtSec },
  revMix:     { min: 0, max: 1, def: 0.18, fmt: (v) => Math.round(v * 100) + "%" },
  volume:     { min: 0, max: 1, def: 0.7, fmt: (v) => Math.round(v * 100) + "%" }
};

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
