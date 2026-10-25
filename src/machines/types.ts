/**
 * SY-1 Machines — shared types and control option sets.
 *
 * A machine is an instrument "personality": its own panel (sections and
 * pages), skin, and preset bank, on top of the shared engines. The panel is
 * rendered from this data, so a new machine is one new file in src/machines.
 */

export type ChoiceOption = [value: string, text: string, title?: string];

export interface ChoiceDef {
  kind: "choice";
  key: string;
  options: ChoiceOption[];
}

/** Independent on/off buttons in one row (each bound to its own param). */
export interface TogglesDef {
  kind: "toggles";
  items: { key: string; label: string; on?: string; off?: string; title?: string }[];
}

export interface SelectDef {
  kind: "select";
  key: string;
  label: string;
  options: ChoiceOption[];
}

export interface RowDef {
  kind: "row";
  knobs: [key: string, label: string][];
  small?: boolean;
  caption?: string;
}

export type ControlDef = ChoiceDef | TogglesDef | SelectDef | RowDef;

export interface SectionDef {
  title: string;
  page: string;
  controls: ControlDef[];
  /** Custom renderer id for non-knob sections (drum machine). */
  custom?: string;
  /** Columns this section spans on large screens (default 1). */
  span?: number;
  /** Takes the full width on phones (wide content: 4+ knobs, step grids). */
  wide?: boolean;
}

export interface PresetDef {
  id: string;
  name: string;
  group: string;
  patch: Record<string, unknown>;
  /** Drum kits: suggested tempo and the patterns loaded with the kit. */
  bpm?: number;
  patterns?: import("../engine/drums").DrumPattern[];
}

export interface MachineDef {
  id: string;
  name: string;
  role: string;
  skin: string;
  kind: "synth" | "drums";
  /** Shows the tempo control (arpeggiator, synced LFO, sequencer). */
  tempo?: boolean;
  pages: { id: string; label: string }[];
  sections: SectionDef[];
  /** Overrides shared by every preset of this machine. */
  base: Record<string, unknown>;
  presets: PresetDef[];
}

// ---- reusable control helpers ----
export const WAVE_OPTS: ChoiceOption[] = [
  ["sawtooth", "⩘", "Saw"],
  ["square", "⊓", "Square"],
  ["triangle", "△", "Triangle"],
  ["sine", "∿", "Sine"]
];
export const FILTER_OPTS: ChoiceOption[] = [
  ["lowpass", "LP", "Low-pass 12 dB"],
  ["lp24", "24", "Low-pass 24 dB (HQ engine)"],
  ["bandpass", "BP", "Band-pass"],
  ["highpass", "HP", "High-pass"]
];
export const LFO_TARGET_OPTS: ChoiceOption[] = [
  ["pitch", "PITCH"],
  ["filter", "FILTER"],
  ["amp", "AMP"]
];
export const LFO_SHAPE_OPTS: ChoiceOption[] = [
  ["sine", "∿", "Sine"],
  ["triangle", "△", "Triangle"],
  ["square", "⊓", "Square"],
  ["sawtooth", "⩗", "Saw down"],
  ["sh", "S&H", "Sample and hold"]
];
export const ARP_MODE_OPTS: ChoiceOption[] = [
  ["up", "UP", "Up"],
  ["down", "DN", "Down"],
  ["updown", "U/D", "Up and down"],
  ["random", "RND", "Random"],
  ["played", "PLAY", "As played"]
];
export const TUNING_OPTS: ChoiceOption[] = [
  ["12tet", "Equal"],
  ["shur", "Shur"],
  ["homayoun", "Homayoun"],
  ["chahargah", "Chahargah"],
  ["segah", "Segah"],
  ["bayati", "Bayati"],
  ["rast", "Rast"],
  ["hijaz", "Hijaz"]
];

export const choice = (key: string, options: ChoiceOption[]): ChoiceDef => ({ kind: "choice", key, options });
export const row = (knobs: [string, string][], opts: { small?: boolean; caption?: string } = {}): RowDef => ({
  kind: "row",
  knobs,
  ...opts
});
export const toggles = (items: TogglesDef["items"]): TogglesDef => ({ kind: "toggles", items });
export const select = (key: string, label: string, options: ChoiceOption[]): SelectDef => ({ kind: "select", key, label, options });

