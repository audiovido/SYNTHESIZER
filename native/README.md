# SY-1 native engine (C++)

`dsp/analog.hpp` is the Tabriz analog engine in C++17, a line-by-line port of
`src/dsp/analog.ts` + `src/dsp/analog-engine.ts`. Header-only, no allocations
after construction, real-time safe. Next: wrap it in an Expo native module
(iOS AVAudioEngine source node / Android Oboe) for the mobile app.

## Parity test (C++ must sound the same as the web reference)
```
g++ -O2 -std=c++17 native/tests/parity.cpp -o parity && ./parity /tmp
```
Then render the same scenarios from TypeScript and compare. Last result (2026-10-26):
max difference 1.5e-8 (float rounding), error -156 dB below the signal; CPU for
10 voices 8.9 % of one x86 core (TypeScript: 14 %).

## HQ engine (`dsp/hq.hpp`)
Line-by-line port of `src/dsp/hq-engine.ts`, the engine behind every machine
without a special engine (SY-1, Yazd, Baku, Merv, Isfahan, Konya, Bam, Kerman,
Bushehr, Rasht, Hormoz). Namespace `sy1::hq`, so it can share a binary with the
Tabriz engine.
```
g++ -O2 -std=c++17 native/tests/hq_parity.cpp -o hq_parity && ./hq_parity /tmp
bun native/tests/hq_parity.mts /tmp
```
Last result (2026-11-02): all 3 scenarios (unison + LP24 + S&H, Persian
ornaments + band-pass, high-pass + pitch LFO) bit-identical to TypeScript (max
difference 0). CPU for 10 voices: 2.1 % of one x86 core at unison 1, 3.5 % at
unison 5 (TypeScript: 4.3 % / 5.9 %).

## FX bus (`dsp/fx.hpp`)
`g++ -O2 -std=c++17 native/tests/fx_test.cpp -o fx && ./fx`. Reverb loudness
is calibrated against the web Freeverb-style reverb (within 0.4 dB).

## iOS test app (step 4: latency and CPU on a real iPhone)
`ios/Tabriz.xcodeproj`: plain native app (Swift UI + Objective-C++ bridge +
the C++ engine above), no CocoaPods or npm needed. Open it in Xcode, choose
your team under Signing & Capabilities, pick your iPhone, press Run.
- `dsp/tabriz_host.hpp`: lock-free command queue, mono/legato logic, soft limiter (tested by `tests/host_test.cpp`)
- `ios/Tabriz/SynthEngine.mm`: AVAudioEngine source node, audio session, DSP-load meter
- `ios/Tabriz/presets.json`: generated from `src/machines/tabriz.ts` by `tools/export-tabriz-presets.mts`
- `tools/make_xcodeproj.py`: regenerates the project file
The app screen shows buffer size, iOS output latency, DSP load and glitch count.
No delay/reverb/EQ yet (dry signal); those come with the Expo UI step.

## Web Audio core (`wa/`) and the exact FX bus (`dsp/bus.hpp`) — plugin groundwork
The web app's FX bus and drum machines are Web Audio node graphs, so the
plugin needs Chrome's node behaviour, not an approximation. `wa/wa.hpp` +
`wa/param.hpp` re-implement the nodes SY-1 uses from Chromium's own algorithms
(see `wa/NOTICE.md`): AudioParam timeline, 128-frame pull model with Chrome's
cycle behaviour, Gain, Biquad, IIR, Delay (SSE2/NEON kernel), WaveShaper with
the 2x/4x resamplers, DynamicsCompressor, Oscillator/PeriodicWave (vector
kernels), AudioBufferSource, StereoPanner, ChannelMerger.

`dsp/bus.hpp` builds the FX bus node for node like `src/engine/bus.ts`. It
supersedes the approximate `dsp/fx.hpp` (FDN reverb), which the plugin will not use.

