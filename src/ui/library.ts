/**
 * SY-1 UI — Preset library (inspired by GarageBand's sound browser and the
 * Korg Gadget patch list).
 *
 * The preset name in the top bar opens a library over the panel: categories
 * on the side (All, Favorites, then the machine's own groups), a grid of
 * sound tiles with an icon per category, search, and favorites (★, saved
 * per machine). Tapping a tile loads it and plays a short preview; the
 * keyboard stays playable underneath, so you can audition sounds while you
 * browse. ◀ ▶ next to the name still step through presets.
 */

import { escapeHtml } from "../engine/params";
import { getMachine, getSynthPresetId, onMachineChange, onPresetChange } from "../engine/synth";
import type { PresetDef } from "../machines/types";
import { previewPreset, setPanelRenderHook } from "./panel";

let open = false;
let category = "all";
let query = "";

const favKey = (machineId: string) => `sy1.m.${machineId}.favs`;

function getFavs(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(favKey(getMachine().id)) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch (e) {
    return new Set();
  }
}

function toggleFav(id: string): void {
  const favs = getFavs();
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  try { localStorage.setItem(favKey(getMachine().id), JSON.stringify(Array.from(favs))); } catch (e) {}
}

// ------------------------------------------------------------- icons ----
type IconId = "pad" | "bass" | "lead" | "keys" | "organ" | "pluck" | "bell" | "arp" | "drone" | "fx" | "drum" | "wind" | "bowed" | "ring" | "brass" | "star" | "all";

const ICON_PATHS: Record<IconId, string> = {
  pad: '<path d="M3 15c3-6 5-6 9 0s6 6 9 0" /><path d="M3 10c3-6 5-6 9 0s6 6 9 0" opacity=".55" />',
  bass: '<path d="M4 18c0-6 4-12 8-12s8 6 8 12" /><circle cx="12" cy="17" r="2" />',
  lead: '<path d="M3 17l5-10 4 7 3-4 6 7" />',
  keys: '<rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M8 5v9M12 5v9M16 5v9" />',
  organ: '<path d="M5 20V9M9 20V6M13 20V4M17 20V7M21 20V10" /><path d="M3 20h20" />',
  pluck: '<path d="M6 3v18M18 3v18" /><path d="M6 12c4-3 8 3 12 0" />',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" />',
  arp: '<path d="M4 18h3v-4h3v-4h3V6h3v4h3v4" />',
  drone: '<path d="M3 12h18" /><path d="M3 8h18M3 16h18" opacity=".45" />',
  fx: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />',
  drum: '<ellipse cx="12" cy="8" rx="8" ry="3" /><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8" />',
  wind: '<path d="M4 15h11a3 3 0 1 0-3-3" /><path d="M4 11h6" /><path d="M4 19h8a2 2 0 1 1-2 2" opacity=".6" />',
  bowed: '<path d="M4 20L20 4" /><path d="M7 4c5 4 9 8 13 13" opacity=".6" />',
  ring: '<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="4" r="1.6" fill="currentColor" />',
  brass: '<path d="M3 10h8l7-5v14l-7-5H3z" />',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />',
  all: '<rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />'
};

/** GarageBand-style fixed hues per sound family (white glyph on a colored chip). */
const ICON_HUE: Record<IconId, string> = {
  pad: "#7b61ff", bass: "#e0572b", lead: "#e2348b", keys: "#2f8fdd", organ: "#b07a2a", pluck: "#1fa37a",
  bell: "#25a3c9", arp: "#d43ec7", drone: "#5b6b7a", fx: "#8a55d6", drum: "#e5a21a", wind: "#2fae9b",
  bowed: "#c0563a", ring: "#d6312b", brass: "#d98a1c", star: "#e8b400", all: "#6b7280"
};

function iconSvg(id: IconId, size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[id]}</svg>`;
}

function iconFor(group: string): IconId {
  const g = group.toLowerCase();
  const m = getMachine();
  if (m.kind === "drums") return "drum";
  if (m.id === "konya") return "ring";
  if (/pad|atmos|warm|bright|dark|cinematic|string machine/.test(g)) return "pad";
  if (/orbit/.test(g)) return "ring";
  if (/bell|mallet/.test(g)) return "bell";
  if (/bass|wobble|growl/.test(g)) return "bass";
  if (/arp|synthwave|sparkle|driving|groove/.test(g)) return "arp";
  if (/organ/.test(g)) return "organ";
  if (/piano|keys/.test(g)) return "keys";
  if (/brass/.test(g)) return "brass";
  if (/ney|flute|voice|reed/.test(g)) return "wind";
  if (/bowed/.test(g)) return "bowed";
  if (/santur|setar|tar|kanun|oud|pluck|world|other/.test(g)) return "pluck";
  if (/drone|texture|signal/.test(g)) return "drone";
  if (/fx|motion|rhythm/.test(g)) return "fx";
  if (/lead/.test(g)) return "lead";
  return "keys";
}

// ------------------------------------------------------------ render ----
function visiblePresets(): PresetDef[] {
  const m = getMachine();
  const favs = getFavs();
  const q = query.trim().toLowerCase();
  return m.presets.filter((p) => {
    if (category === "fav" && !favs.has(p.id)) return false;
    if (category !== "all" && category !== "fav" && p.group !== category) return false;
    if (q && !(`${p.name} ${p.group}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function groups(): string[] {
  const out: string[] = [];
  getMachine().presets.forEach((p) => { if (!out.includes(p.group)) out.push(p.group); });
  return out;
}

