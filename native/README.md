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
