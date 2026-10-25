/**
 * SY-1 UI — Skins (visual themes)
 *
 * A skin only changes CSS custom properties and a few material details
 * (see skins.css). It never changes layout, controls or sound.
 * Each skin will later move to its own machine (see SY-1-machines-spec.md).
 */

export interface SkinInfo {
  id: string;
  name: string;
}

export const SKINS: SkinInfo[] = [
  { id: "sy1", name: "SY-1 Amber" },
  { id: "isfahan", name: "Isfahan" },
  { id: "tabriz", name: "Tabriz" },
  { id: "merv", name: "Merv" },
  { id: "classic", name: "Classic" }
];

const STORAGE_KEY = "sy1_skin";
const DEFAULT_SKIN = "sy1";

let currentSkin = DEFAULT_SKIN;
const listeners = new Set<(id: string) => void>();

export function getSkin(): string {
  return currentSkin;
}

export function onSkinChange(cb: (id: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function applySkin(id: string): void {
  if (!SKINS.some((s) => s.id === id)) id = DEFAULT_SKIN;
  currentSkin = id;
  document.documentElement.setAttribute("data-skin", id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (e) {}
  listeners.forEach((cb) => cb(id));
}

/** Call before the first render so the page never flashes the wrong skin. */
export function initSkin(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (e) {}
  applySkin(saved || DEFAULT_SKIN);
}

export function renderSkinPicker(): string {
  const opts = SKINS.map(
    (s) => `<option value="${s.id}"${s.id === currentSkin ? " selected" : ""}>${s.name}</option>`
  ).join("");
  return `<label class="synth-skin">Skin <select class="synth-midi-select" id="skin-select" aria-label="Skin">${opts}</select></label>`;
}

export function initSkinPicker(): void {
  const sel = document.getElementById("skin-select") as HTMLSelectElement | null;
  if (!sel) return;
  sel.addEventListener("change", () => {
    applySkin(sel.value);
    sel.blur();
  });
}

/** Colors the oscilloscope reads from the active skin's tokens. */
export function readScopeColors(): { line: string; grid: string } {
  const cs = getComputedStyle(document.documentElement);
  return {
    line: cs.getPropertyValue("--scope-line").trim() || "#F2B33D",
    grid: cs.getPropertyValue("--scope-grid").trim() || "rgba(242,179,61,0.18)"
  };
}
