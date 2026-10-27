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
  selectLearnParam,
  toggleLearnMode
} from "../engine/midi";
import { escapeHtml } from "../engine/params";
import {
  allNotesOff,
  applySynthPreset,
  getMachine,
  getMachines,
  getModWheel,
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
import { evalOrbitPoint, getVectorLiveXY, setVectorDrawnPath } from "../engine/vector";
import { getEngine, getHQState, onEngineChange } from "../engine/hq";
import { getTempo, onTempoChange, setTempo, tapTempo } from "../engine/tempo";
import {
  clearPattern,
  drumLabel,
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
import { euclidHit, onArpStep } from "../engine/arp";
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
    `<button type="button" class="drum-voice-btn ${v === drumVoice ? "active" : ""}" data-action="drum-voice" data-voice="${v}">${drumLabel(v)}</button>`).join("")}</div>`;
  const steps = `<div class="drum-steps" style="--len:${pat.len}">${Array.from({ length: pat.len }, (_, i) => {
    const s = row[i];
    return `<button type="button" class="drum-step${s ? " on" : ""}${s === 2 ? " accent" : ""}${i % (pat.len === 12 ? 3 : 4) === 0 ? " beat" : ""}" data-action="drum-step" data-index="${i}" aria-pressed="${!!s}" aria-label="Step ${i + 1}"></button>`;
  }).join("")}</div>`;
  return voices + steps;
}

function renderDrumVoice(): string {
  const v = drumVoice;
  return `<div class="drum-voice-name">${drumLabel(v)}</div><div class="sk-row">${
    renderSynthKnob(v + "Tune", "TUNE") + renderSynthKnob(v + "Decay", "DECAY") +
    renderSynthKnob(v + "Tone", "TONE") + renderSynthKnob(v + "Level", "LEVEL")}</div>`;
}

// ------------------------------------------------- Kashan: algorithm LCD ----
// Operator positions (x, y) per algorithm in a 200 x 120 box; edges are [from, to].
const FM_LAYOUT: { pos: [number, number][]; edges: [number, number][]; car: number[] }[] = [
  { pos: [[100, 100], [100, 72], [100, 44], [100, 16]], edges: [[2, 1], [3, 2], [4, 3]], car: [1] },
  { pos: [[100, 100], [100, 66], [70, 28], [130, 28]], edges: [[2, 1], [3, 2], [4, 2]], car: [1] },
  { pos: [[100, 100], [70, 66], [70, 28], [130, 66]], edges: [[2, 1], [3, 2], [4, 1]], car: [1] },
  { pos: [[100, 100], [70, 66], [130, 66], [130, 28]], edges: [[2, 1], [3, 1], [4, 3]], car: [1] },
  { pos: [[70, 100], [70, 58], [130, 100], [130, 58]], edges: [[2, 1], [4, 3]], car: [1, 3] },
  { pos: [[50, 100], [100, 100], [150, 100], [100, 52]], edges: [[4, 1], [4, 2], [4, 3]], car: [1, 2, 3] },
  { pos: [[40, 100], [90, 100], [150, 100], [150, 58]], edges: [[4, 3]], car: [1, 2, 3] },
  { pos: [[34, 100], [78, 100], [122, 100], [166, 100]], edges: [], car: [1, 2, 3, 4] }
];

function renderFmAlgo(): string {
  const n = Math.max(1, Math.min(8, Number(getSynthPatch().fmAlgo) || 1));
  const L = FM_LAYOUT[n - 1];
  const R = 12;
  const lines = L.edges.map(([a, b]) => {
    const [x1, y1] = L.pos[a - 1];
    const [x2, y2] = L.pos[b - 1];
    return `<line x1="${x1}" y1="${y1 + R}" x2="${x2}" y2="${y2 - R}" />`;
  }).join("");
  const outY = 118;
  const outs = L.car.map((c) => { const [x, y] = L.pos[c - 1]; return `<line x1="${x}" y1="${y + R}" x2="${x}" y2="${outY}" />`; }).join("");
  const xs = L.car.map((c) => L.pos[c - 1][0]);
  const bus = `<line x1="${Math.min(...xs) - 8}" y1="${outY}" x2="${Math.max(...xs) + 8}" y2="${outY}" />`;
  const [fx, fy] = L.pos[3];
  const fb = `<path class="fb" d="M ${fx + R} ${fy} C ${fx + 28} ${fy - 4}, ${fx + 28} ${fy - 24}, ${fx} ${fy - R}" />`;
  const ops = L.pos.map(([x, y], i) =>
    `<g class="op${L.car.includes(i + 1) ? " car" : ""}"><rect x="${x - R}" y="${y - R}" width="${R * 2}" height="${R * 2}" rx="2.5" /><text x="${x}" y="${y + 4.5}">${i + 1}</text></g>`).join("");
  const allX = L.pos.map((p) => p[0]);
  const allY = L.pos.map((p) => p[1]);
  const minX = Math.min(...allX) - R - 6;
  const maxX = Math.max(...allX, fx + 22) + R + 6;
  const minY = Math.min(...allY.map((y) => y - R), fy - 22) - 2;
  const maxY = outY + 3;
  const vbW = Math.max(116, maxX - minX);
  const vbH = maxY - minY;
  const vbX = (minX + maxX) / 2 - vbW / 2;
  return `<div class="fm-lcd" role="img" aria-label="Algorithm ${n}">
      <div class="fm-lcd-head"><span>ALGORITHM</span><b>${n}</b></div>
      <svg viewBox="${vbX.toFixed(1)} ${minY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" aria-hidden="true"><g class="wires">${lines}${outs}${bus}${fb}</g>${ops}</svg>
    </div>
    ${renderSynthChoice("fmAlgo", [1, 2, 3, 4, 5, 6, 7, 8].map((k) => [String(k), String(k), `Algorithm ${k}`] as [string, string, string]))}`;
}

// ----------------------------------------------------- Konya: the rings ----
const RING_R = [28, 49, 70];

function renderEuclidRings(): string {
  const p = getSynthPatch();
  let svg = "";
  for (let r = 1; r <= 3; r++) {
    const steps = Math.max(1, Math.round(p[`euc${r}Steps`] ?? 16));
    const pulses = p[`euc${r}Pulses`] ?? 0;
    const rot = p[`euc${r}Rot`] ?? 0;
    const on = p[`euc${r}On`] !== "off";
    const rad = RING_R[r - 1];
    let dots = "";
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
      const x = 80 + Math.cos(a) * rad;
      const y = 80 + Math.sin(a) * rad;
      const hit = euclidHit(steps, pulses, rot, i);
      dots += `<circle class="eu-dot${hit ? " hit" : ""}" data-ring="${r}" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${hit ? 5.2 : 3}" />`;
    }
    svg += `<g class="eu-ring eu-ring-${r}${on ? "" : " is-off"}"><circle class="eu-track" cx="80" cy="80" r="${rad}" />${dots}</g>`;
  }
  return `<div class="eu-wrap"><svg class="eu-svg" viewBox="0 0 160 160" aria-label="Euclidean rings">${svg}<circle class="eu-hub" cx="80" cy="80" r="9" /></svg>
    <p class="eu-hint">Hold a chord: ring 1 plays its lowest note, ring 2 the next, ring 3 the next. HOLD keeps it going.</p></div>`;
}

