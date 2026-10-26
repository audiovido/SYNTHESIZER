import { patternFrom as P } from "../engine/drums";
import { DRUM_PAGES, drumSections, KitVoices, kitPatch, pats } from "./drumkit";
import { MachineDef } from "./types";

/**
 * HORMOZ — digital, FM and glitch drums for modern bass music.
 * Slots: BOOM (kick, long 808 sub) · SNAP (FM snare) · ZAP (laser) · TICK (crushed hat)
 *        METAL (FM open hat) · FM TOM (long decay = log drum) · GLITCH · BLIP
 */

const DEF: KitVoices = {
  kick: [0, 1, 0.3, 0.9], snare: [0, 1, 0.5, 0.7], clap: [0, 1, 0.3, 0.45], ch: [0, 1, 0.4, 0.4],
  oh: [0, 1, 0.5, 0.35], tom: [0, 1, 0.4, 0.65], rim: [0, 1, 0.4, 0.45], bell: [0, 1, 0.3, 0.4]
};
const kit = (over: KitVoices, fx: Record<string, number> = {}) => kitPatch(DEF, over, fx);

export const HORMOZ: MachineDef = {
  id: "hormoz",
  name: "Hormoz",
  role: "Digital & glitch drums",
  skin: "hormoz",
  kind: "drums",
  drumModel: "digital",
  drumLabels: { kick: "BOOM", snare: "SNAP", clap: "ZAP", ch: "TICK", oh: "METAL", tom: "FM TOM", rim: "GLITCH", bell: "BLIP" },
  tempo: true,
  pages: DRUM_PAGES,
  sections: drumSections(),
  base: { drumSwing: 0, drumAccent: 0.5, delayMix: 0, revMix: 0.1, revSize: 1.2, drive: 0.1, eqLow: 2, volume: 0.8 },
  presets: [
    {
      id: "ukDrill", name: "UK Drill", group: "Bass music", bpm: 142,
      patch: kit({ kick: [-3, 2.2, 0.35, 1], snare: [1, 0.9, 0.6, 0.75], ch: [2, 0.8, 0.5, 0.4], rim: [0, 0.8, 0.3, 0.35] }, { eqLow: 3 }),
      patterns: pats([
        P(16, { kick: "X.........X..x..", snare: "........X.......", ch: "x..x..x.x..x..x.", rim: "...............x" }),
        P(16, { kick: "X......x..X.....", snare: "........X.....x.", ch: "x..x..x.x.xx..x.", oh: "......x........." }),
        P(16, { kick: "X.........X..x..", snare: "........X...XxXX", ch: "xxxxxxxxx..x..x." }),
        P(16, { kick: "X...............", ch: "x..x..x.x..x..x." })
      ])
    },
    {
      id: "dubstep", name: "Dubstep Half-time", group: "Bass music", bpm: 140,
      patch: kit({ kick: [-1, 1.2, 0.6, 1], snare: [0, 1.1, 0.7, 0.85], clap: [0, 1.2, 0.6, 0.45], ch: [0, 0.8, 0.5, 0.35] }, { drive: 0.25, revMix: 0.14 }),
      patterns: pats([
        P(16, { kick: "X.........X.....", snare: "........X.......", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.....x...X.....", snare: "........X.......", ch: "x.x.x.x.x.x.x.x.", clap: "..............X." }),
        P(16, { kick: "X.........X.X.X.", snare: "........X.XXXXXX", clap: "X..............." }),
        P(16, { snare: "........X.......", clap: "X.......X......." })
      ])
    },
    {
      id: "footwork", name: "Footwork 160", group: "Bass music", bpm: 160,
      patch: kit({ kick: [-2, 1.4, 0.4, 1], snare: [2, 0.7, 0.7, 0.6], tom: [3, 0.6, 0.6, 0.55], ch: [1, 0.6, 0.6, 0.35] }),
      patterns: pats([
        P(16, { kick: "X..X..X...X..X..", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X..X..X...X..X..", snare: "....X.......X...", tom: "x..x..x.........", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X..X..X.X.X.X.XX", tom: "..x..x..x..x..x." }),
        P(16, { kick: "X..X..X...X..X..", rim: "....x.......x..." })
      ])
    },
    {
      id: "jerseyClub", name: "Jersey Club", group: "Club", bpm: 140,
      patch: kit({ kick: [0, 0.9, 0.5, 1], snare: [1, 0.8, 0.6, 0.7], bell: [5, 0.8, 0.3, 0.45] }),
      patterns: pats([
        P(16, { kick: "X.X.X...X...X.X.", snare: "....X.......X...", bell: "........x......." }),
        P(16, { kick: "X.X.X...X...X.X.", snare: "....X..x....X...", bell: "x.......x.x....." }),
        P(16, { kick: "X.X.X.X.X.X.X.X.", snare: "............XXXX" }),
        P(16, { kick: "X.X.X...........", snare: "....X.......X..." })
      ])
    },
    {
      id: "industrial", name: "Industrial Techno", group: "Club", bpm: 135,
      patch: kit({ kick: [1, 0.9, 0.9, 1], oh: [-2, 0.9, 0.4, 0.45], rim: [0, 1, 0.6, 0.4], ch: [0, 0.6, 0.2, 0.35] }, { drive: 0.45, revMix: 0.2, revSize: 2.4 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", oh: "..x...x...x...x.", ch: "xxxxxxxxxxxxxxxx" }),
        P(16, { kick: "X...X...X...X...", oh: "..x...x...x...x.", rim: ".....x.....x..x.", snare: "....X.......X..." }),
        P(16, { kick: "X...X...X...XXXX", rim: "x.x.x.x.x.x.x.x." }),
        P(16, { ch: "xxxxxxxxxxxxxxxx", oh: "..x...x...x...x." })
      ])
    },
    {
      id: "minimalClick", name: "Minimal Click", group: "Club", bpm: 124,
      patch: kit({ kick: [2, 0.6, 0.2, 0.9], ch: [3, 0.5, 0.3, 0.3], rim: [2, 0.6, 0.2, 0.4], bell: [0, 0.6, 0.6, 0.35] }, { delayMix: 0.2, delayTime: 0.36, delayFb: 0.4 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", ch: "..x...x...x...x.", rim: "...x..x...x..x.." }),
        P(16, { kick: "X...X...X...X...", ch: "..x...x...x...x.", bell: ".......x.....x.." }),
        P(16, { kick: "X...X...X...X..x", rim: "...x..xx.xx.x.xx" }),
        P(16, { ch: "..x...x...x...x.", bell: ".......x.....x.." })
      ])
    },
    {
      id: "futureGarage", name: "Future Garage", group: "Club", bpm: 132,
      patch: kit({ kick: [-1, 0.9, 0.3, 0.9], snare: [0, 1.2, 0.8, 0.6], ch: [2, 0.6, 0.6, 0.35], clap: [-6, 1.6, 0.1, 0.3] }, { drumSwing: 0.22, revMix: 0.3, revSize: 3 }),
      patterns: pats([
        P(16, { kick: "X.........X.....", snare: "....X.......X...", ch: "..x.x...x.x..x.." }),
        P(16, { kick: "X......x..X.....", snare: "....X.......X..x", ch: "..x.x.x.x.x..x..", clap: "X..............." }),
        P(16, { kick: "X.........X.....", snare: "....X.....X.XXXX" }),
        P(16, { ch: "..x.x...x.x..x..", clap: "X......." })
      ])
    },
    {
      id: "amapiano", name: "Amapiano Log", group: "Global", bpm: 112,
      patch: kit({ tom: [-7, 2.4, 0.25, 0.85], kick: [0, 0.7, 0.2, 0.8], ch: [0, 0.6, 0.6, 0.35], bell: [0, 0.8, 0.3, 0.35] }, { drumSwing: 0.12, revMix: 0.16 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", tom: "x..x....x.x...x.", ch: "..x...x...x...x.", rim: "....x.......x..." }),
        P(16, { kick: "X...X...X...X...", tom: "x..x..x...x.x...", ch: "..xx..x...xx..x.", bell: "......x.......x." }),
        P(16, { kick: "X...X...X...X...", tom: "x.x.x.x.x.x.x.xx" }),
        P(16, { tom: "x..x....x.x...x.", ch: "..x...x...x...x." })
      ])
    },
    {
      id: "phonk", name: "Phonk Cowbell", group: "Global", bpm: 130,
      patch: kit({ kick: [-2, 1.6, 0.7, 1], snare: [1, 0.8, 0.6, 0.7], bell: [-5, 1, 0.33, 0.5], ch: [1, 0.6, 0.4, 0.35] }, { drive: 0.3, eqLow: 3 }),
      patterns: pats([
        P(16, { kick: "X......X..X.....", snare: "....X.......X...", bell: "x.xx..x.x.xx..x.", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X......X..X..x..", snare: "....X.......X...", bell: "x.xx..x.xx.x.xx.", ch: "x.x.x.x.x.x.xxxx" }),
        P(16, { kick: "X......X..X.....", snare: "....X.......XXXX", bell: "xxxxxxxx........" }),
        P(16, { bell: "x.xx..x.x.xx..x." })
      ])
    },
    {
      id: "idmGlitch", name: "IDM Glitch", group: "Experimental", bpm: 110,
      patch: kit({ rim: [0, 1, 0.8, 0.55], ch: [0, 0.6, 0.1, 0.4], bell: [0, 0.6, 0.66, 0.4], snare: [3, 0.6, 0.8, 0.6] }, { delayMix: 0.22, delayTime: 0.2, delayFb: 0.45, revMix: 0.18 }),
      patterns: pats([
        P(16, { kick: "X......x...X....", snare: "....x.....X.....", rim: "..x..x.x.x...xx.", ch: "x.xx.x..xx.x.x.." }),
        P(16, { kick: "X..x...x..X.....", snare: "....x...x...X...", rim: "x.x..xx..x.x...x", bell: ".......x.....x.." }),
        P(16, { rim: "xxxxxxxxxxxxxxxx", snare: "..x...x.x.xxxxXX" }),
        P(16, { bell: "x..x..x..x..x...", ch: "x.xx.x..xx.x.x.." })
      ])
    },
    {
      id: "hyperpop", name: "Hyperpop", group: "Experimental", bpm: 160,
      patch: kit({ kick: [2, 0.9, 0.9, 1], snare: [4, 0.7, 0.9, 0.7], clap: [3, 0.6, 0.8, 0.45], bell: [7, 0.7, 0.66, 0.4] }, { drive: 0.4 }),
      patterns: pats([
        P(16, { kick: "X.....X...X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x.", bell: "x..x..x...x....." }),
        P(16, { kick: "X.....X...X..X..", snare: "....X.......X...", clap: "...............X", ch: "xxxxxxxxxxxxxxxx" }),
        P(16, { kick: "X.X.X.X.X.X.X.X.", snare: "XXXXXXXXXXXXXXXX" }),
        P(16, { bell: "x..x..x...x.....", clap: "X..............." })
      ])
    },
    {
      id: "lasers", name: "Laser Lab", group: "Experimental", bpm: 120,
      patch: kit({ clap: [0, 1, 0.2, 0.55], oh: [0, 1, 0.5, 0.4], tom: [4, 0.8, 0.9, 0.5], bell: [0, 0.8, 0, 0.4] }, { delayMix: 0.3, delayTime: 0.375, delayFb: 0.5, revMix: 0.2 }),
      patterns: pats([
        P(16, { kick: "X.......X.......", clap: "....X.......X...", bell: "x.x...x.x...x..." }),
        P(16, { kick: "X.......X.......", clap: "....X..x....X...", tom: "..x.....x.x.....", oh: "......x.......x." }),
        P(16, { clap: "x.x.x.x.x.x.xxxx" }),
        P(16, { bell: "x.x...x.x...x...", oh: "......x.......x." })
      ])
    }
  ]
};
