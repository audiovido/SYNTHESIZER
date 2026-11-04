// Test signals and shaper curves shared by the C++ and JS scene runners
// (wa_scene.cpp / wa_scene.mjs implement the exact same formulas).
#pragma once
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace sig {

/** mulberry32: identical integer math in JS (Math.imul) and C++. */
struct Rng {
  uint32_t a;
  explicit Rng(uint32_t s) : a(s) {}
  double next() {
    a += 0x6D2B79F5u;
    uint32_t t = a;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return ((t ^ (t >> 14)) >> 0) / 4294967296.0;
  }
};

inline std::vector<float> driveCurve(double amount) {  // bus.ts makeDriveCurve
  const double k = amount * 60;
  const int n = 1024;
  std::vector<float> c(n);
  for (int i = 0; i < n; i++) {
    const double x = (static_cast<double>(i) / (n - 1)) * 2 - 1;
    c[i] = static_cast<float>(k == 0 ? x : ((1 + k) * x) / (1 + k * std::fabs(x)));
  }
  return c;
}
inline std::vector<float> tanhCurve() {  // bus.ts makeTanhCurve
  const int n = 1024;
  const double k = 1.6;
  std::vector<float> c(n);
  for (int i = 0; i < n; i++) {
    const double x = (static_cast<double>(i) / (n - 1)) * 2 - 1;
    c[i] = static_cast<float>(std::tanh(x * k) / std::tanh(k));
  }
  return c;
}
inline std::vector<float> softClipCurve() {  // bus.ts makeSoftClipCurve
  const int n = 8193;
  std::vector<float> c(n);
  for (int i = 0; i < n; i++) {
    const double x = ((static_cast<double>(i) / (n - 1)) * 2 - 1) * 4;
    const double a = std::fabs(x);
    const double y = a <= 0.9 ? a : 0.9 + 0.1 * std::tanh((a - 0.9) / 0.1);
    c[i] = static_cast<float>(x < 0 ? -y : y);
  }
  return c;
}

/** Stereo test input. noise: white; tone: sine at hz (R a fifth up); burst: 50 ms noise bursts every 400 ms;
 *  chord: three detuned saws with a slow envelope (a synth-like signal). */
inline std::vector<std::vector<float>> feed(const std::string& kind, double p, double amp, size_t n, double sr) {
  std::vector<std::vector<float>> d(2, std::vector<float>(n));
  Rng r(static_cast<uint32_t>(p));
  const double PI = 3.14159265358979323846;
  for (size_t i = 0; i < n; i++) {
    const double t = i / sr;
    double l = 0, rr = 0;
    if (kind == "noise") { l = r.next() * 2 - 1; rr = r.next() * 2 - 1; }
    else if (kind == "tone") { l = std::sin(2 * PI * p * t); rr = std::sin(2 * PI * p * 1.5 * t); }
    else if (kind == "burst") {
      const double ph = std::fmod(t, 0.4);
      const double nl = r.next() * 2 - 1, nr = r.next() * 2 - 1;
      const double e = ph < 0.05 ? std::exp(-ph * 60) : 0;
      l = nl * e; rr = nr * e;
    } else if (kind == "chord") {
      const double f[3] = {110, 164.81, 220.5};
      for (int k = 0; k < 3; k++) {
        const double ph = std::fmod(t * f[k], 1.0);
        l += (2 * ph - 1) / 3;
        rr += (2 * std::fmod(t * f[k] * 1.003, 1.0) - 1) / 3;
      }
      const double env = std::fmin(1.0, t * 8) * (std::fmod(t, 1.0) < 0.6 ? 1 : 0.2);
      l *= env; rr *= env;
    }
    d[0][i] = static_cast<float>(l * amp);
    d[1][i] = static_cast<float>(rr * amp);
  }
  return d;
}

}  // namespace sig
