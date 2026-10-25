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
  /** Legato: move this voice to a new pitch (Hz) over glide seconds, at time t. */
  retune?(freqHz: number, glide: number, t: number): void;
}

export const activeSynthVoices = new Set<SynthVoice>();
export const SYNTH_MAX_VOICES = 10;

const WAVE_MAP: Record<string, OscillatorType> = {
  sawtooth: "sawtooth",
  square: "square",
  triangle: "triangle",
  sine: "sine"
};

let currentPitchBend = 0; // -1 to +1
let currentModWheel = 0;  // 0 to 1

export function getVoicePitchBend(): number {
  return currentPitchBend;
}

export function setVoicePitchBend(norm: number): void {
  currentPitchBend = Math.max(-1, Math.min(1, norm));
  activeSynthVoices.forEach((vc) => vc.update("pitchBend"));
}

export function getVoiceModWheel(): number {
  return currentModWheel;
}

export function setVoiceModWheel(norm: number): void {
  currentModWheel = Math.max(0, Math.min(1, norm));
  activeSynthVoices.forEach((vc) => vc.update("modWheel"));
}

export function createSynthVoice(
  ctx: AudioContext,
  freq: number,
  when: number,
  synthPatch: SynthPatch,
  velocity = 1,
  fromHz = 0,
  glide = 0
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
  filter.type = p.filterType === "lp24" ? "lowpass" : p.filterType;
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
    if (fromHz > 0 && glide > 0.004) {
      o.frequency.setValueAtTime(fromHz * Math.pow(2, octave), when);
      o.frequency.setTargetAtTime(freq * Math.pow(2, octave), when, glide / 3);
    } else {
      o.frequency.setValueAtTime(freq * Math.pow(2, octave), when);
    }
    o.detune.setValueAtTime(detune, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, when);
    o.connect(g);
    g.connect(mix);
    srcs.push(o);
    return { o, g };
  };

  const bendCents = currentPitchBend * (p.bendRange ?? 2) * 100;
  const o1 = osc(p.osc1Wave, p.osc1Oct, bendCents, 1 - p.oscMix);
  const o2 = osc(p.osc2Wave, p.osc2Oct, p.osc2Detune + bendCents, p.oscMix);
  const s1 = osc("sine", p.osc1Oct - 1, bendCents, p.sub * 0.8);

  // Always create noise source and noiseGain per voice (initial gain 0 when p.noise is 0).
  const noiseBuf = getSharedNoiseBuffer(ctx);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  n.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(p.noise * 0.5, when);
  n.connect(noiseGain);
  noiseGain.connect(mix);
  srcs.push(n);

  // amp envelope with velocity sensitivity
  const vel = Math.max(0, Math.min(1, velocity));
  const velSens = p.velSens ?? 0.6;
  const peak = 0.42 * (1 - velSens + velSens * vel);
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
  const LFO_TYPES: Record<string, OscillatorType> = { sine: "sine", triangle: "triangle", square: "square", sawtooth: "sawtooth", sh: "square" };
  lfo.type = LFO_TYPES[p.lfoShape] || "sine";
  lfo.frequency.setValueAtTime(p.lfoRate, when);
  const lfoGain = ctx.createGain();
  lfo.connect(lfoGain);

  const applyLfoRouting = () => {
    try { lfoGain.disconnect(); } catch (e) {}
    const d = Math.min(1, synthPatch.lfoDepth + currentModWheel);
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
    retune(freqHz, glideT, at) {
      const t0 = Math.max(ctx.currentTime, at);
      const tau = Math.max(0.002, glideT / 3);
      const q = synthPatch;
      o1.o.frequency.setTargetAtTime(freqHz * Math.pow(2, q.osc1Oct), t0, tau);
      o2.o.frequency.setTargetAtTime(freqHz * Math.pow(2, q.osc2Oct), t0, tau);
      s1.o.frequency.setTargetAtTime(freqHz * Math.pow(2, q.osc1Oct - 1), t0, tau);
      voice.freq = freqHz;
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
        filter.type = q.filterType === "lp24" ? "lowpass" : q.filterType;
      } else if (key === "oscMix") {
        o1.g.gain.setTargetAtTime(1 - q.oscMix, now, 0.02);
        o2.g.gain.setTargetAtTime(q.oscMix, now, 0.02);
      } else if (key === "sub") {
        s1.g.gain.setTargetAtTime(q.sub * 0.8, now, 0.02);
      } else if (key === "noise") {
        noiseGain.gain.setTargetAtTime(q.noise * 0.5, now, 0.02);
      } else if (key === "osc2Detune" || key === "bendRange" || key === "pitchBend") {
        const tau = key === "pitchBend" ? 0.005 : 0.02;
        const bc = currentPitchBend * (q.bendRange ?? 2) * 100;
        o1.o.detune.setTargetAtTime(bc, now, tau);
        o2.o.detune.setTargetAtTime(q.osc2Detune + bc, now, tau);
        s1.o.detune.setTargetAtTime(bc, now, tau);
      } else if (key === "osc1Wave") {
        o1.o.type = WAVE_MAP[q.osc1Wave] || "sawtooth";
      } else if (key === "osc2Wave") {
        o2.o.type = WAVE_MAP[q.osc2Wave] || "square";
      } else if (key === "osc1Oct") {
        o1.o.frequency.setTargetAtTime(freq * Math.pow(2, q.osc1Oct), now, 0.01);
        s1.o.frequency.setTargetAtTime(freq * Math.pow(2, q.osc1Oct - 1), now, 0.01);
      } else if (key === "osc2Oct") {
        o2.o.frequency.setTargetAtTime(freq * Math.pow(2, q.osc2Oct), now, 0.01);
      } else if ((key === "aS" || key === "velSens") && !released) {
        const curVelSens = q.velSens ?? 0.6;
        const curPeak = 0.42 * (1 - curVelSens + curVelSens * vel);
        amp.gain.setTargetAtTime(Math.max(0.0001, curPeak * q.aS), now, 0.03);
      } else if (key === "lfoShape") {
        lfo.type = LFO_TYPES[q.lfoShape] || "sine";
      } else if (key === "lfoRate") {
        lfo.frequency.setTargetAtTime(q.lfoRate, now, 0.02);
      } else if (key === "lfoDepth" || key === "lfoTarget" || key === "modWheel") {
        applyLfoRouting();
      }
    }
  };

  activeSynthVoices.add(voice);
  return voice;
}
