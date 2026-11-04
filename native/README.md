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
`dsp/strings.hpp`) and `sy1-vector` (Nishapur, `dsp/vector.hpp`). `createPeriodicWave` maps to
native `wa::PeriodicWave`. Promise callbacks run right after each script (as in a browser).

`node native/tests/worklet_replay.mjs` (deterministic, no browser): a scene runs in the
plugin engine and logs every worklet message; the log is replayed into the web's own
TypeScript processor (Bun, or V8 with `TSRUN=node`) and into the C++ engine. Last result: FM,
strings and vector bit-identical, both channels
(presets switched while notes ring, mono legato glide, riz tremolo, pitch bend, mod wheel).

Parity: `node native/tests/engine_parity.mjs` (vite dev server on :3344) runs the
real app in Chrome (OfflineAudioContext, timers on the render clock) and the
same scenes in the plugin engine. All 15 machines are covered. Last result
(2026-11-04): every scene 105-124 dB below the signal, preset switches included,
except Nishapur's preset scene (-34 to -44 dB, a different value on every Chrome
run): Chrome hands the preset's burst of messages to its audio thread over two
blocks at random. The engines are bit-identical on the same messages (above).
Note events get a fixed 2-block lead on both sides (`LEAD`). `LOGMSG=1` writes both
sides' worklet messages, `DEBUG=1` the two renders.

## The plugin (`../plugin`, JUCE 8: AU, VST3, Standalone)
`plugin/prepare.sh` bundles the engine (`engine.js`, `wa-shim.js`) and the built web UI
into `plugin/resources` (HTML and CSS made pure ASCII). The processor runs the engine
(`host/sy1_engine.hpp`) in 128-frame blocks (128 samples of reported latency); DAW MIDI
(notes, pitch bend, mod wheel, sustain), tempo and Play/Stop (drum machines start on the
DAW's next 16th) go into it on the audio thread. The window is the web app itself in a
web view, in UI mode: its own engine is silent, and every top-level engine call it makes
(`src/engine/mirror.ts`, `calls.ts`) is sent to the plugin's engine; calls the plugin makes
(DAW MIDI, tempo) are applied in the window too, and the scope shows the plugin's output.
The state saved with the DAW project is everything the app keeps in localStorage.
The DAW is the clock: its tempo is the engine's tempo (exact; the window's tempo controls are off),
and while it plays, drum patterns run on its 16th notes (`hostStep`, following loops and jumps;
nothing during a count-in); an arpeggio started while it plays begins on its grid. MIDI events
sound at their exact sample: the engine renders one 128-frame block behind the DAW (the reported
latency), so every event of a block is known first. `plugin/tests/host_test.cpp`
(`-DSY1_TESTS=ON`) drives the real processor like a DAW and checks all of this to the sample.
CI: `.github/workflows/plugin.yml` builds macOS (universal AU + VST3 + app, auval) and
Windows (VST3 + exe) and uploads them as artifacts.
