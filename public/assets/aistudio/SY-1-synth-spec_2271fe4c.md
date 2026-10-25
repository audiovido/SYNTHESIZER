# SY-1 Synth — Build Spec & Handoff

A browser synthesizer built with plain Web Audio (no libraries, no audio files). It started as the "Synth" instrument inside MUSICHER's free piano and is now separated into a standalone app.

**Reference implementation:** `sy1.html` (one file: engine + knob panel + 2-octave keyboard). It is tested and working. Treat it as the source of truth: when this spec and the file disagree, the file wins.

---

## 1. Goal

- A good-looking, hardware-style subtractive synth that runs in any modern browser on desktop, tablet and phone.
- Every knob really changes the sound, also while a note is being held.
- Playable with mouse, touch (multi-touch), and the computer keyboard.
- Zero dependencies, zero network calls, zero audio files.

## 2. Signal flow

```
per voice (one per held note):

  OSC 1 (wave, octave) ─┐
  OSC 2 (wave, octave,  ├─► mix ─► FILTER (LP/BP/HP, cutoff, Q) ─► AMP (ADSR) ─► TREM ─► OUT (release) ─┐
         detune)        │            ▲ cutoff envelope (A/D/S)                    ▲                     │
  SUB (sine, -1 oct) ───┤            ▲ LFO → filter.detune                        LFO → trem.gain       │
  NOISE (looped buffer)─┘     LFO → osc.detune (pitch)                                                 │
                                                                                                        ▼
shared FX bus (one per AudioContext):

  input ─► DRIVE (WaveShaper) ─► gain compensation ─► EQ low shelf 220 Hz ─► EQ peak 1.1 kHz ─► EQ high shelf 4.2 kHz ─┬─► dry ──────────────┐
                                                                                                                    ├─► DELAY ⟲ feedback ─► wet ─┤
                                                                                                                    └─► REVERB (convolver) ─► wet ┤
                                                                                                                                                  ▼
                                                                                         sum ─► MASTER volume ─► LIMITER (compressor) ─► ANALYSER (scope) ─► speakers
```

Key design rule: each voice has two separate gain stages. `amp` runs the attack/decay/sustain and is never cancelled; `out` handles release only. That makes "sound continues while the key is down, fades when released" reliable and click-free.

## 3. Parameters

| Key | Label | Range | Curve | Default | What it does |
|---|---|---|---|---|---|
| osc1Wave | OSC 1 wave | saw / square / triangle / sine | choice | saw | Waveform of oscillator 1 |
| osc1Oct | OCT | −2…+2 | step 1 | 0 | Octave of OSC 1 (sub follows it) |
| sub | SUB | 0–1 | linear | 0.2 | Sine one octave below OSC 1 |
| noise | NOISE | 0–1 | linear | 0 | White noise level |
| osc2Wave | OSC 2 wave | as OSC 1 | choice | square | Waveform of oscillator 2 |
| osc2Oct | OCT | −2…+2 | step 1 | 0 | Octave of OSC 2 |
| osc2Detune | DETUNE | −50…+50 cents | step 1 | 8 | Fine detune of OSC 2 (thickness) |
| oscMix | MIX | 0–1 | linear | 0.45 | 0 = only OSC 1, 1 = only OSC 2 |
| filterType | LP / BP / HP | choice | — | lowpass | Filter mode |
| cutoff | CUTOFF | 40 Hz–18 kHz | log | 2200 | Filter cutoff |
| res | RESO | 0.1–18 | log | 2 | Filter resonance (Q) |
| envAmt | ENV | 0–1 | linear | 0.45 | Envelope opens the filter up to +6 octaves |
| fA / fD / fS | A / D / S | 1 ms–3 s / 10 ms–4 s / 0–1 | log / log / lin | 0.01 / 0.35 / 0.25 | Filter envelope |
| aA / aD / aS / aR | ATTACK / DECAY / SUSTAIN / RELEASE | 1 ms–4 s / 10 ms–4 s / 0–1 / 10 ms–6 s | log/log/lin/log | 0.008 / 0.3 / 0.75 / 0.35 | Amp envelope |
| lfoRate | RATE | 0.05–20 Hz | log | 5 | LFO speed |
| lfoDepth | DEPTH | 0–1 | linear | 0 | LFO amount |
| lfoTarget | PITCH / FILTER / AMP | choice | — | pitch | Pitch = ±60 cents, Filter = ±2400 cents, Amp = tremolo ±50% |
| drive | DRIVE | 0–1 | linear | 0 | Soft-clip saturation (with automatic level compensation) |
| eqLow / eqMid / eqHigh | LOW / MID / HIGH | −12…+12 dB | linear | 0 | 3-band EQ |
| delayTime | TIME | 50 ms–1.2 s | log | 0.32 | Delay time |
| delayFb | FDBK | 0–0.85 | linear | 0.35 | Delay feedback (capped below 1 so it never runs away) |
| delayMix | MIX | 0–1 | linear | 0 | Delay wet level |
| revSize | SIZE | 0.3–6 s | log | 2.2 | Reverb length (impulse is regenerated, debounced 180 ms) |
| revMix | MIX | 0–1 | linear | 0.18 | Reverb wet level |
| volume | VOL | 0–1 | linear | 0.7 | Master volume |

