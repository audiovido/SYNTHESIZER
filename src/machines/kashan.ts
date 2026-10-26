import { MachineDef, row, SEC, SectionDef } from "./types";

/**
 * KASHAN — mid-80s FM digital keys: glassy electric pianos, bells, mallets,
 * punchy basses, organs and brass. 4 operators, 8 algorithms (see the LCD).
 */

type Op = [ratio: number, level: number, a: number, d: number, s: number, r: number];

/** Patch from 4 operators: [ratio, level, attack, decay, sustain, release]. */
function ops(o1: Op, o2: Op, o3: Op, o4: Op): Record<string, number> {
  const p: Record<string, number> = {};
  [o1, o2, o3, o4].forEach((o, i) => {
    const k = i + 1;
    p[`op${k}Ratio`] = o[0];
    p[`op${k}Level`] = o[1];
    p[`op${k}A`] = o[2];
    p[`op${k}D`] = o[3];
    p[`op${k}S`] = o[4];
    p[`op${k}R`] = o[5];
  });
  return p;
}

const opSection = (k: number, page: string): SectionDef => ({
  title: `OP ${k}`,
  page,
  controls: [
    row([[`op${k}Ratio`, "RATIO"], [`op${k}Level`, "LEVEL"]]),
    row([[`op${k}A`, "A"], [`op${k}D`, "D"], [`op${k}S`, "S"], [`op${k}R`, "R"]], { small: true })
  ]
});

