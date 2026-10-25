/**
 * SY-1 Engine — Voice Synthesis & Voice Management
 */

import { getSharedNoiseBuffer, getSynthBus } from "./bus";
import { SynthPatch } from "./params";

export interface SynthVoice {
  freq: number;
  isReleased(): boolean;
  kill(): void;
  release(t: number, fastTau?: number): void;
  update(key: string): void;
}

export const activeSynthVoices = new Set<SynthVoice>();
export const SYNTH_MAX_VOICES = 10;

const WAVE_MAP: Record<string, OscillatorType> = {
  sawtooth: "sawtooth",
  square: "square",
  triangle: "triangle",
  sine: "sine"
};

export function createSynthVoice(
  ctx: AudioContext,
  freq: number,
  when: number,
  synthPatch: SynthPatch
): SynthVoice {
  const p = synthPatch;
  const bus = getSynthBus(ctx, synthPatch);

  // Voice stealing keeps weak phones from overloading
  const sounding = Array.from(activeSynthVoices).filter((v) => !v.isReleased());
  if (sounding.length >= SYNTH_MAX_VOICES) {
    sounding[0].release(ctx.currentTime, 0.02);
  }
  const all = Array.from(activeSynthVoices);
  if (all.length >= SYNTH_MAX_VOICES + 6) {
    all[0].kill();
  }

  const out = ctx.createGain();          // release stage
  out.gain.setValueAtTime(1, when);
  const amp = ctx.createGain();          // amp ADSR
  const trem = ctx.createGain();         // LFO amp target
  trem.gain.setValueAtTime(1, when);
  const filter = ctx.createBiquadFilter();
  filter.type = p.filterType;
  filter.Q.setValueAtTime(p.res, when);
  const mix = ctx.createGain();
  mix.gain.setValueAtTime(0.5, when);

  mix.connect(filter);
  filter.connect(amp);
  amp.connect(trem);
  trem.connect(out);
  out.connect(bus.input);

  const srcs: (OscillatorNode | AudioBufferSourceNode)[] = [];
  const osc = (wave: string, octave: number, detune: number, level: number) => {
    const o = ctx.createOscillator();
    o.type = WAVE_MAP[wave] || "sawtooth";
    o.frequency.setValueAtTime(freq * Math.pow(2, octave), when);
    o.detune.setValueAtTime(detune, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, when);
    o.connect(g);
    g.connect(mix);
    srcs.push(o);
    return { o, g };
  };

  const o1 = osc(p.osc1Wave, p.osc1Oct, 0, 1 - p.oscMix);
  const o2 = osc(p.osc2Wave, p.osc2Oct, p.osc2Detune, p.oscMix);
  const s1 = osc("sine", p.osc1Oct - 1, 0, p.sub * 0.8);

  // BUG FIX 2a: Always create noise source and noiseGain per voice (initial gain 0 when p.noise is 0).
  // This allows live NOISE knob updates on notes that started when noise was 0.
  const noiseBuf = getSharedNoiseBuffer(ctx);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  n.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(p.noise * 0.5, when);
  n.connect(noiseGain);
  noiseGain.connect(mix);
  srcs.push(n);

  // amp envelope
  const peak = 0.42;
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(peak, when + p.aA);
  amp.gain.setTargetAtTime(Math.max(0.0001, peak * p.aS), when + p.aA, Math.max(0.005, p.aD / 3));

  // filter envelope (on top of the cutoff)
  const base = p.cutoff;
  const top = Math.min(20000, base * Math.pow(2, p.envAmt * 6));
  const sus = base + (top - base) * p.fS;
  filter.frequency.setValueAtTime(base, when);
  filter.frequency.linearRampToValueAtTime(top, when + p.fA);
  filter.frequency.setTargetAtTime(sus, when + p.fA, Math.max(0.005, p.fD / 3));

  // LFO
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(p.lfoRate, when);
  const lfoGain = ctx.createGain();
  lfo.connect(lfoGain);

  const applyLfoRouting = () => {
    try { lfoGain.disconnect(); } catch (e) {}
    const d = synthPatch.lfoDepth;
    if (synthPatch.lfoTarget === "filter") {
      lfoGain.gain.setValueAtTime(d * 2400, ctx.currentTime);
      lfoGain.connect(filter.detune);
    } else if (synthPatch.lfoTarget === "amp") {
      lfoGain.gain.setValueAtTime(d * 0.5, ctx.currentTime);
      lfoGain.connect(trem.gain);
    } else {
      lfoGain.gain.setValueAtTime(d * 60, ctx.currentTime);
      [o1.o, o2.o, s1.o].forEach((o) => lfoGain.connect(o.detune));
    }
  };

  lfoGain.gain.setValueAtTime(0, when);
  applyLfoRouting();
  srcs.push(lfo);

  srcs.forEach((s) => s.start(when));

  let released = false;
  const voice: SynthVoice = {
    freq,
    isReleased() {
      return released;
    },
    kill() {
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0.0001, now, 0.005);
      srcs.forEach((s) => {
        try { s.stop(now + 0.05); } catch (e) {}
      });
      released = true;
      activeSynthVoices.delete(voice);
    },
    release(t, fastTau) {
      if (released) return;
      released = true;
      const at = Math.max(ctx.currentTime, t);
      const tau = fastTau || Math.max(0.005, synthPatch.aR / 4);
      out.gain.setTargetAtTime(0.0001, at, tau);
      const stopAt = at + tau * 8 + 0.05;
      srcs.forEach((s) => {
        try { s.stop(stopAt); } catch (e) {}
      });
      setTimeout(() => activeSynthVoices.delete(voice), Math.max(0, (stopAt - ctx.currentTime) * 1000) + 50);
    },
    update(key) {
      const now = ctx.currentTime;
      const q = synthPatch;
      if (key === "cutoff" || key === "envAmt" || key === "fS") {
        const b = q.cutoff;
        const tp = Math.min(20000, b * Math.pow(2, q.envAmt * 6));
        filter.frequency.cancelScheduledValues(now);
        filter.frequency.setTargetAtTime(b + (tp - b) * q.fS, now, 0.02);
      } else if (key === "res") {
        filter.Q.setTargetAtTime(q.res, now, 0.02);
      } else if (key === "filterType") {
        filter.type = q.filterType;
      } else if (key === "oscMix") {
        o1.g.gain.setTargetAtTime(1 - q.oscMix, now, 0.02);
        o2.g.gain.setTargetAtTime(q.oscMix, now, 0.02);
      } else if (key === "sub") {
        s1.g.gain.setTargetAtTime(q.sub * 0.8, now, 0.02);
      } else if (key === "noise") {
        noiseGain.gain.setTargetAtTime(q.noise * 0.5, now, 0.02);
      } else if (key === "osc2Detune") {
        o2.o.detune.setTargetAtTime(q.osc2Detune, now, 0.02);
      } else if (key === "osc1Wave") {
        o1.o.type = WAVE_MAP[q.osc1Wave] || "sawtooth";
      } else if (key === "osc2Wave") {
        o2.o.type = WAVE_MAP[q.osc2Wave] || "square";
      } else if (key === "osc1Oct") {
        o1.o.frequency.setTargetAtTime(freq * Math.pow(2, q.osc1Oct), now, 0.01);
        s1.o.frequency.setTargetAtTime(freq * Math.pow(2, q.osc1Oct - 1), now, 0.01);
      } else if (key === "osc2Oct") {
        o2.o.frequency.setTargetAtTime(freq * Math.pow(2, q.osc2Oct), now, 0.01);
      } else if (key === "aS" && !released) {
        amp.gain.setTargetAtTime(Math.max(0.0001, peak * q.aS), now, 0.03);
      } else if (key === "lfoRate") {
        lfo.frequency.setTargetAtTime(q.lfoRate, now, 0.02);
      } else if (key === "lfoDepth" || key === "lfoTarget") {
        applyLfoRouting();
      }
    }
  };

  activeSynthVoices.add(voice);
  return voice;
}
