// SY-1 native — the shared FX bus, built node for node like src/engine/bus.ts
// on top of native/wa (Chromium-exact Web Audio nodes), so the plugin's
// drive, EQ, delay, chorus, reverb, limiter, soft clipper and master volume
// sound exactly like the web app. Keep in sync with bus.ts; parity test:
// native/tests/bus_parity.mjs.
//
//   input -> drive (waveshaper 2x) -> driveComp -> eqLow -> eqMid -> eqHigh -> sum (dry)
//   eqHigh -> mainToFx -> fxIn <- sendIn (drum sends)
//   fxIn -> delay loop (lowpass 4.5k, highpass 180, tanh 2x in the feedback) -> delayWet -> sum
//   fxIn -> chorus (two modulated 12 ms delays, merged L/R) -> chorusWet -> sum
//   fxIn -> reverb (8 one-pole-damped wobbling combs -> 4 allpasses) -> revWet -> sum
//   sum -> master (volume) -> limiter -> soft clipper -> tap -> out (master volume) -> analyser
#pragma once
#include <cmath>
#include <map>
#include <string>
#include <vector>

#include "../wa/wa.hpp"

namespace sy1 {

class FxBus {
 public:
  struct Patch {
    double drive = 0, eqLow = 0, eqMid = 0, eqHigh = 0;
    double delayTime = 0.3, delayFb = 0.3, delayMix = 0;
    double chorusRate = 0.6, chorusDepth = 0.5, chorusMix = 0;
    double revSize = 2.2, revMix = 0, volume = 0.8;
  };

  FxBus(wa::Graph& g, const Patch& p, bool mainFxOn = true) : g_(g) {
    using namespace wa;
    input = g.make<Gain>();
    drive = g.make<WaveShaper>();
    drive->setCurve(driveCurve(p.drive));
    drive->setOversample(WaveShaper::X2);
    driveComp = g.make<Gain>();
    driveComp->gain.setValue(static_cast<float>(1 / (1 + p.drive * 1.5)));
    eqLow = g.make<Biquad>(Biquad::Lowshelf);
    eqLow->frequency.setValue(220);
    eqLow->gain.setValue(static_cast<float>(p.eqLow));
    eqMid = g.make<Biquad>(Biquad::Peaking);
    eqMid->frequency.setValue(1100);
    eqMid->Q.setValue(0.8f);
    eqMid->gain.setValue(static_cast<float>(p.eqMid));
    eqHigh = g.make<Biquad>(Biquad::Highshelf);
    eqHigh->frequency.setValue(4200);
    eqHigh->gain.setValue(static_cast<float>(p.eqHigh));
    input->connect(drive);
    drive->connect(driveComp);
    driveComp->connect(eqLow);
    eqLow->connect(eqMid);
    eqMid->connect(eqHigh);

    sum = g.make<Gain>();
    eqHigh->connect(sum);

    fxIn = g.make<Gain>();
    mainToFx = g.make<Gain>();
    mainToFx->gain.setValue(mainFxOn ? 1.0f : 0.0f);
    sendIn = g.make<Gain>();
    eqHigh->connect(mainToFx);
    mainToFx->connect(fxIn);
    sendIn->connect(fxIn);

    delay = g.make<Delay>(2.0);
    delay->delayTime.setValue(static_cast<float>(p.delayTime));
    fb = g.make<Gain>();
    fb->gain.setValue(static_cast<float>(std::min(0.95, p.delayFb)));
    delayTone = g.make<Biquad>(Biquad::Lowpass);
    delayTone->frequency.setValue(4500);
    delayTone->Q.setValue(static_cast<float>(0.7071067811865476));
    delayHP = g.make<Biquad>(Biquad::Highpass);
    delayHP->frequency.setValue(180);
    delayHP->Q.setValue(static_cast<float>(0.7071067811865476));
    delaySat = g.make<WaveShaper>();
    delaySat->setCurve(tanhCurve());
    delaySat->setOversample(WaveShaper::X2);
    delayWet = g.make<Gain>();
    delayWet->gain.setValue(static_cast<float>(p.delayMix * 0.7));
    fxIn->connect(delay);
    delay->connect(delayTone);
    delayTone->connect(delayHP);
    delayHP->connect(delayWet);
    delayWet->connect(sum);
    delayHP->connect(delaySat);
    delaySat->connect(fb);
    fb->connect(delay);

    auto* chorusIn = g.make<Gain>();
    fxIn->connect(chorusIn);
    auto* dl = g.make<Delay>(0.05);
    auto* dr = g.make<Delay>(0.05);
    dl->delayTime.setValue(0.012f);
    dr->delayTime.setValue(0.012f);
    chorusIn->connect(dl);
    chorusIn->connect(dr);
    chorusLfo = g.make<Oscillator>(PeriodicWave::Triangle);
    chorusLfo->frequency.setValue(static_cast<float>(p.chorusRate));
    chorusDepthL = g.make<Gain>();
    chorusDepthR = g.make<Gain>();
    chorusDepthL->gain.setValue(static_cast<float>(0.004 * p.chorusDepth));
    chorusDepthR->gain.setValue(static_cast<float>(-0.004 * p.chorusDepth));
    chorusLfo->connect(chorusDepthL);
    chorusLfo->connect(chorusDepthR);
    chorusDepthL->connect(&dl->delayTime);
    chorusDepthR->connect(&dr->delayTime);
    chorusLfo->start();
    auto* merge = g.make<Merger>(2);
    dl->connect(merge, 0);
    dr->connect(merge, 1);
    chorusWet = g.make<Gain>();
    chorusWet->gain.setValue(static_cast<float>(p.chorusMix * 0.9));
    merge->connect(chorusWet);

    revWet = g.make<Gain>();
    revWet->gain.setValue(static_cast<float>(p.revMix * 0.9));
    wa::Node* revOut = buildReverb(fxIn, p.revSize);
    revOut->connect(revWet);
    revWet->connect(sum);

    master = g.make<Gain>();
    master->gain.setValue(static_cast<float>(p.volume));
    limiter = g.make<Compressor>();
    limiter->threshold.setValue(-6);
    limiter->ratio.setValue(12);
    limiter->attack.setValue(0.003f);
    limiter->release.setValue(0.2f);
    auto* analyserIn = g.make<Passthrough>();
    chorusWet->connect(sum);
    sum->connect(master);
    master->connect(limiter);
    clipIn = g.make<Gain>();
    clipIn->gain.setValue(1.0f / 4);
    clip = g.make<WaveShaper>();
    clip->setCurve(softClipCurve());
    limiter->connect(clipIn);
    clipIn->connect(clip);
    tap = g.make<Gain>();
    out = g.make<Gain>();
    clip->connect(tap);
    tap->connect(out);
    out->connect(analyserIn);
    output = analyserIn;
  }

