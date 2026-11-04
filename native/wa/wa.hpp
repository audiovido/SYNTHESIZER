// SY-1 native — a small Web Audio engine that renders like Chromium (C++17).
//
// Same render model as Chrome: 128-frame quanta, nodes pulled from the output,
// each node processed once per quantum (a node pulled again inside a cycle
// returns its previous quantum's output, exactly as Chrome's
// ProcessIfNecessary does), "speakers" up/down-mixing, channel counts fixed by
// the graph. Node algorithms follow Chromium's sources; see NOTICE.md.
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <cstdint>
#include <cstring>
#include <memory>
#include <mutex>
#include <vector>

#include "param.hpp"

namespace wa {

constexpr double PI = 3.14159265358979323846;
constexpr float kPiOverTwoFloat = 1.57079632679489661923f;
constexpr double kPiOverTwoDouble = 1.57079632679489661923;

inline size_t timeToSampleFrame(double time, double sr, int rounding /*0 nearest, 1 down, 2 up*/) {
  double frame = std::round(time * sr * 1024.0) / 1024.0;
  frame = rounding == 0 ? std::round(frame) : rounding == 1 ? std::floor(frame) : std::ceil(frame);
  return static_cast<size_t>(frame);
}
inline float flushDenormal(double x) { return std::fabs(x) < 1.1754943508222875e-38 ? 0.0f : static_cast<float>(x); }
inline double flushDenormalD(double x) { return std::fabs(x) < 1.1754943508222875e-38 ? 0.0 : x; }
inline float dbToLin(float db) { return powf(10, 0.05f * db); }
inline float linToDb(float lin) { return 20 * log10f(lin); }

// ============================================================ AudioParam ====
inline float Param::finalValue() {
  float v = intrinsic_;
  calculateFinalValues(&v, 1, false);
  return v;
}

// ================================================================= graph ====
struct Bus {
  int channels = 1;
  alignas(16) float ch[2][RQ] = {};
  void zero() { std::memset(ch, 0, sizeof ch); }
};

enum class Mode { Max, ClampedMax, Explicit };

class Node {
 public:
  explicit Node(Context* c, int numInputs = 1) : ctx(c), inputs(numInputs) {}
  virtual ~Node() = default;

  Context* ctx;
  std::vector<std::vector<Node*>> inputs;  // per input: connected outputs, in connection order
  int channelCount = 2;
  Mode mode = Mode::Max;
  Bus out;
  std::vector<Bus> in;  // mixed input buses for this quantum

  void connect(Node* dest, int inputIndex = 0) {
    auto& v = dest->inputs[inputIndex];
    if (std::find(v.begin(), v.end(), this) == v.end()) v.push_back(this);
  }
  void connect(Param* p) {
    if (std::find(p->inputs.begin(), p->inputs.end(), this) == p->inputs.end()) p->inputs.push_back(this);
  }
  void disconnect(Node* dest) {
    for (auto& v : dest->inputs) v.erase(std::remove(v.begin(), v.end(), this), v.end());
  }

  /** Channels of input i (Chrome AudioNodeInput::NumberOfChannels). */
  int inputChannels(int i) const {
    if (mode == Mode::Explicit) return channelCount;
    int mx = 0;
    for (Node* o : inputs[i]) mx = std::max(mx, o->out.channels);
    if (!mx) mx = 1;
    if (mode == Mode::ClampedMax) mx = std::min(mx, channelCount);
    return mx;
  }
  /** The node's AudioParams (for graph walks). */
  virtual void params(std::vector<Param*>&) {}
  int mark = 0;  // scratch flag for graph walks
  /** Channels this node outputs, given its inputs (structural; see Graph::updateChannels). */
  virtual int outputChannels() const { return inputChannels(0); }

  Bus& pull() {
    if (lastFrame_ != ctx->frame) {
      lastFrame_ = ctx->frame;
      pullInputs();
      process();
    }
    return out;
  }
  bool connectedInput(int i) const { return !inputs[i].empty(); }

 protected:
  virtual void process() = 0;

  void pullInputs() {
    in.resize(inputs.size());
    for (size_t i = 0; i < inputs.size(); i++) {
      Bus& b = in[i];
      b.channels = inputChannels(static_cast<int>(i));
      b.zero();
      for (Node* o : inputs[i]) sumInto(b, o->pull());
    }
  }
  static void sumInto(Bus& dst, const Bus& src) {
    if (dst.channels == src.channels) {
      for (int c = 0; c < dst.channels; c++)
        for (int k = 0; k < RQ; k++) dst.ch[c][k] += src.ch[c][k];
    } else if (dst.channels == 2 && src.channels == 1) {  // up-mix: mono to both
      for (int k = 0; k < RQ; k++) { dst.ch[0][k] += src.ch[0][k]; dst.ch[1][k] += src.ch[0][k]; }
    } else if (dst.channels == 1 && src.channels == 2) {  // down-mix: 0.5 (L + R)
      for (int k = 0; k < RQ; k++) dst.ch[0][k] += 0.5f * (src.ch[0][k] + src.ch[1][k]);
    }
  }

