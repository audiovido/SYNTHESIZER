/**
 * SY-1 UI — master volume knob, take recorder button and the "DAW" sheet
 * (audio output device, MIDI out, follow DAW clock, takes, setup guide).
 */

import { canChooseOutput, getMasterVolume, getOutputDevice, masterGainFor, onMasterVolumeChange, setMasterVolume, setOutputDevice } from "../engine/bus";
import {
  canRecord,
  enableMidiOut,
  getFollowClock,
  getLastTake,
  getMidiOut,
  getMidiOutChannel,
  getMidiOutError,
  getMidiOutputs,
  getTakeSeconds,
  hasMidiOutAccess,
  isClockActive,
  isClockRunning,
  isMidiOutSupported,
  isRecording,
  onDawChange,
  setFollowClock,
  setMidiOut,
  setMidiOutChannel,
  startTake,
  stopTake
} from "../engine/daw";
import { isMidiEnabled, requestMidi } from "../engine/midi";
import { escapeHtml } from "../engine/params";
import { allNotesOff, prepareAudio } from "../engine/synth";
import { getTempo } from "../engine/tempo";

// ---------------------------------------------------------- master knob ----
function dbText(v: number): string {
  const g = masterGainFor(v);
  if (g <= 0.00001) return "−∞ dB";
  const db = 20 * Math.log10(g);
  return Math.abs(db) < 0.05 ? "0 dB" : `${db.toFixed(1).replace("-", "−")} dB`;
}

export function renderMasterKnob(): string {
  const v = getMasterVolume();
  return `<div class="mvol" id="mvol" role="slider" tabindex="0" aria-label="Master volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}" aria-valuetext="${dbText(v)}" title="Master volume ${dbText(v)} · drag, scroll or arrow keys · double-click = 0 dB">
    <span class="mvol-dial" style="--n:${v.toFixed(4)}"><span class="mvol-ind"></span></span>
    <span class="mvol-lbl">VOL</span>
    <span class="mvol-val" aria-hidden="true">${dbText(v)}</span>
  </div>`;
}

export function renderRecButton(): string {
  const rec = isRecording();
  return `<button type="button" class="synth-rec-btn${rec ? " is-rec" : ""}" id="rec-btn" data-daw="rec" aria-pressed="${rec}" title="${rec ? "Stop recording" : "Record a take (WAV + MIDI)"}"${canRecord() ? "" : " disabled"}>
    <span class="rec-dot" aria-hidden="true"></span><span class="rec-time">${rec ? timeText(getTakeSeconds()) : "REC"}</span>
  </button>`;
}

function syncMasterDOM(v: number): void {
  document.querySelectorAll<HTMLElement>(".mvol").forEach((el) => {
    el.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    el.setAttribute("aria-valuetext", dbText(v));
    el.title = `Master volume ${dbText(v)} · drag, scroll or arrow keys · double-click = 0 dB`;
    const dial = el.querySelector<HTMLElement>(".mvol-dial");
    if (dial) dial.style.setProperty("--n", v.toFixed(4));
    const val = el.querySelector(".mvol-val");
    if (val) val.textContent = dbText(v);
  });
  document.querySelectorAll<HTMLInputElement>(".daw-vol-range").forEach((r) => { r.value = String(Math.round(v * 1000)); });
  document.querySelectorAll(".daw-vol-val").forEach((el) => (el.textContent = dbText(v)));
}

function initMasterKnob(): void {
  let drag: { id: number; y: number; x: number; v: number; el: HTMLElement } | null = null;
  document.addEventListener("pointerdown", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".mvol");
    if (!el) return;
    e.preventDefault();
    drag = { id: e.pointerId, y: e.clientY, x: e.clientX, v: getMasterVolume(), el };
    el.classList.add("is-drag");
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    el.focus({ preventScroll: true });
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = (drag.y - e.clientY + (e.clientX - drag.x) * 0.5) / (e.shiftKey ? 600 : 160);
    setMasterVolume(drag.v + d);
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.el.classList.remove("is-drag");
    drag = null;
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  document.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).closest(".mvol")) setMasterVolume(1);
  });
  document.addEventListener("wheel", (e) => {
    const el = (e.target as HTMLElement).closest(".mvol");
    if (!el) return;
    e.preventDefault();
    setMasterVolume(getMasterVolume() - Math.sign(e.deltaY) * 0.03);
  }, { passive: false });
  document.addEventListener("keydown", (e) => {
    const el = (e.target as HTMLElement)?.closest?.(".mvol");
    if (!el) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    let v: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") v = getMasterVolume() + step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") v = getMasterVolume() - step;
    else if (e.key === "Home") v = 0;
    else if (e.key === "End") v = 1;
    if (v === null) return;
    e.preventDefault();
    e.stopPropagation();
    setMasterVolume(v);
  }, true);
  onMasterVolumeChange(syncMasterDOM);
}

