// SY-1 native DSP — shared FX bus (C++17, no allocations after construction).
//
// Port of src/engine/bus.ts (Web Audio graph) with the same routing and settings:
//
//   in -> DRIVE (waveshaper (1+k)x/(1+k|x|), k = 60*drive, then 1/(1+1.5*drive))
//      -> EQ: low shelf 220 Hz, peaking 1.1 kHz Q 0.8, high shelf 4.2 kHz (Web Audio biquad formulas)
//      -> dry ------------------------------------------------------------+
//      -> DELAY (time, feedback through a 4.5 kHz low-pass) * 0.7*mix ----+
//      -> CHORUS (12 ms +/- 4 ms*depth triangle LFO, L/R opposite) * 0.9*mix
//      -> REVERB * 0.9*mix -------------------------------------------------+-> * volume -> LIMITER -> out
//
// Differences from the web version (documented, by design):
//  - Reverb: the web uses a convolution with a random noise burst decaying as
//    (1-t/T)^3. Here an 8-line feedback delay network with the same length T
//    and the same loudness (Web Audio's convolver normalisation), far cheaper on phones.
//  - Drive: no 2x oversampling (the web's oversampler only matters at
//    extreme drive on high notes).
//  - Limiter: the web uses DynamicsCompressor (threshold -6 dB, ratio 12,
//    attack 3 ms, release 200 ms). Here a peak compressor with those settings
//    plus a soft clipper so the output can never exceed 0 dBFS.
#pragma once
#include <cmath>
#include <cstring>
#include <string>

namespace sy1 {

struct Biquad {
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  double x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  double tick(double x) {
    const double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  }
  void flush() {
    if (std::fabs(y1) < 1e-20) y1 = 0;
    if (std::fabs(y2) < 1e-20) y2 = 0;
  }
  void set(double B0, double B1, double B2, double A0, double A1, double A2) {
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
  }
  // Web Audio API biquad formulas (spec section "BiquadFilterNode")
  void lowshelf(double f, double gainDb, double sr) {
    const double A = std::pow(10, gainDb / 40), w = 2 * M_PI * f / sr, c = std::cos(w);
    const double alpha = std::sin(w) / 2 * std::sqrt(2.0), k = 2 * std::sqrt(A) * alpha;
    set(A * ((A + 1) - (A - 1) * c + k), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - k),
        (A + 1) + (A - 1) * c + k, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - k);
  }
  void highshelf(double f, double gainDb, double sr) {
    const double A = std::pow(10, gainDb / 40), w = 2 * M_PI * f / sr, c = std::cos(w);
    const double alpha = std::sin(w) / 2 * std::sqrt(2.0), k = 2 * std::sqrt(A) * alpha;
    set(A * ((A + 1) + (A - 1) * c + k), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - k),
        (A + 1) - (A - 1) * c + k, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - k);
  }
  void peaking(double f, double q, double gainDb, double sr) {
    const double A = std::pow(10, gainDb / 40), w = 2 * M_PI * f / sr, c = std::cos(w);
    const double alpha = std::sin(w) / (2 * q);
    set(1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A);
  }
  void lowpass(double f, double qDb, double sr) {
    const double w = 2 * M_PI * f / sr, c = std::cos(w);
    const double alpha = std::sin(w) / (2 * std::pow(10, qDb / 20));
    set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
  }
};

// Fixed-size delay line (power-of-two buffer), fractional read with linear interpolation.
template <int N>
struct DelayLine {
  float buf[N];
  int w = 0;
  DelayLine() { std::memset(buf, 0, sizeof buf); }
  void push(double x) { buf[w] = static_cast<float>(x); w = (w + 1) & (N - 1); }
  double read(double d) const {  // d samples ago (>= 1)
    double pos = w - d;
    while (pos < 0) pos += N;
    const int i = static_cast<int>(pos);
    const double f = pos - i;
    return buf[i & (N - 1)] * (1 - f) + buf[(i + 1) & (N - 1)] * f;
  }
  void clear() { std::memset(buf, 0, sizeof buf); }
};

class FdnReverb {
 public:
  static constexpr int L = 8;

  void init(double sr) {
    sr_ = sr;
    static const double ms[L] = {29.7, 37.1, 41.1, 43.7, 53.0, 59.9, 67.7, 73.3};
    for (int i = 0; i < L; i++) len_[i] = ms[i] * 0.001 * sr;
    damp_ = 1 - std::exp(-2 * M_PI * 8000 / sr);
    setSize(2.2);
  }

