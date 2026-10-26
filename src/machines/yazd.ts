import { MachineDef, SEC } from "./types";

/** YAZD — pads and atmospheres: unison, chorus, slow motion, long tails, HOLD. */
export const YAZD: MachineDef = {
  id: "yazd",
  name: "Yazd",
  role: "Pads & atmospheres",
  skin: "yazd",
  kind: "synth",
  pages: [
    { id: "osc", label: "Osc" },
    { id: "filter", label: "Filter & amp" },
    { id: "motion", label: "Motion" },
    { id: "space", label: "Space" }
  ],
  sections: [
    SEC.osc1("osc"), SEC.osc2("osc"), SEC.filter("filter"), SEC.amp("filter", true),
    SEC.lfo("motion", "MOTION", true), SEC.chorus("motion"), SEC.delay("space"), SEC.reverbOut("space")
  ],
  base: {
    aA: 0.8, aD: 1.2, aS: 0.85, aR: 2, velSens: 0.3, sub: 0.15,
    unison: 3, uniDetune: 14, uniWidth: 0.75,
    cutoff: 1600, res: 1.2, envAmt: 0.2, fA: 0.8, fD: 1.5, fS: 0.5,
    lfoTarget: "filter", lfoRate: 0.3, lfoDepth: 0.15,
    chorusMix: 0.35, revMix: 0.4, revSize: 3.5, eqHigh: -2
  },
  presets: [
    { id: "dawnGlass", name: "Dawn Glass", group: "Bright", patch: { osc1Wave: "sawtooth", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.4, cutoff: 2200, chorusMix: 0.4, revMix: 0.5 } },
    { id: "sunrise", name: "Sunrise Super", group: "Bright", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Oct: 1, osc2Detune: 5, unison: 7, uniDetune: 25, uniWidth: 0.9, cutoff: 4500, envAmt: 0.1, chorusMix: 0.25 } },
    { id: "aurora", name: "Aurora", group: "Bright", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Oct: 1, osc2Detune: 7, unison: 7, uniDetune: 30, uniWidth: 0.9, cutoff: 3000, res: 1.5, lfoShape: "triangle", lfoRate: 0.12, lfoDepth: 0.25, chorusMix: 0.3, revMix: 0.5 } },
    { id: "bellPad", name: "Bell Pad", group: "Bright", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 2, oscMix: 0.4, aA: 0.02, aD: 1.5, aS: 0.5, aR: 2.5, cutoff: 6000, envAmt: 0.1 } },
    { id: "velvet", name: "Velvet Strings", group: "Warm", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 12, oscMix: 0.5, unison: 5, uniDetune: 22, cutoff: 2600, res: 0.8, aA: 0.5, aS: 0.9, chorusMix: 0.55 } },
    { id: "analogWarm", name: "Analog Warmth", group: "Warm", patch: { osc1Wave: "sawtooth", osc2Wave: "square", osc2Detune: 9, oscMix: 0.45, cutoff: 1100, res: 2.5, envAmt: 0.35, aA: 0.4, chorusMix: 0.5 } },
    { id: "hollowReed", name: "Hollow Reed Pad", group: "Warm", patch: { osc1Wave: "square", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.4, cutoff: 1400, res: 3 } },
    { id: "breathing", name: "Breathing Pad", group: "Warm", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: 1, oscMix: 0.35, cutoff: 1800, lfoTarget: "amp", lfoRate: 0.25, lfoDepth: 0.25 } },
    { id: "pearlFog", name: "Pearl Fog", group: "Dark", patch: { osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 1, osc2Detune: 6, noise: 0.12, cutoff: 1200, res: 1, aA: 1.5, aR: 3, revMix: 0.55, revSize: 5 } },
    { id: "darkMatter", name: "Dark Matter", group: "Dark", patch: { osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "square", cutoff: 600, res: 3, envAmt: 0.4, fA: 2, fD: 3, fS: 0.4, aA: 1.2, revMix: 0.5, eqLow: 2 } },
    { id: "longShadow", name: "Long Shadow", group: "Dark", patch: { osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "sawtooth", osc2Detune: 15, cutoff: 900, aA: 2.5, aR: 5, revMix: 0.7, revSize: 6 } },
    { id: "underwater", name: "Underwater", group: "Dark", patch: { osc1Wave: "sine", osc2Wave: "sawtooth", oscMix: 0.35, cutoff: 700, res: 5, lfoRate: 0.5, lfoDepth: 0.35, delayMix: 0.2 } },
    { id: "frozenLake", name: "Frozen Lake", group: "Motion", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 2, osc2Detune: 4, cutoff: 5000, aA: 2, aD: 2, aS: 0.8, aR: 4, delayMix: 0.25, delayTime: 0.6, delayFb: 0.55, revMix: 0.6, revSize: 6 } },
    { id: "choirAir", name: "Choir of Air", group: "Motion", patch: { osc1Wave: "square", osc2Wave: "sawtooth", osc2Oct: 1, filterType: "bandpass", cutoff: 900, res: 4, noise: 0.2, lfoDepth: 0.2, lfoRate: 0.2, revMix: 0.6 } },
    { id: "silkSweep", name: "Silk Sweep", group: "Motion", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 10, cutoff: 300, res: 6, envAmt: 0.9, fA: 3, fD: 3, fS: 0.6, aA: 0.6, aR: 2.5 } },
    { id: "slowTide", name: "Slow Tide", group: "Motion", patch: { osc1Wave: "sawtooth", osc2Wave: "triangle", osc2Oct: 1, cutoff: 1300, res: 3, lfoShape: "triangle", lfoRate: 0.08, lfoDepth: 0.45, chorusMix: 0.45, revMix: 0.55 } },
{ id: "haloChoir", name: "Halo Choir", group: "Bright", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 1, oscMix: 0.4, unison: 5, uniDetune: 18, cutoff: 2400, res: 1.5, aA: 1.5, aR: 3, chorusMix: 0.6, revMix: 0.6, revSize: 5 } },
    { id: "stainedGlass", name: "Stained Glass", group: "Bright", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: 1, osc2Detune: 6, oscMix: 0.45, cutoff: 3200, res: 2, envAmt: 0.25, aA: 0.5, aR: 2.5, chorusMix: 0.5, delayMix: 0.2, delayTime: 0.5, delayFb: 0.45 } },
    { id: "shimmerBloom", name: "Shimmer Bloom", group: "Bright", patch: { osc1Wave: "sawtooth", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.4, unison: 5, uniDetune: 20, cutoff: 2800, aA: 1.2, aR: 3.5, delayMix: 0.4, delayTime: 0.6, delayFb: 0.6, revMix: 0.6, revSize: 6 } },
    { id: "warmBlanket", name: "Warm Blanket", group: "Warm", patch: { osc1Wave: "sawtooth", osc2Wave: "triangle", osc2Detune: 7, oscMix: 0.5, sub: 0.3, cutoff: 1100, res: 0.8, aA: 1.2, aR: 2.5, eqHigh: -4 } },
    { id: "tapePad", name: "Lo-fi Tape Pad", group: "Warm", patch: { osc1Wave: "sawtooth", osc2Wave: "square", osc2Detune: 10, oscMix: 0.4, cutoff: 1300, res: 1, lfoTarget: "pitch", lfoRate: 0.5, lfoDepth: 0.06, drive: 0.15, eqHigh: -6, chorusMix: 0.3, revMix: 0.35 } },
    { id: "glacier", name: "Glacier", group: "Dark", patch: { osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, osc2Detune: 14, oscMix: 0.5, cutoff: 700, res: 2, lfoRate: 0.1, lfoDepth: 0.3, aA: 2, aR: 4, revMix: 0.6, revSize: 6 } },
    { id: "abyss", name: "Abyss", group: "Dark", patch: { osc1Wave: "sine", osc1Oct: -2, osc2Wave: "sawtooth", osc2Oct: -1, oscMix: 0.35, sub: 0.4, noise: 0.08, cutoff: 450, res: 3, lfoRate: 0.07, lfoDepth: 0.4, aA: 2.5, aR: 5, revMix: 0.65, revSize: 6 } },
    { id: "etherSwell", name: "Ether Swells", group: "Motion", patch: { osc1Wave: "triangle", osc2Wave: "sawtooth", osc2Detune: 12, oscMix: 0.5, cutoff: 1900, lfoTarget: "amp", lfoShape: "sine", lfoRate: 0.25, lfoDepth: 0.55, aA: 1, aR: 3, revMix: 0.5 } },
    { id: "pulseField", name: "Pulse Field", group: "Motion", patch: { osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 9, oscMix: 0.45, cutoff: 1500, res: 4, lfoTarget: "filter", lfoShape: "triangle", lfoRate: 2.2, lfoDepth: 0.35, aA: 0.6, aR: 2, delayMix: 0.3, delayTime: 0.45, delayFb: 0.5 } },
    { id: "cineRise", name: "Cinematic Rise", group: "Cinematic", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Oct: 1, osc2Detune: 10, unison: 5, uniDetune: 25, noise: 0.15, cutoff: 600, res: 3, envAmt: 0.7, fA: 3.5, fD: 4, fS: 0.8, aA: 3.5, aS: 1, aR: 3, revMix: 0.6, revSize: 6 } },
    { id: "nebula", name: "Nebula", group: "Cinematic", patch: { osc1Wave: "sawtooth", osc2Wave: "triangle", osc2Detune: 20, unison: 7, uniDetune: 40, uniWidth: 1, noise: 0.2, cutoff: 1400, res: 2, lfoRate: 0.12, lfoDepth: 0.4, aA: 2.5, aR: 4.5, delayMix: 0.3, delayTime: 0.8, delayFb: 0.6, revMix: 0.65, revSize: 6 } },
    { id: "seaStrings", name: "Sea of Strings", group: "Cinematic", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 12, unison: 7, uniDetune: 25, uniWidth: 1, cutoff: 2600, res: 0.8, envAmt: 0.1, aA: 0.9, aR: 2.5, chorusMix: 0.5, revMix: 0.5, revSize: 5 } }
  ]
};
