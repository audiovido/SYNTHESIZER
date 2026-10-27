/**
 * SY-1 — Oriental scale templates (dastgah / avaz / maqam).
 *
 * Every scale is ONE template of 7 degrees, measured from the tonic:
 *   [semitones above the tonic, cents offset from 12-TET].
 * The same template is transposed to any of the 12 tonics. On the keyboard a
 * degree sits on the key named by its semitone (koron D = the D key, −50¢).
 * Keys outside the scale stay exact 12-TET.
 *
 * Quarter-tone convention: koron / half-flat = −50¢ and sori / half-sharp =
 * +50¢ (Vaziri 24-TET for Persian music, Cairo 1932 24-TET for Arabic maqam).
 * The "Practice" intonation scales every quarter-tone offset by 0.7 (≈ −35¢),
 * closer to how koron is usually played (Farhat 1990 measures ~−30…−40¢).
 *
 * Sources: H. Farhat, "The Dastgah Concept in Persian Music" (1990);
 * A. N. Vaziri 24-TET; D. Talai radif; H. H. Touma, "The Music of the Arabs"
 * (1996); maqamworld.com. Entries marked approx: sources disagree or practice
 * varies a lot; the player's ear decides.
 */

export type Degree = [semis: number, cents: number];

export interface ScaleAlt {
  /** index (0..6) of the degree this alternative replaces */
  deg: number;
  to: Degree;
  label: string;
}

export interface ScaleDef {
  id: string;
  name: string;
  fa: string;
  family: "persian" | "arabic" | "custom";
  /** default tonic (pitch class 0..11) used by presets / first pick */
  tonic: number;
  degrees: Degree[];
  alts?: ScaleAlt[];
  approx?: boolean;
  note: string;
}