Tests (Chromium via Playwright on this machine, which is x86, hence
`-DWA_X86_PARAMS`; the plugin builds without it, matching Chrome on Apple Silicon):
```
WA_X86=1 node native/tests/wa_scene.mjs native/tests/scenes/*.txt   # every node type
node native/tests/bus_parity.mjs                                    # whole bus vs bus.ts
```
Last result (2026-11-04): dry, drive/EQ and delay paths bit-identical; chorus,
reverb, limiter, knob moves, drum sends and 44.1 kHz 94-110 dB below the signal.
Note: in Chrome the reverb's four allpass stages break their feedback cycle in
hash-set order, which changes per page load (16 variants). The plugin always
uses the true Schroeder allpass order (`apOrderMask_ = 0`); the parity test
finds the order Chrome used on that load and then matches it exactly.

## Drum machines in the plugin (`host/wajs.hpp`, `js/`)
The drum machines are not re-written in C++: the plugin runs the web app's own
`src/engine/drums.ts` + `drum-models.ts` (sequencer included) in an embedded
QuickJS-ng (`third_party/quickjs`, v0.16.2, MIT). `js/wa-shim.js` gives that
code a Web Audio API whose nodes are the Chrome-exact `wa/` nodes, so the
drums stay identical to the web version by construction, including future
changes. `bun native/js/build.ts` bundles the code (`bus.ts` replaced by
`js/bus-stub.ts`) into `js/dist/drums.js`.

Parity: `node native/tests/drum_parity.mjs` renders every model (808 analog,
909, 707, 606, CR-78, 80s gated, acoustic, Persian, minimal), the per-voice
knobs and a fusion kit in Chrome and in QuickJS + wa. Last result
(2026-11-04): all within 121-134 dB of Chrome (float rounding). The sequencer
runs on the audio clock (sample-accurate). CPU: a very busy acoustic groove
(16ths, 3-4 voices per step) costs ~22 % of one cloud x86 core; to be measured
on Apple Silicon.

## The whole web engine in the plugin (`js/engine-entry.ts`, `host/worklets.hpp`)
`js/dist/engine.js` bundles `src/engine/synth.ts` and everything it uses
(notes, mono/legato, HOLD, sustain, arpeggiator, machines, presets, kits,
styles, drum machines, the real `bus.ts`), unchanged. AudioWorklet engines are
native wa nodes with the same message protocol and timing: `sy1-voices` (HQ)
`sy1-analog` (Tabriz), `sy1-fm` (Kashan, `dsp/fm.hpp`) and `sy1-strings` (Shiraz,
`dsp/strings.hpp`). Vector (Nishapur) is not native yet.

`node native/tests/worklet_replay.mjs` (deterministic, no browser): a scene runs in the
plugin engine and logs every worklet message; the log is replayed into the web's own
TypeScript processor and into the C++ engine. Last result: FM and strings bit-identical
(presets switched while notes ring, mono legato glide, riz tremolo, pitch bend, mod wheel).

Parity: `node native/tests/engine_parity.mjs` (vite dev server on :3344) runs the
real app in Chrome (OfflineAudioContext, timers on the render clock) and the
same scenes in the plugin engine. Last result (2026-11-04): every scene within
97-123 dB of Chrome. The scenes cover SY-1 (chord, knob moves, chorus), Yazd,
Tabriz mono legato with glide, Baku (arpeggio, chord, dry, chorus, delay),
Konya Euclid, and the Kerman and Bushehr drum styles. Chrome itself sometimes
renders a chorus scene differently on one page load (as with the reverb
allpass order); a rerun matches. Kashan FM chord (-109 dB), Shiraz santur (-107 dB) and riz (-109 dB) match. Scenes that
switch presets while playing differ in Chrome alone: measured, Chrome hands a burst of
~450 messages to its audio thread over two blocks (first ~300, then the rest), so its
timing shifts; the engines themselves are bit-identical on the same messages (above).
