/**
 * Helpers shared by the drum machines (Kerman, Bushehr, Rasht, Hormoz).
 *
 * A kit is [tune (st), decay (×), tone (0..1), level (0..1)] per slot, plus
 * optional effect/groove settings. Slots: kick snare clap ch oh tom rim bell.
 */

import { DrumPattern } from "../engine/drums";
import { DrumKitDef, DrumStyleDef, PresetDef, row, SEC, SectionDef } from "./types";

export type VoiceSet = [tune: number, decay: number, tone: number, level: number];
export type KitVoices = Partial<Record<"kick" | "snare" | "clap" | "ch" | "oh" | "tom" | "rim" | "bell", VoiceSet>>;

export function kitPatch(defaults: KitVoices, over: KitVoices = {}, fx: Record<string, number | string> = {}): Record<string, number | string> {
  const p: Record<string, number | string> = { ...fx };
  const all = { ...defaults, ...over } as Record<string, VoiceSet>;
  for (const v in all) {
    const [tune, decay, tone, level] = all[v];
    p[v + "Tune"] = tune;
    p[v + "Decay"] = decay;
    p[v + "Tone"] = tone;
    p[v + "Level"] = level;
  }
  return p;
}

export const pats = (list: DrumPattern[]): DrumPattern[] => list;

/** The page layout every drum machine shares: steps, sound, effects. */
export function drumSections(): SectionDef[] {
  return [
    { title: "PATTERN", page: "steps", custom: "drum-transport", span: 2, wide: true, controls: [] },
    { title: "SOUND", page: "sound", custom: "drum-voice", wide: true, controls: [] },
    { title: "GROOVE", page: "sound", wide: true, controls: [row([["drumSwing", "SWING"], ["drumAccent", "ACCENT"], ["drumGlue", "GLUE"], ["volume", "VOL"]])] },
    { title: "STEPS", page: "steps", custom: "drum-steps", span: 3, wide: true, controls: [] },
    SEC.driveEq("fx"),
    SEC.space("fx")
  ];
}

export const DRUM_PAGES = [
  { id: "steps", label: "Steps" },
  { id: "sound", label: "Sound" },
  { id: "fx", label: "Effects" }
];

/** Groove keys belong to the style; everything else in a preset patch is the kit's sound. */
const GROOVE_KEYS = ["drumSwing", "drumAccent"];

export function soundOf(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k in patch) if (!GROOVE_KEYS.includes(k)) out[k] = patch[k];
  return out;
}

/** A kit made from the sound of one of the machine's rhythm sources. */
export function kitFromSource(src: PresetDef[], from: string, def: Omit<DrumKitDef, "patch"> & { patch?: Record<string, unknown> }): DrumKitDef {
  const p = src.find((x) => x.id === from);
  if (!p) throw new Error(`kit source ${from} missing`);
  return { ...def, patch: { ...soundOf(p.patch), ...(def.patch || {}) } };
}

/** Styles from the rhythm sources: tempo, swing, accent and patterns; `kitOf` names each one's kit. */
export function stylesFrom(src: PresetDef[], kitOf: Record<string, string>, fallbackKit: string): DrumStyleDef[] {
  return src.map((p) => ({
    id: p.id,
    name: p.name,
    group: p.group,
    bpm: p.bpm || 110,
    patterns: p.patterns || [],
    kit: kitOf[p.id] || fallbackKit,
    swing: typeof p.patch.drumSwing === "number" ? p.patch.drumSwing : undefined,
    accent: typeof p.patch.drumAccent === "number" ? p.patch.drumAccent : undefined
  }));
}

/**
 * The machine's preset list, kept for everything that steps through presets
 * (◀ ▶, MIDI program change, tests): one preset per style, played on its own kit.
 */
export function drumPresets(kits: DrumKitDef[], styles: DrumStyleDef[]): PresetDef[] {
  return styles.map((st) => {
    const kit = kits.find((k) => k.id === st.kit) || kits[0];
    const groove: Record<string, unknown> = {};
    if (st.swing !== undefined) groove.drumSwing = st.swing;
    if (st.accent !== undefined) groove.drumAccent = st.accent;
    return { id: st.id, name: st.name, group: st.group, bpm: st.bpm, patterns: st.patterns, patch: { ...kit.patch, ...groove } };
  });
}
