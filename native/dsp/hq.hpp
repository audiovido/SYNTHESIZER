// SY-1 native DSP — HQ engine (C++17, header-only, no allocations after construction).
//
// Line-by-line port of src/dsp/hq-engine.ts (the web reference), the engine
// behind every machine without a special engine: SY-1, Yazd, Baku, Merv,
// Isfahan, Konya, Bam, Kerman, Bushehr, Rasht, Hormoz. Keep both in sync:
// native/tests/hq_parity.cpp + hq_parity.mts check that they render the same
// samples. Lives in sy1::hq so it can share a binary with the Tabriz engine;
// reuses its transistor ladder (analog.hpp) for the LADDER filter type.
//
// Precision notes (needed for sample parity with TypeScript):
//  - Lookup tables are float (JS Float32Array); every read widens to double
//    BEFORE subtracting neighbours, like JS does.
//  - JS `x | 0` (truncation) -> static_cast<int>; Math.round(n) -> floor(n + 0.5).
#pragma once
#include <cmath>
#include <cstdint>
#include <string>

#include "analog.hpp"  // sy1::Ladder, sy1::resToLadder (the Tabriz ladder, shared)

namespace sy1 {
namespace hq {

constexpr int POOL = 24;          // voice slots
constexpr int MAX_SOUNDING = 10;  // held/ringing voices before the oldest is stolen
constexpr int MAX_ACTIVE = 16;    // including release tails
constexpr int MAX_UNI = 7;
constexpr double PEAK = 0.42;
constexpr double PI = 3.14159265358979323846;
constexpr double SQRT2 = 1.4142135623730951;
const double C4 = std::log2(261.6256);  // key tracking pivot: cutoff unchanged at middle C

inline double fastTanh(double x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const double x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

// ---- lookup tables (built once, shared by every engine instance) ----
constexpr int SINE_N = 2048;
constexpr int TBL_N = 4096;
constexpr int TBL_MASK = TBL_N - 1;
constexpr int H_MAX = 1024;
constexpr int TBL_COUNT = 21;  // H = 1024 * 2^(-j/2), j = 0..20

struct Tables {
  float sine[SINE_N + 1];
  float wave[3][TBL_COUNT][TBL_N + 1];  // saw, square, triangle; ~1 MB
  int tblH[TBL_COUNT];

  Tables() {
    for (int i = 0; i <= SINE_N; i++) sine[i] = static_cast<float>(std::sin((2 * PI * i) / SINE_N));
    for (int j = 0; j < TBL_COUNT; j++) {
      const int h = static_cast<int>(std::floor(H_MAX * std::pow(2.0, -j / 2.0)));
      tblH[j] = h < 1 ? 1 : h;
    }
    build(0);
    build(1);
    build(2);
  }

  static double coef(int w, int h) {
    switch (w) {
      case 0: return (h % 2 ? 1.0 : -1.0) / h;                                        // saw
      case 1: return h % 2 ? 1.0 / h : 0.0;                                            // square
      default: return h % 2 ? (((h - 1) / 2) % 2 ? -1.0 : 1.0) / double(h * h) : 0.0;  // triangle
    }
  }

  // Add harmonics cumulatively, snapshot (peak-normalised) at each table's harmonic count.
  void build(int w) {
    static double acc[TBL_N];
    for (int n = 0; n < TBL_N; n++) acc[n] = 0;
    int next = TBL_COUNT - 1;
    for (int h = 1; h <= H_MAX && next >= 0; h++) {
      const double a = coef(w, h);
      if (a != 0) {
        const double om = (2 * PI * h) / TBL_N;
        const double cw = std::cos(om), sw = std::sin(om);
        double c = 1, s = 0;
        for (int n = 0; n < TBL_N; n++) {
          acc[n] += a * s;
          const double c2 = c * cw - s * sw;
          s = s * cw + c * sw;
          c = c2;
        }
      }
      while (next >= 0 && tblH[next] == h) {
        double m = 0;
        for (int n = 0; n < TBL_N; n++) m = std::fmax(m, std::fabs(acc[n]));
        const double g = m > 0 ? 1 / m : 1;
        float* t = wave[w][next];
        for (int n = 0; n < TBL_N; n++) t[n] = static_cast<float>(acc[n] * g);
        t[TBL_N] = t[0];
        next--;
      }
    }
  }
};

inline const Tables& tables() {
  static const Tables* t = new Tables();  // built once on first engine construction, never freed
  return *t;
}

inline double sineAt(const float* SINE, double ph) {
  const double x = ph * SINE_N;
  const int i = static_cast<int>(x);
  const double a = SINE[i], b = SINE[i + 1];
  return a + (b - a) * (x - i);
}

inline int tableFor(double dt) {
  const double limit = 0.5 / std::fmax(1e-9, dt);
  if (limit >= H_MAX) return 0;
  const int j = static_cast<int>(std::ceil(2 * std::log2(H_MAX / limit)));
  return j < 0 ? 0 : j >= TBL_COUNT ? TBL_COUNT - 1 : j;
}

inline double readTable(const float* t, double ph) {
  const double x = ph * TBL_N;
  const int xi = static_cast<int>(x);
  const int i = xi & TBL_MASK;
  const double a = t[i], b = t[i + 1];
  return a + (b - a) * (x - xi);
}

struct Smooth {
  double target, cur, prev;
  explicit Smooth(double v = 0) : target(v), cur(v), prev(v) {}
  void step(double a) { prev = cur; cur += (target - cur) * a; if (std::fabs(target - cur) < 1e-9) cur = target; }
  void snap() { cur = prev = target; }
};

inline uint32_t xorshift(uint32_t x) {
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return x;
}

struct Voice {
  bool active = false, released = false, tahrirOn = false;
  int id = 0, order = 0, delay = 0, relDelay = -1;
  double vel = 1, relFast = 0;
  double lf = 0, lfTarget = 0, glideC = 1;
  double ph1[MAX_UNI] = {}, ph2[MAX_UNI] = {};
  int tb1[MAX_UNI] = {}, tb2[MAX_UNI] = {};
  double subPh = 0, lfoPh = 0, lfoHold = 0, vibPh = 0;
  double t = 0, amp = 0.0001, fenv = 0, out = 1, relCoef = 0, scoopC = 0;
  double aL1 = 0, aL2 = 0, aR1 = 0, aR2 = 0, bL1 = 0, bL2 = 0, bR1 = 0, bR2 = 0;
  Ladder ladL, ladR;                     // LADDER filter type (L/R)
  double xPrevL = 0, xPrevR = 0;          // its 2x-oversampling input memory
  double drift[2] = {}, driftFix[2] = {};  // analog drift per oscillator (-1..1)
};

class Engine {
 public:
  explicit Engine(double sampleRate) : sr(sampleRate), T(tables()) {}

  // Choice params (strings) and numeric params, same keys as the web patch.
  void setParam(const std::string& key, const std::string& s) {
    if (key == "oriental") oriental = s == "on";
    else if (key == "osc1Wave") w1 = waveId(s, 0);
    else if (key == "osc2Wave") w2 = waveId(s, 1);
    else if (key == "filterType") ftype = s == "lowpass" ? 0 : s == "bandpass" ? 1 : s == "highpass" ? 2 : s == "lp24" ? 3 : s == "ladder" ? 4 : 0;
    else if (key == "lfoTarget") lfoTarget = s == "pitch" ? 0 : s == "filter" ? 1 : s == "amp" ? 2 : 0;
    else if (key == "lfoShape") lfoShape = s == "triangle" ? 1 : s == "square" ? 2 : s == "sawtooth" ? 3 : s == "sh" ? 4 : 0;
  }
  void setParam(const std::string& key, double n) {
    if (key == "osc1Oct") oct1 = n;
    else if (key == "osc2Oct") oct2 = n;
    else if (key == "unison") { const int u = static_cast<int>(std::floor(n + 0.5)); uni = u < 1 ? 1 : u > MAX_UNI ? MAX_UNI : u; }
    else if (key == "aA") aA = n;
    else if (key == "aD") aD = n;
    else if (key == "aR") aR = n;
    else if (key == "fA") fA = n;
    else if (key == "fD") fD = n;
    else if (key == "scoop") scoop = n;
    else if (key == "scoopTime") scoopTime = n;
    else if (key == "vibDelay") vibDelay = n;
    else if (key == "tahrir") tahrir = n;
    else if (key == "tahrirSpeed") tahrirSpeed = n;
    else if (key == "oscMix") mix.target = n;
    else if (key == "sub") sub.target = n;
    else if (key == "noise") noise.target = n;
    else if (key == "cutoff") cutoff.target = n;
    else if (key == "res") res.target = n;
    else if (key == "envAmt") envAmt.target = n;
    else if (key == "fS") fS.target = n;
    else if (key == "aS") aS.target = n;
    else if (key == "velSens") velSens.target = n;
    else if (key == "lfoRate") lfoRate.target = n;
    else if (key == "lfoDepth") lfoDepth.target = n;
    else if (key == "osc2Detune") detune2.target = n;
    else if (key == "bendRange") bendRange.target = n;
    else if (key == "uniDetune") uniDetune.target = n;
    else if (key == "uniWidth") uniWidth.target = n;
    else if (key == "vibDepth") vibDepth.target = n;
    else if (key == "vibRate") vibRate.target = n;
    else if (key == "keyTrack") keyTrack.target = n;
    else if (key == "filterDrive") fDrive.target = n;
    else if (key == "drift") driftAmt.target = n;
  }

  void snapParams() { for (Smooth* s : smooths()) s->snap(); }
  void setBend(double v) { bend.target = v; }
  void setMod(double v) { modWheel.target = v; }

  void noteOn(int id, int midi, double cents, double vel, int offset, double fromHz, double glide) {
    int sounding = 0, activeN = 0;
    Voice *oldS = nullptr, *oldA = nullptr;
    for (auto& v : voices) {
      if (!v.active) continue;
      activeN++;
      if (!oldA || v.order < oldA->order) oldA = &v;
      if (!v.released) {
        sounding++;
        if (!oldS || v.order < oldS->order) oldS = &v;
      }
    }
    if (sounding >= MAX_SOUNDING && oldS) release(*oldS, 0.02);
    if (activeN >= MAX_ACTIVE && oldA) release(*oldA, 0.005);
    Voice* slot = nullptr;
    for (auto& v : voices) if (!v.active) { slot = &v; break; }
    if (!slot) for (auto& v : voices) if (!slot || v.order < slot->order) slot = &v;
    const double target = 440 * std::pow(2.0, (midi - 69) / 12.0 + cents / 1200);
    Voice& s = *slot;
    const double startHz = fromHz > 0 ? fromHz : target;
    s.active = true;
    s.released = false;
    s.id = id;
    s.order = ++counter;
    s.vel = vel < 0 ? 0 : vel > 1 ? 1 : vel;
    s.delay = offset < 0 ? 0 : offset;
    s.relDelay = -1;
    s.relFast = 0;
    s.lf = s.lfTarget = std::log2(startHz);
    s.glideC = 1;
    for (int k = 0; k < MAX_UNI; k++) {
      s.ph1[k] = k == 0 ? 0 : nextInit();
      s.ph2[k] = k == 0 ? 0 : nextInit();
    }
    s.subPh = 0;
    s.lfoPh = 0;
    s.lfoHold = nextInit() * 2 - 1;
    s.vibPh = 0;
    s.t = 0;
    s.amp = 0.0001;
    s.fenv = 0;
    s.out = 1;
    s.relCoef = 0;
    s.aL1 = s.aL2 = s.aR1 = s.aR2 = 0;
    s.bL1 = s.bL2 = s.bR1 = s.bR2 = 0;
    s.ladL.reset(); s.ladR.reset();
    s.xPrevL = s.xPrevR = 0;
    for (int k = 0; k < 2; k++) {
      s.drift[k] = (nextInit() * 2 - 1) * 0.5;
      s.driftFix[k] = nextInit() * 2 - 1;
    }
    if (fromHz > 0 && glide > 0.004) {
      s.lfTarget = std::log2(target);
      s.glideC = 1 - std::exp(-1 / ((glide / 3) * sr));
    }
    s.scoopC = oriental && scoop > 0 ? -scoop * 200 : 0;
    s.tahrirOn = oriental && tahrir > 0 && s.vel >= 0.7;
  }

  void noteOff(int id, int offset, bool fast) {
    Voice* v = find(id);
    if (!v) return;
    v->relDelay = offset > v->delay ? offset : v->delay;
    v->relFast = fast ? 0.005 : 0;
  }

  void glideTo(int id, int midi, double cents, double glide) {
    Voice* v = find(id);
    if (!v) return;
    v->lfTarget = std::log2(440 * std::pow(2.0, (midi - 69) / 12.0 + cents / 1200));
    v->glideC = glide > 0.004 ? 1 - std::exp(-1 / ((glide / 3) * sr)) : 1;
  }

  void allOff() { for (auto& v : voices) if (v.active) release(v, 0); }

  // Adds n samples into L (and R when not null).
  void render(float* L, float* R, int n) {
    const double blockA = 1 - std::exp(-n / (0.01 * sr));
    for (Smooth* s : smooths()) s->step(blockA);

    const int N = uni;
    const double norm = 1 / std::sqrt(static_cast<double>(N));
    for (int k = 0; k < N; k++) {
      const double pos = N == 1 ? 0 : double(k) / (N - 1) - 0.5;
      uRatio[k] = std::pow(2.0, (pos * uniDetune.cur) / 1200);
      const double pan = N == 1 ? 0 : 2 * pos * uniWidth.cur;
      const double ang = ((pan + 1) * PI) / 4;
      uGL[k] = std::cos(ang) * SQRT2 * norm;
      uGR[k] = std::sin(ang) * SQRT2 * norm;
    }

    const double rs = res.cur;
    const int ft = ftype;
    const double kq = ft == 1 ? 1 / std::fmax(0.1, rs) : 1 / std::pow(10.0, rs / 20);
    const double drv = 1 + rs * 0.12;  // resonance-dependent drive into the resonant-node saturator
    const double drvInv = 1 / drv;
    const double base = cutoff.cur;
    const double top = std::fmin(20000, base * std::pow(2.0, envAmt.cur * 6));
    const double fSv = fS.cur;
    const double depth = std::fmin(1, lfoDepth.cur + modWheel.cur);
    const double bendCents = bend.cur * bendRange.cur * 100;
    const double lfoInc = lfoRate.cur / sr;
    const double ratio1 = std::pow(2.0, oct1);
    const double ratio2 = std::pow(2.0, oct2) * std::pow(2.0, detune2.cur / 1200);
    const double ratioSub = std::pow(2.0, oct1 - 1);
    const double attackA = std::fmax(1e-4, aA);
    const double decayC = 1 - std::exp(-1 / (std::fmax(0.005, aD / 3) * sr));
    const double attackF = std::fmax(1e-4, fA);
    const double fDecayC = 1 - std::exp(-1 / (std::fmax(0.005, fD / 3) * sr));
    const double scoopCoef = 1 - std::exp(-1 / (std::fmax(0.003, scoopTime / 3) * sr));
    const double vibDepthC = vibDepth.cur * 50;
    const double vibInc = vibRate.cur / sr;
    const double tahrirAmt = oriental ? tahrir * 200 : 0;
    const double velS = velSens.cur;
    const double aSv = aS.cur;
    const double maxFc = sr * 0.45;
    const double invN = 1.0 / n;
    const double invSr = 1 / sr;
    const int lt = lfoTarget, shape = lfoShape;
    const float* SINE = T.sine;
    const float(*T1)[TBL_N + 1] = w1 < 3 ? T.wave[w1] : nullptr;
    const float(*T2)[TBL_N + 1] = w2 < 3 ? T.wave[w2] : nullptr;
    const double BW = SQRT2;  // first LP24 stage: Butterworth damping
    // analog character
    const double kt = keyTrack.cur;
    const double fd = fDrive.cur;
    const double driveK = 1 + 4 * fd;
    const double driveG = (1 + 0.55 * fd) / driveK;
    const double driftC = driftAmt.cur;
    const double rL = resToLadder(rs);
    const double ladComp = 1 + 2.5 * rL;
    const double fsOs = sr * 2;

    for (auto& v : voices) {
      if (!v.active) continue;
      const double peak = PEAK * (1 - velS + velS * v.vel);
      const double sus = std::fmax(0.0001, peak * aSv);
      double g = 0, a1 = 0, a2 = 0, a3 = 0, b1 = 0, b2 = 0, b3 = 0;

      double dr1 = 1, dr2 = 1;
      if (driftC > 0) {
        for (int k = 0; k < 2; k++) {
          double d = v.drift[k] + (nextInit() * 2 - 1) * 0.06;
          d *= 0.996;
          v.drift[k] = d > 1 ? 1 : d < -1 ? -1 : d;
        }
        dr1 = std::pow(2.0, (driftC * (6 * v.drift[0] + 2 * v.driftFix[0])) / 1200);
        dr2 = std::pow(2.0, (driftC * (6 * v.drift[1] + 2 * v.driftFix[1])) / 1200);
      }

      const double fb = std::pow(2.0, std::fmax(v.lf, v.lfTarget)) * std::pow(2.0, (std::fmax(0.0, bendCents) + 60) / 1200);
      for (int k = 0; k < N; k++) {
        v.tb1[k] = tableFor((fb * ratio1 * uRatio[k]) / sr);
        v.tb2[k] = tableFor((fb * ratio2 * uRatio[k]) / sr);
      }

      for (int i = 0; i < n; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        if (v.relDelay == 0) { release(v, v.relFast); v.relDelay = -1; }
        else if (v.relDelay > 0) v.relDelay--;
        const double fr = i * invN;

        const double lfo = depth > 0 ? lfoValue(v, shape) : 0;
        v.lfoPh += lfoInc;
        if (v.lfoPh >= 1) { v.lfoPh -= 1; v.lfoHold = nextNoise(); }

        if (v.lf != v.lfTarget) {
          v.lf += (v.lfTarget - v.lf) * v.glideC;
          if (std::fabs(v.lfTarget - v.lf) < 1e-6) v.lf = v.lfTarget;
        }
        double cents = bendCents;
        if (lt == 0) cents += lfo * depth * 60;
        if (oriental && v.scoopC != 0) {
          cents += v.scoopC;
          v.scoopC -= v.scoopC * scoopCoef;
          if (std::fabs(v.scoopC) < 0.05) v.scoopC = 0;
        }
        const double t = v.t;
        if (vibDepthC > 0 && t > vibDelay) {
          const double ramp = std::fmin(1, (t - vibDelay) / 0.3);
          cents += sineAt(SINE, v.vibPh) * vibDepthC * ramp;
        }
        v.vibPh += vibInc;
        if (v.vibPh >= 1) v.vibPh -= 1;
        if (oriental && v.tahrirOn) {
          const double x = (t - 0.05) * tahrirSpeed;
          if (x > 0 && x < 2) {
            const double s = std::sin(PI * x);
            cents += tahrirAmt * s * s * (x < 1 ? 1 : 0.6);
          } else if (x >= 2) v.tahrirOn = false;
        }
        const double f0 = std::pow(2.0, v.lf + cents / 1200);

        const double mixV = mix.prev + (mix.cur - mix.prev) * fr;
        const double l1 = 1 - mixV;
        const double l2 = mixV;
        const double subG = (sub.prev + (sub.cur - sub.prev) * fr) * 0.8;
        const double noiseG = (noise.prev + (noise.cur - noise.prev) * fr) * 0.5;

        double xl = 0, xr = 0;
        for (int k = 0; k < N; k++) {
          const double ur = uRatio[k];
          if (l1 > 0) {
            double ph = v.ph1[k];
            const double s = (T1 ? readTable(T1[v.tb1[k]], ph) : sineAt(SINE, ph)) * l1;
            ph += (f0 * ratio1 * dr1 * ur) * invSr; if (ph >= 1) ph -= std::floor(ph); v.ph1[k] = ph;
            xl += s * uGL[k]; xr += s * uGR[k];
          }
          if (l2 > 0) {
            double ph = v.ph2[k];
            const double s = (T2 ? readTable(T2[v.tb2[k]], ph) : sineAt(SINE, ph)) * l2;
            ph += (f0 * ratio2 * dr2 * ur) * invSr; if (ph >= 1) ph -= std::floor(ph); v.ph2[k] = ph;
            xl += s * uGL[k]; xr += s * uGR[k];
          }
        }
        double c = 0;
        if (subG > 0) c += sineAt(SINE, v.subPh) * subG;
        v.subPh += f0 * ratioSub * dr1 * invSr;
        if (v.subPh >= 1) v.subPh -= std::floor(v.subPh);
        if (noiseG > 0) c += nextNoise() * noiseG;
        xl = (xl + c) * 0.5;
        xr = (xr + c) * 0.5;
        if (fd > 0) {
          xl = fastTanh(xl * driveK) * driveG;
          xr = fastTanh(xr * driveK) * driveG;
        }

        if (t < attackA) v.amp = 0.0001 + (peak - 0.0001) * (t / attackA);
        else v.amp += (sus - v.amp) * decayC;
        if (t < attackF) v.fenv = t / attackF;
        else v.fenv += (fSv - v.fenv) * fDecayC;
        v.t = t + invSr;

        if ((i & 3) == 0) {
          double fc = base + (top - base) * v.fenv;
          if (lt == 1) fc *= std::pow(2.0, lfo * depth * 2);
          if (kt != 0) fc *= std::pow(2.0, kt * (v.lf + cents / 1200 - C4));
          if (fc < 20) fc = 20; else if (fc > maxFc) fc = maxFc;
          if (ft == 4) {
            v.ladL.setCutoff(fc, fsOs, rL);
            v.ladR.setCutoff(fc, fsOs, rL);
          } else {
            g = std::tan((PI * fc) * invSr);
            a1 = 1 / (1 + g * (g + kq)); a2 = g * a1; a3 = g * a2;
            if (ft == 3) { b1 = 1 / (1 + g * (g + BW)); b2 = g * b1; b3 = g * b2; }
          }
        }

        double yl, yr;
        if (ft == 4) {  // LADDER: Tabriz transistor ladder, 2x oversampled, fed at 2x level
          const double inL = xl * 2, inR = xr * 2;
          v.ladL.tick(0.5 * (v.xPrevL + inL)); v.ladL.tick(inL); v.xPrevL = inL;
          v.ladR.tick(0.5 * (v.xPrevR + inR)); v.ladR.tick(inR); v.xPrevR = inR;
          yl = v.ladL.s4 * ladComp * 0.5;
          yr = v.ladR.s4 * ladComp * 0.5;
        } else if (ft == 3) {
          double v3 = xl - v.bL2;
          double v1 = b1 * v.bL1 + b2 * v3;
          double v2 = v.bL2 + b2 * v.bL1 + b3 * v3;
          v.bL1 = 2 * v1 - v.bL1; v.bL2 = 2 * v2 - v.bL2;
          double u = v2;
          v3 = u - v.aL2; v1 = a1 * v.aL1 + a2 * v3; v2 = v.aL2 + a2 * v.aL1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aL1 = 2 * v1 - v.aL1; v.aL2 = 2 * v2 - v.aL2;
          yl = v2;
          v3 = xr - v.bR2; v1 = b1 * v.bR1 + b2 * v3; v2 = v.bR2 + b2 * v.bR1 + b3 * v3;
          v.bR1 = 2 * v1 - v.bR1; v.bR2 = 2 * v2 - v.bR2;
          u = v2;
          v3 = u - v.aR2; v1 = a1 * v.aR1 + a2 * v3; v2 = v.aR2 + a2 * v.aR1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aR1 = 2 * v1 - v.aR1; v.aR2 = 2 * v2 - v.aR2;
          yr = v2;
        } else {
          double v3 = xl - v.aL2;
          double v1 = a1 * v.aL1 + a2 * v3;
          double v2 = v.aL2 + a2 * v.aL1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aL1 = 2 * v1 - v.aL1; v.aL2 = 2 * v2 - v.aL2;
          yl = ft == 0 ? v2 : ft == 1 ? kq * v1 : xl - kq * v1 - v2;
          v3 = xr - v.aR2; v1 = a1 * v.aR1 + a2 * v3; v2 = v.aR2 + a2 * v.aR1 + a3 * v3;
          v1 = fastTanh(v1 * drv) * drvInv;
          v.aR1 = 2 * v1 - v.aR1; v.aR2 = 2 * v2 - v.aR2;
          yr = ft == 0 ? v2 : ft == 1 ? kq * v1 : xr - kq * v1 - v2;
        }

        const double trem = lt == 2 ? 1 + lfo * depth * 0.5 : 1;
        if (v.released) v.out -= v.out * v.relCoef;
        const double gain = v.amp * trem * v.out;
        L[i] += yl * gain;
        if (R) R[i] += yr * gain;
      }

      if (std::fabs(v.aL1) < 1e-20) v.aL1 = 0;
      if (std::fabs(v.aL2) < 1e-20) v.aL2 = 0;
      if (std::fabs(v.aR1) < 1e-20) v.aR1 = 0;
      if (std::fabs(v.aR2) < 1e-20) v.aR2 = 0;
      if (std::fabs(v.bL1) < 1e-20) v.bL1 = 0;
      if (std::fabs(v.bL2) < 1e-20) v.bL2 = 0;
      if (std::fabs(v.bR1) < 1e-20) v.bR1 = 0;
      if (std::fabs(v.bR2) < 1e-20) v.bR2 = 0;
      v.ladL.flush();
      v.ladR.flush();
      if (v.released && v.out < 2e-5) v.active = false;
    }
  }

  Voice voices[POOL];

 private:
  static int waveId(const std::string& s, int def) {
    if (s == "sawtooth") return 0;
    if (s == "square") return 1;
    if (s == "triangle") return 2;
    if (s == "sine") return 3;
    return def;
  }

  struct SmoothList { Smooth* p[22]; Smooth** begin() { return p; } Smooth** end() { return p + 22; } };
  SmoothList smooths() {
    return {{&mix, &sub, &noise, &cutoff, &res, &envAmt, &fS, &aS, &velSens, &lfoRate, &lfoDepth, &detune2,
             &bendRange, &uniDetune, &uniWidth, &vibDepth, &vibRate, &bend, &modWheel, &keyTrack, &fDrive, &driftAmt}};
  }

  double nextNoise() { rng = xorshift(rng); return rng / 2147483648.0 - 1; }
  double nextInit() { rngInit = xorshift(rngInit); return rngInit / 4294967296.0; }

  Voice* find(int id) {
    for (auto& v : voices) if (v.active && v.id == id) return &v;
    return nullptr;
  }

  void release(Voice& v, double fastTau) {
    if (v.released) return;
    v.released = true;
    const double tau = fastTau != 0 ? fastTau : std::fmax(0.005, aR / 4);
    v.relCoef = 1 - std::exp(-1 / (tau * sr));
  }

  double lfoValue(const Voice& v, int shape) const {
    const double p = v.lfoPh;
    switch (shape) {
      case 1: return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      case 2: return p < 0.5 ? 1 : -1;
      case 3: return 1 - 2 * p;
      case 4: return v.lfoHold;
      default: return sineAt(T.sine, p);
    }
  }

  double sr;
  const Tables& T;
  int counter = 0;
  uint32_t rng = 0x9e3779b9u, rngInit = 0x2545f491u;
  int w1 = 0, w2 = 1, ftype = 0, lfoTarget = 0, lfoShape = 0, uni = 1;
  bool oriental = false;
  double oct1 = 0, oct2 = 0;
  double aA = 0.008, aD = 0.3, aR = 0.35, fA = 0.01, fD = 0.35;
  double scoop = 0, scoopTime = 0.08, vibDelay = 0.3, tahrir = 0, tahrirSpeed = 12;
  Smooth mix{0.45}, sub{0.2}, noise{0}, cutoff{2200}, res{2}, envAmt{0.45}, fS{0.25}, aS{0.75}, velSens{0.6},
      lfoRate{5}, lfoDepth{0}, detune2{8}, bendRange{2}, uniDetune{20}, uniWidth{0.5}, vibDepth{0}, vibRate{5.5},
      bend{0}, modWheel{0}, keyTrack{0}, fDrive{0}, driftAmt{0};
  double uRatio[MAX_UNI] = {}, uGL[MAX_UNI] = {}, uGR[MAX_UNI] = {};
};

}  // namespace hq
}  // namespace sy1
