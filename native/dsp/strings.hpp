// SY-1 native — Shiraz's physical string engine (santur, setar, tar, kanun,
// oud, harp): line-by-line port of src/engine/worklet/strings-processor.ts
// ("sy1-strings") as a wa worklet node. Precision follows JS: doubles, the
// string and excitation buffers and the output are float (Float32Array).
#pragma once
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

#include "../host/worklets.hpp"

namespace sy1 {

/** JS Number(string): "" / whitespace = 0, invalid = NaN. */
inline double jsNumber(const std::string& v) {
  const char* s = v.c_str();
  while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
  if (!*s) return 0;
  char* end = nullptr;
  const double d = std::strtod(s, &end);
  while (end && (*end == ' ' || *end == '\t' || *end == '\n' || *end == '\r')) end++;
  return end && !*end ? d : std::numeric_limits<double>::quiet_NaN();
}

class StringsWorklet : public WorkletNode {
 public:
  explicit StringsWorklet(wa::Context* c) : WorkletNode(c), voices_(kPool) {}

  void param(const std::string& key, double n) override { setParam(key, n, nullptr); }
  void param(const std::string& key, const std::string& v) override { setParam(key, jsNumber(v), &v); }
  void snap() override { for (Smooth* s : smooths()) s->cur = s->prev = s->target; }
  void message(const std::string& t, int id, double midi, double cents, double vel, double at, double from, double glide, double v) override {
    if (t == "on" || t == "off" || t == "kill" || t == "glide") {
      if (q_.size() >= kQueue) return;
      q_.push_back({t == "on" ? 1 : t == "off" ? 2 : t == "kill" ? 3 : 4, at, id, midi ? midi : 60, cents, vel, from, glide});
    } else if (t == "alloff") {
      q_.clear();
      for (auto& vo : voices_) if (vo.active) release(vo, 0.015);
    } else if (t == "bend") bend_.target = v;
    else if (t == "mod") modWheel_.target = v;
  }

 private:
  static constexpr int kPool = 24, kMaxSounding = 10, kMaxActive = 16, kCourses = 3;
  static constexpr int kBuf = 4096, kBufMask = kBuf - 1, kExc = 512, kExcMask = kExc - 1;
  static constexpr size_t kQueue = 512;
  static constexpr double kPi = 3.14159265358979323846, kSqrt2 = 1.4142135623730951;

  struct Smooth {
    double target, cur, prev;
    explicit Smooth(double v = 0) : target(v), cur(v), prev(v) {}
    void step(double a) { prev = cur; cur += (target - cur) * a; if (std::fabs(target - cur) < 1e-9) cur = target; }
  };
  struct Ev { int type; double at; int id; double midi, cents, vel, from, glide; };
  struct Voice {
    bool active = false, released = false;
    int id = 0;
    long order = 0;
    double vel = 1;
    double delay = 0, relDelay = -1, relFast = 0, lf = 0, lfTarget = 0, glideC = 1;
    std::vector<float> buf = std::vector<float>(kCourses * kBuf, 0.0f);
    int wIdx[kCourses] = {}, delL[kCourses] = {};
    double apEta[kCourses] = {}, apX1[kCourses] = {}, apY1[kCourses] = {}, lpCoef[kCourses] = {}, lpState[kCourses] = {};
    double fbGain[kCourses] = {}, stiffA[kCourses] = {}, stiffX[kCourses * 4] = {}, stiffY[kCourses * 4] = {};
    double panL[kCourses] = {}, panR[kCourses] = {};
    int stiffStages = 1;
    float excBuf[kExc] = {};
    int excW = 0;
    double excPos = 0, excLen = 0, excTotal = 0, excCombM = 8, excGain = 0, excLpCoef = 0.5, excLpState = 0;
    double rizSamples = 0;
    bool rizAlt = false;
    double dcX = 0, dcY = 0, out = 1, relCoef = 0, relTau = 0.35, silentCount = 0;
    void clearBuffers() {
      std::fill(buf.begin(), buf.end(), 0.0f);
      for (int c = 0; c < kCourses; c++) { wIdx[c] = 0; apX1[c] = apY1[c] = lpState[c] = 0; }
      for (int i = 0; i < kCourses * 4; i++) stiffX[i] = stiffY[i] = 0;
      std::memset(excBuf, 0, sizeof excBuf);
      excW = 0; excLpState = 0; dcX = dcY = 0;
    }
    void reset(int i, long o, double freqHz, double v, double d) {
      active = true; released = false; id = i; order = o; vel = v; delay = d;
      relDelay = -1; relFast = 0; lf = lfTarget = std::log2(freqHz); glideC = 1;
      out = 1; relCoef = 0; rizAlt = false; silentCount = 0;
      clearBuffers();
    }
  };

