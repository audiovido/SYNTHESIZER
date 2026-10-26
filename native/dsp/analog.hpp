// SY-1 native DSP — Tabriz analog engine (C++17, header-only, no allocations after construction).
//
// Line-by-line port of src/dsp/analog.ts and src/dsp/analog-engine.ts (the web
// reference). Keep both in sync: native/tests/parity.cpp checks that they
// render the same samples. Platform audio I/O (CoreAudio / Oboe) and the UI
// bridge live elsewhere; this file only renders audio.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>

namespace sy1 {

constexpr double PEAK = 0.42;
constexpr double PI = 3.14159265358979323846;

inline double fastTanh(double x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const double x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

inline double polyBlep(double t, double dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// wave: 0 saw, 1 square, 2 triangle, 3 sine, 4 reverse saw
inline double oscSample(int wave, double ph, double dt) {
  switch (wave) {
    case 0: return 2 * ph - 1 - polyBlep(ph, dt);
    case 4: return 1 - 2 * ph + polyBlep(ph, dt);
    case 1: {
      double t2 = ph + 0.5;
      if (t2 >= 1) t2 -= 1;
      return (ph < 0.5 ? 1.0 : -1.0) + polyBlep(ph, dt) - polyBlep(t2, dt);
    }
    case 2: return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    default: return std::sin(2 * PI * ph);
  }
}

inline int waveId(const std::string& s, int def) {
  if (s == "sawtooth") return 0;
  if (s == "square") return 1;
  if (s == "triangle") return 2;
  if (s == "sine") return 3;
  if (s == "revsaw") return 4;
  return def;
}

struct Ladder {
  double s1 = 0, s2 = 0, s3 = 0, s4 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0;
  double y4p = 0, fb = 0, u = 0, g = 0.1, k = 0;

  void reset() { s1 = s2 = s3 = s4 = t1 = t2 = t3 = t4 = y4p = fb = u = 0; }

  void setCutoff(double fc, double fsOs, double r) {
    const double f = fc / fsOs, fn = f * 2, fn2 = fn * fn, fn3 = fn2 * fn;
    const double fcr = 1.873 * fn3 + 0.4955 * fn2 - 0.649 * fn + 0.9988;
    const double acr = -3.9364 * fn2 + 1.8409 * fn + 0.9968;
    g = 1 - std::exp(-2 * PI * f * fcr);
    k = 4 * r * acr;
  }

  void tick(double x) {
    u = fastTanh(x - k * fb);
    s1 += g * (u - t1);  t1 = fastTanh(s1);
    s2 += g * (t1 - t2); t2 = fastTanh(s2);
    s3 += g * (t2 - t3); t3 = fastTanh(s3);
    s4 += g * (t3 - t4); t4 = fastTanh(s4);
    fb = 0.5 * (s4 + y4p);
    y4p = s4;
  }

  double out(int mode) const {
    switch (mode) {
      case 1: return s2;
      case 2: return 4 * (s2 - 2 * s3 + s4);
      case 3: return u - 4 * s1 + 6 * s2 - 4 * s3 + s4;
      default: return s4;
    }
  }

  void flush() {
    if (std::fabs(s1) < 1e-20) s1 = 0;
    if (std::fabs(s2) < 1e-20) s2 = 0;
    if (std::fabs(s3) < 1e-20) s3 = 0;
    if (std::fabs(s4) < 1e-20) { s4 = 0; y4p = 0; fb = 0; }
  }
};

inline double resToLadder(double res) {
  double n = std::log(std::fmax(0.1, res) / 0.1) / std::log(180.0);
  n = n < 0 ? 0 : n > 1 ? 1 : n;
  return 1.08 * std::pow(n, 1.5);
}

struct AnalogEnv {
  double v = 0, ca = 0, cd = 0, cr = 0, sus = 0;
  int stage = 0;

  void set(double a, double d, double s, double r, double sr) {
    ca = 1 - std::exp(-1 / (std::fmax(0.0005, a / 1.466) * sr));
    cd = 1 - std::exp(-1 / (std::fmax(0.005, d / 3) * sr));
    cr = 1 - std::exp(-1 / (std::fmax(0.005, r / 4) * sr));
    sus = s;
  }
  void gate(bool on) { if (on) stage = 1; else if (stage != 0) stage = 3; }
  void fastRelease(double tau, double sr) { cr = 1 - std::exp(-1 / (std::fmax(0.001, tau) * sr)); stage = 3; }
  double tick() {
    switch (stage) {
      case 1: v += (1.3 - v) * ca; if (v >= 1) { v = 1; stage = 2; } break;
      case 2: v += (sus - v) * cd; break;
      case 3: v -= v * cr; if (v < 1e-5) { v = 0; stage = 0; } break;
      default: break;
    }
    return v;
  }
};

struct Smooth {
  double target, cur, prev;
  explicit Smooth(double v = 0) : target(v), cur(v), prev(v) {}
  void step(double a) { prev = cur; cur += (target - cur) * a; if (std::fabs(target - cur) < 1e-9) cur = target; }
  void snap() { cur = prev = target; }
};

struct AnalogVoice {
  bool active = false, released = false, fast = false;
  int id = 0, order = 0, delay = 0, relDelay = -1;
  double vel = 1, relFast = 0, lf = 0, lfTarget = 0, glideC = 1;
  double ph[4] = {0, 0, 0, 0}, drift[3] = {0, 0, 0}, driftFix[3] = {0, 0, 0};
  double lfoPh = 0, lfoHold = 0, xPrev = 0;
  AnalogEnv amp, fenv;
  Ladder ladder;
};

class AnalogEngine {
 public:
  static constexpr int POOL = 24, MAX_SOUNDING = 10, MAX_ACTIVE = 16;

  explicit AnalogEngine(double sampleRate) : sr(sampleRate) {}

  // Choice params (strings) and numeric params, same keys as the web patch.
  void setParam(const std::string& key, const std::string& s) {
    if (key == "osc1Wave") w1 = waveId(s, 0);
    else if (key == "osc2Wave") w2 = waveId(s, 1);
    else if (key == "osc3Wave") w3 = waveId(s, 2);
    else if (key == "filterType") mode = s == "lowpass" ? 1 : s == "bandpass" ? 2 : s == "highpass" ? 3 : 0;
    else if (key == "lfoTarget") lfoTarget = s == "filter" ? 1 : s == "amp" ? 2 : 0;
    else if (key == "lfoShape") lfoShape = s == "triangle" ? 1 : s == "square" ? 2 : s == "sawtooth" ? 3 : s == "sh" ? 4 : 0;
  }
  void setParam(const std::string& key, double n) {
    if (key == "osc1Oct") oct1 = n;
    else if (key == "osc2Oct") oct2 = n;
    else if (key == "osc3Oct") oct3 = n;
    else if (key == "aA") aA = n;
    else if (key == "aD") aD = n;
    else if (key == "aR") aR = n;
    else if (key == "fA") fA = n;
    else if (key == "fD") fD = n;
    else if (key == "oscMix") mix.target = n;
    else if (key == "osc3Level") lvl3.target = n;
    else if (key == "sub") sub.target = n;
    else if (key == "noise") noise.target = n;
    else if (key == "osc2Detune") det2.target = n;
    else if (key == "osc3Detune") det3.target = n;
    else if (key == "cutoff") cutoff.target = n;
    else if (key == "res") res.target = n;
    else if (key == "envAmt") envAmt.target = n;
    else if (key == "fS") fS.target = n;
    else if (key == "aS") aS.target = n;
    else if (key == "keyTrack") keyTrack.target = n;
    else if (key == "filterDrive") fDrive.target = n;
    else if (key == "drift") driftAmt.target = n;
    else if (key == "velSens") velSens.target = n;
    else if (key == "lfoRate") lfoRate.target = n;
    else if (key == "lfoDepth") lfoDepth.target = n;
    else if (key == "bendRange") bendRange.target = n;
  }
  void snapParams() { for (Smooth* s : smooths()) s->snap(); }
  void setBend(double v) { bend.target = v; }
  void setMod(double v) { modWheel.target = v; }

  void noteOn(int id, int midi, double cents, double vel, int offset, double fromHz, double glide) {
    int sounding = 0, active = 0;
    AnalogVoice *oldS = nullptr, *oldA = nullptr;
    for (auto& v : voices) {
      if (!v.active) continue;
      active++;
      if (!oldA || v.order < oldA->order) oldA = &v;
      if (!v.released) { sounding++; if (!oldS || v.order < oldS->order) oldS = &v; }
    }
    if (sounding >= MAX_SOUNDING && oldS) release(*oldS, 0.02);
    if (active >= MAX_ACTIVE && oldA) release(*oldA, 0.005);
    AnalogVoice* slot = nullptr;
    for (auto& v : voices) if (!v.active) { slot = &v; break; }
    if (!slot) for (auto& v : voices) if (!slot || v.order < slot->order) slot = &v;
    AnalogVoice& v = *slot;
    const double target = std::log2(440.0) + (midi - 69) / 12.0 + cents / 1200.0;
    v.active = true; v.released = false; v.fast = false;
    v.id = id; v.order = ++counter;
    v.vel = vel < 0 ? 0 : vel > 1 ? 1 : vel;
    v.delay = offset > 0 ? offset : 0;
    v.relDelay = -1;
    v.lfTarget = target;
    if (fromHz > 0 && glide > 0.004) { v.lf = std::log2(fromHz); v.glideC = 1 - std::exp(-1 / ((glide / 3) * sr)); }
    else { v.lf = target; v.glideC = 1; }
    for (int k = 0; k < 4; k++) v.ph[k] = (rand() + 1) * 0.5;
    for (int k = 0; k < 3; k++) { v.drift[k] = rand() * 0.5; v.driftFix[k] = rand(); }
    v.lfoPh = 0; v.lfoHold = rand();
    v.amp.v = 0; v.fenv.v = 0;
    v.amp.gate(true); v.fenv.gate(true);
    v.ladder.reset();
    v.xPrev = 0;
  }

  void noteOff(int id, int offset, bool fast) {
    AnalogVoice* v = find(id);
    if (!v) return;
    v->relDelay = offset > v->delay ? offset : v->delay;
    v->relFast = fast ? 0.005 : 0;
  }

  void glideTo(int id, int midi, double cents, double glide) {
    AnalogVoice* v = find(id);
    if (!v) return;
    v->lfTarget = std::log2(440.0) + (midi - 69) / 12.0 + cents / 1200.0;
    v->glideC = glide > 0.004 ? 1 - std::exp(-1 / ((glide / 3) * sr)) : 1;
  }

  void allOff() { for (auto& v : voices) if (v.active) release(v, 0); }

  // Adds n samples into L (and R if not null). Real-time safe.
  void render(float* L, float* R, int n) {
    const double fsOs = sr * 2;
    const double blockA = 1 - std::exp(-n / (0.01 * sr));
    for (Smooth* s : smooths()) s->step(blockA);
    const double invSr = 1 / sr, invN = 1.0 / n;
    const double r = resToLadder(res.cur);
    const double comp = 1 + 0.9 * r;
    const double inGain = 1 + fDrive.cur * 4;
    const double outGain = comp / std::fmin(2.2, inGain * 0.55 + 0.45);
    const double ratio1 = std::pow(2, oct1);
    const double ratio2 = std::pow(2, oct2 + det2.cur / 1200);
    const double ratio3 = std::pow(2, oct3 + det3.cur / 1200);
    const double ratioSub = std::pow(2, oct1 - 1);
    const double depth = std::fmin(1, lfoDepth.cur + modWheel.cur);
    const double bendC = bend.cur * bendRange.cur * 100;
    const double lfoInc = lfoRate.cur * invSr;
    const double envOct = envAmt.cur * 6, kt = keyTrack.cur, driftC = driftAmt.cur, velS = velSens.cur;
    const double maxFc = sr * 0.45, C4 = std::log2(261.6256);

    for (auto& v : voices) {
      if (!v.active) continue;
      if (!v.fast) { v.amp.set(aA, aD, aS.cur, aR, sr); v.fenv.set(fA, fD, fS.cur, aR, sr); }
      const double gainV = PEAK * (1 - velS + velS * v.vel);
      for (int k = 0; k < 3; k++) {
        double d = v.drift[k] + rand() * 0.06;
        d *= 0.996;
        v.drift[k] = d > 1 ? 1 : d < -1 ? -1 : d;
      }
      const double dr1 = std::pow(2, (driftC * (6 * v.drift[0] + 2 * v.driftFix[0])) / 1200);
      const double dr2 = std::pow(2, (driftC * (6 * v.drift[1] + 2 * v.driftFix[1])) / 1200);
      const double dr3 = std::pow(2, (driftC * (6 * v.drift[2] + 2 * v.driftFix[2])) / 1200);

      for (int i = 0; i < n; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        if (v.relDelay == 0) { release(v, v.relFast); v.relDelay = -1; }
        else if (v.relDelay > 0) v.relDelay--;
        const double fr = i * invN;

        const double lfo = depth > 0 ? lfoValue(v) : 0;
        v.lfoPh += lfoInc;
        if (v.lfoPh >= 1) { v.lfoPh -= 1; v.lfoHold = rand(); }

        if (v.lf != v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (std::fabs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }
        double cents = bendC;
        if (lfoTarget == 0) cents += lfo * depth * 60;
        const double lp = v.lf + cents / 1200;
        const double f0 = std::pow(2, lp);

        const double mixV = mix.prev + (mix.cur - mix.prev) * fr;
        const double l3 = lvl3.prev + (lvl3.cur - lvl3.prev) * fr;
        double x = 0;
        double dt = std::fmin(0.49, f0 * ratio1 * dr1 * invSr);
        x += oscSample(w1, v.ph[0], dt) * (1 - mixV);
        v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1;
        dt = std::fmin(0.49, f0 * ratio2 * dr2 * invSr);
        x += oscSample(w2, v.ph[1], dt) * mixV;
        v.ph[1] += dt; if (v.ph[1] >= 1) v.ph[1] -= 1;
        if (l3 > 0) {
          dt = std::fmin(0.49, f0 * ratio3 * dr3 * invSr);
          x += oscSample(w3, v.ph[2], dt) * l3;
          v.ph[2] += dt; if (v.ph[2] >= 1) v.ph[2] -= 1;
        }
        const double subG = sub.cur * 0.8;
        if (subG > 0) x += std::sin(2 * PI * v.ph[3]) * subG;
        v.ph[3] += f0 * ratioSub * dr1 * invSr; if (v.ph[3] >= 1) v.ph[3] -= 1;
        const double nz = noise.cur * 0.5;
        if (nz > 0) x += rand() * nz;
        x = fastTanh(x * 0.6) * inGain;

        const double ae = v.amp.tick();
        const double fe = v.fenv.tick();

        Ladder& lad = v.ladder;
        if ((i & 3) == 0) {
          double fc = cutoff.prev + (cutoff.cur - cutoff.prev) * fr;
          fc *= std::pow(2, envOct * fe + kt * (lp - C4) + (lfoTarget == 1 ? lfo * depth * 2 : 0));
          if (fc < 20) fc = 20; else if (fc > maxFc) fc = maxFc;
          lad.setCutoff(fc, fsOs, r);
        }
        lad.tick(0.5 * (v.xPrev + x));
        lad.tick(x);
        v.xPrev = x;
        double y = lad.out(mode) * outGain;
        const double trem = lfoTarget == 2 ? 1 + lfo * depth * 0.5 : 1;
        y *= ae * gainV * trem;
        L[i] += static_cast<float>(y);
        if (R) R[i] += static_cast<float>(y);
      }
      v.ladder.flush();
      if (v.released && v.amp.stage == 0) v.active = false;
    }
  }

 private:
  double sr;
  AnalogVoice voices[POOL];
  int counter = 0;
  uint32_t rng = 0x2545f491u;
  int w1 = 0, w2 = 1, w3 = 2, mode = 0, lfoTarget = 0, lfoShape = 0;
  double oct1 = 0, oct2 = 0, oct3 = -1;
  double aA = 0.008, aD = 0.3, aR = 0.35, fA = 0.01, fD = 0.35;
  Smooth mix{0.45}, lvl3{0}, sub{0.2}, noise{0}, det2{8}, det3{-5}, cutoff{2200}, res{2}, envAmt{0.45},
      fS{0.25}, aS{0.75}, keyTrack{0.33}, fDrive{0.3}, driftAmt{0.25}, velSens{0.5}, lfoRate{5}, lfoDepth{0},
      bendRange{2}, bend{0}, modWheel{0};

  struct SmoothList { Smooth* p[20]; Smooth** begin() { return p; } Smooth** end() { return p + 20; } };
  SmoothList smooths() {
    return {{&mix, &lvl3, &sub, &noise, &det2, &det3, &cutoff, &res, &envAmt, &fS, &aS, &keyTrack, &fDrive,
             &driftAmt, &velSens, &lfoRate, &lfoDepth, &bendRange, &bend, &modWheel}};
  }

  double rand() {  // xorshift32, identical to the TypeScript version
    uint32_t x = rng;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    rng = x;
    return x / 2147483648.0 - 1;
  }

  AnalogVoice* find(int id) {
    for (auto& v : voices) if (v.active && v.id == id) return &v;
    return nullptr;
  }

  void release(AnalogVoice& v, double fastTau) {
    if (v.released) return;
    v.released = true;
    if (fastTau > 0) { v.fast = true; v.amp.fastRelease(fastTau, sr); v.fenv.fastRelease(fastTau, sr); }
    else { v.amp.gate(false); v.fenv.gate(false); }
  }

  double lfoValue(const AnalogVoice& v) const {
    const double p = v.lfoPh;
    switch (lfoShape) {
      case 1: return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      case 2: return p < 0.5 ? 1 : -1;
      case 3: return 1 - 2 * p;
      case 4: return v.lfoHold;
      default: return std::sin(2 * PI * p);
    }
  }
};

}  // namespace sy1