// ---- reusable sections ----
export const SEC = {
  osc1: (page: string, title = "OSC 1"): SectionDef => ({
    title, page,
    controls: [choice("osc1Wave", WAVE_OPTS), row([["osc1Oct", "OCT"], ["sub", "SUB"], ["noise", "NOISE"]])]
  }),
  osc2: (page: string, unison = true, title = "OSC 2"): SectionDef => ({
    title, page,
    controls: [
      choice("osc2Wave", WAVE_OPTS),
      row([["osc2Oct", "OCT"], ["osc2Detune", "DETUNE"], ["oscMix", "MIX"]]),
      ...(unison ? [row([["unison", "VOICES"], ["uniDetune", "SPREAD"], ["uniWidth", "WIDTH"]], { small: true, caption: "UNISON" })] : [])
    ]
  }),
  filter: (page: string): SectionDef => ({
    title: "FILTER", page,
    controls: [
      choice("filterType", FILTER_OPTS),
      row([["cutoff", "CUTOFF"], ["res", "RESO"], ["envAmt", "ENV"]]),
      row([["fA", "A"], ["fD", "D"], ["fS", "S"]], { small: true })
    ]
  }),
  amp: (page: string, hold = false): SectionDef => ({
    title: "AMP ENV", page,
    controls: [
      ...(hold ? [toggles([{ key: "hold", label: "HOLD", title: "Notes keep sounding after you let go" }])] : []),
      row([["aA", "ATTACK"], ["aD", "DECAY"], ["velSens", "VEL"]]),
      row([["aS", "SUSTAIN"], ["aR", "RELEASE"]])
    ]
  }),
  lfo: (page: string, title = "LFO", shape = false, sync = false): SectionDef => ({
    title, page,
    controls: [
      choice("lfoTarget", LFO_TARGET_OPTS),
      ...(shape ? [choice("lfoShape", LFO_SHAPE_OPTS)] : []),
      row(sync ? [["lfoSync", "SYNC"], ["lfoRate", "RATE"], ["lfoDepth", "DEPTH"]] : [["lfoRate", "RATE"], ["lfoDepth", "DEPTH"], ["bendRange", "BEND"]])
    ]
  }),
  voice: (page: string): SectionDef => ({
    title: "VOICE", page,
    controls: [
      toggles([
        { key: "polyMode", label: "MONO", on: "mono", off: "poly", title: "One note at a time" },
        { key: "legato", label: "LEGATO", title: "Glide between held notes without restarting the envelope" }
      ]),
      row([["glide", "GLIDE"], ["bendRange", "BEND"], ["velSens", "VEL"]])
    ]
  }),
  driveEq: (page: string): SectionDef => ({
    title: "DRIVE · EQ", page,
    controls: [row([["drive", "DRIVE"], ["eqLow", "LOW"]]), row([["eqMid", "MID"], ["eqHigh", "HIGH"]])]
  }),
  delay: (page: string): SectionDef => ({
    title: "DELAY", page,
    controls: [row([["delayTime", "TIME"], ["delayFb", "FDBK"], ["delayMix", "MIX"]])]
  }),
  reverbOut: (page: string): SectionDef => ({
    title: "REVERB · OUT", page,
    controls: [row([["revSize", "SIZE"], ["revMix", "MIX"], ["volume", "VOL"]])]
  }),
  space: (page: string): SectionDef => ({
    title: "SPACE", page,
    controls: [
      row([["delayTime", "TIME"], ["delayFb", "FDBK"], ["delayMix", "DELAY"]]),
      row([["revSize", "SIZE"], ["revMix", "REVERB"], ["volume", "VOL"]])
    ]
  }),
  chorus: (page: string): SectionDef => ({
    title: "CHORUS", page,
    controls: [row([["chorusMix", "MIX"], ["chorusRate", "RATE"], ["chorusDepth", "DEPTH"]])]
  })
};
