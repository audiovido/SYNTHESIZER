// SY-1 native — runs the web app's own engine JavaScript (QuickJS) on top of
// native/wa, so hit-building code such as the drum machines (src/engine/drums.ts,
// drum-models.ts) is the very same code as on the web, and its Web Audio nodes
// render like Chrome's. js/wa-shim.js maps the Web Audio API onto the `__wa`
// functions defined here.
//
// Threading: everything here runs on one thread (the plugin calls it from the
// audio thread between 128-frame quanta). Nodes no longer reachable from the
// output are freed by sweep().
#pragma once
#include <cstdlib>
#include <cstring>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

extern "C" {
#include "../third_party/quickjs/quickjs.h"
}
#include "../wa/wa.hpp"
#include "worklets.hpp"

namespace sy1 {

class WaJs {
 public:
  explicit WaJs(double sampleRate) : g(sampleRate) {
    rt_ = JS_NewRuntime();
    ctx_ = JS_NewContext(rt_);
    JS_SetContextOpaque(ctx_, this);
    dest_ = g.make<wa::Gain>();  // id 0 = ctx.destination
    nodes_.push_back(dest_);
    born_.push_back(0);
    installApi();
  }
  ~WaJs() {
    JS_FreeContext(ctx_);
    JS_FreeRuntime(rt_);
  }
  WaJs(const WaJs&) = delete;
  WaJs& operator=(const WaJs&) = delete;

  wa::Graph g;

  /** Evaluate a script (the shim, then the engine bundle). Returns "" or the error text. */
  std::string eval(const std::string& code, const char* name = "<eval>") {
    JSValue v = JS_Eval(ctx_, code.c_str(), code.size(), name, JS_EVAL_TYPE_GLOBAL);
    std::string err;
    if (JS_IsException(v)) err = exceptionText();
    JS_FreeValue(ctx_, v);
    return err;
  }
  /** Call a global function path like "SY1E.triggerDrum" with numeric/string args given as a JS expression. */
  std::string run(const std::string& expr) { return eval(expr, "<run>"); }

  /** Render one 128-frame quantum of the destination, then run due JS timers. */
  void render(float* L, float* R) {
    g.render(dest_, L, R);
    if (++blocks_ % 64 == 0) sweep();
    JS_FreeValue(ctx_, JS_Eval(ctx_, "__runTimers()", 13, "<timers>", JS_EVAL_TYPE_GLOBAL));
    JSContext* c;
    while (JS_ExecutePendingJob(rt_, &c) > 0) {}
  }

  size_t liveNodes() const {
    size_t n = 0;
    for (auto* p : nodes_) n += p != nullptr;
    return n;
  }

 private:
  JSRuntime* rt_;
  JSContext* ctx_;
  wa::Gain* dest_;
  std::vector<wa::Node*> nodes_;  // id -> node (nullptr once freed)
  std::vector<size_t> born_;
  std::vector<std::shared_ptr<std::vector<float>>> buffers_{nullptr};
  std::vector<double> bufferRates_{0};
  size_t blocks_ = 0;
  int apCount_ = 0;

  static WaJs* self(JSContext* c) { return static_cast<WaJs*>(JS_GetContextOpaque(c)); }
  std::string exceptionText() {
    JSValue e = JS_GetException(ctx_);
    const char* s = JS_ToCString(ctx_, e);
    std::string out = s ? s : "exception";
    if (s) JS_FreeCString(ctx_, s);
    JSValue st = JS_GetPropertyStr(ctx_, e, "stack");
    if (!JS_IsUndefined(st)) {
      const char* ss = JS_ToCString(ctx_, st);
      if (ss) { out += "\n"; out += ss; JS_FreeCString(ctx_, ss); }
    }
    JS_FreeValue(ctx_, st);
    JS_FreeValue(ctx_, e);
    return out;
  }
  wa::Node* node(JSContext* c, JSValueConst v) {
    int32_t id = -1;
    JS_ToInt32(c, &id, v);
    return id >= 0 && id < static_cast<int>(nodes_.size()) ? nodes_[id] : nullptr;
  }
  static std::string str(JSContext* c, JSValueConst v) {
    const char* s = JS_ToCString(c, v);
    std::string r = s ? s : "";
    if (s) JS_FreeCString(c, s);
    return r;
  }
  static double num(JSContext* c, JSValueConst v) {
    double d = 0;
    JS_ToFloat64(c, &d, v);
    return d;
  }

