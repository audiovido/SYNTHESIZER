// SY-1 native — Nishapur's vector morph engine: line-by-line port of
// src/engine/worklet/vector-processor.ts ("sy1-vector"), as a wa worklet node.
// Precision follows JS: doubles everywhere; the sine table, the wavetables, the
// drawn path and the output buffer are float (Float32Array), and voices add into
// the output one at a time.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <vector>

#include "../host/worklets.hpp"

namespace sy1 {

class VectorWorklet : public WorkletNode {
 public:
  explicit VectorWorklet(wa::Context* c) : WorkletNode(c) {
    tables();
    voices_.resize(kPool);
    q_.reserve(kQueue);
    // default 64-point 3-lobed star path for DRAWN mode
    double sx = 0, sy = 0;
    for (int i = 0; i < 64; i++) {
      const double a = (2 * kPi * i) / 64;
      const double r = 0.28 + 0.14 * std::cos(3 * a);
      const double px = 0.5 + std::cos(a) * r;
      const double py = 0.5 + std::sin(a) * r;
      drawnX_[i] = static_cast<float>(px);
      drawnY_[i] = static_cast<float>(py);
      sx += px;
      sy += py;
    }
    drawnLen_ = 64;
    drawnCx_ = sx / 64;
    drawnCy_ = sy / 64;
  }

  void param(const std::string& key, double n) override {
    if (key == "orbitMode") { orbitMode_ = 3; return; }  // a number is none of "off" / "circle" / "figure8"
    if (key == "filterType") { filterType_ = 0; return; }
    setParam(key, n);
  }
  void param(const std::string& key, const std::string& v) override {
    if (key == "orbitMode") { orbitMode_ = v == "off" ? 0 : v == "circle" ? 1 : v == "figure8" ? 2 : 3; return; }
    if (key == "filterType") { filterType_ = v == "bandpass" ? 1 : v == "highpass" ? 2 : 0; return; }
    // JS Number(v): "" and whitespace are 0, anything not numeric is NaN (ignored)
    const char* s = v.c_str();
    while (*s == ' ' || *s == '\t' || *s == '\n') s++;
    if (!*s) { setParam(key, 0); return; }
    char* end = nullptr;
    const double d = std::strtod(s, &end);
    while (end && (*end == ' ' || *end == '\t' || *end == '\n')) end++;
    if (end && !*end) setParam(key, d);
  }
  void snap() override {
    vecX_.cur = vecX_.target;
    vecY_.cur = vecY_.target;
    curX_.cur = vecX_.target;
    curY_.cur = vecY_.target;
    orbitSize_.cur = orbitSize_.target;
    vecAPw_.cur = vecAPw_.target;
    vecALevel_.cur = vecALevel_.target;
    vecBIndex_.cur = vecBIndex_.target;
    vecBLevel_.cur = vecBLevel_.target;
    vecCPos_.cur = vecCPos_.target;
    vecCLevel_.cur = vecCLevel_.target;
    vecDVowel_.cur = vecDVowel_.target;
    vecDLevel_.cur = vecDLevel_.target;
    cutoff_.cur = cutoff_.target;
    res_.cur = res_.target;
    envAmt_.cur = envAmt_.target;
  }
  /** pts: x0, y0, x1, y1... (already Number(p[k]) || 0.5 on the JS side) */
  void path(const std::vector<double>& pts) override {
    const int count = static_cast<int>(pts.size() / 2);
    if (count < 2) return;
    const int len = std::min(kMaxPath, count);
    double sx = 0, sy = 0;
    for (int i = 0; i < len; i++) {
      const double px = std::max(0.0, std::min(1.0, pts[2 * i]));
      const double py = std::max(0.0, std::min(1.0, pts[2 * i + 1]));
      drawnX_[i] = static_cast<float>(px);
      drawnY_[i] = static_cast<float>(py);
      sx += px;
      sy += py;
    }
    drawnLen_ = len;
    drawnCx_ = sx / len;
    drawnCy_ = sy / len;
  }
  void message(const std::string& t, int id, double midi, double cents, double vel, double at, double from, double glide, double v) override {
    if (t == "on" || t == "off" || t == "kill" || t == "glide") {
      if (q_.size() >= kQueue) return;
      q_.push_back({t == "on" ? 1 : t == "off" ? 2 : t == "kill" ? 3 : 4, at, id, midi ? midi : 60, cents, vel, from, glide});
    } else if (t == "alloff") {
      q_.clear();
      for (auto& vo : voices_) if (vo.active) { vo.released = true; vo.relFast = 0.015; vo.ampStage = 3; vo.fltStage = 3; }
    } else if (t == "bend") bend_.target = v;
    else if (t == "mod") modWheel_.target = v;
  }

