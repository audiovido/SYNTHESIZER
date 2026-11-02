import { patternFrom as P } from "../engine/drums";
import { DRUM_PAGES, drumPresets, drumSections, kitFromSource, KitVoices, kitPatch, pats, stylesFrom } from "./drumkit";
import { DrumKitDef, DrumStyleDef, MachineDef, PresetDef } from "./types";

/**
 * HORMOZ — minimal, chill and ambient electronics with hand percussion.
 * Slots: KICK (round minimal kick) · SNAP (finger snap) · CLAP (soft room clap)
 *        SHAKER · HAT (soft 808 open hat) · CONGA (tuned hand drum) · CLAVE (wood)
 *        KALIMBA (steel tine, tune it for melodies)
 * Percussion is placed in the stereo field per kit (PAN) and sent to the space
 * per voice (SEND): kicks dry, percussion and kalimba in the room.
 */

const DEF: KitVoices = {
  kick: [0, 1, 0.3, 0.9], snare: [0, 1, 0.5, 0.6], clap: [0, 1, 0.4, 0.55], ch: [0, 1, 0.5, 0.4],
  oh: [0, 1, 0.4, 0.35], tom: [0, 1, 0.3, 0.6], rim: [0, 1, 0.6, 0.45], bell: [0, 1, 0.3, 0.45]
};
const kit = (over: KitVoices, fx: Record<string, number | string> = {}) => kitPatch(DEF, over, fx);

/** A typical percussion stage: shaker right, conga left, clave and kalimba a little apart. */
const STAGE = { chPan: 0.35, tomPan: -0.3, rimPan: 0.2, bellPan: -0.15, ohPan: 0.15, kickSend: 0.1, bellSend: 1, tomSend: 0.8 };