 private:
  size_t lastFrame_ = static_cast<size_t>(-1);
};

// AudioParam: values from the timeline plus every connected input (mono-mixed), then clamped.
inline void Param::calculateFinalValues(float* values, int n, bool sampleAccurate) {
  if (sampleAccurate) {
    intrinsic_ = valuesForFrameRange(ctx->frame, ctx->frame + n, intrinsic_, values, n, ctx->sampleRate, ctx->sampleRate);
  } else {
    float value = intrinsic_;
    if (!events_.empty() && !(ctx->currentTime() < events_[0].time)) {
      float v = 0;
      value = valuesForFrameRange(ctx->frame, ctx->frame + 1, intrinsic_, &v, 1, ctx->sampleRate, ctx->sampleRate / RQ);
    }
    for (int k = 0; k < n; k++) values[k] = value;
    intrinsic_ = clamp(value);
  }
  if (!inputs.empty()) {
    const int m = sampleAccurate ? n : 1;
    for (Node* o : inputs) {
      const Bus& b = o->pull();
      if (b.channels == 1) for (int k = 0; k < m; k++) values[k] += b.ch[0][k];
      else for (int k = 0; k < m; k++) values[k] += 0.5f * (b.ch[0][k] + b.ch[1][k]);
    }
    if (!sampleAccurate) for (int k = 1; k < n; k++) values[k] = values[0];
    for (int k = 0; k < n; k++) {
      if (std::isnan(values[k])) values[k] = def_;
      values[k] = std::min(max_, std::max(min_, values[k]));
    }
  }
}

inline float Param::valuesForFrameRange(size_t startFrame, size_t endFrame, float def, float* values, int n, double sr,
                                        double controlRate) {
  valuesImpl(startFrame, endFrame, def, values, n, sr, controlRate);
  for (int k = 0; k < n; k++) values[k] = std::min(max_, std::max(min_, values[k]));
  return values[n - 1];
}

inline void Param::valuesImpl(size_t startFrame, size_t endFrame, float def, float* values, int n, double sr,
                              double controlRate) {
  if (events_.empty() || endFrame / sr <= events_[0].time) {
    std::fill(values, values + n, def);
    return;
  }
  // clamp events added since the last render to the current time
  {
    bool clamped = false;
    const double now = startFrame / sr;
    for (auto& e : events_) {
      if (!e.isNew) continue;
      if (e.time < now) { e.time = now; clamped = true; }
      e.isNew = false;
    }
    if (clamped) std::stable_sort(events_.begin(), events_.end(), [](const Event& a, const Event& b) { return a.time < b.time; });
  }
  // all events in the past
  {
    const Event& last = events_.back();
    const double now = startFrame / sr;
    if (last.time + 1.5 * RQ / sr < now) {
      bool done = true;
      if (last.type == SetTarget) {
        if (converged(def, last.value, now, last.time, last.timeConstant)) def = last.value;
        else done = false;
      }
      if (done) {
        std::fill(values, values + n, def);
        removeOld(events_.size());
        return;
      }
    }
  }
  size_t currentFrame = startFrame;
  size_t w = 0;
  {
    const double first = events_[0].time;
    if (first > startFrame / sr) {
      size_t fillEnd = endFrame;
      const double ff = std::ceil(first * sr);
      if (endFrame > ff) fillEnd = static_cast<size_t>(ff);
      size_t fillTo = std::min(fillEnd - startFrame, static_cast<size_t>(n));
      std::fill(values + w, values + fillTo, def);
      w = fillTo;
      currentFrame += fillTo;
    }
  }
  float value = def;
  size_t skipped = 0;
  const size_t ne = events_.size();
  for (size_t i = 0; i < ne && w < static_cast<size_t>(n); i++) {
    if (!isCurrent(i, currentFrame)) { skipped++; continue; }
    Event* ev = &events_[i];
    const bool hasNext = i + 1 < ne;
    const Type nextType = hasNext ? events_[i + 1].type : CancelValues;  // CancelValues = "none" here
    // setTarget followed by a ramp: the ramp starts from where the target curve is now
    if (ev->type == SetTarget && hasNext && (nextType == LinearRamp || nextType == ExpRamp)) {
      if (std::fabs(2 * sr * ev->time - 2.0 * currentFrame + 1) <= 1) {
        value = ev->value + (value - ev->value) * std::exp(-(currentFrame / sr - ev->time) / ev->timeConstant);
      } else {
        const float dtc = static_cast<float>(discreteTimeConstant(ev->timeConstant, controlRate));
        value += (ev->value - value) * dtc;
      }
      events_[i] = Event{SetValue, value, currentFrame / sr};
      events_[i].isNew = false;
      ev = &events_[i];
    }
    const float value1 = ev->value;
    const double time1 = ev->time;
    const float value2 = hasNext ? events_[i + 1].value : value1;
    const double time2 = hasNext ? events_[i + 1].time : endFrame / sr + 1;
    const size_t fillEnd = endFrame > time2 * sr ? static_cast<size_t>(std::ceil(time2 * sr)) : endFrame;
    const size_t fillTo = std::min(fillEnd - startFrame, static_cast<size_t>(n));

    if (hasNext && nextType == LinearRamp) {
      const double dt = time2 - time1;
      const float k = dt <= std::numeric_limits<float>::min() ? 0 : static_cast<float>(1 / dt);
      const float vd = value2 - value1;
#ifdef WA_X86_PARAMS  // Chrome on x86: SSE ramp, four values at a time accumulated in float
      if (fillTo > w) {
        const float inv = static_cast<float>(1 / sr), kv = k * vd;
        float v4[4];
        for (int j = 0; j < 4; j++) v4[j] = (inv * j + static_cast<float>(currentFrame / sr - time1)) * kv + value1;
        const float vinc = static_cast<float>(4 / sr * k * vd);
        const size_t trunc = w + ((fillTo - w) / 4) * 4;
        currentFrame += trunc - w;
        for (; w < trunc; w += 4)
          for (int j = 0; j < 4; j++) { values[w + j] = v4[j]; v4[j] += vinc; }
      }
      if (w >= 1) value = values[w - 1];
#endif
      for (; w < fillTo; w++) {
        const float x = static_cast<float>((currentFrame / sr - time1) * k);
        value = value1 + x * vd;
        values[w] = value;
        ++currentFrame;
      }
    } else if (hasNext && nextType == ExpRamp) {
      if (value1 * value2 <= 0 || time1 >= time2) {
        value = value1;
        std::fill(values + w, values + fillTo, value);
        w = fillTo;
      } else {
        const double dt = time2 - time1;
        const double nsf = dt * sr;
        const double mult = std::pow(value2 / value1, 1.0 / nsf);
        value = static_cast<float>(value1 * std::pow(value2 / static_cast<double>(value1), (currentFrame / sr - time1) / dt));
        double acc = value;
        for (; w < fillTo; w++) {
          value = static_cast<float>(acc);
          acc *= mult;
          ++currentFrame;
          values[w] = value;
        }
        if (currentFrame > time2 * sr - 0.5) value = value2;
      }
    } else {
      switch (ev->type) {
        case SetValue:
        case LinearRamp:
        case ExpRamp:
        case CancelValues:
          currentFrame = fillEnd;
          value = ev->value;
          std::fill(values + w, values + fillTo, value);
          w = fillTo;
          break;
        case SetTarget: {
          const float target = value1;
          const float tc = static_cast<float>(ev->timeConstant);
          const float dtc = static_cast<float>(discreteTimeConstant(tc, controlRate));
          const double rs = time1 * sr;
          if (rs <= currentFrame && currentFrame < rs + 1) {
            value = static_cast<float>(target + (value - target) * std::exp(-(currentFrame / sr - time1) / tc));
          } else {
            value += (target - value) * dtc;
          }
          if (converged(value, target, currentFrame / sr, time1, tc)) {
            currentFrame += fillTo - w;
            std::fill(values + w, values + fillTo, target);
            w = fillTo;
          } else {
#ifdef WA_X86_PARAMS
            if (fillTo > w) {
              const float c0 = dtc, c1 = c0 * (2 - c0), c2 = c0 * ((c0 - 3) * c0 + 3), c3 = c0 * (c0 * ((4 - c0) * c0 - 6) + 4);
              const size_t trunc = w + ((fillTo - w) / 4) * 4;
              for (; w < trunc; w += 4) {
                const float delta = target - value;
                values[w] = value + delta * 0; values[w + 1] = value + delta * c0;
                values[w + 2] = value + delta * c1; values[w + 3] = value + delta * c2;
                value += delta * c3;
              }
            }
#endif
            for (; w < fillTo; w++) {
              const float v = value;
              value += (target - value) * dtc;
              values[w] = v;
            }
            if (w >= 1) value = values[w - 1];
            currentFrame = fillEnd;
          }
          break;
        }
      }
    }
  }
  if (skipped) removeOld(skipped);
  std::fill(values + w, values + n, value);
}

// ============================================================ basic nodes ===
/** Plain passthrough with gain (GainNode). */
class Gain : public Node {
 public:
  Param gain;
  explicit Gain(Context* c, float g = 1) : Node(c), gain(c, 1, -3.4028235e38f, 3.4028235e38f) {
    if (g != 1) gain.setValue(g);
  }
  void params(std::vector<Param*>& v) override { v.push_back(&gain); }
 protected:
  void process() override {
    const Bus& b = in[0];
    out.channels = b.channels;
    if (!connectedInput(0)) { out.zero(); return; }
    if (gain.hasSampleAccurateValues() && gain.isAudioRate()) {
      float g[RQ];
      gain.calculateSampleAccurateValues(g);
      for (int c = 0; c < b.channels; c++)
        for (int k = 0; k < RQ; k++) out.ch[c][k] = b.ch[c][k] * g[k];
      return;
    }
    const float g = gain.finalValue();
    if (g == 0) { out.zero(); return; }
    for (int c = 0; c < b.channels; c++)
      for (int k = 0; k < RQ; k++) out.ch[c][k] = b.ch[c][k] * g;
  }
};

/** AnalyserNode as a passthrough (the analysis itself is UI-only). */
class Passthrough : public Node {
 public:
  explicit Passthrough(Context* c) : Node(c) {}
 protected:
  void process() override {
    out.channels = in[0].channels;
    std::memcpy(out.ch, in[0].ch, sizeof out.ch);
  }
};

/** ChannelMerger(n): input i (mixed to mono) becomes output channel i. */
class Merger : public Node {
 public:
  explicit Merger(Context* c, int n = 2) : Node(c, n) { channelCount = 1; mode = Mode::Explicit; }
  int outputChannels() const override { return static_cast<int>(inputs.size()); }
 protected:
  void process() override {
    out.channels = static_cast<int>(inputs.size());
    for (int i = 0; i < out.channels; i++) std::memcpy(out.ch[i], in[i].ch[0], sizeof out.ch[i]);
  }
};

// ================================================================ Biquad ====
class Biquad : public Node {
 public:
  enum Type { Lowpass, Highpass, Bandpass, Lowshelf, Highshelf, Peaking, Notch, Allpass };
  Type type = Lowpass;
  Param frequency, Q, gain, detune;
  explicit Biquad(Context* c, Type t = Lowpass)
      : Node(c), type(t),
        frequency(c, 350, 0, static_cast<float>(c->sampleRate / 2)),
        Q(c, 1, -3.4028235e38f, 3.4028235e38f),
        gain(c, 0, -3.4028235e38f, 1541),
        detune(c, 0, -153600, 153600) {}
  void params(std::vector<Param*>& v) override { v.push_back(&frequency); v.push_back(&Q); v.push_back(&gain); v.push_back(&detune); }

 protected:
  struct Kernel { double x1 = 0, x2 = 0, y1 = 0, y2 = 0; };
  std::vector<Kernel> k_;
  double b0_[RQ], b1_[RQ], b2_[RQ], a1_[RQ], a2_[RQ];
  bool sampleAccurate_ = false, justReset_ = true;
  float pf_ = NAN, pq_ = NAN, pg_ = NAN, pd_ = NAN;

