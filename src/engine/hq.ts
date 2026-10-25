/**
 * SY-1 Engine — HQ engine bridge (main thread)
 *
 * Loads the AudioWorklet processor, connects it to the shared FX bus and
 * turns note/param events into small port messages. Notes fall back to the
 * Classic engine until HQ is ready, or if this browser cannot run it, so the
 * first tap always makes sound.
 */

import processorUrl from "./worklet/sy1-processor.ts?worker&url";
import type { SynthVoice } from "./voice";

export type EngineId = "hq" | "classic";
type HQState = "idle" | "loading" | "ready" | "failed";

const STORAGE_KEY = "sy1_engine";

let engine: EngineId = "hq";
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "hq" || saved === "classic") engine = saved;
} catch (e) {}

let state: HQState = "idle";
let node: AudioWorkletNode | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function onEngineChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getEngine(): EngineId {
  return engine;
}

export function setEngine(id: EngineId): void {
  engine = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (e) {}
  notify();
}

export function getHQState(): HQState {
  return state;
}

/** True when new notes should be played by the HQ engine. */
export function useHQ(): boolean {
  return engine === "hq" && state === "ready";
}

/** Start loading the worklet (once). Safe to call on every gesture. */
export function initHQ(ctx: AudioContext, busInput: AudioNode, getPatch: () => Record<string, unknown>): void {
  if (state !== "idle") return;
  if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
    state = "failed";
    notify();
    return;
  }
  state = "loading";
  ctx.audioWorklet
    .addModule(processorUrl)
    .then(() => {
      node = new AudioWorkletNode(ctx, "sy1-voices", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      node.connect(busInput);
      node.port.postMessage({ t: "patch", patch: { ...getPatch() } });
      state = "ready";
      notify();
    })
    .catch(() => {
      state = "failed";
      notify();
    });
}

export function hqPost(msg: Record<string, unknown>): void {
  if (node) node.port.postMessage(msg);
}

/** A handle with the same shape as a Classic voice, so note logic stays shared. */
export function createHQVoice(midi: number, velocity: number): SynthVoice {
  const id = nextId++;
  hqPost({ t: "on", id, midi, vel: velocity });
  let released = false;
  return {
    freq: 440 * Math.pow(2, (midi - 69) / 12),
    isReleased() {
      return released;
    },
    kill() {
      if (released) return;
      released = true;
      hqPost({ t: "kill", id });
    },
    release() {
      if (released) return;
      released = true;
      hqPost({ t: "off", id });
    },
    update() {
      // HQ receives parameter changes globally (see setSynthParam)
    }
  };
}
