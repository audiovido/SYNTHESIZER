import { MachineDef, row, SEC, toggles } from "./types";

/**
 * KONYA — Euclidean rhythm synth. Hold a chord and three rotating rings play
 * it on the global tempo: each ring spreads its pulses as evenly as possible
 * over its steps (then rotates them). Ring 1 plays the lowest held note,
 * ring 2 the next, ring 3 the next (wrapping). HOLD latches the chord.
 */

type Ring = [steps: number, pulses: number, rot: number, oct: number];

function rings(r1: Ring, r2: Ring, r3: Ring, on: [boolean, boolean, boolean] = [true, true, true]): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  [r1, r2, r3].forEach((r, i) => {
    const k = i + 1;
    p[`euc${k}Steps`] = r[0];
    p[`euc${k}Pulses`] = r[1];
    p[`euc${k}Rot`] = r[2];
    p[`euc${k}Oct`] = r[3];
    p[`euc${k}On`] = on[i] ? "on" : "off";
  });
  return p;
}

const ringSection = (k: number, page: string) => ({
  title: `RING ${k}`,
  page,
  controls: [
    toggles([{ key: `euc${k}On`, label: "ON", title: `Ring ${k} on/off` }]),
    row([[`euc${k}Steps`, "STEPS"], [`euc${k}Pulses`, "HITS"], [`euc${k}Rot`, "ROT"], [`euc${k}Oct`, "OCT"]])
  ]
});

const PLUCK = { osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.25, cutoff: 2600, res: 3, envAmt: 0.5, fA: 0.002, fD: 0.25, fS: 0.1, aA: 0.002, aD: 0.5, aS: 0, aR: 0.35 };