  /** Same as setSynthParam's bus branch (smoothed with setTargetAtTime). */
  void setParam(const std::string& key, double v) {
    const double now = g_.ctx.currentTime();
    auto tgt = [&](wa::Param& p, double val, double tc) { p.setTargetAtTime(static_cast<float>(val), now, tc); };
    if (key == "drive") { drive->setCurve(driveCurve(v)); tgt(driveComp->gain, 1 / (1 + v * 1.5), 0.02); }
    else if (key == "eqLow") tgt(eqLow->gain, v, 0.02);
    else if (key == "eqMid") tgt(eqMid->gain, v, 0.02);
    else if (key == "eqHigh") tgt(eqHigh->gain, v, 0.02);
    else if (key == "delayTime") tgt(delay->delayTime, v, 0.05);
    else if (key == "delayFb") tgt(fb->gain, std::min(0.95, v), 0.02);
    else if (key == "delayMix") tgt(delayWet->gain, v * 0.7, 0.02);
    else if (key == "revMix") tgt(revWet->gain, v * 0.9, 0.02);
    else if (key == "chorusMix") tgt(chorusWet->gain, v * 0.9, 0.03);
    else if (key == "chorusRate") tgt(chorusLfo->frequency, v, 0.05);
    else if (key == "chorusDepth") { tgt(chorusDepthL->gain, 0.004 * v, 0.05); tgt(chorusDepthR->gain, -0.004 * v, 0.05); }
    else if (key == "volume") tgt(master->gain, v, 0.02);
    else if (key == "revSize") for (auto& c : combs_) tgt(c.fb->gain, combFeedback(c.delaySec, v), 0.05);
  }
  /** Drum machines feed the effects only through per-voice sends. */
  void setMainToFx(bool on) { mainToFx->gain.setTargetAtTime(on ? 1.0f : 0.0f, g_.ctx.currentTime(), 0.02); }
  /** App master volume (knob position 0..1, gain = position squared). */
  void setMasterVolume(double v) { out->gain.setTargetAtTime(static_cast<float>(v * v), g_.ctx.currentTime(), 0.015); }

  wa::Gain *input, *sendIn, *tap, *out;
  wa::Node* output;