export const SCALES: ScaleDef[] = [
  // ---- Persian dastgah & avaz ----
  { id: "shur", name: "Shur", fa: "شور", family: "persian", tonic: 7,
    degrees: [[0, 0], [2, -50], [3, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    alts: [{ deg: 4, to: [7, -50], label: "5th koron" }, { deg: 5, to: [9, -50], label: "6th koron" }],
    note: "2nd degree koron. The 5th is often played koron when descending." },
  { id: "abuata", name: "Abu-Ata", fa: "ابوعطا", family: "persian", tonic: 7,
    degrees: [[0, 0], [2, -50], [3, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    note: "Avaz of Shur: same notes, melody centred on the 2nd–4th degrees." },
  { id: "dashti", name: "Dashti", fa: "دشتی", family: "persian", tonic: 7, approx: true,
    degrees: [[0, 0], [2, -50], [3, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    alts: [{ deg: 5, to: [9, -50], label: "6th koron" }],
    note: "Avaz of Shur centred on the 5th; the 6th is often koron." },
  { id: "bayattork", name: "Bayat-e Tork", fa: "بیات ترک", family: "persian", tonic: 5,
    degrees: [[0, 0], [2, 0], [4, 0], [5, 0], [7, 0], [9, 0], [11, -50]],
    note: "Avaz of Shur: major-like with a koron 7th." },
  { id: "afshari", name: "Afshari", fa: "افشاری", family: "persian", tonic: 0,
    degrees: [[0, 0], [2, 0], [4, -50], [5, 0], [7, 0], [8, 0], [10, 0]],
    note: "Avaz of Shur: koron 3rd." },
  { id: "homayoun", name: "Homayoun", fa: "همایون", family: "persian", tonic: 7,
    degrees: [[0, 0], [2, -50], [4, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    note: "Koron 2nd and natural 3rd: the 250¢ step is the colour of Homayoun." },
  { id: "esfahan", name: "Bayat-e Esfahan", fa: "بیات اصفهان", family: "persian", tonic: 7, approx: true,
    degrees: [[0, 0], [2, 0], [3, 0], [5, 0], [7, 0], [9, -50], [11, 0]],
    note: "Avaz of Homayoun: like harmonic minor with a koron 6th." },
  { id: "segah", name: "Segah", fa: "سه‌گاه", family: "persian", tonic: 0,
    degrees: [[0, 0], [2, -50], [4, -50], [5, 0], [7, -50], [9, -50], [11, -50]],
    note: "Traditionally on E koron; here the template starts on the chosen tonic." },
  { id: "chahargah", name: "Chahargah", fa: "چهارگاه", family: "persian", tonic: 0,
    degrees: [[0, 0], [2, -50], [4, 0], [5, 0], [7, 0], [9, -50], [11, 0]],
    note: "Two 250¢ steps (koron 2nd → 3rd, koron 6th → 7th)." },
  { id: "mahur", name: "Mahur", fa: "ماهور", family: "persian", tonic: 0,
    degrees: [[0, 0], [2, 0], [4, 0], [5, 0], [7, 0], [9, 0], [11, 0]],
    alts: [{ deg: 6, to: [10, 0], label: "♭7 (descent)" }, { deg: 5, to: [9, -50], label: "6th koron (Delkash)" }],
    note: "Major scale; ♭7 when descending, koron 6th in Delkash." },
  { id: "rastpanjgah", name: "Rast-Panjgah", fa: "راست‌پنجگاه", family: "persian", tonic: 0,
    degrees: [[0, 0], [2, 0], [4, 0], [5, 0], [7, 0], [9, 0], [11, 0]],
    note: "Same notes as Mahur; different modulations." },
  { id: "nava", name: "Nava", fa: "نوا", family: "persian", tonic: 7, approx: true,
    degrees: [[0, 0], [2, 0], [3, 0], [5, 0], [7, 0], [9, -50], [10, 0]],
    note: "Koron 6th." },

  // ---- Arabic maqam ----
  { id: "rast", name: "Rast", fa: "راست", family: "arabic", tonic: 0,
    degrees: [[0, 0], [2, 0], [4, -50], [5, 0], [7, 0], [9, 0], [11, -50]],
    alts: [{ deg: 6, to: [10, 0], label: "♭7 (descent)" }],
    note: "Half-flat 3rd and 7th; ♭7 when descending." },
  { id: "bayati", name: "Bayati", fa: "بیاتی", family: "arabic", tonic: 2,
    degrees: [[0, 0], [2, -50], [3, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    note: "Half-flat 2nd. Same 24-TET notes as Shur, different phrasing." },
  { id: "sikah", name: "Sikah", fa: "سیکاه", family: "arabic", tonic: 0, approx: true,
    degrees: [[0, 0], [2, -50], [4, -50], [5, 50], [7, 0], [9, -50], [11, -50]],
    note: "Rast notes heard from its half-flat 3rd." },
  { id: "hijaz", name: "Hijaz", fa: "حجاز", family: "arabic", tonic: 2,
    degrees: [[0, 0], [1, 0], [4, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    note: "Augmented 2nd between degrees 2 and 3. No quarter tones." },
  { id: "hijazkar", name: "Hijaz Kar", fa: "حجازکار", family: "arabic", tonic: 0,
    degrees: [[0, 0], [1, 0], [4, 0], [5, 0], [7, 0], [8, 0], [11, 0]],
    note: "Two Hijaz tetrachords. No quarter tones." },
  { id: "saba", name: "Saba", fa: "صبا", family: "arabic", tonic: 2,
    degrees: [[0, 0], [2, -50], [3, 0], [4, 0], [7, 0], [8, 0], [10, 0]],
    note: "Half-flat 2nd and a lowered (diminished) 4th." },
  { id: "huzam", name: "Huzam", fa: "هزام", family: "arabic", tonic: 0, approx: true,
    degrees: [[0, 0], [2, -50], [4, -50], [5, -50], [7, 50], [9, -50], [11, -50]],
    note: "Sikah family with a Hijaz colour; values vary between sources." },
  { id: "suznak", name: "Suznak", fa: "سوزناک", family: "arabic", tonic: 0,
    degrees: [[0, 0], [2, 0], [4, -50], [5, 0], [7, 0], [8, 0], [11, 0]],
    note: "Rast lower half, Hijaz upper half." },
  { id: "nahawand", name: "Nahawand", fa: "نهاوند", family: "arabic", tonic: 0,
    degrees: [[0, 0], [2, 0], [3, 0], [5, 0], [7, 0], [8, 0], [11, 0]],
    alts: [{ deg: 6, to: [10, 0], label: "♭7 (descent)" }],
    note: "Harmonic minor ascending, natural minor descending." },
  { id: "kurd", name: "Kurd", fa: "کرد", family: "arabic", tonic: 2,
    degrees: [[0, 0], [1, 0], [3, 0], [5, 0], [7, 0], [8, 0], [10, 0]],
    note: "Phrygian. No quarter tones." },
  { id: "nikriz", name: "Nikriz", fa: "نکریز", family: "arabic", tonic: 0,
    degrees: [[0, 0], [2, 0], [3, 0], [6, 0], [7, 0], [9, 0], [10, 0]],
    note: "Raised 4th (augmented 2nd between degrees 3 and 4)." },
  { id: "ajam", name: "Ajam", fa: "عجم", family: "arabic", tonic: 0,
    degrees: [[0, 0], [2, 0], [4, 0], [5, 0], [7, 0], [9, 0], [11, 0]],
    note: "Major scale." }
];

export const SCALE_MAP: Record<string, ScaleDef> = Object.fromEntries(SCALES.map((s) => [s.id, s]));

/** Ids kept for patches saved before the template system. */
const LEGACY: Record<string, string> = { "12tet": "mahur" };

export function getScale(id: string | undefined): ScaleDef | null {
  if (!id) return null;
  return SCALE_MAP[id] || SCALE_MAP[LEGACY[id]] || null;
}

/** Degrees of a scale after applying the alt bitmask (bit n = alts[n] on). */
export function scaleDegrees(def: ScaleDef, altMask = 0): Degree[] {
  const d = def.degrees.map((x) => [x[0], x[1]] as Degree);
  (def.alts || []).forEach((a, i) => { if (altMask & (1 << i)) d[a.deg] = [a.to[0], a.to[1]]; });
  return d;
}

/** Practice intonation shrinks every quarter-tone offset (−50 → −35). */
export const MICRO_FACTOR: Record<string, number> = { "24tet": 1, practice: 0.7 };

export interface KeyInfo {
  /** cents offset for this pitch class (0 when not in the scale) */
  cents: number;
  inScale: boolean;
  isRoot: boolean;
  /** scale degree index 0..6, or -1 */
  deg: number;
}

/**
 * Per pitch-class map (index = absolute pitch class 0..11) for a scale on a
 * tonic. Custom tunings pass `customOffsets` (relative to the tonic) instead.
 */
export function keyMap(scaleId: string, tonic: number, altMask = 0, micro = "24tet", customOffsets?: number[]): KeyInfo[] {
  const t = ((tonic % 12) + 12) % 12;
  const out: KeyInfo[] = Array.from({ length: 12 }, (_, pc) => ({ cents: 0, inScale: false, isRoot: pc === t, deg: -1 }));
  if (scaleId === "custom") {
    for (let r = 0; r < 12; r++) {
      const c = customOffsets?.[r] ?? 0;
      const pc = (t + r) % 12;
      out[pc].cents = c;
      out[pc].inScale = true;
    }
    return out;
  }
  const def = getScale(scaleId);
  if (!def) return out;
  const f = MICRO_FACTOR[micro] ?? 1;
  scaleDegrees(def, altMask).forEach(([semis, cents], i) => {
    const pc = (t + semis) % 12;
    out[pc] = { cents: Math.abs(cents) === 50 ? cents * f : cents, inScale: true, isRoot: i === 0, deg: i };
  });
  return out;
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
/** Tonic spellings (letter index, accidental) for the 12 pitch classes. */
const TONIC_SPELL: [number, number][] = [[0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
const ACC: Record<string, string> = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" };

export const TONIC_NAMES = TONIC_SPELL.map(([l, a]) => LETTERS[l] + ACC[String(a)]);

export interface SpelledNote { letter: string; acc: string; micro: "" | "k" | "s"; cents: number }

/** Spell the 7 degrees with one letter per degree (D Hijaz: D E♭ F♯ G A B♭ C). */
export function spellScale(scaleId: string, tonic: number, altMask = 0, micro = "24tet"): SpelledNote[] {
  const def = getScale(scaleId);
  if (!def) return [];
  const t = ((tonic % 12) + 12) % 12;
  const [tl] = TONIC_SPELL[t];
  const f = MICRO_FACTOR[micro] ?? 1;
  return scaleDegrees(def, altMask).map(([semis, cents], i) => {
    const li = (tl + i) % 7;
    const natural = LETTER_PC[li];
    let acc = (((t + semis) - natural) % 12 + 12) % 12;
    if (acc > 6) acc -= 12;
    const c = Math.abs(cents) === 50 ? cents * f : cents;
    return { letter: LETTERS[li], acc: ACC[String(acc)] ?? "?", micro: cents < 0 ? "k" : cents > 0 ? "s" : "", cents: c };
  });
}
