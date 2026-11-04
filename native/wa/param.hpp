// SY-1 native — Web Audio AudioParam automation timeline (C++17).
//
// Port of Chromium's AudioParamHandler timeline (modules/webaudio/
// audio_param_handler.cc): event insertion, clamping of late events, linear /
// exponential ramps, setTarget (with the setTarget-then-ramp rule),
// cancelScheduledValues. Scalar (non-SIMD) paths, as Chrome runs them on ARM
// Macs. See NOTICE.md.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
#include <vector>

namespace wa {

constexpr int RQ = 128;  // render quantum

struct Context {
  double sampleRate = 48000;
  size_t frame = 0;  // first frame of the quantum being rendered
  double currentTime() const { return frame / sampleRate; }
};

inline double discreteTimeConstant(double timeConstant, double sampleRate) {
  return 1 - std::exp(-1 / (sampleRate * timeConstant));
}

class Node;

class Param {
 public:
  enum Type { SetValue, LinearRamp, ExpRamp, SetTarget, CancelValues };
  struct Event {
    Type type;
    float value;
    double time;
    double timeConstant = 0;
    float initialValue = 0;
    double callTime = 0;
    bool isNew = true;
  };

  Param(Context* c, float def, float mn, float mx, bool audioRate = true)
      : ctx(c), intrinsic_(def), def_(def), min_(mn), max_(mx), aRate_(audioRate) {}

  // --- JS API ---------------------------------------------------------------
  /** `param.value = v` : intrinsic value plus setValueAtTime(v, currentTime). */
  void setValue(float v) {
    intrinsic_ = clamp(v);
    setValueAtTime(intrinsic_, ctx->currentTime());
  }
  float value() const { return intrinsic_; }
  void setValueAtTime(float v, double t) { insert({SetValue, v, std::max(t, ctx->currentTime())}); }
  void linearRampToValueAtTime(float v, double t) {
    Event e{LinearRamp, v, std::max(t, ctx->currentTime())};
    e.initialValue = intrinsic_;
    e.callTime = ctx->currentTime();
    insert(e);
  }
  void exponentialRampToValueAtTime(float v, double t) {
    if (v == 0) return;  // RangeError in JS
    Event e{ExpRamp, v, std::max(t, ctx->currentTime())};
    e.initialValue = intrinsic_;
    e.callTime = ctx->currentTime();
    insert(e);
  }
  void setTargetAtTime(float target, double t, double tc) {
    t = std::max(t, ctx->currentTime());
    if (tc == 0) insert({SetValue, target, t});
    else {
      Event e{SetTarget, target, t};
      e.timeConstant = tc;
      insert(e);
    }
  }
  void cancelScheduledValues(double t) {
    t = std::max(t, ctx->currentTime());
    for (size_t i = 0; i < events_.size(); i++) {
      if (events_[i].time >= t) {
        events_.erase(events_.begin() + i, events_.end());
        break;
      }
    }
  }

  // --- rendering ------------------------------------------------------------
  std::vector<Node*> inputs;  // audio connected into the param (summed, mono)
  bool isAudioRate() const { return aRate_; }
  float defaultValue() const { return def_; }

  bool hasSampleAccurateValues() const {
    if (!inputs.empty()) return true;
    const size_t n = events_.size();
    if (!n) return false;
    const size_t cf = ctx->frame;
    const double sr = ctx->sampleRate;
    if (events_[0].time > (cf + RQ) / sr) {
      switch (events_[0].type) {
        case SetTarget:
        case SetValue: return false;
        default: break;
      }
    }
    if (n >= 2) return true;
    switch (events_[0].type) {
      case SetTarget: return events_[0].time <= (cf + RQ) / sr;
      default: return !(events_[0].time < cf / sr);
    }
  }

  /** k-rate value for this quantum (also updates the intrinsic value). */
  float finalValue();
  /** Per-sample values for this quantum (a-rate), including connected inputs. */
  void calculateSampleAccurateValues(float* values, int n = RQ) { calculateFinalValues(values, n, aRate_); }
  void calculateFinalValues(float* values, int n, bool sampleAccurate);

 private:
  Context* ctx;
  float intrinsic_, def_, min_, max_;
  bool aRate_;
  std::vector<Event> events_;

  float clamp(float v) const { return std::min(max_, std::max(min_, v)); }

  static bool converged(float value, float target, double now, double start, double tc) {
    if (now > start + 10.0f * tc) return true;
    constexpr float kThr = 4.539992976248485e-05f;
    if (target == 0 && std::fabs(value) < kThr) return true;
    if (target != 0 && std::fabs(target - value) < kThr * std::fabs(value)) return true;
    return false;
  }

  bool isCurrent(size_t i, size_t currentFrame) const {
    if (i + 1 >= events_.size()) return true;
    const Event& e = events_[i];
    const Event& nx = events_[i + 1];
    if (nx.time * ctx->sampleRate >= currentFrame) return true;
    const double ef = e.time * ctx->sampleRate;
    return e.type == SetValue && ef <= currentFrame && currentFrame < ef + 1;
  }

  void removeOld(size_t count) {
    const size_t n = events_.size();
    if (n > 1) {
      const size_t r = std::min(count, n - 1);
      events_.erase(events_.begin(), events_.begin() + r);
    }
  }

  void insert(Event ev) {
    const double t = ev.time;
    if (!events_.empty()) {
      size_t skipped = 0;
      for (size_t i = 0; i < events_.size(); i++) {
        if (isCurrent(i, ctx->frame)) break;
        skipped++;
      }
      if (skipped) removeOld(skipped);
    }
    if (events_.empty() && (ev.type == LinearRamp || ev.type == ExpRamp)) {
      events_.push_back({SetValue, ev.initialValue, ctx->currentTime()});
    }
    if (events_.empty()) {
      events_.push_back(ev);
      return;
    }
    size_t idx = events_.size();
    if (events_.back().time > t) {
      idx = std::upper_bound(events_.begin(), events_.end(), t,
                             [](double v, const Event& e) { return v < e.time; }) - events_.begin();
    }
    events_.insert(events_.begin() + idx, ev);
  }

  float valuesForFrameRange(size_t startFrame, size_t endFrame, float def, float* values, int n, double sr,
                            double controlRate);
  void valuesImpl(size_t startFrame, size_t endFrame, float def, float* values, int n, double sr,
                  double controlRate);
};

}  // namespace wa
