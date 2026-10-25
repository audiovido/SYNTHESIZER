/**
 * SY-1 UI — Panel Component & Presets
 */

import { escapeHtml, SYNTH_PARAMS } from "../engine/params";
import { PRESET_NAMES, SYNTH_PRESETS } from "../engine/presets";
import { applySynthPreset, getSynthPatch, getSynthPresetId, noteOff, noteOn, onParamChange, onPresetChange, setSynthParam } from "../engine/synth";
import { getBaseMidi } from "./keyboard";
import { renderSynthKnob, updateSynthControlDOM } from "./knob";

const WAVE_OPTS: [string, string, string][] = [
  ["sawtooth", "⩘", "Saw"],
  ["square", "⊓", "Square"],
  ["triangle", "△", "Triangle"],
  ["sine", "∿", "Sine"]
];

export function renderSynthChoice(key: string, options: [string, string, string?][]): string {
  const patch = getSynthPatch();
  return `<div class="synth-choice" data-param="${key}">` +
    options.map(([val, txt, title]) =>
      `<button type="button" class="synth-choice-btn ${patch[key] === val ? "active" : ""}" data-action="synth-set" data-param="${key}" data-value="${val}" title="${title || val}">${txt}</button>`
    ).join("") +
    `</div>`;
}

export function renderSynthPanelHtml(): string {
  const currentPresetId = getSynthPresetId();
  const presetBtns = Object.keys(SYNTH_PRESETS).map((id) =>
    `<button type="button" class="synth-preset-btn ${currentPresetId === id ? "active" : ""}" data-action="synth-preset" data-preset="${id}">${escapeHtml(PRESET_NAMES[id] || id)}</button>`
  ).join("");

  return `
    <div class="synth-panel" dir="ltr">
      <div class="synth-top">
        <div class="synth-brand">MUSICHER <b>SY-1</b></div>
        <canvas class="synth-scope" width="320" height="56" aria-hidden="true"></canvas>
        <div class="synth-presets">${presetBtns}</div>
      </div>
      <div class="synth-sections">
        <section class="synth-sec"><h4>OSC 1</h4>${renderSynthChoice("osc1Wave", WAVE_OPTS)}<div class="sk-row">${renderSynthKnob("osc1Oct", "OCT")}${renderSynthKnob("sub", "SUB")}${renderSynthKnob("noise", "NOISE")}</div></section>
        <section class="synth-sec"><h4>OSC 2</h4>${renderSynthChoice("osc2Wave", WAVE_OPTS)}<div class="sk-row">${renderSynthKnob("osc2Oct", "OCT")}${renderSynthKnob("osc2Detune", "DETUNE")}${renderSynthKnob("oscMix", "MIX")}</div></section>
        <section class="synth-sec synth-sec-filter"><h4>FILTER</h4>${renderSynthChoice("filterType", [["lowpass", "LP", "Low-pass"], ["bandpass", "BP", "Band-pass"], ["highpass", "HP", "High-pass"]])}<div class="sk-row">${renderSynthKnob("cutoff", "CUTOFF")}${renderSynthKnob("res", "RESO")}${renderSynthKnob("envAmt", "ENV")}</div><div class="sk-row sk-row-small">${renderSynthKnob("fA", "A")}${renderSynthKnob("fD", "D")}${renderSynthKnob("fS", "S")}</div></section>
        <section class="synth-sec"><h4>AMP ENV</h4><div class="sk-row">${renderSynthKnob("aA", "ATTACK")}${renderSynthKnob("aD", "DECAY")}</div><div class="sk-row">${renderSynthKnob("aS", "SUSTAIN")}${renderSynthKnob("aR", "RELEASE")}</div></section>
        <section class="synth-sec"><h4>LFO</h4>${renderSynthChoice("lfoTarget", [["pitch", "PITCH"], ["filter", "FILTER"], ["amp", "AMP"]])}<div class="sk-row">${renderSynthKnob("lfoRate", "RATE")}${renderSynthKnob("lfoDepth", "DEPTH")}</div></section>
        <section class="synth-sec"><h4>DRIVE · EQ</h4><div class="sk-row">${renderSynthKnob("drive", "DRIVE")}${renderSynthKnob("eqLow", "LOW")}</div><div class="sk-row">${renderSynthKnob("eqMid", "MID")}${renderSynthKnob("eqHigh", "HIGH")}</div></section>
        <section class="synth-sec"><h4>DELAY</h4><div class="sk-row">${renderSynthKnob("delayTime", "TIME")}${renderSynthKnob("delayFb", "FDBK")}${renderSynthKnob("delayMix", "MIX")}</div></section>
        <section class="synth-sec"><h4>REVERB · OUT</h4><div class="sk-row">${renderSynthKnob("revSize", "SIZE")}${renderSynthKnob("revMix", "MIX")}${renderSynthKnob("volume", "VOL")}</div></section>
      </div>
      <div class="synth-hint">Drag a knob up/down (or scroll / arrow keys) · double-click to reset · play with mouse, touch or keys A W S E D F T G Y H U J K · Z/X = octave</div>
    </div>`;
}

export function updateSynthPresetDOM(): void {
  const currentPresetId = getSynthPresetId();
  document.querySelectorAll(".synth-preset-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-preset") === currentPresetId);
  });
}

export function initPanelInteractions(): void {
  onParamChange((key) => {
    updateSynthControlDOM(key);
  });

  onPresetChange(() => {
    updateSynthPresetDOM();
  });

  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement)?.closest?.("[data-action]") as HTMLElement | null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (action === "synth-set") {
      const param = btn.getAttribute("data-param");
      const val = btn.getAttribute("data-value");
      if (param && val !== null) {
        setSynthParam(param, val);
      }
    } else if (action === "synth-preset") {
      const presetId = btn.getAttribute("data-preset");
      if (presetId) {
        applySynthPreset(presetId);
        // BUG FIX 2b: Use the C at the start of current visible range instead of hardcoded 60
        const previewNote = getBaseMidi();
        noteOn(previewNote);
        setTimeout(() => noteOff(previewNote), 500);
      }
    }
  });
}
