import { MachineDef, SEC } from "./types";

/** BAM — drones and textures: HOLD, noise, sample-and-hold, slow motion. */
export const BAM: MachineDef = {
  id: "bam",
  name: "Bam",
  role: "Drones & textures",
  skin: "bam",
  kind: "synth",
  pages: [
    { id: "osc", label: "Osc" },
    { id: "filter", label: "Filter & amp" },
    { id: "motion", label: "Motion" },
    { id: "space", label: "Space" }
  ],
  sections: [
    SEC.osc1("osc"), SEC.osc2("osc"), SEC.filter("filter"), SEC.amp("filter", true),
    SEC.lfo("motion", "MOTION", true), SEC.driveEq("motion"), SEC.delay("space"), SEC.reverbOut("space")
  ],
  base: {
    hold: "off", aA: 2, aD: 1, aS: 1, aR: 4, velSens: 0.2, noise: 0.25,
    osc1Oct: -1, osc2Oct: -1, unison: 3, uniDetune: 30, uniWidth: 0.9,
    filterType: "bandpass", cutoff: 800, res: 6, envAmt: 0.1,
    lfoTarget: "filter", lfoShape: "sh", lfoRate: 2, lfoDepth: 0.35,
    drive: 0.3, delayMix: 0.3, delayTime: 0.6, delayFb: 0.6, revMix: 0.55, revSize: 5, volume: 0.85
  },
  presets: [
    { id: "citadel", name: "Citadel", group: "Drones", patch: { osc2Wave: "sawtooth", osc2Detune: 20, filterType: "lowpass", cutoff: 500, res: 3, lfoShape: "sine", lfoRate: 0.1, lfoDepth: 0.3 } },
    { id: "bunker", name: "Bunker Hum", group: "Drones", patch: { osc1Wave: "sine", osc1Oct: -2, osc2Wave: "triangle", filterType: "lowpass", cutoff: 300, res: 2, noise: 0.1, lfoTarget: "amp", lfoShape: "sine", lfoRate: 0.2, lfoDepth: 0.3 } },
    { id: "ironLung", name: "Iron Lung", group: "Drones", patch: { osc2Wave: "square", osc2Detune: 35, filterType: "lp24", cutoff: 700, res: 8, lfoShape: "triangle", lfoRate: 0.25, lfoDepth: 0.5 } },
    { id: "desertNight", name: "Desert Night", group: "Drones", patch: { osc1Wave: "triangle", osc2Wave: "triangle", osc2Oct: 0, osc2Detune: 7, filterType: "lowpass", cutoff: 1200, res: 1, noise: 0.1, lfoTarget: "pitch", lfoShape: "sine", lfoRate: 0.1, lfoDepth: 0.15, revMix: 0.7, revSize: 6 } },
    { id: "tectonic", name: "Tectonic", group: "Drones", patch: { osc1Oct: -2, osc2Wave: "sawtooth", osc2Detune: 8, filterType: "lowpass", cutoff: 250, res: 5, drive: 0.6, eqLow: 4, lfoShape: "sine", lfoRate: 0.05, lfoDepth: 0.3, noise: 0.05 } },
    { id: "dust", name: "Dust Storm", group: "Textures", patch: { oscMix: 0.5, noise: 1, cutoff: 900, res: 1.2, lfoRate: 3, lfoDepth: 0.5, drive: 0.4 } },
    { id: "coldWind", name: "Cold Wind", group: "Textures", patch: { osc1Wave: "sine", noise: 0.8, filterType: "highpass", cutoff: 2000, res: 4, lfoShape: "sine", lfoRate: 0.15, lfoDepth: 0.5 } },
    { id: "machineRoom", name: "Machine Room", group: "Textures", patch: { osc1Wave: "square", osc2Wave: "square", osc2Oct: 0, osc2Detune: 3, filterType: "lp24", cutoff: 400, res: 10, lfoShape: "square", lfoRate: 4, lfoDepth: 0.3, drive: 0.5 } },
    { id: "radioGhost", name: "Radio Ghost", group: "Signals", patch: { osc1Wave: "square", osc1Oct: 0, osc2Wave: "square", osc2Oct: 0, cutoff: 1100, res: 1.2, lfoRate: 6, lfoDepth: 0.45, noise: 0.6 } },
    { id: "signalLost", name: "Signal Lost", group: "Signals", patch: { osc1Wave: "square", osc1Oct: 0, osc2Wave: "sawtooth", osc2Oct: 0, cutoff: 1500, res: 1.3, lfoRate: 9, lfoDepth: 0.6, drive: 0.6 } },
    { id: "sonar", name: "Sonar", group: "Signals", patch: { osc1Wave: "sine", osc1Oct: 0, osc2Wave: "sine", osc2Oct: 2, unison: 1, noise: 0, filterType: "lowpass", cutoff: 4000, res: 1, lfoTarget: "amp", lfoShape: "sine", lfoRate: 1, lfoDepth: 0.5, delayMix: 0.5, delayTime: 0.9, delayFb: 0.65 } },
    { id: "morse", name: "Morse", group: "Signals", patch: { osc1Wave: "square", osc1Oct: 0, osc2Wave: "square", osc2Oct: 1, unison: 1, noise: 0.1, cutoff: 1400, res: 1.5, lfoTarget: "amp", lfoShape: "square", lfoRate: 7, lfoDepth: 1 } },
{ id: "monastery", name: "Monastery", group: "Drones", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Oct: 0, osc2Detune: 7, filterType: "lowpass", cutoff: 650, res: 2, noise: 0.06, lfoShape: "sine", lfoRate: 0.08, lfoDepth: 0.25, revMix: 0.7, revSize: 6 } },
    { id: "nightVigil", name: "Night Vigil", group: "Drones", patch: { osc1Wave: "triangle", osc1Oct: -2, osc2Wave: "sine", osc2Oct: 0, filterType: "lowpass", cutoff: 900, res: 1, noise: 0.12, lfoTarget: "amp", lfoShape: "sine", lfoRate: 0.12, lfoDepth: 0.35, revMix: 0.6 } },
    { id: "oilRig", name: "Oil Rig", group: "Textures", patch: { osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 40, filterType: "bandpass", cutoff: 300, res: 9, noise: 0.4, lfoShape: "sh", lfoRate: 0.6, lfoDepth: 0.5, drive: 0.6, eqLow: 4 } },
    { id: "rainMetal", name: "Rain on Metal", group: "Textures", patch: { osc1Wave: "sine", osc2Wave: "square", osc2Oct: 2, oscMix: 0.2, noise: 0.9, filterType: "highpass", cutoff: 3500, res: 6, lfoShape: "sh", lfoRate: 14, lfoDepth: 0.5, revMix: 0.5 } },
    { id: "geiger", name: "Geiger", group: "Signals", patch: { osc1Wave: "square", osc1Oct: 0, osc2Wave: "square", osc2Oct: 2, unison: 1, noise: 0.5, filterType: "highpass", cutoff: 2500, res: 3, lfoTarget: "amp", lfoShape: "sh", lfoRate: 12, lfoDepth: 1, drive: 0.4 } },
    { id: "numbers", name: "Numbers Station", group: "Signals", patch: { osc1Wave: "sine", osc1Oct: 0, osc2Wave: "triangle", osc2Oct: 1, unison: 1, noise: 0.45, filterType: "bandpass", cutoff: 1300, res: 4, lfoTarget: "pitch", lfoShape: "square", lfoRate: 0.5, lfoDepth: 0.2, drive: 0.35, delayMix: 0.35, delayTime: 0.7 } },
    { id: "deepSpace", name: "Deep Space", group: "Drones", patch: { osc1Wave: "sine", osc1Oct: -2, osc2Wave: "sawtooth", osc2Oct: 1, osc2Detune: 25, filterType: "lowpass", cutoff: 1500, res: 4, noise: 0.05, lfoShape: "triangle", lfoRate: 0.04, lfoDepth: 0.6, delayMix: 0.45, delayTime: 1, delayFb: 0.7, revMix: 0.75, revSize: 6 } },
    { id: "sandstorm2", name: "Haboob", group: "Textures", patch: { oscMix: 0.3, noise: 1, filterType: "bandpass", cutoff: 600, res: 3, lfoShape: "sine", lfoRate: 0.2, lfoDepth: 0.7, drive: 0.3, revMix: 0.45 } }
  ]
};
