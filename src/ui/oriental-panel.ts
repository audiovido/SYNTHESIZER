/**
 * SY-1 UI — Oriental scales panel
 *
 * One ORIENTAL button above the keys opens this panel. It holds the on/off
 * switch, the tonic (12 notes), the scale (Persian dastgah & avaz, Arabic
 * maqam, Custom), variable degrees, intonation (24-TET −50¢ or practice
 * ≈ −35¢) and, for Custom, 12 per-note cent offsets or a Scala (.scl) file.
 * Every scale is one template transposed to the chosen tonic (scales.ts).
 */

import { getCustomTuning, parseScalaScl, setCustomTuning } from "../engine/params";
import { getScale, SCALES, ScaleDef, spellScale, TONIC_NAMES } from "../engine/scales";
import { getMachine, getSynthPatch, onParamChange, setSynthParam, updateCustomTuningOffsets } from "../engine/synth";
import { setPanelRenderHook } from "./panel";
import { renderKeyboard, syncOriental } from "./keyboard";

let open = false;
let sclStatusMsg = "";
let sclStatusIsError = false;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function fmtCents(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? "+" : "") + (Number.isInteger(r) ? String(r) : r.toFixed(1));
}

function scaleChip(sc: ScaleDef, current: string): string {
  const on = sc.id === current;
  return `<button type="button" class="or-chip or-scale${on ? " active" : ""}" data-or-scale="${sc.id}" aria-pressed="${on}">
      <span class="or-chip-name">${escapeHtml(sc.name)}${sc.approx ? '<span class="or-approx" title="approximate: sources differ">~</span>' : ""}</span>
      <span class="or-chip-sub" lang="fa">${escapeHtml(sc.fa)}</span>
    </button>`;
}

function html(): string {
  const patch = getSynthPatch();
  const on = patch.oriental === "on";
  const id = String(patch.tuning || "shur");
  const tonic = ((Number(patch.tuneRoot) || 0) % 12 + 12) % 12;
  const alt = Number(patch.scaleAlt) || 0;
  const micro = String(patch.microTone || "24tet");
  const def = getScale(id);
  const isCustom = id === "custom";
  const curId = def ? def.id : id;

  const roots = TONIC_NAMES.map((n, i) =>
    `<button type="button" class="or-chip or-root${i === tonic ? " active" : ""}${n.length > 1 ? " is-sharp" : ""}" data-or-root="${i}" aria-pressed="${i === tonic}">${n}</button>`
  ).join("");

  const persian = SCALES.filter((s) => s.family === "persian").map((s) => scaleChip(s, curId)).join("");
  const arabic = SCALES.filter((s) => s.family === "arabic").map((s) => scaleChip(s, curId)).join("");
  const customChip = `<button type="button" class="or-chip or-scale${isCustom ? " active" : ""}" data-or-scale="custom" aria-pressed="${isCustom}"><span class="or-chip-name">Custom</span><span class="or-chip-sub">cents · .scl</span></button>`;

  let detail = "";
  if (isCustom) {
    const offs = getCustomTuning(getMachine().id);
    const cells = Array.from({ length: 12 }, (_, i) => {
      const v = offs[i] ?? 0;
      const name = TONIC_NAMES[(tonic + i) % 12];
      return `<label class="or-cent${Math.abs(v) > 0.001 ? " is-set" : ""}">
          <span class="or-cent-note">${name}</span>
          <input type="number" inputmode="decimal" class="or-cent-input" data-deg="${i}" min="-100" max="100" step="1" value="${Math.round(v * 10) / 10}" aria-label="${name} cents" />
        </label>`;
    }).join("");
    const status = sclStatusMsg ? `<div class="or-status ${sclStatusIsError ? "is-error" : "is-ok"}">${escapeHtml(sclStatusMsg)}</div>` : "";
    detail = `
      <div class="or-block">
        <div class="or-label-row">
          <span class="or-label">Cents per note <small>−100 … +100, from ${TONIC_NAMES[tonic]}</small></span>
          <span class="or-actions">
            <input type="file" id="scl-file-input" accept=".scl,.txt" hidden />
            <button type="button" class="or-btn" data-or-action="import">Import .scl</button>
            <button type="button" class="or-btn" data-or-action="reset">Reset</button>
          </span>
        </div>
        ${status}
        <div class="or-cents">${cells}</div>
      </div>`;
  } else if (def) {
    const notes = spellScale(def.id, tonic, alt, micro).map((n, i) =>
      `<span class="or-note${i === 0 ? " is-root" : ""}${n.micro ? " is-micro" : ""}"><b>${n.letter}${n.acc}${n.micro ? `<sup>${n.micro}</sup>` : ""}</b>${n.micro ? `<small>${fmtCents(n.cents)}</small>` : ""}</span>`
    ).join("");
    const alts = (def.alts || []).map((a, i) => {
      const act = (alt & (1 << i)) !== 0;
      return `<button type="button" class="or-chip or-alt${act ? " active" : ""}" data-or-alt="${i}" aria-pressed="${act}">${escapeHtml(a.label)}</button>`;
    }).join("");
    detail = `
      <div class="or-block">
        <span class="or-label">${escapeHtml(TONIC_NAMES[tonic] + " " + def.name)} <small>k = koron / half-flat · s = sori / half-sharp</small></span>
        <div class="or-notes">${notes}</div>
        ${alts ? `<div class="or-alts"><span class="or-label">Variable degrees</span>${alts}</div>` : ""}
      </div>`;
  }

  const microSeg = `<div class="or-seg" role="radiogroup" aria-label="Quarter-tone size">
      <button type="button" class="or-chip${micro === "24tet" ? " active" : ""}" data-or-micro="24tet" role="radio" aria-checked="${micro === "24tet"}">24-TET <small>−50¢</small></button>
      <button type="button" class="or-chip${micro === "practice" ? " active" : ""}" data-or-micro="practice" role="radio" aria-checked="${micro === "practice"}">Practice <small>≈ −35¢</small></button>
    </div>`;

  const info = isCustom ? "Your own 12-note tuning, saved for this machine." : def ? def.note : "";

  return `<div class="arp-pop oriental-pop" role="dialog" aria-label="Oriental scales"><div class="or-inner">
    <div class="or-head">
      <h4>ORIENTAL</h4>
      <button type="button" class="or-switch${on ? " active" : ""}" data-or-action="toggle" role="switch" aria-checked="${on}">
        <span class="or-switch-track"><span class="or-switch-knob"></span></span>
        <span class="or-switch-lbl">${on ? "ON" : "OFF"}</span>
      </button>
      <button type="button" class="or-close" data-oriental-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </button>
    </div>
    <div class="or-block">
      <span class="or-label">Tonic</span>
      <div class="or-roots">${roots}</div>
    </div>
    <div class="or-block">
      <span class="or-label">Persian · dastgah &amp; avaz</span>
      <div class="or-scales">${persian}</div>
    </div>
    <div class="or-block">
      <span class="or-label">Arabic · maqam</span>
      <div class="or-scales">${arabic}${customChip}</div>
    </div>
    ${detail}
    <div class="or-block or-micro">
      <span class="or-label">Quarter tone</span>
      ${microSeg}
    </div>
    <p class="or-info">${def?.approx ? "<b>Approximate.</b> " : ""}${escapeHtml(info)}</p>
  </div></div>`;
}

