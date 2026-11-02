import { DrumPattern, patternFrom as P } from "../engine/drums";
import { drumPresets, kitFromSource, stylesFrom } from "./drumkit";
import { DrumKitDef, DrumStyleDef, MachineDef, PresetDef, row, SEC } from "./types";

/**
 * KERMAN — electronic drum machine. Kits are the classic rhythm machines
 * (808, 909, 707, 606, CR-78, 80s sampler) and modern variations of them;
 * styles are rhythms (A main, B variation, C fill, D break) that play on any kit.
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

/** Rhythm sources: each one becomes a style (and some lend their sound to a kit). */
const SRC: PresetDef[] = [
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
    },
{
      id: "afroHouse", name: "Afro House", group: "Club", bpm: 122,
      patch: mk({ kick: [0, 0.9, 0.5, 0.95], tom: [2, 0.7, 0.6, 0.6], rim: [3, 0.7, 0.6, 0.5], bell: [1, 0.7, 0.5, 0.35], ch: [1, 0.7, 0.6, 0.35] }, { drumSwing: 0.12, revMix: 0.14 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", tom: "..x...x.x..x...x", rim: "...x..x....x..x.", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X...X...X...X...", tom: "..x...x.x..x...x", rim: "...x..x....x..x.", bell: "x..x..x...x.x...", clap: "....X.......X..." }),
        P(16, { kick: "X...X...X...X...", tom: "x.x.x.x.x.xxxxxx" }),
        P(16, { tom: "..x...x.x..x...x", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "dnb", name: "Drum & Bass", group: "Breaks & Latin", bpm: 174,
      patch: mk({ kick: [0, 0.8, 0.6, 0.95], snare: [2, 0.8, 0.8, 0.8], ch: [1, 0.6, 0.7, 0.35], oh: [0, 0.6, 0.7, 0.3] }, { drive: 0.2, revMix: 0.12 }),
      patterns: pats([
        P(16, { kick: "X.........X.....", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X.........XX....", snare: "....X..x....X...", ch: "x.x.x.x.x.x.x.x.", oh: "..............x." }),
        P(16, { kick: "X.........X.....", snare: "....X..x.x..XxXX" }),
        P(16, { kick: "X.......X.......", ch: "xxxxxxxxxxxxxxxx" })
      ])
    },
    {
      id: "ukGarage", name: "UK Garage 2-Step", group: "Club", bpm: 132,
      patch: mk({ kick: [0, 0.9, 0.5, 0.9], snare: [1, 0.9, 0.7, 0.7], rim: [2, 0.7, 0.6, 0.45], ch: [2, 0.6, 0.6, 0.35] }, { drumSwing: 0.25, revMix: 0.15 }),
      patterns: pats([
        P(16, { kick: "X.........X.....", snare: "....X.......X...", ch: "..x...x...x...x.", rim: ".......x......x." }),
        P(16, { kick: "X......x..X.....", snare: "....X.......X...", ch: "..x.x.x...x.x.x.", rim: ".......x......x." }),
        P(16, { kick: "X.........X.....", snare: "....X.......XxXx", tom: "..........x.x..." }),
        P(16, { ch: "..x...x...x...x.", rim: ".......x......x." })
      ])
    },
    {
      id: "disco", name: "Disco", group: "Classic", bpm: 118,
      patch: mk({ kick: [0, 0.9, 0.4, 0.9], snare: [0, 0.9, 0.6, 0.7], oh: [0, 0.7, 0.6, 0.45], ch: [0, 0.8, 0.5, 0.4] }, { revMix: 0.18 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", snare: "....X.......X...", oh: "..X...X...X...X.", ch: "x...x...x...x..." }),
        P(16, { kick: "X...X...X...X...", snare: "....X.......X...", oh: "..X...X...X...X.", ch: "xxx.xxx.xxx.xxx." }),
        P(16, { kick: "X...X...X...X...", snare: "....X.......XXXX", tom: "........x.x.x..." }),
        P(16, { kick: "X...X...X...X...", oh: "..X...X...X...X." })
      ])
    },
    // --------------------------------------------- chill, ambient, deep ----
    {
      id: "deepHouse", name: "Deep House", group: "Chill & Deep", bpm: 120,
      patch: mk({ kick: [-1, 1.2, 0.35, 0.95], clap: [0, 1.1, 0.4, 0.5], ch: [0, 0.8, 0.45, 0.38], oh: [0, 0.9, 0.4, 0.34], rim: [0, 0.8, 0.5, 0.32] }, { drumSwing: 0.1, revMix: 0.22, rimSend: 1 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", ch: "g.x.g.x.g.x.g.x.", oh: "..x.......x.....", rim: "...x.....x..x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", ch: "g.x.g.x.g.x.g.x.", oh: "..x...x...x...x.", rim: "...x..x..x..x..." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X.x?", ch: "gxxxgxxxgxxxgxxx", rim: "...x..x..x..x.x." }),
        P(16, { ch: "g.x.g.x.g.x.g.x.", oh: "..x.......x.....", rim: "...x.....x..x..." })
      ])
    },
    {
      id: "dubTechno", name: "Dub Techno", group: "Chill & Deep", bpm: 118,
      patch: mk({ kick: [-2, 1.3, 0.25, 0.95], ch: [-1, 0.9, 0.35, 0.34], oh: [-1, 1.1, 0.35, 0.3], rim: [-3, 1.2, 0.3, 0.38], clap: [-2, 1.4, 0.3, 0.38] },
        { revMix: 0.3, revSize: 3.2, delayMix: 0.35, delayTime: 0.375, delayFb: 0.55, rimSend: 1, clapSend: 1, chColor: -0.25 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", ch: "..x...x...x...x.", rim: "......x.......x." }),
        P(16, { kick: "X...X...X...X...", ch: "..x...x...x...x.", oh: "..........x.....", rim: "...x..x....x..x." }),
        P(16, { kick: "X...X...X...X...", ch: "..x...x...x.x.x.", clap: "............x...", rim: "...x..x...x.x.x." }),
        P(16, { ch: "..x...x...x...x.", rim: "......x.......x." })
      ])
    },
    {
      id: "ambientTechno", name: "Ambient Techno", group: "Chill & Deep", bpm: 110,
      patch: mk({ kick: [-3, 1.5, 0.15, 0.8], ch: [0, 1.2, 0.25, 0.28], rim: [-5, 1.4, 0.2, 0.3], bell: [-7, 1.6, 0.2, 0.25] },
        { revMix: 0.45, revSize: 4.5, delayMix: 0.3, delayTime: 0.5, delayFb: 0.5, drumGlue: 0.2, rimSend: 1, bellSend: 1, chColor: -0.35 }),
      patterns: pats([
        P(16, { kick: "X.......X.......", ch: "..x?..x?..x?..x?", rim: "......x........." }),
        P(16, { kick: "X.......X...x...", ch: "..x?..x?..x?..x?", rim: "......x.......x.", bell: "x..............." }),
        P(16, { kick: "X.......X.......", ch: "..xx..xx..xx..xx", rim: "......x...x...x.", bell: "x.......x......." }),
        P(16, { ch: "..x?..x?..x?..x?", bell: "x..............." })
      ])
    },
    {
      id: "tripHop", name: "Trip-hop", group: "Chill & Deep", bpm: 86,
      patch: mk({ kick: [-2, 1.2, 0.4, 1], snare: [-3, 1.3, 0.35, 0.75], ch: [0, 0.9, 0.35, 0.36], rim: [0, 1, 0.4, 0.35] },
        { drumSwing: 0.16, revMix: 0.24, revSize: 2.4, drumGlue: 0.55, snareColor: -0.2, chColor: -0.3 }),
      patterns: pats([
        P(16, { kick: "X......x..X.....", snare: "....X..g....X...", ch: "x.x.x.x.x.x.x.x." }),
        P(16, { kick: "X......x..X..x..", snare: "....X..g....X..g", ch: "x.x.x.xxx.x.x.x.", rim: "..............x." }),
        P(16, { kick: "X......x..X.....", snare: "....X..g....F.33", ch: "x.x.x.x.x.x....." }),
        P(16, { kick: "X.........X.....", ch: "x.x.x.x.x.x.x.x." })
      ])
    },
    {
      id: "persianHouse", name: "Persian House", group: "Persian", bpm: 122,
      patch: mk({ kick: [0, 1, 0.3, 0.95], clap: [0, 1, 0.45, 0.48], ch: [0, 0.8, 0.5, 0.36], tom: [-3, 1.1, 0.4, 0.55], rim: [2, 0.8, 0.5, 0.38] }, { revMix: 0.18 }),
      patterns: pats([
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", ch: "xxXxxxXxxxXxxxXx", tom: "..x..x.x...x.x..", rim: "x.....x....x...." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X...", ch: "xxXxxxXxxxXxxxXx", tom: "..x..x.x..xx.xx.", rim: "x..x..x....x...." }),
        P(16, { kick: "X...X...X...X...", clap: "....X.......X.x.", ch: "xxXxxxXxxxXxXXXX", tom: "..x..x.x..33.444" }),
        P(16, { ch: "xxXxxxXxxxXxxxXx", tom: "..x..x.x...x.x..", rim: "x.....x....x...." })
      ])
    }
  ];

