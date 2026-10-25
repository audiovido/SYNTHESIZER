import { MachineDef, SEC } from "./types";

/** TABRIZ — monophonic leads and basses: mono, legato glide, 24 dB filter. */
export const TABRIZ: MachineDef = {
  id: "tabriz",
  name: "Tabriz",
  role: "Mono leads & bass",
  skin: "tabriz",
  kind: "synth",
  pages: [
    { id: "osc", label: "Osc" },
    { id: "filter", label: "Filter & amp" },
    { id: "voice", label: "Voice" },
    { id: "fx", label: "Effects" }
  ],
  sections: [
    SEC.osc1("osc"), SEC.osc2("osc", false), SEC.filter("filter"), SEC.amp("filter"),
    SEC.voice("voice"), SEC.lfo("voice"), SEC.driveEq("fx"), SEC.space("fx")
  ],
  base: { polyMode: "mono", legato: "on", glide: 0.06, filterType: "lp24", unison: 1, velSens: 0.5, revMix: 0.12, sub: 0.2 },
  presets: [
    { id: "fatBass", name: "Fat Bass", group: "Bass", patch: { osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, osc2Detune: 6, oscMix: 0.45, sub: 0.45, cutoff: 450, res: 4, envAmt: 0.55, fA: 0.003, fD: 0.25, fS: 0.2, aA: 0.002, aD: 0.4, aS: 0.8, aR: 0.1, drive: 0.25, glide: 0.04, revMix: 0.04 } },
    { id: "acidLine", name: "Acid Line", group: "Bass", patch: { osc1Oct: -1, oscMix: 0, sub: 0.1, filterType: "lowpass", cutoff: 280, res: 15, envAmt: 0.85, fA: 0.002, fD: 0.18, fS: 0.05, aA: 0.002, aD: 0.3, aS: 0.7, aR: 0.08, drive: 0.6, glide: 0.08, revMix: 0.04 } },
    { id: "rubber", name: "Rubber Bass", group: "Bass", patch: { osc1Wave: "square", osc1Oct: -1, osc2Wave: "triangle", osc2Oct: -1, oscMix: 0.5, cutoff: 700, res: 6, envAmt: 0.4, fA: 0.003, fD: 0.2, fS: 0.2, aA: 0.002, aR: 0.1, glide: 0.1 } },
    { id: "subDrop", name: "Sub Drop", group: "Bass", patch: { osc1Wave: "sine", osc1Oct: -1, osc2Wave: "triangle", osc2Oct: -1, oscMix: 0.4, sub: 0.6, cutoff: 400, res: 1, envAmt: 0.1, glide: 0.25, aR: 0.25 } },
    { id: "pluckBass", name: "Pluck Bass", group: "Bass", patch: { osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, osc2Detune: 5, oscMix: 0.5, cutoff: 350, res: 7, envAmt: 0.7, fA: 0.002, fD: 0.12, fS: 0, aA: 0.002, aD: 0.5, aS: 0.6, aR: 0.1 } },
    { id: "growl", name: "Growl Bass", group: "Bass", patch: { osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, osc2Detune: 12, cutoff: 600, res: 9, lfoTarget: "filter", lfoRate: 6, lfoDepth: 0.2, drive: 0.5, aR: 0.1 } },
    { id: "reese", name: "Deep Reese", group: "Bass", patch: { osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, osc2Detune: 18, oscMix: 0.5, unison: 3, uniDetune: 20, uniWidth: 0.3, cutoff: 900, res: 2, envAmt: 0.2, drive: 0.2 } },
    { id: "octBass", name: "Octave Bass", group: "Bass", patch: { osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: 0, osc2Detune: 3, oscMix: 0.35, cutoff: 800, res: 5, envAmt: 0.5, fD: 0.3, fS: 0.2 } },
    { id: "classicLead", name: "Classic Lead", group: "Lead", patch: { osc2Wave: "sawtooth", osc2Detune: 7, oscMix: 0.5, cutoff: 2500, res: 5, envAmt: 0.4, fA: 0.01, fD: 0.4, fS: 0.5, glide: 0.07, lfoTarget: "pitch", lfoRate: 5.5, lfoDepth: 0.1, delayMix: 0.25, delayTime: 0.3, delayFb: 0.35, revMix: 0.2 } },
    { id: "sineLead", name: "Soft Sine Lead", group: "Lead", patch: { osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.25, sub: 0, cutoff: 4000, envAmt: 0.1, glide: 0.12, lfoTarget: "pitch", lfoRate: 5, lfoDepth: 0.15, delayMix: 0.3, revMix: 0.25 } },
    { id: "brassLead", name: "Brass Lead", group: "Lead", patch: { osc2Wave: "sawtooth", osc2Detune: 6, oscMix: 0.5, cutoff: 900, res: 3, envAmt: 0.65, fA: 0.06, fD: 0.5, fS: 0.45, aA: 0.03, glide: 0.05, revMix: 0.2 } },
    { id: "squareLead", name: "Square Lead", group: "Lead", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: 1, oscMix: 0.3, cutoff: 3000, res: 4, glide: 0.06, delayMix: 0.25 } },
    { id: "screamer", name: "Screamer", group: "Lead", patch: { osc2Wave: "square", osc2Detune: 10, cutoff: 1800, res: 12, envAmt: 0.5, drive: 0.6, glide: 0.05, delayMix: 0.2, revMix: 0.2 } },
    { id: "portamento", name: "Portamento Lead", group: "Lead", patch: { osc2Wave: "triangle", osc2Oct: 1, glide: 0.35, cutoff: 2800, res: 3, lfoTarget: "pitch", lfoRate: 5, lfoDepth: 0.1, delayMix: 0.2 } },
    { id: "flute", name: "Hollow Flute", group: "Lead", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 1, oscMix: 0.35, sub: 0, noise: 0.08, cutoff: 3500, res: 1, envAmt: 0.1, aA: 0.06, aR: 0.25, lfoTarget: "pitch", lfoRate: 5, lfoDepth: 0.12, revMix: 0.3 } },
    { id: "retrigger", name: "Retrigger Lead", group: "Lead", patch: { legato: "off", osc2Wave: "square", cutoff: 2000, res: 6, envAmt: 0.5, fD: 0.2, fS: 0.2, glide: 0.03 } }
  ]
};