  static double pow10f(double x) { return expf(static_cast<float>(x * 2.302585092994046)); }
  void setN(int i, double b0, double b1, double b2, double a0, double a1, double a2) {
    const double inv = 1 / a0;
    b0_[i] = b0 * inv; b1_[i] = b1 * inv; b2_[i] = b2 * inv; a1_[i] = a1 * inv; a2_[i] = a2 * inv;
  }
  void setParams(int i, double f, double q, double g) {
    switch (type) {
      case Lowpass:
      case Highpass: {
        f = std::min(1.0, std::max(0.0, f));
        const bool lp = type == Lowpass;
        if (f == 1) { lp ? setN(i, 1, 0, 0, 1, 0, 0) : setN(i, 0, 0, 0, 1, 0, 0); }
        else if (f > 0) {
          const double res = pow10f(q / 20);
          const double th = PI * f, alpha = std::sin(th) / (2 * res), c = std::cos(th);
          const double beta = lp ? (1 - c) / 2 : (1 + c) / 2;
          setN(i, beta, lp ? 2 * beta : -2 * beta, beta, 1 + alpha, -2 * c, 1 - alpha);
        } else { lp ? setN(i, 0, 0, 0, 1, 0, 0) : setN(i, 1, 0, 0, 1, 0, 0); }
        break;
      }
      case Lowshelf:
      case Highshelf: {
        f = std::min(1.0, std::max(0.0, f));
        const double a = pow10f(g / 40);
        const bool lo = type == Lowshelf;
        if (f == 1) { lo ? setN(i, a * a, 0, 0, 1, 0, 0) : setN(i, 1, 0, 0, 1, 0, 0); }
        else if (f > 0) {
          const double w0 = PI * f;
          const double alpha = 0.5 * std::sin(w0) * std::sqrt((a + 1 / a) * (1 / 1.0 - 1) + 2);
          const double k = std::cos(w0), k2 = 2 * std::sqrt(a) * alpha, ap = a + 1, am = a - 1;
          if (lo) setN(i, a * (ap - am * k + k2), 2 * a * (am - ap * k), a * (ap - am * k - k2), ap + am * k + k2, -2 * (am + ap * k), ap + am * k - k2);
          else setN(i, a * (ap + am * k + k2), -2 * a * (am + ap * k), a * (ap + am * k - k2), ap - am * k + k2, 2 * (am - ap * k), ap - am * k - k2);
        } else { lo ? setN(i, 1, 0, 0, 1, 0, 0) : setN(i, a * a, 0, 0, 1, 0, 0); }
        break;
      }
      case Peaking: {
        f = std::min(1.0, std::max(0.0, f));
        q = std::max(0.0, q);
        const double a = pow10f(g / 40);
        if (f > 0 && f < 1) {
          if (q > 0) {
            const double w0 = PI * f, alpha = std::sin(w0) / (2 * q), k = std::cos(w0);
            setN(i, 1 + alpha * a, -2 * k, 1 - alpha * a, 1 + alpha / a, -2 * k, 1 - alpha / a);
          } else setN(i, a * a, 0, 0, 1, 0, 0);
        } else setN(i, 1, 0, 0, 1, 0, 0);
        break;
      }
      case Bandpass: {
        f = std::max(0.0, f);
        q = std::max(0.0, q);
        if (f > 0 && f < 1) {
          const double w0 = PI * f;
          if (q > 0) {
            const double alpha = std::sin(w0) / (2 * q), k = std::cos(w0);
            setN(i, alpha, 0, -alpha, 1 + alpha, -2 * k, 1 - alpha);
          } else setN(i, 1, 0, 0, 1, 0, 0);
        } else setN(i, 0, 0, 0, 1, 0, 0);
        break;
      }
      case Notch:
      case Allpass: {
        f = std::min(1.0, std::max(0.0, f));
        q = std::max(0.0, q);
        if (f > 0 && f < 1) {
          if (q > 0) {
            const double w0 = PI * f, alpha = std::sin(w0) / (2 * q), k = std::cos(w0);
            if (type == Notch) setN(i, 1, -2 * k, 1, 1 + alpha, -2 * k, 1 - alpha);
            else setN(i, 1 - alpha, -2 * k, 1 + alpha, 1 + alpha, -2 * k, 1 - alpha);
          } else type == Notch ? setN(i, 0, 0, 0, 1, 0, 0) : setN(i, -1, 0, 0, 1, 0, 0);
        } else setN(i, 1, 0, 0, 1, 0, 0);
        break;
      }
    }
  }
  double norm(float f, float d) const {
    const double nf = f / (0.5 * ctx->sampleRate);
    return d ? nf * std::exp2(d / 1200) : nf;
  }

