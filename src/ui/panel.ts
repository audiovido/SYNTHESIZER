/**
 * SY-1 UI — Panel: rendered from the active machine's definition.
 *
 * Top bar: machine menu, scope, preset browser, tempo (when the machine uses
 * it), engine/MIDI controls. Then page tabs (small screens) and the machine's
 * sections. The drum machine adds custom sections (pattern, steps, sound).
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
import {
  allNotesOff,
  applySynthPreset,
  getMachine,
  getMachines,
  getSynthPatch,
  getSynthPresetId,
  noteOff,
  noteOn,
  onMachineChange,
  onParamChange,
  onPresetChange,
  prepareAudio,
  setMachine,
  setSynthParam,
  stepPreset,
  switchEngine
} from "../engine/synth";
import { getEngine, getHQState, onEngineChange } from "../engine/hq";
import { getTempo, onTempoChange, setTempo, tapTempo } from "../engine/tempo";
import {
  clearPattern,
  DRUM_LABELS,
  DRUM_NOTES,
  DRUM_VOICES,
  DrumVoice,
  getPattern,
  getPatternIndex,
  isDrumPlaying,
  onDrumChange,
  onDrumStep,
  selectPattern,
  setPatternLength,
  startDrums,
  stopDrums,
  toggleStep,
  triggerDrum
} from "../engine/drums";
import type { ControlDef, SectionDef } from "../machines/types";
import { getBaseMidi } from "./keyboard";
import { renderSynthKnob, updateMidiLearnDOM, updateSynthControlDOM } from "./knob";

// ------------------------------------------------------------ controls ----
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

export function renderControl(c: ControlDef): string {
  const patch = getSynthPatch();
  if (c.kind === "choice") return renderSynthChoice(c.key, c.options);
  if (c.kind === "toggles") {
    return `<div class="synth-choice synth-toggles">` + c.items.map((it) => {
      const on = it.on || "on";
      const off = it.off || "off";
      const active = patch[it.key] === on;
      return `<button type="button" class="synth-choice-btn synth-toggle-btn ${active ? "active" : ""}" data-action="synth-toggle" data-param="${it.key}" data-on="${on}" data-off="${off}" aria-pressed="${active}" title="${escapeHtml(it.title || it.label)}">${it.label}</button>`;
    }).join("") + `</div>`;
  }
  if (c.kind === "select") {
    return `<label class="synth-param-select-wrap"><span>${escapeHtml(c.label)}</span><select class="synth-midi-select synth-param-select" data-param="${c.key}" aria-label="${escapeHtml(c.label)}">` +
      c.options.map(([v, t]) => `<option value="${v}"${patch[c.key] === v ? " selected" : ""}>${escapeHtml(t)}</option>`).join("") +
      `</select></label>`;
  }
  // knob row
  const cls = "sk-row" + (c.small ? " sk-row-small" : "");
  return (c.caption ? `<div class="sk-caption">${escapeHtml(c.caption)}</div>` : "") +
    `<div class="${cls}">${c.knobs.map(([k, l]) => renderSynthKnob(k, l)).join("")}</div>`;
}

// --------------------------------------------------------- drum sections ----
let drumVoice: DrumVoice = "kick";
let accentMode = false;

function renderDrumTransport(): string {
  const pat = getPattern();
  const idx = getPatternIndex();
  const playing = isDrumPlaying();
  return `<div class="drum-transport">
      <button type="button" class="drum-play ${playing ? "active" : ""}" data-action="drum-play" aria-pressed="${playing}">${playing ? "■ Stop" : "▶ Play"}</button>
      <div class="drum-slots" role="group" aria-label="Pattern">${Array.from({ length: 8 }, (_, i) =>
        `<button type="button" class="drum-slot ${i === idx ? "active" : ""}" data-action="drum-pattern" data-index="${i}" title="Pattern ${"ABCDEFGH"[i]}">${"ABCDEFGH"[i]}</button>`).join("")}</div>
    </div>
    <div class="drum-transport drum-transport-2">
      <div class="synth-choice drum-len">
        <button type="button" class="synth-choice-btn ${pat.len === 16 ? "active" : ""}" data-action="drum-len" data-len="16" title="16 steps (4/4)">16</button>
        <button type="button" class="synth-choice-btn ${pat.len === 12 ? "active" : ""}" data-action="drum-len" data-len="12" title="12 steps (6/8)">12</button>
      </div>
      <button type="button" class="synth-choice-btn drum-acc ${accentMode ? "active" : ""}" data-action="drum-accent" aria-pressed="${accentMode}" title="Tap steps to add or remove accents">ACCENT</button>
      <button type="button" class="synth-choice-btn" data-action="drum-clear" title="Clear this pattern">CLEAR</button>
    </div>`;
}

function renderDrumSteps(): string {
  const pat = getPattern();
  const row = pat.steps[drumVoice];
  const voices = `<div class="drum-voices" role="group" aria-label="Drum voice">${DRUM_VOICES.map((v) =>
    `<button type="button" class="drum-voice-btn ${v === drumVoice ? "active" : ""}" data-action="drum-voice" data-voice="${v}">${DRUM_LABELS[v]}</button>`).join("")}</div>`;
  const steps = `<div class="drum-steps" style="--len:${pat.len}">${Array.from({ length: pat.len }, (_, i) => {
    const s = row[i];
    return `<button type="button" class="drum-step${s ? " on" : ""}${s === 2 ? " accent" : ""}${i % (pat.len === 12 ? 3 : 4) === 0 ? " beat" : ""}" data-action="drum-step" data-index="${i}" aria-pressed="${!!s}" aria-label="Step ${i + 1}"></button>`;
  }).join("")}</div>`;
  return voices + steps;
}

function renderDrumVoice(): string {
  const v = drumVoice;
  return `<div class="drum-voice-name">${DRUM_LABELS[v]}</div><div class="sk-row">${
    renderSynthKnob(v + "Tune", "TUNE") + renderSynthKnob(v + "Decay", "DECAY") +
    renderSynthKnob(v + "Tone", "TONE") + renderSynthKnob(v + "Level", "LEVEL")}</div>`;
}

function renderCustom(id: string): string {
  if (id === "drum-transport") return renderDrumTransport();
  if (id === "drum-steps") return renderDrumSteps();
  if (id === "drum-voice") return renderDrumVoice();
  return "";
}

function renderSection(sec: SectionDef, index: number): string {
  const span = (sec.span && sec.span > 1 ? ` sec-span-${sec.span}` : "") + (sec.wide ? " sec-wide" : "");
  const body = sec.custom
    ? `<div class="synth-custom" data-custom="${sec.custom}">${renderCustom(sec.custom)}</div>`
    : sec.controls.map(renderControl).join("");
  return `<section data-page="${sec.page}" data-sec="${index}" class="synth-sec${span}${sec.custom ? " synth-sec-custom" : ""}"><h4>${escapeHtml(sec.title)}</h4>${body}</section>`;
}

function refreshCustom(id: string): void {
  const el = document.querySelector(`.synth-custom[data-custom="${id}"]`);
  if (el) el.innerHTML = renderCustom(id);
}

// ---------------------------------------------------------- top bar etc ----
function renderChannelOptions(): string {
  const cur = getSelectedMidiChannel();
  let html = `<option value="0"${cur === 0 ? " selected" : ""}>Omni</option>`;
  for (let ch = 1; ch <= 16; ch++) html += `<option value="${ch}"${cur === ch ? " selected" : ""}>Ch ${ch}</option>`;
  return html;
}

function renderDeviceOptions(): string {
  const inputs = getMidiInputs();
  const cur = getSelectedMidiDevice();
  let html = `<option value=""${cur === "" ? " selected" : ""}>All inputs</option>`;
  let found = cur === "";
  inputs.forEach((inp) => {
    const sel = inp.id === cur;
    if (sel) found = true;
    html += `<option value="${escapeHtml(inp.id)}"${sel ? " selected" : ""}>${escapeHtml(inp.name)}</option>`;
  });
  if (!found && cur !== "") html += `<option value="${escapeHtml(cur)}" selected>(Disconnected)</option>`;
  return html;
}

function renderPresetOptions(): string {
  const m = getMachine();
  const cur = getSynthPresetId();
  const groups: Record<string, string[]> = {};
  m.presets.forEach((p) => {
    (groups[p.group] = groups[p.group] || []).push(
      `<option value="${p.id}"${cur === p.id ? " selected" : ""}>${escapeHtml(p.name)}</option>`);
  });
  let html = Object.keys(groups).map((g) => `<optgroup label="${escapeHtml(g)}">${groups[g].join("")}</optgroup>`).join("");
  if (!m.presets.some((p) => p.id === cur)) html += `<option value="custom" selected disabled>Custom</option>`;
  return html;
}

function renderMachineOptions(): string {
  const cur = getMachine().id;
  return getMachines().map((m) =>
    `<option value="${m.id}"${m.id === cur ? " selected" : ""}>${escapeHtml(m.name)} · ${escapeHtml(m.role)}</option>`).join("");
}

// Small screens show the panel as pages (tabs); large screens show every section.
const PAGE_KEY = (id: string) => `sy1.m.${id}.page`;
let currentPage = "";

export function setPanelPage(id: string): void {
  const m = getMachine();
  if (!m.pages.some((p) => p.id === id)) id = m.pages[0].id;
  currentPage = id;
  const panel = document.querySelector(".synth-panel") as HTMLElement | null;
  if (panel) {
    panel.setAttribute("data-page", id);
    // lets CSS arrange 3-section pages on phones, whatever the machine
    const secs = Array.from(panel.querySelectorAll<HTMLElement>(`.synth-sec[data-page="${id}"]`));
    panel.setAttribute("data-count", String(secs.length));
    panel.querySelectorAll(".synth-sec").forEach((el) => {
      el.classList.toggle("is-on-page", el.getAttribute("data-page") === id);
      el.classList.remove("is-page-first");
    });
    if (secs[0]) secs[0].classList.add("is-page-first");
  }
  document.querySelectorAll(".synth-tab").forEach((t) => {
    const on = t.getAttribute("data-page") === id;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  try { localStorage.setItem(PAGE_KEY(m.id), id); } catch (e) {}
}

function stepPanelPage(dir: number): void {
  const pages = getMachine().pages;
  const i = pages.findIndex((p) => p.id === currentPage);
  const next = pages[Math.max(0, Math.min(pages.length - 1, i + dir))];
  if (next) setPanelPage(next.id);
}

function tabsVisible(): boolean {
  const tabs = document.querySelector(".synth-tabs") as HTMLElement | null;
  return !!tabs && getComputedStyle(tabs).display !== "none";
}

function previewPreset(presetId: string): void {
  applySynthPreset(presetId);
  const m = getMachine();
  // no preview for drums, arpeggios or HOLD patches (a held drone would never stop)
  const p = getSynthPatch();
  if (m.kind === "drums" || p.arpOn === "on" || p.hold === "on") return;
  const note = getBaseMidi() + 12;
  noteOn(note);
  setTimeout(() => noteOff(note), 450);
}

export function renderSynthPanelHtml(): string {
  const m = getMachine();
  const tempo = m.tempo
    ? `<div class="synth-tempo" role="group" aria-label="Tempo">
        <button type="button" class="synth-midi-btn" data-action="tempo-down" aria-label="Slower">−</button>
        <button type="button" class="synth-tempo-val" id="tempo-val" data-action="tempo-tap" title="Tempo (BPM). Tap in time to set it.">${getTempo()}</button>
        <button type="button" class="synth-midi-btn" data-action="tempo-up" aria-label="Faster">+</button>
        <button type="button" class="synth-midi-btn tempo-tap-btn" data-action="tempo-tap" title="Tap in time to set the tempo">TAP</button>
      </div>`
    : "";
  return `
    <div class="synth-panel" dir="ltr" data-machine="${m.id}">
      <div class="synth-top">
        <label class="synth-brand"><span class="synth-brand-maker">SY-1 </span><select class="synth-machine-select" id="machine-select" aria-label="Instrument">${renderMachineOptions()}</select></label>
        <canvas class="synth-scope" width="320" height="56" aria-hidden="true"></canvas>
        <div class="synth-preset-nav">
          <button type="button" class="synth-midi-btn" data-action="preset-prev" aria-label="Previous preset">◀</button>
          <select class="synth-midi-select synth-preset-select" id="preset-select" aria-label="Preset">${renderPresetOptions()}</select>
          <button type="button" class="synth-midi-btn" data-action="preset-next" aria-label="Next preset">▶</button>
        </div>
        <div class="synth-midi-bar">
          ${tempo}
          <button type="button" class="synth-midi-btn" id="engine-btn" data-action="engine-toggle" aria-pressed="false">HQ</button>
          <button type="button" class="synth-midi-btn" id="midi-btn" data-action="midi-enable">MIDI</button>
          <span class="midi-led" id="midi-led" title="MIDI Activity" aria-hidden="true"></span>
          <select class="synth-midi-select" id="midi-device" aria-label="MIDI Input Device" hidden>${renderDeviceOptions()}</select>
          <select class="synth-midi-select" id="midi-channel" aria-label="MIDI Channel" hidden>${renderChannelOptions()}</select>
          <button type="button" class="synth-midi-btn" id="midi-learn-btn" data-action="midi-learn" title="Click LEARN, click a knob, then move a MIDI CC">LEARN</button>
          <button type="button" class="synth-midi-btn synth-panic-btn" id="midi-panic-btn" data-action="synth-panic" title="Release all notes">PANIC</button>
          <span class="synth-midi-msg" id="midi-msg" role="status" aria-live="polite"></span>
        </div>
      </div>
      <nav class="synth-tabs" role="tablist" aria-label="Panel pages">${m.pages.map((pg) =>
        `<button type="button" class="synth-tab" role="tab" data-action="synth-page" data-page="${pg.id}">${escapeHtml(pg.label)}</button>`).join("")}</nav>
      <div class="synth-sections">
        ${m.sections.map(renderSection).join("")}
      </div>
      <div class="synth-hint">Drag a knob up/down (or scroll / arrow keys) · double-click to reset · right-click (or long-press in LEARN) unmaps CC · keys A W S E D F T G Y H U J K · Z/X = octave</div>
    </div>`;
}

export function updateSynthPresetDOM(): void {
  const sel = document.getElementById("preset-select") as HTMLSelectElement | null;
  if (sel) sel.innerHTML = renderPresetOptions();
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
    if (enabled) { devSelect.innerHTML = renderDeviceOptions(); devSelect.value = getSelectedMidiDevice(); }
  }
  if (chSelect) {
    chSelect.hidden = !enabled;
    if (enabled) chSelect.value = String(getSelectedMidiChannel());
  }
  if (learnBtn) learnBtn.classList.toggle("active", isLearnMode());
  if (msgEl) {
    const statusMsg = getMidiStatusMessage();
    if (statusMsg) msgEl.textContent = statusMsg;
    else if (isLearnMode()) {
      const target = getLearnTargetParam();
      msgEl.textContent = target ? `Move a CC to map ${target}…` : "Click a knob, then move a CC…";
    } else msgEl.textContent = "";
  }
  updateMidiLearnDOM();
}

function updateEngineDOM(): void {
  const btn = document.getElementById("engine-btn");
  if (!btn) return;
  const wantHQ = getEngine() === "hq";
  const failed = getHQState() === "failed";
  btn.classList.toggle("active", wantHQ && !failed);
  btn.classList.toggle("is-unavailable", failed);
  btn.setAttribute("aria-pressed", wantHQ && !failed ? "true" : "false");
  btn.title = failed
    ? "HQ engine is not available in this browser. Playing with the Classic engine."
    : wantHQ
      ? "HQ engine on (unison, glide, tunings, ornaments). Click to use the Classic engine."
      : "Classic engine on (unison, tunings and ornaments are ignored). Click to use the HQ engine.";
}

/** Re-render registered overlay panels (machine switch) and bind element listeners. */
const renderHooks = new Set<() => void>();
export function setPanelRenderHook(fn: () => void): void {
  renderHooks.add(fn);
}