 private:
  static constexpr int kPool = 16, kMaxSounding = 10, kMaxActive = 16, kTab = 2048, kMask = kTab - 1, kFrames = 8, kMaxPath = 256;
  static constexpr size_t kQueue = 512;
  static constexpr double kPi = 3.14159265358979323846;
  struct Smooth { double target, cur; explicit Smooth(double v = 0) : target(v), cur(v) {} void step(double a) { cur += (target - cur) * a; } };
  struct Ev { int type; double at; int id; double midi, cents, vel, from, glide; };
  struct Voice {
    bool active = false, released = false;
    int id = 0;
    long order = 0;
    double vel = 1, midi = 60;
    int delay = 0;
    double relDelay = -1, relFast = 0, lf = 0, lfTarget = 0, glideC = 1;
    double phA1 = 0, phA2 = 0, phBc = 0, phBm = 0, bellEnv = 1, phC1 = 0, phC2 = 0, phD = 0;
    double f1Ic1 = 0, f1Ic2 = 0, f2Ic1 = 0, f2Ic2 = 0;
    double svfIc1L = 0, svfIc2L = 0, svfIc1R = 0, svfIc2R = 0;
    double ampEnv = 0, fltEnv = 0;
    int ampStage = 0, fltStage = 0;
    double silent = 0;
    void start(int i, long o, double hz, double v, double m, int d, double seed) {
      active = true; released = false; id = i; order = o; vel = v; midi = m; delay = d;
      relDelay = -1; relFast = 0; lf = std::log2(hz); lfTarget = lf; glideC = 1;
      const double s0 = std::fmod(seed * 0.173, 1.0);
      phA1 = s0;
      phA2 = std::fmod(s0 + 0.37, 1.0);
      phBc = 0; phBm = 0; bellEnv = 1;
      phC1 = std::fmod(s0 * kTab, static_cast<double>(kTab));
      phC2 = std::fmod((s0 + 0.5) * kTab, static_cast<double>(kTab));
      phD = std::fmod(s0 + 0.23, 1.0);
      f1Ic1 = f1Ic2 = f2Ic1 = f2Ic2 = 0;
      svfIc1L = svfIc2L = svfIc1R = svfIc2R = 0;
      ampEnv = 0; ampStage = 0; fltEnv = 0; fltStage = 0; silent = 0;
    }
  };