  void process() override {
    const Bus& b = in[0];
    out.channels = b.channels;
    if (static_cast<int>(k_.size()) != b.channels) { k_.assign(b.channels, Kernel{}); justReset_ = true; }
    bool dirty = false, sa = false;
    if (frequency.hasSampleAccurateValues() || Q.hasSampleAccurateValues() || gain.hasSampleAccurateValues() ||
        detune.hasSampleAccurateValues()) {
      dirty = true;
      sa = true;
    } else if (justReset_) {
      dirty = true;
      justReset_ = false;
    } else {
      const float f = frequency.finalValue(), q = Q.finalValue(), g = gain.finalValue(), d = detune.finalValue();
      if (f != pf_ || q != pq_ || g != pg_ || d != pd_) { dirty = true; pf_ = f; pq_ = q; pg_ = g; pd_ = d; }
    }
    if (dirty) {
      if (sa) {
        float fv[RQ], qv[RQ], gv[RQ], dv[RQ];
        frequency.calculateSampleAccurateValues(fv);
        Q.calculateSampleAccurateValues(qv);
        gain.calculateSampleAccurateValues(gv);
        detune.calculateSampleAccurateValues(dv);
        auto constant = [](const float* v) { for (int k = 1; k < RQ; k++) if (v[k] != v[0]) return false; return true; };
        const bool isConst = constant(fv) && constant(qv) && constant(gv) && constant(dv);
        const int needed = isConst ? 1 : RQ;
        sampleAccurate_ = needed > 1;
        for (int k = 0; k < needed; k++) setParams(k, norm(fv[k], dv[k]), qv[k], gv[k]);
      } else {
        const float f = frequency.finalValue(), q = Q.finalValue(), g = gain.finalValue(), d = detune.finalValue();
        sampleAccurate_ = false;
        setParams(0, norm(f, d), q, g);
      }
    }
    for (int c = 0; c < b.channels; c++) {
      Kernel& s = k_[c];
      double x1 = s.x1, x2 = s.x2, y1 = s.y1, y2 = s.y2;
      const float* src = b.ch[c];
      float* dst = out.ch[c];
      if (sampleAccurate_) {
        for (int k = 0; k < RQ; k++) {
          const float x = src[k];
          const float y = static_cast<float>(b0_[k] * x + b1_[k] * x1 + b2_[k] * x2 - a1_[k] * y1 - a2_[k] * y2);
          dst[k] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
        }
      } else {
        const double B0 = b0_[0], B1 = b1_[0], B2 = b2_[0], A1 = a1_[0], A2 = a2_[0];
        for (int k = 0; k < RQ; k++) {
          const float x = src[k];
          const float y = static_cast<float>(B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2);
          dst[k] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
        }
      }
      s.x1 = flushDenormalD(x1); s.x2 = flushDenormalD(x2); s.y1 = flushDenormalD(y1); s.y2 = flushDenormalD(y2);
    }
  }
};

// ============================================================ IIR filter ====
class IIR : public Node {
 public:
  IIR(Context* c, std::vector<double> ff, std::vector<double> fb) : Node(c), ff_(std::move(ff)), fb_(std::move(fb)) {
    const double a0 = fb_[0];
    for (auto& v : ff_) v /= a0;
    for (auto& v : fb_) v /= a0;
  }
 protected:
  static constexpr int L = 32;
  std::vector<double> ff_, fb_;
  struct K { double x[L] = {}, y[L] = {}; int idx = 0; };
  std::vector<K> k_;
  void process() override {
    const Bus& b = in[0];
    out.channels = b.channels;
    if (static_cast<int>(k_.size()) != b.channels) k_.assign(b.channels, K{});
    const int nfb = static_cast<int>(fb_.size()), nff = static_cast<int>(ff_.size()), mn = std::min(nfb, nff);
    for (int c = 0; c < b.channels; c++) {
      K& s = k_[c];
      for (int n = 0; n < RQ; n++) {
        double yn = ff_[0] * b.ch[c][n];
        for (int k = 1; k < mn; k++) { const int m = (s.idx - k) & (L - 1); yn += ff_[k] * s.x[m]; yn -= fb_[k] * s.y[m]; }
        for (int k = mn; k < nff; k++) yn += ff_[k] * s.x[(s.idx - k) & (L - 1)];
        for (int k = mn; k < nfb; k++) yn -= fb_[k] * s.y[(s.idx - k) & (L - 1)];
        s.x[s.idx] = b.ch[c][n];
        s.y[s.idx] = yn;
        s.idx = (s.idx + 1) & (L - 1);
        out.ch[c][n] = static_cast<float>(yn);
      }
    }
  }
};

// ================================================================= Delay ====
class Delay : public Node {
 public:
  Param delayTime;
  Delay(Context* c, double maxDelay = 1) : Node(c), delayTime(c, 0, 0, static_cast<float>(maxDelay)), max_(maxDelay) {
    len_ = RQ + timeToSampleFrame(maxDelay, c->sampleRate, 2);
  }
  void params(std::vector<Param*>& v) override { v.push_back(&delayTime); }
 protected:
  double max_;
  size_t len_;
  struct K { std::vector<float> buf; size_t w = 0; };
  std::vector<K> k_;
  void process() override {
    const Bus& b = in[0];
    out.channels = b.channels;
    if (static_cast<int>(k_.size()) != b.channels) {
      k_.assign(b.channels, K{});
      for (auto& k : k_) k.buf.assign(len_, 0.0f);
    }
    const float sr = static_cast<float>(ctx->sampleRate);
    for (int c = 0; c < b.channels; c++) {
      K& s = k_[c];
      float times[RQ];
      if (delayTime.isAudioRate()) delayTime.calculateSampleAccurateValues(times);
      else { const float t = delayTime.finalValue(); for (int k = 0; k < RQ; k++) times[k] = t; }
      // write this quantum's input first (Chrome CopyToCircularBuffer), then read
      const size_t rem = len_ - s.w;
      const size_t first = std::min(static_cast<size_t>(RQ), rem);
      std::memcpy(&s.buf[s.w], b.ch[c], first * sizeof(float));
      if (RQ > static_cast<int>(rem)) std::memcpy(&s.buf[0], b.ch[c] + rem, (RQ - rem) * sizeof(float));
      size_t w = s.w;
      // Chrome's SSE2 / NEON kernel (groups of four): read position computed in float
      {
        const float fl = static_cast<float>(len_);
        const int il = static_cast<int>(len_);
        auto wrapI = [&](int v) { return v < il ? v : v - il; };
        int wi[4];
        for (int m = 0; m < 4; m++) wi[m] = wrapI(static_cast<int>(w) + m);
        for (int k = 0; k < RQ; k += 4) {
          for (int m = 0; m < 4; m++) {
            const float dfr = std::max(times[k + m], 0.0f) * sr;
            float rp = static_cast<float>(wi[m]) + (fl - dfr);
            if (rp >= fl) rp -= fl;
            const int r1 = wrapI(static_cast<int>(rp));
            const int r2 = wrapI(r1 + 1);
            const float f = rp - static_cast<float>(r1);
            const float s1 = s.buf[r1], s2 = s.buf[r2];
            out.ch[c][k + m] = s1 + f * (s2 - s1);
            wi[m] = wrapI(wi[m] + 4);
          }
        }
        w += RQ;
        if (w >= len_) w -= len_;
      }
      for (int i = RQ; i < RQ; i++) {
        const double dt = std::fmax(times[i], 0);
        const double dfr = dt * sr;
        double rp = w + len_ - dfr;
        if (rp >= len_) rp -= len_;
        const size_t r1 = static_cast<size_t>(rp);
        size_t r2 = r1 + 1;
        if (r2 >= len_) r2 -= len_;
        const float f = static_cast<float>(rp - r1);
        const float s1 = s.buf[r1], s2 = s.buf[r2];
        if (++w >= len_) w -= len_;
        out.ch[c][i] = s1 + f * (s2 - s1);
      }
      s.w = w;
    }
  }
};

// ============================================================ WaveShaper ====
namespace detail {
struct DirectConvolver {
  std::vector<float> kernel, buffer;
  int block;
  std::vector<float> rev;  // kernel reversed, so the inner loop runs forward (vectorizes)
  DirectConvolver(int blockSize, std::vector<float> k) : kernel(std::move(k)), block(blockSize) {
    buffer.assign(kernel.size() - 1 + blockSize, 0.0f);
    rev.assign(kernel.rbegin(), kernel.rend());
  }
  void process(const float* src, float* dst) {
    const size_t ks = kernel.size(), hist = ks - 1;
    std::memcpy(&buffer[hist], src, block * sizeof(float));
    const float* r = rev.data();
    for (int i = 0; i < block; i++) {
      const float* b = &buffer[i];
      float acc[8] = {0, 0, 0, 0, 0, 0, 0, 0};
      size_t j = 0;
      for (; j + 8 <= ks; j += 8)
        for (int m = 0; m < 8; m++) acc[m] += b[j + m] * r[j + m];
      float sum = ((acc[0] + acc[4]) + (acc[1] + acc[5])) + ((acc[2] + acc[6]) + (acc[3] + acc[7]));
      for (; j < ks; j++) sum += b[j] * r[j];
      dst[i] = sum;
    }
    std::memmove(&buffer[0], &buffer[block], hist * sizeof(float));
  }
  void reset() { std::fill(buffer.begin(), buffer.end(), 0.0f); }
};

inline std::vector<float> upKernel() {
  const int n = 128, half = 64;
  std::vector<float> k(n);
  const double alpha = 0.16, a0 = 0.5 * (1 - alpha), a1 = 0.5, a2 = 0.5 * alpha, off = -0.5;
  for (int i = 0; i < n; i++) {
    const double s = PI * (i - half - off);
    const double sinc = !s ? 1.0 : std::sin(s) / s;
    const double x = (i - off) / n;
    const double win = a0 - a1 * std::cos(2 * PI * x) + a2 * std::cos(2 * PI * 2.0 * x);
    k[i] = static_cast<float>(sinc * win);
  }
  return k;
}
inline std::vector<float> downKernel() {
  const int n = 256, half = 128;
  std::vector<float> k(n / 2);
  const double alpha = 0.16, a0 = 0.5 * (1 - alpha), a1 = 0.5, a2 = 0.5 * alpha;
  for (int i = 1; i < n; i += 2) {
    const double s = 0.5 * PI * (i - half);
    double sinc = !s ? 1.0 : std::sin(s) / s;
    sinc *= 0.5;
    const double x = static_cast<double>(i) / n;
    const double win = a0 - a1 * std::cos(2 * PI * x) + a2 * std::cos(2 * PI * 2.0 * x);
    k[(i - 1) / 2] = static_cast<float>(sinc * win);
  }
  return k;
}

struct UpSampler {  // block -> 2*block
  int block;
  DirectConvolver conv;
  std::vector<float> inbuf, tmp;
  explicit UpSampler(int b) : block(b), conv(b, upKernel()), inbuf(64 + b, 0.0f), tmp(b) {}
  void process(const float* src, float* dst) {
    const int half = 64;
    std::memcpy(&inbuf[half], src, block * sizeof(float));
    for (int i = 0; i < block; i++) dst[i * 2] = inbuf[i];
    conv.process(src, tmp.data());
    for (int i = 0; i < block; i++) dst[i * 2 + 1] = tmp[i];
    std::memmove(&inbuf[0], &inbuf[block], half * sizeof(float));
  }
  void reset() { conv.reset(); std::fill(inbuf.begin(), inbuf.end(), 0.0f); }
};
struct DownSampler {  // 2*block -> block (input block = in)
  int inBlock;
  DirectConvolver conv;
  std::vector<float> inbuf, tmp;
  explicit DownSampler(int in) : inBlock(in), conv(in / 2, downKernel()), inbuf(128 + in, 0.0f), tmp(in / 2) {}
  void process(const float* src, float* dst) {
    const int half = 128, outN = inBlock / 2;
    std::memcpy(&inbuf[half], src, inBlock * sizeof(float));
    for (int i = 0; i < outN; i++) tmp[i] = inbuf[half - 1 + i * 2];
    conv.process(tmp.data(), dst);
    for (int i = 0; i < outN; i++) dst[i] += 0.5f * inbuf[i * 2];
    std::memmove(&inbuf[0], &inbuf[inBlock], half * sizeof(float));
  }
  void reset() { conv.reset(); std::fill(inbuf.begin(), inbuf.end(), 0.0f); }
};
}  // namespace detail

class WaveShaper : public Node {
 public:
  enum Oversample { None, X2, X4 };
  explicit WaveShaper(Context* c) : Node(c) {}
  void setCurve(std::vector<float> c) { curve_ = std::move(c); }
  void setOversample(Oversample o) {
    os_ = o;
    for (auto& k : k_) if (k) { if (o == None) { k->up.reset(); k->down.reset(); k->up2.reset(); k->down2.reset(); } else if (o == X2) { k->up2.reset(); k->down2.reset(); } }
  }
 protected:
  std::vector<float> curve_;
  Oversample os_ = None;
  struct K {
    detail::UpSampler up{RQ}, up2{RQ * 2};
    detail::DownSampler down{RQ * 2}, down2{RQ * 4};
    float t1[RQ * 2], t2[RQ * 4];
  };
  std::vector<std::unique_ptr<K>> k_;