  int model_ = 0;
  double courses_ = 2;
  bool rizOn_ = false;
  double aR_ = 0.35;
  Smooth strHard_{0.55}, strPos_{0.18}, strDecay_{3.5}, strDamp_{0.3}, strBright_{0.65}, strStiff_{0.25}, strDetune_{4},
      strBody_{0.45}, strTone_{0.5}, strBuzz_{0}, rizRate_{11}, velSens_{0.6}, bendRange_{2}, bend_{0}, modWheel_{0};
  std::vector<Voice> voices_;
  long counter_ = 0;
  uint32_t rng_ = 0x7f4a7c15u;
  std::vector<Ev> q_;
  double bL1_[3] = {}, bL2_[3] = {}, bR1_[3] = {}, bR2_[3] = {}, bA1_[3] = {}, bA2_[3] = {}, bA3_[3] = {}, bKq_[3] = {};

  std::vector<Smooth*> smooths() {
    return {&strHard_, &strPos_, &strDecay_, &strDamp_, &strBright_, &strStiff_, &strDetune_, &strBody_, &strTone_, &strBuzz_,
            &rizRate_, &velSens_, &bendRange_, &bend_, &modWheel_};
  }
  static double jsRound(double x) { return std::floor(x + 0.5); }

  void setParam(const std::string& key, double n, const std::string* s) {
    if (key == "strModel") {
      static const char* M[] = {"santur", "setar", "tar", "kanun", "oud", "harp"};
      model_ = 0;
      if (s) for (int i = 0; i < 6; i++) if (*s == M[i]) model_ = i;
    } else if (key == "strCourses") courses_ = std::isnan(n) ? 0 : std::max(1.0, std::min(static_cast<double>(kCourses), jsRound(n)));
    else if (key == "riz") rizOn_ = s && *s == "on";
    else if (key == "aR") aR_ = std::isnan(n) ? n : std::max(0.01, n);
    else if (key == "strHard") strHard_.target = n;
    else if (key == "strPos") strPos_.target = n;
    else if (key == "strDecay") strDecay_.target = n;
    else if (key == "strDamp") strDamp_.target = n;
    else if (key == "strBright") strBright_.target = n;
    else if (key == "strStiff") strStiff_.target = n;
    else if (key == "strDetune") strDetune_.target = n;
    else if (key == "strBody") strBody_.target = n;
    else if (key == "strTone") strTone_.target = n;
    else if (key == "strBuzz") strBuzz_.target = n;
    else if (key == "rizRate") rizRate_.target = n;
    else if (key == "velSens") velSens_.target = n;
    else if (key == "bendRange") bendRange_.target = n;
  }

  double nextNoise() {
    uint32_t x = rng_;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    rng_ = x;
    return x / 2147483648.0 - 1;
  }
  void release(Voice& v, double fastTau) {
    if (v.released && fastTau == 0) return;
    v.released = true;
    const double tau = fastTau > 0 ? fastTau : std::max(0.01, aR_);
    v.relTau = tau;
    v.relCoef = 1 - std::exp(-1 / (std::max(0.005, tau / 3) * ctx->sampleRate));
  }
  Voice* find(int id) { for (auto& v : voices_) if (v.active && v.id == id) return &v; return nullptr; }

