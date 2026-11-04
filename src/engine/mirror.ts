/**
 * SY-1 Engine — call mirroring for the plugin.
 *
 * Inside the AU/VST3 plugin the sound comes from the plugin's own engine (the same
 * code, run natively), and the window shows this app. Every top-level engine call
 * the UI makes (a knob, a key, a preset...) is sent to the plugin's engine, so both
 * run the same inputs and stay in step; calls made inside other engine calls are
 * not sent (the other side makes them itself). Without a sink (the web app) this
 * does nothing.
 */
type Sink = (name: string, args: unknown[]) => void;
let sink: Sink | null = null;
let depth = 0;

export function setMirrorSink(fn: Sink | null): void {
  sink = fn;
}

/** Run fn without sending its calls (used for calls that arrived from the other side). */
export function runUnmirrored(fn: () => void): void {
  depth++;
  try { fn(); } finally { depth--; }
}

export function mirrorCall<A extends unknown[], R>(name: string, fn: (...a: A) => R, args: A): R {
  if (sink && depth === 0) {
    try { sink(name, args); } catch (e) {}
  }
  depth++;
  try {
    return fn(...args);
  } finally {
    depth--;
  }
}
