/**
 * SY-1 UI — Panel Component, Presets & MIDI Bar
 */

import {
  getLearnTargetParam,
  getMidiInputs,
  getMidiStatusMessage,
  getParamMappedCc,
  getSelectedMidiChannel,
  getSelectedMidiDevice,
  isLearnMode,
  isMidiEnabled,
  isParamMapped,
  onMidiStateChange,
  requestMidi,
  setMidiActivityCallback,
  setSelectedMidiChannel,
  setSelectedMidiDevice,
  toggleLearnMode
} from "../engine/midi";
import { escapeHtml } from "../engine/params";
import { PRESET_NAMES, SYNTH_PRESETS } from "../engine/presets";
import {
  allNotesOff,
  applySynthPreset,
  getSynthPatch,
  getSynthPresetId,
  noteOff,
  noteOn,
  onParamChange,
  onPresetChange,
  setSynthParam
} from "../engine/synth";
import { getBaseMidi } from "./keyboard";
import { renderSynthKnob, updateMidiLearnDOM, updateSynthControlDOM } from "./knob";
import { initSkinPicker, renderSkinPicker } from "./skins";

const WAVE_OPTS: [string, string, string][] = [
  ["sawtooth", "⩘", "Saw"],
  ["square", "⊓", "Square"],
  ["triangle", "△", "Triangle"],
  ["sine", "∿", "Sine"]
];

export function renderSynthChoice(key: string, options: [string, string, string?][]): string {
  const patch = getSynthPatch();
  const mapped = isParamMapped(key);
  const cc = getParamMappedCc(key);
  const learning = isLearnMode() && getLearnTargetParam() === key;
  const titleAttr = mapped ? ` title="Mapped to CC${cc} (right-click to unmap)"` : "";

  return `<div class="synth-choice${mapped ? " is-mapped" : ""}${learning ? " is-learning" : ""}" data-param="${key}"${titleAttr}>` +
    options.map(([val, txt, title]) =>
      `<button type="button" class="synth-choice-btn ${patch[key] === val ? "active" : ""}" data-action="synth-set" data-param="${key}" data-value="${val}" title="${title || val}">${txt}</button>`
    ).join("") +
    `<span class="sk-dot"></span></div>`;
}

function renderChannelOptions(): string {
  const cur = getSelectedMidiChannel();
  let html = `<option value="0"${cur === 0 ? " selected" : ""}>Omni</option>`;
  for (let ch = 1; ch <= 16; ch++) {
    html += `<option value="${ch}"${cur === ch ? " selected" : ""}>Ch ${ch}</option>`;
  }
  return html;
}