  static std::vector<float> driveCurve(double amount) {
    const double k = amount * 60;
    const int n = 1024;
    std::vector<float> c(n);
    for (int i = 0; i < n; i++) {
      const double x = (static_cast<double>(i) / (n - 1)) * 2 - 1;
      c[i] = static_cast<float>(k == 0 ? x : ((1 + k) * x) / (1 + k * std::fabs(x)));
    }
    return c;
  }
  static std::vector<float> tanhCurve() {
    const int n = 1024;
    std::vector<float> c(n);
    for (int i = 0; i < n; i++) {
      const double x = (static_cast<double>(i) / (n - 1)) * 2 - 1;
      c[i] = static_cast<float>(std::tanh(x * 1.6) / std::tanh(1.6));
    }
    return c;
  }
  static std::vector<float> softClipCurve() {
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

 private:
  wa::Graph& g_;
  wa::Gain *driveComp, *sum, *fxIn, *mainToFx, *fb, *delayWet, *chorusDepthL, *chorusDepthR, *chorusWet, *revWet, *master, *clipIn;
  wa::WaveShaper *drive, *delaySat, *clip;
  wa::Biquad *eqLow, *eqMid, *eqHigh, *delayTone, *delayHP;
  wa::Delay* delay;
  wa::Oscillator* chorusLfo;
  wa::Compressor* limiter;
  struct Comb { wa::Gain* fb; double delaySec; };
  std::vector<Comb> combs_;
  double dampPeak_ = 1.01;
 public:
  /** Test hook: bit i set = allpass i pulls its delay branch first (see buildReverb). */
  static inline int apOrderMask_ = 0;
 private:

  static constexpr double kDampHz = 4500;
  double dampD() const { return std::exp((-2 * wa::PI * kDampHz) / g_.ctx.sampleRate); }
  wa::IIR* makeDamp() {
    const double d = dampD();
    return g_.make<wa::IIR>(std::vector<double>{1 - d}, std::vector<double>{1, -d});
  }
  /** measureDampPeakGain: magnitude of the one-pole over 300 frequencies (as float, like getFrequencyResponse). */
  double measureDampPeak() const {
    const double d = dampD();
    const int n = 300;
    const double nyq = g_.ctx.sampleRate / 2;
    double peak = 1;
    for (int i = 0; i < n; i++) {
      const float fr = static_cast<float>((static_cast<double>(i) / n) * nyq);
      const double w = wa::PI * (fr / nyq);
      const double re = 1 - d * std::cos(w), im = d * std::sin(w);
      const float mag = static_cast<float>((1 - d) / std::sqrt(re * re + im * im));
      if (std::isfinite(mag) && mag > peak) peak = mag;
    }
    return peak * 1.01;
  }
  double combFeedback(double delaySec, double rt60) const {
    const double t = std::max(0.05, rt60);
    const double g = std::pow(10, (-3 * delaySec) / t) / dampPeak_;
    return std::min(0.97, std::max(0.0, g));
  }
  wa::Node* buildReverb(wa::Node* in, double revSize) {
    using namespace wa;
    static const int combS[8] = {1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116};
    static const int apS[4] = {556, 441, 341, 225};
    dampPeak_ = measureDampPeak();
    auto* scale = g_.make<Gain>();
    scale->gain.setValue(0.14f);
    in->connect(scale);
    auto* combSum = g_.make<Gain>();
    for (int i = 0; i < 8; i++) {
      const double ds = combS[i] / 44100.0;
      auto* dly = g_.make<Delay>(1.0);
      dly->delayTime.setValue(static_cast<float>(ds));
      IIR* damp = makeDamp();
      auto* wob = g_.make<Oscillator>(PeriodicWave::Sine);
      wob->frequency.setValue(static_cast<float>(0.13 + 0.11 * (i % 8)));
      auto* wobAmt = g_.make<Gain>();
      wobAmt->gain.setValue(0.00035f);
      wob->connect(wobAmt);
      wobAmt->connect(&dly->delayTime);
      wob->start();
      auto* f = g_.make<Gain>();
      f->gain.setValue(static_cast<float>(combFeedback(ds, revSize)));
      scale->connect(dly);
      dly->connect(damp);
      damp->connect(f);
      f->connect(dly);
      damp->connect(combSum);
      combs_.push_back({f, ds});
    }
    Node* stage = combSum;
    for (int i = 0; i < 4; i++) {
      const double ds = apS[i] / 44100.0;
      auto* u = g_.make<Gain>();
      auto* dly = g_.make<Delay>(1.0);
      dly->delayTime.setValue(static_cast<float>(ds));
      auto* fbG = g_.make<Gain>();
      fbG->gain.setValue(0.5f);
      auto* neg = g_.make<Gain>();
      neg->gain.setValue(-0.5f);
      auto* o = g_.make<Gain>();
      stage->connect(u);
      u->connect(dly);
      dly->connect(fbG);
      fbG->connect(u);
      u->connect(neg);
      // Chrome sums a node's inputs in hash-set order, so which branch it pulls first (and so
      // where it breaks this feedback cycle) changes from one page load to the next. -g*u first
      // gives the true Schroeder allpass (both paths see the same delay); the plugin always uses it.
      if (apOrderMask_ & (1 << i)) { dly->connect(o); neg->connect(o); }
      else { neg->connect(o); dly->connect(o); }
      stage = o;
    }
    return stage;
  }
};

}  // namespace sy1
