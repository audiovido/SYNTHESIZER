/**
 * SY-1 UI — Oriental & Custom Tuning Panel
 *
 * Provides microtonal scale selection (Shur, Homayoun, Chahargah, Segah, Bayati, Rast, Hijaz),
 * root note selection, scale description, 12-note custom cent inputs (-100 to +100 cents),
 * and Scala (.scl) file importer.
 */

import {
  getCustomTuning,
  parseScalaScl,
  setCustomTuning,
  TUNINGS
} from "../engine/params";
import {
  getMachine,
  getSynthPatch,
  onParamChange,
  setSynthParam,
  updateCustomTuningOffsets
} from "../engine/synth";
import { choice, ChoiceOption, toggles, TUNING_OPTS } from "../machines/types";
import { renderControl, setPanelRenderHook } from "./panel";

let open = false;
let sclStatusMsg = "";
let sclStatusIsError = false;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOT_OPTS: ChoiceOption[] = NOTE_NAMES.map((n, i) => [String(i), n]);

function html(): string {
  const patch = getSynthPatch();
  const machineId = getMachine().id;
  const customOffsets = getCustomTuning(machineId);
  const currentTuningDef = TUNINGS[patch.tuning] || TUNINGS["12tet"];

  let customGridHtml = "";
  for (let i = 0; i < 12; i++) {
    const val = customOffsets[i] ?? 0;
    const sign = val > 0 ? "+" : "";
    customGridHtml += `
      <div class="custom-cent-col">
        <label class="custom-cent-lbl" for="cent-in-${i}">${NOTE_NAMES[i]}</label>
        <input
          type="number"
          id="cent-in-${i}"
          class="custom-cent-input"
          data-deg="${i}"
          min="-100"
          max="100"
          step="0.1"
          value="${val}"
          title="Cent deviation for ${NOTE_NAMES[i]} relative to 12-TET"
        />
        <span class="custom-cent-unit">${sign}${val.toFixed(1)}¢</span>
      </div>`;
  }

  const statusClass = sclStatusMsg
    ? sclStatusIsError
      ? "scl-status scl-error"
      : "scl-status scl-ok"
    : "scl-status";

  return `<div class="arp-pop oriental-pop" role="dialog" aria-label="Oriental & Custom Tuning"><div class="arp-pop-inner oriental-pop-inner">
    <div class="arp-pop-head">
      <h4>ORIENTAL & CUSTOM TUNING</h4>
      <button type="button" class="synth-midi-btn arp-pop-close" data-oriental-close aria-label="Close">✕</button>
    </div>

    ${renderControl(toggles([{ key: "oriental", label: "ORIENTAL TUNING", title: "Enable/disable microtonal oriental tuning scale" }]))}
    ${renderControl(choice("tuning", TUNING_OPTS))}
    ${renderControl(choice("tuneRoot", ROOT_OPTS))}

    <div class="tuning-source-box">
      <div class="tuning-source-title">${currentTuningDef.name}${currentTuningDef.approx ? " (approx.)" : ""}</div>
      <div class="tuning-source-desc">${currentTuningDef.source}</div>
    </div>

    <div class="custom-tuning-sec">
      <div class="custom-tuning-head">
        <h5>12-NOTE CUSTOM CENT OFFSETS (−100¢ to +100¢)</h5>
        <div class="scl-import-bar">
          <input type="file" id="scl-file-input" accept=".scl,.txt" class="scl-file-input" style="display:none" />
          <button type="button" class="synth-midi-btn scl-btn" id="scl-btn" title="Import 12-note Scala tuning file">Import Scala .scl</button>
        </div>
      </div>
      <div id="scl-status" class="${statusClass}">${sclStatusMsg}</div>
      <div class="custom-cent-grid">
        ${customGridHtml}
      </div>
    </div>
  </div></div>`;
}