const KITS: DrumKitDef[] = [
  // --------------------------------------------------- classic machines ----
  kitFromSource(SRC, "k808", { id: "808", name: "808", group: "Classic machines", tag: "Analog",
    desc: "Booming sine kick, snappy snare, six-oscillator hats and the cowbell. Hip-hop, electro, Miami bass." }),
  { id: "909", name: "909", group: "Classic machines", tag: "Analog + 6-bit",
    desc: "Clipped punchy kick and snare with gritty sampled hats and ride. The sound of house and techno.",
    labels: { bell: "RIDE" },
    patch: { kitModel: "tr909", ...mk({ kick: [0, 1, 0.55, 0.95], snare: [0, 1, 0.55, 0.62], clap: [0, 1, 0.5, 0.6], ch: [0, 1, 0.5, 0.36], oh: [0, 1, 0.5, 0.34], tom: [0, 1, 0.4, 0.6], rim: [0, 1, 0.5, 0.5], bell: [0, 1, 0.5, 0.3] }, { revMix: 0.12 }) } },
  { id: "707", name: "707", group: "Classic machines", tag: "8-bit samples",
    desc: "Tight, clean 8-bit samples with a little crunch, plus tambourine. Italo, freestyle, synth-pop.",
    labels: { bell: "TAMB" },
    patch: { kitModel: "tr707", ...mk({ kick: [0, 1, 0.5, 0.92], snare: [0, 1, 0.5, 0.62], clap: [0, 1, 0.5, 0.58], ch: [0, 1, 0.5, 0.4], oh: [0, 1, 0.5, 0.36], tom: [0, 1, 0.4, 0.6], rim: [0, 1, 0.5, 0.5], bell: [0, 1, 0.5, 0.42] }, { volume: 1 }) } },
  { id: "606", name: "606", group: "Classic machines", tag: "Analog",
    desc: "Small and crisp: a thin boomy kick, noise snare, sizzling tiny hats. Acid, electro, indie.",
    labels: { rim: "TICK", bell: "CYMBAL" },
    patch: { kitModel: "tr606", ...mk({ kick: [0, 1, 0.5, 0.95], snare: [0, 1, 0.5, 0.58], clap: [0, 1, 0.5, 0.55], ch: [0, 1, 0.5, 0.36], oh: [0, 1, 0.5, 0.32], tom: [0, 1, 0.5, 0.6], rim: [0, 1, 0.5, 0.4], bell: [0, 1, 0.5, 0.3] }, { volume: 1 }) } },
  { id: "cr78", name: "CR-78", group: "Classic machines", tag: "Analog presets",
    desc: "The soft 1978 rhythm box: pup kick, bongos, guiro, clave and cowbell. Vintage pop, bossa, chill.",
    labels: { clap: "GUIRO", oh: "CYMBAL", tom: "BONGO", rim: "CLAVE", bell: "COWBELL" },
    patch: { kitModel: "cr78", ...mk({ kick: [0, 1, 0.4, 0.95], snare: [0, 1, 0.5, 0.6], clap: [0, 1, 0.5, 0.5], ch: [0, 1, 0.5, 0.4], oh: [0, 1, 0.5, 0.34], tom: [0, 1, 0.4, 0.6], rim: [0, 1, 0.5, 0.45], bell: [0, 1, 0.5, 0.4] }, { volume: 1, revMix: 0.14, chPan: 0.3, tomPan: -0.35, rimPan: 0.35, bellPan: -0.2, clapPan: 0.2 }) } },
  { id: "lm80", name: "80s Gated", group: "Classic machines", tag: "Samples + gate",
    desc: "The 80s sample machine: tight kick, huge gated snare and toms, cabasa. Synth-pop, new wave, ballads.",
    labels: { rim: "SIDESTICK", bell: "CABASA" },
    patch: { kitModel: "lm80", ...mk({ kick: [0, 1, 0.5, 0.95], snare: [0, 1, 0.5, 0.62], clap: [0, 1, 0.5, 0.55], ch: [0, 1, 0.5, 0.4], oh: [0, 1, 0.5, 0.34], tom: [0, 1, 0.5, 0.62], rim: [0, 1, 0.5, 0.5], bell: [0, 1, 0.5, 0.4] }, { volume: 1, revMix: 0.16, revSize: 1.6 }) } },
  // ------------------------------------------------------------ modern ----
  kitFromSource(SRC, "trap", { id: "trap808", name: "Trap 808", group: "Modern", tag: "Analog",
    desc: "Long tuned 808 boom with drive, crisp clap and fast hats. Trap, drill, modern hip-hop." }),
  kitFromSource(SRC, "techno", { id: "warehouse", name: "Warehouse 909", group: "Modern", tag: "Analog + 6-bit",
    desc: "A driven 909 in a big concrete room. Peak-time and warehouse techno.", labels: { bell: "RIDE" },
    patch: { kitModel: "tr909" } }),
  kitFromSource(SRC, "electro", { id: "electro", name: "Electro 808", group: "Modern", tag: "Analog",
    desc: "A tuned-up, brighter 808 with a cutting snare. Electro, breaks, freestyle." }),
  kitFromSource(SRC, "persianHouse", { id: "persianElectro", name: "Persian Electro", group: "Fusion", tag: "Hybrid",
    desc: "909 kick and clap under tombak DOM and PELANG from Bushehr. Persian house and 6/8 club grooves.",
    labels: { tom: "DOM", rim: "PELANG" },
    patch: { kickModel: "tr909", clapModel: "tr909", tomModel: "persian", rimModel: "persian", tomTune: 0, tomLevel: 0.62, rimTune: 0, rimLevel: 0.42 } }),
  // --------------------------------------------------------- character ----
  kitFromSource(SRC, "lofi", { id: "dusty", name: "Dusty Lo-fi", group: "Character", tag: "Analog, dark",
    desc: "A worn, dark 808 with tape drive and no top end. Lo-fi hip-hop and beats to study to." }),
  kitFromSource(SRC, "boombap", { id: "boombap", name: "Boom Bap", group: "Character", tag: "Analog, warm",
    desc: "Fat low kick and a low, wide snare, rounded top. 90s boom bap." }),
  kitFromSource(SRC, "dubTechno", { id: "dub", name: "Dub Space", group: "Character", tag: "Analog, spacious",
    desc: "Soft dark voices drowned in tape echo and a long hall. Dub techno and deep house." }),
  kitFromSource(SRC, "ambientTechno", { id: "ambient", name: "Ambient Haze", group: "Character", tag: "Analog, spacious",
    desc: "Low, blurred hits sent far into the reverb. Ambient techno and slow electronica." })
];