// -------------------------------------------------------------- takes ----
function timeText(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

let recTimer: ReturnType<typeof setInterval> | null = null;
let takeUrls: { wav: string; mid: string } | null = null;
let toastOpen = false;

function syncRecDOM(): void {
  const rec = isRecording();
  document.querySelectorAll<HTMLButtonElement>("[data-daw='rec']").forEach((b) => {
    b.classList.toggle("is-rec", rec);
    b.setAttribute("aria-pressed", String(rec));
    b.title = rec ? "Stop recording" : "Record a take (WAV + MIDI)";
    const t = b.querySelector(".rec-time");
    if (t) t.textContent = rec ? timeText(getTakeSeconds()) : b.classList.contains("daw-rec-big") ? "Record" : "REC";
  });
}

async function toggleRecord(): Promise<void> {
  if (isRecording()) {
    await stopTake();
    if (recTimer) clearInterval(recTimer);
    recTimer = null;
    syncRecDOM();
    makeTakeUrls();
    toastOpen = !sheetOpen;
    renderToast();
    if (sheetOpen) renderSheet();
    return;
  }
  prepareAudio();
  const ok = await startTake();
  if (!ok) return;
  toastOpen = false;
  renderToast();
  recTimer = setInterval(syncRecDOM, 250);
  syncRecDOM();
  if (sheetOpen) renderSheet();
}

function makeTakeUrls(): void {
  if (takeUrls) {
    URL.revokeObjectURL(takeUrls.wav);
    if (takeUrls.mid) URL.revokeObjectURL(takeUrls.mid);
  }
  const t = getLastTake();
  takeUrls = t ? { wav: URL.createObjectURL(t.wav), mid: t.mid ? URL.createObjectURL(t.mid) : "" } : null;
}

function takeFiles(): string {
  const t = getLastTake();
  if (!t || !takeUrls) return "";
  const name = escapeHtml(t.name);
  const wav = `<a class="daw-file" href="${takeUrls.wav}" download="${name}.wav" draggable="true" data-dl="audio/wav:${name}.wav:${takeUrls.wav}" title="Save, or drag straight into your DAW"><b>WAV</b><span>24-bit · ${timeText(t.seconds)}</span></a>`;
  const mid = takeUrls.mid
    ? `<a class="daw-file" href="${takeUrls.mid}" download="${name}.mid" draggable="true" data-dl="audio/midi:${name}.mid:${takeUrls.mid}" title="Save, or drag straight into your DAW"><b>MIDI</b><span>${t.notes} note${t.notes === 1 ? "" : "s"} · ${t.bpm} BPM</span></a>`
    : `<span class="daw-file is-empty"><b>MIDI</b><span>no notes</span></span>`;
  return wav + mid;
}

function renderToast(): void {
  document.querySelectorAll(".daw-toast").forEach((el) => el.remove());
  if (!toastOpen || !getLastTake()) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="daw-toast" role="status">
    <span class="daw-toast-title">Take ready</span>
    <span class="daw-toast-files">${takeFiles()}</span>
    <button type="button" class="daw-x" data-daw="toast-close" aria-label="Close">×</button>
  </div>`);
}

// --------------------------------------------------------------- sheet ----
let sheetOpen = false;
let guide: "ableton" | "logic" = "ableton";
let outputs: { id: string; label: string }[] = [];
let clockPoll: ReturnType<typeof setInterval> | null = null;

async function loadOutputs(): Promise<void> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    outputs = devs.filter((d) => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` }));
  } catch (e) {
    outputs = [];
  }
}

async function revealNames(): Promise<void> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch (e) {}
  await loadOutputs();
  renderSheet();
}

