import { MachineDef, row, SEC, select, toggles, TUNING_OPTS } from "./types";

/**
 * ISFAHAN — Persian and maqam lead: dastgah tunings (koron = -50 cents) and
 * ornaments that make a keyboard sing: scoop, delayed vibrato and tahrir
 * (a quick vocal flip, played by striking a key hard).
 */
export const ISFAHAN: MachineDef = {
  id: "isfahan",
  name: "Isfahan",
  role: "Persian lead",
  skin: "isfahan",
  kind: "synth",
  pages: [
    { id: "tuning", label: "Tuning" },
    { id: "tone", label: "Tone" },
    { id: "filter", label: "Filter & amp" },
    { id: "space", label: "Space" }
  ],
  sections: [
    {
      title: "DASTGAH", page: "tuning",
      controls: [
        select("tuning", "Tuning", TUNING_OPTS),
        toggles([
          { key: "polyMode", label: "MONO", on: "mono", off: "poly", title: "One note at a time" },
          { key: "legato", label: "LEGATO", title: "Glide between held notes" }
        ]),
        row([["tuneRoot", "TONIC"], ["glide", "GLIDE"], ["bendRange", "BEND"]])
      ]
    },
    {
      title: "ORNAMENT", page: "tuning",
      controls: [
        row([["scoop", "SCOOP"], ["scoopTime", "TIME"]]),
        row([["tahrir", "TAHRIR"], ["tahrirSpeed", "SPEED"]])
      ]
    },
    SEC.osc1("tone"), SEC.osc2("tone", false),
    SEC.filter("filter"), SEC.amp("filter"),
    { title: "VIBRATO", page: "space", controls: [row([["vibDelay", "DELAY"], ["vibDepth", "DEPTH"], ["vibRate", "RATE"]])] },
    SEC.space("space")
  ],
  base: {
    tuning: "shur", tuneRoot: 7, polyMode: "mono", legato: "on", glide: 0.08,
    scoop: 0.3, scoopTime: 0.08, vibDelay: 0.35, vibDepth: 0.35, vibRate: 5.5, tahrir: 0.5, tahrirSpeed: 12,
    velSens: 0.5, noise: 0.1, sub: 0, unison: 1, cutoff: 2600, res: 2, envAmt: 0.25,
    aA: 0.06, aD: 0.4, aS: 0.8, aR: 0.4,
    revMix: 0.35, revSize: 3, delayMix: 0.15, delayTime: 0.42, delayFb: 0.35
  },
  presets: [
    { id: "neyShur", name: "Ney · Shur", group: "Ney & flute", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 1, oscMix: 0.25, noise: 0.22, cutoff: 2200, res: 1, aA: 0.09, scoop: 0.35, tahrir: 0.45, vibDepth: 0.4 } },
    { id: "nightNey", name: "Night Ney · Homayoun", group: "Ney & flute", patch: { tuning: "homayoun", osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 1, oscMix: 0.25, noise: 0.3, cutoff: 1600, aA: 0.15, revMix: 0.55, delayMix: 0.3, delayTime: 0.5, delayFb: 0.45, vibDepth: 0.45, vibDelay: 0.5 } },
    { id: "fluteSegah", name: "Soft Flute · Segah", group: "Ney & flute", patch: { tuning: "segah", tuneRoot: 4, osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.3, noise: 0.15, cutoff: 3000, vibDepth: 0.3, tahrir: 0.2 } },
    { id: "avaz", name: "Avaz Lead · Homayoun", group: "Voice & reed", patch: { tuning: "homayoun", osc1Wave: "sawtooth", osc2Wave: "square", osc2Detune: 4, oscMix: 0.35, cutoff: 1700, res: 3, vibDepth: 0.45, vibDelay: 0.3, tahrir: 0.7, scoop: 0.4 } },
    { id: "sorna", name: "Sorna Reed · Chahargah", group: "Voice & reed", patch: { tuning: "chahargah", tuneRoot: 0, osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 3, oscMix: 0.4, filterType: "bandpass", cutoff: 1400, res: 5, drive: 0.3, vibDepth: 0.3, vibRate: 6.5, tahrir: 0.6 } },
    { id: "bayatiReed", name: "Bayati Reed", group: "Voice & reed", patch: { tuning: "bayati", tuneRoot: 2, osc1Wave: "square", osc2Wave: "sawtooth", filterType: "lp24", cutoff: 1500, res: 6, vibDepth: 0.4, tahrir: 0.4 } },
    { id: "hijazLead", name: "Hijaz Lead", group: "Voice & reed", patch: { tuning: "hijaz", tuneRoot: 2, osc1Wave: "sawtooth", osc2Wave: "square", osc2Detune: 7, cutoff: 2400, res: 5, vibDepth: 0.35, tahrir: 0.5, delayMix: 0.25 } },
    { id: "kamancheh", name: "Kamancheh · Shur", group: "Bowed", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 6, oscMix: 0.45, cutoff: 2600, res: 4, aA: 0.12, vibDepth: 0.5, vibRate: 6, scoop: 0.25, tahrir: 0.3 } },
    { id: "kamanchehLow", name: "Kamancheh Low · Segah", group: "Bowed", patch: { tuning: "segah", tuneRoot: 4, osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, osc2Detune: 5, cutoff: 1500, res: 3, aA: 0.15, vibDepth: 0.5, vibRate: 5.8 } },
    { id: "rastBrass", name: "Rast Brass", group: "Bowed", patch: { tuning: "rast", tuneRoot: 0, osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 6, cutoff: 900, envAmt: 0.6, fA: 0.06, fD: 0.4, fS: 0.45, aA: 0.04, vibDepth: 0.3, tahrir: 0.2, scoop: 0.2 } },
    { id: "santurPluck", name: "Santur Pluck · Shur", group: "Plucked", patch: { polyMode: "poly", legato: "off", glide: 0, osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.3, noise: 0, aA: 0.002, aD: 0.9, aS: 0, aR: 1.2, cutoff: 3000, envAmt: 0.6, fA: 0.002, fD: 0.3, fS: 0.1, scoop: 0, tahrir: 0, vibDepth: 0, delayMix: 0.2 } },
    { id: "tarPluck", name: "Tar Pluck · Chahargah", group: "Plucked", patch: { tuning: "chahargah", tuneRoot: 0, polyMode: "poly", legato: "off", glide: 0, osc1Wave: "sawtooth", osc2Wave: "square", osc2Oct: 1, noise: 0, aA: 0.002, aD: 0.5, aS: 0, aR: 0.4, cutoff: 1800, res: 5, envAmt: 0.7, fA: 0.002, fD: 0.2, fS: 0, scoop: 0.1, scoopTime: 0.03, tahrir: 0, vibDepth: 0 } },
    { id: "desertDrone", name: "Desert Drone · Shur", group: "Drone", patch: { polyMode: "poly", hold: "on", osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "sawtooth", osc2Oct: -1, osc2Detune: 10, unison: 3, uniDetune: 12, uniWidth: 0.7, aA: 1.5, aR: 3, cutoff: 900, noise: 0.05, scoop: 0, tahrir: 0, vibDepth: 0, revMix: 0.6, revSize: 5 } },
    { id: "equalLead", name: "Equal-Tempered Lead", group: "Drone", patch: { tuning: "12tet", tuneRoot: 0, osc1Wave: "sawtooth", osc2Wave: "square", cutoff: 2600, res: 3 } }
  ]
};
