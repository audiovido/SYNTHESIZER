/**
 * SY-1 UI — export the drum pattern as a MIDI file (GM drums, channel 10).
 *
 * Web app: a click saves the file; dragging the button drops the file into a DAW (Chrome / Edge).
 * Plugin: the window cannot download, so the plugin writes the file to Music/SY-1 and shows it in
 * Finder / Explorer, from where it is dragged into the DAW.
 * Shift: all patterns A–H that have notes, one after the other.
 */
import { drumPatternsMidi } from "../engine/daw";
import { DRUM_VOICES, getPattern, getPatternIndex } from "../engine/drums";
import { getMachine, getSynthPatch, getSynthPresetId } from "../engine/synth";
import { getTempo } from "../engine/tempo";

function hasNotes(i: number): boolean {
  const p = getPattern(i);
  return DRUM_VOICES.some((v) => p.steps[v].some((s) => s > 0));
}

/** The file for the current pattern (or all patterns with notes), and its name. */
export function drumMidiFile(all: boolean): { blob: Blob; name: string } {
  const m = getMachine();
  const p = getSynthPatch();
  const idx = all ? [0, 1, 2, 3, 4, 5, 6, 7].filter(hasNotes) : [getPatternIndex()];
  const pats = (idx.length ? idx : [getPatternIndex()]).map((i) => getPattern(i));
  const style = (m.styles || []).find((s) => s.id === getSynthPresetId());
  const letters = all ? "A-H" : "ABCDEFGH"[getPatternIndex()];
  const name = `${m.name} ${style ? style.name : "Pattern"} ${letters}`.replace(/[\\/:*?"<>|]+/g, "-").trim();
  const bpm = getTempo();
  const swing = typeof p.drumSwing === "number" ? p.drumSwing : 0;
  const accent = typeof p.drumAccent === "number" ? p.drumAccent : 0.5;
  return { blob: drumPatternsMidi(pats, bpm, swing, accent, name).blob, name };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function exportDrumMidi(all: boolean): void {
  const { blob, name } = drumMidiFile(all);
  const plugin = (window as any).__SY1_PLUGIN__;
  if (plugin) {
    blob.arrayBuffer().then((b) => plugin.send("saveFile", [name + ".mid", toBase64(new Uint8Array(b))]));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".mid";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// drag the button straight into the DAW (Chrome / Edge, web app)
document.addEventListener("dragstart", (e) => {
  const btn = (e.target as HTMLElement).closest?.(".drum-export");
  if (!btn || !e.dataTransfer) return;
  if ((window as any).__SY1_PLUGIN__) { e.preventDefault(); return; }
  const { blob, name } = drumMidiFile(e.shiftKey);
  const url = URL.createObjectURL(blob);
  e.dataTransfer.setData("DownloadURL", `audio/midi:${name}.mid:${url}`);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});
