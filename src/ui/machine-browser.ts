/**
 * SY-1 UI — Instrument browser (inspired by the Korg Gadget gadget list).
 *
 * The machine name in the top bar opens a full-screen browser with two
 * shelves, Synthesizers and Drum machines. Every instrument has a card: a
 * small drawing of its front panel in its own colours, its role, a short
 * introduction and what is inside. Tapping a card loads the instrument.
 */

import { escapeHtml } from "../engine/params";
import { getMachine, getMachines, onMachineChange, setMachine } from "../engine/synth";
import type { MachineArt, MachineDef } from "../machines/types";

let open = false;
let shelf: "synth" | "drums" = "synth";

// --------------------------------------------------------------- art ----
// Every card is a 200 x 120 front panel: body, inset faceplate, then a face.
const W = 200;
const H = 120;

function knob(x: number, y: number, r: number, a: MachineArt, angle = -40): string {
  const rad = ((angle - 90) * Math.PI) / 180;
  return `<circle cx="${x}" cy="${y}" r="${r + 2.2}" fill="none" stroke="${a.accent}" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="2 2.2" />
    <circle cx="${x}" cy="${y}" r="${r}" fill="${a.body}" stroke="rgba(255,255,255,.18)" />
    <line x1="${x}" y1="${y}" x2="${(x + Math.cos(rad) * r * 0.8).toFixed(1)}" y2="${(y + Math.sin(rad) * r * 0.8).toFixed(1)}" stroke="${a.accent}" stroke-width="1.8" stroke-linecap="round" />`;
}

function keys(a: MachineArt, x = 14, y = 86, w = 172, h = 26, n = 15): string {
  const kw = w / n;
  let s = `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="2" fill="${a.body}" />`;
  for (let i = 0; i < n; i++) s += `<rect x="${(x + i * kw).toFixed(1)}" y="${y}" width="${(kw - 0.8).toFixed(1)}" height="${h}" rx="1" fill="#f4f1ea" />`;
  const blacks = [0, 1, 3, 4, 5];
  for (let i = 0; i < n - 1; i++) {
    if (!blacks.includes(i % 7)) continue;
    s += `<rect x="${(x + (i + 1) * kw - kw * 0.3).toFixed(1)}" y="${y}" width="${(kw * 0.6).toFixed(1)}" height="${(h * 0.6).toFixed(1)}" rx=".8" fill="#17171a" />`;
  }
  return s;
}

function knobRow(a: MachineArt, n: number, y: number, r = 6, x0 = 26, x1 = 174): string {
  let s = "";
  for (let i = 0; i < n; i++) s += knob(x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y, r, a, -120 + ((i * 67) % 240));
  return s;
}

