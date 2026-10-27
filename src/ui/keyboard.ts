import { centsFor, downKeys, getMachine, getSynthPatch, isNoteSounding, midiToName, noteOff, noteOn, NOTE_NAMES, onParamChange, prepareAudio, releasePhysicalNotes, setModWheel, setPitchBend, setSynthParam } from "../engine/synth";
import { getCustomTuning } from "../engine/params";
import { getScale, keyMap, KeyInfo, spellScale, TONIC_NAMES } from "../engine/scales";
import { drumLabel, DRUM_NOTES, DRUM_VOICES } from "../engine/drums";

/** Computer keys for the 8 drum pads (home row). */
const DRUM_KEYMAP: Record<string, number> = {
  a: DRUM_NOTES.kick, s: DRUM_NOTES.snare, d: DRUM_NOTES.clap, f: DRUM_NOTES.ch,
  g: DRUM_NOTES.oh, h: DRUM_NOTES.tom, j: DRUM_NOTES.rim, k: DRUM_NOTES.bell
};
const DRUM_KEY_LETTERS = ["A", "S", "D", "F", "G", "H", "J", "K"];

let baseMidi = 48; // C3
const MIN_BASE = 24; // C1
const MAX_BASE = 84; // C6 (keyboard then ends on C8)

/** Pitch-class map of the active oriental scale, or null when ORIENTAL is off. */
function activeKeyMap(): KeyInfo[] | null {
  const p = getSynthPatch();
  if (p.oriental !== "on" || getMachine().kind === "drums") return null;
  const id = String(p.tuning || "shur");
  return keyMap(id, Number(p.tuneRoot) || 0, Number(p.scaleAlt) || 0, String(p.microTone || "24tet"),
    id === "custom" ? getCustomTuning(getMachine().id) : undefined);
}

export function getBaseMidi(): number {
  return baseMidi;
}

function fmtCentBadge(c: number): string {
  const rounded = Math.round(c * 10) / 10;
  if (Number.isInteger(rounded)) return (rounded > 0 ? "+" : "") + rounded;
  return (rounded > 0 ? "+" : "") + rounded.toFixed(1);
}

function syncMachineBadge(): void {
  const m = getMachine();
  document.documentElement.setAttribute("data-machine", m.id);
  const badge = document.getElementById("kb-machine-badge");
  const nameEl = document.getElementById("kb-machine-name");
  const roleEl = document.getElementById("kb-machine-role");
  if (badge) badge.setAttribute("data-machine", m.id);
  if (nameEl) nameEl.textContent = m.name;
  if (roleEl) roleEl.textContent = m.role;
}

export function renderKeyboard(): void {
  const kb = document.getElementById("kb");
  if (!kb) return;
  syncMachineBadge();
  syncHold();
  syncOriental();
  const area = kb.closest(".kb-area");
  const drums = getMachine().kind === "drums";
  if (area) area.classList.toggle("is-drums", drums);
  kb.classList.toggle("is-pads", drums);
  if (drums) {
    // the drum machine plays 8 pads instead of a keyboard
    kb.style.removeProperty("--whites");
    kb.innerHTML = DRUM_VOICES.map((v, i) =>
      `<div class="key pad" data-midi="${DRUM_NOTES[v]}"><span class="pad-name">${drumLabel(v)}</span><span class="pad-key">${DRUM_KEY_LETTERS[i]}</span></div>`
    ).join("");
    return;
  }

  const whites: number[] = [];
  const blacks: number[] = [];
  for (let m = baseMidi; m <= baseMidi + 24; m++) {
    (NOTE_NAMES[m % 12].includes("#") ? blacks : whites).push(m);
  }

  const map = activeKeyMap();
  kb.classList.toggle("is-oriental", !!map);

  const keyClass = (m: number) => {
    if (!map) return "";
    const k = map[((m % 12) + 12) % 12];
    if (!k.inScale) return " out-scale";
    return " in-scale" + (k.isRoot ? " is-root" : "") + (Math.abs(k.cents) > 0.001 ? " is-micro" : "");
  };
  const renderKeyContent = (m: number, nameLabel: string) => {
    const labelHtml = nameLabel ? `<span class="key-lbl">${nameLabel}</span>` : "";
    if (!map) return labelHtml;
    const k = map[((m % 12) + 12) % 12];
    const c = centsFor(m);
    const badge = k.inScale && Math.abs(c) > 0.001 ? `<span class="key-cents">${fmtCentBadge(c)}</span>` : "";
    const mark = k.inScale ? `<span class="key-mark" aria-hidden="true"></span>` : "";
    return `${badge}${mark}${labelHtml}`;
  };

  kb.style.setProperty("--whites", String(whites.length));
  kb.innerHTML =
    whites.map((m) => {
      const sounding = isNoteSounding(m) ? " is-pressed" : "";
      return `<div class="key${keyClass(m)}${sounding}" data-midi="${m}">${renderKeyContent(m, m % 12 === 0 ? midiToName(m) : "")}</div>`;
    }).join("") +
    blacks.map((m) => {
      const leftWhite = whites.indexOf(m - 1);
      const left = ((leftWhite + 1) / whites.length) * 100;
      const sounding = isNoteSounding(m) ? " is-pressed" : "";
      return `<div class="key black${keyClass(m)}${sounding}" data-midi="${m}" style="left:calc(${left}% - (100% / ${whites.length} * 0.29))">${renderKeyContent(m, "")}</div>`;
    }).join("");

  const rangeEl = document.getElementById("kb-range");
  if (rangeEl) {
    rangeEl.textContent = midiToName(baseMidi) + " – " + midiToName(baseMidi + 24);
  }
  syncMini();
}

