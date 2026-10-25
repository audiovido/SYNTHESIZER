import { DrumPattern, patternFrom as P } from "../engine/drums";
import { MachineDef, row, SEC } from "./types";

/**
 * KERMAN — drum machine: 8 synthesized voices, 16-step sequencer (12 for 6/8),
 * 8 pattern slots, accents and swing. Each kit loads its sounds, tempo and
 * four patterns: A main, B variation, C fill, D break.
 */

const kit = (voices: Record<string, [number, number, number, number]>, fx: Record<string, number> = {}) => {
  const p: Record<string, number> = { ...fx };
  for (const v in voices) {
    const [tune, decay, tone, level] = voices[v];
    p[v + "Tune"] = tune; p[v + "Decay"] = decay; p[v + "Tone"] = tone; p[v + "Level"] = level;
  }
  return p;
};

const DEF: Record<string, [number, number, number, number]> = {
  kick: [0, 1, 0.5, 0.9], snare: [0, 1, 0.5, 0.7], clap: [0, 1, 0.5, 0.65], ch: [0, 1, 0.5, 0.45],
  oh: [0, 1, 0.5, 0.4], tom: [0, 1, 0.5, 0.6], rim: [0, 1, 0.5, 0.5], bell: [0, 1, 0.5, 0.4]
};
const mk = (over: Record<string, [number, number, number, number]>, fx: Record<string, number> = {}) => kit({ ...DEF, ...over }, fx);

const pats = (list: DrumPattern[]) => list;

