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
import { applyDrumKit, applyDrumStyle, getDrumKitId, getKeepKit, getMachine, getSynthPresetId, isDrumKitEdited, onDrumKitChange, onMachineChange, onPresetChange, setKeepKit } from "../engine/synth";
import { DRUM_VOICES, isDrumPlaying, playDrum, startDrums } from "../engine/drums";
import { getAudioCtxIfAny } from "../engine/bus";
import type { DrumKitDef, DrumStyleDef, PresetDef } from "../machines/types";
import { previewPreset, setPanelRenderHook } from "./panel";

let open = false;
let category = "all";
let query = "";
/** Drum machines browse two lists: rhythms (styles) and sounds (kits). */
let tab: "styles" | "kits" = "styles";

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
type IconId = "machine" | "acoustic" | "frame" | "hand" | "hybrid" | "rhythm" | "pad" | "bass" | "lead" | "keys" | "organ" | "pluck" | "bell" | "arp" | "drone" | "fx" | "drum" | "wind" | "bowed" | "ring" | "brass" | "star" | "all";

const ICON_PATHS: Record<IconId, string> = {
  machine: '<rect x="3" y="5" width="18" height="14" rx="2" /><rect x="6" y="12" width="3" height="3" rx=".6" /><rect x="10.5" y="12" width="3" height="3" rx=".6" /><rect x="15" y="12" width="3" height="3" rx=".6" /><path d="M6 8.5h6" />',
  acoustic: '<ellipse cx="12" cy="8" rx="8" ry="3" /><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8" /><path d="M15 3l-3 5" />',
  frame: '<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5.5" opacity=".5" /><circle cx="12" cy="3.5" r="1.2" fill="currentColor" /><circle cx="20.5" cy="12" r="1.2" fill="currentColor" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" />',
  hand: '<path d="M8 4h8l-1.5 16h-5z" /><ellipse cx="12" cy="4" rx="4" ry="1.4" />',
  hybrid: '<rect x="3" y="9" width="9" height="10" rx="1.5" /><ellipse cx="16.5" cy="7" rx="4.5" ry="2" /><path d="M12 7v9c0 1 2 2 4.5 2s4.5-1 4.5-2V7" />',
  rhythm: '<path d="M3 17h2v-6h2v6h2V7h2v10h2v-4h2v4h2V9h2v8h2" />',
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
  machine: "#e0572b", acoustic: "#c98a2a", frame: "#b0443a", hand: "#1fa37a", hybrid: "#8a55d6", rhythm: "#2f8fdd",
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

function kitIcon(k: DrumKitDef): IconId {
  const p = k.patch as Record<string, unknown>;
  const models = Object.keys(p).filter((x) => x.endsWith("Model") && p[x]).length;
  const km = String(p.kitModel || getMachine().drumModel || "analog");
  if (models > 1 || (models === 1 && !p.kitModel)) return "hybrid";
  if (km === "acoustic" || km === "lm80" && getMachine().drumModel === "acoustic") return "acoustic";
  if (km === "persian") return "frame";
  if (km === "minimal") return "hand";
  return "machine";
}

const isDrums = () => getMachine().kind === "drums" && !!getMachine().styles;
const favId = (id: string) => (isDrums() && tab === "kits" ? "kit:" + id : id);

// ------------------------------------------------------------ render ----
interface Item { id: string; name: string; group: string; search: string }

function items(): Item[] {
  const m = getMachine();
  if (isDrums() && tab === "kits") return (m.kits || []).map((k) => ({ id: k.id, name: k.name, group: k.group, search: `${k.name} ${k.group} ${k.tag} ${k.desc}` }));
  if (isDrums()) return (m.styles || []).map((st) => ({ id: st.id, name: st.name, group: st.group, search: `${st.name} ${st.group} ${st.bpm}` }));
  return m.presets.map((p) => ({ id: p.id, name: p.name, group: p.group, search: `${p.name} ${p.group}` }));
}

function visiblePresets(): Item[] {
  const favs = getFavs();
  const q = query.trim().toLowerCase();
  return items().filter((p) => {
    if (category === "fav" && !favs.has(favId(p.id))) return false;
    if (category !== "all" && category !== "fav" && p.group !== category) return false;
    if (q && !p.search.toLowerCase().includes(q)) return false;
    return true;
  });
}

function groups(): string[] {
  const out: string[] = [];
  items().forEach((p) => { if (!out.includes(p.group)) out.push(p.group); });
  return out;
}

function catButton(id: string, label: string, icon: IconId, count: number): string {
  const active = category === id;
  return `<button type="button" class="lib-cat${active ? " active" : ""}" data-lib-cat="${escapeHtml(id)}" aria-pressed="${active}">
      <span class="lib-ico" style="--ico:${ICON_HUE[icon]}">${iconSvg(icon, 15)}</span>
      <span class="lib-cat-name">${escapeHtml(label)}</span><span class="lib-count">${count}</span>
    </button>`;
}

function drumTile(it: Item): string {
  const m = getMachine();
  const favs = getFavs();
  const fav = favs.has(favId(it.id));
  let active: boolean, icon: IconId, sub: string, desc = "";
  if (tab === "kits") {
    const k = (m.kits || []).find((x) => x.id === it.id) as DrumKitDef;
    active = k.id === getDrumKitId();
    icon = kitIcon(k);
    sub = escapeHtml(k.tag) + (active && isDrumKitEdited() ? " · edited" : "");
    desc = `<span class="lib-desc">${escapeHtml(k.desc)}</span>`;
  } else {
    const st = (m.styles || []).find((x) => x.id === it.id) as DrumStyleDef;
    const kit = (m.kits || []).find((x) => x.id === st.kit);
    active = st.id === getSynthPresetId();
    icon = "rhythm";
    const len = st.patterns[0]?.len === 12 ? " · 12 steps" : "";
    sub = `${st.bpm} BPM${len} · ${escapeHtml(kit ? kit.name : "")}`;
  }
  return `<div class="lib-tile${active ? " active" : ""}${desc ? " lib-tile-kit" : ""}" role="listitem">
      <button type="button" class="lib-pick" data-lib-pick="${escapeHtml(it.id)}" aria-pressed="${active}">
        <span class="lib-ico lib-ico-lg" style="--ico:${ICON_HUE[icon]}">${iconSvg(icon, 20)}</span>
        <span class="lib-text"><span class="lib-name">${escapeHtml(it.name)}</span><span class="lib-sub">${sub}</span>${desc}</span>
        ${active ? '<span class="lib-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}
      </button>
      <button type="button" class="lib-fav${fav ? " on" : ""}" data-lib-fav="${escapeHtml(favId(it.id))}" aria-pressed="${fav}" aria-label="${fav ? "Remove from" : "Add to"} favorites">${iconSvg("star", 16)}</button>
    </div>`;
}

function html(): string {
  const m = getMachine();
  const favs = getFavs();
  const cur = getSynthPresetId();
  const drums = isDrums();
  const all = items();
  const allIcon: IconId = drums ? (tab === "kits" ? "machine" : "rhythm") : "all";
  const cats = [
    catButton("all", drums ? (tab === "kits" ? "All kits" : "All styles") : "All sounds", allIcon, all.length),
    catButton("fav", "Favorites", "star", all.filter((p) => favs.has(favId(p.id))).length),
    ...groups().map((g) => {
      const first = drums && tab === "kits" ? (m.kits || []).find((k) => k.group === g) : undefined;
      const ic: IconId = drums ? (first ? kitIcon(first) : "rhythm") : iconFor(g);
      return catButton(g, g, ic, all.filter((p) => p.group === g).length);
    })
  ].join("");
  const list = visiblePresets();
  const tiles = list.map((p) => {
    if (drums) return drumTile(p);
    const icon = iconFor(p.group);
    const fav = favs.has(p.id);
    const active = p.id === cur;
    const sub = escapeHtml(p.group);
    return `<div class="lib-tile${active ? " active" : ""}" role="listitem">
        <button type="button" class="lib-pick" data-lib-pick="${escapeHtml(p.id)}" aria-pressed="${active}">
          <span class="lib-ico lib-ico-lg" style="--ico:${ICON_HUE[icon]}">${iconSvg(icon, 20)}</span>
          <span class="lib-text"><span class="lib-name">${escapeHtml(p.name)}</span><span class="lib-sub">${sub}</span></span>
          ${active ? '<span class="lib-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}
        </button>
        <button type="button" class="lib-fav${fav ? " on" : ""}" data-lib-fav="${escapeHtml(p.id)}" aria-pressed="${fav}" aria-label="${fav ? "Remove from" : "Add to"} favorites">${iconSvg("star", 16)}</button>
      </div>`;
  }).join("");
  const what = drums ? (tab === "kits" ? "kit" : "style") : "sound";
  const empty = category === "fav" && !query
    ? `<p class="lib-empty">No favorites yet. Tap ☆ on a ${what} to keep it here.</p>`
    : `<p class="lib-empty">No ${what}s match “${escapeHtml(query)}”.</p>`;
  const tabs = drums
    ? `<div class="lib-tabs" role="tablist" aria-label="Browse">
        <button type="button" class="lib-tab${tab === "styles" ? " active" : ""}" role="tab" aria-selected="${tab === "styles"}" data-lib-tab="styles">Styles <small>${(m.styles || []).length}</small></button>
        <button type="button" class="lib-tab${tab === "kits" ? " active" : ""}" role="tab" aria-selected="${tab === "kits"}" data-lib-tab="kits">Kits <small>${(m.kits || []).length}</small></button>
      </div>`
    : "";
  const keep = drums && tab === "styles"
    ? `<button type="button" class="lib-keep${getKeepKit() ? " on" : ""}" data-lib-keep role="switch" aria-checked="${getKeepKit()}" title="On: a style plays on the kit you have loaded. Off: each style loads the kit it was written for.">Keep kit</button>`
    : "";
  const count = drums
    ? `${(m.styles || []).length} styles · ${(m.kits || []).length} kits`
    : `Sounds · ${m.presets.length}`;
  return `<div class="lib-pop${drums ? " is-drums" : ""}" role="dialog" aria-label="${drums ? "Styles and kits" : "Sound library"}">
    <div class="lib-head">
      <div class="lib-title"><b>${escapeHtml(m.name)}</b><span>${count}</span></div>
      ${tabs}
      <label class="lib-search"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input type="search" class="lib-q" placeholder="Search" value="${escapeHtml(query)}" aria-label="Search" autocomplete="off" spellcheck="false" /></label>
      ${keep}
      <button type="button" class="lib-done" data-lib-close>Done</button>
    </div>
    <div class="lib-body">
      <nav class="lib-cats" aria-label="Categories">${cats}</nav>
      <div class="lib-grid${drums && tab === "kits" ? " lib-grid-kits" : ""}" role="list">${tiles || empty}</div>
    </div>
  </div>`;
}

/** A one-bar audition of a kit when the sequencer is stopped. */
function auditionKit(): void {
  const ctx = getAudioCtxIfAny();
  if (!ctx || isDrumPlaying()) return;
  const t0 = ctx.currentTime + 0.05;
  const sd = 0.13;
  const seq: [string, number, number][] = [["kick", 0, 1], ["ch", 0, 0.7], ["ch", 1, 0.5], ["snare", 2, 1], ["ch", 2, 0.7], ["ch", 3, 0.5],
    ["kick", 4, 1], ["tom", 5, 0.8], ["rim", 5, 0.7], ["clap", 6, 1], ["oh", 6, 0.7], ["bell", 7, 0.8]];
  seq.forEach(([v, i, vel]) => { if ((DRUM_VOICES as readonly string[]).includes(v)) playDrum(v as any, vel, t0 + i * sd - ctx.currentTime); });
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
    tab = "styles";
  });
  onDrumKitChange(() => { if (open && tab === "kits") render(); });
  onPresetChange(() => {
    if (!open) return;
    if (isDrums()) { render(); return; }
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
    const tb = t.closest<HTMLElement>("[data-lib-tab]");
    if (tb) {
      tab = tb.dataset.libTab === "kits" ? "kits" : "styles";
      category = "all";
      query = "";
      render();
      const active = document.querySelector(".lib-tile.active");
      if (active) active.scrollIntoView({ block: "nearest" });
      return;
    }
    if (t.closest("[data-lib-keep]")) { setKeepKit(!getKeepKit()); render(); return; }
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
    if (pick) {
      const id = pick.dataset.libPick || "";
      if (!isDrums()) previewPreset(id);
      else if (tab === "kits") { applyDrumKit(id); auditionKit(); }
      else { applyDrumStyle(id); if (!isDrumPlaying()) startDrums(); }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setLibraryOpen(false);
  });
}
