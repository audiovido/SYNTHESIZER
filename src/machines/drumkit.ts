/**
 * Helpers shared by the drum machines (Kerman, Bushehr, Rasht, Hormoz).
 *
 * A kit is [tune (st), decay (×), tone (0..1), level (0..1)] per slot, plus
 * optional effect/groove settings. Slots: kick snare clap ch oh tom rim bell.
 */

import { DrumPattern } from "../engine/drums";
import { row, SEC, SectionDef } from "./types";

export type VoiceSet = [tune: number, decay: number, tone: number, level: number];
export type KitVoices = Partial<Record<"kick" | "snare" | "clap" | "ch" | "oh" | "tom" | "rim" | "bell", VoiceSet>>;

export function kitPatch(defaults: KitVoices, over: KitVoices = {}, fx: Record<string, number> = {}): Record<string, number> {
  const p: Record<string, number> = { ...fx };
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
    { title: "GROOVE", page: "sound", controls: [row([["drumSwing", "SWING"], ["drumAccent", "ACCENT"], ["volume", "VOL"]])] },
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
