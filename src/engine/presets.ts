/**
 * SY-1 Engine — Presets
 */

export const PRESET_NAMES: Record<string, string> = {
  init: "Init",
  warmPad: "Warm Pad",
  acidBass: "Acid Bass",
  lead: "Lead",
  pluck: "Pluck",
  brass: "Brass",
  spaceBells: "Space Bells"
};

export const SYNTH_PRESETS: Record<string, Record<string, any>> = {
  init: {},
  warmPad: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 12, oscMix: 0.5, sub: 0.25, cutoff: 1400, res: 1.2, envAmt: 0.25, fA: 0.8, fD: 1.5, fS: 0.5, aA: 0.9, aD: 1.2, aS: 0.85, aR: 2.2, lfoRate: 0.35, lfoDepth: 0.25, lfoTarget: "filter", revMix: 0.45, revSize: 4, eqHigh: -3 },
  acidBass: { osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, oscMix: 0.2, sub: 0.3, cutoff: 260, res: 14, envAmt: 0.85, fA: 0.002, fD: 0.22, fS: 0.05, aA: 0.002, aD: 0.25, aS: 0.6, aR: 0.12, drive: 0.55, revMix: 0.05, eqLow: 3 },
  lead: { osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 6, oscMix: 0.5, sub: 0, cutoff: 4200, res: 3, envAmt: 0.3, aA: 0.01, aS: 0.85, aR: 0.25, lfoRate: 5.5, lfoDepth: 0.18, lfoTarget: "pitch", delayMix: 0.3, delayTime: 0.36, delayFb: 0.4, revMix: 0.2 },
  pluck: { osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.3, sub: 0, cutoff: 900, res: 4, envAmt: 0.7, fA: 0.001, fD: 0.18, fS: 0, aA: 0.002, aD: 0.45, aS: 0, aR: 0.3, delayMix: 0.25, delayTime: 0.24, revMix: 0.25 },
  brass: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 5, oscMix: 0.5, sub: 0.15, cutoff: 700, res: 1.5, envAmt: 0.6, fA: 0.08, fD: 0.5, fS: 0.45, aA: 0.05, aD: 0.4, aS: 0.8, aR: 0.25, revMix: 0.22, eqMid: 2 },
  spaceBells: { osc1Wave: "sine", osc2Wave: "sine", osc2Oct: 2, osc2Detune: 3, oscMix: 0.4, sub: 0, cutoff: 9000, res: 1, envAmt: 0.1, aA: 0.002, aD: 1.8, aS: 0, aR: 2.5, lfoRate: 0.2, lfoDepth: 0.2, lfoTarget: "amp", delayMix: 0.35, delayTime: 0.48, delayFb: 0.5, revMix: 0.55, revSize: 5 }
};