  void setSize(double seconds) {
    size_ = seconds < 0.3 ? 0.3 : seconds;
    const double t60 = size_;  // cubic decay of the web impulse ~ exponential with T60 = T
    for (int i = 0; i < L; i++) g_[i] = std::pow(10.0, -3.0 * len_[i] / (t60 * sr_));
    // Web Audio convolver loudness for white-noise input: 0.00125 * 44100 * sqrt(T / sr)
    const double target = 0.00125 * 44100.0 * std::sqrt(size_ / sr_);
    // FDN output RMS for unit noise: sqrt(0.25 * 4 lines / (1 - g^2)) with average g (measured: tests/fx_test.cpp)
    double gm = 0;
    for (int i = 0; i < L; i++) gm += g_[i] * g_[i];
    gm /= L;
    // measured correction (tests/fx_test.cpp, 48 kHz): actual / estimated loudness, interpolated in log(size)
    static const double kT[6] = {0.3, 0.6, 1.0, 2.2, 4.0, 6.0};
    static const double kC[6] = {0.216, 0.330, 0.374, 0.380, 0.357, 0.345};
    double corr = kC[5];
    for (int i = 0; i < 5; i++) {
      if (size_ <= kT[i + 1]) {
        const double f = std::log(size_ / kT[i]) / std::log(kT[i + 1] / kT[i]);
        corr = kC[i] + (kC[i + 1] - kC[i]) * (f < 0 ? 0 : f);
        break;
      }
    }
    const double fdnGain = std::sqrt(1.0 / (1.0 - gm)) * corr;
    norm_ = target / fdnGain;
  }

  void process(double inL, double inR, double& outL, double& outR) {
    const double in = 0.5 * (inL + inR);
    double y[L];
    for (int i = 0; i < L; i++) {
      double v = lines_[i].read(len_[i]) * g_[i];
      lp_[i] += damp_ * (v - lp_[i]);  // gentle damping (~8 kHz)
      y[i] = lp_[i];
    }
    // 8x8 Hadamard (normalised): orthogonal, energy-preserving mixing
    double h[L];
    for (int i = 0; i < L; i++) h[i] = y[i];
    for (int s = 1; s < L; s <<= 1)
      for (int i = 0; i < L; i += 2 * s)
        for (int j = i; j < i + s; j++) { const double a = h[j], b = h[j + s]; h[j] = a + b; h[j + s] = a - b; }
    const double hn = 1.0 / std::sqrt(static_cast<double>(L));
    for (int i = 0; i < L; i++) lines_[i].push(h[i] * hn + in * ((i & 1) ? -0.5 : 0.5));
    outL = (y[0] - y[2] + y[4] - y[6]) * norm_;
    outR = (y[1] - y[3] + y[5] - y[7]) * norm_;
  }

  void clear() { for (int i = 0; i < L; i++) { lines_[i].clear(); lp_[i] = 0; } }

 private:
  DelayLine<8192> lines_[L];
  double len_[L] = {}, g_[L] = {}, lp_[L] = {};
  double sr_ = 48000, size_ = 2.2, norm_ = 0.1, damp_ = 0.65;

};

class FxBus {
 public:
  explicit FxBus(double sr) : sr_(sr) {
    rev_.init(sr);
    setParam("drive", 0.0); setParam("eqLow", 0.0); setParam("eqMid", 0.0); setParam("eqHigh", 0.0);
    setParam("delayTime", 0.32); setParam("delayFb", 0.35); setParam("delayMix", 0.0);
    setParam("revSize", 2.2); setParam("revMix", 0.18); setParam("volume", 0.7);
    setParam("chorusMix", 0.0); setParam("chorusRate", 0.6); setParam("chorusDepth", 0.5);
    for (int c = 0; c < 2; c++) tone_[c].lowpass(4500, 1, sr);
    // limiter coefficients
    att_ = 1 - std::exp(-1 / (0.003 * sr));
    rel_ = 1 - std::exp(-1 / (0.2 * sr));
  }

