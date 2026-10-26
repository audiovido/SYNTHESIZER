// FX bus tests: g++ -O2 -std=c++17 native/tests/fx_test.cpp -o fx && ./fx
#include "../dsp/fx.hpp"
#include <chrono>
#include <complex>
#include <cstdio>
#include <memory>
#include <random>
#include <vector>
using namespace sy1;
static int fails = 0;
#define CHECK(c, ...) do { std::printf((c) ? "ok:   " : "FAIL: "); std::printf(__VA_ARGS__); std::printf("\n"); if (!(c)) fails++; } while (0)
static const double SR = 48000;

static double rms(const std::vector<float>& x, size_t a, size_t b) { double s = 0; for (size_t i = a; i < b; i++) s += x[i] * x[i]; return std::sqrt(s / (b - a)); }

// steady-state gain of a sine through the FX bus (dry path only, all sends 0)
static double sineGain(const char* key, double val, double f) {
  auto fx = std::make_unique<FxBus>(SR);
  fx->setParam("revMix", 0); fx->setParam("volume", 1); fx->setParam(key, val);
  const int N = int(SR);
  std::vector<float> L(N), R(N);
  for (int i = 0; i < N; i++) L[i] = R[i] = float(0.1 * std::sin(2 * M_PI * f * i / SR));
  fx->process(L.data(), R.data(), N);
  return rms(L, N / 2, N) / (0.1 / std::sqrt(2.0));
}
// Web Audio biquad magnitude, computed from the same coefficients independently
static double webMag(Biquad b, double f) {
  const double w = 2 * M_PI * f / SR;
  std::complex<double> z1 = std::polar(1.0, -w), z2 = z1 * z1;
  return std::abs((b.b0 + b.b1 * z1 + b.b2 * z2) / (1.0 + b.a1 * z1 + b.a2 * z2));
}