export const KONYA: MachineDef = {
  id: "konya",
  name: "Konya",
  role: "Euclidean rhythm synth",
  skin: "konya",
  kind: "synth",
  tempo: true,
  pages: [
    { id: "rings", label: "Rings" },
    { id: "ringset", label: "Ring settings" },
    { id: "sound", label: "Sound" },
    { id: "space", label: "Space" }
  ],
  sections: [
    { title: "RINGS", page: "rings", custom: "euclid-rings", controls: [] },
    {
      title: "CLOCK", page: "rings",
      controls: [
        toggles([{ key: "hold", label: "LATCH", title: "Keep the chord playing after you let go (same as HOLD)" }]),
        row([["eucRate", "RATE"], ["arpGate", "GATE"], ["arpSwing", "SWING"]])
      ]
    },
    ringSection(1, "ringset"), ringSection(2, "ringset"), ringSection(3, "ringset"),
    SEC.osc1("sound", "TONE"),
    {
      title: "FILTER · ENV", page: "sound",
      controls: [row([["cutoff", "CUTOFF"], ["res", "RESO"], ["envAmt", "ENV"]]), row([["fD", "F.DEC"], ["aD", "DECAY"], ["aR", "RELEASE"]], { small: true })]
    },
    SEC.space("space")
  ],
  base: {
    arpOn: "on", arpMode: "euclid", arpGate: 0.45, arpSwing: 0, eucRate: 6, hold: "off",
    polyMode: "poly", glide: 0, unison: 1, velSens: 0.5, ...PLUCK,
    delayMix: 0.22, delayTime: 0.375, delayFb: 0.35, revMix: 0.28, revSize: 2.6, volume: 0.78
  },
  presets: [
    { id: "dervish", name: "Dervish", group: "Hypnotic", patch: { ...rings([12, 5, 0, 0], [12, 3, 2, 0], [16, 7, 0, 1]) } },
    { id: "clockwork", name: "Clockwork", group: "Hypnotic", patch: { osc1Wave: "square", cutoff: 3200, res: 6, aD: 0.25, arpGate: 0.3, ...rings([16, 4, 0, 0], [16, 6, 1, 0], [16, 9, 3, 1]) } },
    { id: "polymeter", name: "Polymeter 5/7", group: "Hypnotic", patch: { ...rings([5, 3, 0, 0], [7, 4, 0, 0], [16, 5, 2, 1]) } },
    { id: "minimal916", name: "Minimal 9/16", group: "Hypnotic", patch: { osc1Wave: "sine", osc2Wave: "sine", osc2Oct: 2, oscMix: 0.15, cutoff: 1800, res: 1, ...rings([16, 9, 0, -1], [16, 5, 4, 0], [16, 3, 8, 1]) } },
    { id: "tresillo", name: "Tresillo", group: "World rhythms", patch: { ...rings([8, 3, 0, -1], [16, 5, 0, 0], [12, 7, 0, 1]) } },
    { id: "bossaClave", name: "Bossa Clave", group: "World rhythms", patch: { osc1Wave: "sine", osc2Wave: "triangle", cutoff: 2200, ...rings([16, 5, 0, -1], [16, 3, 2, 0], [16, 7, 1, 1]) } },
    { id: "afroBell", name: "Afro Bell 12/7", group: "World rhythms", patch: { osc2Oct: 2, oscMix: 0.35, cutoff: 4200, res: 5, aD: 0.3, ...rings([12, 7, 0, 1], [12, 5, 3, 0], [12, 3, 0, -1]) } },
    { id: "aksak", name: "Aksak 9/8", group: "World rhythms", patch: { ...rings([9, 4, 0, -1], [9, 5, 1, 0], [9, 2, 0, 1]) } },
    { id: "gamelan", name: "Gamelan", group: "Bells", patch: { osc1Wave: "sine", osc2Wave: "square", osc2Oct: 2, oscMix: 0.3, cutoff: 5000, res: 2, aD: 1.2, aR: 1, revMix: 0.42, ...rings([16, 7, 0, 0], [16, 5, 2, 1], [16, 3, 4, 2]) } },
    { id: "raindrops", name: "Raindrops", group: "Bells", patch: { osc1Wave: "sine", osc2Wave: "sine", osc2Oct: 2, oscMix: 0.4, cutoff: 6000, aD: 0.8, aR: 0.9, delayMix: 0.4, delayFb: 0.5, revMix: 0.5, revSize: 4, ...rings([13, 4, 0, 1], [11, 3, 0, 2], [7, 2, 0, 1]) } },
    { id: "musicBox", name: "Music Box", group: "Bells", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 2, oscMix: 0.45, cutoff: 7000, res: 1, aD: 1.4, aR: 1.2, revMix: 0.38, eucRate: 4, ...rings([8, 5, 0, 1], [8, 3, 1, 2], [16, 5, 0, 0]) } },
    { id: "kora", name: "Kora Cycle", group: "Plucks", patch: { osc1Wave: "sawtooth", osc2Wave: "triangle", cutoff: 2000, res: 4, envAmt: 0.6, fD: 0.18, aD: 0.6, ...rings([12, 5, 0, 0], [12, 7, 2, 0], [12, 4, 1, 1]) } },
    { id: "steppe", name: "Steppe Gallop", group: "Plucks", patch: { osc1Wave: "sawtooth", cutoff: 1500, res: 5, envAmt: 0.7, eucRate: 5, ...rings([6, 3, 0, -1], [6, 2, 1, 0], [12, 5, 0, 1]) } },
    { id: "acidRings", name: "Acid Rings", group: "Plucks", patch: { osc1Wave: "sawtooth", osc2Wave: "sawtooth", oscMix: 0, cutoff: 500, res: 14, envAmt: 0.85, fD: 0.16, aD: 0.3, drive: 0.4, ...rings([16, 7, 0, -1], [16, 5, 3, -1], [16, 3, 0, 0], [true, true, false]) } },
    { id: "nightTrain", name: "Night Train", group: "Plucks", patch: { osc1Wave: "square", osc2Wave: "sawtooth", oscMix: 0.3, cutoff: 1100, res: 3, aD: 0.4, delayMix: 0.35, delayTime: 0.5, ...rings([16, 11, 0, -1], [16, 4, 2, 0], [16, 2, 6, 1]) } },
    { id: "stillPond", name: "Still Pond", group: "Ambient", patch: { osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 1, oscMix: 0.3, cutoff: 1600, res: 1, aA: 0.03, aD: 2, aR: 2, arpGate: 0.8, eucRate: 4, delayMix: 0.45, delayTime: 0.6, delayFb: 0.55, revMix: 0.6, revSize: 5, ...rings([16, 3, 0, 0], [13, 2, 0, 1], [11, 2, 3, 2]) } },
    { id: "orbit", name: "Slow Orbit", group: "Ambient", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: -1, oscMix: 0.4, cutoff: 1300, aA: 0.08, aD: 2.5, aR: 2.5, arpGate: 0.95, eucRate: 3, revMix: 0.6, revSize: 5.5, ...rings([7, 3, 0, 0], [5, 2, 0, 1], [9, 4, 0, -1]) } }
  ]
};