const KIT_OF: Record<string, string> = {
  k808: "808", k909: "909", techno: "warehouse", minimal: "909", electro: "electro", boombap: "boombap", trap: "trap808",
  lofi: "dusty", breaks: "909", dembow: "808", sheshohasht: "persianElectro", bandari: "persianElectro", afroHouse: "909",
  dnb: "707", ukGarage: "909", disco: "lm80", deepHouse: "808", dubTechno: "dub", ambientTechno: "ambient", tripHop: "dusty",
  persianHouse: "persianElectro"
};

/** New rhythms written for the classic kits. */
const NEW_STYLES: DrumStyleDef[] = [
  { id: "electroFunk", name: "Electro Funk", group: "Funk & Disco", bpm: 104, kit: "707", swing: 0.1, patterns: [
    P(16, { kick: "X.....x...X..x..", snare: "....X..g.g..X...", ch: "xgxgxgxgxgxgxgxg", bell: "....x.......x..." }),
    P(16, { kick: "X.x...x...X..x..", snare: "....X..g.g.gX..x", ch: "xgxgxgx.xgxgxgx.", oh: ".......x.......x", bell: "....x.......x..." }),
    P(16, { kick: "X.....x...X.....", snare: "....X..g.g..F3X4", tom: "..........x.x..." }),
    P(16, { kick: "X.........X.....", ch: "xxxxxxxxxxxxxxxx", bell: "x.x.x.x.x.x.x.x." })
  ] },
  { id: "italo", name: "Italo Disco", group: "Funk & Disco", bpm: 120, kit: "707", patterns: [
    P(16, { kick: "X...X...X...X...", snare: "....X.......X...", oh: "..x...x...x...x.", ch: "x...x...x...x...", bell: "....x.......x..." }),
    P(16, { kick: "X...X...X...X...", snare: "....X.......X...", clap: "....x.......x...", oh: "..x...x...x...x.", ch: "xxx.xxx.xxx.xxx." }),
    P(16, { kick: "X...X...X...X...", snare: "....X.......XxXX", tom: "........x.x.x..." }),
    P(16, { kick: "X...X...X...X...", oh: "..x...x...x...x." })
  ] },
  { id: "salsaBox", name: "Salsa Box", group: "Latin", bpm: 96, kit: "cr78", patterns: [
    // 2 bars of cut time in 8ths: son clave 3-2 on the CLAVE, campana on the COWBELL, martillo on the BONGO
    P(16, { rim: "X..x..x...x.x...", bell: "X...X.x.X...X.x.", tom: "X.gxx.gxX.gxx.gx", kick: "......X.......X.", clap: "x...x.x.x...x.x." }),
    P(16, { rim: "X..x..x...x.x...", bell: "X.xxX.x.X.xxX.x.", tom: "X.gxx.gxX.gxx.gx", kick: "...x..X....x..X.", ch: "..x...x...x...x." }),
    P(16, { rim: "X..x..x...x.x...", tom: "x.x.x.x.xxxxXxXx", kick: "X.......X.X.X..." }),
    P(16, { rim: "X..x..x...x.x...", clap: "x...x.x.x...x.x." })
  ] },
  { id: "bossaBox", name: "Bossa Box", group: "Latin", bpm: 120, kit: "cr78", patterns: [
    P(16, { kick: "X..xX..xX..xX..x", rim: "x..x..x...x..x..", ch: "x.x.x.x.x.x.x.x." }),
    P(16, { kick: "X..xX..xX..xX..x", rim: "x..x..x...x..x..", ch: "x.x.x.x.x.x.x.x.", tom: "..x...x...x...x." }),
    P(16, { kick: "X..xX..xX..xX..x", rim: "x..x..x...x..x..", tom: "x.x.x.x.x.xxxxxx" }),
    P(16, { rim: "x..x..x...x..x..", ch: "x.x.x.x.x.x.x.x.", clap: "x...x...x...x..." })
  ] },
  { id: "synthPop", name: "Synth-pop", group: "Pop & 80s", bpm: 118, kit: "lm80", patterns: [
    P(16, { kick: "X.......X.......", snare: "....X.......X...", ch: "x.x.x.x.x.x.x.x.", bell: "g.x.g.x.g.x.g.x." }),
    P(16, { kick: "X.......X.X.....", snare: "....X.......X...", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }),
    P(16, { kick: "X.......X.......", snare: "....X.......X...", tom: "........X.x.X.xx" }),
    P(16, { kick: "X...X...X...X...", snare: "....X.......X...", bell: "g.x.g.x.g.x.g.x." })
  ] },
  { id: "acid", name: "Acid", group: "Club", bpm: 126, kit: "606", patterns: [
    P(16, { kick: "X...X...X...X...", ch: "x.xxx.xxx.xxx.xx", oh: "..x...x...x...x.", snare: "....x.......x..." }),
    P(16, { kick: "X...X...X...X..x", ch: "x.xxx.xxx.xxx.xx", oh: "..x...x...x...x.", rim: "..x..x..x..x..x." }),
    P(16, { kick: "X...X...X...X...", snare: "....x..x.x..XxXX", tom: "..........x.x.x." }),
    P(16, { ch: "x.xxx.xxx.xxx.xx", rim: "x..x..x..x..x..x" })
  ] }
];

const STYLES: DrumStyleDef[] = [...stylesFrom(SRC, KIT_OF, "808"), ...NEW_STYLES];

export const KERMAN: MachineDef = {
  id: "kerman",
  name: "Kerman",
  role: "Electronic drum machine",
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
    { title: "GROOVE", page: "sound", wide: true, controls: [row([["drumSwing", "SWING"], ["drumAccent", "ACCENT"], ["drumGlue", "GLUE"], ["volume", "VOL"]])] },
    { title: "STEPS", page: "steps", custom: "drum-steps", span: 3, wide: true, controls: [] },
    SEC.driveEq("fx"),
    SEC.space("fx")
  ],
  // stereo stage + sends: kick dry and centred, hats and percussion spread a little
  base: { drumSwing: 0, drumAccent: 0.5, delayMix: 0, revMix: 0.1, revSize: 1.2, drive: 0.1, volume: 0.8, drumGlue: 0.4,
    chPan: 0.15, ohPan: 0.2, clapPan: -0.1, tomPan: -0.2, rimPan: 0.25, bellPan: -0.3, kickSend: 0.1, chSend: 0.4 },
  kits: KITS,
  styles: STYLES,
  presets: drumPresets(KITS, STYLES)
};
