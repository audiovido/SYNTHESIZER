// SY-1 native — the plugin's sound engine: the web app's engine (js/dist/engine.js)
// running in QuickJS on native/wa, driven in 128-frame blocks.
//
// All JavaScript runs on the audio thread. Other threads hand calls in through
// post() (a short mutex, try-locked by the audio thread so it never waits).
#pragma once
#include <cmath>
#include <cstdio>
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
    return true;
  }
  bool ready() const { return js_ != nullptr; }

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
  void hostCall(const std::string& name, const std::string& argsJson) {
    run("SY1E.call(" + quote(name) + ", " + argsJson + ");");
    std::lock_guard<std::mutex> l(outMu_);
    if (out_.size() < 4096) out_.push_back({name, argsJson});
  }
  /** Render n frames (any block size); output lags by one 128-frame block. */
  template <class OnBlock>
  void process(float* L, float* R, int n, OnBlock beforeBlock) {
    for (int i = 0; i < n; i++) {
      if (fifoPos_ >= wa::RQ) {
        beforeBlock(i);  // the host applies MIDI events due before this block
        drainIn();
        js_->render(fifoL_, fifoR_);  // runs the JS timers too
        fifoPos_ = 0;
        pushScope();
        if (++blocks_ % 375 == 0) saveState();  // about every second at 48 kHz
      }
      L[i] = fifoL_[fifoPos_];
      R[i] = fifoR_[fifoPos_];
      fifoPos_++;
    }
  }
  void saveState() {
    const std::string s = js_->evalString("__dumpStorage()");
    std::lock_guard<std::mutex> l(stateMu_);
    state_ = s;
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
  std::mutex inMu_, outMu_, scopeMu_, stateMu_;
  std::vector<std::string> in_;
  std::vector<std::pair<std::string, std::string>> out_;
  float scope_[kScope] = {};
  std::string state_;

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
  void pushScope() {
    std::unique_lock<std::mutex> l(scopeMu_, std::try_to_lock);
    if (!l.owns_lock()) return;
    std::memmove(scope_, scope_ + wa::RQ, (kScope - wa::RQ) * sizeof(float));
    for (int k = 0; k < wa::RQ; k++) scope_[kScope - wa::RQ + k] = 0.5f * (fifoL_[k] + fifoR_[k]);
  }
};

}  // namespace sy1