export function renderPanel(): void {
  const container = document.getElementById("sy1-panel");
  if (!container) return;
  container.innerHTML = renderSynthPanelHtml();
  bindPanelElements();
  let page = "";
  try { page = localStorage.getItem(PAGE_KEY(getMachine().id)) || ""; } catch (e) {}
  setPanelPage(page);
  updateEngineDOM();
  updateMidiBarDOM();
  renderHooks.forEach((fn) => fn());
}

function bindPanelElements(): void {
  const devSelect = document.getElementById("midi-device") as HTMLSelectElement | null;
  if (devSelect) devSelect.addEventListener("change", () => setSelectedMidiDevice(devSelect.value));
  const chSelect = document.getElementById("midi-channel") as HTMLSelectElement | null;
  if (chSelect) chSelect.addEventListener("change", () => setSelectedMidiChannel(parseInt(chSelect.value, 10) || 0));
  const presetSel = document.getElementById("preset-select") as HTMLSelectElement | null;
  if (presetSel) presetSel.addEventListener("change", () => { previewPreset(presetSel.value); presetSel.blur(); });
  const machineSel = document.getElementById("machine-select") as HTMLSelectElement | null;
  if (machineSel) machineSel.addEventListener("change", () => { setMachine(machineSel.value); });
  document.querySelectorAll<HTMLSelectElement>(".synth-param-select").forEach((sel) => {
    sel.addEventListener("change", () => { setSynthParam(sel.getAttribute("data-param")!, sel.value); sel.blur(); });
  });

  // Swipe left/right on empty panel space to change page (small screens only).
  const sections = document.querySelector(".synth-sections") as HTMLElement | null;
  if (sections) {
    let swipe: { x: number; y: number; id: number } | null = null;
    sections.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement;
      if (!tabsVisible() || t.closest(".sk, button, select")) return;
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    sections.addEventListener("pointerup", (e) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepPanelPage(dx < 0 ? 1 : -1);
    });
    sections.addEventListener("pointercancel", () => { swipe = null; });
  }
}

