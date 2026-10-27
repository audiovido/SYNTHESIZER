import { choice, ChoiceOption, MachineDef, row, SEC, toggles } from "./types";

export const ORBIT_MODE_OPTS: ChoiceOption[] = [
  ["off", "OFF", "Orbit off — XY stays where you leave it"],
  ["circle", "CIRCLE", "Circular orbit around XY center"],
  ["figure8", "FIG-8", "Figure-8 Lissajous orbit"],
  ["drawn", "DRAWN", "Loop the user-drawn XY path"]
];

export const VEC_FILTER_OPTS: ChoiceOption[] = [
  ["lowpass", "LP", "Low-pass filter"],
  ["bandpass", "BP", "Band-pass filter"],
  ["highpass", "HP", "High-pass filter"]
];

/**
 * NISHAPUR — Vector morph synth: 4 distinct corner sound sources crossfaded
 * by equal-power bilinear weights on an interactive XY pad, with an
 * audio-clock-driven ORBIT generator (OFF / CIRCLE / FIGURE-8 / DRAWN).
 */
export const NISHAPUR: MachineDef = {
  id: "nishapur",
  name: "Nishapur",
  role: "Vector morph synth",
  skin: "nishapur",
  kind: "synth",
  engine: "vector",
  tempo: true,
  pages: [
    { id: "vector", label: "Vector" },
    { id: "sources", label: "Sources" },
    { id: "shape", label: "Shape" },
    { id: "space", label: "Space" }
  ],
  sections: [
    {
      title: "VECTOR",
      page: "vector",
      custom: "vector-pad",
      controls: []
    },
    {
      title: "ORBIT",
      page: "vector",
      controls: [
        choice("orbitMode", ORBIT_MODE_OPTS),
        toggles([
          { key: "orbitSync", label: "SYNC", title: "Sync orbit rate to tempo (4 bars to 1/16)" },
          { key: "orbitRec", label: "REC", title: "Drag on the XY pad while REC is on to record a drawn path" }
        ]),
        row([["orbitRate", "RATE"], ["orbitSize", "SIZE"]])
      ]
    },
    {
      title: "A · SAW / PULSE",
      page: "sources",
      controls: [
        row([["vecAPw", "PULSE WIDTH"], ["vecALevel", "LEVEL"]])
      ]
    },
    {
      title: "B · FM BELL",
      page: "sources",
      controls: [
        row([["vecBRatio", "RATIO"], ["vecBIndex", "INDEX"], ["vecBLevel", "LEVEL"]])
      ]
    },
    {
      title: "C · WAVETABLE",
      page: "sources",
      controls: [
        row([["vecCPos", "POSITION"], ["vecCLevel", "LEVEL"]])
      ]
    },
    {
      title: "D · FORMANTS",
      page: "sources",
      controls: [
        row([["vecDVowel", "VOWEL"], ["vecDLevel", "LEVEL"]])
      ]
    },
    {
      title: "FILTER",
      page: "shape",
      controls: [
        choice("filterType", VEC_FILTER_OPTS),
        row([["cutoff", "CUTOFF"], ["res", "RESO"], ["envAmt", "ENV"]])
      ]
    },
    {
      title: "FILTER ENV",
      page: "shape",
      controls: [
        row([["fA", "ATTACK"], ["fD", "DECAY"]]),
        row([["fS", "SUSTAIN"], ["fR", "RELEASE"]])
      ]
    },
    SEC.amp("shape", false),
    SEC.space("space")
  ],
  base: {
    hold: "off",
    oriental: "off",
    polyMode: "poly",
    legato: "on",
    glide: 0,
    vecX: 0.45,
    vecY: 0.45,
    orbitMode: "circle",
    orbitRate: 0.32,
    orbitSync: "off",
    orbitSize: 0.55,
    orbitRec: "off",
    vecAPw: 0.35,
    vecALevel: 0.85,
    vecBRatio: 3.5,
    vecBIndex: 0.45,
    vecBLevel: 0.85,
    vecCPos: 0.4,
    vecCLevel: 0.85,
    vecDVowel: 0.3,
    vecDLevel: 0.85,
    filterType: "lowpass",
    cutoff: 2600,
    res: 2.0,
    envAmt: 0.42,
    fA: 0.02,
    fD: 0.6,
    fS: 0.38,
    fR: 0.55,
    aA: 0.03,
    aD: 0.55,
    aS: 0.8,
    aR: 0.7,
    velSens: 0.6,
    delayTime: 0.36,
    delayFb: 0.38,
    delayMix: 0.18,
    revSize: 3.2,
    revMix: 0.34,
    volume: 0.75
  },
  presets: [
    {
      id: "nebula",
      name: "Nebula",
      group: "Pads",
      patch: {
        vecX: 0.42, vecY: 0.48,
        orbitMode: "circle", orbitSync: "off", orbitRate: 0.22, orbitSize: 0.62,
        vecAPw: 0.32, vecALevel: 0.85,
        vecBRatio: 2.0, vecBIndex: 0.35, vecBLevel: 0.75,
        vecCPos: 0.38, vecCLevel: 0.9,
        vecDVowel: 0.25, vecDLevel: 0.8,
        filterType: "lowpass", cutoff: 1900, res: 2.4, envAmt: 0.48,
        fA: 0.18, fD: 1.2, fS: 0.5, fR: 1.1,
        aA: 0.14, aD: 0.9, aS: 0.85, aR: 1.4,
        revMix: 0.46, revSize: 4.2, delayMix: 0.22, delayTime: 0.42, delayFb: 0.42
      }
    },
    {
      id: "breathingGlass",
      name: "Breathing Glass",
      group: "Pads",
      patch: {
        vecX: 0.56, vecY: 0.38,
        orbitMode: "figure8", orbitSync: "off", orbitRate: 0.28, orbitSize: 0.68,
        vecAPw: 0.48, vecALevel: 0.65,
        vecBRatio: 4.0, vecBIndex: 0.52, vecBLevel: 0.92,
        vecCPos: 0.72, vecCLevel: 0.9,
        vecDVowel: 0.45, vecDLevel: 0.78,
        filterType: "lowpass", cutoff: 3200, res: 2.8, envAmt: 0.4,
        fA: 0.15, fD: 0.95, fS: 0.45, fR: 0.9,
        aA: 0.08, aD: 0.8, aS: 0.8, aR: 1.2,
        revMix: 0.48, revSize: 3.8, delayMix: 0.24, delayTime: 0.35
      }
    },
    {
      id: "orbitBells",
      name: "Orbit Bells",
      group: "Bells & Keys",
      patch: {
        vecX: 0.72, vecY: 0.28,
        orbitMode: "circle", orbitSync: "on", orbitRate: 1.15, orbitSize: 0.65,
        vecAPw: 0.22, vecALevel: 0.6,
        vecBRatio: 3.5, vecBIndex: 0.68, vecBLevel: 1.0,
        vecCPos: 0.64, vecCLevel: 0.85,
        vecDVowel: 0.5, vecDLevel: 0.55,
        filterType: "lowpass", cutoff: 4200, res: 2.2, envAmt: 0.5,
        fA: 0.004, fD: 0.65, fS: 0.2, fR: 0.7,
        aA: 0.004, aD: 0.85, aS: 0.28, aR: 0.95,
        delayMix: 0.32, delayTime: 0.375, delayFb: 0.45, revMix: 0.38, revSize: 3.5
      }
    },
    {
      id: "tidal",
      name: "Tidal",
      group: "Motion & Orbit",
      patch: {
        vecX: 0.48, vecY: 0.58,
        orbitMode: "figure8", orbitSync: "off", orbitRate: 0.35, orbitSize: 0.82,
        vecAPw: 0.25, vecALevel: 0.9,
        vecBRatio: 1.5, vecBIndex: 0.4, vecBLevel: 0.75,
        vecCPos: 0.22, vecCLevel: 0.88,
        vecDVowel: 0.65, vecDLevel: 0.95,
        filterType: "lowpass", cutoff: 1450, res: 4.2, envAmt: 0.55,
        fA: 0.22, fD: 1.1, fS: 0.4, fR: 0.9,
        aA: 0.1, aD: 0.7, aS: 0.85, aR: 1.1,
        revMix: 0.44, revSize: 4.0, delayMix: 0.26, delayTime: 0.48
      }
    },
    {
      id: "cometTail",
      name: "Comet Tail",
      group: "Motion & Orbit",
      patch: {
        vecX: 0.6, vecY: 0.34,
        orbitMode: "drawn", orbitSync: "off", orbitRate: 0.48, orbitSize: 0.75,
        vecAPw: 0.4, vecALevel: 0.8,
        vecBRatio: 5.0, vecBIndex: 0.58, vecBLevel: 0.92,
        vecCPos: 0.84, vecCLevel: 0.88,
        vecDVowel: 0.35, vecDLevel: 0.75,
        filterType: "lowpass", cutoff: 2800, res: 3.4, envAmt: 0.6,
        fA: 0.01, fD: 0.75, fS: 0.25, fR: 0.95,
        aA: 0.012, aD: 0.7, aS: 0.55, aR: 1.35,
        delayMix: 0.42, delayTime: 0.44, delayFb: 0.55, revMix: 0.46, revSize: 4.4
      }
    },
    {
      id: "vowelChoir",
      name: "Vowel Choir",
      group: "Pads",
      patch: {
        vecX: 0.68, vecY: 0.76,
        orbitMode: "circle", orbitSync: "off", orbitRate: 0.24, orbitSize: 0.48,
        vecAPw: 0.5, vecALevel: 0.7,
        vecBRatio: 2.0, vecBIndex: 0.25, vecBLevel: 0.55,
        vecCPos: 0.28, vecCLevel: 0.92,
        vecDVowel: 0.18, vecDLevel: 1.0,
        filterType: "lowpass", cutoff: 3100, res: 2.6, envAmt: 0.32,
        fA: 0.16, fD: 0.9, fS: 0.6, fR: 0.9,
        aA: 0.12, aD: 0.8, aS: 0.88, aR: 1.15,
        revMix: 0.5, revSize: 4.2, delayMix: 0.16
      }
    },
    {
      id: "glassHarp",
      name: "Glass Harp",
      group: "Bells & Keys",
      patch: {
        vecX: 0.62, vecY: 0.4,
        orbitMode: "circle", orbitSync: "off", orbitRate: 0.62, orbitSize: 0.38,
        vecAPw: 0.5, vecALevel: 0.55,
        vecBRatio: 4.0, vecBIndex: 0.48, vecBLevel: 0.95,
        vecCPos: 0.92, vecCLevel: 0.9,
        vecDVowel: 0.55, vecDLevel: 0.45,
        filterType: "lowpass", cutoff: 5200, res: 1.8, envAmt: 0.45,
        fA: 0.003, fD: 0.5, fS: 0.15, fR: 0.65,
        aA: 0.003, aD: 0.95, aS: 0.12, aR: 1.1,
        revMix: 0.45, revSize: 3.9, delayMix: 0.28, delayTime: 0.32
      }
    },
    {
      id: "darkMatter",
      name: "Dark Matter",
      group: "Drones & FX",
      patch: {
        vecX: 0.36, vecY: 0.64,
        orbitMode: "figure8", orbitSync: "off", orbitRate: 0.16, orbitSize: 0.72,
        vecAPw: 0.18, vecALevel: 0.95,
        vecBRatio: 0.5, vecBIndex: 0.72, vecBLevel: 0.88,
        vecCPos: 0.15, vecCLevel: 0.92,
        vecDVowel: 0.82, vecDLevel: 0.85,
        filterType: "lowpass", cutoff: 680, res: 5.8, envAmt: 0.52,
        fA: 0.18, fD: 1.3, fS: 0.35, fR: 1.2,
        aA: 0.12, aD: 0.9, aS: 0.88, aR: 1.5,
        revMix: 0.52, revSize: 4.8, delayMix: 0.25, delayTime: 0.52
      }
    },
    {
      id: "solarWind",
      name: "Solar Wind",
      group: "Drones & FX",
      patch: {
        vecX: 0.72, vecY: 0.68,
        orbitMode: "circle", orbitSync: "off", orbitRate: 0.3, orbitSize: 0.78,
        vecAPw: 0.42, vecALevel: 0.75,
        vecBRatio: 6.0, vecBIndex: 0.44, vecBLevel: 0.8,
        vecCPos: 0.58, vecCLevel: 0.88,
        vecDVowel: 0.4, vecDLevel: 1.0,
        filterType: "bandpass", cutoff: 1550, res: 4.0, envAmt: 0.5,
        fA: 0.14, fD: 1.0, fS: 0.48, fR: 1.0,
        aA: 0.09, aD: 0.7, aS: 0.85, aR: 1.25,
        revMix: 0.5, revSize: 4.5, delayMix: 0.32, delayTime: 0.4, delayFb: 0.48
      }
    },
    {
      id: "pulsarBass",
      name: "Pulsar Bass",
      group: "Bass & Lead",
      patch: {
        vecX: 0.3, vecY: 0.22,
        orbitMode: "circle", orbitSync: "on", orbitRate: 3.1, orbitSize: 0.58,
        vecAPw: 0.16, vecALevel: 1.0,
        vecBRatio: 1.0, vecBIndex: 0.65, vecBLevel: 0.9,
        vecCPos: 0.44, vecCLevel: 0.8,
        vecDVowel: 0.12, vecDLevel: 0.45,
        filterType: "lowpass", cutoff: 740, res: 6.2, envAmt: 0.68,
        fA: 0.003, fD: 0.24, fS: 0.18, fR: 0.22,
        aA: 0.003, aD: 0.35, aS: 0.78, aR: 0.2,
        revMix: 0.12, delayMix: 0.14, delayTime: 0.25
      }
    },
    {
      id: "iceDrone",
      name: "Ice Drone",
      group: "Drones & FX",
      patch: {
        vecX: 0.44, vecY: 0.72,
        orbitMode: "figure8", orbitSync: "off", orbitRate: 0.12, orbitSize: 0.55,
        vecAPw: 0.65, vecALevel: 0.65,
        vecBRatio: 7.0, vecBIndex: 0.4, vecBLevel: 0.88,
        vecCPos: 0.95, vecCLevel: 0.95,
        vecDVowel: 0.52, vecDLevel: 0.8,
        filterType: "lowpass", cutoff: 2900, res: 3.2, envAmt: 0.35,
        fA: 0.25, fD: 1.5, fS: 0.55, fR: 1.4,
        aA: 0.18, aD: 1.0, aS: 0.9, aR: 1.8,
        revMix: 0.58, revSize: 5.2, delayMix: 0.28, delayTime: 0.55
      }
    },
    {
      id: "satelliteLead",
      name: "Satellite Lead",
      group: "Bass & Lead",
      patch: {
        vecX: 0.52, vecY: 0.24,
        orbitMode: "figure8", orbitSync: "off", orbitRate: 1.75, orbitSize: 0.42,
        vecAPw: 0.28, vecALevel: 0.92,
        vecBRatio: 2.0, vecBIndex: 0.55, vecBLevel: 0.88,
        vecCPos: 0.56, vecCLevel: 0.85,
        vecDVowel: 0.3, vecDLevel: 0.5,
        filterType: "lowpass", cutoff: 3400, res: 3.5, envAmt: 0.45,
        fA: 0.008, fD: 0.38, fS: 0.4, fR: 0.35,
        aA: 0.006, aD: 0.4, aS: 0.82, aR: 0.38,
        delayMix: 0.36, delayTime: 0.34, delayFb: 0.44, revMix: 0.26
      }
    },
    {
      id: "etherKeys",
      name: "Ether Keys",
      group: "Bells & Keys",
      patch: {
        vecX: 0.44, vecY: 0.36,
        orbitMode: "off", orbitSync: "off", orbitRate: 0.3, orbitSize: 0.45,
        vecAPw: 0.45, vecALevel: 0.8,
        vecBRatio: 3.0, vecBIndex: 0.38, vecBLevel: 0.85,
        vecCPos: 0.32, vecCLevel: 0.88,
        vecDVowel: 0.2, vecDLevel: 0.55,
        filterType: "lowpass", cutoff: 2700, res: 1.8, envAmt: 0.48,
        fA: 0.005, fD: 0.6, fS: 0.22, fR: 0.55,
        aA: 0.005, aD: 0.75, aS: 0.38, aR: 0.75,
        revMix: 0.36, revSize: 3.0, delayMix: 0.18, delayTime: 0.33
      }
    },
    {
      id: "gravityWell",
      name: "Gravity Well",
      group: "Motion & Orbit",
      patch: {
        vecX: 0.5, vecY: 0.5,
        orbitMode: "drawn", orbitSync: "on", orbitRate: 0.65, orbitSize: 0.88,
        vecAPw: 0.14, vecALevel: 0.92,
        vecBRatio: 1.5, vecBIndex: 0.7, vecBLevel: 0.9,
        vecCPos: 0.68, vecCLevel: 0.9,
        vecDVowel: 0.75, vecDLevel: 0.92,
        filterType: "lowpass", cutoff: 920, res: 7.2, envAmt: 0.62,
        fA: 0.08, fD: 0.9, fS: 0.3, fR: 0.8,
        aA: 0.04, aD: 0.65, aS: 0.85, aR: 0.9,
        delayMix: 0.3, delayTime: 0.38, delayFb: 0.48, revMix: 0.38
      }
    },
    {
      id: "moonlightPluck",
      name: "Moonlight Pluck",
      group: "Bells & Keys",
      patch: {
        vecX: 0.58, vecY: 0.2,
        orbitMode: "circle", orbitSync: "off", orbitRate: 0.52, orbitSize: 0.32,
        vecAPw: 0.2, vecALevel: 0.88,
        vecBRatio: 3.0, vecBIndex: 0.52, vecBLevel: 0.92,
        vecCPos: 0.5, vecCLevel: 0.78,
        vecDVowel: 0.35, vecDLevel: 0.4,
        filterType: "lowpass", cutoff: 2100, res: 3.0, envAmt: 0.65,
        fA: 0.002, fD: 0.26, fS: 0.08, fR: 0.35,
        aA: 0.002, aD: 0.42, aS: 0.05, aR: 0.5,
        delayMix: 0.34, delayTime: 0.3, delayFb: 0.42, revMix: 0.32
      }
    },
    {
      id: "signalBloom",
      name: "Signal Bloom",
      group: "Motion & Orbit",
      patch: {
        vecX: 0.46, vecY: 0.6,
        orbitMode: "figure8", orbitSync: "off", orbitRate: 0.4, orbitSize: 0.74,
        vecAPw: 0.38, vecALevel: 0.82,
        vecBRatio: 2.5, vecBIndex: 0.48, vecBLevel: 0.85,
        vecCPos: 0.76, vecCLevel: 0.94,
        vecDVowel: 0.6, vecDLevel: 0.9,
        filterType: "lowpass", cutoff: 1100, res: 4.5, envAmt: 0.72,
        fA: 0.28, fD: 1.2, fS: 0.48, fR: 1.0,
        aA: 0.15, aD: 0.85, aS: 0.85, aR: 1.2,
        revMix: 0.46, revSize: 4.0, delayMix: 0.28, delayTime: 0.42
      }
    },
    {
      id: "starfieldPad",
      name: "Starfield Pad",
      group: "Pads",
      patch: {
        vecX: 0.46, vecY: 0.32,
        orbitMode: "circle", orbitSync: "off", orbitRate: 0.18, orbitSize: 0.52,
        vecAPw: 0.36, vecALevel: 0.88,
        vecBRatio: 6.0, vecBIndex: 0.42, vecBLevel: 0.86,
        vecCPos: 0.88, vecCLevel: 0.9,
        vecDVowel: 0.28, vecDLevel: 0.72,
        filterType: "lowpass", cutoff: 3600, res: 2.0, envAmt: 0.38,
        fA: 0.2, fD: 1.3, fS: 0.55, fR: 1.3,
        aA: 0.16, aD: 0.95, aS: 0.86, aR: 1.6,
        revMix: 0.54, revSize: 4.8, delayMix: 0.24, delayTime: 0.46
      }
    },
    {
      id: "eventHorizon",
      name: "Event Horizon",
      group: "Drones & FX",
      patch: {
        vecX: 0.5, vecY: 0.54,
        orbitMode: "drawn", orbitSync: "off", orbitRate: 0.14, orbitSize: 0.9,
        vecAPw: 0.12, vecALevel: 0.95,
        vecBRatio: 0.75, vecBIndex: 0.78, vecBLevel: 0.9,
        vecCPos: 0.48, vecCLevel: 0.95,
        vecDVowel: 0.9, vecDLevel: 0.95,
        filterType: "lowpass", cutoff: 860, res: 6.4, envAmt: 0.56,
        fA: 0.22, fD: 1.4, fS: 0.42, fR: 1.5,
        aA: 0.18, aD: 1.1, aS: 0.9, aR: 1.9,
        revMix: 0.6, revSize: 5.4, delayMix: 0.3, delayTime: 0.54, delayFb: 0.5
      }
    }
  ]
};
