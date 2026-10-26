import { patternFrom as P } from "../engine/drums";
import { DRUM_PAGES, drumSections, KitVoices, kitPatch, pats } from "./drumkit";
import { MachineDef } from "./types";

/**
 * RASHT — acoustic studio kit: a modelled drum set played with sticks or brushes.
 * Slots: KICK · SNARE · BRUSH (clap) · HAT (ch) · RIDE (oh) · TOM · X-STICK (rim) · SHAKER (bell)
 * 12-step patterns are triplet grids (jazz swing, shuffle, 12/8 ballads).
 */

const DEF: KitVoices = {
  kick: [0, 1, 0.4, 0.9], snare: [0, 1, 0.55, 0.7], clap: [0, 1, 0.5, 0.55], ch: [0, 1, 0.5, 0.4],
  oh: [0, 1, 0.4, 0.4], tom: [0, 1, 0.4, 0.7], rim: [0, 1, 0.4, 0.55], bell: [0, 1, 0.5, 0.35]
};
const kit = (over: KitVoices, fx: Record<string, number> = {}) => kitPatch(DEF, over, fx);

export const RASHT: MachineDef = {
  id: "rasht",
  name: "Rasht",
  role: "Acoustic studio drums",
  skin: "rasht",
  kind: "drums",
  drumModel: "acoustic",
  drumLabels: { kick: "KICK", snare: "SNARE", clap: "BRUSH", ch: "HAT", oh: "RIDE", tom: "TOM", rim: "X-STICK", bell: "SHAKER" },
  tempo: true,
  pages: DRUM_PAGES,
  sections: drumSections(),
  base: { drumSwing: 0, drumAccent: 0.5, delayMix: 0, revMix: 0.18, revSize: 1.4, drive: 0, eqHigh: 0, volume: 0.82 },
  presets: [
    {
      id: "jazzBrushes", name: "Jazz Brushes", group: "Jazz", bpm: 132,
      patch: kit({ clap: [0, 1.2, 0.4, 0.6], oh: [0, 1.4, 0.35, 0.45], kick: [-2, 0.8, 0.2, 0.55], ch: [-1, 0.8, 0.4, 0.4] }, { revMix: 0.22 }),
      patterns: pats([
        P(12, { oh: "X..x.xX..x.x", clap: "x..x..x..x..", ch: "...X.....X..", kick: "X..........." }),
        P(12, { oh: "X..x.xX..x.x", clap: "x..x..x..x.x", ch: "...X.....X..", snare: ".....x.....x" }),
        P(12, { oh: "X..x.xX.....", snare: "..x..xx.xx.X", tom: "........x.x." }),
        P(12, { clap: "x..x..x..x..", ch: "...X.....X.." })
      ])
    },
    {
      id: "swingRide", name: "Swing Ride", group: "Jazz", bpm: 160,
      patch: kit({ oh: [1, 1.3, 0.55, 0.5], ch: [0, 0.8, 0.5, 0.45], kick: [-2, 0.7, 0.3, 0.5], snare: [1, 0.8, 0.5, 0.45] }, { revMix: 0.2 }),
      patterns: pats([
        P(12, { oh: "X..x.xX..x.x", ch: "...X.....X.." }),
        P(12, { oh: "X..x.xX..x.x", ch: "...X.....X..", snare: "..x.....x..x", kick: "........x..." }),
        P(12, { oh: "X..x.x......", snare: "..x.xx.xxX.X", kick: "X.....X....." }),
        P(12, { ch: "...X.....X.." })
      ])
    },
    {
      id: "bossa", name: "Bossa Nova", group: "Latin", bpm: 136,
      patch: kit({ rim: [1, 0.8, 0.4, 0.6], kick: [-1, 0.8, 0.25, 0.75], bell: [0, 0.8, 0.5, 0.35], ch: [0, 0.8, 0.45, 0.35] }, { revMix: 0.16 }),
      patterns: pats([
        P(16, { kick: "X..xX..xX..xX..x", rim: "x..x..x...x..x..", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X..xX..xX..xX..x", rim: "..x..x...x..x...", ch: "x.x.x.x.x.x.x.x.", bell: ".x.x.x.x.x.x.x.x" }),
        P(16, { kick: "X..xX..xX..xX..x", rim: "x..x..x...x..x..", tom: "............x.x." }),
        P(16, { kick: "X..xX..xX..xX..x", bell: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "afrobeat", name: "Afrobeat", group: "Latin", bpm: 112,
      patch: kit({ ch: [0, 0.8, 0.6, 0.45], bell: [0, 0.9, 0.6, 0.4], snare: [0, 0.9, 0.6, 0.6] }, { drumSwing: 0.08 }),
      patterns: pats([
        P(16, { kick: "X.....X...X.....", snare: "....x..X.x..X..x", ch: "x.xxx.xxx.xxx.xx", bell: "x..x..x...x.x..." }),
        P(16, { kick: "X.....X...X..x..", snare: "....x..X.x..X..x", ch: "x.xxx.xxx.xxx.xx", oh: "..............x." }),
        P(16, { kick: "X.....X...X.....", snare: "....x..X.x..XxXX", tom: "........x.x....." }),
        P(16, { bell: "x..x..x...x.x...", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "funk", name: "Funk Pocket", group: "Funk & Soul", bpm: 98,
      patch: kit({ snare: [1, 0.8, 0.7, 0.75], ch: [1, 0.7, 0.55, 0.45], kick: [0, 0.8, 0.5, 0.9] }, { drumSwing: 0.06, revMix: 0.12 }),
      patterns: pats([
        P(16, { kick: "X.....x...X..x..", snare: "....X..x.x..X...", ch: "xxxxxxxxxxxxxxxx" }),
        P(16, { kick: "X.x...x...X..x..", snare: "....X..x.x..X..x", ch: "xxxxxxx.xxxxxxx.", oh: ".......x.......x" }),
        P(16, { kick: "X.....x...X.....", snare: "....X..x.x..XxXX", tom: "..........x.x..." }),
        P(16, { kick: "X.........X.....", ch: "xxxxxxxxxxxxxxxx" })
      ])
    },
    {
      id: "motown", name: "Motown Stomp", group: "Funk & Soul", bpm: 118,
      patch: kit({ snare: [0, 1, 0.6, 0.7], bell: [1, 0.9, 0.7, 0.45], kick: [0, 0.9, 0.3, 0.85] }, { revMix: 0.2 }),
      patterns: pats([
        P(16, { kick: "X.x.....X.x.....", snare: "X...X...X...X...", bell: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.x.....X.x..x..", snare: "X...X...X...X...", bell: "xxx.xxx.xxx.xxx." }),
        P(16, { kick: "X.x.....X.x.....", snare: "X...X...X..xXxXX", tom: "........x.x....." }),
        P(16, { snare: "....X.......X...", bell: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "soulBallad", name: "Soul Ballad 12/8", group: "Funk & Soul", bpm: 64,
      patch: kit({ ch: [-1, 0.9, 0.4, 0.4], snare: [-1, 1.2, 0.5, 0.7], kick: [-1, 1, 0.3, 0.85] }, { revMix: 0.3, revSize: 2.2 }),
      patterns: pats([
        P(12, { ch: "xxxxxxxxxxxx", kick: "X.....x.x...", snare: "...X.....X.." }),
        P(12, { ch: "xxxxxxxxxxxx", kick: "X.....x.x..x", snare: "...X.....X.." }),
        P(12, { ch: "xxxxxx......", snare: "...X.....XXX", tom: "......xx.x.." }),
        P(12, { oh: "X.....X.....", rim: "...x.....x.." })
      ])
    },
    {
      id: "neoSoul", name: "Neo-Soul Lazy", group: "Funk & Soul", bpm: 84,
      patch: kit({ kick: [-1, 0.9, 0.3, 0.85], rim: [0, 1, 0.3, 0.55], ch: [-1, 0.9, 0.35, 0.4] }, { drumSwing: 0.28, eqHigh: -2, revMix: 0.18 }),
      patterns: pats([
        P(16, { kick: "X......x..X.....", rim: "....X.......X..x", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X......x..X..x..", snare: "....X.......X..x", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X......x..X.....", snare: "....X.......XxXx", oh: "..............x." }),
        P(16, { ch: "x.x.x.x.x.x.x.x.", rim: "....x.......x..." })
      ])
    },
    {
      id: "popRock", name: "Pop Rock", group: "Pop & Rock", bpm: 120,
      patch: kit({ kick: [0, 1, 0.55, 0.95], snare: [0, 1, 0.6, 0.8], ch: [0, 1, 0.5, 0.45], oh: [0, 1.2, 0.3, 0.45] }, { revMix: 0.22, drive: 0.05 }),
      patterns: pats([
        P(16, { kick: "X.......X.X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.......X.X..x..", snare: "....X.......X...", oh: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.......X.......", snare: "....X.......XXXX", tom: "........xxxx...." }),
        P(16, { kick: "X...X...X...X...", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "indieDisco", name: "Indie Disco", group: "Pop & Rock", bpm: 124,
      patch: kit({ kick: [0, 0.9, 0.6, 0.95], ch: [1, 0.8, 0.6, 0.45], oh: [1, 0.7, 0.6, 0.4], bell: [0, 0.8, 0.6, 0.35] }, { revMix: 0.18 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", snare: "....X.......X...", oh: "..x...x...x...x.", bell: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X...X...X...X...", snare: "....X.......X...", ch: "xxxxxxxxxxxxxxxx", oh: "..x...x...x...x." }),
        P(16, { kick: "X...X...X...X...", snare: "....X..x.x..XXXX" }),
        P(16, { kick: "X...X...X...X...", bell: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "oneDrop", name: "Reggae One Drop", group: "Pop & Rock", bpm: 76,
      patch: kit({ rim: [1, 0.8, 0.5, 0.7], kick: [-1, 1, 0.3, 0.85], ch: [0, 0.8, 0.4, 0.4] }, { drumSwing: 0.2, revMix: 0.24, delayMix: 0.12, delayTime: 0.4, delayFb: 0.3 }),
      patterns: pats([
        P(16, { kick: "........X.......", rim: "........X.......", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "........X.......", rim: "........X.......", ch: "x.x.x.x.x.x.x.x.", oh: "..x.......x....." }),
        P(16, { kick: "........X.......", snare: "............xxXX", tom: "........x.x....." }),
        P(16, { rim: "........X.......", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "shuffle", name: "Blues Shuffle", group: "Pop & Rock", bpm: 104,
      patch: kit({ oh: [0, 1.1, 0.35, 0.45], snare: [0, 1, 0.55, 0.75], kick: [0, 0.9, 0.4, 0.85] }, { revMix: 0.2 }),
      patterns: pats([
        P(12, { oh: "X.xX.xX.xX.x", kick: "X.....X.....", snare: "...X.....X.." }),
        P(12, { ch: "X.xX.xX.xX.x", kick: "X.....X..x..", snare: "...X.....X.." }),
        P(12, { oh: "X.xX.x......", snare: "...X..xxx.XX", tom: "......x.x..." }),
        P(12, { oh: "X.xX.xX.xX.x" })
      ])
    },
    {
      id: "brushBallad", name: "Brush Ballad", group: "Jazz", bpm: 70,
      patch: kit({ clap: [-1, 1.6, 0.35, 0.65], kick: [-2, 0.8, 0.2, 0.55], rim: [-1, 1, 0.3, 0.45] }, { revMix: 0.3, revSize: 2.4 }),
      patterns: pats([
        P(16, { clap: "x...x...x...x...", rim: "....x.......x...", kick: "X.......X......." }),
        P(16, { clap: "x.x.x.x.x.x.x.x.", rim: "....x.......x...", kick: "X.......X......." }),
        P(16, { clap: "x...x...x.x.xxxx", tom: "............x.x." }),
        P(16, { clap: "x...x...x...x..." })
      ])
    }
  ]
};
