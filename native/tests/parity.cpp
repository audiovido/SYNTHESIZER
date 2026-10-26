// Renders fixed scenarios with the C++ engine and writes raw float32 files,
// so they can be compared with the TypeScript reference (parity.mts).
// Build: g++ -O2 -std=c++17 native/tests/parity.cpp -o parity && ./parity out_dir
#include "../dsp/analog.hpp"
#include <chrono>
#include <cstdio>
#include <vector>

using namespace sy1;
static const double SR = 48000;

static void scenario(AnalogEngine& e, int which) {
  if (which == 0) {  // three-osc bass with glide, drift and drive
    e.setParam("osc1Wave", "sawtooth"); e.setParam("osc2Wave", "square"); e.setParam("osc3Wave", "revsaw");
    e.setParam("osc1Oct", -1.0); e.setParam("osc2Oct", -1.0); e.setParam("osc3Oct", -2.0);
    e.setParam("osc3Level", 0.6); e.setParam("cutoff", 380.0); e.setParam("res", 9.0); e.setParam("envAmt", 0.6);
    e.setParam("filterDrive", 0.6); e.setParam("drift", 0.5); e.setParam("noise", 0.1);
  } else {  // self-oscillating whistle, LFO on filter, band-pass then LP12
    e.setParam("osc1Wave", "sine"); e.setParam("oscMix", 0.0); e.setParam("sub", 0.0);
    e.setParam("res", 17.5); e.setParam("cutoff", 1200.0); e.setParam("keyTrack", 1.0);
    e.setParam("lfoTarget", "filter"); e.setParam("lfoDepth", 0.3); e.setParam("lfoRate", 3.0);
    e.setParam("filterType", "bandpass");
  }
}

static std::vector<float> run(int which) {
  AnalogEngine e(SR);
  scenario(e, which);
  e.snapParams();
  const int N = int(SR * 3), B = 128;
  std::vector<float> out(N, 0.f);
  float L[B];
  for (int p = 0, blk = 0; p < N; p += B, blk++) {
    std::fill(L, L + B, 0.f);
    if (blk == 0) e.noteOn(1, 45, 0, 1, 10, 0, 0);
    if (blk == 120) e.glideTo(1, 52, -50, 0.15);
    if (blk == 250) e.setBend(0.5);
    if (blk == 300 && which == 1) e.setParam("filterType", "lowpass");
    if (blk == 400) e.noteOff(1, 5, false);
    if (blk == 600) e.noteOn(2, 57, 0, 0.6, 0, 0, 0);
    if (blk == 900) e.noteOff(2, 0, false);
    e.render(L, nullptr, B);
    for (int i = 0; i < B && p + i < N; i++) out[p + i] = L[i];
  }
  return out;
}

int main(int argc, char** argv) {
  const char* dir = argc > 1 ? argv[1] : ".";
  for (int w = 0; w < 2; w++) {
    auto x = run(w);
    char path[512];
    std::snprintf(path, sizeof path, "%s/cpp_%d.f32", dir, w);
    FILE* f = std::fopen(path, "wb");
    std::fwrite(x.data(), sizeof(float), x.size(), f);
    std::fclose(f);
  }
  // CPU benchmark: 10 voices, 10 seconds
  AnalogEngine e(SR);
  e.setParam("osc3Level", 0.5); e.setParam("res", 10.0); e.snapParams();
  int notes[10] = {48, 52, 55, 59, 62, 64, 67, 71, 74, 77};
  for (int i = 0; i < 10; i++) e.noteOn(i + 1, notes[i], 0, 1, 0, 0, 0);
  float L[128];
  auto t0 = std::chrono::steady_clock::now();
  for (int p = 0; p < SR * 10; p += 128) { std::fill(L, L + 128, 0.f); e.render(L, nullptr, 128); }
  double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  std::printf("C++ CPU, 10 voices: %.1f ms per 10 s of audio = %.2f%% of one core\n", ms, ms / 100);
  return 0;
}
