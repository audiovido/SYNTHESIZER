/**
 * SY-1 Engine — FM engine bridge (main thread) for Kashan.
 *
 * Loads the "sy1-fm" AudioWorklet processor, connects it to the shared FX bus
 * and turns note/param events into port messages. Notes fall back to the
 * HQ / Classic engines until the worklet is ready.
 */

import processorUrl from "./worklet/fm-processor.ts?worker&url";
import type { SynthVoice } from "./voice";

type FmState = "idle" | "loading" | "ready" | "failed";

let state: FmState = "idle";
let node: AudioWorkletNode | null = null;
let nextId = 1;

export function useFm(): boolean {
  return state === "ready";
}

export function initFm(ctx: AudioContext, busInput: AudioNode, getPatch: () => Record<string, unknown>): void {
  if (state !== "idle") return;
  if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
    state = "failed";
    return;
  }
  state = "loading";
  ctx.audioWorklet
    .addModule(processorUrl)
    .then(() => {
      node = new AudioWorkletNode(ctx, "sy1-fm", {
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

export function fmPost(msg: Record<string, unknown>): void {
  if (node) node.port.postMessage(msg);
}

export function createFmVoice(midi: number, cents: number, velocity: number, at = 0, fromHz = 0, glide = 0): SynthVoice {
  const id = nextId++;
  fmPost({ t: "on", id, midi, cents, vel: velocity, at, from: fromHz, glide });
  let released = false;
  const voice: SynthVoice = {
    freq: 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200),
    isReleased() {
      return released;
    },
    kill() {
      if (released) return;
      released = true;
      fmPost({ t: "kill", id });
    },
    release(t?: number, fastTau?: number) {
      if (released) return;
      released = true;
      fmPost({ t: fastTau ? "kill" : "off", id, at: t || 0 });
    },
    retune(freqHz: number, glideT: number, t: number) {
      const m = 69 + 12 * Math.log2(freqHz / 440);
      const base = Math.round(m);
      fmPost({ t: "glide", id, midi: base, cents: (m - base) * 100, glide: glideT, at: t });
      voice.freq = freqHz;
    },
    update() {
      // FM worklet receives parameter changes globally (see setSynthParam)
    }
  };
  return voice;
}
