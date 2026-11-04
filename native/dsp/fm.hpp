// SY-1 native — Kashan's 4-operator FM engine: line-by-line port of
// src/engine/worklet/fm-processor.ts ("sy1-fm"), as a wa worklet node.
// Precision follows JS: doubles everywhere, the output buffer is float
// (Float32Array) and voices add into it one at a time, the sine table is float.
#pragma once
#include <array>
#include <cmath>
#include <cstdlib>
#include <string>
#include <vector>

#include "../host/worklets.hpp"

namespace sy1 {

class FmWorklet : public WorkletNode {
 public:
  explicit FmWorklet(wa::Context* c) : WorkletNode(c) {
    voices_.resize(kPool);
    for (int i = 0; i <= kTab; i++) sine_[i] = static_cast<float>(std::sin((2 * kPi * i) / kTab));
  }

  void param(const std::string& key, double n) override { setParam(key, n); }
  void param(const std::string& key, const std::string& v) override {
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
    for (auto& l : level_) l.cur = l.target;
    feedback_.cur = feedback_.target;
    bright_.cur = bright_.target;
    tone_.cur = tone_.target;
  }
  void message(const std::string& t, int id, double midi, double cents, double vel, double at, double from, double glide, double v) override {
    if (t == "on" || t == "off" || t == "kill" || t == "glide") {
      if (q_.size() >= kQueue) return;
      q_.push_back({t == "on" ? 1 : t == "off" ? 2 : t == "kill" ? 3 : 4, at, id, midi ? midi : 60, cents, vel, from, glide});
    } else if (t == "alloff") {
      q_.clear();
      for (auto& vo : voices_) if (vo.active) { vo.released = true; vo.relFast = 0.015; for (int k = 0; k < 4; k++) vo.stage[k] = 3; }
    } else if (t == "bend") bend_.target = v;
    else if (t == "mod") modWheel_.target = v;
  }

 private:
  static constexpr int kPool = 16, kMaxSounding = 8, kMaxActive = 12, kTab = 4096, kMask = kTab - 1;
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
    double phase[4] = {}, env[4] = {};
    int stage[4] = {};
    double fb1 = 0, fb2 = 0;
    double silent = 0;
    void start(int i, long o, double hz, double v, double m, int d) {
      active = true; released = false; id = i; order = o; vel = v; midi = m; delay = d;
      relDelay = -1; relFast = 0; lf = std::log2(hz); lfTarget = lf; glideC = 1;
      for (int k = 0; k < 4; k++) { phase[k] = 0; env[k] = 0; stage[k] = 0; }
      fb1 = fb2 = 0; silent = 0;
    }
  };
  struct Algo { std::vector<std::vector<int>> mods; std::vector<int> car; };
  const std::array<Algo, 8> algos_ = {{
    {{{1}, {2}, {3}, {}}, {0}},
    {{{1}, {2, 3}, {}, {}}, {0}},
    {{{1, 3}, {2}, {}, {}}, {0}},
    {{{1, 2}, {}, {3}, {}}, {0}},
    {{{1}, {}, {3}, {}}, {0, 2}},
    {{{3}, {3}, {3}, {}}, {0, 1, 2}},
    {{{}, {}, {3}, {}}, {0, 1, 2}},
    {{{}, {}, {}, {}}, {0, 1, 2, 3}},
  }};

  float sine_[kTab + 1];
  std::vector<Voice> voices_;
  std::vector<Ev> q_;
  long counter_ = 0;
  int algo_ = 0;
  double ratio_[4] = {1, 1, 1, 1};
  Smooth level_[4] = {Smooth(1), Smooth(0.5), Smooth(0.3), Smooth(0.2)};
  double a_[4] = {0.002, 0.002, 0.002, 0.002}, d_[4] = {0.6, 0.6, 0.6, 0.6}, s_[4] = {0.5, 0.5, 0.5, 0.5}, r_[4] = {0.4, 0.4, 0.4, 0.4};
  Smooth feedback_{0}, bright_{0.5}, tone_{1}, bend_{0}, modWheel_{0};
  double velMod_ = 0.5, velSens_ = 0.6, bendRange_ = 2, vibPhase_ = 0, lpL_ = 0, lpR_ = 0;
  double outs_[4] = {};