  void shape(float* dst, const float* src, int n) const {
    const size_t len = curve_.size();
    const int maxIndex = static_cast<int>(len - 1);
    const float scale = static_cast<float>(0.5 * (len - 1));
    for (int k = 0; k < n; k++) {
      float vi = (src[k] + 1.0f) * scale;
      vi = std::min(static_cast<float>(len - 1), std::max(0.0f, vi));
      unsigned i1 = static_cast<unsigned>(vi);
      i1 = std::min<unsigned>(i1, maxIndex);
      const unsigned i2 = std::min<unsigned>(i1 + 1, maxIndex);
      const float f = vi - static_cast<float>(i1);
      const float v1 = curve_[i1];
      const float v2 = curve_[i2];
      dst[k] = (v2 - v1) * f + v1;
    }
  }
  void process() override {
    const Bus& b = in[0];
    out.channels = b.channels;
    while (static_cast<int>(k_.size()) < b.channels) k_.push_back(std::make_unique<K>());
    for (int c = 0; c < b.channels; c++) {
      if (curve_.empty()) { std::memcpy(out.ch[c], b.ch[c], sizeof out.ch[c]); continue; }
      if (os_ == None) shape(out.ch[c], b.ch[c], RQ);
      else if (os_ == X2) {
        K& k = *k_[c];
        k.up.process(b.ch[c], k.t1);
        shape(k.t1, k.t1, RQ * 2);
        k.down.process(k.t1, out.ch[c]);
      } else {
        K& k = *k_[c];
        k.up.process(b.ch[c], k.t1);
        k.up2.process(k.t1, k.t2);
        shape(k.t2, k.t2, RQ * 4);
        k.down2.process(k.t2, k.t1);
        k.down.process(k.t1, out.ch[c]);
      }
    }
  }
};

// ==================================================== DynamicsCompressor ====
class Compressor : public Node {
 public:
  Param threshold, knee, ratio, attack, release;
  explicit Compressor(Context* c)
      : Node(c), threshold(c, -24, -100, 0, false), knee(c, 30, 0, 40, false), ratio(c, 12, 1, 20, false),
        attack(c, 0.003f, 0, 1, false), release(c, 0.25f, 0, 1, false) {
    channelCount = 2;
    mode = Mode::ClampedMax;
    meteringReleaseK_ = static_cast<float>(discreteTimeConstant(0.325f, c->sampleRate));
    for (auto& p : pre_) p.fill(0.0f);
  }
  int outputChannels() const override { return 2; }
  void params(std::vector<Param*>& v) override { v.push_back(&threshold); v.push_back(&knee); v.push_back(&ratio); v.push_back(&attack); v.push_back(&release); }

 protected:
  static constexpr int kMaxPre = 1024, kMask = kMaxPre - 1;
  std::array<std::array<float, kMaxPre>, 2> pre_;
  int preRead_ = 0, preWrite_ = 256;
  unsigned lastPreFrames_ = 256;
  float detectorAverage_ = 0, compressorGain_ = 1, meteringGain_ = 1, dbMaxAttackDiff_ = -1;
  float meteringReleaseK_;
  float ratio_ = -1, slope_ = -1, linThr_ = -1, dbThr_ = -1, dbKnee_ = -1, kneeThr_ = -1, dbKneeThr_ = -1, dbYKneeThr_ = -1, k_ = -1;

  float kneeCurve(float x, float k) const {
    if (x < linThr_) return x;
    return linThr_ + (1 - static_cast<float>(std::exp(static_cast<double>(-k * (x - linThr_))))) / k;
  }
  float saturate(float x, float k) const {
    if (x < kneeThr_) return kneeCurve(x, k);
    const float dbx = linToDb(x);
    const float dby = dbYKneeThr_ + slope_ * (dbx - dbKneeThr_);
    return dbToLin(dby);
  }
  float kAtSlope(float desired) const {
    const float dbx = dbThr_ + dbKnee_;
    const float x = dbToLin(dbx);
    float x2 = 1, dbx2 = 0;
    if (!(x < linThr_)) { x2 = static_cast<float>(x * 1.001); dbx2 = linToDb(x2); }
    float mn = 0.1f, mx = 10000, k = 5, slope = 1;
    for (int i = 0; i < 15; i++) {
      if (!(x < linThr_)) {
        const float dby = linToDb(kneeCurve(x, k));
        const float dby2 = linToDb(kneeCurve(x2, k));
        slope = (dby2 - dby) / (dbx2 - dbx);
      }
      if (slope < desired) mx = k; else mn = k;
      k = sqrtf(mn * mx);
    }
    return k;
  }
  float updateCurve(float dbThr, float dbKnee, float ratio) {
    if (dbThr != dbThr_ || dbKnee != dbKnee_ || ratio != ratio_) {
      dbThr_ = dbThr;
      linThr_ = dbToLin(dbThr);
      dbKnee_ = dbKnee;
      ratio_ = ratio;
      slope_ = 1 / ratio_;
      const float k = kAtSlope(1 / ratio_);
      dbKneeThr_ = dbThr + dbKnee;
      kneeThr_ = dbToLin(dbKneeThr_);
      dbYKneeThr_ = linToDb(kneeCurve(kneeThr_, k));
      k_ = k;
    }
    return k_;
  }
  static float fin(float x, float d) { return std::isfinite(x) ? x : d; }