function renderDeviceOptions(): string {
  const inputs = getMidiInputs();
  const cur = getSelectedMidiDevice();
  let html = `<option value=""${cur === "" ? " selected" : ""}>All inputs</option>`;
  let foundSelected = cur === "";
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    const sel = inp.id === cur;
    if (sel) foundSelected = true;
    html += `<option value="${escapeHtml(inp.id)}"${sel ? " selected" : ""}>${escapeHtml(inp.name)}</option>`;
  }
  if (!foundSelected && cur !== "") {
    html += `<option value="${escapeHtml(cur)}" selected>(Disconnected)</option>`;
  }
  return html;
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
      <div class="synth-midi-bar">
        <button type="button" class="synth-midi-btn" id="midi-btn" data-action="midi-enable">MIDI</button>
        <span class="midi-led" id="midi-led" title="MIDI Activity" aria-hidden="true"></span>
        <select class="synth-midi-select" id="midi-device" aria-label="MIDI Input Device" hidden>${renderDeviceOptions()}</select>
        <select class="synth-midi-select" id="midi-channel" aria-label="MIDI Channel" hidden>${renderChannelOptions()}</select>
        <button type="button" class="synth-midi-btn" id="midi-learn-btn" data-action="midi-learn" title="Click LEARN, click a knob, then move a MIDI CC">LEARN</button>
        <button type="button" class="synth-midi-btn synth-panic-btn" id="midi-panic-btn" data-action="synth-panic" title="Release all notes and reset sustain">PANIC</button>
        <span class="synth-midi-msg" id="midi-msg" role="status" aria-live="polite"></span>
        ${renderSkinPicker()}
      </div>
      <div class="synth-sections">
        <section class="synth-sec"><h4>OSC 1</h4>${renderSynthChoice("osc1Wave", WAVE_OPTS)}<div class="sk-row">${renderSynthKnob("osc1Oct", "OCT")}${renderSynthKnob("sub", "SUB")}${renderSynthKnob("noise", "NOISE")}</div></section>
        <section class="synth-sec"><h4>OSC 2</h4>${renderSynthChoice("osc2Wave", WAVE_OPTS)}<div class="sk-row">${renderSynthKnob("osc2Oct", "OCT")}${renderSynthKnob("osc2Detune", "DETUNE")}${renderSynthKnob("oscMix", "MIX")}</div></section>
        <section class="synth-sec synth-sec-filter"><h4>FILTER</h4>${renderSynthChoice("filterType", [["lowpass", "LP", "Low-pass"], ["bandpass", "BP", "Band-pass"], ["highpass", "HP", "High-pass"]])}<div class="sk-row">${renderSynthKnob("cutoff", "CUTOFF")}${renderSynthKnob("res", "RESO")}${renderSynthKnob("envAmt", "ENV")}</div><div class="sk-row sk-row-small">${renderSynthKnob("fA", "A")}${renderSynthKnob("fD", "D")}${renderSynthKnob("fS", "S")}</div></section>
        <section class="synth-sec"><h4>AMP ENV</h4><div class="sk-row">${renderSynthKnob("aA", "ATTACK")}${renderSynthKnob("aD", "DECAY")}${renderSynthKnob("velSens", "VEL")}</div><div class="sk-row">${renderSynthKnob("aS", "SUSTAIN")}${renderSynthKnob("aR", "RELEASE")}</div></section>
        <section class="synth-sec"><h4>LFO</h4>${renderSynthChoice("lfoTarget", [["pitch", "PITCH"], ["filter", "FILTER"], ["amp", "AMP"]])}<div class="sk-row">${renderSynthKnob("lfoRate", "RATE")}${renderSynthKnob("lfoDepth", "DEPTH")}${renderSynthKnob("bendRange", "BEND")}</div></section>
        <section class="synth-sec"><h4>DRIVE · EQ</h4><div class="sk-row">${renderSynthKnob("drive", "DRIVE")}${renderSynthKnob("eqLow", "LOW")}</div><div class="sk-row">${renderSynthKnob("eqMid", "MID")}${renderSynthKnob("eqHigh", "HIGH")}</div></section>
        <section class="synth-sec"><h4>DELAY</h4><div class="sk-row">${renderSynthKnob("delayTime", "TIME")}${renderSynthKnob("delayFb", "FDBK")}${renderSynthKnob("delayMix", "MIX")}</div></section>
        <section class="synth-sec"><h4>REVERB · OUT</h4><div class="sk-row">${renderSynthKnob("revSize", "SIZE")}${renderSynthKnob("revMix", "MIX")}${renderSynthKnob("volume", "VOL")}</div></section>
      </div>
      <div class="synth-hint">Drag a knob up/down (or scroll / arrow keys) · double-click to reset · right-click (or long-press in LEARN) unmaps CC · keys A W S E D F T G Y H U J K · Z/X = octave</div>
    </div>`;
}

export function updateSynthPresetDOM(): void {
  const currentPresetId = getSynthPresetId();
  document.querySelectorAll(".synth-preset-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-preset") === currentPresetId);
  });
}

function updateMidiBarDOM(): void {
  const enabled = isMidiEnabled();
  const midiBtn = document.getElementById("midi-btn");
  const devSelect = document.getElementById("midi-device") as HTMLSelectElement | null;
  const chSelect = document.getElementById("midi-channel") as HTMLSelectElement | null;
  const learnBtn = document.getElementById("midi-learn-btn");
  const msgEl = document.getElementById("midi-msg");

  if (midiBtn) {
    midiBtn.classList.toggle("active", enabled);
    midiBtn.textContent = enabled ? "MIDI ON" : "MIDI";
  }

  if (devSelect) {
    devSelect.hidden = !enabled;
    if (enabled) {
      devSelect.innerHTML = renderDeviceOptions();
      devSelect.value = getSelectedMidiDevice();
    }
  }

  if (chSelect) {
    chSelect.hidden = !enabled;
    if (enabled) {
      chSelect.value = String(getSelectedMidiChannel());
    }
  }

  if (learnBtn) {
    const learning = isLearnMode();
    learnBtn.classList.toggle("active", learning);
  }

  if (msgEl) {
    const statusMsg = getMidiStatusMessage();
    if (statusMsg) {
      msgEl.textContent = statusMsg;
    } else if (isLearnMode()) {
      const target = getLearnTargetParam();
      msgEl.textContent = target ? `Move a CC to map ${target}…` : "Click a knob, then move a CC…";
    } else {
      msgEl.textContent = "";
    }
  }

  updateMidiLearnDOM();
}

export function initPanelInteractions(): void {
  onParamChange((key) => {
    updateSynthControlDOM(key);
  });

  onPresetChange(() => {
    updateSynthPresetDOM();
  });

  onMidiStateChange(() => {
    updateMidiBarDOM();
  });

  // Blink MIDI LED without per-message DOM queries or object allocations
  let ledEl: HTMLElement | null = null;
  let ledTimer: ReturnType<typeof setTimeout> | null = null;
  const clearLed = () => {
    if (ledEl) ledEl.classList.remove("is-on");
    ledTimer = null;
  };
  setMidiActivityCallback(() => {
    if (!ledEl) ledEl = document.getElementById("midi-led");
    if (!ledEl) return;
    ledEl.classList.add("is-on");
    if (ledTimer !== null) clearTimeout(ledTimer);
    ledTimer = setTimeout(clearLed, 90);
  });

  const devSelect = document.getElementById("midi-device") as HTMLSelectElement | null;
  if (devSelect) {
    devSelect.addEventListener("change", () => {
      setSelectedMidiDevice(devSelect.value);
    });
  }

  const chSelect = document.getElementById("midi-channel") as HTMLSelectElement | null;
  if (chSelect) {
    chSelect.addEventListener("change", () => {
      setSelectedMidiChannel(parseInt(chSelect.value, 10) || 0);
    });
  }

  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement)?.closest?.("[data-action]") as HTMLElement | null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (action === "synth-set") {
      if (isLearnMode()) return;
      const param = btn.getAttribute("data-param");
      const val = btn.getAttribute("data-value");
      if (param && val !== null) {
        setSynthParam(param, val);
      }
    } else if (action === "synth-preset") {
      const presetId = btn.getAttribute("data-preset");
      if (presetId) {
        applySynthPreset(presetId);
        // Use the C at the start of current visible range
        const previewNote = getBaseMidi();
        noteOn(previewNote);
        setTimeout(() => noteOff(previewNote), 500);
      }
    } else if (action === "midi-enable") {
      requestMidi();
    } else if (action === "midi-learn") {
      toggleLearnMode();
    } else if (action === "synth-panic") {
      allNotesOff();
    }
  });

  initSkinPicker();
  updateMidiBarDOM();
}