  static wa::Param* paramOf(wa::Node* n, const std::string& p) {
    using namespace wa;
    if (!n) return nullptr;
    if (auto x = dynamic_cast<Gain*>(n)) return p == "gain" ? &x->gain : nullptr;
    if (auto x = dynamic_cast<Biquad*>(n)) {
      if (p == "frequency") return &x->frequency;
      if (p == "Q") return &x->Q;
      if (p == "gain") return &x->gain;
      if (p == "detune") return &x->detune;
      return nullptr;
    }
    if (auto x = dynamic_cast<Delay*>(n)) return p == "delayTime" ? &x->delayTime : nullptr;
    if (auto x = dynamic_cast<Compressor*>(n)) {
      if (p == "threshold") return &x->threshold;
      if (p == "knee") return &x->knee;
      if (p == "ratio") return &x->ratio;
      if (p == "attack") return &x->attack;
      if (p == "release") return &x->release;
      return nullptr;
    }
    if (auto x = dynamic_cast<StereoPanner*>(n)) return p == "pan" ? &x->pan : nullptr;
    if (auto x = dynamic_cast<Oscillator*>(n)) return p == "frequency" ? &x->frequency : p == "detune" ? &x->detune : nullptr;
    if (auto x = dynamic_cast<BufferSource*>(n)) return p == "playbackRate" ? &x->playbackRate : p == "detune" ? &x->detune : nullptr;
    return nullptr;
  }
  static void paramsOf(wa::Node* n, std::vector<wa::Param*>& out) { n->params(out); }

  /** Free nodes that can no longer reach the output (older than one second, so nothing half-built is lost). */
  void sweep() {
    for (wa::Node* n : nodes_) if (n) n->mark = 0;
    std::vector<wa::Node*> stack{dest_};
    std::vector<wa::Param*> ps;
    while (!stack.empty()) {
      wa::Node* n = stack.back();
      stack.pop_back();
      if (!n || n->mark) continue;
      n->mark = 1;
      for (auto& in : n->inputs) for (wa::Node* s : in) if (!s->mark) stack.push_back(s);
      ps.clear();
      n->params(ps);
      for (wa::Param* p : ps) for (wa::Node* s : p->inputs) if (!s->mark) stack.push_back(s);
    }
    const size_t now = g.ctx.frame;
    const size_t minAge = static_cast<size_t>(g.ctx.sampleRate);
    bool any = false;
    for (size_t i = 1; i < nodes_.size(); i++) {
      wa::Node* n = nodes_[i];
      if (n && !n->mark && now - born_[i] > minAge) { n->mark = 2; nodes_[i] = nullptr; any = true; }
    }
    if (any) {
      g.sweep([](wa::Node* n) { return n->mark == 2; });
      g.changed();
    }
    while (nodes_.size() > 1 && !nodes_.back()) { nodes_.pop_back(); born_.pop_back(); }
  }

  int add(wa::Node* n) {
    nodes_.push_back(n);
    born_.push_back(g.ctx.frame);
    return static_cast<int>(nodes_.size() - 1);
  }

