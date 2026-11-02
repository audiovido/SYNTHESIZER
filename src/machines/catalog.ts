import type { MachineArt } from "./types";

/**
 * The instrument browser's catalogue: a short introduction, highlights and
 * the colours / front-panel layout of the card picture for every machine.
 * (Sound counts are added automatically.)
 */
export const CATALOG: Record<string, { blurb: string; tags: string[]; art: MachineArt }> = {
  sy1: {
    blurb: "The flagship all-rounder: two oscillators with sub and noise, a 24 dB filter with an analog ladder, arpeggiator and a full effects rack. Pads, leads, bass and keys: start here.",
    tags: ["Subtractive", "Ladder filter", "Arpeggiator"],
    art: { body: "#1c1d20", panel: "#2b2c31", accent: "#ffa62b", accent2: "#e07f12", ink: "#efece6", face: "keys" }
  },
  yazd: {
    blurb: "Slow, wide and glassy pads with lush chorus and long reverb. Atmospheres, intros and ambient beds.",
    tags: ["Pads", "Chorus", "Ambient"],
    art: { body: "#3a2f45", panel: "#eee0f2", accent: "#e06cb8", accent2: "#7ccfc0", ink: "#1d1626", face: "pad" }
  },
  tabriz: {
    blurb: "A modelled analog monosynth: transistor ladder filter, drive and oscillator drift. Fat basses and singing leads.",
    tags: ["Analog model", "Mono", "Ladder"],
    art: { body: "#0c0b0a", panel: "#24211d", accent: "#f08a3c", accent2: "#d66c1e", ink: "#f2e9d8", face: "lead" }
  },
  baku: {
    blurb: "Built around the arpeggiator: tempo-synced patterns, synthwave sequences and sparkling motion.",
    tags: ["Arpeggiator", "Synthwave", "Tempo sync"],
    art: { body: "#06030c", panel: "#14062a", accent: "#ff007f", accent2: "#00f0ff", ink: "#ffffff", face: "arp" }
  },
  merv: {
    blurb: "Tempo-synced wobbles, growls and deep sub basses. Dubstep, drum & bass and bass music.",
    tags: ["Wobble LFO", "Sub bass", "Drive"],
    art: { body: "#06080b", panel: "#1e222a", accent: "#ffe600", accent2: "#00e5ff", ink: "#ffffff", face: "bass" }
  },
  isfahan: {
    blurb: "Ney, kamancheh-like and vocal leads in dastgah scales with quarter tones, glide, scoop and tahrir ornaments.",
    tags: ["Dastgah scales", "Quarter tones", "Tahrir"],
    art: { body: "#0c0d12", panel: "#16307a", accent: "#e5c168", accent2: "#c49735", ink: "#fbf3df", face: "lead" }
  },
  shiraz: {
    blurb: "Physically modelled strings: santur, setar, tar, kanun, oud and harp, hammered or plucked, in Persian tunings.",
    tags: ["Physical model", "Santur", "Persian scales"],
    art: { body: "#160e08", panel: "#6e4626", accent: "#f0b23a", accent2: "#c9861e", ink: "#f8eed8", face: "strings" }
  },
  kashan: {
    blurb: "Digital FM with 8 algorithms: electric pianos, bells, mallets and glassy 80s keys.",
    tags: ["FM", "Electric piano", "Bells"],
    art: { body: "#5d5952", panel: "#e5e0d4", accent: "#0d968d", accent2: "#c9185b", ink: "#1e1d1a", face: "fm" }
  },
  konya: {
    blurb: "Three Euclidean rings generate hypnotic, ever-turning note patterns. Polyrhythms, dervish loops and generative arps.",
    tags: ["Euclidean", "Polyrhythm", "Generative"],
    art: { body: "#1e1f24", panel: "#ece7dc", accent: "#f7c815", accent2: "#d62828", ink: "#141414", face: "rings" }
  },
  nishapur: {
    blurb: "Four sound sources on an XY pad: move, orbit or draw a path to morph between them. Evolving pads and motion.",
    tags: ["Vector XY", "Orbit", "Morph"],
    art: { body: "#0c0f17", panel: "#283144", accent: "#38f2ff", accent2: "#9b64ff", ink: "#f0f6ff", face: "vector" }
  },
  bam: {
    blurb: "Long drones, noise textures and slow-moving soundscapes. Film, ambient and meditation.",
    tags: ["Drone", "Texture", "Hold"],
    art: { body: "#1c1e17", panel: "#2c2e22", accent: "#5eff6b", accent2: "#2dc93b", ink: "#eee8d5", face: "drone" }
  },
  kerman: {
    blurb: "The classic rhythm machines rebuilt: 808, 909, 707, 606, CR-78 and an 80s sampler, plus trap, lo-fi and dub kits. House, techno, hip-hop, electro, synth-pop.",
    tags: ["808 · 909 · 707", "Electronic"],
    art: { body: "#8a8882", panel: "#d7d5cc", accent: "#ea4c15", accent2: "#f2b21a", ink: "#161614", face: "steps" }
  },
  rasht: {
    blurb: "A modelled acoustic drum kit with sticks or brushes: studio, 70s funk, rock, 60s jazz, Latin, lo-fi and hybrid 808 kits.",
    tags: ["Acoustic", "Jazz · Funk · Latin"],
    art: { body: "#363635", panel: "#213e2d", accent: "#eab84b", accent2: "#c79024", ink: "#f0e6cc", face: "kit" }
  },
  bushehr: {
    blurb: "Tombak, daf, dohol, dayereh, zang and senj built from real skin physics. Persian, bandari, Kurdish, Arabic, Sufi and fusion.",
    tags: ["Persian", "Frame drums"],
    art: { body: "#051c22", panel: "#0b3540", accent: "#d94326", accent2: "#deb462", ink: "#f7ebd4", face: "frame" }
  },
  hormoz: {
    blurb: "Round minimal kicks, snaps, shaker, congas, clave and a tunable kalimba. Minimal, lo-fi, chill, ambient and Afro / Latin percussion.",
    tags: ["Minimal", "Percussion", "Chill"],
    art: { body: "#1e1615", panel: "#2b1e1c", accent: "#ff6e3b", accent2: "#f5a638", ink: "#f5ece8", face: "perc" }
  }
};
