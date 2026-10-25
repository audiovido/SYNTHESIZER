/**
 * SY-1 UI — Knob Component & Drag/Wheel/Keyboard Interaction
 */

import { getSynthPatch, setSynthParam } from "../engine/synth";
import { escapeHtml, SYNTH_PARAMS, synthDenorm, synthNorm } from "../engine/params";
import { unlockAudio } from "../engine/bus";

export function renderSynthKnob(key: string, label: string): string {
  const patch = getSynthPatch();
  const v = patch[key];
  const n = synthNorm(key, v);
  const def = SYNTH_PARAMS[key];
  const fmtVal = def && def.fmt ? def.fmt(v) : String(v);

  return `<div class="sk" data-param="${key}" role="slider" tabindex="0" aria-label="${label}" aria-valuetext="${escapeHtml(fmtVal)}">
      <div class="sk-dial" style="--n:${n.toFixed(4)}"><span class="sk-ind"></span></div>
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

let synthDrag: {
  key: string;
  startY: number;
  startX: number;
  startN: number;
  id: number;
  el: HTMLElement;
} | null = null;

export function initKnobInteractions(): void {
  document.addEventListener("pointerdown", (e) => {
    const knob = (e.target as HTMLElement)?.closest?.(".sk") as HTMLElement | null;
    if (!knob) return;
    e.preventDefault();
    unlockAudio();
    const key = knob.getAttribute("data-param");
    if (!key) return;
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
    if (!synthDrag || e.pointerId !== synthDrag.id) return;
    e.preventDefault();
    const dy = synthDrag.startY - e.clientY;
    const dx = e.clientX - synthDrag.startX;
    const sens = e.shiftKey ? 700 : 220;
    setSynthParam(synthDrag.key, synthDenorm(synthDrag.key, synthDrag.startN + (dy + dx * 0.5) / sens));
  });

  const endSynthDrag = (e?: PointerEvent) => {
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