  // ------------------------------------------------------------ __wa API ----
  static JSValue fnTime(JSContext* c, JSValueConst, int, JSValueConst*) { return JS_NewFloat64(c, self(c)->g.ctx.currentTime()); }
  static JSValue fnCreate(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
    WaJs* h = self(c);
    const std::string ty = str(c, argv[0]);
    wa::Node* n = nullptr;
    using namespace wa;
    if (ty == "gain") n = h->g.make<Gain>();
    else if (ty == "biquad") n = h->g.make<Biquad>();
    else if (ty == "delay") n = h->g.make<Delay>(argc > 1 ? num(c, argv[1]) : 1.0);
    else if (ty == "shaper") n = h->g.make<WaveShaper>();
    else if (ty == "comp") n = h->g.make<Compressor>();
    else if (ty == "panner") n = h->g.make<StereoPanner>();
    else if (ty == "osc") n = h->g.make<Oscillator>();
    else if (ty == "buffersrc") n = h->g.make<BufferSource>();
    else if (ty == "pass") n = h->g.make<Passthrough>();
    else if (ty == "merger") n = h->g.make<Merger>(argc > 1 ? static_cast<int>(num(c, argv[1])) : 6);
    else if (ty == "worklet") {
      const std::string name = str(c, argv[1]);
      if (name == "sy1-voices") n = h->g.make<HQWorklet>();
      else if (name == "sy1-analog") n = h->g.make<AnalogWorklet>();
      else return JS_ThrowTypeError(c, "worklet %s is not available natively yet", name.c_str());
    }
    else if (ty == "iir") {
      auto parse = [&](const std::string& s) { std::vector<double> v; std::stringstream ss(s); std::string x; while (std::getline(ss, x, ',')) v.push_back(std::stod(x)); return v; };
      n = h->g.make<IIR>(parse(str(c, argv[1])), parse(str(c, argv[2])));
    }
    if (!n) return JS_ThrowTypeError(c, "unsupported node %s", ty.c_str());
    return JS_NewInt32(c, h->add(n));
  }
  static JSValue fnConnect(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Node *a = h->node(c, argv[0]), *b = h->node(c, argv[1]);
    int32_t input = 0;
    JS_ToInt32(c, &input, argv[2]);
    if (a && b && input >= 0 && input < static_cast<int>(b->inputs.size())) {
      a->connect(b, input);
      // Test hook (parity tests only): Chrome pulls the reverb allpass branches (-g*u gain, delay) in a
      // per-page-load order; SY1_AP_ORDER=mask puts allpass i's delay first when bit i is set.
      static const char* mask = std::getenv("SY1_AP_ORDER");
      if (mask && dynamic_cast<wa::Delay*>(a) && dynamic_cast<wa::Gain*>(b) && b->inputs[0].size() == 2 && dynamic_cast<wa::Gain*>(b->inputs[0][0])) {
        if (std::atoi(mask) & (1 << h->apCount_)) std::swap(b->inputs[0][0], b->inputs[0][1]);
        h->apCount_++;
      }
      h->g.changed();
    }
    return JS_UNDEFINED;
  }
  static JSValue fnConnectParam(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Node *a = h->node(c, argv[0]), *b = h->node(c, argv[1]);
    if (wa::Param* p = paramOf(b, str(c, argv[2]))) if (a) { a->connect(p); h->g.changed(); }
    return JS_UNDEFINED;
  }
  static JSValue fnDisconnect(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Node* a = h->node(c, argv[0]);
    if (!a) return JS_UNDEFINED;
    for (wa::Node* n : h->nodes_) {
      if (!n) continue;
      a->disconnect(n);
      std::vector<wa::Param*> ps;
      paramsOf(n, ps);
      for (wa::Param* p : ps) p->inputs.erase(std::remove(p->inputs.begin(), p->inputs.end(), a), p->inputs.end());
    }
    h->g.changed();
    return JS_UNDEFINED;
  }
  static JSValue fnParam(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Param* p = paramOf(h->node(c, argv[0]), str(c, argv[1]));
    if (!p) return JS_UNDEFINED;
    int32_t m = 0;
    JS_ToInt32(c, &m, argv[2]);
    const float v = static_cast<float>(num(c, argv[3]));
    const double t = num(c, argv[4]), tc = num(c, argv[5]);
    switch (m) {
      case 0: p->setValueAtTime(v, t); break;
      case 1: p->linearRampToValueAtTime(v, t); break;
      case 2: p->exponentialRampToValueAtTime(v, t); break;
      case 3: p->setTargetAtTime(v, t, tc); break;
      case 4: p->cancelScheduledValues(t); break;
    }
    return JS_UNDEFINED;
  }
  static JSValue fnParamSet(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    if (wa::Param* p = paramOf(h->node(c, argv[0]), str(c, argv[1]))) p->setValue(static_cast<float>(num(c, argv[2])));
    return JS_UNDEFINED;
  }
  static JSValue fnParamGet(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Param* p = paramOf(h->node(c, argv[0]), str(c, argv[1]));
    return JS_NewFloat64(c, p ? p->value() : 0);
  }
  static JSValue fnProp(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Node* n = h->node(c, argv[0]);
    const std::string k = str(c, argv[1]);
    using namespace wa;
    if (auto b = dynamic_cast<Biquad*>(n)) {
      if (k == "type") {
        const std::string t = str(c, argv[2]);
        static const char* T[] = {"lowpass", "highpass", "bandpass", "lowshelf", "highshelf", "peaking", "notch", "allpass"};
        for (int i = 0; i < 8; i++) if (t == T[i]) b->type = static_cast<Biquad::Type>(i);
      }
    } else if (auto o = dynamic_cast<Oscillator*>(n)) {
      if (k == "type") {
        const std::string t = str(c, argv[2]);
        o->setType(t == "square" ? PeriodicWave::Square : t == "sawtooth" ? PeriodicWave::Sawtooth : t == "triangle" ? PeriodicWave::Triangle : PeriodicWave::Sine);
      }
    } else if (auto s = dynamic_cast<WaveShaper*>(n)) {
      if (k == "oversample") { const std::string t = str(c, argv[2]); s->setOversample(t == "2x" ? WaveShaper::X2 : t == "4x" ? WaveShaper::X4 : WaveShaper::None); }
    } else if (auto bs = dynamic_cast<BufferSource*>(n)) {
      if (k == "loop") bs->loop = num(c, argv[2]) != 0;
      else if (k == "buffer") {
        const int id = static_cast<int>(num(c, argv[2]));
        if (id > 0 && id < static_cast<int>(h->buffers_.size())) bs->setBuffer(h->buffers_[id], h->bufferRates_[id]);
      }
    }
    return JS_UNDEFINED;
  }
  static JSValue fnCurve(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    auto* s = dynamic_cast<wa::WaveShaper*>(h->node(c, argv[0]));
    if (!s) return JS_UNDEFINED;
    size_t len = 0;
    uint8_t* p = JS_GetArrayBuffer(c, &len, argv[1]);
    std::vector<float> curve;
    if (p && len >= sizeof(float)) { curve.resize(len / sizeof(float)); std::memcpy(curve.data(), p, curve.size() * sizeof(float)); }
    s->setCurve(std::move(curve));
    return JS_UNDEFINED;
  }
  static JSValue fnBuffer(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    size_t len = 0;
    uint8_t* p = JS_GetArrayBuffer(c, &len, argv[0]);
    auto v = std::make_shared<std::vector<float>>(p ? len / sizeof(float) : 0);
    if (p) std::memcpy(v->data(), p, v->size() * sizeof(float));
    h->buffers_.push_back(v);
    h->bufferRates_.push_back(num(c, argv[1]));
    return JS_NewInt32(c, static_cast<int>(h->buffers_.size() - 1));
  }
  static JSValue fnStart(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    wa::Node* n = h->node(c, argv[0]);
    if (auto b = dynamic_cast<wa::BufferSource*>(n)) b->start(num(c, argv[1]), num(c, argv[2]));
    else if (auto s = dynamic_cast<wa::Source*>(n)) s->start(num(c, argv[1]));
    return JS_UNDEFINED;
  }
  static JSValue fnStop(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    WaJs* h = self(c);
    if (auto s = dynamic_cast<wa::Source*>(h->node(c, argv[0]))) s->stop(num(c, argv[1]));
    return JS_UNDEFINED;
  }
  static JSValue fnWkParam(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    auto* w = dynamic_cast<WorkletNode*>(self(c)->node(c, argv[0]));
    if (!w) return JS_UNDEFINED;
    const std::string k = str(c, argv[1]);
    if (JS_IsString(argv[2])) { const std::string v = str(c, argv[2]); w->post([w, k, v] { w->param(k, v); }); }
    else { const double v = num(c, argv[2]); w->post([w, k, v] { w->param(k, v); }); }
    return JS_UNDEFINED;
  }
  static JSValue fnWkSnap(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    if (auto* w = dynamic_cast<WorkletNode*>(self(c)->node(c, argv[0]))) w->post([w] { w->snap(); });
    return JS_UNDEFINED;
  }
  static JSValue fnWkMsg(JSContext* c, JSValueConst, int, JSValueConst* argv) {
    auto* w = dynamic_cast<WorkletNode*>(self(c)->node(c, argv[0]));
    if (!w) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(c, &id, argv[2]);
    const std::string t = str(c, argv[1]);
    const double a3 = num(c, argv[3]), a4 = num(c, argv[4]), a5 = num(c, argv[5]), a6 = num(c, argv[6]), a7 = num(c, argv[7]), a8 = num(c, argv[8]), a9 = num(c, argv[9]);
    w->post([=] { w->message(t, id, a3, a4, a5, a6, a7, a8, a9); });
    return JS_UNDEFINED;
  }
  static JSValue fnLog(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
    for (int i = 0; i < argc; i++) std::fprintf(stderr, "%s%s", i ? " " : "", str(c, argv[i]).c_str());
    std::fprintf(stderr, "\n");
    return JS_UNDEFINED;
  }