function catButton(id: string, label: string, icon: IconId, count: number): string {
  const active = category === id;
  return `<button type="button" class="lib-cat${active ? " active" : ""}" data-lib-cat="${escapeHtml(id)}" aria-pressed="${active}">
      <span class="lib-ico" style="--ico:${ICON_HUE[icon]}">${iconSvg(icon, 15)}</span>
      <span class="lib-cat-name">${escapeHtml(label)}</span><span class="lib-count">${count}</span>
    </button>`;
}

function html(): string {
  const m = getMachine();
  const favs = getFavs();
  const cur = getSynthPresetId();
  const cats = [
    catButton("all", "All sounds", "all", m.presets.length),
    catButton("fav", "Favorites", "star", m.presets.filter((p) => favs.has(p.id)).length),
    ...groups().map((g) => catButton(g, g, iconFor(g), m.presets.filter((p) => p.group === g).length))
  ].join("");
  const list = visiblePresets();
  const tiles = list.map((p) => {
    const icon = iconFor(p.group);
    const fav = favs.has(p.id);
    const active = p.id === cur;
    const sub = m.kind === "drums" && p.bpm ? `${escapeHtml(p.group)} · ${p.bpm} BPM` : escapeHtml(p.group);
    return `<div class="lib-tile${active ? " active" : ""}" role="listitem">
        <button type="button" class="lib-pick" data-lib-pick="${escapeHtml(p.id)}" aria-pressed="${active}">
          <span class="lib-ico lib-ico-lg" style="--ico:${ICON_HUE[icon]}">${iconSvg(icon, 20)}</span>
          <span class="lib-text"><span class="lib-name">${escapeHtml(p.name)}</span><span class="lib-sub">${sub}</span></span>
          ${active ? '<span class="lib-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}
        </button>
        <button type="button" class="lib-fav${fav ? " on" : ""}" data-lib-fav="${escapeHtml(p.id)}" aria-pressed="${fav}" aria-label="${fav ? "Remove from" : "Add to"} favorites">${iconSvg("star", 16)}</button>
      </div>`;
  }).join("");
  const empty = category === "fav" && !query
    ? `<p class="lib-empty">No favorites yet. Tap ☆ on a sound to keep it here.</p>`
    : `<p class="lib-empty">No sounds match “${escapeHtml(query)}”.</p>`;
  return `<div class="lib-pop" role="dialog" aria-label="Sound library">
    <div class="lib-head">
      <div class="lib-title"><b>${escapeHtml(m.name)}</b><span>${m.kind === "drums" ? "Kits" : "Sounds"} · ${m.presets.length}</span></div>
      <label class="lib-search"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input type="search" class="lib-q" placeholder="Search" value="${escapeHtml(query)}" aria-label="Search sounds" autocomplete="off" spellcheck="false" /></label>
      <button type="button" class="lib-done" data-lib-close>Done</button>
    </div>
    <div class="lib-body">
      <nav class="lib-cats" aria-label="Categories">${cats}</nav>
      <div class="lib-grid" role="list">${tiles || empty}</div>
    </div>
  </div>`;
}

function render(keepFocus = false): void {
  const prevGrid = document.querySelector(".lib-grid");
  const scroll = prevGrid ? prevGrid.scrollTop : 0;
  document.querySelectorAll(".lib-pop").forEach((el) => el.remove());
  const panel = document.querySelector(".synth-panel");
  const btn = document.getElementById("preset-btn");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open || !panel) return;
  panel.insertAdjacentHTML("beforeend", html());
  const grid = document.querySelector(".lib-grid");
  if (grid) grid.scrollTop = scroll;
  const q = document.querySelector<HTMLInputElement>(".lib-q");
  if (q) {
    q.addEventListener("input", () => {
      query = q.value;
      if (query && category !== "all") category = "all";
      render(true);
    });
    if (keepFocus) {
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }
}

export function setLibraryOpen(v: boolean): void {
  open = v;
  render();
  if (v) {
    const active = document.querySelector(".lib-tile.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }
}

export function initLibrary(): void {
  setPanelRenderHook(() => render());
  onMachineChange(() => {
    open = false;
    category = "all";
    query = "";
  });
  onPresetChange(() => {
    if (!open) return;
    document.querySelectorAll(".lib-tile").forEach((el) => {
      const id = el.querySelector<HTMLElement>("[data-lib-pick]")?.dataset.libPick;
      const on = id === getSynthPresetId();
      el.classList.toggle("active", on);
      const pick = el.querySelector(".lib-pick");
      if (pick) {
        pick.setAttribute("aria-pressed", String(on));
        const eq = pick.querySelector(".lib-eq");
        if (on && !eq) pick.insertAdjacentHTML("beforeend", '<span class="lib-eq" aria-hidden="true"><i></i><i></i><i></i></span>');
        if (!on && eq) eq.remove();
      }
    });
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#preset-btn")) {
      setLibraryOpen(!open);
      return;
    }
    if (!t.closest(".lib-pop")) return;
    if (t.closest("[data-lib-close]")) { setLibraryOpen(false); return; }
    const cat = t.closest<HTMLElement>("[data-lib-cat]");
    if (cat) {
      category = cat.dataset.libCat || "all";
      query = "";
      const grid = document.querySelector(".lib-grid");
      if (grid) grid.scrollTop = 0;
      render();
      return;
    }
    const fav = t.closest<HTMLElement>("[data-lib-fav]");
    if (fav) {
      toggleFav(fav.dataset.libFav || "");
      render();
      return;
    }
    const pick = t.closest<HTMLElement>("[data-lib-pick]");
    if (pick) previewPreset(pick.dataset.libPick || "");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setLibraryOpen(false);
  });
}
