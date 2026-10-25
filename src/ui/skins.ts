/**
 * SY-1 UI — Skins (visual themes)
 *
 * Every machine has its own skin (see src/machines). A skin only changes CSS
 * custom properties and a few material details (skins.css); it never changes
 * layout, controls or sound.
 */

let currentSkin = "";
const listeners = new Set<(id: string) => void>();

export function getSkin(): string {
  return currentSkin;
}

export function onSkinChange(cb: (id: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function applySkin(id: string): void {
  if (id === currentSkin) return;
  currentSkin = id;
  document.documentElement.setAttribute("data-skin", id);
  listeners.forEach((cb) => cb(id));
}

/** Colors the oscilloscope reads from the active skin's tokens. */
export function readScopeColors(): { line: string; grid: string } {
  const cs = getComputedStyle(document.documentElement);
  return {
    line: cs.getPropertyValue("--scope-line").trim() || "#F2B33D",
    grid: cs.getPropertyValue("--scope-grid").trim() || "rgba(242,179,61,0.18)"
  };
}
