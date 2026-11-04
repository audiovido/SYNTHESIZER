// SY-1 native — the web app's AudioWorklet voice engines as wa nodes.
// Same message protocol and event timing as src/engine/worklet/sy1-processor.ts
// and analog-processor.ts: timed note events become sample offsets inside the
// 128-frame block, then the engine renders the block.
#pragma once
#include <cstdlib>
#include <functional>
#include <string>
#include <vector>

#include "../dsp/hq.hpp"
#include "../wa/wa.hpp"

namespace sy1 {

class WorkletNode : public wa::Node {
 public:
  explicit WorkletNode(wa::Context* c) : wa::Node(c, 0) {}
  int outputChannels() const override { return 2; }
  virtual void param(const std::string& key, double v) = 0;
  virtual void param(const std::string& key, const std::string& v) = 0;
  virtual void snap() = 0;
  /** t: on, off, kill, glide, alloff, bend, mod */
  virtual void message(const std::string& t, int id, double midi, double cents, double vel, double at, double from, double glide, double v) = 0;

  /** Chrome delivers port messages to its audio thread one render quantum later; the plugin delivers
   *  them at once (lower latency). Parity tests set SY1_PORT_DELAY=1 to reproduce Chrome. */
  static bool portDelay() { static const bool d = std::getenv("SY1_PORT_DELAY") != nullptr; return d; }
  void post(std::function<void()> f) {
    if (portDelay()) deferred_.push_back({ctx->frame, std::move(f)});
    else f();
  }

 protected:
  std::vector<std::pair<size_t, std::function<void()>>> deferred_;
  void deliverDeferred() {
    if (deferred_.empty()) return;
    size_t k = 0;
    for (; k < deferred_.size() && deferred_[k].first < ctx->frame; k++) deferred_[k].second();
    deferred_.erase(deferred_.begin(), deferred_.begin() + k);
  }
};

/** Engine E has: setParam(key, double|string), snapParams(), noteOn, noteOff, glideTo, allOff, setBend, setMod, render. */
template <class E>
class VoiceWorklet : public WorkletNode {
 public:
  explicit VoiceWorklet(wa::Context* c) : WorkletNode(c), eng_(c->sampleRate) { q_.reserve(kQueue); }
  void param(const std::string& key, double v) override { eng_.setParam(key, v); }
  void param(const std::string& key, const std::string& v) override { eng_.setParam(key, v); }
  void snap() override { eng_.snapParams(); }
  void message(const std::string& t, int id, double midi, double cents, double vel, double at, double from, double glide, double v) override {
    int type = t == "on" ? 1 : t == "off" ? 2 : t == "kill" ? 3 : t == "glide" ? 4 : 0;
    if (type) {
      if (q_.size() >= kQueue) return;
      q_.push_back({type, at, id, midi ? midi : 60, cents, vel, from, glide});
    } else if (t == "alloff") { q_.clear(); eng_.allOff(); }
    else if (t == "bend") eng_.setBend(v);
    else if (t == "mod") eng_.setMod(v);
  }

 protected:
  static constexpr size_t kQueue = 512;
  struct Ev { int type; double at; int id; double midi, cents, vel, from, glide; };
  E eng_;
  std::vector<Ev> q_;
  void process() override {
    deliverDeferred();
    out.channels = 2;
    out.zero();
    const double now = ctx->currentTime(), sr = ctx->sampleRate;
    size_t w = 0;
    for (size_t r = 0; r < q_.size(); r++) {
      Ev& e = q_[r];
      long off = static_cast<long>(std::floor((e.at - now) * sr + 0.5));  // JS Math.round
      if (off >= wa::RQ) {
        if (w != r) std::swap(q_[w], q_[r]);
        w++;
        continue;
      }
      if (off < 0) off = 0;
      const int o = static_cast<int>(off);
      if (e.type == 1) eng_.noteOn(e.id, static_cast<int>(e.midi), e.cents, e.vel, o, e.from, e.glide);
      else if (e.type == 2) eng_.noteOff(e.id, o, false);
      else if (e.type == 3) eng_.noteOff(e.id, o, true);
      else if (e.type == 4) eng_.glideTo(e.id, static_cast<int>(e.midi), e.cents, e.glide);
    }
    q_.resize(w);
    eng_.render(out.ch[0], out.ch[1], wa::RQ);
  }
};

using HQWorklet = VoiceWorklet<hq::Engine>;
using AnalogWorklet = VoiceWorklet<AnalogEngine>;

}  // namespace sy1