function render(): void {
  const prev = document.querySelector(".oriental-pop");
  const scroll = prev ? prev.scrollTop : 0;
  document.querySelectorAll(".oriental-pop").forEach((el) => el.remove());
  const panel = document.querySelector(".synth-panel");
  if (open && panel && getMachine().kind !== "drums") {
    panel.insertAdjacentHTML("beforeend", html());
    const pop = document.querySelector(".oriental-pop");
    if (pop) pop.scrollTop = scroll;
    bindPanelEvents();
  }
  const btn = document.getElementById("kb-oriental");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn?.classList.toggle("is-open", open);
  syncOriental();
}

function applyCustom(offsets: number[]): void {
  setCustomTuning(getMachine().id, offsets);
  if (getSynthPatch().tuning !== "custom") setSynthParam("tuning", "custom");
  updateCustomTuningOffsets();
  renderKeyboard();
}

function bindPanelEvents(): void {
  const pop = document.querySelector<HTMLElement>(".oriental-pop");
  if (!pop) return;

  pop.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const scale = t.closest<HTMLElement>("[data-or-scale]");
    if (scale) {
      const id = scale.dataset.orScale || "shur";
      if (getSynthPatch().tuning !== id) {
        setSynthParam("scaleAlt", 0);
        setSynthParam("tuning", id);
      }
      // picking a scale means you want to hear it
      if (getSynthPatch().oriental !== "on") setSynthParam("oriental", "on");
      render();
      return;
    }
    const rootBtn = t.closest<HTMLElement>("[data-or-root]");
    if (rootBtn) {
      setSynthParam("tuneRoot", Number(rootBtn.dataset.orRoot || 0));
      if (getSynthPatch().oriental !== "on") setSynthParam("oriental", "on");
      render();
      return;
    }
    const altBtn = t.closest<HTMLElement>("[data-or-alt]");
    if (altBtn) {
      const bit = 1 << Number(altBtn.dataset.orAlt || 0);
      setSynthParam("scaleAlt", (Number(getSynthPatch().scaleAlt) || 0) ^ bit);
      render();
      return;
    }
    const microBtn = t.closest<HTMLElement>("[data-or-micro]");
    if (microBtn) {
      setSynthParam("microTone", microBtn.dataset.orMicro || "24tet");
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

  // ORIENTAL: one button; it opens the panel (the on/off switch lives inside)
  document.getElementById("kb-oriental")?.addEventListener("click", () => setOrientalOpen(!open));

  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-oriental-close]")) setOrientalOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setOrientalOpen(false);
  });

  onParamChange((k) => {
    if (k === "oriental" || k === "tuning" || k === "tuneRoot" || k === "scaleAlt" || k === "microTone") {
      if (open) render();
      else syncOriental();
    }
  });

  syncOriental();
}