Knob mapping: a knob stores a normalized position n (0–1). Linear: `v = min + n·(max−min)`. Log: `v = min · (max/min)^n`. Stepped values are rounded to the step.

## 4. Envelopes (exact behaviour)

- **Amp:** start 0.0001 → linear ramp to peak (0.42 per voice) in `aA` → `setTargetAtTime(peak·aS, tau = aD/3)`. Holds there while the key is down.
- **Release:** on note-off, `out.gain.setTargetAtTime(0.0001, now, tau = aR/4)`, oscillators stop at `now + 8·tau + 50 ms`.
- **Filter:** `top = min(20 kHz, cutoff · 2^(envAmt·6))`, `sustain = cutoff + (top − cutoff)·fS`; ramp cutoff → top in `fA`, then `setTargetAtTime(sustain, tau = fD/3)`.

## 5. Live knob changes

`setSynthParam(key, value)` clamps the value, saves it, updates the shared FX bus immediately (smoothed with `setTargetAtTime`, ~20 ms) and calls `voice.update(key)` on every sounding voice, so held notes change in real time (cutoff, resonance, filter type, mix, sub, noise, detune, waves, octaves, sustain, LFO rate/depth/target).

## 6. Voice management

- Held notes are tracked in a map `note → voice`. Note-on of a note that is already sounding releases the old voice first.
- **Polyphony cap:** max 10 sounding voices (oldest is stolen with a fast 20 ms release) and max 16 including fading tails (oldest is hard-killed). Protects weak phones.
- All notes are released on window blur and when the tab is hidden, so nothing can get stuck.

## 7. UI and interaction