int main() {
  // 1. neutral settings are transparent
  CHECK(std::fabs(sineGain("drive", 0, 440) - 1) < 0.01, "drive 0 / EQ flat: unity gain (%.4f)", sineGain("drive", 0, 440));
  // 2. EQ: +12 dB low shelf at 50 Hz ~ +12 dB, high shelf at 12 kHz, peak at 1.1 kHz
  double g = 20 * std::log10(sineGain("eqLow", 12, 50));
  CHECK(std::fabs(g - 12) < 0.7, "low shelf +12 dB at 50 Hz -> %.2f dB", g);
  g = 20 * std::log10(sineGain("eqHigh", -12, 14000));
  CHECK(std::fabs(g + 12) < 0.7, "high shelf -12 dB at 14 kHz -> %.2f dB", g);
  g = 20 * std::log10(sineGain("eqMid", 9, 1100));
  CHECK(std::fabs(g - 9) < 0.2, "peaking +9 dB at 1.1 kHz -> %.2f dB", g);
  Biquad b; b.peaking(1100, 0.8, 9, SR);
  CHECK(std::fabs(20 * std::log10(webMag(b, 1100)) - 9) < 0.01, "peaking formula matches Web Audio at centre");
  // 3. drive: full drive saturates and is loudness-compensated
  {
    // web curve: (1+k)x/(1+k|x|), k=60, then *1/(1+1.5): peak of a 0.1 sine -> 61*0.1/7/2.5 = 0.3486
    auto fx = std::make_unique<FxBus>(SR);
    fx->setParam("revMix", 0); fx->setParam("volume", 1); fx->setParam("drive", 1);
    std::vector<float> L(4800), R(4800);
    for (int i = 0; i < 4800; i++) L[i] = R[i] = float(0.1 * std::sin(2 * M_PI * 100 * i / SR));
    fx->process(L.data(), R.data(), 4800);
    double pk = 0; for (float v : L) pk = std::fmax(pk, std::fabs(v));
    CHECK(std::fabs(pk - 0.3486) < 0.002, "drive 100%%: peak %.4f matches the web curve (0.3486)", pk);
  }
  // 4. delay: echo at 250 ms
  {
    auto fx = std::make_unique<FxBus>(SR);
    fx->setParam("revMix", 0); fx->setParam("volume", 1); fx->setParam("delayTime", 0.25);
    fx->setParam("delayMix", 1); fx->setParam("delayFb", 0.5);
    const int ND = int(SR);
    std::vector<float> L(ND), R(ND);
    L[0] = R[0] = 0.5f;
    fx->process(L.data(), R.data(), int(SR));
    int pk = 100; for (int i = 100; i < int(SR * 0.4); i++) if (std::fabs(L[i]) > std::fabs(L[pk])) pk = i;
    CHECK(std::fabs(pk - 0.25 * SR) < 20, "delay echo at %.1f ms (expected 250)", pk / SR * 1000);
  }
  // 5. reverb loudness matches Web Audio convolver normalisation for white noise
  std::mt19937 rng(1);
  std::normal_distribution<double> nd(0, 0.1);
  for (double T : {0.3, 1.0, 2.2, 6.0}) {
    auto fx = std::make_unique<FxBus>(SR);
    fx->setParam("revSize", T); fx->setParam("revMix", 1.0 / 0.9); fx->setParam("volume", 1);
    const int N = int(SR * (T * 1.5 + 2));
    std::vector<float> L(N), R(N), dry(N);
    for (int i = 0; i < N; i++) dry[i] = L[i] = R[i] = float(nd(rng));
    fx->process(L.data(), R.data(), N);
    for (int i = 0; i < N; i++) L[i] -= dry[i];  // wet only (EQ flat, drive 0 -> dry passes unchanged)
    const double gain = rms(L, N - int(SR), N) / 0.1;
    const double target = 0.00125 * 44100 * std::sqrt(T / SR);
    CHECK(std::fabs(20 * std::log10(gain / target)) < 1.5, "reverb %.1fs: wet gain %.3f vs web %.3f (%.1f dB)", T, gain, target, 20 * std::log10(gain / target));
  }
  // 6. reverb decay time: -60 dB after ~T seconds
  {
    auto fx = std::make_unique<FxBus>(SR);
    fx->setParam("revSize", 2.0); fx->setParam("revMix", 1); fx->setParam("volume", 1);
    const int N = int(SR * 3);
    std::vector<float> L(N), R(N);
    for (int i = 0; i < 4800; i++) L[i] = R[i] = float(nd(rng));
    fx->process(L.data(), R.data(), N);
    const double early = rms(L, 6000, 6000 + 4800), late = rms(L, int(SR * 2.0), int(SR * 2.0) + 4800);
    const double drop = 20 * std::log10(late / early);
    CHECK(drop < -45 && drop > -75, "reverb 2 s: %.1f dB after 2 s", drop);
  }
  // 7. limiter: hot input never exceeds 0 dBFS
  {
    auto fx = std::make_unique<FxBus>(SR);
    fx->setParam("volume", 1); fx->setParam("drive", 1); fx->setParam("eqLow", 12); fx->setParam("revMix", 1);
    const int N = int(SR);
    std::vector<float> L(N), R(N);
    for (int i = 0; i < N; i++) L[i] = R[i] = float(1.5 * std::sin(2 * M_PI * 80 * i / SR));
    fx->process(L.data(), R.data(), N);
    double pk = 0; for (float v : L) pk = std::fmax(pk, std::fabs(v));
    CHECK(pk <= 1.0, "limiter: peak %.3f <= 1.0", pk);
  }
  // 8. CPU
  {
    auto fx = std::make_unique<FxBus>(SR);
    fx->setParam("delayMix", 0.3); fx->setParam("chorusMix", 0.5); fx->setParam("drive", 0.3);
    std::vector<float> L(128), R(128);
    auto t0 = std::chrono::steady_clock::now();
    for (int p = 0; p < SR * 10; p += 128) { for (int i = 0; i < 128; i++) L[i] = R[i] = 0.1f; fx->process(L.data(), R.data(), 128); }
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::printf("info: FX bus CPU %.2f%% of one core\n", ms / 100);
  }
  std::printf(fails ? "\n%d FAILED\n" : "\nall passed\n", fails);
  return fails;
}
