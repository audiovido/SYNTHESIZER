/**
 * SY-1 UI — Oriental tuning settings
 *
 * Opened with the tuning-settings button beside ORIENTAL. Lets you pick the
 * scale (Shur, Homayoun, Chahargah, Segah, Bayati, Rast, Hijaz, Custom), its
 * tonic, and for Custom: 12 per-note cent offsets (−100…+100) or a 12-note
 * Scala (.scl) file.
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
import { TUNING_OPTS } from "../machines/types";
import { setPanelRenderHook } from "./panel";
import { syncOriental } from "./keyboard";

let open = false;
let sclStatusMsg = "";
let sclStatusIsError = false;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function fmtCents(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? "+" : "") + (Number.isInteger(r) ? String(r) : r.toFixed(1));
}

function html(): string {
  const patch = getSynthPatch();
  const on = patch.oriental === "on";
  const tuningId = (patch.tuning as string) || "12tet";
  const def = TUNINGS[tuningId] || TUNINGS["12tet"];
  const root = (((Number(patch.tuneRoot ?? def.tonic) % 12) + 12) % 12);
  const isCustom = tuningId === "custom";

  const scales = TUNING_OPTS.map(([id, label]) => {
    const t = TUNINGS[id];
    const name = label.replace(/ \(approx\.\)/, "");
    const tonic = t && id !== "12tet" && id !== "custom" ? NOTE_NAMES[t.tonic] : "";
    return `<button type="button" class="or-chip or-scale${id === tuningId ? " active" : ""}" data-or-scale="${id}" aria-pressed="${id === tuningId}">
        <span class="or-chip-name">${escapeHtml(name)}${t && t.approx ? '<span class="or-approx" title="approximate">~</span>' : ""}</span>
        ${tonic ? `<span class="or-chip-sub">${tonic}</span>` : ""}
      </button>`;
  }).join("");

  const roots = NOTE_NAMES.map((n, i) =>
    `<button type="button" class="or-chip or-root${i === root ? " active" : ""}${n.length > 1 ? " is-sharp" : ""}" data-or-root="${i}" aria-pressed="${i === root}">${n}</button>`
  ).join("");

  let custom = "";
  if (isCustom) {
    const offs = getCustomTuning(getMachine().id);
    const cells = NOTE_NAMES.map((n, i) => {
      const v = offs[i] ?? 0;
      return `<label class="or-cent${Math.abs(v) > 0.001 ? " is-set" : ""}">
          <span class="or-cent-note">${n}</span>
          <input type="number" inputmode="decimal" class="or-cent-input" data-deg="${i}" min="-100" max="100" step="1" value="${Math.round(v * 10) / 10}" aria-label="${n} cents" />
        </label>`;
    }).join("");
    const status = sclStatusMsg
      ? `<div class="or-status ${sclStatusIsError ? "is-error" : "is-ok"}">${escapeHtml(sclStatusMsg)}</div>`
      : "";
    custom = `
      <div class="or-block">
        <div class="or-label-row">
          <span class="or-label">Cents per note <small>−100 … +100</small></span>
          <span class="or-actions">
            <input type="file" id="scl-file-input" accept=".scl,.txt" hidden />
            <button type="button" class="or-btn" data-or-action="import">Import .scl</button>
            <button type="button" class="or-btn" data-or-action="reset">Reset</button>
          </span>
        </div>
        ${status}
        <div class="or-cents">${cells}</div>
      </div>`;
  }

  const info = isCustom
    ? "Your own 12-note tuning, saved for this machine."
    : def.source;

  return `<div class="arp-pop oriental-pop" role="dialog" aria-label="Tuning settings"><div class="or-inner">
    <div class="or-head">
      <h4>TUNING</h4>
      <button type="button" class="or-switch${on ? " active" : ""}" data-or-action="toggle" role="switch" aria-checked="${on}">
        <span class="or-switch-track"><span class="or-switch-knob"></span></span>
        <span class="or-switch-lbl">${on ? "ON" : "OFF"}</span>
      </button>
      <button type="button" class="or-close" data-oriental-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </button>
    </div>

    <div class="or-block">
      <span class="or-label">Scale</span>
      <div class="or-scales">${scales}</div>
    </div>

    <div class="or-block">
      <span class="or-label">Tonic</span>
      <div class="or-roots">${roots}</div>
    </div>
    ${custom}
    <p class="or-info"><b>${escapeHtml(isCustom ? "Custom" : def.name)}${def.approx ? " (approx.)" : ""}</b> · ${escapeHtml(info)}</p>
  </div></div>`;
}

/** One source of truth for the ORIENTAL button label (see syncOriental in keyboard.ts). */
export function syncOrientalButton(): void {
  syncOriental();
  const tune = document.getElementById("kb-tune");
  if (tune) {
    tune.classList.toggle("is-open", open);
    tune.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

function render(): void {
  const prev = document.querySelector(".oriental-pop");
  const scroll = prev ? prev.scrollTop : 0;
  document.querySelectorAll(".oriental-pop").forEach((el) => el.remove());
  const panel = document.querySelector(".synth-panel");
  if (open && panel && getMachine().kind === "synth") {
    panel.insertAdjacentHTML("beforeend", html());
    const pop = document.querySelector(".oriental-pop");
    if (pop) pop.scrollTop = scroll;
    bindPanelEvents();
  }
  syncOrientalButton();
}

function applyCustom(offsets: number[]): void {
  const machineId = getMachine().id;
  setCustomTuning(machineId, offsets);
  if (getSynthPatch().tuning !== "custom") setSynthParam("tuning", "custom");
  updateCustomTuningOffsets();
}

function bindPanelEvents(): void {
  const pop = document.querySelector<HTMLElement>(".oriental-pop");
  if (!pop) return;

  pop.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const scale = t.closest<HTMLElement>("[data-or-scale]");
    if (scale) {
      const id = scale.dataset.orScale || "12tet";
      const def = TUNINGS[id];
      setSynthParam("tuning", id);
      if (def && id !== "custom" && id !== "12tet") setSynthParam("tuneRoot", def.tonic);
      // picking a maqam/dastgah means you want to hear it
      if (id !== "12tet" && getSynthPatch().oriental !== "on") setSynthParam("oriental", "on");
      render();
      return;
    }
    const rootBtn = t.closest<HTMLElement>("[data-or-root]");
    if (rootBtn) {
      setSynthParam("tuneRoot", Number(rootBtn.dataset.orRoot || 0));
      render();
      return;
    }
    const action = t.closest<HTMLElement>("[data-or-action]")?.dataset.orAction;
    if (action === "toggle") {
      setSynthParam("oriental", getSynthPatch().oriental === "on" ? "off" : "on");
      render();
    } else if (action === "import") {
      pop.querySelector<HTMLInputElement>("#scl-file-input")?.click();
    } else if (action === "reset") {
      sclStatusMsg = "";
      applyCustom(new Array(12).fill(0));
      render();
    }
  });

  pop.querySelectorAll<HTMLInputElement>(".or-cent-input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const deg = parseInt(inp.dataset.deg || "0", 10);
      let val = parseFloat(inp.value);
      if (!isFinite(val)) val = 0;
      val = Math.max(-100, Math.min(100, val));
      const current = getCustomTuning(getMachine().id).slice();
      current[deg] = val;
      applyCustom(current);
      render();
    });
  });

  const sclInput = pop.querySelector<HTMLInputElement>("#scl-file-input");
  if (sclInput) {
    sclInput.addEventListener("change", () => {
      const file = sclInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = parseScalaScl(String(e.target?.result || ""));
        if (res.ok) {
          applyCustom(res.offsets);
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

  // ORIENTAL: a plain on/off toggle
  const btn = document.getElementById("kb-oriental");
  if (btn) {
    btn.addEventListener("click", () => {
      setSynthParam("oriental", getSynthPatch().oriental === "on" ? "off" : "on");
    });
  }

  // Tuning settings button opens / closes the panel
  const tune = document.getElementById("kb-tune");
  if (tune) {
    tune.addEventListener("click", () => setOrientalOpen(!open));
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
      if (open) render();
      else syncOrientalButton();
    }
  });

  syncOrientalButton();
}