function face(a: MachineArt): string {
  const ac = a.accent;
  const ac2 = a.accent2;
  switch (a.face) {
    case "keys":
      return `<rect x="14" y="18" width="40" height="18" rx="2" fill="#111" /><path d="M17 31 l5-9 5 9 5-9 5 9 5-9 5 9" fill="none" stroke="${ac}" stroke-width="1.4" />` +
        knobRow(a, 5, 27, 6, 72, 182) + knobRow(a, 6, 56, 5.5, 22, 178) + keys(a);
    case "lead":
      return knob(40, 40, 15, a, 30) + knob(92, 40, 15, a, -60) + knob(144, 40, 11, a, 90) +
        `<rect x="172" y="22" width="12" height="40" rx="3" fill="${a.body}" /><rect x="174" y="34" width="8" height="10" rx="2" fill="${ac}" />` + keys(a, 14, 80, 172, 32, 12);
    case "pad":
      return `<path d="M14 46 C 40 18, 60 70, 92 40 S 150 18, 186 44" fill="none" stroke="${ac}" stroke-width="3" stroke-linecap="round" opacity=".9" />
        <path d="M14 56 C 44 34, 70 76, 100 50 S 156 32, 186 56" fill="none" stroke="${ac2}" stroke-width="2.2" stroke-linecap="round" opacity=".85" />` +
        knobRow(a, 6, 70, 4.5, 24, 176) + keys(a, 14, 84, 172, 28);
    case "arp": {
      let s = "";
      const lv = [1, 3, 2, 5, 4, 6, 3, 7];
      lv.forEach((h, i) => { s += `<rect x="${22 + i * 20}" y="${64 - h * 6}" width="14" height="5" rx="1.5" fill="${i % 2 ? ac2 : ac}" />`; });
      return s + keys(a, 14, 80, 172, 32);
    }
    case "bass":
      return knob(48, 42, 22, a, 60) +
        `<path d="M86 42 q 10 -24 20 0 t 20 0 t 20 0 t 20 0" fill="none" stroke="${ac}" stroke-width="2.6" stroke-linecap="round" />
         <path d="M86 58 h 92" stroke="${ac2}" stroke-width="1.4" stroke-dasharray="4 3" />` + keys(a, 14, 82, 172, 30, 12);
    case "strings": {
      let s = `<path d="M30 16 L170 16 L190 100 L10 100 Z" fill="${a.body}" stroke="${ac2}" stroke-width="1.5" />`;
      for (let i = 0; i < 12; i++) {
        const y = 24 + i * 6.4;
        const xl = 30 - (y - 16) * (20 / 84);
        const xr = 170 + (y - 16) * (20 / 84);
        s += `<line x1="${xl.toFixed(1)}" y1="${y.toFixed(1)}" x2="${xr.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e9e1cf" stroke-opacity=".8" stroke-width=".8" />`;
      }
      s += `<g fill="${ac}">`;
      for (let i = 0; i < 6; i++) s += `<rect x="${70 + (i % 2) * 34}" y="${22 + i * 12.8}" width="4" height="7" rx="1" />`;
      s += `</g><path d="M60 108 l14 -22 M124 108 l14 -22" stroke="${ac}" stroke-width="2.4" stroke-linecap="round" />`;
      return s;
    }
    case "fm":
      return `<rect x="14" y="16" width="74" height="34" rx="3" fill="#20322f" /><g fill="${ac}"><rect x="24" y="24" width="12" height="8" rx="1" /><rect x="44" y="24" width="12" height="8" rx="1" /><rect x="34" y="38" width="12" height="8" rx="1" /><rect x="64" y="38" width="12" height="8" rx="1" /></g>
        <path d="M30 32 L40 38 M50 32 L40 38 M70 32 L70 38" stroke="${ac}" stroke-width="1" />` +
        [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${100 + i * 15}" y="16" width="4" height="40" rx="2" fill="${a.body}" opacity=".35" /><rect x="${96 + i * 15}" y="${20 + ((i * 11) % 26)}" width="12" height="7" rx="1.5" fill="${i === 2 ? a.accent2 : a.body}" />`).join("") +
        keys(a, 14, 66, 172, 46, 15);
    case "rings":
      return `<circle cx="70" cy="60" r="44" fill="none" stroke="${a.ink}" stroke-width="2" /><circle cx="70" cy="60" r="31" fill="none" stroke="${a.ink}" stroke-opacity=".7" stroke-width="2" /><circle cx="70" cy="60" r="18" fill="none" stroke="${a.ink}" stroke-opacity=".5" stroke-width="2" />` +
        [0, 3, 6, 10, 13].map((i) => { const t = (i / 16) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(70 + Math.cos(t) * 44).toFixed(1)}" cy="${(60 + Math.sin(t) * 44).toFixed(1)}" r="4.4" fill="${ac}" />`; }).join("") +
        [0, 4, 8].map((i) => { const t = (i / 12) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(70 + Math.cos(t) * 31).toFixed(1)}" cy="${(60 + Math.sin(t) * 31).toFixed(1)}" r="3.8" fill="${ac2}" />`; }).join("") +
        [0, 2, 5].map((i) => { const t = (i / 7) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(70 + Math.cos(t) * 18).toFixed(1)}" cy="${(60 + Math.sin(t) * 18).toFixed(1)}" r="3.2" fill="${a.ink}" />`; }).join("") +
        knob(150, 34, 9, a, 30) + knob(150, 66, 9, a, -70) + knob(150, 96, 7, a, 110);
    case "vector":
      return `<rect x="16" y="14" width="92" height="92" rx="6" fill="${a.body}" stroke="${ac}" stroke-opacity=".6" />
        <path d="M62 14 V106 M16 60 H108" stroke="${ac}" stroke-opacity=".2" />
        <ellipse cx="62" cy="60" rx="32" ry="22" fill="none" stroke="${ac2}" stroke-width="2" stroke-dasharray="5 3" transform="rotate(-25 62 60)" />
        <circle cx="86" cy="46" r="6" fill="${ac}" /><g font-family="sans-serif" font-size="9" font-weight="700" fill="${a.ink}" opacity=".8"><text x="21" y="25">A</text><text x="97" y="25">B</text><text x="21" y="101">C</text><text x="97" y="101">D</text></g>` +
        knob(140, 32, 9, a, 30) + knob(170, 32, 9, a, -50) + knob(140, 70, 9, a, 80) + knob(170, 70, 9, a, -110) + knob(155, 100, 7, a, 0);
    case "drone":
      return [0, 1, 2, 3, 4].map((i) => `<path d="M14 ${24 + i * 9} Q 60 ${20 + i * 9 + (i % 2 ? 6 : -6)}, 110 ${24 + i * 9}" fill="none" stroke="${ac}" stroke-opacity="${(0.9 - i * 0.15).toFixed(2)}" stroke-width="1.6" />`).join("") +
        knob(152, 46, 24, a, 140) + knobRow(a, 6, 96, 6, 24, 176);
    case "steps": {
      let s = knobRow(a, 8, 30, 6.5, 22, 178);
      s += `<rect x="14" y="48" width="172" height="14" rx="2" fill="${a.body}" opacity=".25" />`;
      const on = [0, 4, 6, 8, 12, 14];
      const pal = [ac, ac, a.accent2, a.accent2, "#f4f1ea", "#f4f1ea", ac, ac];
      for (let i = 0; i < 16; i++) {
        s += `<rect x="${15 + i * 10.7}" y="74" width="8.6" height="16" rx="1.6" fill="${pal[Math.floor(i / 2)]}" />`;
        s += `<circle cx="${19.3 + i * 10.7}" cy="68" r="1.8" fill="${on.includes(i) ? "#ff3b1f" : a.body}" opacity="${on.includes(i) ? 1 : 0.35}" />`;
      }
      return s + `<rect x="15" y="98" width="30" height="10" rx="2" fill="${a.body}" /><rect x="50" y="98" width="20" height="10" rx="2" fill="${ac}" />`;
    }
    case "kit":
      return `<ellipse cx="100" cy="82" rx="30" ry="30" fill="${a.body}" stroke="${ac}" stroke-width="2.5" /><ellipse cx="100" cy="82" rx="20" ry="20" fill="none" stroke="${ac}" stroke-opacity=".4" />
        <ellipse cx="60" cy="74" rx="15" ry="6" fill="#d9d4c7" /><rect x="45" y="74" width="30" height="12" fill="#bdb6a6" /><ellipse cx="60" cy="86" rx="15" ry="6" fill="#bdb6a6" />
        <ellipse cx="82" cy="40" rx="12" ry="5" fill="#d9d4c7" /><rect x="70" y="40" width="24" height="12" fill="#bdb6a6" />
        <ellipse cx="118" cy="40" rx="12" ry="5" fill="#d9d4c7" /><rect x="106" y="40" width="24" height="12" fill="#bdb6a6" />
        <ellipse cx="34" cy="38" rx="22" ry="5" fill="${ac}" /><line x1="34" y1="38" x2="34" y2="104" stroke="#999" stroke-width="1.5" />
        <ellipse cx="166" cy="30" rx="26" ry="6" fill="${a.accent2}" /><line x1="166" y1="30" x2="166" y2="104" stroke="#999" stroke-width="1.5" />`;
    case "frame": {
      let s = `<circle cx="70" cy="60" r="44" fill="#e9dcc0" stroke="${a.accent2}" stroke-width="6" />`;
      for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; s += `<circle cx="${(70 + Math.cos(t) * 39).toFixed(1)}" cy="${(60 + Math.sin(t) * 39).toFixed(1)}" r="2.2" fill="#8c6a2c" />`; }
      s += `<circle cx="70" cy="60" r="24" fill="none" stroke="#c9b48b" stroke-opacity=".6" />`;
      s += `<path d="M134 22 h40 l-8 42 q-4 8 -12 8 q-8 0 -12 -8 z" fill="#7a4a24" stroke="${a.accent2}" stroke-width="1.5" /><ellipse cx="154" cy="22" rx="20" ry="5" fill="#eadfc7" />
        <path d="M146 72 h16 l6 32 h-28 z" fill="#6a3f1f" stroke="${a.accent2}" stroke-width="1.5" />`;
      return s;
    }
    case "perc": {
      const conga = (x: number, w: number, top: number) =>
        `<path d="M${x - w / 2} ${top} h${w} l-4 ${100 - top} h-${w - 8} z" fill="${ac}" opacity=".9" /><ellipse cx="${x}" cy="${top}" rx="${w / 2}" ry="4" fill="#efe3d3" />`;
      let s = conga(40, 30, 30) + conga(76, 26, 40);
      s += `<rect x="108" y="44" width="76" height="52" rx="8" fill="#8a5a33" /><circle cx="146" cy="78" r="8" fill="#5b3a20" />`;
      for (let i = 0; i < 7; i++) { const h = 20 + Math.abs(3 - i) * 5; s += `<rect x="${116 + i * 9}" y="40" width="4" height="${h}" rx="2" fill="#e6e6e6" />`; }
      s += `<rect x="26" y="104" width="44" height="6" rx="3" fill="${a.accent2}" transform="rotate(-12 48 107)" />`;
      return s;
    }
  }
  return "";
}

export function machineArt(m: MachineDef): string {
  const a = m.art || { body: "#1c1d20", panel: "#2b2c31", accent: "#ffa62b", accent2: "#e07f12", ink: "#efece6", face: "keys" as const };
  return `<svg class="mb-art-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9" fill="${a.body}" />
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="6" fill="${a.panel}" />
    <rect x="6" y="6" width="${W - 12}" height="${(H - 12) / 2}" rx="6" fill="#fff" opacity=".05" />
    ${face(a)}
  </svg>`;
}

// ------------------------------------------------------------ render ----
function card(m: MachineDef): string {
  const cur = getMachine().id === m.id;
  const count = m.kind === "drums" && m.kits && m.styles
    ? `${m.kits.length} kits · ${m.styles.length} styles`
    : `${m.presets.length} sounds`;
  const tags = [count, ...(m.tags || [])].map((t) => `<span class="mb-tag">${escapeHtml(t)}</span>`).join("");
  return `<button type="button" class="mb-card${cur ? " active" : ""}" data-mb-pick="${escapeHtml(m.id)}" aria-pressed="${cur}" role="listitem">
      <span class="mb-art">${machineArt(m)}${cur ? '<span class="mb-cur">Playing</span>' : ""}</span>
      <span class="mb-info">
        <span class="mb-name"><b>${escapeHtml(m.name)}</b><span class="mb-role">${escapeHtml(m.role)}</span></span>
        <span class="mb-blurb">${escapeHtml(m.blurb || "")}</span>
        <span class="mb-tags">${tags}</span>
      </span>
    </button>`;
}

function html(): string {
  const all = getMachines();
  const synths = all.filter((m) => m.kind === "synth");
  const drums = all.filter((m) => m.kind === "drums");
  const list = shelf === "drums" ? drums : synths;
  const tab = (id: "synth" | "drums", label: string, n: number) =>
    `<button type="button" class="mb-tab${shelf === id ? " active" : ""}" role="tab" aria-selected="${shelf === id}" data-mb-shelf="${id}">${label} <small>${n}</small></button>`;
  return `<div class="mb-pop" role="dialog" aria-modal="true" aria-label="Instruments">
    <div class="mb-sheet">
      <div class="mb-head">
        <div class="mb-title"><b>Instruments</b><span>SY-1 Machines</span></div>
        <div class="mb-tabs" role="tablist" aria-label="Instrument type">${tab("synth", "Synthesizers", synths.length)}${tab("drums", "Drum machines", drums.length)}</div>
        <button type="button" class="mb-done" data-mb-close>Done</button>
      </div>
      <p class="mb-lead">${shelf === "drums"
        ? "Each drum machine has its own sound world. Pick a style (the rhythm) and a kit (the sounds) separately in its library."
        : "Every synthesizer has its own engine, panel and sound bank. Tap one to play it."}</p>
      <div class="mb-grid" role="list">${list.map(card).join("")}</div>
    </div>
  </div>`;
}

function render(): void {
  const prev = document.querySelector(".mb-grid");
  const scroll = prev ? prev.scrollTop : 0;
  document.querySelectorAll(".mb-pop").forEach((el) => el.remove());
  const btn = document.getElementById("machine-btn");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) return;
  document.body.insertAdjacentHTML("beforeend", html());
  const grid = document.querySelector(".mb-grid");
  if (grid) grid.scrollTop = scroll;
}

export function setMachineBrowserOpen(v: boolean): void {
  open = v;
  if (v) shelf = getMachine().kind === "drums" ? "drums" : "synth";
  render();
  if (v) {
    const active = document.querySelector(".mb-card.active");
    if (active) active.scrollIntoView({ block: "nearest" });
    document.querySelector<HTMLElement>(".mb-done")?.focus();
  }
}

export function initMachineBrowser(): void {
  onMachineChange(() => { if (open) render(); });
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#machine-btn")) { setMachineBrowserOpen(!open); return; }
    const pop = t.closest(".mb-pop");
    if (!pop) return;
    if (t.closest("[data-mb-close]") || !t.closest(".mb-sheet")) { setMachineBrowserOpen(false); return; }
    const sh = t.closest<HTMLElement>("[data-mb-shelf]");
    if (sh) {
      shelf = sh.dataset.mbShelf === "drums" ? "drums" : "synth";
      const grid = document.querySelector(".mb-grid");
      if (grid) grid.scrollTop = 0;
      render();
      return;
    }
    const pick = t.closest<HTMLElement>("[data-mb-pick]");
    if (pick) {
      const id = pick.dataset.mbPick || "";
      if (id !== getMachine().id) setMachine(id);
      setMachineBrowserOpen(false);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setMachineBrowserOpen(false);
  });
}