  void installApi() {
    JSValue global = JS_GetGlobalObject(ctx_);
    JSValue wa = JS_NewObject(ctx_);
    auto fn = [&](const char* name, JSCFunction* f, int n) { JS_SetPropertyStr(ctx_, wa, name, JS_NewCFunction(ctx_, f, name, n)); };
    fn("time", fnTime, 0);
    fn("create", fnCreate, 3);
    fn("connect", fnConnect, 3);
    fn("connectParam", fnConnectParam, 3);
    fn("disconnect", fnDisconnect, 1);
    fn("param", fnParam, 6);
    fn("paramSet", fnParamSet, 3);
    fn("paramGet", fnParamGet, 2);
    fn("prop", fnProp, 3);
    fn("curve", fnCurve, 2);
    fn("buffer", fnBuffer, 2);
    fn("start", fnStart, 3);
    fn("stop", fnStop, 2);
    fn("wkParam", fnWkParam, 3);
    fn("wkSnap", fnWkSnap, 1);
    fn("wkMsg", fnWkMsg, 10);
    JS_SetPropertyStr(ctx_, wa, "sampleRate", JS_NewFloat64(ctx_, g.ctx.sampleRate));
    JS_SetPropertyStr(ctx_, global, "__wa", wa);
    JSValue console = JS_NewObject(ctx_);
    JS_SetPropertyStr(ctx_, console, "log", JS_NewCFunction(ctx_, fnLog, "log", 1));
    JS_SetPropertyStr(ctx_, console, "warn", JS_NewCFunction(ctx_, fnLog, "warn", 1));
    JS_SetPropertyStr(ctx_, global, "console", console);
    JS_FreeValue(ctx_, global);
  }
};

}  // namespace sy1
