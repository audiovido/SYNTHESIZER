/**
 * SY-1 Engine — Strings engine bridge (main thread)
 *
 * Loads the "sy1-strings" AudioWorklet processor, connects it to the shared
 * FX bus and turns note/param events into port messages. Notes fall back to
 * the HQ / Classic engines until the worklet is ready.
 */

import processorUrl from "./worklet/strings-processor.ts?worker&url";
import type { SynthVoice } from "./voice";

type StringsState = "idle" | "loading" | "ready" | "failed";

let state: StringsState = "idle";
let node: AudioWorkletNode | null = null;
let nextId = 1;

export function getStringsState(): StringsState {
  return state;
}

export function useStrings(): boolean {
  return state === "ready";
}

export function initStrings(ctx: AudioContext, busInput: AudioNode, getPatch: () => Record<string, unknown>): void {
  if (state !== "idle") return;
  if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
    state = "failed";
    return;
  }
  state = "loading";
  ctx.audioWorklet
    .addModule(processorUrl)
    .then(() => {
      node = new AudioWorkletNode(ctx, "sy1-strings", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      node.connect(busInput);
      node.port.postMessage({ t: "patch", patch: { ...getPatch() } });
      state = "ready";
    })
    .catch(() => {
      state = "failed";
    });
}

export function stringsPost(msg: Record<string, unknown>): void {
  if (node) node.port.postMessage(msg);
}

export function createStringsVoice(
  midi: number,
  cents: number,
  velocity: number,
  at = 0,
  fromHz = 0,
  glide = 0
): SynthVoice {
  const id = nextId++;
  stringsPost({ t: "on", id, midi, cents, vel: velocity, at, from: fromHz, glide });
  let released = false;
  const voice: SynthVoice = {
    freq: 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200),
    isReleased() {
      return released;
    },
    kill() {
      if (released) return;
      released = true;
      stringsPost({ t: "kill", id });
    },
    release(t?: number, fastTau?: number) {
      if (released) return;
      released = true;
      stringsPost({ t: fastTau ? "kill" : "off", id, at: t || 0 });
    },
    retune(freqHz: number, glideT: number, t: number) {
      const m = 69 + 12 * Math.log2(freqHz / 440);
      const base = Math.round(m);
      stringsPost({ t: "glide", id, midi: base, cents: (m - base) * 100, glide: glideT, at: t });
      voice.freq = freqHz;
    },
    update() {
      // Strings worklet receives parameter changes globally (see setSynthParam)
    }
  };
  return voice;
}