/** Rhythm sources: each one becomes a style (and some lend their sound to a kit). */
const SRC: PresetDef[] = [
    // ------------------------------------------------------------ Minimal ----
    {
      id: "minimalTech", name: "Minimal Tech", group: "Minimal", bpm: 124,
      patch: kit({ kick: [0, 1, 0.35, 0.95], clap: [0, 0.8, 0.4, 0.45], ch: [0, 0.9, 0.55, 0.38], oh: [0, 0.7, 0.4, 0.3], rim: [2, 0.8, 0.75, 0.4], tom: [3, 0.8, 0.4, 0.45] }, { ...STAGE }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "....x.......x...", ch: "xxXxxxXxxxXxxxXx", oh: "..x...x...x...x.", rim: "...x.....x....x." }),
        P(16, { kick: "X...X...X...X...", clap: "....x.......x...", ch: "xxXxxxXxxxXxxxXx", oh: "..x...x...x...x.", rim: "...x..x..x....x.", tom: "..........x..x.." }),
        P(16, { kick: "X...X...X...X.x.", clap: "....x.......x.xx", ch: "xxXxxxXxxxXxXXXX", oh: "..x...x...x.....", tom: "..........x.x.xx" }),
        P(16, { ch: "xxXxxxXxxxXxxxXx", oh: "..x...x...x...x.", rim: "...x.....x....x." })
      ])
    },
    {
      id: "microhouse", name: "Microhouse", group: "Minimal", bpm: 122,
      patch: kit({ kick: [-1, 0.9, 0.5, 0.9], snare: [1, 0.8, 0.6, 0.5], ch: [2, 0.7, 0.6, 0.35], rim: [5, 0.7, 0.8, 0.4], bell: [7, 0.6, 0.5, 0.35] }, { ...STAGE, drumSwing: 0.12 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", snare: "....x.......x...", ch: ".xx..xx..xx..xx.", rim: "x.....x.....x...", bell: "......x.......x." }),
        P(16, { kick: "X...X...X...X...", snare: "....x.......x..x", ch: ".xx..xx..xx..xx.", rim: "x..x..x.....x...", bell: "..x...x.......x." }),
        P(16, { kick: "X...X...X..xX...", snare: "....x.......x.xx", ch: ".xx..xx..xxxxxxx", rim: "x.....x...x.x.x." }),
        P(16, { snare: "....x.......x...", rim: "x.....x.....x...", bell: "..x...x...x...x." })
      ])
    },
    {
      id: "deepMinimal", name: "Deep Minimal", group: "Minimal", bpm: 118,
      patch: kit({ kick: [-2, 1.4, 0.2, 1], clap: [-1, 1.4, 0.3, 0.4], oh: [0, 0.9, 0.3, 0.32], tom: [-2, 1.2, 0.2, 0.5], rim: [0, 1, 0.3, 0.4] }, { ...STAGE, revMix: 0.35, clapSend: 1 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "............x...", oh: "..x...x...x...x.", rim: ".......x......x.", tom: "...x........x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....x.......x...", oh: "..x...x...x...x.", rim: ".......x...x..x.", tom: "...x.....x..x..." }),
        P(16, { kick: "X...X...X...X.X.", clap: "............x.x.", oh: "..x...x...x.x.x.", tom: "...x.....x..x.xx" }),
        P(16, { oh: "..x...x...x...x.", tom: "...x........x..." })
      ])
    },
    // -------------------------------------------------------------- Chill ----
    {
      id: "lofiChill", name: "Lo-fi Chill", group: "Chill", bpm: 84,
      patch: kit({ kick: [-1, 1.1, 0.4, 0.9], snare: [-2, 1.2, 0.35, 0.6], ch: [0, 1.1, 0.35, 0.35], bell: [5, 1.3, 0.2, 0.4] },
        { ...STAGE, drumSwing: 0.22, kickColor: -0.25, snareColor: -0.35, chColor: -0.3, bellColor: -0.3, drumGlue: 0.45 }),
      patterns: pats([
        P(16, { kick: "X......x..X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x.", bell: "x.......x......." }),
        P(16, { kick: "X......x..X..x..", snare: "....X.......X...", ch: "x.x.x.x.x.x.xxx.", bell: "x.....x.x......." }),
        P(16, { kick: "X......x..X.....", snare: "....X.......X.xx", ch: "x.x.x.x.x.x.x...", bell: "x.......x...x..." }),
        P(16, { ch: "x.x.x.x.x.x.x.x.", bell: "x.......x......." })
      ])
    },
    {
      id: "downtempo", name: "Downtempo", group: "Chill", bpm: 96,
      patch: kit({ kick: [-1, 1.2, 0.3, 0.9], clap: [-2, 1.6, 0.3, 0.5], ch: [0, 1, 0.45, 0.35], tom: [-3, 1.1, 0.25, 0.5], rim: [0, 1, 0.4, 0.35] },
        { ...STAGE, drumSwing: 0.1, revMix: 0.34, clapSend: 1 }),
      patterns: pats([
        P(16, { kick: "X.........X.....", clap: "....X.......X...", ch: "x.xxx.xxx.xxx.xx", tom: "......x.......x.", rim: "..x.......x....." }),
        P(16, { kick: "X......x..X.....", clap: "....X.......X...", ch: "x.xxx.xxx.xxx.xx", tom: "......x...x...x.", rim: "..x.......x..x.." }),
        P(16, { kick: "X.........X..x..", clap: "....X.......X..x", ch: "x.xxx.xxx.xxxxxx", tom: "......x...x.x.xx" }),
        P(16, { ch: "x.xxx.xxx.xxx.xx", tom: "......x.......x." })
      ])
    },
    {
      id: "chillHouse", name: "Chill House", group: "Chill", bpm: 116,
      patch: kit({ kick: [0, 1, 0.3, 0.9], clap: [0, 1.1, 0.45, 0.45], ch: [0, 0.9, 0.5, 0.36], oh: [0, 0.8, 0.45, 0.3], bell: [2, 1, 0.3, 0.38] }, { ...STAGE, drumSwing: 0.08 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", ch: "x.x.x.x.x.x.x.x.", oh: "..x...x...x...x.", bell: "......x.....x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", ch: "xxx.xxx.xxx.xxx.", oh: "..x...x...x...x.", bell: "...x..x.....x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X.xx", ch: "xxx.xxx.xxx.xxxx", oh: "..x...x...x....." }),
        P(16, { ch: "x.x.x.x.x.x.x.x.", oh: "..x...x...x...x.", bell: "......x.....x..." })
      ])
    },
    // ------------------------------------------------------------ Ambient ----
    {
      id: "ambientPulse", name: "Ambient Pulse", group: "Ambient", bpm: 90,
      patch: kit({ kick: [-3, 1.6, 0.1, 0.75], ch: [0, 1.3, 0.3, 0.28], bell: [0, 2.2, 0.15, 0.45], rim: [-5, 1.4, 0.2, 0.3] },
        { ...STAGE, revMix: 0.5, revSize: 4.5, delayMix: 0.3, delayTime: 0.5, delayFb: 0.45, drumGlue: 0.15, volume: 0.7 }),
      patterns: pats([
        P(16, { kick: "X.......x.......", ch: "..x...x...x...x.", bell: "X.....x.....x...", rim: "..........x....." }),
        P(16, { kick: "X.......x.......", ch: "..x...x...x...x.", bell: "X..x..x.....x...", rim: "......x...x....." }),
        P(16, { kick: "X.......x...x...", ch: "..x...x...x.x.x.", bell: "X.....x...x.x...", rim: "..........x...x." }),
        P(16, { bell: "X.....x.....x...", ch: "..x...x...x...x." })
      ])
    },
    {
      id: "rainGarden", name: "Rain Garden", group: "Ambient", bpm: 72,
      patch: kit({ ch: [2, 1.4, 0.25, 0.3], bell: [7, 2.5, 0.1, 0.45], rim: [-7, 1.5, 0.1, 0.32], tom: [5, 1.4, 0.1, 0.35] },
        { ...STAGE, revMix: 0.55, revSize: 5, delayMix: 0.35, delayTime: 0.62, delayFb: 0.5, drumGlue: 0.1 }),
      patterns: pats([
        P(16, { ch: "x..x..x..x..x...", bell: "X.......x.......", rim: "......x.......x.", tom: "...x.........x.." }),
        P(16, { ch: "x..x..x..x..x...", bell: "X...x...x.......", rim: "......x.......x.", tom: "...x.....x...x.." }),
        P(16, { ch: "x..x..x..x..x.xx", bell: "X.......x...x.x.", rim: "......x...x...x." }),
        P(16, { bell: "X.......x.......", rim: "......x.......x." })
      ])
    },
    // --------------------------------------------------------- Percussion ----
    {
      id: "afroHouse", name: "Afro House", group: "Percussion", bpm: 122,
      patch: kit({ kick: [0, 1, 0.3, 0.92], clap: [0, 1, 0.45, 0.42], ch: [0, 0.9, 0.55, 0.4], oh: [0, 0.8, 0.45, 0.28], tom: [0, 1, 0.25, 0.55], rim: [0, 0.9, 0.8, 0.42] }, { ...STAGE }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "....x.......x...", ch: "xxXxxxXxxxXxxxXx", tom: "..x..x.x..x..xx.", rim: "X..x..x...x.x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....x.......x...", ch: "xxXxxxXxxxXxxxXx", oh: "..x...x...x...x.", tom: "..x..xxx..x..xx.", rim: "X..x..x...x.x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....x.......x.x.", ch: "xxXxxxXxxxXxXXXX", tom: "..x..x.x..xxxxxx", rim: "X..x..x...x.x..." }),
        P(16, { ch: "xxXxxxXxxxXxxxXx", tom: "..x..x.x..x..xx.", rim: "X..x..x...x.x..." })
      ])
    },
    {
      id: "latinPerc", name: "Son Clave & Tumbao", group: "Percussion", bpm: 100,
      patch: kit({ kick: [-1, 0.9, 0.25, 0.7], ch: [0, 1, 0.5, 0.4], tom: [0, 1.1, 0.35, 0.6], rim: [0, 1, 0.85, 0.45], bell: [0, 1, 0.3, 0.3] }, { ...STAGE }),
      patterns: pats([
        P(16, { rim: "X..X..X...X.X...", tom: "....x.....x...XX", ch: "x.xxx.xxx.xxx.xx", kick: "X.......X......." }),
        P(16, { rim: "X..X..X...X.X...", tom: "....x..x..x...XX", ch: "x.xxx.xxx.xxx.xx", kick: "X.....x.X......." }),
        P(16, { rim: "X..X..X...X.X...", tom: "....x..x..x.xxXX", ch: "x.xxx.xxx.xxxxxx", kick: "X.......X...x..." }),
        P(16, { rim: "..X.X...X..X..X.", tom: "....x.....x...XX", ch: "x.xxx.xxx.xxx.xx" })
      ])
    },
    {
      id: "persianFusion", name: "Persian Fusion 6/8", group: "Percussion", bpm: 112,
      patch: kit({ kick: [-1, 1, 0.3, 0.9], snare: [0, 0.9, 0.55, 0.5], ch: [0, 0.9, 0.5, 0.38], tom: [-5, 1.2, 0.3, 0.6], rim: [0, 0.9, 0.7, 0.38], bell: [3, 1.2, 0.3, 0.38] }, { ...STAGE }),
      patterns: pats([
        P(12, { kick: "X.....x.....", tom: "..x..X..x...", snare: "...x.....x..", ch: "xxxxxxxxxxxx", rim: "x..x..x..x.." }),
        P(12, { kick: "X.....x..x..", tom: "..x..X..x..x", snare: "...x.....x..", ch: "xxxxxxxxxxxx", bell: "X.....x....." }),
        P(12, { kick: "X.....x.....", tom: "..x..X..xxXX", snare: "...x...x.xxx", ch: "xxxxxxxxxxxx" }),
        P(12, { tom: "..x..X..x...", ch: "xxxxxxxxxxxx", bell: "X.....x....." })
      ])
    },
    {
      id: "tropical", name: "Tropical Perc", group: "Percussion", bpm: 105,
      patch: kit({ kick: [0, 1, 0.3, 0.85], snare: [2, 0.9, 0.6, 0.45], ch: [1, 0.8, 0.6, 0.4], tom: [2, 0.9, 0.5, 0.5], rim: [2, 0.8, 0.9, 0.4], bell: [5, 1, 0.4, 0.4] }, { ...STAGE, drumSwing: 0.06 }),
      patterns: pats([
        P(16, { kick: "X..x..x.X..x..x.", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", tom: "..x...x...x..x..", rim: "x..x...x..x....." }),
        P(16, { kick: "X..x..x.X..x..x.", snare: "....x.......x...", ch: "xxxxxxxxxxxxxxxx", tom: "..x...x...x..xx.", rim: "x..x...x..x.....", bell: "......x.......x." }),
        P(16, { kick: "X..x..x.X..x..x.", snare: "....x.......xxxx", ch: "xxxxxxxxxxxxxxxx", tom: "..x...x..xx.xxxx" }),
        P(16, { tom: "..x...x...x..x..", rim: "x..x...x..x.....", bell: "x.....x.....x..." })
      ])
    }
  ];

const k = (from: string, id: string, name: string, group: string, tag: string, desc: string, extra: Partial<DrumKitDef> = {}) =>
  kitFromSource(SRC, from, { id, name, group, tag, desc, ...extra });

const KITS: DrumKitDef[] = [
  k("minimalTech", "minimal", "Minimal Clicks", "Minimal", "Electronic", "Round kick, tiny clicks, shaker and clave, everything tight and dry. Minimal techno."),
  k("microhouse", "micro", "Micro Glitch", "Minimal", "Electronic", "Snaps, high clicks and a tuned kalimba ping. Microhouse and glitchy minimal."),
  k("deepMinimal", "deep", "Deep Dub", "Minimal", "Electronic, deep", "Low long kick and dark claps sent into a deep room. Deep minimal and dub house."),
  k("lofiChill", "lofi", "Lo-fi Tape", "Chill", "Warm, dark", "Soft snaps and a sleepy kalimba through worn tape. Lo-fi and bedroom beats."),
  k("downtempo", "downtempo", "Downtempo", "Chill", "Warm", "Big soft claps, deep congas, a lazy shaker. Downtempo and trip-hop."),
  k("chillHouse", "chill", "Chill House", "Chill", "Electronic, warm", "Warm round kick, soft claps and hats with a kalimba hook. Chill and Balearic house."),
  k("ambientPulse", "ambient", "Ambient Glass", "Ambient", "Spacious", "Barely-there pulse and glassy kalimba in a huge space. Ambient and meditation."),
  k("rainGarden", "rain", "Rain Garden", "Ambient", "Spacious", "Drops of clave, shaker rain and a high kalimba, no kick. Ambient textures."),
  k("afroHouse", "afro", "Afro Perc", "Percussion", "Hand percussion", "Congas, shaker and clave around a solid kick. Afro house and organic house."),
  k("latinPerc", "latin", "Latin Perc", "Percussion", "Hand percussion", "Bright clave, open congas and shaker. Son, salsa and Latin grooves."),
  k("persianFusion", "persian", "Persian Fusion", "Percussion", "Hand percussion", "Deep congas tuned like a dom, clave and kalimba in 6/8. Persian and world fusion."),
  k("tropical", "tropical", "Tropical", "Percussion", "Hand percussion", "High bright congas, claves and a sunny kalimba. Tropical house and dancehall."),
  { id: "vintageBox", name: "Vintage Box", group: "Fusion", tag: "CR-78 + kalimba",
    desc: "The 1978 rhythm box (pup kick, bongo, guiro, clave) with Hormoz's kalimba on top. Retro chill and lo-fi.",
    labels: { clap: "GUIRO", ch: "HAT", oh: "CYMBAL", tom: "BONGO", rim: "CLAVE", snare: "SNARE" },
    patch: kit({ kick: [0, 1.3, 0.4, 1], snare: [0, 1, 0.5, 0.55], clap: [0, 1, 0.5, 0.8], ch: [0, 1, 0.5, 0.4], oh: [0, 1, 0.5, 0.22], tom: [0, 1, 0.4, 0.55], rim: [0, 1, 0.5, 0.42], bell: [0, 1, 0.3, 0.45] },
      { ...STAGE, kitModel: "cr78", bellModel: "minimal", volume: 1 }) },
  { id: "persianPerc", name: "Tombak Perc", group: "Fusion", tag: "Hybrid",
    desc: "Hormoz's kick, shaker and kalimba with Bushehr's tombak DOM, TAK and daf. Persian chill and fusion.",
    labels: { snare: "TAK", clap: "DAF", tom: "DOM", rim: "PELANG" },
    patch: kit({ snare: [0, 0.9, 0.55, 0.28], clap: [0, 0.9, 0.5, 0.24], tom: [-1, 1, 0.5, 0.55], rim: [0, 0.9, 0.5, 0.45] },
      { ...STAGE, snareModel: "persian", clapModel: "persian", tomModel: "persian", rimModel: "persian", clapPan: -0.3 }) }
];

const KIT_OF: Record<string, string> = {
  minimalTech: "minimal", microhouse: "micro", deepMinimal: "deep", lofiChill: "lofi", downtempo: "downtempo", chillHouse: "chill",
  ambientPulse: "ambient", rainGarden: "rain", afroHouse: "afro", latinPerc: "latin", persianFusion: "persian", tropical: "tropical"
};

const STYLES: DrumStyleDef[] = stylesFrom(SRC, KIT_OF, "minimal");

export const HORMOZ: MachineDef = {
  id: "hormoz",
  name: "Hormoz",
  role: "Minimal, chill & percussion",
  skin: "hormoz",
  kind: "drums",
  drumModel: "minimal",
  drumLabels: { kick: "KICK", snare: "SNAP", clap: "CLAP", ch: "SHAKER", oh: "HAT", tom: "CONGA", rim: "CLAVE", bell: "KALIMBA" },
  tempo: true,
  pages: DRUM_PAGES,
  sections: drumSections(),
  base: { drumSwing: 0, drumAccent: 0.45, drumGlue: 0.3, delayMix: 0.18, delayTime: 0.375, delayFb: 0.35, revMix: 0.28, revSize: 2.4, drive: 0, eqLow: 1, volume: 0.82 },
  kits: KITS,
  styles: STYLES,
  presets: drumPresets(KITS, STYLES)
};