export const KERMAN: MachineDef = {
  id: "kerman",
  name: "Kerman",
  role: "Drum machine",
  skin: "kerman",
  kind: "drums",
  tempo: true,
  pages: [
    { id: "steps", label: "Steps" },
    { id: "sound", label: "Sound" },
    { id: "fx", label: "Effects" }
  ],
  sections: [
    { title: "PATTERN", page: "steps", custom: "drum-transport", span: 2, wide: true, controls: [] },
    { title: "SOUND", page: "sound", custom: "drum-voice", wide: true, controls: [] },
    { title: "GROOVE", page: "sound", controls: [row([["drumSwing", "SWING"], ["drumAccent", "ACCENT"], ["volume", "VOL"]])] },
    { title: "STEPS", page: "steps", custom: "drum-steps", span: 3, wide: true, controls: [] },
    SEC.driveEq("fx"),
    SEC.space("fx")
  ],
  base: { drumSwing: 0, drumAccent: 0.5, delayMix: 0, revMix: 0.1, revSize: 1.2, drive: 0.1, volume: 0.8 },
  presets: [
    {
      id: "k808", name: "808 Classic", group: "Classic", bpm: 100,
      patch: mk({ kick: [0, 1.6, 0.3, 0.95], snare: [0, 0.8, 0.6, 0.65], clap: [0, 1, 0.4, 0.6], bell: [0, 1, 0.5, 0.45] }),
      patterns: pats([
        P(16, { kick: "X.....x...X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.....x...X..x..", snare: "....X.......X...", ch: "x.xxx.x.x.xxx.x.", oh: "..............x." }),
        P(16, { kick: "X.....x...X.x.x.", snare: "....X.......XxXX", ch: "x.x.x.x.x.x.....", tom: "..........x.x..." }),
        P(16, { kick: "X...............", clap: "....X.......X...", bell: "..x...x...x...x.", ch: "....x.......x..." })
      ])
    },
    {
      id: "k909", name: "909 House", group: "Classic", bpm: 124,
      patch: mk({ kick: [0, 0.9, 0.7, 0.95], clap: [1, 1.1, 0.6, 0.7], oh: [0, 0.8, 0.6, 0.4], ch: [0, 0.8, 0.6, 0.35] }, { revMix: 0.15 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", oh: "..X...X...X...X.", ch: "x...x...x...x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", oh: "..X...X...X...X.", ch: "x.x.x.x.x.x.x.x.", rim: "...........x...." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", snare: ".............xXX", tom: "..........x.x..." }),
        P(16, { kick: "X...............", clap: "....X.......X...", oh: "..X...X...X...X." })
      ])
    },
    {
      id: "techno", name: "Techno Warehouse", group: "Club", bpm: 130,
      patch: mk({ kick: [-2, 1.3, 0.6, 1], rim: [2, 0.8, 0.7, 0.45], oh: [0, 0.6, 0.8, 0.35], clap: [0, 1.4, 0.3, 0.55] }, { drive: 0.35, revMix: 0.2, revSize: 2.5 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", oh: "..x...x...x...x.", rim: "...x..x....x..x." }),
        P(16, { kick: "X...X...X...X...", oh: "..X...X...X...X.", ch: ".x.x.x.x.x.x.x.x", clap: "....X.......X..." }),
        P(16, { kick: "X...X...X...X.XX", oh: "..x...x...x.....", tom: "........x.x.x..." }),
        P(16, { ch: "x.x.x.x.x.x.x.x.", clap: "....X.......X...", rim: "...x..x....x..x." })
      ])
    },
    {
      id: "minimal", name: "Minimal", group: "Club", bpm: 122,
      patch: mk({ kick: [0, 0.7, 0.4, 0.9], rim: [4, 0.6, 0.8, 0.5], ch: [3, 0.5, 0.7, 0.3], clap: [2, 0.7, 0.6, 0.5] }, { delayMix: 0.18, delayTime: 0.37, delayFb: 0.4 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", rim: "..x..x....x..x..", ch: "..x...x...x...x." }),
        P(16, { kick: "X...X...X...X...", rim: "..x..x....x..x..", clap: "....X..........." }),
        P(16, { kick: "X...X...X...X..x", rim: "..x..xx...x..x.x" }),
        P(16, { rim: "..x..x....x..x..", ch: "..x...x...x...x." })
      ])
    },
    {
      id: "electro", name: "Electro", group: "Club", bpm: 126,
      patch: mk({ kick: [1, 1.2, 0.5, 0.95], snare: [2, 0.7, 0.8, 0.65], bell: [-2, 0.8, 0.6, 0.4] }, { drive: 0.2 }),
      patterns: pats([
        P(16, { kick: "X.....X.X.......", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.....X.X..X....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x.", bell: "..x.....x...x..." }),
        P(16, { kick: "X.....X.X.......", snare: "....X.......XxXx", tom: "............x.x." }),
        P(16, { kick: "X.......X.......", bell: "..x.....x...x..." })
      ])
    },
    {
      id: "boombap", name: "Boom Bap", group: "Hip-hop", bpm: 90,
      patch: mk({ kick: [-1, 1.1, 0.4, 0.95], snare: [-2, 1.2, 0.4, 0.75], ch: [-2, 0.8, 0.3, 0.4] }, { drumSwing: 0.22, eqHigh: -3, revMix: 0.12 }),
      patterns: pats([
        P(16, { kick: "X.......X.X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.....X...X..x..", snare: "....X.......X..x", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.......X.X.....", snare: "....X.......X.XX", oh: "..............x." }),
        P(16, { kick: "X...............", rim: "....X.......X...", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "trap", name: "Trap", group: "Hip-hop", bpm: 140,
      patch: mk({ kick: [-3, 2.4, 0.3, 1], snare: [1, 1, 0.7, 0.7], clap: [1, 1, 0.5, 0.65], ch: [2, 0.6, 0.7, 0.35] }, { drive: 0.25, eqLow: 3 }),
      patterns: pats([
        P(16, { kick: "X......X..X.....", clap: "........X.......", ch: "x.x.x.x.x.x.xxxx" }),
        P(16, { kick: "X......X.X....x.", clap: "........X.......", ch: "x.xxx.x.x.xxx.xx", oh: "......x........." }),
        P(16, { kick: "X......X..X.....", clap: "........X.......", ch: "xxxxxxxxxxxxxxxx", snare: "...............X" }),
        P(16, { kick: "X...............", clap: "........X......." })
      ])
    },
    {
      id: "lofi", name: "Lo-fi Dust", group: "Hip-hop", bpm: 82,
      patch: mk({ kick: [-2, 1, 0.2, 0.85], snare: [-3, 1.3, 0.2, 0.6], ch: [-4, 0.7, 0.1, 0.3], rim: [-3, 1, 0.3, 0.45] }, { drumSwing: 0.3, eqHigh: -7, eqLow: 2, revMix: 0.2, drive: 0.25 }),
      patterns: pats([
        P(16, { kick: "X.......X.....X.", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x.", rim: ".......x........" }),
        P(16, { kick: "X......x..X...x.", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.......X.....X.", snare: "....X.......X.x.", rim: "..x....x....x..." }),
        P(16, { ch: "x.x.x.x.x.x.x.x.", rim: "....x.......x..." })
      ])
    },
    {
      id: "breaks", name: "Breakbeat", group: "Breaks & Latin", bpm: 136,
      patch: mk({ kick: [0, 0.9, 0.6, 0.9], snare: [1, 0.9, 0.7, 0.75] }, { drive: 0.2, revMix: 0.12 }),
      patterns: pats([
        P(16, { kick: "X.X.......XX....", snare: "....X..x.x..X..x", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.X.......X.....", snare: "....X..x.x..X...", ch: "x.x.x.x.x.x.x.x.", oh: "..............x." }),
        P(16, { kick: "X.X.......XX....", snare: "....X..x.x..XxXX" }),
        P(16, { kick: "X.........X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "dembow", name: "Reggaeton Dembow", group: "Breaks & Latin", bpm: 95,
      patch: mk({ kick: [0, 1, 0.5, 0.95], rim: [-1, 1.1, 0.5, 0.6], snare: [0, 0.8, 0.6, 0.6] }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", rim: "...x..x....x..x.", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X...X...X...X...", snare: "...x..x....x..x.", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X...X...X...X...", rim: "...x..x....x..xx", tom: "............x.x." }),
        P(16, { rim: "...x..x....x..x." })
      ])
    },
    {
      id: "sheshohasht", name: "Shesh-o-Hasht 6/8", group: "Persian", bpm: 108,
      patch: mk({ kick: [-2, 1.1, 0.3, 0.9], tom: [-3, 1.2, 0.4, 0.75], rim: [3, 0.8, 0.6, 0.55], clap: [0, 0.8, 0.5, 0.5] }, { revMix: 0.18 }),
      patterns: pats([
        P(12, { kick: "X.....X.....", tom: "...x.....x..", rim: "..x.xx..x.xx" }),
        P(12, { kick: "X..x..X.....", tom: ".........x..", rim: "..x.xx..x.xx", clap: "...X.....X.." }),
        P(12, { kick: "X.....X.x.x.", tom: "...x.....xxx", rim: "..x.x..x...." }),
        P(12, { kick: "X...........", rim: "..x.x...x.x." })
      ])
    },
    {
      id: "bandari", name: "Bandari 6/8", group: "Persian", bpm: 126,
      patch: mk({ kick: [-1, 0.9, 0.4, 0.9], tom: [-1, 0.9, 0.5, 0.7], rim: [4, 0.6, 0.7, 0.5], bell: [0, 0.7, 0.5, 0.35] }, { revMix: 0.12 }),
      patterns: pats([
        P(12, { kick: "X..X..X..X..", rim: ".x.x.x.x.x.x", clap: "...X.....X.." }),
        P(12, { kick: "X..X..X..X..", tom: "..x.....x...", rim: ".x.x.x.x.x.x", bell: "x.....x....." }),
        P(12, { kick: "X..X..X..XxX", tom: "..x..x..x.x.", rim: ".x.x.x......" }),
        P(12, { kick: "X.....X.....", rim: ".x.x.x.x.x.x" })
      ])
    }
  ]
};
