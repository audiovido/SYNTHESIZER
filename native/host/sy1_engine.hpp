// SY-1 native — the plugin's sound engine: the web app's engine (js/dist/engine.js)
// running in QuickJS on native/wa, driven in 128-frame blocks.
//
// All JavaScript runs on the audio thread. Other threads hand calls in through
// post() (a short mutex, try-locked by the audio thread so it never waits).
#pragma once
#include <cmath>
#include <cstdio>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "wajs.hpp"

namespace sy1 {

class Sy1Engine {
 public:
  /** Build the engine. storageJson: the saved plugin state ("" = fresh). */
  bool init(double sampleRate, const std::string& shimJs, const std::string& engineJs, const std::string& storageJson, std::string& err) {
    {  // calls queued for the engine being replaced do not carry over
      std::lock_guard<std::mutex> l(inMu_);
      in_.clear();
    }
    js_ = std::make_unique<WaJs>(sampleRate);
    err = js_->eval(shimJs, "wa-shim.js");
    if (!err.empty()) return false;
    err = js_->eval("__loadStorage(" + quote(storageJson) + ");", "<state>");
    if (!err.empty()) return false;
    err = js_->eval(engineJs, "engine.js");
    if (!err.empty()) return false;
    err = js_->eval("globalThis.__ctx = __makeCtx(); SY1E.initMachine(); SY1E.prepareAudio();", "<start>");
    if (!err.empty()) return false;
    fifoPos_ = wa::RQ;  // first sample renders a block
    saveState();
    return true;
  }
  bool ready() const { return js_ != nullptr; }
  WaJs* js() { return js_.get(); }  // tests

  /** Queue an engine call (name + JSON array of arguments) from any thread. */
  void post(const std::string& name, const std::string& argsJson) {
    std::lock_guard<std::mutex> l(inMu_);
    in_.push_back("SY1E.call(" + quote(name) + ", " + (argsJson.empty() ? "[]" : argsJson) + ");");
  }
  /** Calls this engine made on its own (DAW MIDI, tempo): the window applies them too. */
  std::vector<std::pair<std::string, std::string>> takeOutgoing() {
    std::lock_guard<std::mutex> l(outMu_);
    std::vector<std::pair<std::string, std::string>> v;
    v.swap(out_);
    return v;
  }
  /** Last ~1000 output samples (mono) for the window's scope. */
  std::vector<float> scope() {
    std::lock_guard<std::mutex> l(scopeMu_);
    return std::vector<float>(scope_, scope_ + kScope);
  }
  /** The plugin state: everything the app saves (machines, patches, banks, settings). */
  std::string state() {
    std::lock_guard<std::mutex> l(stateMu_);
    return state_;
  }

