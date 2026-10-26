import { MachineDef, SEC } from "./types";

/** MERV — wobble and bass music: tempo-synced LFO with shapes, drive, mono. */
export const MERV: MachineDef = {
  id: "merv",
  name: "Merv",
  role: "Wobble & bass",
  skin: "merv",
  kind: "synth",
  tempo: true,
  pages: [
    { id: "osc", label: "Osc" },
    { id: "filter", label: "Filter & amp" },
    { id: "wobble", label: "Wobble" },
    { id: "fx", label: "Effects" }
  ],
  sections: [
    SEC.osc1("osc"), SEC.osc2("osc"), SEC.filter("filter"), SEC.amp("filter"),
    SEC.lfo("wobble", "WOBBLE", true, true), SEC.voice("wobble"), SEC.driveEq("fx"), SEC.space("fx")
  ],
  base: {
    polyMode: "mono", legato: "on", glide: 0.03, osc1Oct: -1, osc2Oct: -1, filterType: "lp24",
    lfoTarget: "filter", lfoShape: "sine", lfoSync: 4, lfoDepth: 0.6,
    cutoff: 400, res: 8, envAmt: 0.3, fA: 0.003, fD: 0.3, fS: 0.3, aA: 0.003, aS: 0.9, aR: 0.08,
    drive: 0.5, eqLow: 3, revMix: 0.08, sub: 0.3
  },
  presets: [
    { id: "wob8", name: "Wobble 1/8", group: "Wobble", patch: { osc2Wave: "square", osc2Detune: 10 } },
    { id: "wob4", name: "Wobble 1/4 Slow", group: "Wobble", patch: { osc2Wave: "sawtooth", osc2Detune: 8, lfoSync: 3, lfoDepth: 0.7 } },
    { id: "triplet", name: "Triplet Wub", group: "Wobble", patch: { osc2Wave: "sawtooth", osc2Detune: 15, unison: 3, uniDetune: 20, uniWidth: 0.2, lfoSync: 5 } },
    { id: "yoi", name: "Yoi", group: "Wobble", patch: { osc2Wave: "sawtooth", lfoShape: "triangle", lfoSync: 5, lfoDepth: 0.5, res: 14, cutoff: 350 } },
    { id: "subWob", name: "Sub Wobble", group: "Wobble", patch: { osc1Wave: "sine", osc2Wave: "triangle", sub: 0.5, cutoff: 250, res: 4, lfoDepth: 0.8, drive: 0.2 } },
    { id: "freeWob", name: "Free Wobble", group: "Wobble", patch: { osc2Wave: "square", lfoSync: 0, lfoRate: 3.2 } },
    { id: "stutter", name: "Stutter 1/16", group: "Growl", patch: { osc2Wave: "square", lfoShape: "square", lfoSync: 6, lfoDepth: 0.65 } },
    { id: "robot", name: "S&H Robot", group: "Growl", patch: { osc2Wave: "square", lfoShape: "sh", lfoSync: 6, lfoDepth: 0.5, res: 12 } },
    { id: "sawGrowl", name: "Saw-Down Growl", group: "Growl", patch: { osc2Wave: "sawtooth", lfoShape: "sawtooth", lfoSync: 4, lfoDepth: 0.7, res: 10 } },
    { id: "tearout", name: "Tear-Out", group: "Growl", patch: { osc2Wave: "square", drive: 0.9, res: 13, lfoSync: 6, lfoDepth: 0.55, eqMid: 3 } },
    { id: "neuro", name: "Neuro", group: "Growl", patch: { osc1Wave: "square", osc2Wave: "sawtooth", filterType: "bandpass", res: 8, cutoff: 600, lfoShape: "triangle", lfoSync: 6, lfoDepth: 0.6, drive: 0.6 } },
    { id: "reeseWob", name: "Reese Wobble", group: "Growl", patch: { osc2Wave: "sawtooth", osc2Detune: 22, unison: 5, uniDetune: 25, uniWidth: 0.3, lfoSync: 3, lfoDepth: 0.4, cutoff: 700 } },
    { id: "gate", name: "Amp Gate", group: "Rhythm", patch: { osc2Wave: "sawtooth", lfoTarget: "amp", lfoShape: "square", lfoSync: 6, lfoDepth: 1, cutoff: 1200, res: 4 } },
    { id: "siren", name: "Siren Bass", group: "Rhythm", patch: { osc2Wave: "square", lfoTarget: "pitch", lfoShape: "triangle", lfoSync: 3, lfoDepth: 1, cutoff: 900 } },
{ id: "riddim", name: "Riddim", group: "Wobble", patch: { osc1Wave: "square", osc2Wave: "square", osc2Detune: 10, lfoShape: "square", lfoSync: 5, lfoDepth: 0.7, cutoff: 350, res: 10, drive: 0.6 } },
    { id: "dubWub", name: "Dub Wub 1/2", group: "Wobble", patch: { osc1Wave: "sawtooth", osc2Wave: "sine", lfoShape: "sine", lfoSync: 2, lfoDepth: 0.65, cutoff: 300, res: 6, drive: 0.3, sub: 0.5 } },
    { id: "wobbleLead", name: "Wobble Lead", group: "Wobble", patch: { osc1Oct: 0, osc2Oct: 0, osc2Detune: 12, lfoShape: "triangle", lfoSync: 6, lfoDepth: 0.5, cutoff: 900, res: 7, drive: 0.35, delayMix: 0.2, revMix: 0.15 } },
    { id: "robotTalk", name: "Robot Talk", group: "Growl", patch: { filterType: "bandpass", lfoShape: "sh", lfoSync: 6, lfoDepth: 0.75, cutoff: 900, res: 12, drive: 0.55 } },
    { id: "talkingSaw", name: "Talking Saw", group: "Growl", patch: { osc2Wave: "sawtooth", osc2Detune: 18, filterType: "bandpass", lfoShape: "triangle", lfoSync: 4, lfoDepth: 0.6, cutoff: 700, res: 9, drive: 0.65 } },
    { id: "growlSquare", name: "Square Growl", group: "Growl", patch: { osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 7, lfoShape: "sawtooth", lfoSync: 6, lfoDepth: 0.55, cutoff: 500, res: 11, drive: 0.75 } },
    { id: "grimeHalf", name: "Halftime Grime", group: "Rhythm", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: -1, lfoTarget: "amp", lfoShape: "square", lfoSync: 4, lfoDepth: 0.8, cutoff: 1200, res: 3, drive: 0.4 } },
    { id: "laserZap", name: "Laser Zap Bass", group: "Rhythm", patch: { osc1Wave: "sawtooth", osc2Wave: "square", lfoTarget: "pitch", lfoShape: "sawtooth", lfoSync: 6, lfoDepth: 0.3, cutoff: 1500, res: 5, drive: 0.4, glide: 0.08 } },
    { id: "wubChords", name: "Wub Chords", group: "Rhythm", patch: { polyMode: "poly", osc1Oct: 0, osc2Oct: 0, osc2Detune: 14, unison: 3, uniDetune: 18, lfoShape: "sine", lfoSync: 4, lfoDepth: 0.55, cutoff: 700, res: 5, drive: 0.3, sub: 0.1, revMix: 0.2 } }
  ]
};
