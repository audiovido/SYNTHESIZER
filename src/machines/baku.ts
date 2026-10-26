import { ARP_MODE_OPTS, choice, MachineDef, row, SEC, toggles } from "./types";

/** BAKU — arpeggios: tempo-synced arpeggiator, chorus, delay. */
export const BAKU: MachineDef = {
  id: "baku",
  name: "Baku",
  role: "Arpeggios",
  skin: "baku",
  kind: "synth",
  tempo: true,
  pages: [
    { id: "arp", label: "Arp" },
    { id: "osc", label: "Osc" },
    { id: "filter", label: "Filter & amp" },
    { id: "space", label: "Space" }
  ],
  sections: [
    {
      title: "ARPEGGIATOR", page: "arp", wide: true,
      controls: [
        toggles([
          { key: "arpOn", label: "ARP", title: "Arpeggiator on/off" },
          { key: "hold", label: "LATCH", title: "Keep the chord playing after you let go" }
        ]),
        choice("arpMode", ARP_MODE_OPTS),
        row([["arpRate", "RATE"], ["arpOct", "OCT"], ["arpGate", "GATE"], ["arpSwing", "SWING"]])
      ]
    },
    SEC.osc1("osc"), SEC.osc2("osc"), SEC.filter("filter"), SEC.amp("filter"), SEC.chorus("space"),
    SEC.delay("space"), SEC.reverbOut("space")
  ],
  base: {
    arpOn: "on", hold: "off", arpRate: 6, arpOct: 2, arpGate: 0.5,
    chorusMix: 0.4, chorusRate: 0.5, delayMix: 0.25, delayTime: 0.36, delayFb: 0.4, revMix: 0.25,
    aA: 0.002, aD: 0.25, aS: 0.3, aR: 0.2, velSens: 0.3, sub: 0.1,
    cutoff: 2200, res: 4, envAmt: 0.5, fA: 0.002, fD: 0.2, fS: 0.15
  },
  presets: [
    { id: "nightDrive", name: "Night Drive", group: "Synthwave", patch: { osc2Wave: "square", osc2Detune: 7, arpMode: "up", cutoff: 1500, res: 6, envAmt: 0.6 } },
    { id: "outrun", name: "Outrun", group: "Synthwave", patch: { osc2Wave: "sawtooth", osc2Detune: 9, unison: 3, uniDetune: 15, arpMode: "updown", arpGate: 0.6, cutoff: 1800, res: 5, chorusMix: 0.5 } },
    { id: "synthBells", name: "Synthwave Bells", group: "Synthwave", patch: { osc1Wave: "sine", osc2Wave: "sine", osc2Oct: 2, arpRate: 4, arpGate: 0.6, aD: 1, aS: 0, aR: 0.8, cutoff: 7000, envAmt: 0.1, chorusMix: 0.5, delayMix: 0.35 } },
    { id: "darkwave", name: "Darkwave", group: "Synthwave", patch: { osc1Wave: "square", osc1Oct: -1, osc2Wave: "sawtooth", arpMode: "down", arpRate: 5, cutoff: 900, res: 7 } },
    { id: "neonRain", name: "Neon Rain", group: "Sparkle", patch: { osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 1, arpMode: "random", arpOct: 3, arpGate: 0.4, cutoff: 4000, delayMix: 0.35 } },
    { id: "crystal", name: "Crystal Steps", group: "Sparkle", patch: { osc1Wave: "square", osc2Wave: "triangle", osc2Oct: 2, arpRate: 7, arpOct: 3, arpGate: 0.35, cutoff: 6000, res: 2 } },
    { id: "glimmer", name: "Slow Glimmer", group: "Sparkle", patch: { osc1Wave: "sine", osc2Wave: "triangle", osc2Oct: 1, arpMode: "random", arpRate: 4, arpGate: 0.9, aA: 0.05, aS: 0.6, aR: 0.8, revMix: 0.5 } },
    { id: "pluckCascade", name: "Pluck Cascade", group: "Sparkle", patch: { osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.3, arpMode: "updown", arpRate: 4, arpOct: 3, arpGate: 0.4, aD: 0.45, aS: 0, delayMix: 0.4, delayTime: 0.45, delayFb: 0.5 } },
    { id: "bassArp", name: "Bass Arp", group: "Driving", patch: { osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, arpOct: 1, arpGate: 0.7, cutoff: 600, res: 9, envAmt: 0.7, drive: 0.3, chorusMix: 0, delayMix: 0 } },
    { id: "acidArp", name: "Acid Arp", group: "Driving", patch: { oscMix: 0, sub: 0, cutoff: 400, res: 14, envAmt: 0.9, fD: 0.15, fS: 0.05, drive: 0.4, chorusMix: 0, delayMix: 0.15 } },
    { id: "trance", name: "Trance Gate", group: "Driving", patch: { osc2Wave: "sawtooth", unison: 5, uniDetune: 25, arpMode: "played", arpOct: 1, arpGate: 0.45, cutoff: 3500, envAmt: 0.2, aS: 0.8, revMix: 0.35 } },
    { id: "laser", name: "Laser Lines", group: "Driving", patch: { osc1Wave: "square", osc2Wave: "sawtooth", arpMode: "down", arpRate: 8, arpGate: 0.3, cutoff: 2500, res: 8, envAmt: 0.8, fD: 0.1 } },
    { id: "euroPulse", name: "Euro Pulse", group: "Driving", patch: { osc2Wave: "square", osc2Detune: 5, arpMode: "updown", arpOct: 4, cutoff: 2000 } },
    { id: "swingKeys", name: "Swing Keys", group: "Groove", patch: { osc1Wave: "triangle", osc2Wave: "sawtooth", arpSwing: 0.25, cutoff: 2800, aD: 0.4, aS: 0.2 } },
    { id: "stabs", name: "Stab Repeat", group: "Groove", patch: { osc2Wave: "sawtooth", osc2Detune: 12, arpMode: "played", arpRate: 4, arpOct: 1, arpGate: 0.25, cutoff: 1600, envAmt: 0.6, chorusMix: 0.3 } },
    { id: "initArp", name: "Init Arp", group: "Groove", patch: {} },
{ id: "berlinSchool", name: "Berlin School", group: "Driving", patch: { arpMode: "up", arpRate: 6, arpOct: 2, arpGate: 0.4, osc1Wave: "sawtooth", osc2Wave: "square", osc2Detune: 6, cutoff: 900, res: 7, envAmt: 0.6, fD: 0.15, delayMix: 0.35, delayTime: 0.45, delayFb: 0.5 } },
    { id: "randomSparks", name: "Random Sparks", group: "Sparkle", patch: { arpMode: "random", arpRate: 6, arpOct: 3, arpGate: 0.3, osc1Wave: "triangle", osc2Wave: "sine", osc2Oct: 2, oscMix: 0.35, cutoff: 5000, res: 1, aD: 0.4, delayMix: 0.45, delayFb: 0.55, revMix: 0.45 } },
    { id: "updownDream", name: "Up-Down Dream", group: "Sparkle", patch: { arpMode: "updown", arpRate: 5, arpOct: 2, arpGate: 0.6, osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 9, unison: 3, uniDetune: 15, cutoff: 2600, chorusMix: 0.55, revMix: 0.45, revSize: 4 } },
    { id: "tripletRun", name: "Triplet Run", group: "Groove", patch: { arpMode: "up", arpRate: 7, arpOct: 2, arpGate: 0.45, osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 12, cutoff: 2000, res: 5, envAmt: 0.55, delayMix: 0.2 } },
    { id: "playedSeq", name: "Played Sequence", group: "Groove", patch: { arpMode: "played", arpRate: 6, arpOct: 1, arpGate: 0.5, osc1Wave: "square", osc2Wave: "triangle", osc2Oct: 1, cutoff: 1800, res: 4, envAmt: 0.5, arpSwing: 0.15, delayMix: 0.2 } },
    { id: "pulseBassArp", name: "Pulse Bass Arp", group: "Driving", patch: { arpMode: "up", arpRate: 4, arpOct: 1, arpGate: 0.55, osc1Wave: "sawtooth", osc1Oct: -1, osc2Wave: "square", osc2Oct: -1, sub: 0.4, cutoff: 600, res: 6, envAmt: 0.6, fD: 0.15, chorusMix: 0, delayMix: 0.1, revMix: 0.08 } },
    { id: "chimeArp", name: "Chime Arp", group: "Sparkle", patch: { arpMode: "up", arpRate: 6, arpOct: 3, arpGate: 0.25, osc1Wave: "sine", osc2Wave: "sine", osc2Oct: 2, oscMix: 0.4, sub: 0, cutoff: 8000, res: 1, envAmt: 0.1, aD: 0.8, aS: 0, aR: 0.8, delayMix: 0.4, delayTime: 0.5, delayFb: 0.5, revMix: 0.5 } },
    { id: "hypno32", name: "Hypno 1/32", group: "Driving", patch: { arpMode: "updown", arpRate: 8, arpOct: 2, arpGate: 0.5, osc1Wave: "square", osc2Wave: "square", osc2Oct: 1, cutoff: 1500, res: 9, envAmt: 0.4, fD: 0.08, lfoTarget: "filter", lfoRate: 0.15, lfoDepth: 0.4 } },
    { id: "strangerLines", name: "Stranger Lines", group: "Synthwave", patch: { arpMode: "up", arpRate: 4, arpOct: 2, arpGate: 0.7, osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc2Detune: 7, cutoff: 1100, res: 5, envAmt: 0.45, fD: 0.3, chorusMix: 0.5, delayMix: 0.3, delayTime: 0.5, revMix: 0.35 } },
    { id: "neonPluckArp", name: "Neon Pluck", group: "Synthwave", patch: { arpMode: "updown", arpRate: 6, arpOct: 2, arpGate: 0.35, osc1Wave: "square", osc2Wave: "sawtooth", osc2Detune: 10, unison: 3, uniDetune: 18, cutoff: 2400, res: 3, envAmt: 0.6, fD: 0.12, chorusMix: 0.55, delayMix: 0.3, revMix: 0.35 } }
  ]
};