export function syncOrientalButton(): void {
  const btn = document.getElementById("kb-oriental");
  if (!btn) return;
  const patch = getSynthPatch();
  const isOn = patch.oriental === "on";

  btn.classList.toggle("active", isOn);
  btn.classList.toggle("is-open", open);
  btn.setAttribute("aria-pressed", isOn ? "true" : "false");

  const sub = document.getElementById("kb-oriental-sub");
  if (sub) {
    if (!isOn) {
      sub.textContent = "OFF";
    } else {
      const tDef = TUNINGS[patch.tuning] || TUNINGS["12tet"];
      const shortName = tDef.name.split(" ")[0];
      const rootLabel = NOTE_NAMES[patch.tuneRoot ?? 0] || "C";
      const approxTag = tDef.approx ? " ~" : "";
      sub.textContent = `${shortName}${approxTag} · ${rootLabel}`;
    }
  }
}

function render(): void {
  document.querySelectorAll(".oriental-pop").forEach((el) => el.remove());
  const panel = document.querySelector(".synth-panel");
  if (open && panel && getMachine().kind === "synth") {
    panel.insertAdjacentHTML("beforeend", html());
    bindPanelEvents();
  }
  syncOrientalButton();
}

function bindPanelEvents(): void {
  const pop = document.querySelector(".oriental-pop");
  if (!pop) return;

  // Custom cent number input edits
  pop.querySelectorAll<HTMLInputElement>(".custom-cent-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const deg = parseInt((e.target as HTMLElement).dataset.deg || "0", 10);
      const val = parseFloat((e.target as HTMLInputElement).value) || 0;
      const machineId = getMachine().id;
      const current = getCustomTuning(machineId).slice();
      current[deg] = val;

      setCustomTuning(machineId, current);
      setSynthParam("tuning", "custom");
      updateCustomTuningOffsets();

      // Update displayed cent unit
      const col = (e.target as HTMLElement).closest(".custom-cent-col");
      if (col) {
        const unitEl = col.querySelector(".custom-cent-unit");
        if (unitEl) {
          const sign = val > 0 ? "+" : "";
          unitEl.textContent = `${sign}${val.toFixed(1)}¢`;
        }
      }
    });
  });

  // Scala import
  const sclBtn = pop.querySelector("#scl-btn");
  const sclInput = pop.querySelector<HTMLInputElement>("#scl-file-input");
  if (sclBtn && sclInput) {
    sclBtn.addEventListener("click", () => sclInput.click());
    sclInput.addEventListener("change", () => {
      const file = sclInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result || "");
        const res = parseScalaScl(text);
        if (res.ok) {
          const machineId = getMachine().id;
          setCustomTuning(machineId, res.offsets);
          setSynthParam("tuning", "custom");
          updateCustomTuningOffsets();

          sclStatusMsg = `Loaded: ${res.description || file.name}`;
          sclStatusIsError = false;
        } else {
          sclStatusMsg = res.error;
          sclStatusIsError = true;
        }
        render();
      };
      reader.readAsText(file);
    });
  }
}

export function setOrientalOpen(v: boolean): void {
  open = v;
  if (!v) {
    sclStatusMsg = "";
    sclStatusIsError = false;
  }
  render();
}

export function initOrientalPanel(): void {
  setPanelRenderHook(render);

  const btn = document.getElementById("kb-oriental");
  if (btn) {
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressed = false;

    // Pointer events for click vs gear / long-press
    btn.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("[data-oriental-gear]")) return;
      longPressed = false;
      pressTimer = setTimeout(() => {
        longPressed = true;
        setOrientalOpen(true);
      }, 450);
    });

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    btn.addEventListener("pointerup", cancelPress);
    btn.addEventListener("pointercancel", cancelPress);
    btn.addEventListener("pointerleave", cancelPress);

    btn.addEventListener("click", (e) => {
      const isGear = Boolean((e.target as HTMLElement).closest("[data-oriental-gear]"));
      if (isGear) {
        e.preventDefault();
        e.stopPropagation();
        setOrientalOpen(!open);
        return;
      }
      if (longPressed) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Simple tap toggles oriental on/off
      const patch = getSynthPatch();
      setSynthParam("oriental", patch.oriental === "on" ? "off" : "on");
    });
  }

  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-oriental-close]")) {
      setOrientalOpen(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) {
      setOrientalOpen(false);
    }
  });

  onParamChange((k) => {
    if (k === "oriental" || k === "tuning" || k === "tuneRoot") {
      syncOrientalButton();
      if (open) render();
    }
  });

  syncOrientalButton();
}