export function initPanelInteractions(): void {
  onParamChange((key) => updateSynthControlDOM(key));
  onPresetChange(() => updateSynthPresetDOM());
  onMidiStateChange(() => updateMidiBarDOM());
  onEngineChange(updateEngineDOM);
  onMachineChange(() => renderPanel());
  onTempoChange((bpm) => {
    document.querySelectorAll(".synth-tempo-val").forEach((el) => (el.textContent = String(bpm)));
  });
  onDrumChange(() => {
    refreshCustom("drum-transport");
    refreshCustom("drum-steps");
  });
  onDrumStep((s) => {
    document.querySelectorAll(".drum-step.playing").forEach((el) => el.classList.remove("playing"));
    if (s >= 0) {
      const el = document.querySelector(`.drum-step[data-index="${s}"]`);
      if (el) el.classList.add("playing");
    }
  });

  // Blink MIDI LED without per-message DOM queries or object allocations
  let ledEl: HTMLElement | null = null;
  let ledTimer: ReturnType<typeof setTimeout> | null = null;
  const clearLed = () => { if (ledEl) ledEl.classList.remove("is-on"); ledTimer = null; };
  setMidiActivityCallback(() => {
    if (!ledEl || !ledEl.isConnected) ledEl = document.getElementById("midi-led");
    if (!ledEl) return;
    ledEl.classList.add("is-on");
    if (ledTimer !== null) clearTimeout(ledTimer);
    ledTimer = setTimeout(clearLed, 90);
  });

  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement)?.closest?.("[data-action]") as HTMLElement | null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    switch (action) {
      case "synth-set": {
        if (isLearnMode()) return;
        const param = btn.getAttribute("data-param");
        const val = btn.getAttribute("data-value");
        if (param && val !== null) setSynthParam(param, val);
        break;
      }
      case "synth-toggle": {
        const param = btn.getAttribute("data-param")!;
        const on = btn.getAttribute("data-on")!;
        const off = btn.getAttribute("data-off")!;
        setSynthParam(param, getSynthPatch()[param] === on ? off : on);
        break;
      }
      case "synth-page": {
        const page = btn.getAttribute("data-page");
        if (page) setPanelPage(page);
        break;
      }
      case "preset-prev": stepPreset(-1); break;
      case "preset-next": stepPreset(1); break;
      case "tempo-down": setTempo(getTempo() - 1); break;
      case "tempo-up": setTempo(getTempo() + 1); break;
      case "tempo-tap": tapTempo(); break;
      case "engine-toggle": switchEngine(getEngine() === "hq" ? "classic" : "hq"); break;
      case "midi-enable": requestMidi(); break;
      case "midi-learn": toggleLearnMode(); break;
      case "synth-panic": stopDrums(); allNotesOff(); break;
      // drum machine
      case "drum-play":
        if (isDrumPlaying()) stopDrums();
        else { prepareAudio(); startDrums(); }
        break;
      case "drum-pattern": selectPattern(Number(btn.getAttribute("data-index"))); break;
      case "drum-len": setPatternLength(Number(btn.getAttribute("data-len"))); break;
      case "drum-accent": accentMode = !accentMode; refreshCustom("drum-transport"); break;
      case "drum-clear": clearPattern(); break;
      case "drum-voice": {
        drumVoice = btn.getAttribute("data-voice") as DrumVoice;
        refreshCustom("drum-steps");
        refreshCustom("drum-voice");
        triggerDrum(drumVoice, 0.9);
        break;
      }
      case "drum-step": toggleStep(drumVoice, Number(btn.getAttribute("data-index")), accentMode); break;
      default: break;
    }
  });
}

/** Pads trigger drums and select the voice for editing. */
export function selectDrumVoiceForNote(midi: number): void {
  const v = (Object.keys(DRUM_NOTES) as DrumVoice[]).find((k) => DRUM_NOTES[k] === midi);
  if (v && v !== drumVoice) {
    drumVoice = v;
    refreshCustom("drum-steps");
    refreshCustom("drum-voice");
  }
}