  void setParam(const std::string& key, double n) {
    if (!std::isfinite(n)) return;
    if (key.size() >= 4 && key.compare(0, 2, "op") == 0 && key[2] >= '1' && key[2] <= '4') {
      const int k = key[2] - '1';
      const std::string what = key.substr(3);
      if (what == "Ratio") { ratio_[k] = std::max(0.25, std::min(32.0, n)); return; }
      if (what == "Level") { level_[k].target = std::max(0.0, std::min(1.0, n)); return; }
      if (what == "A") { a_[k] = std::max(0.001, n); return; }
      if (what == "D") { d_[k] = std::max(0.005, n); return; }
      if (what == "S") { s_[k] = std::max(0.0, std::min(1.0, n)); return; }
      if (what == "R") { r_[k] = std::max(0.005, n); return; }
    }
    if (key == "fmAlgo") algo_ = std::max(0, std::min(7, static_cast<int>(std::floor(n + 0.5)) - 1));
    else if (key == "fmFeedback") feedback_.target = n;
    else if (key == "fmBright") bright_.target = n;
    else if (key == "fmVelMod") velMod_ = n;
    else if (key == "fmTone") tone_.target = n;
    else if (key == "velSens") velSens_ = n;
    else if (key == "bendRange") bendRange_ = n;
  }
  Voice* find(int id) { for (auto& v : voices_) if (v.active && v.id == id) return &v; return nullptr; }
  static void release(Voice& v, double fast) {
    v.released = true;
    v.relFast = fast;
    for (int k = 0; k < 4; k++) if (v.stage[k] < 3) v.stage[k] = 3;
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
    slot->start(e.id, ++counter_, e.from > 0 ? e.from : target, std::max(0.05, std::min(1.0, e.vel)), e.midi, offset);
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
    const double sm = 1 - std::exp(-n / (0.02 * sr));
    for (auto& l : level_) l.step(sm);
    feedback_.step(sm); bright_.step(sm); tone_.step(sm); bend_.step(sm); modWheel_.step(sm);
    const Algo& algo = algos_[algo_];
    bool isCar[4] = {false, false, false, false};
    for (int c : algo.car) isCar[c] = true;
    const double carNorm = 0.32 / std::sqrt(static_cast<double>(algo.car.size()));
    const double brightMul = 0.15 + 1.7 * bright_.cur;
    const double fbAmt = feedback_.cur * 1.6;
    double aInc[4], dC[4], rC[4];
    for (int k = 0; k < 4; k++) {
      aInc[k] = 1 / std::max(1.0, a_[k] * sr);
      dC[k] = 1 - std::exp(-1 / ((d_[k] / 3) * sr));
      rC[k] = 1 - std::exp(-1 / ((r_[k] / 3) * sr));
    }
    const double vibDepth = modWheel_.cur * 30;
    const double vibInc = (5.6 * kTab) / sr;
    const double bendCents = bend_.cur * bendRange_ * 100;
    const double toneHz = 300 * std::pow(2.0, tone_.cur * 6);
    const double lpA = tone_.cur >= 0.999 ? 1 : 1 - std::exp((-2 * kPi * toneHz) / sr);
    for (auto& v : voices_) {
      if (!v.active) continue;
      const double velAmp = 1 - velSens_ * (1 - v.vel);
      const double velIdx = 1 - velMod_ * (1 - v.vel);
      const double keyScale = std::pow(2.0, -std::max(0.0, v.midi - 60) / 30);
      const double idxScale = 4 * brightMul * velIdx * keyScale;
      double peak = 0;
      for (int i = 0; i < n; i++) {
        if (i < v.delay) continue;
        if (v.relDelay >= 0 && i >= v.relDelay) { release(v, v.relFast); v.relDelay = -1; }
        if (v.lf != v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (std::fabs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }
        const double vib = vibDepth > 0.01 ? static_cast<double>(sine_[static_cast<int>(vibPhase_) & kMask]) * vibDepth : 0;
        const double f0 = std::pow(2.0, v.lf + (bendCents + vib) / 1200);
        for (int k = 0; k < 4; k++) {
          const int st = v.stage[k];
          double e = v.env[k];
          if (st == 0) { e += aInc[k]; if (e >= 1) { e = 1; v.stage[k] = 1; } }
          else if (st == 1) { e += (s_[k] - e) * dC[k]; if (std::fabs(e - s_[k]) < 1e-4) v.stage[k] = 2; }
          else if (st == 3) { e -= e * (v.relFast > 0 ? 1 - std::exp(-1 / (v.relFast * sr)) : rC[k]); }
          v.env[k] = e;
        }
        for (int k = 3; k >= 0; k--) {
          double pm = 0;
          for (int j : algo.mods[k]) pm += outs_[j];
          if (k == 3 && fbAmt > 0) pm += (v.fb1 + v.fb2) * 0.5 * fbAmt;
          const double ph = v.phase[k] + pm * (kTab / (2 * kPi));
          const double idx = std::fmod(std::fmod(ph, static_cast<double>(kTab)) + kTab, static_cast<double>(kTab));
          const int i0 = static_cast<int>(idx);
          const double fr = idx - i0;
          const double s = static_cast<double>(sine_[i0]) + (static_cast<double>(sine_[i0 + 1]) - static_cast<double>(sine_[i0])) * fr;
          v.phase[k] += f0 * ratio_[k] * kTab / sr;
          if (v.phase[k] >= kTab) v.phase[k] -= kTab;
          const double lvl = level_[k].cur;
          if (isCar[k]) outs_[k] = s * v.env[k] * lvl;
          else outs_[k] = s * v.env[k] * lvl * lvl * idxScale;
          if (k == 3) { v.fb2 = v.fb1; v.fb1 = s * v.env[k]; }
        }
        double sum = 0;
        for (int c : algo.car) sum += outs_[c];
        const double y = sum * carNorm * velAmp;
        if (!std::isfinite(y)) { v.active = false; break; }
        L[i] = static_cast<float>(L[i] + y);
        R[i] = static_cast<float>(R[i] + y);
        const double ay = y < 0 ? -y : y;
        if (ay > peak) peak = ay;
      }
      if (v.released) {
        double maxCar = 0;
        for (int c : algo.car) if (v.env[c] > maxCar) maxCar = v.env[c];
        if (maxCar < 1e-4) v.active = false;
      } else if (peak < 1e-6) {
        v.silent += n;
        if (v.silent > sr * 2) v.active = false;
      } else v.silent = 0;
      v.delay = 0;
    }
    vibPhase_ = std::fmod(vibPhase_ + vibInc * n, static_cast<double>(kTab));
    if (lpA < 1) {
      for (int i = 0; i < n; i++) {
        lpL_ += (L[i] - lpL_) * lpA;
        L[i] = static_cast<float>(lpL_);
        lpR_ += (R[i] - lpR_) * lpA;
        R[i] = static_cast<float>(lpR_);
      }
      if (std::fabs(lpL_) < 1e-20) lpL_ = 0;
      if (std::fabs(lpR_) < 1e-20) lpR_ = 0;
    }
  }
};

}  // namespace sy1
