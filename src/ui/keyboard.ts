/**
 * SY-1 UI — On-Screen Keyboard & Computer Keyboard Handling
 */

import { allNotesOff, downKeys, getMachine, midiToName, noteOff, noteOn, NOTE_NAMES } from "../engine/synth";
import { DRUM_LABELS, DRUM_NOTES, DRUM_VOICES } from "../engine/drums";

/** Computer keys for the 8 drum pads (home row). */
const DRUM_KEYMAP: Record<string, number> = {
  a: DRUM_NOTES.kick, s: DRUM_NOTES.snare, d: DRUM_NOTES.clap, f: DRUM_NOTES.ch,
  g: DRUM_NOTES.oh, h: DRUM_NOTES.tom, j: DRUM_NOTES.rim, k: DRUM_NOTES.bell
};
const DRUM_KEY_LETTERS = ["A", "S", "D", "F", "G", "H", "J", "K"];

let baseMidi = 48; // C3

export function getBaseMidi(): number {
  return baseMidi;
}

export function renderKeyboard(): void {
  const kb = document.getElementById("kb");
  if (!kb) return;
  const area = kb.closest(".kb-area");
  const drums = getMachine().kind === "drums";
  if (area) area.classList.toggle("is-drums", drums);
  kb.classList.toggle("is-pads", drums);
  if (drums) {
    // the drum machine plays 8 pads instead of a keyboard
    kb.style.removeProperty("--whites");
    kb.innerHTML = DRUM_VOICES.map((v, i) =>
      `<div class="key pad" data-midi="${DRUM_NOTES[v]}"><span class="pad-name">${DRUM_LABELS[v]}</span><span class="pad-key">${DRUM_KEY_LETTERS[i]}</span></div>`
    ).join("");
    return;
  }

  const whites: number[] = [];
  const blacks: number[] = [];
  for (let m = baseMidi; m <= baseMidi + 24; m++) {
    (NOTE_NAMES[m % 12].includes("#") ? blacks : whites).push(m);
  }

  kb.style.setProperty("--whites", String(whites.length));
  kb.innerHTML =
    whites.map((m) => `<div class="key" data-midi="${m}">${m % 12 === 0 ? midiToName(m) : ""}</div>`).join("") +
    blacks.map((m) => {
      const leftWhite = whites.indexOf(m - 1);
      const left = ((leftWhite + 1) / whites.length) * 100;
      return `<div class="key black" data-midi="${m}" style="left:calc(${left}% - (100% / ${whites.length} * 0.31))"></div>`;
    }).join("");

  const rangeEl = document.getElementById("kb-range");
  if (rangeEl) {
    rangeEl.textContent = midiToName(baseMidi) + " – " + midiToName(baseMidi + 24);
  }
}

export function shiftOctave(d: number): void {
  const next = Math.max(24, Math.min(84, baseMidi + d * 12));
  if (next === baseMidi) return;
  allNotesOff();
  baseMidi = next;
  renderKeyboard();
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

  // Pointer tracking for mouse + touch multi-touch with glide
  const pointerNotes = new Map<number, number>(); // pointerId -> midi
  const kbEl = document.getElementById("kb");

  if (kbEl) {
    kbEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        kbEl.setPointerCapture(e.pointerId);
      } catch (err) {}
      const m = keyAt(kbEl, e.clientX, e.clientY);
      if (m == null) return;
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

  // Blur and tab visibility handlers
  window.addEventListener("blur", allNotesOff);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) allNotesOff();
  });
}