  void process() override {
    const Bus& src = in[0];
    out.channels = 2;
    const float dbThr = threshold.finalValue(), dbKnee = knee.finalValue(), rat = ratio.finalValue();
    const float att = attack.finalValue(), rel = release.finalValue();
    const float sr = static_cast<float>(ctx->sampleRate);
    const float k = updateCurve(dbThr, dbKnee, rat);
    const float linearPostGain = powf(1 / saturate(1, k), 0.6f);
    const float attackFrames = std::max(0.001f, att) * sr;
    const float releaseFrames = sr * rel;
    const float satReleaseFrames = 0.0025f * sr;
    constexpr float z1 = 0.09f, z2 = 0.16f, z3 = 0.42f, z4 = 0.98f;
    constexpr float kA = 0.9999999999999998f * z1 + 1.8432219684323923e-16f * z2 - 1.9373394351676423e-16f * z3 + 8.824516011816245e-18f * z4;
    constexpr float kB = -1.5788320352845888f * z1 + 2.3305837032074286f * z2 - 0.9141194204840429f * z3 + 0.1623677525612032f * z4;
    constexpr float kC = 0.5334142869106424f * z1 - 1.272736789213631f * z2 + 0.9258856042207512f * z3 - 0.18656310191776226f * z4;
    constexpr float kD = 0.08783463138207234f * z1 - 0.1694162967925622f * z2 + 0.08588057951595272f * z3 - 0.00429891410546283f * z4;
    constexpr float kE = -0.042416883008123074f * z1 + 0.1115693827987602f * z2 - 0.09764676325265872f * z3 + 0.028494263462021576f * z4;
    const float a = releaseFrames * kA, b = releaseFrames * kB, c = releaseFrames * kC, d = releaseFrames * kD, e = releaseFrames * kE;
    // pre-delay 6 ms
    {
      unsigned pf = static_cast<unsigned>(0.006f * sr);
      if (pf > kMaxPre - 1) pf = kMaxPre - 1;
      if (lastPreFrames_ != pf) {
        lastPreFrames_ = pf;
        for (auto& p : pre_) p.fill(0.0f);
        preRead_ = 0;
        preWrite_ = static_cast<int>(pf);
      }
    }
    int fi = 0;
    while (fi < RQ) {
      detectorAverage_ = fin(detectorAverage_, 1);
      const float desired = detectorAverage_;
      const float scaledDesired = asinf(desired) / kPiOverTwoFloat;
      float envRate = 0;
      const bool releasing = scaledDesired > compressorGain_;
      float dbDiff = 0;
      if (scaledDesired == 0) dbDiff = releasing ? -1 : 1;
      else dbDiff = linToDb(compressorGain_ / scaledDesired);
      if (releasing) {
        dbMaxAttackDiff_ = -1;
        dbDiff = fin(dbDiff, -1);
        float x = std::min(0.0f, std::max(-12.0f, dbDiff));
        x = 0.25f * (x + 12);
        const float x2 = x * x, x3 = x2 * x, x4 = x2 * x2;
        const float calc = a + b * x + c * x2 + d * x3 + e * x4;
        envRate = dbToLin(5 / calc);
      } else {
        dbDiff = fin(dbDiff, 1);
        if (dbMaxAttackDiff_ == -1 || dbMaxAttackDiff_ < dbDiff) dbMaxAttackDiff_ = dbDiff;
        const float eff = std::max(0.5f, dbMaxAttackDiff_);
        const float x = 0.25f / eff;
        envRate = 1 - powf(x, 1 / attackFrames);
      }
      int pr = preRead_, pw = preWrite_;
      float det = detectorAverage_, cg = compressorGain_;
      const int loop = std::min(32, RQ - fi);
      for (int df = 0; df < loop; df++) {
        float cin = 0;
        for (int j = 0; j < 2; j++) {
          const float u = (src.channels > j ? src.ch[j] : src.ch[0])[fi];
          pre_[j][pw] = u;
          const float au = u > 0 ? u : -u;
          if (cin < au) cin = au;
        }
        const float absIn = cin > 0 ? cin : -cin;
        const float shaped = saturate(absIn, k);
        const float atten = absIn <= 0.0001f ? 1 : shaped / absIn;
        const float dbAtten = std::max(2.0f, -linToDb(atten));
        const float satRate = dbToLin(dbAtten / satReleaseFrames) - 1;
        const bool isRel = atten > det;
        const float rate = isRel ? satRate : 1;
        det += (atten - det) * rate;
        det = std::min(1.0f, det);
        det = fin(det, 1);
        if (envRate < 1) cg += (scaledDesired - cg) * envRate;
        else { cg *= envRate; cg = std::min(1.0f, cg); }
        const float postWarp = static_cast<float>(std::sin(static_cast<double>(kPiOverTwoFloat * cg)));
        const float total = linearPostGain * postWarp;
        const float dbReal = linToDb(postWarp);
        if (dbReal < meteringGain_) meteringGain_ = dbReal;
        else meteringGain_ += (dbReal - meteringGain_) * meteringReleaseK_;
        for (int j = 0; j < 2; j++) out.ch[j][fi] = pre_[j][pr] * total;
        fi++;
        pr = (pr + 1) & kMask;
        pw = (pw + 1) & kMask;
      }
      preRead_ = pr;
      preWrite_ = pw;
      detectorAverage_ = flushDenormal(det);
      compressorGain_ = flushDenormal(cg);
    }
  }
};

// ========================================================== StereoPanner ====
class StereoPanner : public Node {
 public:
  Param pan;
  explicit StereoPanner(Context* c) : Node(c), pan(c, 0, -1, 1) { channelCount = 2; mode = Mode::ClampedMax; }
  void params(std::vector<Param*>& v) override { v.push_back(&pan); }
  int outputChannels() const override { return 2; }
 protected:
  void process() override {
    const Bus& b = in[0];
    out.channels = 2;
    const float* sl = b.ch[0];
    const float* sr = b.channels > 1 ? b.ch[1] : b.ch[0];
    if (pan.hasSampleAccurateValues() && pan.isAudioRate()) {
      float pv[RQ];
      pan.calculateSampleAccurateValues(pv);
      for (int i = 0; i < RQ; i++) {
        const double p = std::min(1.0, std::max(-1.0, static_cast<double>(pv[i])));
        if (b.channels == 1) {
          const double r = (p * 0.5 + 0.5) * kPiOverTwoDouble;
          out.ch[0][i] = static_cast<float>(sl[i] * std::cos(r));
          out.ch[1][i] = static_cast<float>(sl[i] * std::sin(r));
        } else {
          const double r = (p <= 0 ? p + 1 : p) * kPiOverTwoDouble;
          const double gl = std::cos(r), gr = std::sin(r);
          if (p <= 0) { out.ch[0][i] = static_cast<float>(sl[i] + sr[i] * gl); out.ch[1][i] = static_cast<float>(sr[i] * gr); }
          else { out.ch[0][i] = static_cast<float>(sl[i] * gl); out.ch[1][i] = static_cast<float>(sr[i] + sl[i] * gr); }
        }
      }
      return;
    }
    const float p = std::min(1.0f, std::max(-1.0f, pan.finalValue()));
    if (b.channels == 1) {
      const double r = (p * 0.5 + 0.5) * kPiOverTwoDouble;
      const float gl = static_cast<float>(std::cos(r)), gr = static_cast<float>(std::sin(r));
      for (int i = 0; i < RQ; i++) { out.ch[1][i] = sl[i] * gr; out.ch[0][i] = sl[i] * gl; }
    } else {
      const double r = (p <= 0 ? p + 1 : p) * kPiOverTwoDouble;
      const float gl = static_cast<float>(std::cos(r)), gr = static_cast<float>(std::sin(r));
      if (p <= 0) for (int i = 0; i < RQ; i++) { out.ch[0][i] = sl[i] + sr[i] * gl; out.ch[1][i] = sr[i] * gr; }
      else for (int i = 0; i < RQ; i++) { out.ch[1][i] = sr[i] + sl[i] * gr; out.ch[0][i] = sl[i] * gl; }
    }
  }
};

// ======================================================= scheduled sources ==
class Source : public Node {
 public:
  explicit Source(Context* c) : Node(c, 0) {}
  int outputChannels() const override { return 1; }
  void start(double when = 0) { start_ = std::max(when, ctx->currentTime()); state_ = Scheduled; }
  void stop(double when = 0) { end_ = std::max(when, ctx->currentTime()); }
  bool finished() const { return state_ == Finished; }
 protected:
  enum State { Unscheduled, Scheduled, Playing, Finished } state_ = Unscheduled;
  double start_ = 0, end_ = -1;
  /** Chrome UpdateSchedulingInfo: returns false when nothing plays this quantum. */
  bool schedule(size_t& offset, size_t& frames, double& startOffset) {
    offset = 0; frames = 0; startOffset = 0;
    const double sr = ctx->sampleRate;
    const size_t qs = ctx->frame, qe = qs + RQ;
    const size_t sf = timeToSampleFrame(start_, sr, 2);
    size_t ef = 0;
    if (end_ >= 0) ef = timeToSampleFrame(end_, sr, 2);
    if (end_ >= 0 && ef <= qs) state_ = Finished;
    if (state_ == Unscheduled || state_ == Finished || sf >= qe) { out.zero(); return false; }
    if (state_ == Scheduled) { state_ = Playing; startOffset = start_ * sr - sf; }
    offset = sf > qs ? sf - qs : 0;
    offset = std::min(offset, static_cast<size_t>(RQ));
    frames = RQ - offset;
    if (!frames) { out.zero(); return false; }
    if (offset) for (int c = 0; c < out.channels; c++) std::fill(out.ch[c], out.ch[c] + offset, 0.0f);
    if (end_ >= 0 && ef >= qs && ef <= qe) {
      if (ef < qe) {
        const size_t z0 = ef - qs, nz = RQ - z0;
        frames = nz > frames ? 0 : frames - nz;
        for (int c = 0; c < out.channels; c++) std::fill(out.ch[c] + z0, out.ch[c] + RQ, 0.0f);
      }
      finishPending_ = true;
    }
    return true;
  }
  bool finishPending_ = false;
  void finishIfPending() { if (finishPending_) { state_ = Finished; finishPending_ = false; } }
};

/** Band-limited wave tables (Chrome PeriodicWave). */
class PeriodicWave {
 public:
  enum Shape { Sine, Square, Sawtooth, Triangle };
  PeriodicWave(double sampleRate, const std::vector<float>& real, const std::vector<float>& imag, bool disableNorm = false)
      : size_(sampleRate <= 24000 ? 2048 : sampleRate <= 88200 ? 4096 : 16384),
        ranges_(static_cast<unsigned>(std::lround(3 * log2f(static_cast<float>(size_))))),
        lowest_(static_cast<float>(sampleRate / size_)),
        rateScale_(static_cast<float>(size_ / sampleRate)) {
    build(real, imag, disableNorm);
  }
  /** The four built-in shapes, built once per sample rate and shared (Chrome caches them per context too). */
  static std::shared_ptr<PeriodicWave> basic(double sr, Shape s) {
    static std::vector<std::pair<double, std::shared_ptr<PeriodicWave>>> cache[4];
    static std::mutex mu;  // several plugin instances can create oscillators on different threads
    std::lock_guard<std::mutex> lock(mu);
    for (auto& e : cache[s]) if (e.first == sr) return e.second;
    auto w = build(sr, s);
    cache[s].push_back({sr, w});
    return w;
  }
  static std::shared_ptr<PeriodicWave> build(double sr, Shape s) {
    const unsigned size = sr <= 24000 ? 2048 : sr <= 88200 ? 4096 : 16384, half = size / 2;
    std::vector<float> re(half, 0.0f), im(half, 0.0f);
    for (unsigned n = 1; n < half; n++) {
      const float pf = 2 / (n * 3.14159265358979323846f);
      float b = 0;
      switch (s) {
        case Sine: b = n == 1 ? 1 : 0; break;
        case Square: b = (n & 1) ? 2 * pf : 0; break;
        case Sawtooth: b = pf * ((n & 1) ? 1 : -1); break;
        case Triangle: b = (n & 1) ? 2 * (pf * pf) * ((((n - 1) >> 1) & 1) ? -1 : 1) : 0; break;
      }
      im[n] = b;
    }
    return std::make_shared<PeriodicWave>(sr, re, im, false);
  }
  unsigned size() const { return size_; }
  float rateScale() const { return rateScale_; }
  void waveData(float f, const float*& lower, const float*& higher, float& tif) const {
    f = fabsf(f);
    const float ratio = f > 0 ? f / lowest_ : 0.5f;
    const float cents = log2f(ratio) * 1200;
    const float pr = std::min(static_cast<float>(ranges_ - 1), std::max(0.0f, 1 + cents / (1200.0f / 3)));
    const unsigned r1 = static_cast<unsigned>(pr);
    const unsigned r2 = r1 < ranges_ - 1 ? r1 + 1 : r1;
    lower = tables_[r2].data();
    higher = tables_[r1].data();
    tif = pr - r1;
  }

 private:
  unsigned size_, ranges_;
  float lowest_, rateScale_;
  std::vector<std::vector<float>> tables_;