  // ---- audio thread ------------------------------------------------------
  /** A call made by the host side on the audio thread (MIDI, tempo, transport). */
  void hostCall(const std::string& name, const std::string& argsJson, double offsetSec = 0) {
    if (offsetSec > 0) {
      // sample-exact: the engine sees the event's own time inside the block
      char b[48];
      std::snprintf(b, sizeof b, "__evOffset = %.12g; ", offsetSec);
      run(std::string(b) + "try { SY1E.call(" + quote(name) + ", " + argsJson + "); } finally { __evOffset = 0; }");
    } else {
      run("SY1E.call(" + quote(name) + ", " + argsJson + ");");
    }
    std::lock_guard<std::mutex> l(outMu_);
    if (out_.size() < 4096) out_.push_back({name, argsJson});
  }
  /** The engine's audio clock (seconds; audio thread). */
  double time() const { return js_->g.ctx.currentTime(); }
  /** MIDI the engine produced since the last call (audio thread). */
  template <class F>
  void takeMidiOut(F&& each) {
    for (const auto& m : js_->midiOut) each(m.b0, m.b1, m.b2, m.t);
    js_->midiOut.clear();
  }
  /** The DAW's clock for the next block (audio thread). */
  void setHostClock(bool playing, double ppq, double bpm) { js_->host.playing = playing; js_->host.ppq = ppq; js_->host.bpm = bpm; }
  /** Render n frames (any block size), one 128-frame engine block at a time. */
  template <class OnBlock>
  void process(float* L, float* R, int n, OnBlock beforeBlock) {
    for (int i = 0; i < n; i++) {
      if (fifoPos_ >= wa::RQ) {
        beforeBlock(i);  // the host applies MIDI events due before this block
        drainIn();
        js_->render(fifoL_, fifoR_);  // runs the JS timers too
        fifoPos_ = 0;
        pushScope();
        idleGc();
        if (saveRequest_.exchange(false)) {
          run("SY1E.flushPatchSave();");  // a knob turned just before the save is in it too
          saveState();
          std::lock_guard<std::mutex> l(stateMu_);
          saveSeq_++;
          stateCv_.notify_all();
        } else if (++blocks_ % 375 == 0 && !js_->evalString("__takeDirty()").empty()) {
          saveState();  // about every second at 48 kHz, only when something changed
        }
      }
      // never let a broken value (NaN / infinity) reach the speakers
      const float l = fifoL_[fifoPos_], r = fifoR_[fifoPos_];
      L[i] = std::isfinite(l) ? l : 0.0f;
      R[i] = std::isfinite(r) ? r : 0.0f;
      fifoPos_++;
    }
  }
  /** Save the state now (audio thread, or any thread while audio is not running). */
  void saveState() {
    const std::string s = js_->evalString("__dumpStorage()");
    std::lock_guard<std::mutex> l(stateMu_);
    state_ = s;
  }
  /** From another thread (DAW saving the project, window opening): the audio thread saves the
   *  state at its next block; waits up to timeoutMs, then returns whatever state is newest. */
  std::string freshState(int timeoutMs) {
    std::unique_lock<std::mutex> l(stateMu_);
    const unsigned want = saveSeq_ + 1;
    saveRequest_ = true;
    stateCv_.wait_for(l, std::chrono::milliseconds(timeoutMs), [&] { return saveSeq_ >= want; });
    return state_;
  }

  static std::string quote(const std::string& s) {
    std::string o = "\"";
    for (char c : s) {
      switch (c) {
        case '"': o += "\\\""; break;
        case '\\': o += "\\\\"; break;
        case '\n': o += "\\n"; break;
        case '\r': o += "\\r"; break;
        case '\t': o += "\\t"; break;
        default:
          if (static_cast<unsigned char>(c) < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
          else o += c;
      }
    }
    return o + "\"";
  }

 private:
  static constexpr int kScope = 1024;
  std::unique_ptr<WaJs> js_;
  float fifoL_[wa::RQ] = {}, fifoR_[wa::RQ] = {};
  int fifoPos_ = wa::RQ;
  size_t blocks_ = 0;
  unsigned quiet_ = 0;
  std::mutex inMu_, outMu_, scopeMu_, stateMu_;
  std::vector<std::string> in_;
  std::vector<std::pair<std::string, std::string>> out_;
  float scope_[kScope] = {};
  std::string state_;
  std::atomic<bool> saveRequest_{false};
  unsigned saveSeq_ = 0;
  std::condition_variable stateCv_;

  void run(const std::string& code) { js_->eval(code, "<call>"); }
  void drainIn() {
    std::vector<std::string> calls;
    {
      std::unique_lock<std::mutex> l(inMu_, std::try_to_lock);
      if (!l.owns_lock() || in_.empty()) return;
      calls.swap(in_);
    }
    for (auto& c : calls) run(c);
  }
  /** Garbage collection only after a second of silence (never while something sounds). */
  void idleGc() {
    float peak = 0;
    for (int k = 0; k < wa::RQ; k++) peak = std::max(peak, std::max(std::fabs(fifoL_[k]), std::fabs(fifoR_[k])));
    if (peak > 1e-5f) { quiet_ = 0; return; }
    if (++quiet_ == 400) js_->collectGarbage();
  }
  void pushScope() {
    std::unique_lock<std::mutex> l(scopeMu_, std::try_to_lock);
    if (!l.owns_lock()) return;
    std::memmove(scope_, scope_ + wa::RQ, (kScope - wa::RQ) * sizeof(float));
    for (int k = 0; k < wa::RQ; k++) scope_[kScope - wa::RQ + k] = 0.5f * (fifoL_[k] + fifoR_[k]);
  }
};

}  // namespace sy1
