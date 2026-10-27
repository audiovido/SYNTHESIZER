/**
 * SY-1 UI — Knob Component & Drag/Wheel/Keyboard/MIDI-Learn Interaction
 */

import {
  getLearnTargetParam,
  getParamMappedCc,
  isLearnMode,
  isParamMapped,
  removeParamMapping,
  selectLearnParam
} from "../engine/midi";
import { escapeHtml, SYNTH_PARAMS, synthDenorm, synthNorm } from "../engine/params";
import { getSynthPatch, prepareAudio, setSynthParam } from "../engine/synth";

function buildKnobScaleSvg(bipolar: boolean): string {
  let lines = "";
  let nums = "";
  for (let i = 0; i <= 10; i++) {
    const deg = -135 + i * 27;
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = -Math.cos(rad);
    const major = bipolar ? i === 0 || i === 5 || i === 10 : i % 2 === 0;
    const r1 = major ? 34.5 : 35.8;
    const r2 = major ? 40.5 : 39.4;
    const x1 = (50 + sin * r1).toFixed(2);
    const y1 = (50 + cos * r1).toFixed(2);
    const x2 = (50 + sin * r2).toFixed(2);
    const y2 = (50 + cos * r2).toFixed(2);
    lines += `<line class="sk-tick${major ? " is-major" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;

    if (bipolar) {
      if (i === 0 || i === 5 || i === 10) {
        const txt = i === 0 ? "−" : i === 5 ? "0" : "+";
        const rt = 45.6;
        const tx = (50 + sin * rt).toFixed(2);
        const ty = (50 + cos * rt).toFixed(2);
        nums += `<text class="sk-num is-bipolar" x="${tx}" y="${ty}">${txt}</text>`;
      }
    } else {
      const rt = 45.8;
      const tx = (50 + sin * rt).toFixed(2);
      const ty = (50 + cos * rt).toFixed(2);
      nums += `<text class="sk-num" x="${tx}" y="${ty}">${i}</text>`;
    }
  }
  return `<svg class="sk-scale" viewBox="0 0 100 100" aria-hidden="true">${lines}${nums}</svg>`;
}

const UNIPOLAR_SCALE_SVG = buildKnobScaleSvg(false);
const BIPOLAR_SCALE_SVG = buildKnobScaleSvg(true);

export function renderSynthKnob(key: string, label: string): string {
  const patch = getSynthPatch();
  const v = patch[key];
  const n = synthNorm(key, v);
  const def = SYNTH_PARAMS[key];
  const fmtVal = def && def.fmt ? def.fmt(v) : String(v);
  const mapped = isParamMapped(key);
  const cc = getParamMappedCc(key);
  const learning = isLearnMode() && getLearnTargetParam() === key;
  const titleAttr = mapped ? ` title="Mapped to CC${cc} (right-click, or long-press in LEARN, to unmap)"` : "";
  const isBipolar = typeof def?.min === "number" && typeof def?.max === "number" && def.min < 0 && def.max > 0;
  const scaleSvg = isBipolar ? BIPOLAR_SCALE_SVG : UNIPOLAR_SCALE_SVG;

  return `<div class="sk${mapped ? " is-mapped" : ""}${learning ? " is-learning" : ""}" data-param="${key}" role="slider" tabindex="0" aria-label="${label}" aria-valuetext="${escapeHtml(fmtVal)}"${titleAttr}>
      <div class="sk-dial" style="--n:${n.toFixed(4)}">${scaleSvg}<span class="sk-skirt"></span><span class="sk-cap"></span><span class="sk-rotor"><span class="sk-ind"></span></span><span class="sk-dot"></span></div>
      <div class="sk-label">${label}</div>
      <div class="sk-val">${escapeHtml(fmtVal)}</div>
    </div>`;
}

export function updateSynthControlDOM(key: string): void {
  const patch = getSynthPatch();
  const v = patch[key];
  const def = SYNTH_PARAMS[key];
  if (!def) return;

  if (def.type) {
    document.querySelectorAll(`.synth-choice-btn[data-param="${key}"][data-value]`).forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-value") === String(v));
    });
    document.querySelectorAll(`.synth-toggle-btn[data-param="${key}"]`).forEach((b) => {
      const on = b.getAttribute("data-on") === String(v);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll<HTMLSelectElement>(`select.synth-param-select[data-param="${key}"]`).forEach((sel) => {
      sel.value = String(v);
    });
    return;
  }

  document.querySelectorAll(`.sk[data-param="${key}"]`).forEach((el) => {
    const dial = el.querySelector(".sk-dial") as HTMLElement | null;
    if (dial) dial.style.setProperty("--n", synthNorm(key, v).toFixed(4));
    const val = el.querySelector(".sk-val");
    const fmtVal = def.fmt ? def.fmt(v) : String(v);
    if (val) val.textContent = fmtVal;
    el.setAttribute("aria-valuetext", fmtVal);
  });

  document.querySelectorAll(`.vec-axis-pill[data-param="${key}"] b`).forEach((el) => {
    el.textContent = def.fmt ? def.fmt(v) : String(v);
  });
}

export function updateMidiLearnDOM(): void {
  const learningKey = isLearnMode() ? getLearnTargetParam() : null;

  document.querySelectorAll(".sk[data-param], .synth-choice[data-param], .vec-axis-pill[data-param]").forEach((el) => {
    const key = el.getAttribute("data-param");
    if (!key) return;
    const mapped = isParamMapped(key);
    const cc = getParamMappedCc(key);
    el.classList.toggle("is-mapped", mapped);
    el.classList.toggle("is-learning", learningKey === key);
    if (mapped) {
      el.setAttribute("title", `Mapped to CC${cc} (right-click, or long-press in LEARN, to unmap)`);
    } else {
      el.removeAttribute("title");
    }
  });
}

let synthDrag: {
  key: string;
  startY: number;
  startX: number;
  startN: number;
  id: number;
  el: HTMLElement;
} | null = null;

// Touch long-press removes a MIDI mapping, but only while LEARN mode is on.
// In LEARN mode a short tap selects the control for mapping; holding it still unmaps it.
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressStart: { x: number; y: number; id: number; key: string } | null = null;
let lastPointerType = "mouse";

function clearLongPress(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressStart = null;
}

function learnPointerDown(e: PointerEvent, key: string): void {
  e.preventDefault();
  clearLongPress();
  if (e.pointerType === "touch" && isParamMapped(key)) {
    longPressStart = { x: e.clientX, y: e.clientY, id: e.pointerId, key };
    longPressTimer = setTimeout(() => {
      removeParamMapping(key);
      clearLongPress();
    }, 500);
    return;
  }
  selectLearnParam(key);
}

export function initKnobInteractions(): void {
  // Right-click removes a MIDI mapping. A touch long-press also fires contextmenu on
  // some phones: outside LEARN mode that must never unmap, so only block the menu.
  document.addEventListener("contextmenu", (e) => {
    const target = (e.target as HTMLElement)?.closest?.(".sk[data-param], .synth-choice[data-param], .vec-axis-pill[data-param]") as HTMLElement | null;
    if (!target) return;
    const key = target.getAttribute("data-param");
    if (!key || !isParamMapped(key)) return;
    e.preventDefault();
    if (lastPointerType === "touch" && !isLearnMode()) return;
    clearLongPress();
    removeParamMapping(key);
  });

  document.addEventListener("pointerdown", (e) => {
    lastPointerType = e.pointerType;
    // Allow right-click to be handled by contextmenu
    if (e.button === 2) return;

    const choiceEl = (e.target as HTMLElement)?.closest?.(".synth-choice[data-param], .vec-axis-pill[data-param]") as HTMLElement | null;
    if (choiceEl && isLearnMode()) {
      const cKey = choiceEl.getAttribute("data-param");
      if (cKey) {
        learnPointerDown(e, cKey);
        return;
      }
    }

    const knob = (e.target as HTMLElement)?.closest?.(".sk") as HTMLElement | null;
    if (!knob) return;
    e.preventDefault();
    prepareAudio();
    const key = knob.getAttribute("data-param");
    if (!key) return;

    // In MIDI Learn mode, tapping a knob selects it for mapping
    if (isLearnMode()) {
      learnPointerDown(e, key);
      return;
    }

    synthDrag = {
      key,
      startY: e.clientY,
      startX: e.clientX,
      startN: synthNorm(key, getSynthPatch()[key]),
      id: e.pointerId,
      el: knob
    };
    knob.classList.add("dragging");
    try {
      knob.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  document.addEventListener("pointermove", (e) => {
    if (longPressStart && e.pointerId === longPressStart.id) {
      const dist = Math.hypot(e.clientX - longPressStart.x, e.clientY - longPressStart.y);
      if (dist > 5) clearLongPress();
    }
    if (!synthDrag || e.pointerId !== synthDrag.id) return;
    e.preventDefault();
    const dy = synthDrag.startY - e.clientY;
    const dx = e.clientX - synthDrag.startX;
    const sens = e.shiftKey ? 700 : 220;
    setSynthParam(synthDrag.key, synthDenorm(synthDrag.key, synthDrag.startN + (dy + dx * 0.5) / sens));
  });

  const endSynthDrag = (e?: PointerEvent) => {
    if (longPressStart && (!e || e.pointerId === longPressStart.id)) {
      // A short tap in LEARN mode (timer still pending) selects the control
      if (e && e.type === "pointerup" && longPressTimer) {
        selectLearnParam(longPressStart.key);
      }
      clearLongPress();
    }
    if (!synthDrag || (e && e.pointerId !== synthDrag.id)) return;
    synthDrag.el.classList.remove("dragging");
    synthDrag = null;
  };

  document.addEventListener("pointerup", endSynthDrag);
  document.addEventListener("pointercancel", endSynthDrag);

  document.addEventListener("dblclick", (e) => {
    const knob = (e.target as HTMLElement)?.closest?.(".sk") as HTMLElement | null;
    if (!knob) return;
    const key = knob.getAttribute("data-param");
    if (key && SYNTH_PARAMS[key]) {
      setSynthParam(key, SYNTH_PARAMS[key].def);
    }
  });

  document.addEventListener(
    "wheel",
    (e) => {
      const knob = (e.target as HTMLElement)?.closest?.(".sk") as HTMLElement | null;
      if (!knob) return;
      e.preventDefault();
      const key = knob.getAttribute("data-param");
      if (!key) return;
      const currentNorm = synthNorm(key, getSynthPatch()[key]);
      setSynthParam(key, synthDenorm(key, currentNorm - Math.sign(e.deltaY) * 0.03));
    },
    { passive: false }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      const knob = (e.target as HTMLElement)?.closest?.(".sk") as HTMLElement | null;
      if (!knob) return;
      const dirMap: Record<string, number> = {
        ArrowUp: 1,
        ArrowRight: 1,
        ArrowDown: -1,
        ArrowLeft: -1
      };
      const dir = dirMap[e.key];
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      const key = knob.getAttribute("data-param");
      if (!key) return;
      const d = SYNTH_PARAMS[key];
      if (!d) return;
      const patch = getSynthPatch();
      const next = d.step
        ? patch[key] + dir * d.step
        : synthDenorm(key, synthNorm(key, patch[key]) + dir * 0.02);
      setSynthParam(key, next);
    },
    true
  );
}