  static float sine_[kTab + 1];
  static float wt_[kFrames * (kTab + 1)];
  // built once (thread-safe: several plugin instances can start on different threads)
  static void tables() { static const bool built = (buildTables(), true); (void)built; }
  static void buildTables() {
    for (int i = 0; i <= kTab; i++) sine_[i] = static_cast<float>(std::sin((2 * kPi * i) / kTab));
    static const std::vector<std::vector<double>> spectra = {
      {1.0, 0.55, 0.3, 0.12, 0.06, 0.03},
      {1.0, 0, 0.65, 0, 0.42, 0, 0.25, 0, 0.14, 0, 0.08},
      {0.7, 0.35, 0.25, 0.65, 0.85, 0.7, 0.45, 0.2, 0.1},
      {0.9, 0.6, 0.5, 0.45, 0.1, 0.4, 0.05, 0.35, 0.3, 0, 0, 0.25, 0, 0, 0, 0.18},
      {0.5, 0.3, 0.25, 0.35, 0.55, 0.8, 0.9, 0.75, 0.55, 0.35, 0.2, 0.1},
      {0.85, 0.15, 0.6, 0.05, 0.1, 0.55, 0, 0.08, 0.45, 0, 0, 0.35, 0, 0, 0.25},
      {0.9, -0.5, 0.45, -0.4, 0.35, -0.3, 0.26, -0.22, 0.18, -0.15, 0.12, -0.1, 0.08, -0.06},
      {0.65, 0.1, 0.15, 0.1, 0.55, 0.05, 0.45, 0.05, 0.4, 0, 0.35, 0, 0.3, 0, 0.25, 0, 0.2, 0, 0.15}};
    for (int f = 0; f < kFrames; f++) {
      const auto& amps = spectra[f];
      const int base = f * (kTab + 1);
      double maxAbs = 1e-6;
      for (int i = 0; i < kTab; i++) {
        const double ph = (2 * kPi * i) / kTab;
        double sum = 0;
        for (size_t h = 0; h < amps.size(); h++) {
          const double a = amps[h];
          if (a != 0) sum += a * std::sin((h + 1) * ph + (h * 0.37));
        }
        wt_[base + i] = static_cast<float>(sum);
        const double ab = sum < 0 ? -sum : sum;
        if (ab > maxAbs) maxAbs = ab;
      }
      const double norm = 0.92 / maxAbs;
      for (int i = 0; i < kTab; i++) wt_[base + i] = static_cast<float>(wt_[base + i] * norm);
      wt_[base + kTab] = wt_[base];
    }
  }
  static constexpr double kF1[5] = {730, 530, 270, 570, 300};
  static constexpr double kF2[5] = {1090, 1840, 2290, 840, 870};

  static double fastTanh(double x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const double x2 = x * x;
    return (x * (27 + x2)) / (27 + 9 * x2);
  }
  static double polyBlep(double t, double dt) {
    if (t < dt) { const double x = t / dt; return x + x - x * x - 1; }
    if (t > 1 - dt) { const double x = (t - 1) / dt; return x * x + x + x + 1; }
    return 0;
  }
  static int toInt32(double x) { return static_cast<int>(x); }  // JS `x | 0` for the in-range values used here

  std::vector<Voice> voices_;
  std::vector<Ev> q_;
  long counter_ = 0;
  int32_t rng_ = 22222;
  Smooth vecX_{0.5}, vecY_{0.5}, curX_{0.5}, curY_{0.5};
  int orbitMode_ = 1;
  double orbitRateHz_ = 0.35;
  Smooth orbitSize_{0.55};
  double orbitPhase_ = 0;
  float drawnX_[kMaxPath] = {}, drawnY_[kMaxPath] = {};
  int drawnLen_ = 64;
  double drawnCx_ = 0.5, drawnCy_ = 0.5;
  Smooth vecAPw_{0.35}, vecALevel_{0.85};
  double vecBRatio_ = 3.5;
  Smooth vecBIndex_{0.45}, vecBLevel_{0.85}, vecCPos_{0.4}, vecCLevel_{0.85}, vecDVowel_{0.3}, vecDLevel_{0.85};
  int filterType_ = 0;
  Smooth cutoff_{2400}, res_{2.0}, envAmt_{0.4};
  double fA_ = 0.015, fD_ = 0.5, fS_ = 0.35, fR_ = 0.45, aA_ = 0.02, aD_ = 0.5, aS_ = 0.75, aR_ = 0.55, velSens_ = 0.6, bendRange_ = 2;
  Smooth bend_{0}, modWheel_{0};

