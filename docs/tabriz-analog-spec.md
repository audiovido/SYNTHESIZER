# Tabriz — Analog Engine Spec (v1)

Goal: a 1970s three-oscillator monophonic sound (the "Model D" family) built from math only, no samples. The DSP is written once as portable code (`src/dsp/analog.ts`, `src/dsp/analog-engine.ts`) and is the reference for the native C++ engine (`native/dsp/`). The web worklet (`src/engine/worklet/analog-processor.ts`) is only a thin wrapper.

## 1. Signal flow (per voice)

```
OSC1 + OSC2 + OSC3 (PolyBLEP, analog drift) + SUB (sine, -1 oct of OSC1) + NOISE
  -> mixer: tanh(0.6 * sum) * (1 + 4 * DRIVE)            (soft overdrive when levels add up)
  -> LADDER 4-pole, 2x oversampled, nonlinear (Huovilainen)
       cutoff = CUTOFF * 2^(6*CONTOUR*filterEnv + KEYTRACK*(log2 f - log2 261.63) + LFO*2 oct)
  -> output gain (1 + 0.9 r) / drive compensation
  -> * amp envelope * 0.42 * velocity scaling * tremolo
```
Mono / legato / glide / note priority are handled by the shared voice logic (`src/engine/synth.ts`): legato = the running voice glides to the new pitch without retriggering the envelopes; glide is exponential in log-frequency with time constant GLIDE/3.

## 2. Oscillators
- Waves: saw (rising), reverse saw, square, triangle, sine. Saw and square use PolyBLEP (2-sample residual) to stop aliasing; triangle is naive (its harmonics fall at 12 dB/oct).
- Frequency: `440 * 2^((midi-69)/12 + cents/1200) * 2^octave * 2^(detune/1200)`. Tuning cents (ORIENTAL) and pitch bend are added before.
- Free-running: every note starts at a random phase (like hardware).
- Drift (DRIFT 0..1): per oscillator a random walk updated each block (`d = 0.996*(d + 0.06*rand)`, clamped ±1) plus a fixed per-note offset. Pitch offset = `DRIFT * (6*d + 2*fixed)` cents. DRIFT 0 = exact pitch.
- Levels: OSC1 = 1 - MIX, OSC2 = MIX (keeps old presets compatible), OSC3 = LEVEL.

## 3. Ladder filter
Huovilainen nonlinear model (DAFx 2004), 2x oversampled (input linearly interpolated half-way):
```
u  = tanh(x - k * fb)
s1 += g*(u  - tanh s1);  s2 += g*(tanh s1 - tanh s2);  s3 += ...;  s4 += ...
fb = (s4 + s4_prev) / 2                        (half-sample delay)
f  = fc / (2*sr);  fn = 2f
g  = 1 - exp(-2*pi*f*(1.873 fn^3 + 0.4955 fn^2 - 0.649 fn + 0.9988))
k  = 4 * r * (-3.9364 fn^2 + 1.8409 fn + 0.9968)
r  = 1.08 * (ln(RESO/0.1)/ln(180))^1.5        (RESO knob 0.1..18 -> 0..1.08)
```
- tanh is the rational `x(27+x²)/(27+9x²)`, clipped to ±1 above |x| = 3.
- Modes (taps): LP24 = s4, LP12 = s2, BP = 4(s2 - 2s3 + s4), HP24 = u - 4s1 + 6s2 - 4s3 + s4.
- Cutoff coefficients are recomputed every 4 samples (control rate).
- Self-oscillation starts around RESO 15; at RESO 17.5 the filter sings a sine near the cutoff (playable with KEY TRK = 100%).

## 4. Envelopes (amp and filter, RC style)
- Attack: `v += (1.3 - v)*ca`, stops at 1; ca chosen so 1.0 is reached in exactly A seconds (`tau = A/1.466`).
- Decay: exponential toward S, `tau = D/3`. Release: exponential toward 0, `tau = R/4` (same R for both contours). Voice ends below 1e-5.
- Voice stealing: max 10 sounding (oldest gets a 20 ms release), max 16 with tails.

## 5. Parameters (new ones in bold)
OSC1 wave/oct, SUB, NOISE · OSC2 wave/oct/detune/MIX · **OSC3 wave (tri/saw/rev-saw/square), oct (def -1), detune (def -5¢), level (def 0)** · LADDER mode, CUTOFF, EMPHASIS (=RESO), CONTOUR (=ENV), A/D/S · AMP A/D/S/R, VEL · MONO, LEGATO, GLIDE, BEND · **KEY TRK (0..1, def 33%), DRIVE (ladder drive 0..1, def 30%), DRIFT (0..1, def 25%)** · LFO · bus FX (drive, EQ, delay, reverb).

## 6. Measured (2026-10-26, Node and headless Chromium)
| Test | Result |
|---|---|
| Pitch, DRIFT 0, sine, midi 36/60/69/84 (zero-crossing, 2.5 s) | error 0.000 cents |
| Tuning cents: E4 -50¢ | 320.32 Hz (expected 320.24, estimator limit) |
| Self-oscillation RESO 17.5 / 18 | sine at 433 Hz (fc 440) / 983 Hz (fc 1000) |
| Worst case: 10 voices, all osc + noise, RESO 18, DRIVE 1 | peak 1.28 before the bus limiter, no NaN |
| Release R = 0.35 s | silent after 1.5 s |
| CPU (Node, x86 server core) | 1 voice 1.5 %, 10 voices 14 % of one core |
| Browser: worklet loads, all 28 presets audible, no console errors | OK |
| Layout: Tabriz, SY-1, Isfahan × 10 viewports × all pages | 116/120; the 4 misses are a 1-px overflow at 1024×700 that already exists on main |

## 7. Not verified yet (needs ears and real devices)
- How close it sounds to the reference instrument (listening test with the user's reference recordings).
- CPU on a real mid-range phone (JS in a worklet is slower than native; mono use is light).