  void startStrike(Voice& v, double strikeVel) {
    const double sr = ctx->sampleRate;
    const double f0 = std::max(20.0, std::min(sr * 0.25, std::pow(2.0, v.lf)));
    const double P = sr / f0;
    const double hard = strHard_.cur;
    const double pos = std::max(0.05, std::min(0.5, strPos_.cur));
    const double velS = velSens_.cur;
    const double amp = 0.36 * (1 - velS + velS * strikeVel);
    const double fcExc = std::min(sr * 0.44, 360 * std::pow(2.0, 4.4 * hard + 1.6 * strikeVel));
    v.excLpCoef = 1 - std::exp((-2 * kPi * fcExc) / sr);
    v.excCombM = std::max(1.0, std::min(static_cast<double>(kExc - 4), jsRound(pos * P)));
    if (model_ == 0) {
      const double dur = 0.0042 - 0.0028 * hard;
      v.excLen = std::max(6.0, std::min(240.0, jsRound(sr * dur)));
      v.excGain = amp * 0.65;
    } else {
      v.excLen = std::max(16.0, std::min(360.0, jsRound(P * 0.7)));
      v.excGain = amp * 0.55;
    }
    v.excTotal = v.excLen + v.excCombM;
    v.excPos = 0;
  }
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
    const double vel = std::max(0.05, std::min(1.0, e.vel));
    slot->reset(e.id, ++counter_, e.from > 0 ? e.from : target, vel, offset);
    if (e.from > 0 && e.glide > 0.004) {
      slot->lfTarget = std::log2(target);
      slot->glideC = 1 - std::exp(-1 / ((e.glide / 3) * ctx->sampleRate));
    }
    startStrike(*slot, vel);
    slot->rizSamples = std::max(200.0, jsRound(ctx->sampleRate / std::max(4.0, rizRate_.cur)));
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
        if (e.type == 2) { v->relDelay = std::max(static_cast<double>(off), v->delay); v->relFast = 0; }
        else if (e.type == 3) { v->relDelay = std::max(static_cast<double>(off), v->delay); v->relFast = 0.005; }
        else if (e.type == 4) {
          v->lfTarget = std::log2(440 * std::pow(2.0, (e.midi - 69) / 12 + e.cents / 1200));
          v->glideC = e.glide > 0.004 ? 1 - std::exp(-1 / ((e.glide / 3) * sr)) : 1;
        }
      }
    }
    q_.resize(w);
  }
  void updateVoiceCourses(Voice& v, double bendCents) {
    const double sr = ctx->sampleRate;
    const double C = courses_;
    const double norm = 1 / std::sqrt(C);
    const double det = strDetune_.cur, damp = strDamp_.cur, bright = strBright_.cur, stiff = strStiff_.cur;
    const double t60 = std::max(0.15, strDecay_.cur);
    const int M = stiff <= 0.001 ? 1 : static_cast<int>(std::max(1.0, std::min(4.0, std::ceil(stiff * 4))));
    v.stiffStages = M;
    const double bFactor = (1 - 0.82 * damp) * (1 - 0.82 * damp) * (0.22 + 0.78 * bright);
    const double harmMult = 3.5 + 85 * bFactor;
    for (int c = 0; c < C; c++) {
      const double pos = C == 1 ? 0 : c / (C - 1) - 0.5;
      const double cDet = pos * det;
      const double fc = std::max(20.0, std::min(sr * 0.24, std::pow(2.0, v.lf + (bendCents + cDet) / 1200)));
      const double P = sr / fc;
      const double w0 = (2 * kPi) / P;
      const double cosW = std::cos(w0), sinW = std::sin(w0);
      const double pan = C == 1 ? 0 : pos * 0.45;
      const double ang = ((pan + 1) * kPi) / 4;
      v.panL[c] = std::cos(ang) * kSqrt2 * norm;
      v.panR[c] = std::sin(ang) * kSqrt2 * norm;
      const double fLp = std::min(sr * 0.45, fc * harmMult);
      const double p = std::max(0.002, std::min(0.85, std::exp((-2 * kPi * fLp) / sr)));
      v.lpCoef[c] = p;
      const double tauLp = std::atan2(p * sinW, 1 - p * cosW) / w0;
      const double magLp = (1 - p) / std::sqrt(std::max(1e-12, 1 - 2 * p * cosW + p * p));
      double aS = stiff <= 0.001 ? 0 : -0.52 * stiff;
      double tauAp = std::atan2((1 - aS * aS) * sinW, 2 * aS + (1 + aS * aS) * cosW) / w0;
      if (tauLp + M * tauAp > P - 2.6) { aS = 0; tauAp = 1; }
      v.stiffA[c] = aS;
      const double D = std::max(2.5, std::min(static_cast<double>(kBuf - 4), P - tauLp - M * tauAp - 0.035));
      const double L = std::max(2.0, std::floor(D - 0.5));
      const double delta = D - L;
      v.delL[c] = static_cast<int>(L);
      const double sinDen = std::sin(0.5 * (1 + delta) * w0);
      v.apEta[c] = std::fabs(sinDen) > 1e-9 ? std::sin(0.5 * (1 - delta) * w0) / sinDen : (1 - delta) / (1 + delta);
      double gLoss = std::exp(-6.90775527898 / (fc * t60));
      if (v.released) gLoss *= std::exp(-1 / (fc * std::max(0.008, v.relTau)));
      v.fbGain[c] = std::min(0.99985, gLoss / std::max(0.25, magLp));
    }
  }
  void updateBodyFilters(double sr) {
    static const double F[6][3] = {{290, 680, 1650}, {240, 560, 1450}, {190, 460, 1180}, {260, 620, 1800}, {135, 310, 780}, {175, 420, 1050}};
    static const double Qs[6][3] = {{4.5, 5.5, 6.0}, {5.0, 6.5, 7.0}, {5.5, 7.0, 6.0}, {4.5, 5.0, 6.5}, {5.0, 5.5, 5.0}, {3.5, 4.0, 4.5}};
    const int m = model_ >= 0 && model_ < 6 ? model_ : 0;
    const double scale = std::pow(2.0, (strTone_.cur - 0.5) * 1.2);
    const double maxFc = sr * 0.44;
    for (int b = 0; b < 3; b++) {
      const double fc = std::max(40.0, std::min(maxFc, F[m][b] * scale));
      const double g = std::tan((kPi * fc) / sr);
      const double kq = 1 / Qs[m][b];
      const double a1 = 1 / (1 + g * (g + kq));
      bA1_[b] = a1;
      bA2_[b] = g * a1;
      bA3_[b] = g * bA2_[b];
      bKq_[b] = kq;
    }
  }

 protected:
  void process() override {
    deliverDeferred();
    out.channels = 2;
    out.zero();
    float* Lo = out.ch[0];
    float* Ro = out.ch[1];
    const int n = wa::RQ;
    handleEvents(n);
    const double sr = ctx->sampleRate;
    const double blockA = 1 - std::exp(-n / (0.01 * sr));
    for (Smooth* s : smooths()) s->step(blockA);
    const double bendCents = bend_.cur * bendRange_.cur * 100 + modWheel_.cur * 35;
    const double C = courses_;
    const double buzz = strBuzz_.cur, bodyMix = strBody_.cur;
    const bool rizOn = rizOn_;
    const double rizPeriod = std::max(200.0, jsRound(sr / std::max(4.0, rizRate_.cur)));
    const bool isHammer = model_ == 0;
    const double hard = strHard_.cur;
    updateBodyFilters(sr);
    for (auto& v : voices_) {
      if (!v.active) continue;
      updateVoiceCourses(v, bendCents);
      const int M = v.stiffStages;
      double peakBlock = 0;
      for (int i = 0; i < n; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        if (v.relDelay == 0) {
          release(v, v.relFast);
          v.relDelay = -1;
          updateVoiceCourses(v, bendCents);
        } else if (v.relDelay > 0) v.relDelay--;
        if (v.lf != v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (std::fabs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
          if ((i & 15) == 0) updateVoiceCourses(v, bendCents);
        }
        if (rizOn && !v.released) {
          v.rizSamples--;
          if (v.rizSamples <= 0) {
            v.rizSamples = rizPeriod;
            v.rizAlt = !v.rizAlt;
            startStrike(v, v.vel * (v.rizAlt ? 0.75 : 1.0));
          }
        }
        double exc = 0;
        if (v.excPos < v.excTotal) {
          double raw = 0;
          if (v.excPos < v.excLen) {
            if (isHammer) {
              const double ph = v.excPos / v.excLen;
              const double a = 0.5 * (1 - std::cos(2 * kPi * ph));
              raw = a + 0.22 * hard * nextNoise() * std::sin(kPi * ph);
            } else {
              const double env = 1 - v.excPos / v.excLen;
              raw = (nextNoise() * 0.85 + 0.3 * std::sin((kPi * v.excPos) / v.excLen)) * env;
            }
          }
          v.excLpState += v.excLpCoef * (raw - v.excLpState);
          const int ew = (v.excW + 1) & kExcMask;
          v.excW = ew;
          v.excBuf[ew] = static_cast<float>(v.excLpState);
          const double delayed = v.excBuf[(ew - static_cast<int>(v.excCombM)) & kExcMask];
          exc = (v.excLpState - delayed) * v.excGain;
          v.excPos++;
        }
        double vl = 0, vr = 0;
        for (int c = 0; c < C; c++) {
          const int bOff = c * kBuf;
          const int w = (v.wIdx[c] + 1) & kBufMask;
          v.wIdx[c] = w;
          const double x0 = v.buf[bOff + ((w - v.delL[c]) & kBufMask)];
          const double eta = v.apEta[c];
          const double yFrac = eta * x0 + v.apX1[c] - eta * v.apY1[c];
          v.apX1[c] = x0;
          v.apY1[c] = yFrac;
          const double p = v.lpCoef[c];
          const double yLp = (1 - p) * yFrac + p * v.lpState[c];
          v.lpState[c] = yLp;
          double yStiff = yLp;
          const double aS = v.stiffA[c];
          const int sBase = c * 4;
          for (int s = 0; s < M; s++) {
            const int idx = sBase + s;
            const double yn = aS * yStiff + v.stiffX[idx] - aS * v.stiffY[idx];
            v.stiffX[idx] = yStiff;
            v.stiffY[idx] = yn;
            yStiff = yn;
          }
          const double yLoop = yStiff * v.fbGain[c] + exc;
          v.buf[bOff + w] = static_cast<float>(yLoop);
          vl += yLoop * v.panL[c];
          vr += yLoop * v.panR[c];
        }
        if (buzz > 0.001) {
          const double mono = 0.5 * (vl + vr);
          const double absM = std::fabs(mono);
          v.dcY = absM - v.dcX + 0.995 * v.dcY;
          v.dcX = absM;
          const double bz = buzz * 0.9 * v.dcY;
          const double scale = 1 / (1 + buzz * 0.65 * absM);
          vl = (vl + bz) * scale;
          vr = (vr + bz) * scale;
        }
        if (v.released) v.out -= v.out * v.relCoef;
        vl *= v.out;
        vr *= v.out;
        if (!std::isfinite(vl) || !std::isfinite(vr)) { v.clearBuffers(); v.active = false; break; }
        const double mag = std::fabs(vl) + std::fabs(vr);
        if (mag > peakBlock) peakBlock = mag;
        Lo[i] = static_cast<float>(Lo[i] + vl);
        Ro[i] = static_cast<float>(Ro[i] + vr);
      }
      for (int c = 0; c < C; c++) {
        if (std::fabs(v.apX1[c]) < 1e-20) v.apX1[c] = 0;
        if (std::fabs(v.apY1[c]) < 1e-20) v.apY1[c] = 0;
        if (std::fabs(v.lpState[c]) < 1e-20) v.lpState[c] = 0;
      }
      if (std::fabs(v.dcY) < 1e-20) v.dcY = 0;
      if (peakBlock < 2e-5 && v.excPos >= v.excTotal && (!rizOn || v.released)) {
        v.silentCount += n;
        if (v.silentCount > sr * 0.15 || (v.released && v.out < 2e-5)) v.active = false;
      } else v.silentCount = 0;
    }
    if (bodyMix > 0.001) {
      const double dryG = 1 - bodyMix * 0.35, wetG = bodyMix * 0.75;
      for (int i = 0; i < n; i++) {
        const double xl = Lo[i], xr = Ro[i];
        double sumL = 0, sumR = 0;
        for (int b = 0; b < 3; b++) {
          const double a1 = bA1_[b], a2 = bA2_[b], a3 = bA3_[b], kq = bKq_[b];
          double v3 = xl - bL2_[b];
          double v1 = a1 * bL1_[b] + a2 * v3;
          double v2 = bL2_[b] + a2 * bL1_[b] + a3 * v3;
          bL1_[b] = 2 * v1 - bL1_[b];
          bL2_[b] = 2 * v2 - bL2_[b];
          sumL += kq * v1;
          v3 = xr - bR2_[b];
          v1 = a1 * bR1_[b] + a2 * v3;
          v2 = bR2_[b] + a2 * bR1_[b] + a3 * v3;
          bR1_[b] = 2 * v1 - bR1_[b];
          bR2_[b] = 2 * v2 - bR2_[b];
          sumR += kq * v1;
        }
        Lo[i] = static_cast<float>(xl * dryG + sumL * wetG);
        Ro[i] = static_cast<float>(xr * dryG + sumR * wetG);
      }
      for (int b = 0; b < 3; b++) {
        if (std::fabs(bL1_[b]) < 1e-20) bL1_[b] = 0;
        if (std::fabs(bL2_[b]) < 1e-20) bL2_[b] = 0;
        if (std::fabs(bR1_[b]) < 1e-20) bR1_[b] = 0;
        if (std::fabs(bR2_[b]) < 1e-20) bR2_[b] = 0;
      }
    }
  }
};

}  // namespace sy1