  static double clamp(double v, double lo, double hi) { return std::max(lo, std::min(hi, v)); }
  void setParam(const std::string& key, double n) {
    if (!std::isfinite(n)) return;
    if (key == "vecX") vecX_.target = clamp(n, 0, 1);
    else if (key == "vecY") vecY_.target = clamp(n, 0, 1);
    else if (key == "orbitRateHz") orbitRateHz_ = clamp(n, 0.01, 30);
    else if (key == "orbitRate") orbitRateHz_ = clamp(n, 0.02, 20);
    else if (key == "orbitSize") orbitSize_.target = clamp(n, 0, 1);
    else if (key == "vecAPw") vecAPw_.target = clamp(n, 0.05, 0.95);
    else if (key == "vecALevel") vecALevel_.target = clamp(n, 0, 1);
    else if (key == "vecBRatio") vecBRatio_ = clamp(n, 0.25, 16);
    else if (key == "vecBIndex") vecBIndex_.target = clamp(n, 0, 1);
    else if (key == "vecBLevel") vecBLevel_.target = clamp(n, 0, 1);
    else if (key == "vecCPos") vecCPos_.target = clamp(n, 0, 1);
    else if (key == "vecCLevel") vecCLevel_.target = clamp(n, 0, 1);
    else if (key == "vecDVowel") vecDVowel_.target = clamp(n, 0, 1);
    else if (key == "vecDLevel") vecDLevel_.target = clamp(n, 0, 1);
    else if (key == "cutoff") cutoff_.target = clamp(n, 40, 18000);
    else if (key == "res") res_.target = clamp(n, 0.1, 18);
    else if (key == "envAmt") envAmt_.target = clamp(n, 0, 1);
    else if (key == "fA") fA_ = std::max(0.001, n);
    else if (key == "fD") fD_ = std::max(0.005, n);
    else if (key == "fS") fS_ = clamp(n, 0, 1);
    else if (key == "fR") fR_ = std::max(0.005, n);
    else if (key == "aA") aA_ = std::max(0.001, n);
    else if (key == "aD") aD_ = std::max(0.005, n);
    else if (key == "aS") aS_ = clamp(n, 0, 1);
    else if (key == "aR") aR_ = std::max(0.005, n);
    else if (key == "velSens") velSens_ = clamp(n, 0, 1);
    else if (key == "bendRange") bendRange_ = clamp(n, 0, 12);
  }
  Voice* find(int id) { for (auto& v : voices_) if (v.active && v.id == id) return &v; return nullptr; }
  static void release(Voice& v, double fast) { v.released = true; v.relFast = fast; v.ampStage = 3; v.fltStage = 3; }
  void noteOn(const Ev& e, int offset) {
    int sounding = 0, active = 0;
    Voice *oldS = nullptr, *oldA = nullptr;
    for (auto& v : voices_) {
      if (!v.active) continue;
      active++;
      if (!oldA || v.order < oldA->order) oldA = &v;
      if (!v.released) { sounding++; if (!oldS || v.order < oldS->order) oldS = &v; }
    }
    if (sounding >= kMaxSounding && oldS) release(*oldS, 0.02);
    if (active >= kMaxActive && oldA) release(*oldA, 0.005);
    Voice* slot = nullptr;
    for (auto& v : voices_) if (!v.active) { slot = &v; break; }
    if (!slot) for (auto& v : voices_) if (!slot || v.order < slot->order) slot = &v;
    const double target = 440 * std::pow(2.0, (e.midi - 69) / 12 + e.cents / 1200);
    const long order = ++counter_;
    slot->start(e.id, order, e.from > 0 ? e.from : target, std::max(0.05, std::min(1.0, e.vel)), e.midi, offset, static_cast<double>(order));
    if (e.from > 0 && e.glide > 0.004) {
      slot->lfTarget = std::log2(target);
      slot->glideC = 1 - std::exp(-1 / ((e.glide / 3) * ctx->sampleRate));
    }
  }
  void handleEvents(int n) {
    const double sr = ctx->sampleRate, now = ctx->currentTime();
    size_t w = 0;
    for (size_t r = 0; r < q_.size(); r++) {
      Ev& e = q_[r];
      long off = static_cast<long>(std::floor((e.at - now) * sr + 0.5));
      if (off >= n) { if (w != r) std::swap(q_[w], q_[r]); w++; continue; }
      if (off < 0) off = 0;
      if (e.type == 1) noteOn(e, static_cast<int>(off));
      else {
        Voice* v = find(e.id);
        if (!v) continue;
        if (e.type == 2) { v->relDelay = std::max<double>(static_cast<double>(off), v->delay); v->relFast = 0; }
        else if (e.type == 3) { v->relDelay = std::max<double>(static_cast<double>(off), v->delay); v->relFast = 0.005; }
        else if (e.type == 4) {
          v->lfTarget = std::log2(440 * std::pow(2.0, (e.midi - 69) / 12 + e.cents / 1200));
          v->glideC = e.glide > 0.004 ? 1 - std::exp(-1 / ((e.glide / 3) * sr)) : 1;
        }
      }
    }
    q_.resize(w);
  }