- **Knobs:** drag up/down (horizontal also works at half speed), Shift = fine, mouse wheel, arrow keys when focused, double-click resets to default. `touch-action: none` on knobs so dragging never scrolls the page. Pointer capture keeps the drag alive outside the knob.
- **Look:** dark panel, amber (#F2B33D) accents, conic-gradient value ring around each knob, glowing indicator, section cards in signal-flow order (OSC 1 → OSC 2 → FILTER → AMP ENV → LFO → DRIVE·EQ → DELAY → REVERB·OUT), oscilloscope at the top (AnalyserNode, zero-crossing triggered so the wave stands still).
- **Keyboard:** 2 octaves, octave buttons (C1–C8 range), computer keys `A W S E D F T G Y H U J K O L P ;`, `Z`/`X` = octave down/up, glide while dragging across keys (geometry hit-test, not `elementFromPoint`).
- **Phone:** sections in a 2-column grid; no horizontal page scroll at 390 px.
- **Audio unlock:** browsers only start audio after a user gesture. A "Tap to start audio" pill floats at the top (fixed position, so hiding it doesn't move the layout).

## 8. Presets

| Id | Name | Character |
|---|---|---|
| init | Init | All defaults |
| warmPad | Warm Pad | Two detuned saws, slow attack/release, slow filter LFO, big reverb |
| acidBass | Acid Bass | Low saw/square, cutoff 260 Hz, reso 14, fast filter envelope, drive 55% |
| lead | Lead | Square + saw, pitch vibrato, delay 360 ms |
| pluck | Pluck | Triangle + square, zero sustain, short decay, delay + reverb |
| brass | Brass | Saws with slow filter swell, mid boost |
| spaceBells | Space Bells | Sines two octaves apart, long decay, amp LFO, long delay + reverb |

Exact values are in `SYNTH_PRESETS` in `sy1.html`. A preset = defaults + overrides.

## 9. Lessons learned (bugs we already hit — don't repeat them)

1. **Layout shift breaks the keyboard.** Hiding a "tap to start" button in the normal page flow moved the keyboard up by ~56 px mid-press, so the pointer was suddenly over the wrong key (or none). Fix: the unlock button is `position: fixed`, and key hit-testing uses key rectangles.
2. **Fixed overlays steal touches.** The unlock pill at the bottom covered the keys on phones. Keep overlays away from the keyboard.
3. **Never cancel the attack/decay automation to release.** Use a separate release gain stage.
4. **Voice stealing must count only sounding voices.** Counting fading voices made the cap useless.
5. **Feedback must stay < 1** and the master needs a limiter, or high resonance + drive + delay clips hard.
6. **Reverb impulse is expensive to rebuild.** Debounce size changes.
7. **`overflow: hidden` on `html`/`body` breaks `position: sticky`.** Use `overflow-x: clip` if horizontal clipping is needed.
8. **Release everything on blur/visibility change** or notes stay stuck when the user switches apps on a phone.

## 10. Test checklist

- [ ] First tap anywhere starts audio; no error in the console.
- [ ] Hold a key: sound continues as long as held, fades on release (try Warm Pad with long release).
- [ ] Turn CUTOFF and RESO while holding a note: sound changes live, no clicks.
- [ ] Every knob moves smoothly with mouse, touch, wheel and arrow keys; double-click resets.
- [ ] Every preset loads and sounds different; switching presets while holding notes doesn't crash.
- [ ] Chord of 5+ notes with mouse/touch/computer keys; 16 notes at once never exceeds 10 sounding voices.
- [ ] Drag across the keyboard: notes glide key to key.
- [ ] Switch tab/app while holding a note: the note stops.
- [ ] Phone (390 px) and tablet: no horizontal scroll, knobs reachable, keyboard playable with several fingers.
- [ ] Rotate phone: layout still fine.
- [ ] Check on a real iPhone (the hardware silent switch can mute Web Audio on iOS — verify).

## 11. Ideas for next versions

- Glide/portamento and mono/legato mode.
- Arpeggiator and a simple step sequencer.
- Chorus (Juno-style), unison voices, second LFO.
- Velocity from touch pressure / Web MIDI input (external keyboards).
- Save/share patches (JSON export/import, URL).
- Visual feedback: envelope graph, filter curve drawing.

## 12. Starter prompt for Google AI Studio (Build)

Upload `sy1.html` to the new app, then send:

```
You are building "SY-1", a standalone browser synthesizer. The attached sy1.html is a complete, tested reference implementation (Web Audio, no libraries). Read it fully before changing anything.

RULES
- Keep the audio engine logic exactly as in sy1.html (signal flow, envelopes with a separate release gain stage, voice stealing caps, live parameter updates, FX bus with limiter). Do not replace it with a library (no Tone.js).
- No CDN, no runtime network calls, no audio files. Bundle with Vite if you split files.
- Mobile first: works on 390 px phones and tablets with multi-touch; no horizontal page scroll; knobs use touch-action: none.
- Never place fixed overlays over the keyboard; never let layout shift while a key is pressed.
- Release all notes on window blur and when the tab becomes hidden.

FIRST TASK
1) Port sy1.html into a clean project structure: src/engine/ (patch, voice, bus, presets), src/ui/ (knob, panel, keyboard, scope), index.html. Behaviour must be identical.
2) Do not add features yet.
3) Reply with the file list and a short test checklist (hold notes, live cutoff change, presets, phone layout, glide, blur stops notes).
```

After that works, add features one at a time from section 11, each with its own prompt.
