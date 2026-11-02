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
  // a drum kit as the audience hears it: hi-hat left, ride and tom right, shaker further right;
  // kick nearly dry, cymbals and toms in the room
  base: { drumSwing: 0, drumAccent: 0.5, delayMix: 0, revMix: 0.18, revSize: 1.4, drive: 0, eqHigh: 0, volume: 1, drumGlue: 0.5,
    chPan: -0.3, ohPan: 0.35, tomPan: 0.25, bellPan: 0.45, kickSend: 0.15, chSend: 0.5, ohSend: 0.8, tomSend: 0.8, bellSend: 0.7 },
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
        P(16, { kick: "X.....x...X..x..", snare: "..g.X..g.g..X.g.", ch: "xgxgxgxgxgxgxgxg" }),
        P(16, { kick: "X.x...x...X..x..", snare: "g.g.X..g.g.gX..x", ch: "xgxgxgx.xgxgxgx.", oh: ".......x.......x" }),
        P(16, { kick: "X.....x...X.....", snare: "..g.X..g.g..F3X4", tom: "..........x.x..." }),
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
    },
    // --------------------------------------------------- chill & fusion ----
    {
      id: "liveLofi", name: "Live Lo-fi", group: "Chill & Fusion", bpm: 82,
      patch: kit({ kick: [-1, 0.9, 0.3, 0.9], snare: [-2, 1, 0.35, 0.7], ch: [0, 0.8, 0.35, 0.36], bell: [0, 0.9, 0.35, 0.3] },
        { drumSwing: 0.2, revMix: 0.16, drumGlue: 0.5, snareColor: -0.25, chColor: -0.3, kickColor: -0.15 }),
      patterns: pats([
        P(16, { kick: "X......x..X.....", snare: "....X..g.g..X...", ch: "x.x.x.x.x.x.x.x.", bell: "..x...x...x...x." }),
        P(16, { kick: "X......x..X..x..", snare: "....X..g.g..X..g", ch: "x.x.x.x.x.x.xxx.", bell: "..x...x...x...x." }),
        P(16, { kick: "X......x..X.....", snare: "....X..g.g..F.3X", ch: "x.x.x.x.x.x....." }),
        P(16, { ch: "x.x.x.x.x.x.x.x.", bell: "..x...x...x...x." })
      ])
    },
    {
      id: "tripHopLive", name: "Trip-hop Live", group: "Chill & Fusion", bpm: 84,
      patch: kit({ kick: [-2, 1.1, 0.45, 1], snare: [-1, 1.2, 0.5, 0.75], ch: [0, 0.9, 0.4, 0.38], oh: [-1, 1.2, 0.4, 0.3] },
        { drumSwing: 0.14, revMix: 0.26, revSize: 2.2, drumGlue: 0.55 }),
      patterns: pats([
        P(16, { kick: "X.......x.X.....", snare: "....X..g....X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.......x.X..x..", snare: "....X..g....X.g.", ch: "x.x.x.x.x.x.x.x.", oh: "..............x." }),
        P(16, { kick: "X.......x.X.....", snare: "....X..g...gF333", tom: "..........x....." }),
        P(16, { kick: "X.........X.....", oh: "x.......x......." })
      ])
    },
    {
      id: "ambientBrushes", name: "Ambient Brushes", group: "Chill & Fusion", bpm: 66,
      patch: kit({ clap: [0, 1.4, 0.35, 0.55], oh: [-1, 1.4, 0.3, 0.32], kick: [-2, 1, 0.2, 0.55], rim: [0, 1, 0.3, 0.32] },
        { revMix: 0.38, revSize: 3.6, delayMix: 0.15, delayTime: 0.45, drumGlue: 0.2, clapSend: 1 }),
      patterns: pats([
        P(16, { clap: "x...x...x...x...", oh: "x..?..x...x..?..", kick: "X.......x.......", rim: "......x.......x." }),
        P(16, { clap: "x...x...x...x.x.", oh: "x..x..x...x..x..", kick: "X.......x.......", rim: "......x.......x." }),
        P(16, { clap: "x...x...x.x.x3x3", oh: "x..x..x...x.....", kick: "X.......x...x..." }),
        P(16, { clap: "x...x...x...x...", oh: "x..?..x...x..?.." })
      ])
    },
    {
      id: "jazzHop", name: "Jazz Hop", group: "Chill & Fusion", bpm: 90,
      patch: kit({ kick: [-1, 0.9, 0.35, 0.9], snare: [0, 0.9, 0.5, 0.65], oh: [0, 1, 0.45, 0.36], rim: [0, 0.9, 0.4, 0.45] }, { drumSwing: 0.24, revMix: 0.18 }),
      patterns: pats([
        P(16, { kick: "X.......x.X.....", rim: "....X.......X...", oh: "x.x.x.xxx.x.x.xx", snare: "......g.......g." }),
        P(16, { kick: "X.......x.X..x..", rim: "....X.......X...", oh: "x.x.x.xxx.x.x.xx", snare: "...g..g...g...g." }),
        P(16, { kick: "X.......x.X.....", snare: "....X...g.g.F33X", oh: "x.x.x.xxx.x....." }),
        P(16, { oh: "x.x.x.xxx.x.x.xx", rim: "....X.......X..." })
      ])
    },
    {
      id: "persianKit", name: "Persian 6/8 on a Kit", group: "Chill & Fusion", bpm: 108,
      patch: kit({ kick: [0, 0.9, 0.4, 0.9], snare: [0, 0.9, 0.55, 0.7], ch: [0, 0.8, 0.5, 0.38], tom: [-2, 1, 0.45, 0.6], bell: [0, 0.9, 0.5, 0.32] }, { revMix: 0.2 }),
      patterns: pats([
        P(12, { kick: "X.....X.....", snare: "...X..g..X..", ch: "x.xx.xx.xx.x", bell: "xxxxxxxxxxxx" }),
        P(12, { kick: "X.....X..x..", snare: "...X..g..X.g", ch: "x.xx.xx.xx.x", tom: "..........x." }),
        P(12, { kick: "X.....X.....", snare: "...X..g..X..", tom: "......x.x333" }),
        P(12, { kick: "X.....X.....", ch: "x.xx.xx.xx.x", bell: "xxxxxxxxxxxx" })
      ])
    }
  ]
};