 protected:
  void process() override {
    deliverDeferred();
    out.channels = 2;
    out.zero();
    float* L = out.ch[0];
    float* R = out.ch[1];
    const int n = wa::RQ;
    handleEvents(n);
    const double sr = ctx->sampleRate;
    const double sm = 1 - std::exp(-n / (0.015 * sr));
    vecX_.step(sm); vecY_.step(sm); orbitSize_.step(sm);
    vecAPw_.step(sm); vecALevel_.step(sm); vecBIndex_.step(sm); vecBLevel_.step(sm);
    vecCPos_.step(sm); vecCLevel_.step(sm); vecDVowel_.step(sm); vecDLevel_.step(sm);
    cutoff_.step(sm); res_.step(sm); envAmt_.step(sm); bend_.step(sm); modWheel_.step(sm);

    // orbit on the audio clock
    const double effSize = std::min(1.0, orbitSize_.cur + modWheel_.cur);
    double tx = vecX_.cur, ty = vecY_.cur;
    if (orbitMode_ > 0) {
      orbitPhase_ = std::fmod(orbitPhase_ + (orbitRateHz_ * n) / sr, 1.0);
      const double p = orbitPhase_;
      if (orbitMode_ == 1) {
        const double ang = 2 * kPi * p;
        tx = clamp(tx + std::cos(ang) * 0.42 * effSize, 0, 1);
        ty = clamp(ty + std::sin(ang) * 0.42 * effSize, 0, 1);
      } else if (orbitMode_ == 2) {
        const double ang = 2 * kPi * p;
        tx = clamp(tx + std::sin(ang) * 0.44 * effSize, 0, 1);
        ty = clamp(ty + std::sin(2 * ang) * 0.36 * effSize, 0, 1);
      } else if (orbitMode_ == 3 && drawnLen_ >= 2) {
        const double pos = p * drawnLen_;
        const int i0 = toInt32(pos);
        const int i1 = (i0 + 1) % drawnLen_;
        const double fr = pos - i0;
        const double px = static_cast<double>(drawnX_[i0]) + (static_cast<double>(drawnX_[i1]) - static_cast<double>(drawnX_[i0])) * fr;
        const double py = static_cast<double>(drawnY_[i0]) + (static_cast<double>(drawnY_[i1]) - static_cast<double>(drawnY_[i0])) * fr;
        const double cx = drawnCx_ + (vecX_.cur - 0.5);
        const double cy = drawnCy_ + (vecY_.cur - 0.5);
        tx = clamp(cx + (px - drawnCx_) * effSize, 0, 1);
        ty = clamp(cy + (py - drawnCy_) * effSize, 0, 1);
      }
    }
    curX_.target = tx;
    curY_.target = ty;
    curX_.step(sm);
    curY_.step(sm);

    // equal-power bilinear corner weights
    const double x = curX_.cur, y = curY_.cur;
    const double wx0 = std::cos(x * kPi * 0.5), wx1 = std::sin(x * kPi * 0.5);
    const double wy0 = std::cos(y * kPi * 0.5), wy1 = std::sin(y * kPi * 0.5);
    const double gA = wx0 * wy0 * vecALevel_.cur;
    const double gB = wx1 * wy0 * vecBLevel_.cur;
    const double gC = wx0 * wy1 * vecCLevel_.cur;
    const double gD = wx1 * wy1 * vecDLevel_.cur;

    const double cPosScaled = vecCPos_.cur * (kFrames - 1);
    const int wtF0 = std::min(kFrames - 2, toInt32(cPosScaled));
    const double wtFrac = cPosScaled - wtF0;
    const int wtBase0 = wtF0 * (kTab + 1);
    const int wtBase1 = (wtF0 + 1) * (kTab + 1);

    const double vScaled = vecDVowel_.cur * 4;
    const int vIdx = std::min(3, toInt32(vScaled));
    const double vFrac = vScaled - vIdx;
    const double f1Hz = kF1[vIdx] * std::pow(kF1[vIdx + 1] / kF1[vIdx], vFrac);
    const double f2Hz = kF2[vIdx] * std::pow(kF2[vIdx + 1] / kF2[vIdx], vFrac);
    const double f1G = std::tan((kPi * std::min(sr * 0.42, f1Hz)) / sr);
    const double f2G = std::tan((kPi * std::min(sr * 0.42, f2Hz)) / sr);
    const double formK = 1 / 9.0;
    const double f1A1 = 1 / (1 + f1G * (f1G + formK));
    const double f1A2 = f1G * f1A1;
    const double f2A1 = 1 / (1 + f2G * (f2G + formK));
    const double f2A2 = f2G * f2A1;

    const double aAInc = 1 / std::max(1.0, aA_ * sr);
    const double aDC = 1 - std::exp(-1 / ((aD_ / 3) * sr));
    const double aRC = 1 - std::exp(-1 / ((aR_ / 4) * sr));
    const double fAInc = 1 / std::max(1.0, fA_ * sr);
    const double fDC = 1 - std::exp(-1 / ((fD_ / 3) * sr));
    const double fRC = 1 - std::exp(-1 / ((fR_ / 4) * sr));

    const int fType = filterType_;
    const double resVal = res_.cur;
    const double qLin = fType == 1 ? std::max(0.5, resVal) : std::max(0.5, std::pow(10.0, resVal / 20));
    const double svfK = 1 / std::min(18.0, qLin);
    const double svfDrv = 1 + resVal * 0.12;
    const double svfDrvInv = 1 / svfDrv;

    const double pw = vecAPw_.cur;
    const double fmRatio = vecBRatio_;
    const double fmIdxBase = vecBIndex_.cur * 6.5;
    const double bendCents = bend_.cur * bendRange_ * 100;
    const double baseCut = cutoff_.cur;
    const double envOct = envAmt_.cur * 6;
    const double bellDecay = 1 - 1 / (1.8 * sr);
    const double tabRad = kTab / (2 * kPi);

    uint32_t rng = static_cast<uint32_t>(rng_);

    for (auto& v : voices_) {
      if (!v.active) continue;
      const double velPeak = 0.25 * (1 - velSens_ + velSens_ * v.vel);
      const double keyScale = std::pow(2.0, -std::max(0.0, v.midi - 60) / 32);
      const double fmIndex = fmIdxBase * keyScale * (0.4 + 0.6 * v.vel);
      double svfA1 = 0, svfA2 = 0, svfA3 = 0, peak = 0;

      for (int i = 0; i < n; i++) {
        if (i < v.delay) continue;
        if (v.relDelay >= 0 && i >= v.relDelay) { release(v, v.relFast); v.relDelay = -1; }
        if (v.lf != v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (std::fabs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }

        double ae = v.ampEnv;
        if (v.ampStage == 0) { ae += aAInc; if (ae >= 1) { ae = 1; v.ampStage = 1; } }
        else if (v.ampStage == 1) { ae += (aS_ - ae) * aDC; if (std::fabs(ae - aS_) < 1e-4) v.ampStage = 2; }
        else if (v.ampStage == 3) { const double rc = v.relFast > 0 ? 1 - std::exp(-1 / (v.relFast * sr)) : aRC; ae -= ae * rc; }
        v.ampEnv = ae;

        double fe = v.fltEnv;
        if (v.fltStage == 0) { fe += fAInc; if (fe >= 1) { fe = 1; v.fltStage = 1; } }
        else if (v.fltStage == 1) { fe += (fS_ - fe) * fDC; if (std::fabs(fe - fS_) < 1e-4) v.fltStage = 2; }
        else if (v.fltStage == 3) { fe -= fe * fRC; }
        v.fltEnv = fe;

        const double f0 = std::min(sr * 0.45, std::pow(2.0, v.lf + bendCents / 1200));
        const double dt = f0 / sr;

        // corner A: saw / variable pulse
        double sigA = 0;
        if (gA > 1e-4) {
          double p1 = v.phA1;
          const double saw1 = 2 * p1 - 1 - polyBlep(p1, dt);
          double pulse1 = (p1 < pw ? 1 : -1) - polyBlep(p1, dt);
          const double p1w = std::fmod(p1 + 1 - pw, 1.0);
          pulse1 += polyBlep(p1w, dt);
          p1 += dt;
          if (p1 >= 1) p1 -= 1;
          v.phA1 = p1;
          const double dt2 = dt * 1.0035;
          double p2 = v.phA2;
          const double saw2 = 2 * p2 - 1 - polyBlep(p2, dt2);
          p2 += dt2;
          if (p2 >= 1) p2 -= 1;
          v.phA2 = p2;
          sigA = (0.45 * (saw1 + 0.5 * saw2) + 0.55 * pulse1) * gA;
        } else {
          v.phA1 = std::fmod(v.phA1 + dt, 1.0);
          v.phA2 = std::fmod(v.phA2 + dt * 1.0035, 1.0);
        }

        // corner B: 2-operator FM bell
        double sigB = 0;
        v.bellEnv = 0.28 + (v.bellEnv - 0.28) * bellDecay;
        if (gB > 1e-4) {
          const int mIdx = toInt32(v.phBm) & kMask;
          const double mFrac = v.phBm - toInt32(v.phBm);
          const double modSin = static_cast<double>(sine_[mIdx]) + (static_cast<double>(sine_[mIdx + 1]) - static_cast<double>(sine_[mIdx])) * mFrac;
          const double pm = modSin * fmIndex * v.bellEnv * tabRad;
          const double cPh = std::fmod(std::fmod(v.phBc + pm, static_cast<double>(kTab)) + kTab, static_cast<double>(kTab));
          const int cIdx = toInt32(cPh);
          const double cFrac = cPh - cIdx;
          const double carSin = static_cast<double>(sine_[cIdx]) + (static_cast<double>(sine_[cIdx + 1]) - static_cast<double>(sine_[cIdx])) * cFrac;
          sigB = carSin * gB * 0.9;
        }
        v.phBc += dt * kTab;
        if (v.phBc >= kTab) v.phBc -= kTab;
        v.phBm += dt * fmRatio * kTab;
        if (v.phBm >= kTab) v.phBm = std::fmod(v.phBm, static_cast<double>(kTab));

        // corner C: procedural wavetable
        double sigC = 0;
        if (gC > 1e-4) {
          const int i1 = toInt32(v.phC1);
          const double fr1 = v.phC1 - i1;
          const double w0a = static_cast<double>(wt_[wtBase0 + i1]) + (static_cast<double>(wt_[wtBase0 + i1 + 1]) - static_cast<double>(wt_[wtBase0 + i1])) * fr1;
          const double w1a = static_cast<double>(wt_[wtBase1 + i1]) + (static_cast<double>(wt_[wtBase1 + i1 + 1]) - static_cast<double>(wt_[wtBase1 + i1])) * fr1;
          const double s1 = w0a + (w1a - w0a) * wtFrac;
          const int i2 = toInt32(v.phC2);
          const double fr2 = v.phC2 - i2;
          const double w0b = static_cast<double>(wt_[wtBase0 + i2]) + (static_cast<double>(wt_[wtBase0 + i2 + 1]) - static_cast<double>(wt_[wtBase0 + i2])) * fr2;
          const double w1b = static_cast<double>(wt_[wtBase1 + i2]) + (static_cast<double>(wt_[wtBase1 + i2 + 1]) - static_cast<double>(wt_[wtBase1 + i2])) * fr2;
          const double s2 = w0b + (w1b - w0b) * wtFrac;
          sigC = (s1 + 0.6 * s2) * 0.65 * gC;
        }
        v.phC1 += dt * kTab;
        if (v.phC1 >= kTab) v.phC1 -= kTab;
        v.phC2 += dt * 0.997 * kTab;
        if (v.phC2 >= kTab) v.phC2 -= kTab;

        // corner D: two formant band-passes on noise + glottal pulse
        double sigD = 0;
        rng = rng * 1664525u + 1013904223u;
        const double white = static_cast<double>(static_cast<int32_t>(rng) >> 16) / 32768;
        double pd = v.phD;
        const double glottal = 2 * pd - 1 - polyBlep(pd, dt);
        pd += dt;
        if (pd >= 1) pd -= 1;
        v.phD = pd;
        if (gD > 1e-4) {
          const double dIn = white * 0.65 + glottal * 0.45;
          const double v3_1 = dIn - v.f1Ic2;
          const double v1_1 = f1A1 * v.f1Ic1 + f1A2 * v3_1;
          const double v2_1 = v.f1Ic2 + f1G * v1_1;
          v.f1Ic1 = 2 * v1_1 - v.f1Ic1;
          v.f1Ic2 = 2 * v2_1 - v.f1Ic2;
          const double v3_2 = dIn - v.f2Ic2;
          const double v1_2 = f2A1 * v.f2Ic1 + f2A2 * v3_2;
          const double v2_2 = v.f2Ic2 + f2G * v1_2;
          v.f2Ic1 = 2 * v1_2 - v.f2Ic1;
          v.f2Ic2 = 2 * v2_2 - v.f2Ic2;
          sigD = (v1_1 * 1.35 + v1_2 * 1.15) * gD;
        }

        const double inL = sigA * 1.08 + sigB * 0.92 + sigC * 1.06 + sigD * 0.94;
        const double inR = sigA * 0.92 + sigB * 1.08 + sigC * 0.94 + sigD * 1.06;

        if ((i & 3) == 0 || svfA1 == 0) {
          const double cutHz = std::max(40.0, std::min(sr * 0.44, baseCut * std::pow(2.0, fe * envOct)));
          const double g = std::tan((kPi * cutHz) / sr);
          svfA1 = 1 / (1 + g * (g + svfK));
          svfA2 = g * svfA1;
          svfA3 = g * svfA2;
        }

        const double v3L = inL - v.svfIc2L;
        double v1L = svfA1 * v.svfIc1L + svfA2 * v3L;
        const double v2L = v.svfIc2L + svfA2 * v.svfIc1L + svfA3 * v3L;
        v1L = fastTanh(v1L * svfDrv) * svfDrvInv;
        v.svfIc1L = clamp(2 * v1L - v.svfIc1L, -8, 8);
        v.svfIc2L = clamp(2 * v2L - v.svfIc2L, -8, 8);
        const double fltL = fType == 0 ? v2L : fType == 1 ? v1L : inL - svfK * v1L - v2L;

        const double v3R = inR - v.svfIc2R;
        double v1R = svfA1 * v.svfIc1R + svfA2 * v3R;
        const double v2R = v.svfIc2R + svfA2 * v.svfIc1R + svfA3 * v3R;
        v1R = fastTanh(v1R * svfDrv) * svfDrvInv;
        v.svfIc1R = clamp(2 * v1R - v.svfIc1R, -8, 8);
        v.svfIc2R = clamp(2 * v2R - v.svfIc2R, -8, 8);
        const double fltR = fType == 0 ? v2R : fType == 1 ? v1R : inR - svfK * v1R - v2R;

        const double gain = ae * velPeak;
        const double yL = fltL * gain;
        const double yR = fltR * gain;
        if (!std::isfinite(yL) || !std::isfinite(yR)) { v.active = false; break; }
        L[i] = static_cast<float>(L[i] + yL);
        R[i] = static_cast<float>(R[i] + yR);
        const double ay = std::fabs(yL) > std::fabs(yR) ? std::fabs(yL) : std::fabs(yR);
        if (ay > peak) peak = ay;
      }

      if (v.released && v.ampEnv < 1e-4) v.active = false;
      else if (!v.released && peak < 1e-6) { v.silent += n; if (v.silent > sr * 2) v.active = false; }
      else v.silent = 0;
      v.delay = 0;
    }
    rng_ = static_cast<int32_t>(rng);
  }
};

inline float VectorWorklet::sine_[VectorWorklet::kTab + 1];
inline float VectorWorklet::wt_[VectorWorklet::kFrames * (VectorWorklet::kTab + 1)];

}  // namespace sy1