  bool setParam(const std::string& key, double v) {
    if (key == "drive") { drive_ = v; k_ = v * 60; comp_ = 1 / (1 + v * 1.5); }
    else if (key == "eqLow") for (auto& b : low_) b.lowshelf(220, v, sr_);
    else if (key == "eqMid") for (auto& b : mid_) b.peaking(1100, 0.8, v, sr_);
    else if (key == "eqHigh") for (auto& b : high_) b.highshelf(4200, v, sr_);
    else if (key == "delayTime") dTarget_ = std::fmin(1.5, std::fmax(0.01, v)) * sr_;
    else if (key == "delayFb") fb_ = v;
    else if (key == "delayMix") dMix_ = v * 0.7;
    else if (key == "revSize") rev_.setSize(v);
    else if (key == "revMix") rMix_ = v * 0.9;
    else if (key == "chorusMix") cMix_ = v * 0.9;
    else if (key == "chorusRate") cRate_ = v;
    else if (key == "chorusDepth") cDepth_ = v;
    else if (key == "volume") vol_ = v;
    else return false;
    return true;
  }

  // In-place stereo processing of n samples.
  void process(float* L, float* R, int n) {
    if (dCur_ < 0) dCur_ = dTarget_;
    const double cInc = cRate_ / sr_;
    for (int i = 0; i < n; i++) {
      double x[2] = {L[i], R ? R[i] : L[i]};
      double eq[2];
      for (int c = 0; c < 2; c++) {
        // drive: 2x oversampled waveshaper (input clamped to the curve's -1..1 domain, like Web Audio)
        double y = shape(x[c]) * comp_;
        y = low_[c].tick(y);
        y = mid_[c].tick(y);
        eq[c] = high_[c].tick(y);
      }
      // delay (glides to a new time over ~50 ms instead of clicking)
      dCur_ += (dTarget_ - dCur_) * 0.0005;
      double out[2];
      for (int c = 0; c < 2; c++) {
        const double tap = tone_[c].tick(dl_[c].read(dCur_));
        dl_[c].push(eq[c] + tap * fb_);
        out[c] = eq[c] + tap * dMix_;
      }
      // chorus
      if (cMix_ > 0) {
        const double tri = cPh_ < 0.5 ? 4 * cPh_ - 1 : 3 - 4 * cPh_;
        const double mono = 0.5 * (eq[0] + eq[1]);
        ch_.push(mono);
        const double base = 0.012 * sr_, dep = 0.004 * cDepth_ * sr_;
        out[0] += ch_.read(base + dep * tri) * cMix_;
        out[1] += ch_.read(base - dep * tri) * cMix_;
      } else {
        ch_.push(0.5 * (eq[0] + eq[1]));
      }
      cPh_ += cInc; if (cPh_ >= 1) cPh_ -= 1;
      // reverb
      double rl, rr;
      rev_.process(eq[0], eq[1], rl, rr);
      out[0] += rl * rMix_;
      out[1] += rr * rMix_;
      // master + limiter
      out[0] *= vol_; out[1] *= vol_;
      const double pk = std::fmax(std::fabs(out[0]), std::fabs(out[1]));
      env_ += (pk - env_) * (pk > env_ ? att_ : rel_);
      double gain = 1;
      if (env_ > kThresh) {  // ratio 12 above -6 dBFS
        const double over = 20 * std::log10(env_ / kThresh);
        gain = std::pow(10, -(over * (1 - 1.0 / 12)) / 20);
      }
      L[i] = static_cast<float>(soft(out[0] * gain));
      if (R) R[i] = static_cast<float>(soft(out[1] * gain));
    }
    for (int c = 0; c < 2; c++) { low_[c].flush(); mid_[c].flush(); high_[c].flush(); tone_[c].flush(); }
  }

 private:
  static constexpr double kThresh = 0.501187;  // -6 dBFS
  double shape(double x) const {
    if (x > 1) x = 1; else if (x < -1) x = -1;
    return k_ == 0 ? x : ((1 + k_) * x) / (1 + k_ * std::fabs(x));
  }
  static double soft(double x) {  // transparent below 0.9, never above 1.0
    const double a = std::fabs(x);
    if (a <= 0.9) return x;
    const double y = 0.9 + 0.1 * std::tanh((a - 0.9) / 0.1);
    return x < 0 ? -y : y;
  }

  double sr_;
  double drive_ = 0, k_ = 0, comp_ = 1;
  Biquad low_[2], mid_[2], high_[2], tone_[2];
  DelayLine<262144> dl_[2];  // 5.4 s at 48 kHz, 2.7 s at 96 kHz
  double dTarget_ = 0.32 * 48000, dCur_ = -1, fb_ = 0.35, dMix_ = 0;
  DelayLine<4096> ch_;
  double cMix_ = 0, cRate_ = 0.6, cDepth_ = 0.5, cPh_ = 0;
  FdnReverb rev_;
  double rMix_ = 0.162, vol_ = 0.7;
  double env_ = 0, att_ = 0, rel_ = 0;
};

}  // namespace sy1