export const KASHAN: MachineDef = {
  id: "kashan",
  name: "Kashan",
  role: "FM digital keys",
  skin: "kashan",
  kind: "synth",
  engine: "fm",
  pages: [
    { id: "algo", label: "Algorithm" },
    { id: "ops12", label: "Op 1·2" },
    { id: "ops34", label: "Op 3·4" },
    { id: "fx", label: "Effects" }
  ],
  sections: [
    { title: "ALGORITHM", page: "algo", custom: "fm-algo", controls: [] },
    {
      title: "GLOBAL", page: "algo",
      controls: [
        row([["fmFeedback", "FEEDBK"], ["fmBright", "BRIGHT"], ["fmVelMod", "VEL→MOD"]]),
        row([["fmTone", "TONE"], ["velSens", "VEL"], ["bendRange", "BEND"]], { small: true })
      ]
    },
    opSection(1, "ops12"), opSection(2, "ops12"), opSection(3, "ops34"), opSection(4, "ops34"),
    SEC.chorus("fx"),
    SEC.space("fx")
  ],
  base: {
    polyMode: "poly", glide: 0, velSens: 0.65, fmVelMod: 0.6, fmBright: 0.5, fmTone: 1, fmFeedback: 0,
    chorusMix: 0.2, chorusRate: 0.6, chorusDepth: 0.5, delayMix: 0, revMix: 0.18, revSize: 2, volume: 0.8, bendRange: 2
  },
  presets: [
    // ---- Electric pianos
    { id: "ep1", name: "E.Piano 1", group: "Electric piano", patch: { fmAlgo: "5", fmVelMod: 0.8, chorusMix: 0.35, ...ops([1, 0.9, 0.002, 4.5, 0.08, 0.7], [1, 0.62, 0.002, 1.4, 0.05, 0.6], [1, 0.55, 0.002, 2.2, 0, 0.5], [14, 0.42, 0.002, 0.22, 0, 0.3]) } },
    { id: "dynoEp", name: "Dyno EP", group: "Electric piano", patch: { fmAlgo: "5", fmVelMod: 0.9, fmBright: 0.62, chorusMix: 0.45, ...ops([1, 0.9, 0.002, 3.5, 0.1, 0.6], [1, 0.72, 0.002, 0.9, 0.08, 0.5], [1, 0.6, 0.002, 1.6, 0, 0.4], [14, 0.55, 0.002, 0.16, 0, 0.2]) } },
    { id: "softEp", name: "Soft Ballad EP", group: "Electric piano", patch: { fmAlgo: "5", fmVelMod: 0.7, fmBright: 0.35, fmTone: 0.78, chorusMix: 0.5, revMix: 0.3, ...ops([1, 0.95, 0.004, 5, 0.12, 1], [1, 0.45, 0.004, 1.8, 0.05, 0.8], [2, 0.3, 0.004, 1.8, 0, 0.6], [14, 0.25, 0.002, 0.2, 0, 0.3]) } },
    { id: "wurly", name: "Wurly Bark", group: "Electric piano", patch: { fmAlgo: "3", fmFeedback: 0.15, fmVelMod: 0.85, chorusMix: 0.15, ...ops([1, 0.95, 0.002, 2.6, 0.2, 0.3], [1, 0.62, 0.002, 0.9, 0.2, 0.3], [3, 0.3, 0.002, 0.3, 0, 0.2], [7, 0.32, 0.002, 0.12, 0, 0.1]) } },
    { id: "clav", name: "FM Clav", group: "Electric piano", patch: { fmAlgo: "2", fmFeedback: 0.35, fmBright: 0.65, chorusMix: 0, ...ops([1, 0.9, 0.001, 0.9, 0.25, 0.08], [3, 0.6, 0.001, 0.4, 0.2, 0.08], [1, 0.45, 0.001, 0.25, 0.1, 0.08], [5, 0.35, 0.001, 0.15, 0, 0.05]) } },
    // ---- Bells & mallets
    { id: "tineBells", name: "Tine Bells", group: "Bells & mallets", patch: { fmAlgo: "5", revMix: 0.35, revSize: 3.5, ...ops([1, 0.85, 0.002, 4, 0, 2.5], [3.5, 0.55, 0.002, 2, 0, 1.5], [2, 0.6, 0.002, 3, 0, 2], [7, 0.45, 0.002, 1.2, 0, 1]) } },
    { id: "tubular", name: "Tubular Bells", group: "Bells & mallets", patch: { fmAlgo: "1", revMix: 0.4, revSize: 4, ...ops([1, 0.9, 0.002, 6, 0, 3], [3.5, 0.55, 0.002, 5, 0, 3], [1, 0.3, 0.002, 2, 0, 1], [7.07, 0.2, 0.002, 1, 0, 0.8]) } },
    { id: "glock", name: "Glockenspiel", group: "Bells & mallets", patch: { fmAlgo: "5", revMix: 0.25, ...ops([4, 0.8, 0.001, 2.2, 0, 1.2], [11, 0.4, 0.001, 0.4, 0, 0.3], [8, 0.4, 0.001, 1.4, 0, 1], [3, 0.25, 0.001, 0.3, 0, 0.2]) } },
    { id: "marimba", name: "Marimba", group: "Bells & mallets", patch: { fmAlgo: "5", fmVelMod: 0.7, revMix: 0.2, ...ops([1, 0.95, 0.001, 0.7, 0, 0.35], [4, 0.6, 0.001, 0.06, 0, 0.05], [10, 0.25, 0.001, 0.08, 0, 0.05], [1, 0.2, 0.001, 0.05, 0, 0.05]) } },
    { id: "vibes", name: "Vibraphone", group: "Bells & mallets", patch: { fmAlgo: "5", chorusMix: 0.4, chorusRate: 4.5, chorusDepth: 0.35, revMix: 0.3, ...ops([1, 0.9, 0.002, 3.5, 0, 1.5], [4, 0.35, 0.002, 0.5, 0, 0.4], [4, 0.25, 0.002, 1.5, 0, 1], [1, 0.1, 0.002, 0.3, 0, 0.3]) } },
    { id: "kalimba", name: "Kalimba", group: "Bells & mallets", patch: { fmAlgo: "5", revMix: 0.22, ...ops([1, 0.9, 0.001, 1.1, 0, 0.6], [5.1, 0.45, 0.001, 0.08, 0, 0.05], [3, 0.3, 0.001, 0.5, 0, 0.3], [9, 0.2, 0.001, 0.05, 0, 0.05]) } },
    { id: "steelDrum", name: "Steel Drum", group: "Bells & mallets", patch: { fmAlgo: "3", revMix: 0.22, ...ops([1, 0.9, 0.002, 1.3, 0, 0.5], [1.5, 0.55, 0.002, 0.5, 0, 0.3], [2.5, 0.3, 0.002, 0.3, 0, 0.2], [3, 0.3, 0.002, 0.2, 0, 0.1]) } },
    // ---- Bass
    { id: "latelyBass", name: "Lately Bass", group: "Bass", patch: { fmAlgo: "2", fmFeedback: 0.45, polyMode: "mono", legato: "off", fmVelMod: 0.8, chorusMix: 0, revMix: 0.05, ...ops([0.5, 0.95, 0.001, 1.2, 0.35, 0.12], [0.5, 0.7, 0.001, 0.35, 0.15, 0.1], [1, 0.4, 0.001, 0.2, 0.1, 0.1], [1, 0.3, 0.001, 0.25, 0, 0.1]) } },
    { id: "slapBass", name: "Slap Bass", group: "Bass", patch: { fmAlgo: "3", fmFeedback: 0.3, polyMode: "mono", legato: "off", fmBright: 0.65, chorusMix: 0, revMix: 0.05, ...ops([0.5, 0.95, 0.001, 0.9, 0.3, 0.1], [1, 0.7, 0.001, 0.2, 0.1, 0.08], [3, 0.4, 0.001, 0.06, 0, 0.05], [7, 0.35, 0.001, 0.04, 0, 0.03]) } },
    { id: "woodBass", name: "Wood Bass", group: "Bass", patch: { fmAlgo: "1", polyMode: "mono", legato: "off", fmTone: 0.7, chorusMix: 0, revMix: 0.1, ...ops([0.5, 0.95, 0.004, 1.6, 0.2, 0.2], [0.5, 0.5, 0.004, 0.5, 0.1, 0.2], [1, 0.25, 0.004, 0.2, 0, 0.2], [2, 0.2, 0.004, 0.1, 0, 0.1]) } },
    { id: "subFm", name: "Sub Pulse", group: "Bass", patch: { fmAlgo: "1", polyMode: "mono", legato: "on", glide: 0.06, fmFeedback: 0.6, chorusMix: 0, ...ops([0.5, 0.95, 0.002, 2, 0.8, 0.15], [0.5, 0.45, 0.002, 0.4, 0.3, 0.15], [0.5, 0.2, 0.002, 2, 0.3, 0.15], [1, 0.3, 0.002, 2, 0.5, 0.15]) } },
    // ---- Organ
    { id: "drawbar", name: "Drawbar Organ", group: "Organ", patch: { fmAlgo: "8", velSens: 0, fmVelMod: 0, chorusMix: 0.5, chorusRate: 5.5, chorusDepth: 0.4, revMix: 0.2, ...ops([0.5, 0.75, 0.005, 1, 1, 0.06], [1, 0.8, 0.005, 1, 1, 0.06], [2, 0.6, 0.005, 1, 1, 0.06], [3, 0.45, 0.005, 1, 1, 0.06]) } },
    { id: "churchOrgan", name: "Chapel Organ", group: "Organ", patch: { fmAlgo: "8", velSens: 0, fmVelMod: 0, revMix: 0.45, revSize: 4.5, ...ops([1, 0.8, 0.04, 1, 1, 0.4], [2, 0.6, 0.04, 1, 1, 0.4], [4, 0.45, 0.04, 1, 1, 0.4], [6, 0.3, 0.04, 1, 1, 0.4]) } },
    { id: "percOrgan", name: "Perc Organ", group: "Organ", patch: { fmAlgo: "8", velSens: 0.2, fmVelMod: 0, chorusMix: 0.45, chorusRate: 6, ...ops([1, 0.8, 0.003, 1, 1, 0.05], [2, 0.6, 0.003, 1, 1, 0.05], [3, 0.6, 0.002, 0.25, 0, 0.05], [4, 0.35, 0.003, 1, 1, 0.05]) } },
    // ---- Pads & strings
    { id: "glassPad", name: "Glass Pad", group: "Pads", patch: { fmAlgo: "6", chorusMix: 0.55, revMix: 0.45, revSize: 4.5, delayMix: 0.15, delayTime: 0.5, delayFb: 0.4, ...ops([1, 0.7, 1.2, 3, 0.8, 2.5], [2.01, 0.45, 1.5, 3, 0.7, 2.5], [3, 0.3, 1.8, 3, 0.6, 2.5], [0.5, 0.35, 1.4, 3, 0.6, 2.5]) } },
    { id: "fmStrings", name: "FM Strings", group: "Pads", patch: { fmAlgo: "2", fmFeedback: 0.35, chorusMix: 0.6, revMix: 0.35, ...ops([1, 0.85, 0.35, 2, 0.85, 1.2], [1, 0.45, 0.4, 2, 0.6, 1.2], [1.003, 0.3, 0.5, 2, 0.5, 1.2], [2, 0.25, 0.5, 2, 0.4, 1.2]) } },
    { id: "metalPad", name: "Metallic Haze", group: "Pads", patch: { fmAlgo: "4", fmFeedback: 0.25, chorusMix: 0.45, revMix: 0.5, revSize: 5, ...ops([1, 0.75, 1.5, 4, 0.7, 3], [3.14, 0.4, 2, 4, 0.5, 3], [1.41, 0.35, 2.5, 4, 0.5, 3], [7.5, 0.2, 2.5, 3, 0.3, 3]) } },
    // ---- Leads & brass
    { id: "brass80", name: "Brass 80", group: "Leads & brass", patch: { fmAlgo: "2", fmFeedback: 0.4, chorusMix: 0.3, revMix: 0.22, ...ops([1, 0.9, 0.05, 1.5, 0.8, 0.25], [1, 0.62, 0.09, 0.4, 0.55, 0.25], [1, 0.35, 0.09, 0.4, 0.4, 0.25], [1, 0.3, 0.05, 0.4, 0.3, 0.25]) } },
    { id: "syncLead", name: "Digital Lead", group: "Leads & brass", patch: { fmAlgo: "1", fmFeedback: 0.55, polyMode: "mono", legato: "on", glide: 0.05, chorusMix: 0.2, delayMix: 0.2, delayTime: 0.375, delayFb: 0.35, ...ops([1, 0.9, 0.003, 1, 0.85, 0.2], [2, 0.5, 0.003, 1, 0.6, 0.2], [1, 0.35, 0.003, 1, 0.5, 0.2], [1, 0.35, 0.003, 1, 0.5, 0.2]) } },
    { id: "harmonica", name: "Harmonica", group: "Leads & brass", patch: { fmAlgo: "3", fmFeedback: 0.5, polyMode: "mono", legato: "on", glide: 0.03, velSens: 0.8, ...ops([1, 0.85, 0.04, 1, 0.8, 0.15], [1, 0.5, 0.05, 1, 0.6, 0.15], [2, 0.35, 0.05, 1, 0.5, 0.15], [1, 0.35, 0.05, 1, 0.5, 0.15]) } },
    // ---- World
    { id: "koto", name: "Koto", group: "World", patch: { fmAlgo: "5", revMix: 0.28, ...ops([1, 0.9, 0.001, 1.8, 0, 0.6], [3, 0.5, 0.001, 0.2, 0, 0.1], [2, 0.4, 0.001, 0.9, 0, 0.4], [5, 0.35, 0.001, 0.06, 0, 0.05]) } },
    { id: "sitarFm", name: "Sitar Buzz", group: "World", patch: { fmAlgo: "3", fmFeedback: 0.7, revMix: 0.3, ...ops([1, 0.9, 0.001, 3, 0.1, 1], [1, 0.4, 0.001, 2.5, 0.3, 1], [2, 0.25, 0.001, 1.5, 0, 0.8], [1, 0.45, 0.001, 2.5, 0.3, 1]) } },
    { id: "santurFm", name: "Santur FM", group: "World", patch: { fmAlgo: "5", chorusMix: 0.3, revMix: 0.32, ...ops([1, 0.85, 0.001, 2.5, 0, 1.2], [4, 0.35, 0.001, 0.3, 0, 0.2], [2.003, 0.55, 0.001, 2.2, 0, 1.2], [6, 0.3, 0.001, 0.15, 0, 0.1]) } }
  ]
};