  static void ifft(std::vector<std::complex<double>>& a) {  // in-place, unscaled, e^{+i}
    const size_t n = a.size();
    for (size_t i = 1, j = 0; i < n; i++) {
      size_t bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) std::swap(a[i], a[j]);
    }
    for (size_t len = 2; len <= n; len <<= 1) {
      const double ang = 2 * PI / len;
      const std::complex<double> wl(std::cos(ang), std::sin(ang));
      for (size_t i = 0; i < n; i += len) {
        std::complex<double> w(1);
        for (size_t j = 0; j < len / 2; j++) {
          const auto u = a[i + j], v = a[i + j + len / 2] * w;
          a[i + j] = u + v;
          a[i + j + len / 2] = u - v;
          w *= wl;
        }
      }
    }
  }
  void build(const std::vector<float>& realData, const std::vector<float>& imagData, bool disableNorm) {
    float normScale = 0.5f;
    const unsigned n = size_, half = n / 2;
    const unsigned comps = std::min(static_cast<unsigned>(realData.size()), half);
    tables_.resize(ranges_);
    for (unsigned r = 0; r < ranges_; r++) {
      const float centsToCull = r * (1200.0f / 3);
      const float cull = static_cast<float>(std::pow(2, -centsToCull / 1200.0f));
      const unsigned partials = static_cast<unsigned>(cull * half);
      std::vector<std::complex<double>> X(n);
      const unsigned keep = std::min(comps, partials + 1);
      for (unsigned i = 1; i < keep; i++) {
        // x[t] = sum a_i cos + b_i sin  ->  X[i] = (a - i b)/2, X[n-i] = conj
        const std::complex<double> c(0.5 * realData[i], -0.5 * imagData[i]);
        X[i] = c;
        X[n - i] = std::conj(c);
      }
      ifft(X);
      std::vector<float>& t = tables_[r];
      t.resize(n);
      for (unsigned i = 0; i < n; i++) t[i] = static_cast<float>(X[i].real());
      if (!disableNorm && !r) {
        float mx = 0;
        for (float v : t) mx = std::max(mx, fabsf(v));
        if (mx) normScale = 1.0f / mx;
      }
      for (float& v : t) v *= normScale;
    }
  }
};

class Oscillator : public Source {
 public:
  Param frequency, detune;
  Oscillator(Context* c, PeriodicWave::Shape s = PeriodicWave::Sine)
      : Source(c), frequency(c, 440, -static_cast<float>(c->sampleRate / 2), static_cast<float>(c->sampleRate / 2)),
        detune(c, 0, -153600, 153600) { setType(s); }
  void setType(PeriodicWave::Shape s) { wave_ = PeriodicWave::basic(ctx->sampleRate, s); }
  void params(std::vector<Param*>& v) override { v.push_back(&frequency); v.push_back(&detune); }
  void setPeriodicWave(std::shared_ptr<PeriodicWave> w) { wave_ = std::move(w); }

 protected:
  std::shared_ptr<PeriodicWave> wave_;
  double vri_ = 0;  // virtual read index
  float inc_[RQ];
  static constexpr float k2 = 0.3f, k3 = 0.16f;

  static float interp(double vri, float incr, unsigned mask, float tif, const float* lo, const float* hi) {
    double sl = 0, sh = 0;
    unsigned r0 = static_cast<unsigned>(vri);
    if (incr >= k2) {
      const double f = static_cast<float>(vri) - r0;
      const unsigned r2 = (r0 + 1) & mask;
      r0 &= mask;
      sh = (1 - f) * hi[r0] + f * hi[r2];
      sl = (1 - f) * lo[r0] + f * lo[r2];
    } else if (incr >= k3) {
      unsigned ri[3];
      for (int k = -1; k <= 1; k++) ri[k + 1] = (r0 + k) & mask;
      const double t = vri - r0;
      const double a[3] = {0.5 * t * (t - 1), 1 - t * t, 0.5 * t * (t + 1)};
      for (int k = 0; k < 3; k++) { sl += a[k] * lo[ri[k]]; sh += a[k] * hi[ri[k]]; }
    } else {
      unsigned ri[5];
      for (int k = -2; k <= 2; k++) ri[k + 2] = (r0 + k) & mask;
      const double t = vri - r0, t2 = t * t;
      const double a[5] = {t * (t2 - 1) * (t - 2) / 24, -t * (t - 1) * (t2 - 4) / 6, (t2 - 1) * (t2 - 4) / 4,
                           -t * (t + 1) * (t2 - 4) / 6, t * (t2 - 1) * (t + 2) / 24};
      for (int k = 0; k < 5; k++) { sl += a[k] * lo[ri[k]]; sh += a[k] * hi[ri[k]]; }
    }
    return static_cast<float>((1 - tif) * sh + tif * sl);
  }
  static float linearSample(double vri, unsigned mask, float tif, const float* lo, const float* hi) {
    unsigned r0 = static_cast<unsigned>(vri);
    const float f = static_cast<float>(vri) - r0;
    r0 &= mask;
    const unsigned r1 = (r0 + 1) & mask;
    const float h = hi[r0] + f * (hi[r1] - hi[r0]);
    const float l = lo[r0] + f * (lo[r1] - lo[r0]);
    return h + tif * (l - h);
  }
  static void clampFreq(float* f, int n, float nyq) {
    for (int i = 0; i < n; i++) f[i] = std::isnan(f[i]) ? nyq : std::min(nyq, std::max(-nyq, f[i]));
  }

  bool phaseIncrements() {
    bool sa = false, fchg = false;
    float finalScale = wave_->rateScale();
    if (frequency.hasSampleAccurateValues() && frequency.isAudioRate()) {
      sa = true; fchg = true;
      frequency.calculateSampleAccurateValues(inc_);
    } else finalScale *= frequency.finalValue();
    if (detune.hasSampleAccurateValues() && detune.isAudioRate()) {
      sa = true;
      float dv[RQ];
      float* d = fchg ? dv : inc_;
      detune.calculateSampleAccurateValues(d);
      const float k = static_cast<float>(1.0 / 1200);
      for (int i = 0; i < RQ; i++) d[i] = std::exp2(d[i] * k);
      if (fchg) for (int i = 0; i < RQ; i++) inc_[i] = dv[i] * inc_[i];
    } else finalScale *= std::exp2(detune.finalValue() / 1200);
    if (sa) {
      clampFreq(inc_, RQ, static_cast<float>(ctx->sampleRate / 2));
      for (int i = 0; i < RQ; i++) inc_[i] *= finalScale;
    }
    return sa;
  }

  void process() override {
    out.channels = 1;
    size_t off, frames;
    double sOff;
    if (!schedule(off, frames, sOff)) { finishIfPending(); return; }
    const unsigned N = wave_->size(), mask = N - 1;
    const double invN = 1.0 / N;
    double vri = vri_;
    const float rs = wave_->rateScale();
    const bool sa = phaseIncrements();
    float freq = 0;
    const float *lo = nullptr, *hi = nullptr;
    float tif = 0;
    if (!sa) {
      freq = frequency.finalValue() * std::exp2(detune.finalValue() / 1200);
      clampFreq(&freq, 1, static_cast<float>(ctx->sampleRate / 2));
      wave_->waveData(freq, lo, hi, tif);
    }
    size_t di = off;
    unsigned n = static_cast<unsigned>(frames);
    if (sOff > 0) { ++di; --n; vri += (1 - sOff) * freq * rs; }
    else if (sOff < 0) vri = -sOff * freq * rs;
    float* dst = out.ch[0] + di;
    if (sa) {
      const float* pinc = inc_;  // Chrome indexes phase increments from 0 within the processed span
      const float invRs = 1 / rs;
      unsigned k = 0;
      for (; k + 4 <= n; k += 4) {  // groups of four share the interpolation choice (Chrome vector path)
        bool big = true;
        const float* L4[4]; const float* H4[4]; float T4[4];
        for (int m = 0; m < 4; m++) {
          big = big && fabsf(pinc[k + m]) >= k2;
          wave_->waveData(invRs * pinc[k + m], L4[m], H4[m], T4[m]);
        }
        if (big) {  // Chrome's vector kernel: double read indices, float interpolation
          double sum[4];
          sum[0] = pinc[k];
          for (int m = 1; m < 4; m++) sum[m] = sum[m - 1] + pinc[k + m];
          for (int m = 0; m < 4; m++) {
            double x = vri + (m ? sum[m - 1] : 0.0);
            const double r = x * invN;
            int f = static_cast<int>(r);
            if (r < static_cast<double>(f)) f -= 1;
            x -= static_cast<double>(f) * N;
            const int ri = static_cast<int>(x);
            const float fac = static_cast<float>(x) - static_cast<float>(ri);
            const unsigned r0 = static_cast<unsigned>(ri) & mask, r1 = static_cast<unsigned>(ri + 1) & mask;
            const float h = H4[m][r0] + fac * (H4[m][r1] - H4[m][r0]);
            const float l = L4[m][r0] + fac * (L4[m][r1] - L4[m][r0]);
            dst[k + m] = h + T4[m] * (l - h);
          }
          vri += sum[3];
          vri -= std::floor(vri * invN) * N;
        } else {
          for (int m = 0; m < 4; m++) {
            dst[k + m] = interp(vri, fabsf(pinc[k + m]), mask, T4[m], L4[m], H4[m]);
            vri += pinc[k + m];
            vri -= std::floor(vri * invN) * N;
          }
        }
      }
      for (; k < n; k++) {
        const float incr = pinc[k];
        wave_->waveData(invRs * incr, lo, hi, tif);
        dst[k] = interp(vri, fabsf(incr), mask, tif, lo, hi);
        vri += incr;
        vri -= std::floor(vri * invN) * N;
      }
    } else {
      const float incr = freq * rs;
      if (incr >= k2) {
        // Chrome's SSE2 / NEON kernel: four lanes with a float read index
        const float fN = static_cast<float>(N), fInvN = 1.0f / N, inc4 = 4 * incr;
        auto wrapf = [&](float x) {
          const float r = x * fInvN;
          int f = static_cast<int>(r);
          if (r < static_cast<float>(f)) f -= 1;
          return x - static_cast<float>(f) * fN;
        };
        float v[4];
        for (int m = 0; m < 4; m++) v[m] = wrapf(static_cast<float>(vri + m * incr));
        unsigned k = 0;
        for (; k + 4 <= n; k += 4) {
          for (int m = 0; m < 4; m++) {
            const unsigned r0 = static_cast<unsigned>(static_cast<int>(v[m])) & mask, r1 = (r0 + 1) & mask;
            const float f = v[m] - static_cast<float>(static_cast<int>(r0));
            const float h = hi[r0] + f * (hi[r1] - hi[r0]);
            const float l = lo[r0] + f * (lo[r1] - lo[r0]);
            dst[k + m] = h + tif * (l - h);
            v[m] = wrapf(v[m] + inc4);
          }
        }
        double vv = vri + k * incr;
        vv -= std::floor(vv * invN) * N;
        for (; k < n; k++) {  // scalar remainder
          dst[k] = linearSample(vv, mask, tif, lo, hi);
          vv += incr;
          vv -= std::floor(vv * invN) * N;
        }
        vri += n * incr;
        vri -= std::floor(vri * invN) * N;
      } else {
        for (unsigned k = 0; k < n; k++) {
          dst[k] = interp(vri, fabsf(incr), mask, tif, lo, hi);
          vri += incr;
          vri -= std::floor(vri * invN) * N;
        }
      }
    }
    vri_ = vri;
    finishIfPending();
  }
};