const opt = (v: string, label: string, sel: boolean) => `<option value="${escapeHtml(v)}"${sel ? " selected" : ""}>${escapeHtml(label)}</option>`;

function outputCard(): string {
  const v = getMasterVolume();
  const choose = canChooseOutput();
  const cur = getOutputDevice();
  const noNames = outputs.length > 0 && outputs.every((o) => /^Output \d+$/.test(o.label));
  const known = !cur || outputs.some((o) => o.id === cur);
  return `<section class="daw-card">
    <h3>Output</h3>
    <label class="daw-row"><span class="daw-k">Master volume</span>
      <input type="range" class="daw-vol-range" min="0" max="1000" value="${Math.round(v * 1000)}" aria-label="Master volume">
      <span class="daw-vol-val">${dbText(v)}</span></label>
    ${choose ? `<label class="daw-row"><span class="daw-k">Audio output</span>
      <select class="daw-select" data-daw-sel="sink">${opt("", "System default", !cur)}${outputs.map((o) => opt(o.id, o.label, o.id === cur)).join("")}${known ? "" : opt(cur, "Saved device (not connected)", true)}</select></label>
      ${noNames ? `<button type="button" class="daw-link" data-daw="names">Show device names</button><p class="daw-note">The browser hides device names until it is allowed to use audio once. Nothing is recorded.</p>` : ""}
      <p class="daw-note">Pick a virtual cable (BlackHole, Loopback, VB-Cable) to send SY-1 straight into an audio track of your DAW.</p>`
      : `<p class="daw-note">This browser always plays through the system output. Chrome or Edge can send SY-1 to a chosen device (for example a virtual cable into your DAW).</p>`}
  </section>`;
}

function midiCard(): string {
  if (!isMidiOutSupported()) {
    return `<section class="daw-card"><h3>MIDI out</h3><p class="daw-note">MIDI needs Chrome or Edge on a computer.</p></section>`;
  }
  const err = getMidiOutError();
  if (!hasMidiOutAccess()) {
    return `<section class="daw-card"><h3>MIDI out</h3>
      <p class="daw-note">Every note SY-1 plays (keys, arpeggiator, drum patterns) goes to a MIDI port, so a MIDI track in your DAW can record it.</p>
      <button type="button" class="daw-btn" data-daw="midi-on">Turn on MIDI out</button>
      ${err ? `<p class="daw-note is-warn">${escapeHtml(err)}</p>` : ""}</section>`;
  }
  const ports = getMidiOutputs();
  const cur = getMidiOut();
  const ch = getMidiOutChannel();
  return `<section class="daw-card"><h3>MIDI out</h3>
    <label class="daw-row"><span class="daw-k">Port</span>
      <select class="daw-select" data-daw-sel="port">${opt("", "Off", !cur)}${ports.map((p) => opt(p.id, p.name, p.id === cur)).join("")}</select></label>
    <label class="daw-row"><span class="daw-k">Channel</span>
      <select class="daw-select daw-select-sm" data-daw-sel="ch">${Array.from({ length: 16 }, (_, i) => opt(String(i + 1), String(i + 1), i + 1 === ch)).join("")}</select></label>
    ${ports.length ? "" : `<p class="daw-note is-warn">No MIDI ports yet. Create one (IAC Driver on Mac, loopMIDI on Windows): see the setup below.</p>`}
    <p class="daw-note">Drum machines send General MIDI drum notes (kick 36, snare 38, hats 42 / 46…). Notes that come in from your DAW are not sent back.</p>
  </section>`;
}

function clockStatus(): string {
  return !isMidiEnabled() ? "Turn on MIDI input to hear the clock" : isClockRunning() ? `Playing with the DAW · ${getTempo()} BPM` : isClockActive() ? `Clock received · ${getTempo()} BPM · waiting for Play` : "Waiting for MIDI clock from the DAW…";
}

function syncCard(): string {
  const on = getFollowClock();
  const status = on ? clockStatus() : "";
  return `<section class="daw-card"><h3>Sync</h3>
    <button type="button" class="daw-switch${on ? " is-on" : ""}" role="switch" aria-checked="${on}" data-daw="clock"><span class="daw-knob"></span>Follow DAW clock</button>
    ${on ? `<p class="daw-status${isClockRunning() ? " is-live" : ""}">${escapeHtml(status)}</p>` : ""}
    <p class="daw-note">Play and Stop in the DAW start and stop the drum patterns, and the tempo follows the DAW.</p>
  </section>`;
}

