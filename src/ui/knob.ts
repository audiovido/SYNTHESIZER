/**
 * SY-1 UI — Knob Component & Drag/Wheel/Keyboard/MIDI-Learn Interaction
 */

import { unlockAudio } from "../engine/bus";
import {
  getLearnTargetParam,
  getParamMappedCc,
  isLearnMode,
  isParamMapped,
  removeParamMapping,
  selectLearnParam
} from "../engine/midi";
import { escapeHtml, SYNTH_PARAMS, synthDenorm, synthNorm } from "../engine/params";
import { getSynthPatch, setSynthParam } from "../engine/synth";

export function renderSynthKnob(key: string, label: string): string {
  const patch = getSynthPatch();
  const v = patch[key];
  const n = synthNorm(key, v);
  const def = SYNTH_PARAMS[key];
  const fmtVal = def && def.fmt ? def.fmt(v) : String(v);
  const mapped = isParamMapped(key);
  const cc = getParamMappedCc(key);
  const learning = isLearnMode() && getLearnTargetParam() === key;
  const titleAttr = mapped ? ` title="Mapped to CC${cc} (right-click or long-press to unmap)"` : "";

  return `<div class="sk${mapped ? " is-mapped" : ""}${learning ? " is-learning" : ""}" data-param="${key}" role="slider" tabindex="0" aria-label="${label}" aria-valuetext="${escapeHtml(fmtVal)}"${titleAttr}>
      <div class="sk-dial" style="--n:${n.toFixed(4)}"><span class="sk-ind"></span><span class="sk-dot"></span></div>
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
    document.querySelectorAll(`.synth-choice-btn[data-param="${key}"]`).forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-value") === String(v));
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
}

export function updateMidiLearnDOM(): void {
  const learningKey = isLearnMode() ? getLearnTargetParam() : null;

  document.querySelectorAll(".sk[data-param], .synth-choice[data-param]").forEach((el) => {
    const key = el.getAttribute("data-param");
    if (!key) return;
    const mapped = isParamMapped(key);
    const cc = getParamMappedCc(key);
    el.classList.toggle("is-mapped", mapped);
    el.classList.toggle("is-learning", learningKey === key);
    if (mapped) {
      el.setAttribute("title", `Mapped to CC${cc} (right-click or long-press to unmap)`);
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

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressStart: { x: number; y: number; id: number } | null = null;

function clearLongPress(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressStart = null;
}

export function initKnobInteractions(): void {
  // Right-click removes MIDI mapping on mapped knob or choice group
  document.addEventListener("contextmenu", (e) => {
    const target = (e.target as HTMLElement)?.closest?.(".sk[data-param], .synth-choice[data-param]") as HTMLElement | null;
    if (!target) return;
    const key = target.getAttribute("data-param");
    if (key && isParamMapped(key)) {
      e.preventDefault();
      removeParamMapping(key);
    }
  });

  document.addEventListener("pointerdown", (e) => {
    // Allow right-click to be handled by contextmenu
    if (e.button === 2) return;

    const choiceEl = (e.target as HTMLElement)?.closest?.(".synth-choice[data-param]") as HTMLElement | null;
    if (choiceEl && isLearnMode()) {
      const cKey = choiceEl.getAttribute("data-param");
      if (cKey) {
        e.preventDefault();
        selectLearnParam(cKey);
        return;
      }
    }

    const knob = (e.target as HTMLElement)?.closest?.(".sk") as HTMLElement | null;
    if (!knob) return;
    e.preventDefault();
    unlockAudio();
    const key = knob.getAttribute("data-param");
    if (!key) return;

    // In MIDI Learn mode, clicking a knob selects it for mapping
    if (isLearnMode()) {
      selectLearnParam(key);
      return;
    }

    // Long-press on touch to remove mapping
    clearLongPress();
    if (e.pointerType === "touch" && isParamMapped(key)) {
      longPressStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
      longPressTimer = setTimeout(() => {
        removeParamMapping(key);
        if (synthDrag && synthDrag.id === e.pointerId) {
          synthDrag.el.classList.remove("dragging");
          synthDrag = null;
        }
        clearLongPress();
      }, 500);
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
