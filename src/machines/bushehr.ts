import { patternFrom as P } from "../engine/drums";
import { DRUM_PAGES, drumSections, KitVoices, kitPatch, pats } from "./drumkit";
import { MachineDef } from "./types";

/**
 * BUSHEHR — Persian & Middle-Eastern percussion.
 * Slots: DOHOL (kick) · TAK (snare) · DAF (clap) · ZANG (ch) · DAYEREH (oh)
 *        DOM (tom) · PELANG (rim) · SENJ (bell)
 * Tombak strokes: DOM = centre bass stroke, TAK = edge stroke, PELANG = snap.
 * Grooves are written as starting points to play over, not as transcriptions.
 */

const DEF: KitVoices = {
  kick: [0, 1, 0.4, 0.85], snare: [0, 1, 0.5, 0.7], clap: [0, 1, 0.5, 0.7], ch: [0, 1, 0.5, 0.35],
  oh: [0, 1, 0.5, 0.5], tom: [0, 1, 0.5, 0.85], rim: [0, 1, 0.5, 0.55], bell: [0, 1, 0.5, 0.4]
};
const kit = (over: KitVoices, fx: Record<string, number> = {}) => kitPatch(DEF, over, fx);

export const BUSHEHR: MachineDef = {
  id: "bushehr",
  name: "Bushehr",
  role: "Persian & Arabic percussion",
  skin: "bushehr",
  kind: "drums",
  drumModel: "persian",
  drumLabels: { kick: "DOHOL", snare: "TAK", clap: "DAF", ch: "ZANG", oh: "DAYEREH", tom: "DOM", rim: "PELANG", bell: "SENJ" },
  tempo: true,
  pages: DRUM_PAGES,
  sections: drumSections(),
  // stereo stage like an ensemble: tombak (DOM/TAK) centre, daf left, zang right, dohol centre with some room
  base: { drumSwing: 0, drumAccent: 0.55, delayMix: 0, revMix: 0.16, revSize: 1.6, drive: 0.05, volume: 0.82, drumGlue: 0.25,
    clapPan: -0.25, chPan: 0.4, ohPan: -0.35, bellPan: 0.3, rimPan: 0.15, kickSend: 0.25, tomSend: 0.6 },
  presets: [
    {
      id: "tombakSolo", name: "Tombak Zarbi", group: "Persian", bpm: 96,
      patch: kit({ tom: [0, 1.1, 0.6, 0.95], snare: [0, 1, 0.6, 0.75], rim: [0, 0.9, 0.6, 0.6] }),
      patterns: pats([
        P(16, { tom: "X.......X.......", snare: "..g.X..x.g..X.x.", rim: "..x.......x....." }),
        P(16, { tom: "X..x....X.......", snare: "..g.X..x.g..X3X.", rim: "..x...x...x....x" }),
        P(16, { tom: "X.x.X.x.X.......", snare: "........X4X4X4XX", rim: "...x...x........" }),
        P(16, { tom: "X.......X.......", rim: "..x.x.x...x.x.x." })
      ])
    },
    {
      id: "sheshohasht", name: "Shesh-o-Hasht 6/8", group: "Persian", bpm: 104,
      patch: kit({ tom: [-1, 1.1, 0.5, 0.9], snare: [0, 1, 0.5, 0.7], clap: [0, 1, 0.6, 0.6], ch: [0, 0.8, 0.4, 0.3] }, { revMix: 0.2 }),
      patterns: pats([
        P(12, { tom: "X.....X.....", snare: "...x.x...x.x", clap: "...X.....X.." }),
        P(12, { tom: "X..x..X.....", snare: "...x.x...xxx", clap: "...X.....X..", ch: "x.....x....." }),
        P(12, { tom: "X.....X.x.x.", snare: "..xxx...xxxx", rim: ".x.......x.." }),
        P(12, { tom: "X...........", snare: "...x.x...x.x" })
      ])
    },
    {
      id: "reng", name: "Reng Dance 6/8", group: "Persian", bpm: 132,
      patch: kit({ tom: [0, 0.9, 0.5, 0.9], snare: [1, 0.9, 0.6, 0.7], oh: [0, 0.8, 0.6, 0.45], ch: [1, 0.7, 0.6, 0.3] }, { revMix: 0.14 }),
      patterns: pats([
        P(12, { tom: "X.....X.....", snare: "..x.x...x.x.", oh: "...x.....x.." }),
        P(12, { tom: "X..x..X.....", snare: "..x.x...x.xx", oh: "...x.....x..", ch: "x.....x....." }),
        P(12, { tom: "X.x.x.X.x.x.", snare: "...........X", oh: "..........x." }),
        P(12, { tom: "X.....X.....", oh: "...x.....x.." })
      ])
    },
    {
      id: "sufiDaf", name: "Sufi Daf (Sama)", group: "Persian", bpm: 88,
      patch: kit({ clap: [-2, 1.4, 0.7, 0.9], kick: [-3, 1.3, 0.3, 0.7], oh: [-1, 1.2, 0.5, 0.45] }, { revMix: 0.32, revSize: 3 }),
      patterns: pats([
        P(16, { kick: "X.......X.......", clap: "....F.......F...", oh: "..x.......x....." }),
        P(16, { kick: "X.......X.......", clap: "....F..x....F.x.", oh: "..x...x...x...x." }),
        P(16, { kick: "X...X...X...X...", clap: "..X...X...X.F334", oh: "x.x.x.x.x.x....." }),
        P(16, { kick: "X...............", clap: "....X.......X...", oh: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "bandari", name: "Bandari 6/8", group: "Gulf", bpm: 126,
      patch: kit({ kick: [0, 0.9, 0.5, 0.9], snare: [1, 0.9, 0.6, 0.7], clap: [1, 0.8, 0.6, 0.55], ch: [0, 0.7, 0.6, 0.35] }, { revMix: 0.12 }),
      patterns: pats([
        P(12, { kick: "X..X..X..X..", snare: ".x.x.x.x.x.x", clap: "...X.....X.." }),
        P(12, { kick: "X..X..X..X..", tom: "..x.....x...", snare: ".x.x.x.x.x.x", clap: "...X.....X..", ch: "x.....x....." }),
        P(12, { kick: "X..X..X..XxX", tom: "..x..x..x.x.", snare: ".x.x.x......" }),
        P(12, { kick: "X.....X.....", snare: ".x.x.x.x.x.x" })
      ])
    },
    {
      id: "sangoSenj", name: "Sang-o-Senj", group: "Gulf", bpm: 72,
      patch: kit({ kick: [-2, 1.6, 0.3, 1], bell: [0, 1.6, 0.4, 0.55], tom: [-2, 1.2, 0.4, 0.7] }, { revMix: 0.3, revSize: 3.5 }),
      patterns: pats([
        P(16, { kick: "X.......X.......", bell: "....X.......X..." }),
        P(16, { kick: "X.......X...X...", bell: "....X.......X...", tom: "..........x....." }),
        P(16, { kick: "X...X...X...X.XX", bell: "..X...X...X...X." }),
        P(16, { bell: "X...X...X...X..." })
      ])
    },
    {
      id: "khaleeji", name: "Khaleeji", group: "Gulf", bpm: 98,
      patch: kit({ clap: [0, 0.9, 0.4, 0.8], tom: [-1, 1, 0.5, 0.85], snare: [0, 0.9, 0.5, 0.6] }, { drumSwing: 0.18, revMix: 0.18 }),
      patterns: pats([
        P(16, { tom: "X.....x.X.......", clap: "...X..X....X..X.", snare: "....x.......x..." }),
        P(16, { tom: "X.....x.X..x....", clap: "...X..X....X..X.", snare: "....x...x...x..x" }),
        P(16, { tom: "X.x.x.x.X.......", clap: "...X..X.XXXXXXXX" }),
        P(16, { clap: "...X..X....X..X." })
      ])
    },
    {
      id: "maqsum", name: "Maqsum", group: "Arabic", bpm: 108,
      patch: kit({ tom: [0, 1, 0.5, 0.9], snare: [0, 0.9, 0.6, 0.75], rim: [1, 0.8, 0.5, 0.45], clap: [0, 0.8, 0.6, 0.4] }),
      patterns: pats([
        P(16, { tom: "X.......X.......", snare: "..X...X.....X...", rim: "....x.......x.x." }),
        P(16, { tom: "X.......X.......", snare: "..X...X.....X...", rim: ".x.xx.x..x.xx.xx", clap: "............X..." }),
        P(16, { tom: "X.......X.x.x...", snare: "..X...X.....XXXX" }),
        P(16, { tom: "X.......X.......", snare: "..X...X.....X..." })
      ])
    },
    {
      id: "baladi", name: "Baladi", group: "Arabic", bpm: 100,
      patch: kit({ tom: [-1, 1.1, 0.5, 0.95], snare: [0, 0.9, 0.6, 0.7], rim: [1, 0.8, 0.5, 0.4] }),
      patterns: pats([
        P(16, { tom: "X.X.....X.......", snare: "......X.....X...", rim: "....x.......x.x." }),
        P(16, { tom: "X.X.....X.......", snare: "......X.....X...", rim: ".x.xx.x..x.xx.xx" }),
        P(16, { tom: "X.X.....X.X.X.X.", snare: "......X......XXX" }),
        P(16, { tom: "X.X.....X.......", rim: "....x.x.....x.x." })
      ])
    },
    {
      id: "saidi", name: "Saidi", group: "Arabic", bpm: 112,
      patch: kit({ tom: [-1, 1, 0.5, 0.95], snare: [1, 0.9, 0.6, 0.7], kick: [0, 1, 0.4, 0.6] }),
      patterns: pats([
        P(16, { tom: "X.....X.X.......", snare: "..X.........X...", kick: "X.......X......." }),
        P(16, { tom: "X.....X.X.......", snare: "..X.........X.x.", kick: "X.......X.......", rim: "....x.........x." }),
        P(16, { tom: "X.....X.X.X.X...", snare: "..X.........XXXX" }),
        P(16, { tom: "X.....X.X.......", snare: "..X.........X..." })
      ])
    },
    {
      id: "ayoub", name: "Ayoub Trance", group: "Arabic", bpm: 120,
      patch: kit({ tom: [-2, 0.9, 0.4, 0.95], snare: [0, 0.8, 0.5, 0.7], clap: [-1, 0.9, 0.6, 0.55] }, { revMix: 0.22 }),
      patterns: pats([
        P(16, { tom: "X..xX..xX..xX..x", snare: "..X...X...X...X." }),
        P(16, { tom: "X..xX..xX..xX..x", snare: "..X...X...X...X.", clap: "X.......X......." }),
        P(16, { tom: "X..xX..xX.xxX.xx", snare: "..X...X...X.XXXX" }),
        P(16, { tom: "X...X...X...X...", snare: "..X...X...X...X." })
      ])
    },
    {
      id: "doholSorna", name: "Dohol Wedding", group: "Folk", bpm: 116,
      patch: kit({ kick: [-1, 1.1, 0.6, 1], rim: [2, 0.8, 0.7, 0.6], bell: [1, 0.8, 0.5, 0.35] }, { revMix: 0.16, drive: 0.15 }),
      patterns: pats([
        P(16, { kick: "X.....X.X.......", rim: "..x.x...x.x.x.x." }),
        P(16, { kick: "X.....X.X...X...", rim: "..x.x...x.x.x.xx", bell: "X.......X......." }),
        P(16, { kick: "X.X.X.X.X.X.XXXX", rim: "..............x." }),
        P(16, { kick: "X.......X.......", rim: "..x.x.x...x.x.x." })
      ])
    },
    {
      id: "bandariHouse", name: "Bandari House", group: "Fusion", bpm: 122,
      patch: kit({ kick: [-2, 0.9, 0.7, 1], tom: [2, 0.7, 0.6, 0.6], snare: [1, 0.8, 0.6, 0.6], oh: [1, 0.6, 0.7, 0.4], ch: [2, 0.5, 0.6, 0.3] }, { drive: 0.2, revMix: 0.14 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", snare: ".x.x.x...x.x.x..", oh: "..X...X...X...X." }),
        P(16, { kick: "X...X...X...X...", snare: ".x.x.x...x.x.x..", oh: "..X...X...X...X.", tom: "...x.....x....x.", clap: "....X.......X..." }),
        P(16, { kick: "X...X...X...X.XX", tom: "x.x.x.x.x.xxxxxx" }),
        P(16, { snare: ".x.x.x...x.x.x..", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "persianTrap", name: "Persian Trap", group: "Fusion", bpm: 140,
      patch: kit({ kick: [-4, 2.2, 0.3, 1], snare: [2, 0.9, 0.7, 0.7], ch: [2, 0.5, 0.7, 0.3], tom: [0, 1, 0.5, 0.6] }, { drive: 0.2, eqLow: 3 }),
      patterns: pats([
        P(16, { kick: "X......X..X.....", snare: "........X.......", ch: "x.x.x.x.x.x.xxxx", tom: "...x.........x.." }),
        P(16, { kick: "X......X.X....x.", snare: "........X.......", ch: "x.xxx.x.x.xxx.xx", tom: "...x...x.....x.." }),
        P(16, { kick: "X......X..X.....", snare: "........X...XXXX", ch: "xxxxxxxxxxxxxxxx" }),
        P(16, { kick: "X...............", tom: "...x.x...x.x.x.." })
      ])
    },
    // ------------------------------------------------- folk, chill, riz ----
    {
      id: "tombakRiz", name: "Tombak Riz", group: "Persian", bpm: 100,
      patch: kit({ tom: [0, 1.1, 0.55, 0.95], snare: [0, 0.9, 0.65, 0.75], rim: [0, 0.9, 0.6, 0.55] }),
      patterns: pats([
        P(16, { tom: "X.......X.......", snare: "..g.X.g...g.X.4.", rim: "......x.......x." }),
        P(16, { tom: "X.....x.X.......", snare: "..g.X.g.g.g.X44.", rim: "......x.......x." }),
        P(16, { tom: "X.......X.......", snare: "44444444X.X.4444" }),
        P(16, { tom: "X.......X.x.....", snare: "..g.X.g...g.X...", rim: "..x...x...x...x." })
      ])
    },
    {
      id: "kurdishDaf", name: "Kurdish Daf", group: "Folk", bpm: 112,
      patch: kit({ clap: [0, 1.1, 0.75, 0.9], kick: [-2, 1, 0.3, 0.65], oh: [0, 1, 0.55, 0.4] }, { revMix: 0.22, revSize: 2 }),
      patterns: pats([
        P(12, { kick: "X.....X.....", clap: "..x.x...x.x.", oh: "x..x..x..x.." }),
        P(12, { kick: "X.....X.....", clap: "..F.x...F.x.", oh: "x..x..x..x.." }),
        P(12, { kick: "X..X..X..X..", clap: "..x.x.333444", oh: "x..x..x....." }),
        P(12, { clap: "F.....F.....", oh: "x..x..x..x.." })
      ])
    },
    {
      id: "lori", name: "Lori 6/8", group: "Folk", bpm: 120,
      patch: kit({ kick: [0, 1, 0.45, 0.9], snare: [0, 0.9, 0.6, 0.6], tom: [-1, 1, 0.5, 0.65], bell: [0, 0.9, 0.5, 0.35] }, { revMix: 0.18 }),
      patterns: pats([
        P(12, { kick: "X.....X.....", tom: "..x..x..x..x", snare: "...x.....x..", bell: "x.....x....." }),
        P(12, { kick: "X..x..X.....", tom: "..x..x..x.xx", snare: "...x.....x..", bell: "x.....x....." }),
        P(12, { kick: "X.....X..X..", tom: "..x..x..3.44", snare: "...x..g..x.g" }),
        P(12, { tom: "..x..x..x..x", bell: "x.....x....." })
      ])
    },
    {
      id: "ambientDaf", name: "Ambient Daf", group: "Chill", bpm: 72,
      patch: kit({ clap: [-3, 1.6, 0.6, 0.75], ch: [0, 1.4, 0.4, 0.3], tom: [-4, 1.4, 0.3, 0.55], bell: [-2, 1.6, 0.3, 0.22] },
        { revMix: 0.42, revSize: 4.5, delayMix: 0.22, delayTime: 0.62, delayFb: 0.45, drumGlue: 0.15, clapSend: 1, chSend: 1 }),
      patterns: pats([
        P(16, { clap: "F.......x.......", tom: "X.......X.......", ch: "....x.......x..?" }),
        P(16, { clap: "F.......x...x...", tom: "X.......X.......", ch: "....x...?...x..?" }),
        P(16, { clap: "F.......x...3344", tom: "X.......X.......", ch: "....x.......x..." }),
        P(16, { ch: "....x.......x..?", bell: "X..............." })
      ])
    },
    {
      id: "persianChill", name: "Persian Chill", group: "Chill", bpm: 88,
      patch: kit({ tom: [-2, 1.2, 0.4, 0.85], snare: [-1, 0.9, 0.5, 0.6], ch: [0, 1.1, 0.4, 0.3], rim: [0, 0.9, 0.5, 0.45], kick: [-3, 1.2, 0.2, 0.6] },
        { drumSwing: 0.16, revMix: 0.3, revSize: 2.8, drumGlue: 0.4, snareColor: -0.2, chSend: 1, volume: 0.72 }),
      patterns: pats([
        P(16, { kick: "X.........X.....", tom: "X.....x...X.....", snare: "....X..g....X...", ch: "..x...x...x...x.", rim: ".......x......x." }),
        P(16, { kick: "X.........X.....", tom: "X.....x...X..x..", snare: "....X..g.g..X...", ch: "..x...x...x...x.", rim: ".......x......x." }),
        P(16, { kick: "X.........X.....", tom: "X.....x...X.....", snare: "....X..g....3344", ch: "..x...x...x....." }),
        P(16, { tom: "X.....x...X.....", ch: "..x...x...x...x." })
      ])
    }
  ]
};