function takeCard(): string {
  const rec = isRecording();
  return `<section class="daw-card"><h3>Record a take</h3>
    <button type="button" class="synth-rec-btn daw-rec-big${rec ? " is-rec" : ""}" data-daw="rec" aria-pressed="${rec}"${canRecord() ? "" : " disabled"}><span class="rec-dot" aria-hidden="true"></span><span class="rec-time">${rec ? timeText(getTakeSeconds()) : "Record"}</span></button>
    ${getLastTake() && !rec ? `<div class="daw-files">${takeFiles()}</div>` : ""}
    <p class="daw-note">Records exactly what you hear (stereo WAV, before the volume knob) plus a MIDI file of the same notes, both starting at the same moment. Drag them into Ableton or Logic.</p>
  </section>`;
}

const GUIDE: Record<"ableton" | "logic", { title: string; steps: string[] }[]> = {
  ableton: [
    { title: "Record the sound", steps: [
      "Mac: install the free BlackHole 2ch. Windows: install VB-Cable.",
      "In SY-1 Output, choose BlackHole 2ch (or CABLE Input).",
      "Live → Settings → Audio: Audio Input Device = BlackHole (Mac tip: an Aggregate Device of your interface + BlackHole keeps your speakers working).",
      "Audio track: Audio From = Ext. In 1/2, Monitor = In, arm and record."
    ] },
    { title: "Record the notes", steps: [
      "Mac: Audio MIDI Setup → Window → Show MIDI Studio → IAC Driver → tick “Device is online”. Windows: install loopMIDI and add a port.",
      "In SY-1 MIDI out, choose IAC Driver Bus 1 (or the loopMIDI port).",
      "Live → Settings → Link, Tempo & MIDI: Track = On for that input.",
      "MIDI track: MIDI From = that port, arm and record. Or skip the port and drag the take's MIDI file in."
    ] },
    { title: "Play in time with Live", steps: [
      "Live → Settings → Link, Tempo & MIDI: Sync = On for the output to the port.",
      "In SY-1 turn on MIDI (Connections button) and Follow DAW clock.",
      "Press Play in Live: the drum pattern starts on the bar at Live's tempo."
    ] }
  ],
  logic: [
    { title: "Record the sound", steps: [
      "Install the free BlackHole 2ch.",
      "In SY-1 Output, choose BlackHole 2ch.",
      "Logic → Settings → Audio → Devices: Input Device = BlackHole (or an Aggregate Device of your interface + BlackHole).",
      "Audio track: Input 1–2, turn on Input Monitoring, arm and record."
    ] },
    { title: "Record the notes", steps: [
      "Audio MIDI Setup → Window → Show MIDI Studio → IAC Driver → tick “Device is online”.",
      "In SY-1 MIDI out, choose IAC Driver Bus 1.",
      "Logic records from every MIDI input: arm a track (an External MIDI track, or any instrument muted) and record.",
      "Or drag the take's MIDI file onto a track."
    ] },
    { title: "Play in time with Logic", steps: [
      "File → Project Settings → Synchronization → MIDI: Transmit MIDI Clock to IAC Driver Bus 1.",
      "In SY-1 turn on MIDI (Connections button) and Follow DAW clock.",
      "Press Play in Logic: the drum pattern starts on the bar at Logic's tempo."
    ] }
  ]
};