/** Range slider above the keys: a mini keyboard C1–C8 with the visible window. */
function syncMini(): void {
  const win = document.querySelector<HTMLElement>(".kb-mini-win");
  const mini = document.getElementById("kb-mini");
  if (!win || !mini) return;
  const span = MAX_BASE + 24 - MIN_BASE;
  win.style.left = ((baseMidi - MIN_BASE) / span) * 100 + "%";
  win.style.width = (24 / span) * 100 + "%";
  mini.setAttribute("aria-valuenow", String(baseMidi));
  mini.setAttribute("aria-valuetext", midiToName(baseMidi) + " – " + midiToName(baseMidi + 24));
}

function setBase(next: number): void {
  next = Math.max(MIN_BASE, Math.min(MAX_BASE, Math.round((next - MIN_BASE) / 12) * 12 + MIN_BASE));
  if (next === baseMidi) return;
  baseMidi = next;
  renderKeyboard();
}

function initMini(): void {
  const mini = document.getElementById("kb-mini");
  if (!mini) return;
  const span = MAX_BASE + 24 - MIN_BASE;
  let id: number | null = null;
  let grab = 0; // where inside the window the pointer grabbed (in notes)
  const noteAt = (x: number) => {
    const r = mini.getBoundingClientRect();
    return MIN_BASE + ((x - r.left) / Math.max(1, r.width)) * span;
  };
  mini.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    id = e.pointerId;
    try { mini.setPointerCapture(id); } catch (err) {}
    const n = noteAt(e.clientX);
    const inside = n >= baseMidi && n <= baseMidi + 24;
    grab = inside ? n - baseMidi : 12;
    mini.classList.add("dragging");
    setBase(n - grab);
  });
  mini.addEventListener("pointermove", (e) => { if (e.pointerId === id) setBase(noteAt(e.clientX) - grab); });
  const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; mini.classList.remove("dragging"); };
  mini.addEventListener("pointerup", end);
  mini.addEventListener("pointercancel", end);
  mini.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: -12, ArrowDown: -12, ArrowRight: 12, ArrowUp: 12 }[e.key];
    if (!d) return;
    e.preventDefault();
    setBase(baseMidi + d);
  });
}

function syncHold(): void {
  const btn = document.getElementById("kb-hold");
  if (!btn) return;
  const on = getSynthPatch().hold === "on";
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

export function syncOriental(): void {
  const btn = document.getElementById("kb-oriental");
  const notesEl = document.getElementById("kb-scale-notes");
  if (!btn) return;
  const p = getSynthPatch();
  const on = p.oriental === "on";
  const id = String(p.tuning || "shur");
  const tonic = ((Number(p.tuneRoot) || 0) % 12 + 12) % 12;
  const def = getScale(id);
  const scaleName = id === "custom" ? "Custom" : def ? def.name : "Scale";
  const label = `${TONIC_NAMES[tonic]} ${scaleName}`;
  const lbl = btn.querySelector(".kb-or-scale");
  if (lbl) lbl.textContent = on ? label : "";
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-label", on ? `Oriental tuning on: ${label}. Open tuning settings` : "Oriental tuning off. Open tuning settings");
  btn.title = on ? `${label}${def?.approx ? " (approximate)" : ""}: tap to change scale or turn off` : "Oriental scales: tap to choose a dastgah or maqam";
  if (notesEl) {
    if (!on) notesEl.innerHTML = "";
    else if (id === "custom") notesEl.innerHTML = `<span class="sn-hint">Custom cents per note</span>`;
    else {
      notesEl.innerHTML = spellScale(id, tonic, Number(p.scaleAlt) || 0, String(p.microTone || "24tet")).map((n, i) =>
        `<span class="sn${i === 0 ? " sn-root" : ""}${n.micro ? " sn-micro" : ""}" title="${n.micro ? (n.micro === "k" ? "koron / half-flat " : "sori / half-sharp ") + fmtCentBadge(n.cents) + "¢" : ""}">${n.letter}${n.acc}${n.micro ? `<sup>${n.micro === "k" ? "k" : "s"}</sup>` : ""}</span>`
      ).join("");
    }
  }
  const strip = document.querySelector(".kb-strip");
  if (strip) strip.classList.toggle("is-oriental", on);
}

/** Pitch bend (springs back to centre) and mod wheel (stays), beside the keys. */
function initWheels(): void {
  document.querySelectorAll<HTMLElement>(".kb-wheel").forEach((el) => {
    const bend = el.dataset.wheel === "bend";
    let id: number | null = null;
    const show = (n: number) => {
      el.style.setProperty("--v", n.toFixed(3));
      el.setAttribute("aria-valuenow", (bend ? n * 2 - 1 : n).toFixed(2));
    };
    const apply = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const n = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      show(n);
      if (bend) setPitchBend(n * 2 - 1);
      else setModWheel(n);
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch (err) {}
      prepareAudio();
      apply(e);
    });
    el.addEventListener("pointermove", (e) => { if (e.pointerId === id) apply(e); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (bend) { show(0.5); setPitchBend(0); }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  });
}

export function shiftOctave(d: number): void {
  setBase(baseMidi + d * 12);
}

function keyAt(kbEl: HTMLElement, x: number, y: number): number | null {
  // Geometry hit-test (black keys first, they sit on top); works during pointer capture
  const blackKeys = Array.from(kbEl.querySelectorAll(".key.black")) as HTMLElement[];
  const whiteKeys = Array.from(kbEl.querySelectorAll(".key:not(.black)")) as HTMLElement[];
  const keys = blackKeys.concat(whiteKeys);

  for (const k of keys) {
    const r = k.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
      return Number(k.dataset.midi);
    }
  }
  return null;
}

const KEYMAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16
};

export function initKeyboardInteractions(): void {
  const octDownBtn = document.getElementById("oct-down");
  const octUpBtn = document.getElementById("oct-up");

  if (octDownBtn) octDownBtn.addEventListener("click", () => shiftOctave(-1));
  if (octUpBtn) octUpBtn.addEventListener("click", () => shiftOctave(1));
  const holdBtn = document.getElementById("kb-hold");
  if (holdBtn) {
    const toggleHold = () => setSynthParam("hold", getSynthPatch().hold === "on" ? "off" : "on");
    holdBtn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      toggleHold();
    });
    holdBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleHold();
      }
    });
  }
  
  onParamChange((k) => {
    if (k === "hold") syncHold();
    if (k === "oriental" || k === "tuning" || k === "tuneRoot" || k === "scaleAlt" || k === "microTone") {
      syncOriental();
      renderKeyboard();
    }
  });
  initWheels();
  initMini();

  // Pointer tracking for mouse + touch multi-touch with glide
  const pointerNotes = new Map<number, number>(); // pointerId -> midi
  const kbEl = document.getElementById("kb");

  if (kbEl) {
    kbEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const m = keyAt(kbEl, e.clientX, e.clientY);
      if (m == null) return;
      e.preventDefault();
      try {
        kbEl.setPointerCapture(e.pointerId);
      } catch (err) {}
      pointerNotes.set(e.pointerId, m);
      noteOn(m);
    });

    kbEl.addEventListener("pointermove", (e) => {
      if (!pointerNotes.has(e.pointerId)) return;
      const m = keyAt(kbEl, e.clientX, e.clientY);
      const prev = pointerNotes.get(e.pointerId);
      if (m != null && m !== prev) {
        if (prev != null) noteOff(prev);
        pointerNotes.set(e.pointerId, m);
        noteOn(m);
      }
    });

    const endPointer = (e: PointerEvent) => {
      const m = pointerNotes.get(e.pointerId);
      if (m != null) {
        pointerNotes.delete(e.pointerId);
        noteOff(m);
      }
    };

    kbEl.addEventListener("pointerup", endPointer);
    kbEl.addEventListener("pointercancel", endPointer);
    kbEl.addEventListener("lostpointercapture", endPointer);
  }

  // Computer keyboard listener
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".sk, input, textarea, select")) return;

    const k = e.key.toLowerCase();
    if (k === "z" && getMachine().kind !== "drums") {
      shiftOctave(-1);
      return;
    }
    if (k === "x" && getMachine().kind !== "drums") {
      shiftOctave(1);
      return;
    }

    if (getMachine().kind === "drums") {
      if (k in DRUM_KEYMAP && !downKeys.has(k)) {
        downKeys.set(k, DRUM_KEYMAP[k]);
        noteOn(DRUM_KEYMAP[k], 0.9);
      }
      return;
    }
    if (k in KEYMAP && !downKeys.has(k)) {
      const m = baseMidi + KEYMAP[k];
      downKeys.set(k, m);
      noteOn(m);
    }
  });

  document.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (downKeys.has(k)) {
      const midi = downKeys.get(k)!;
      noteOff(midi);
      downKeys.delete(k);
    }
  });

  // Blur and tab visibility handlers release only physically held keys
  window.addEventListener("blur", () => {
    pointerNotes.forEach((m) => noteOff(m));
    pointerNotes.clear();
    releasePhysicalNotes();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pointerNotes.forEach((m) => noteOff(m));
      pointerNotes.clear();
      releasePhysicalNotes();
    }
  });
}