let euStepUnsub: (() => void) | null = null;
function bindEuclidPlayhead(): void {
  if (euStepUnsub) return;
  euStepUnsub = onArpStep((step) => {
    document.querySelectorAll(".eu-dot.now").forEach((el) => el.classList.remove("now"));
    if (step < 0) return;
    const p = getSynthPatch();
    for (let r = 1; r <= 3; r++) {
      const steps = Math.max(1, Math.round(p[`euc${r}Steps`] ?? 16));
      const el = document.querySelector(`.eu-dot[data-ring="${r}"][data-i="${step % steps}"]`);
      if (el) el.classList.add("now");
    }
  });
}

// -------------------------------------------- Nishapur: Vector XY pad ----
const VEC_PAD_MIN = 12;
const VEC_PAD_SPAN = 176;
const toSvgCoord = (norm: number): number => VEC_PAD_MIN + Math.max(0, Math.min(1, norm)) * VEC_PAD_SPAN;

let vecTrail: [number, number][] = [];
let vecRecPoints: [number, number][] | null = null;
let vecRafId = 0;

function buildOrbitPathD(): string {
  if (vecRecPoints && vecRecPoints.length >= 2) {
    return vecRecPoints
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${toSvgCoord(x).toFixed(1)} ${toSvgCoord(y).toFixed(1)}`)
      .join(" ");
  }
  const p = getSynthPatch();
  const mode = String(p.orbitMode || "off");
  const effSize = Math.min(1, (Number(p.orbitSize) ?? 0.55) + getModWheel());
  if (mode === "off" || effSize <= 0.005) return "";
  const cx = Math.max(0, Math.min(1, Number(p.vecX) ?? 0.5));
  const cy = Math.max(0, Math.min(1, Number(p.vecY) ?? 0.5));
  const steps = 72;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const [x, y] = evalOrbitPoint(mode, i / steps, cx, cy, effSize);
    d += `${i === 0 ? "M" : "L"}${toSvgCoord(x).toFixed(1)} ${toSvgCoord(y).toFixed(1)} `;
  }
  return d + "Z";
}

function renderVectorPad(): string {
  const p = getSynthPatch();
  const cx = Math.max(0, Math.min(1, Number(p.vecX) ?? 0.5));
  const cy = Math.max(0, Math.min(1, Number(p.vecY) ?? 0.5));
  const live = getVectorLiveXY(p);
  const px = toSvgCoord(live.x);
  const py = toSvgCoord(live.y);
  const ax = toSvgCoord(cx);
  const ay = toSvgCoord(cy);
  const orbitD = buildOrbitPathD();
  const recOn = p.orbitRec === "on";
  const xMapped = isParamMapped("vecX");
  const yMapped = isParamMapped("vecY");
  const learnTarget = isLearnMode() ? getLearnTargetParam() : null;

  return `<div class="vec-wrap">
    <svg class="vec-svg${recOn ? " is-recording" : ""}" id="vec-pad-svg" viewBox="0 0 200 200" aria-label="Vector XY morph pad">
      <g class="vec-grid" aria-hidden="true">
        <circle cx="100" cy="100" r="38" />
        <circle cx="100" cy="100" r="76" />
        <line x1="100" y1="10" x2="100" y2="190" />
        <line x1="10" y1="100" x2="190" y2="100" />
        <line class="vec-diag" x1="16" y1="16" x2="184" y2="184" />
        <line class="vec-diag" x1="184" y1="16" x2="16" y2="184" />
      </g>
      <g class="vec-corner vec-corner-a" aria-hidden="true">
        <text x="12" y="22">A</text>
        <path d="M25 20l4-7v7h4v-7h5v7" />
      </g>
      <g class="vec-corner vec-corner-b" aria-hidden="true">
        <text x="188" y="22" text-anchor="end">B</text>
        <path d="M161 19v-3a4.5 4.5 0 0 1 9 0v3h2h-13zM164.5 21.5h2" />
      </g>
      <g class="vec-corner vec-corner-c" aria-hidden="true">
        <text x="12" y="188">C</text>
        <path d="M25 186c2.5-3.5 4.5-3.5 7 0s4.5 3.5 7 0M25 181c2.5-3.5 4.5-3.5 7 0s4.5 3.5 7 0" />
      </g>
      <g class="vec-corner vec-corner-d" aria-hidden="true">
        <text x="188" y="188" text-anchor="end">D</text>
        <path d="M159 187c1.8-7 3.6-7 5.4 0c1.8-10 3.6-10 5.4 0c1.6-4.5 3.2-4.5 4.8 0" />
      </g>
      <path class="vec-orbit-path${recOn ? " is-rec" : ""}" id="vec-orbit-path" d="${orbitD}" />
      <polyline class="vec-trail" id="vec-trail" points="" />
      <circle class="vec-anchor" id="vec-anchor" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.8" />
      <g class="vec-cursor" id="vec-cursor" transform="translate(${px.toFixed(1)}, ${py.toFixed(1)})">
        <circle class="vec-cursor-halo" r="13" />
        <circle class="vec-cursor-ring" r="6" />
        <circle class="vec-cursor-dot" r="2.6" />
      </g>
    </svg>
    <div class="vec-xy-hud">
      <button type="button" class="vec-axis-pill${xMapped ? " is-mapped" : ""}${learnTarget === "vecX" ? " is-learning" : ""}" data-param="vecX">X <b>${Math.round(cx * 100)}%</b><span class="sk-dot"></span></button>
      <button type="button" class="vec-axis-pill${yMapped ? " is-mapped" : ""}${learnTarget === "vecY" ? " is-learning" : ""}" data-param="vecY">Y <b>${Math.round(cy * 100)}%</b><span class="sk-dot"></span></button>
    </div>
  </div>`;
}

function updateVectorPadDOM(rebuildOrbit = false): void {
  const svg = document.getElementById("vec-pad-svg");
  if (!svg) return;
  const p = getSynthPatch();
  const cx = Math.max(0, Math.min(1, Number(p.vecX) ?? 0.5));
  const cy = Math.max(0, Math.min(1, Number(p.vecY) ?? 0.5));
  const live = vecRecPoints && vecRecPoints.length
    ? { x: vecRecPoints[vecRecPoints.length - 1][0], y: vecRecPoints[vecRecPoints.length - 1][1] }
    : getVectorLiveXY(p);

  const px = toSvgCoord(live.x);
  const py = toSvgCoord(live.y);

  const last = vecTrail[vecTrail.length - 1];
  if (!last || Math.hypot(px - last[0], py - last[1]) > 1.2) {
    vecTrail.push([px, py]);
    if (vecTrail.length > 22) vecTrail.shift();
  }

  const cursor = document.getElementById("vec-cursor");
  if (cursor) cursor.setAttribute("transform", `translate(${px.toFixed(1)}, ${py.toFixed(1)})`);
  const anchor = document.getElementById("vec-anchor");
  if (anchor) {
    anchor.setAttribute("cx", toSvgCoord(cx).toFixed(1));
    anchor.setAttribute("cy", toSvgCoord(cy).toFixed(1));
  }
  const trail = document.getElementById("vec-trail");
  if (trail) {
    trail.setAttribute("points", vecTrail.map(([tx, ty]) => `${tx.toFixed(1)},${ty.toFixed(1)}`).join(" "));
  }
  if (rebuildOrbit) {
    const orbitEl = document.getElementById("vec-orbit-path");
    if (orbitEl) {
      orbitEl.setAttribute("d", buildOrbitPathD());
      orbitEl.classList.toggle("is-rec", p.orbitRec === "on");
    }
    svg.classList.toggle("is-recording", p.orbitRec === "on");
  }
}

function startVectorPadLoop(): void {
  if (vecRafId) cancelAnimationFrame(vecRafId);
  const tick = () => {
    if (getMachine().id !== "nishapur") {
      vecRafId = 0;
      return;
    }
    updateVectorPadDOM(false);
    vecRafId = requestAnimationFrame(tick);
  };
  vecRafId = requestAnimationFrame(tick);
}

function bindVectorPad(): void {
  const svg = document.getElementById("vec-pad-svg") as SVGSVGElement | null;
  if (!svg) return;
  let pointerId: number | null = null;

  const setFromEvent = (e: PointerEvent, isStart: boolean) => {
    const r = svg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const p = getSynthPatch();
    if (p.orbitRec === "on") {
      if (isStart || !vecRecPoints) {
        vecRecPoints = [[x, y]];
      } else {
        const prev = vecRecPoints[vecRecPoints.length - 1];
        if (!prev || Math.hypot(x - prev[0], y - prev[1]) >= 0.008) {
          vecRecPoints.push([x, y]);
          if (vecRecPoints.length > 512) {
            // Keep memory bounded during long drags; setVectorDrawnPath resamples to max 256
            vecRecPoints = vecRecPoints.filter((_, idx) => idx % 2 === 0);
          }
        }
      }
      setSynthParam("vecX", x);
      setSynthParam("vecY", y);
      updateVectorPadDOM(true);
    } else {
      setSynthParam("vecX", x);
      setSynthParam("vecY", y);
      updateVectorPadDOM(true);
    }
  };

  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();
    prepareAudio();
    if (isLearnMode()) {
      const cur = getLearnTargetParam();
      selectLearnParam(cur === "vecX" ? "vecY" : "vecX");
      return;
    }
    pointerId = e.pointerId;
    try {
      svg.setPointerCapture(pointerId);
    } catch (err) {}
    setFromEvent(e, true);
  });

  svg.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    setFromEvent(e, false);
  });

  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (vecRecPoints) {
      const recorded = vecRecPoints;
      vecRecPoints = null;
      if (recorded.length >= 2) {
        setVectorDrawnPath(recorded);
        setSynthParam("vecX", 0.5);
        setSynthParam("vecY", 0.5);
        setSynthParam("orbitMode", "drawn");
      }
      setSynthParam("orbitRec", "off");
      updateVectorPadDOM(true);
    }
  };

  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("lostpointercapture", endDrag);
  startVectorPadLoop();
}

function renderCustom(id: string): string {
  if (id === "fm-algo") return renderFmAlgo();
  if (id === "euclid-rings") { bindEuclidPlayhead(); return renderEuclidRings(); }
  if (id === "vector-pad") return renderVectorPad();
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

/** The preset name in the top bar: tap it to open the sound library. */
function renderPresetButton(): string {
  const m = getMachine();
  const cur = m.presets.find((p) => p.id === getSynthPresetId());
  const name = cur ? cur.name : "Custom";
  const sub = cur ? cur.group : "Edited sound";
  return `<span class="pd-text"><span class="pd-name">${escapeHtml(name)}</span><span class="pd-sub">${escapeHtml(sub)}</span></span>` +
    `<svg class="pd-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>`;
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

export function previewPreset(presetId: string): void {
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
          <button type="button" class="preset-display synth-preset-select" id="preset-btn" aria-haspopup="dialog" aria-expanded="false" title="Open the sound library">${renderPresetButton()}</button>
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
  const btn = document.getElementById("preset-btn");
  if (btn) btn.innerHTML = renderPresetButton();
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
  fitPanel();
}

/**
 * The keyboard has one fixed height on every machine. When a machine's panel
 * does not fit in the space left above it, the panel switches to pages (tabs)
 * on any screen size, so nothing overflows and the keys never shrink.
 */
export function fitPanel(): void {
  const shell = document.querySelector<HTMLElement>(".sy1-shell");
  const panel = document.querySelector<HTMLElement>(".synth-panel");
  if (!shell || !panel) return;
  shell.classList.remove("is-fit-paged");
  const secs = panel.querySelector<HTMLElement>(".synth-sections");
  const overflowing = () =>
    panel.scrollHeight > panel.clientHeight + 1 ||
    (!!secs && secs.scrollHeight > secs.clientHeight + 1) ||
    document.documentElement.scrollHeight > window.innerHeight + 1;
  if (!tabsVisible() && overflowing()) shell.classList.add("is-fit-paged");
}

let fitRaf = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(fitPanel);
});

function bindPanelElements(): void {
  const devSelect = document.getElementById("midi-device") as HTMLSelectElement | null;
  if (devSelect) devSelect.addEventListener("change", () => setSelectedMidiDevice(devSelect.value));
  const chSelect = document.getElementById("midi-channel") as HTMLSelectElement | null;
  if (chSelect) chSelect.addEventListener("change", () => setSelectedMidiChannel(parseInt(chSelect.value, 10) || 0));
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
      if (!tabsVisible() || t.closest(".sk, .vec-svg, .vec-axis-pill, button, select")) return;
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
  bindVectorPad();
}

export function initPanelInteractions(): void {
  onParamChange((key) => {
    updateSynthControlDOM(key);
    if (key === "fmAlgo") refreshCustom("fm-algo");
    else if (key.startsWith("euc")) refreshCustom("euclid-rings");
    else if (key === "vecX" || key === "vecY" || key.startsWith("orbit")) updateVectorPadDOM(true);
  });
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