function guideCard(): string {
  const tab = (id: "ableton" | "logic", label: string) =>
    `<button type="button" class="mb-tab${guide === id ? " active" : ""}" role="tab" aria-selected="${guide === id}" data-daw-guide="${id}">${label}</button>`;
  return `<section class="daw-card daw-guide"><div class="daw-guide-head"><h3>Setup</h3><div class="mb-tabs" role="tablist" aria-label="DAW">${tab("ableton", "Ableton Live")}${tab("logic", "Logic Pro")}</div></div>
    <div class="daw-steps">${GUIDE[guide].map((g) => `<div class="daw-step"><h4>${g.title}</h4><ol>${g.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol></div>`).join("")}</div>
    <p class="daw-note">The virtual cable and port are set up once; after that SY-1 remembers your choices. Use Chrome or Edge on a computer.</p>
  </section>`;
}

function sheetHtml(): string {
  return `<div class="mb-pop daw-pop" role="dialog" aria-modal="true" aria-label="DAW and recording">
    <div class="mb-sheet daw-sheet">
      <div class="mb-head">
        <div class="mb-title"><b>DAW &amp; recording</b><span>Ableton · Logic · any DAW</span></div>
        <button type="button" class="mb-done" data-daw="close">Done</button>
      </div>
      <div class="daw-body">
        <div class="daw-col">${outputCard()}${takeCard()}</div>
        <div class="daw-col">${midiCard()}${syncCard()}</div>
        ${guideCard()}
      </div>
    </div>
  </div>`;
}

function renderSheet(): void {
  const prev = document.querySelector(".daw-body");
  const scroll = prev ? prev.scrollTop : 0;
  document.querySelectorAll(".daw-pop").forEach((el) => el.remove());
  if (!sheetOpen) return;
  document.body.insertAdjacentHTML("beforeend", sheetHtml());
  const body = document.querySelector(".daw-body");
  if (body) body.scrollTop = scroll;
}

export function setDawSheetOpen(v: boolean): void {
  sheetOpen = v;
  if (clockPoll) clearInterval(clockPoll);
  clockPoll = null;
  if (v) {
    toastOpen = false;
    renderToast();
    clockPoll = setInterval(() => {
      const el = document.querySelector(".daw-status");
      if (el && getFollowClock()) {
        el.textContent = clockStatus();
        el.classList.toggle("is-live", isClockRunning());
      }
    }, 500);
    renderSheet();
    loadOutputs().then(() => { if (sheetOpen) renderSheet(); });
    document.querySelector<HTMLElement>(".daw-pop .mb-done")?.focus();
  } else {
    renderSheet();
  }
}

export function initDawPanel(): void {
  initMasterKnob();
  onDawChange(() => {
    if (sheetOpen) renderSheet();
  });
  try {
    navigator.mediaDevices?.addEventListener?.("devicechange", () => loadOutputs().then(() => { if (sheetOpen) renderSheet(); }));
  } catch (e) {}

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>("[data-daw]");
    if (act) {
      switch (act.dataset.daw) {
        case "open": setDawSheetOpen(true); return;
        case "close": setDawSheetOpen(false); return;
        case "rec": toggleRecord(); return;
        case "toast-close": toastOpen = false; renderToast(); return;
        case "names": revealNames(); return;
        case "midi-on": enableMidiOut(); return;
        case "clock": {
          const on = !getFollowClock();
          setFollowClock(on);
          if (on && !isMidiEnabled()) requestMidi();
          return;
        }
      }
    }
    const g = t.closest<HTMLElement>("[data-daw-guide]");
    if (g) {
      guide = g.dataset.dawGuide === "logic" ? "logic" : "ableton";
      renderSheet();
      return;
    }
    if (sheetOpen && t.closest(".daw-pop") && !t.closest(".daw-sheet")) setDawSheetOpen(false);
  });
  document.addEventListener("change", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>("[data-daw-sel]");
    if (!sel) return;
    if (sel.dataset.dawSel === "sink") {
      prepareAudio();
      setOutputDevice(sel.value).then((ok) => { if (!ok && sel.value) sel.closest(".daw-card")?.insertAdjacentHTML("beforeend", `<p class="daw-note is-warn">This device could not be opened.</p>`); });
    } else if (sel.dataset.dawSel === "port") {
      allNotesOff();
      setMidiOut(sel.value);
    } else if (sel.dataset.dawSel === "ch") {
      setMidiOutChannel(Number(sel.value));
    }
  });
  document.addEventListener("input", (e) => {
    const r = (e.target as HTMLElement).closest<HTMLInputElement>(".daw-vol-range");
    if (r) setMasterVolume(Number(r.value) / 1000);
  });
  // drag a take straight into the DAW (Chrome / Edge)
  document.addEventListener("dragstart", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>(".daw-file[data-dl]");
    if (a && e.dataTransfer) e.dataTransfer.setData("DownloadURL", a.dataset.dl || "");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheetOpen) setDawSheetOpen(false);
  });
}
