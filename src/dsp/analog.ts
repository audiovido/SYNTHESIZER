/**
 * SY-1 DSP — Analog voice building blocks (Tabriz "analog" engine).
 *
 * PORTABILITY RULE: this file has no Web Audio, DOM or worklet dependencies.
 * Plain numbers and typed arrays only, no allocation after construction, so it
 * translates line by line to C++ for the native (iOS/Android) engine. The web
 * worklet (src/engine/worklet/analog-processor.ts) is a thin wrapper around it.
 *
 * Contents:
 *  - fastTanh: rational tanh approximation (saturation everywhere)
 *  - PolyBLEP oscillators: saw, reverse saw, square, triangle, sine
 *  - Ladder: 4-pole transistor-ladder low-pass (Huovilainen nonlinear model),
 *    run at 2x oversampling, with tuning and resonance compensation, real
 *    self-oscillation, and multimode taps (LP24, LP12, BP12, HP24)
 *  - AnalogEnv: RC-style envelope (attack overshoots toward 1.3 and stops at 1,
 *    exponential decay and release), used for both amp and filter contours
 */

export const PEAK = 0.42; // per-voice peak level (same as the SY-1 spec)

export const WAVE_ID: Record<string, number> = { sawtooth: 0, square: 1, triangle: 2, sine: 3, revsaw: 4 };
export const LADDER_MODE: Record<string, number> = { lp24: 0, lowpass: 1, bandpass: 2, highpass: 3 };

/** tanh approximation, exact at 0, saturates to +-1 beyond |x| = 3. */
export function fastTanh(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** PolyBLEP residual for a discontinuity at phase 0 (t = phase 0..1, dt = phase step). */
export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** One band-limited oscillator sample. ph = phase 0..1, dt = freq / sampleRate. */
export function oscSample(wave: number, ph: number, dt: number): number {
  switch (wave) {
    case 0: // saw (rising)
      return 2 * ph - 1 - polyBlep(ph, dt);
    case 4: // reverse saw (falling)
      return 1 - 2 * ph + polyBlep(ph, dt);
    case 1: { // square
      let t2 = ph + 0.5;
      if (t2 >= 1) t2 -= 1;
      return (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep(t2, dt);
    }
    case 2: // triangle (few harmonics, aliasing is negligible)
      return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    default: // sine
      return Math.sin(2 * Math.PI * ph);
  }
}

/**
 * 4-pole transistor ladder (Huovilainen 2004 nonlinear model).
 * Call setCutoff once per input sample, then tick() twice (2x oversampling).
 */
export class Ladder {
  s1 = 0; s2 = 0; s3 = 0; s4 = 0;
  t1 = 0; t2 = 0; t3 = 0; t4 = 0;
  y4p = 0;
  fb = 0;
  u = 0;
  g = 0.1;
  k = 0; // feedback amount, ~4 = self-oscillation threshold

  reset(): void {
    this.s1 = this.s2 = this.s3 = this.s4 = 0;
    this.t1 = this.t2 = this.t3 = this.t4 = 0;
    this.y4p = this.fb = this.u = 0;
  }

  /** fc in Hz, fsOs = oversampled rate, r = resonance 0..~1.1 (1 = self-oscillation). */
  setCutoff(fc: number, fsOs: number, r: number): void {
    const f = fc / fsOs;          // normalised to the oversampled rate
    const fn = f * 2;             // normalised to the base rate (the polynomials expect this)
    const fn2 = fn * fn, fn3 = fn2 * fn;
    const fcr = 1.873 * fn3 + 0.4955 * fn2 - 0.649 * fn + 0.9988; // cutoff tuning correction
    const acr = -3.9364 * fn2 + 1.8409 * fn + 0.9968;              // resonance correction
    this.g = 1 - Math.exp(-2 * Math.PI * f * fcr);
    this.k = 4 * r * acr;
  }

  tick(x: number): void {
    const u = fastTanh(x - this.k * this.fb);
    this.u = u;
    this.s1 += this.g * (u - this.t1); this.t1 = fastTanh(this.s1);
    this.s2 += this.g * (this.t1 - this.t2); this.t2 = fastTanh(this.s2);
    this.s3 += this.g * (this.t2 - this.t3); this.t3 = fastTanh(this.s3);
    this.s4 += this.g * (this.t3 - this.t4); this.t4 = fastTanh(this.s4);
    this.fb = 0.5 * (this.s4 + this.y4p); // half-sample delay (Huovilainen)
    this.y4p = this.s4;
  }

  /** Output tap for the selected mode (after tick). */
  out(mode: number): number {
    switch (mode) {
      case 1: return this.s2;                                                   // LP 12 dB
      case 2: return 4 * (this.s2 - 2 * this.s3 + this.s4);                     // BP 12 dB
      case 3: return this.u - 4 * this.s1 + 6 * this.s2 - 4 * this.s3 + this.s4; // HP 24 dB
      default: return this.s4;                                                  // LP 24 dB
    }
  }

  flush(): void {
    if (Math.abs(this.s1) < 1e-20) this.s1 = 0;
    if (Math.abs(this.s2) < 1e-20) this.s2 = 0;
    if (Math.abs(this.s3) < 1e-20) this.s3 = 0;
    if (Math.abs(this.s4) < 1e-20) { this.s4 = 0; this.y4p = 0; this.fb = 0; }
  }
}

/** Map the shared RESO knob (0.1..18, log) to ladder resonance 0..1.08. */
export function resToLadder(res: number): number {
  const n = Math.log(Math.max(0.1, res) / 0.1) / Math.log(180);
  return 1.08 * Math.pow(Math.max(0, Math.min(1, n)), 1.5);
}

/** RC-style envelope. Stage: 0 idle, 1 attack, 2 decay/sustain, 3 release. */
export class AnalogEnv {
  v = 0;
  stage = 0;
  ca = 0;  // attack coefficient
  cd = 0;  // decay coefficient
  cr = 0;  // release coefficient
  sus = 0;

  /** Times in seconds. Attack reaches 1 in exactly `a` seconds (target 1.3, like a charging capacitor). */
  set(a: number, d: number, s: number, r: number, sr: number): void {
    this.ca = 1 - Math.exp(-1 / (Math.max(0.0005, a / 1.466) * sr));
    this.cd = 1 - Math.exp(-1 / (Math.max(0.005, d / 3) * sr));
    this.cr = 1 - Math.exp(-1 / (Math.max(0.005, r / 4) * sr));
    this.sus = s;
  }

  gate(on: boolean): void {
    if (on) this.stage = 1;
    else if (this.stage !== 0) this.stage = 3;
  }

  /** Force a fast release (voice stealing). */
  fastRelease(tau: number, sr: number): void {
    this.cr = 1 - Math.exp(-1 / (Math.max(0.001, tau) * sr));
    this.stage = 3;
  }

  tick(): number {
    switch (this.stage) {
      case 1:
        this.v += (1.3 - this.v) * this.ca;
        if (this.v >= 1) { this.v = 1; this.stage = 2; }
        break;
      case 2:
        this.v += (this.sus - this.v) * this.cd;
        break;
      case 3:
        this.v -= this.v * this.cr;
        if (this.v < 1e-5) { this.v = 0; this.stage = 0; }
        break;
      default:
        break;
    }
    return this.v;
  }
}
