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
