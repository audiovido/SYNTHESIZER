import { MachineDef, SEC } from "./types";

/** SY-1 — the flagship all-rounder (the original panel). */
export const SY1: MachineDef = {
  id: "sy1",
  name: "SY-1",
  role: "All-rounder",
  skin: "sy1",
  kind: "synth",
  pages: [
    { id: "osc", label: "Osc" },
    { id: "filter", label: "Filter" },
    { id: "amp", label: "Amp & LFO" },
    { id: "fx", label: "Effects" }
  ],
  sections: [
    SEC.osc1("osc"), SEC.osc2("osc"), SEC.filter("filter"), SEC.amp("amp"),
    SEC.lfo("amp"), SEC.driveEq("fx"), SEC.delay("fx"), SEC.reverbOut("fx")
  ],
  base: {},
  presets: [
    { id: "init", name: "Init", group: "Basics", patch: {} },
    { id: "warmPad", name: "Warm Pad", group: "Pads", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 12, unison: 3, uniDetune: 14, uniWidth: 0.7, oscMix: 0.5, sub: 0.25, cutoff: 1400, res: 1.2, envAmt: 0.25, fA: 0.8, fD: 1.5, fS: 0.5, aA: 0.9, aD: 1.2, aS: 0.85, aR: 2.2, lfoRate: 0.35, lfoDepth: 0.25, lfoTarget: "filter", revMix: 0.45, revSize: 4, eqHigh: -3 } },
    { id: "hollowPad", name: "Hollow Pad", group: "Pads", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: 1, osc2Detune: 10, unison: 3, uniDetune: 12, cutoff: 1800, res: 3, envAmt: 0.2, fA: 0.5, fD: 1.5, fS: 0.6, aA: 0.6, aD: 1, aS: 0.8, aR: 1.8, lfoTarget: "filter", lfoRate: 0.3, lfoDepth: 0.15, chorusMix: 0.35, revMix: 0.4, revSize: 3.5 } },
    { id: "strings", name: "String Machine", group: "Pads", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 14, oscMix: 0.5, unison: 5, uniDetune: 20, uniWidth: 0.8, cutoff: 3200, res: 0.8, envAmt: 0.1, aA: 0.35, aD: 0.8, aS: 0.85, aR: 1.2, chorusMix: 0.5, chorusRate: 0.5, chorusDepth: 0.7, eqHigh: -2, revMix: 0.35 } },
    { id: "acidBass", name: "Acid Bass", group: "Bass", patch: { osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, oscMix: 0.2, sub: 0.3, cutoff: 260, res: 14, envAmt: 0.85, fA: 0.002, fD: 0.22, fS: 0.05, aA: 0.002, aD: 0.25, aS: 0.6, aR: 0.12, drive: 0.55, revMix: 0.05, eqLow: 3 } },
    { id: "funkBass", name: "Funk Bass", group: "Bass", patch: { osc1Wave: "square", osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, oscMix: 0.3, sub: 0.4, cutoff: 500, res: 8, envAmt: 0.7, fA: 0.002, fD: 0.15, fS: 0.1, aA: 0.002, aD: 0.3, aS: 0.5, aR: 0.1, drive: 0.3, revMix: 0.05 } },
    { id: "lead", name: "Lead", group: "Leads", patch: { osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 6, oscMix: 0.5, sub: 0, cutoff: 4200, res: 3, envAmt: 0.3, aA: 0.01, aS: 0.85, aR: 0.25, lfoRate: 5.5, lfoDepth: 0.18, lfoTarget: "pitch", delayMix: 0.3, delayTime: 0.36, delayFb: 0.4, revMix: 0.2 } },
    { id: "bigLead", name: "Big Lead 24", group: "Leads", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 9, oscMix: 0.5, unison: 5, uniDetune: 22, uniWidth: 0.6, filterType: "lp24", cutoff: 3000, res: 6, envAmt: 0.4, aA: 0.01, aS: 0.9, aR: 0.3, delayMix: 0.3, delayTime: 0.36, revMix: 0.25 } },
    { id: "chip", name: "Chip Square", group: "Leads", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: 1, osc2Detune: 0, oscMix: 0.25, sub: 0, cutoff: 12000, envAmt: 0, res: 0.5, aA: 0.001, aD: 0.2, aS: 0.6, aR: 0.05, lfoTarget: "pitch", lfoRate: 7, lfoDepth: 0.1, revMix: 0.1 } },
    { id: "superSaw", name: "Super Saw", group: "Leads", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Oct: 1, osc2Detune: 4, oscMix: 0.35, sub: 0.2, unison: 7, uniDetune: 38, uniWidth: 0.85, cutoff: 5200, res: 1, envAmt: 0.25, fA: 0.02, fD: 0.6, fS: 0.6, aA: 0.015, aD: 0.4, aS: 0.9, aR: 0.6, delayMix: 0.18, delayTime: 0.36, revMix: 0.3, revSize: 3 } },
    { id: "pluck", name: "Pluck", group: "Keys & plucks", patch: { osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.3, sub: 0, cutoff: 900, res: 4, envAmt: 0.7, fA: 0.001, fD: 0.18, fS: 0, aA: 0.002, aD: 0.45, aS: 0, aR: 0.3, delayMix: 0.25, delayTime: 0.24, revMix: 0.25 } },
    { id: "softKeys", name: "Soft Keys", group: "Keys & plucks", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 1, oscMix: 0.3, sub: 0.1, cutoff: 2600, res: 1, envAmt: 0.35, fA: 0.002, fD: 0.4, fS: 0.2, aA: 0.003, aD: 0.9, aS: 0.35, aR: 0.5, chorusMix: 0.3, revMix: 0.25 } },
    { id: "brass", name: "Brass", group: "Keys & plucks", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 5, oscMix: 0.5, sub: 0.15, cutoff: 700, res: 1.5, envAmt: 0.6, fA: 0.08, fD: 0.5, fS: 0.45, aA: 0.05, aD: 0.4, aS: 0.8, aR: 0.25, revMix: 0.22, eqMid: 2 } },
    { id: "spaceBells", name: "Space Bells", group: "Bells & FX", patch: { osc1Wave: "sine", osc2Wave: "sine", osc2Oct: 2, osc2Detune: 3, oscMix: 0.4, sub: 0, cutoff: 9000, res: 1, envAmt: 0.1, aA: 0.002, aD: 1.8, aS: 0, aR: 2.5, lfoRate: 0.2, lfoDepth: 0.2, lfoTarget: "amp", delayMix: 0.35, delayTime: 0.48, delayFb: 0.5, revMix: 0.55, revSize: 5 } },
    { id: "glassBell", name: "Glass Bell", group: "Bells & FX", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 2, osc2Detune: 7, oscMix: 0.45, sub: 0, cutoff: 8000, envAmt: 0.1, aA: 0.002, aD: 2.5, aS: 0, aR: 2, delayMix: 0.25, delayTime: 0.38, delayFb: 0.45, revMix: 0.4 } },
    { id: "noiseSweep", name: "Noise Sweep", group: "Bells & FX", patch: { oscMix: 0, noise: 0.9, sub: 0, filterType: "bandpass", res: 10, cutoff: 400, envAmt: 1, fA: 1.5, fD: 3, fS: 0.3, aA: 0.5, aD: 2, aS: 0.6, aR: 2.5, revMix: 0.5, revSize: 4 } },
{ id: "dreamPad", name: "Dream Pad", group: "Pads", patch: { osc1Wave: "triangle", osc2Wave: "sawtooth", osc2Detune: 9, oscMix: 0.45, unison: 5, uniDetune: 24, uniWidth: 0.85, sub: 0.15, cutoff: 1200, res: 1.5, envAmt: 0.3, fA: 1.5, fD: 2, fS: 0.5, aA: 1.4, aD: 1.5, aS: 0.85, aR: 3, lfoTarget: "filter", lfoRate: 0.2, lfoDepth: 0.3, chorusMix: 0.4, revMix: 0.55, revSize: 5, eqHigh: -2 } },
    { id: "lushStrings", name: "Lush Strings", group: "Pads", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 10, oscMix: 0.5, unison: 3, uniDetune: 16, uniWidth: 0.9, sub: 0, cutoff: 2800, res: 0.8, envAmt: 0.15, aA: 0.45, aD: 1, aS: 0.9, aR: 1.6, chorusMix: 0.6, chorusRate: 0.45, chorusDepth: 0.75, revMix: 0.4, revSize: 3.5, eqHigh: -3 } },
    { id: "moogBass", name: "Ladder Bass", group: "Bass", patch: { polyMode: "mono", legato: "on", glide: 0.03, osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, osc2Detune: 4, oscMix: 0.4, sub: 0.5, filterType: "lp24", cutoff: 380, res: 3, envAmt: 0.6, fA: 0.002, fD: 0.3, fS: 0.15, aA: 0.002, aD: 0.4, aS: 0.9, aR: 0.08, drive: 0.2, revMix: 0.04 } },
    { id: "reeseBass", name: "Reese Bass", group: "Bass", patch: { polyMode: "mono", legato: "on", osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, osc2Detune: 22, oscMix: 0.5, sub: 0.3, filterType: "lp24", cutoff: 650, res: 2, envAmt: 0.2, aA: 0.004, aS: 1, aR: 0.15, drive: 0.35, chorusMix: 0, revMix: 0.05 } },
    { id: "subBass", name: "Pure Sub", group: "Bass", patch: { polyMode: "mono", legato: "on", glide: 0.02, osc1Wave: "sine", osc1Oct: -1, osc2Wave: "triangle", osc2Oct: -1, oscMix: 0.25, sub: 0.6, cutoff: 300, res: 1, envAmt: 0.05, aA: 0.003, aS: 1, aR: 0.12, revMix: 0 } },
    { id: "sawLead", name: "Saw Lead", group: "Leads", patch: { polyMode: "mono", legato: "on", glide: 0.05, osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 7, oscMix: 0.5, sub: 0.15, cutoff: 3500, res: 4, envAmt: 0.3, fD: 0.4, fS: 0.5, aA: 0.003, aS: 0.9, aR: 0.2, lfoTarget: "pitch", lfoRate: 5.5, lfoDepth: 0.04, delayMix: 0.25, delayTime: 0.375, delayFb: 0.35, revMix: 0.2 } },
    { id: "whistle", name: "Whistle Lead", group: "Leads", patch: { polyMode: "mono", legato: "on", glide: 0.08, osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.2, sub: 0, noise: 0.05, cutoff: 5000, res: 1, envAmt: 0.1, aA: 0.04, aS: 1, aR: 0.25, lfoTarget: "pitch", lfoRate: 5.8, lfoDepth: 0.08, revMix: 0.35 } },
    { id: "polyBrass", name: "Poly Brass Stab", group: "Keys & plucks", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 8, oscMix: 0.5, unison: 2, uniDetune: 10, cutoff: 900, res: 1.5, envAmt: 0.7, fA: 0.02, fD: 0.35, fS: 0.3, aA: 0.01, aD: 0.4, aS: 0.6, aR: 0.2, chorusMix: 0.3, revMix: 0.25 } },
    { id: "ePiano", name: "Analog E-Piano", group: "Keys & plucks", patch: { osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.18, sub: 0, cutoff: 2400, res: 1, envAmt: 0.3, fA: 0.002, fD: 0.8, fS: 0.2, aA: 0.002, aD: 1.5, aS: 0.3, aR: 0.4, velSens: 0.8, chorusMix: 0.35, revMix: 0.22 } },
    { id: "organLite", name: "Organ", group: "Keys & plucks", patch: { osc1Wave: "square", osc2Wave: "sine", osc2Oct: 1, oscMix: 0.5, sub: 0.3, cutoff: 4200, res: 0.7, envAmt: 0, aA: 0.005, aD: 0.1, aS: 1, aR: 0.08, velSens: 0, chorusMix: 0.5, chorusRate: 5.5, chorusDepth: 0.35, revMix: 0.2 } },
    { id: "houseStab", name: "House Chord Stab", group: "Keys & plucks", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Oct: 1, osc2Detune: 12, oscMix: 0.45, cutoff: 1400, res: 5, envAmt: 0.6, fA: 0.002, fD: 0.2, fS: 0, aA: 0.002, aD: 0.3, aS: 0, aR: 0.2, delayMix: 0.2, delayTime: 0.375, delayFb: 0.3, revMix: 0.3 } },
    { id: "kalimbaPluck", name: "Kalimba Pluck", group: "Keys & plucks", patch: { osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 2, oscMix: 0.3, sub: 0, cutoff: 3000, res: 1, envAmt: 0.4, fA: 0.001, fD: 0.1, fS: 0, aA: 0.001, aD: 0.5, aS: 0, aR: 0.3, revMix: 0.3 } },
    { id: "sweepFx", name: "Filter Sweep FX", group: "Bells & FX", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 15, noise: 0.4, unison: 3, uniDetune: 20, cutoff: 300, res: 10, envAmt: 0.1, aA: 0.3, aS: 1, aR: 2, lfoTarget: "filter", lfoRate: 0.15, lfoDepth: 0.9, revMix: 0.5, revSize: 4.5, delayMix: 0.2 } },
    { id: "tranceLead", name: "Trance Lead", group: "Leads", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 14, unison: 5, uniDetune: 30, uniWidth: 0.9, oscMix: 0.5, cutoff: 4200, res: 2, envAmt: 0.2, aA: 0.003, aD: 0.5, aS: 0.8, aR: 0.35, delayMix: 0.35, delayTime: 0.375, delayFb: 0.45, revMix: 0.35, revSize: 3.5 } }
  ]
};