/** AudioBufferSourceNode for mono buffers (loop over the whole buffer, playbackRate 1). */
class BufferSource : public Source {
 public:
  Param playbackRate, detune;
  bool loop = false;
  explicit BufferSource(Context* c) : Source(c), playbackRate(c, 1, -3.4028235e38f, 3.4028235e38f, false), detune(c, 0, -3.4028235e38f, 3.4028235e38f, false) {}
  void setBuffer(std::shared_ptr<const std::vector<float>> b, double bufferRate) { buf_ = std::move(b); bufRate_ = bufferRate; }
  void params(std::vector<Param*>& v) override { v.push_back(&playbackRate); v.push_back(&detune); }
  void start(double when, double offset = 0) {
    Source::start(when);
    const double dur = buf_ ? buf_->size() / bufRate_ : 0;
    offset = std::min(dur, std::max(0.0, offset));
    if (playbackRate.value() == 1.0f && detune.value() == 0.0f) vri_ = static_cast<double>(timeToSampleFrame(offset, bufRate_, 0));
    else vri_ = offset * bufRate_;
  }

 protected:
  std::shared_ptr<const std::vector<float>> buf_;
  double bufRate_ = 48000, vri_ = 0;
  void process() override {
    out.channels = 1;
    if (!buf_) { out.zero(); return; }
    size_t off, frames;
    double sOff;
    if (!schedule(off, frames, sOff)) { finishIfPending(); return; }
    const std::vector<float>& src = *buf_;
    const uint32_t blen = static_cast<uint32_t>(src.size());
    const double vs = 0, ve = loop ? blen : blen, vd = ve - vs;
    double rate = (bufRate_ / ctx->sampleRate) * playbackRate.finalValue() * std::pow(2, detune.finalValue() / 1200);
    double vri = vri_;
    int n = static_cast<int>(frames);
    unsigned w = static_cast<unsigned>(off);
    if (loop && vri >= ve) { vri = std::min(vs, static_cast<double>(blen - 1)); }
    if (sOff < 0 && rate != 0) vri += std::fabs(sOff * rate);
    bool stopping = false;
    if (!loop && vri >= blen) { vri = blen; n = 0; stopping = true; }
    float* dst = out.ch[0];
    const unsigned maxIdx = blen - 1;
    for (int i = 0; i < n; i++) {
      unsigned r = static_cast<unsigned>(vri);
      const double f = vri - r;
      unsigned r2 = r + 1;
      if (loop && r < ve && r2 >= ve) {
        const double wrapped = vd >= 1.0 ? vri + 1.0 - vd : vs;
        r2 = wrapped >= 0 ? static_cast<unsigned>(wrapped) : 0;
      } else if (r2 >= blen) r2 = r;
      r = std::min(r, maxIdx);
      r2 = std::min(r2, maxIdx);
      double s;
      if (r == r2 && r >= 1) { const double s1 = src[r - 1], s2 = src[r]; s = s2 + (s2 - s1) * f; }
      else s = (1.0 - f) * src[r] + f * src[r2];
      dst[w++] = static_cast<float>(s);
      vri += rate;
      if (vri >= ve) {
        if (!loop) { std::fill(dst + w, dst + RQ, 0.0f); w = RQ; stopping = true; vri = std::min(vri, static_cast<double>(blen)); break; }
        const double over = vri - ve;
        vri = ve - vd + std::fmod(over, vd);
      }
    }
    if (stopping) { std::fill(dst + w, dst + RQ, 0.0f); state_ = Finished; }
    vri_ = vri;
    finishIfPending();
  }
};

/** Constant 1 source (used as a scaffold for tests). */
class Constant : public Source {
 public:
  Param offset;
  explicit Constant(Context* c) : Source(c), offset(c, 1, -3.4028235e38f, 3.4028235e38f) {}
 protected:
  void process() override {
    out.channels = 1;
    size_t off, frames;
    double sOff;
    if (!schedule(off, frames, sOff)) { finishIfPending(); return; }
    float v[RQ];
    offset.calculateSampleAccurateValues(v);
    for (size_t k = off; k < off + frames; k++) out.ch[0][k] = v[k];
    finishIfPending();
  }
};

/** Plays a fixed buffer (stereo or mono) once from frame 0: test input. */
class Feed : public Node {
 public:
  Feed(Context* c, std::vector<std::vector<float>> data) : Node(c, 0), d_(std::move(data)) {}
  int outputChannels() const override { return static_cast<int>(d_.size()); }
 protected:
  std::vector<std::vector<float>> d_;
  void process() override {
    out.channels = static_cast<int>(d_.size());
    for (int c = 0; c < out.channels; c++)
      for (int k = 0; k < RQ; k++) {
        const size_t i = ctx->frame + k;
        out.ch[c][k] = i < d_[c].size() ? d_[c][i] : 0.0f;
      }
  }
};

// ================================================================= graph ====
/** Owns nodes; sets every node's output channel count from the graph (Chrome does this when connections change). */
class Graph {
 public:
  explicit Graph(double sr) { ctx.sampleRate = sr; }
  Context ctx;
  template <class T, class... A>
  T* make(A&&... a) {
    auto p = std::make_unique<T>(&ctx, std::forward<A>(a)...);
    T* r = p.get();
    nodes_.push_back(std::move(p));
    dirty_ = true;
    return r;
  }
  void changed() { dirty_ = true; }
  void updateChannels() {
    for (int it = 0; it < 64; it++) {
      bool any = false;
      for (auto& n : nodes_) {
        const int c = n->outputChannels();
        if (n->out.channels != c) { n->out.channels = c; any = true; }
      }
      if (!any) break;
    }
    dirty_ = false;
  }
  /** Render one quantum of `out` (stereo): pulls the graph, then advances time. */
  void render(Node* outNode, float* L, float* R) {
    if (dirty_) updateChannels();
    Bus& b = outNode->pull();
    for (int k = 0; k < RQ; k++) {
      L[k] = b.ch[0][k];
      R[k] = b.channels > 1 ? b.ch[1][k] : b.ch[0][k];
    }
    ctx.frame += RQ;
  }
  /** Drop nodes for which `dead` returns true (caller disconnects them first). */
  template <class F>
  void sweep(F dead) {
    nodes_.erase(std::remove_if(nodes_.begin(), nodes_.end(), [&](auto& n) { return dead(n.get()); }), nodes_.end());
  }

 private:
  std::vector<std::unique_ptr<Node>> nodes_;
  bool dirty_ = true;
};

}  // namespace wa
