/**
 * SY-1 Analog engine — AudioWorklet processor ("sy1-analog"), used by Tabriz.
 *
 * Thin wrapper: all DSP lives in src/dsp (portable to C++). This file only
 * turns port messages into engine calls, converting AudioContext times into
 * sample offsets inside the block (sample-accurate arpeggiator timing).
 *
 * Rule: no allocations inside process().
 */
import { AnalogEngine } from "../../dsp/analog-engine";

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

const QUEUE = 512;

class Ev {
  type = 0; // 1 on, 2 off, 3 kill, 4 glide
  at = 0;
  id = 0;
  midi = 60;
  cents = 0;
  vel = 1;
  from = 0;
  glide = 0;
}

class AnalogProcessor extends AudioWorkletProcessor {
  eng = new AnalogEngine(sampleRate);
  queue: Ev[] = [];
  qLen = 0;

  constructor() {
    super();
    for (let i = 0; i < QUEUE; i++) this.queue.push(new Ev());
    this.port.onmessage = (e: MessageEvent) => this.onMessage(e.data);
  }

  enqueue(type: number, m: any): void {
    if (this.qLen >= QUEUE) return;
    const e = this.queue[this.qLen++];
    e.type = type;
    e.at = Number(m.at) || 0;
    e.id = m.id | 0;
    e.midi = Number(m.midi) || 60;
    e.cents = Number(m.cents) || 0;
    e.vel = m.vel === undefined ? 1 : Number(m.vel);
    e.from = Number(m.from) || 0;
    e.glide = Number(m.glide) || 0;
  }

  onMessage(m: any): void {
    if (!m) return;
    switch (m.t) {
      case "patch":
        for (const k in m.patch) this.eng.setParam(k, m.patch[k]);
        this.eng.snapParams();
        break;
      case "param": this.eng.setParam(m.key, m.value); break;
      case "on": this.enqueue(1, m); break;
      case "off": this.enqueue(2, m); break;
      case "kill": this.enqueue(3, m); break;
      case "glide": this.enqueue(4, m); break;
      case "alloff": this.qLen = 0; this.eng.allOff(); break;
      case "bend": this.eng.setBend(Number(m.v) || 0); break;
      case "mod": this.eng.setMod(Number(m.v) || 0); break;
      default: break;
    }
  }

  handleEvents(n: number): void {
    let w = 0;
    for (let r = 0; r < this.qLen; r++) {
      const e = this.queue[r];
      let off = Math.round((e.at - currentTime) * sampleRate);
      if (off >= n) {
        if (w !== r) { const tmp = this.queue[w]; this.queue[w] = e; this.queue[r] = tmp; }
        w++;
        continue;
      }
      if (off < 0) off = 0;
      if (e.type === 1) this.eng.noteOn(e.id, e.midi, e.cents, e.vel, off, e.from, e.glide);
      else if (e.type === 2) this.eng.noteOff(e.id, off, false);
      else if (e.type === 3) this.eng.noteOff(e.id, off, true);
      else if (e.type === 4) this.eng.glideTo(e.id, e.midi, e.cents, e.glide);
    }
    this.qLen = w;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0];
    const R = out.length > 1 ? out[1] : null;
    L.fill(0);
    if (R) R.fill(0);
    this.handleEvents(L.length);
    this.eng.render(L, R, L.length);
    return true;
  }
}

registerProcessor("sy1-analog", AnalogProcessor);
