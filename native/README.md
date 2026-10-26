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
