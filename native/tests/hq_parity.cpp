// HQ engine parity: renders fixed scenarios with the C++ engine (native/dsp/hq.hpp)
// and writes raw float32 files (L then R) to compare with the TypeScript reference
// (hq_parity.mts renders the same scenarios from src/dsp/hq-engine.ts).
//
//   g++ -O2 -std=c++17 native/tests/hq_parity.cpp -o hq_parity && ./hq_parity /tmp
//   bun native/tests/hq_parity.mts /tmp      (renders ts_*.f32 and compares)
#include "../dsp/hq.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <vector>

using namespace sy1;
static const double SR = 48000;
static const int SCENARIOS = 4;

static void scenario(hq::Engine& e, int which) {
  if (which == 0) {  // unison supersaw lead, LP24 with resonance, S&H on the filter, noise
    e.setParam("osc1Wave", "sawtooth"); e.setParam("osc2Wave", "sawtooth");
    e.setParam("unison", 5.0); e.setParam("uniDetune", 25.0); e.setParam("uniWidth", 0.7);
    e.setParam("filterType", "lp24"); e.setParam("cutoff", 900.0); e.setParam("res", 12.0); e.setParam("envAmt", 0.6);
    e.setParam("noise", 0.15); e.setParam("lfoTarget", "filter"); e.setParam("lfoShape", "sh");
    e.setParam("lfoDepth", 0.35); e.setParam("lfoRate", 7.0);
  } else if (which == 1) {  // Persian reed: oriental ornaments, band-pass
    e.setParam("oriental", "on"); e.setParam("scoop", 0.4); e.setParam("tahrir", 0.7);
    e.setParam("vibDepth", 0.5); e.setParam("vibRate", 6.0); e.setParam("vibDelay", 0.2);
    e.setParam("osc1Wave", "square"); e.setParam("osc2Wave", "sawtooth"); e.setParam("osc2Detune", 4.0);
    e.setParam("filterType", "bandpass"); e.setParam("cutoff", 1400.0); e.setParam("res", 5.0);
  } else if (which == 3) {  // analog character: LADDER near self-oscillation, drift, drive, key tracking, unison
    e.setParam("osc1Wave", "sawtooth"); e.setParam("osc2Wave", "square"); e.setParam("unison", 3.0);
    e.setParam("filterType", "ladder"); e.setParam("cutoff", 500.0); e.setParam("res", 15.0); e.setParam("envAmt", 0.5);
    e.setParam("filterDrive", 0.6); e.setParam("drift", 0.8); e.setParam("keyTrack", 0.7);
  } else {  // sine/triangle, high-pass, pitch LFO, sub
    e.setParam("osc1Wave", "triangle"); e.setParam("osc2Wave", "sine"); e.setParam("osc2Oct", 1.0);
    e.setParam("filterType", "highpass"); e.setParam("cutoff", 300.0); e.setParam("res", 18.0);
    e.setParam("lfoTarget", "pitch"); e.setParam("lfoDepth", 0.4); e.setParam("sub", 0.6);
  }
}

static void run(int which, std::vector<float>& outL, std::vector<float>& outR) {
  hq::Engine e(SR);
  scenario(e, which);
  e.snapParams();
  const int N = int(SR * 3), B = 128;
  outL.assign(N, 0.f);
  outR.assign(N, 0.f);
  float L[B], R[B];
  for (int p = 0, blk = 0; p < N; p += B, blk++) {
    std::fill(L, L + B, 0.f);
    std::fill(R, R + B, 0.f);
    if (blk == 0) e.noteOn(1, 45, 0, 0.9, 10, 0, 0);
    if (blk == 40) e.noteOn(2, 57, -50, 0.75, 3, 300, 0.2);
    if (blk == 120) e.glideTo(1, 52, -50, 0.15);
    if (blk == 200) e.setParam("cutoff", 2400.0);
    if (blk == 250) e.setBend(0.5);
    if (blk == 300) e.setMod(0.6);
    if (blk == 400) e.noteOff(1, 5, false);
    if (blk == 500) e.noteOff(2, 0, true);
    if (blk == 600) e.noteOn(3, 64, 25, 0.6, 0, 0, 0);
    if (blk == 900) e.noteOff(3, 0, false);
    e.render(L, R, B);
    for (int i = 0; i < B && p + i < N; i++) { outL[p + i] = L[i]; outR[p + i] = R[i]; }
  }
}

int main(int argc, char** argv) {
  const char* dir = argc > 1 ? argv[1] : ".";
  for (int w = 0; w < SCENARIOS; w++) {
    std::vector<float> l, r;
    run(w, l, r);
    char path[512];
    std::snprintf(path, sizeof path, "%s/hq_cpp_%d.f32", dir, w);
    FILE* f = std::fopen(path, "wb");
    std::fwrite(l.data(), sizeof(float), l.size(), f);
    std::fwrite(r.data(), sizeof(float), r.size(), f);
    std::fclose(f);
  }
  // CPU benchmark: 10 voices, unison 1 and 5, 10 seconds
  for (double uni : {1.0, 5.0}) {
    hq::Engine e(SR);
    e.setParam("osc1Wave", "sawtooth"); e.setParam("unison", uni); e.setParam("res", 10.0);
    e.setParam("filterType", "lp24"); e.snapParams();
    int notes[10] = {48, 52, 55, 59, 62, 64, 67, 71, 74, 77};
    for (int i = 0; i < 10; i++) e.noteOn(i + 1, notes[i], 0, 1, 0, 0, 0);
    float L[128], R[128];
    auto t0 = std::chrono::steady_clock::now();
    for (int p = 0; p < SR * 10; p += 128) {
      std::fill(L, L + 128, 0.f); std::fill(R, R + 128, 0.f);
      e.render(L, R, 128);
    }
    double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::printf("C++ CPU, 10 voices, unison %.0f: %.1f ms per 10 s of audio = %.2f%% of one core\n", uni, ms, ms / 100);
  }
  return 0;
}
