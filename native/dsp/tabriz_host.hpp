// SY-1 native — Tabriz host layer (C++17, platform independent).
//
//  - CommandQueue: lock-free single-producer/single-consumer queue. The UI
//    thread pushes; the audio thread drains at the start of every buffer.
//  - MonoController (UI thread): mono note stack with last-note priority,
//    legato glide and retrigger, same behaviour as monoOn/monoOff in
//    src/engine/synth.ts.
//    With MONO off (polyMode = "poly") every key gets its own voice.
//  - TabrizHost (audio thread): drains commands into AnalogEngine, renders in
//    128-sample chunks (same block size as the web worklet), then the shared
//    FX bus (fx.hpp: drive, EQ, delay, chorus, reverb, volume, limiter).
#pragma once
#include "analog.hpp"
#include "fx.hpp"
#include <memory>
#include <algorithm>
#include <atomic>
#include <cstring>
#include <vector>

namespace sy1 {

struct Command {
  enum Type : uint8_t { NoteOn, NoteOff, Kill, Glide, ParamNum, ParamStr, AllOff, Bend, Mod } type = AllOff;
  int id = 0, midi = 60;
  double a = 0, b = 0, c = 0;  // vel/from/glide, or numeric value
  char key[24] = {0};
  char str[24] = {0};
};

class CommandQueue {
 public:
  static constexpr uint32_t N = 1024;  // power of two
  bool push(const Command& c) {
    const uint32_t h = head.load(std::memory_order_relaxed);
    if (h - tail.load(std::memory_order_acquire) >= N) return false;  // full: drop
    buf[h & (N - 1)] = c;
    head.store(h + 1, std::memory_order_release);
    return true;
  }
  bool pop(Command& c) {
    const uint32_t t = tail.load(std::memory_order_relaxed);
    if (t == head.load(std::memory_order_acquire)) return false;
    c = buf[t & (N - 1)];
    tail.store(t + 1, std::memory_order_release);
    return true;
  }
 private:
  Command buf[N];
  std::atomic<uint32_t> head{0}, tail{0};
};

inline double midiHz(int m) { return 440.0 * std::pow(2.0, (m - 69) / 12.0); }

// UI-thread side. Every method only pushes commands; never touches the engine.
class MonoController {
 public:
  explicit MonoController(CommandQueue& q) : q(q) {}

  double glide = 0.06;
  bool legato = true;

  bool poly = false;

  void noteDown(int midi, double vel) {
    if (poly) {
      noteUpPoly(midi);
      Command c; c.type = Command::NoteOn; c.id = ++nextId; c.midi = midi; c.a = vel; q.push(c);
      held.push_back({midi, nextId});
      return;
    }
    stack.erase(std::remove(stack.begin(), stack.end(), midi), stack.end());
    stack.push_back(midi);
    moveTo(midi, vel);
  }

  void noteUp(int midi) {
    if (poly) { noteUpPoly(midi); return; }
    stack.erase(std::remove(stack.begin(), stack.end(), midi), stack.end());
    if (midi != cur) return;
    if (!stack.empty()) { moveTo(stack.back(), 0.8); return; }  // fall back to the previous held note
    Command c; c.type = Command::NoteOff; c.id = id; q.push(c);
    on = false;
    cur = -1;
  }

  void allOff() {
    stack.clear();
    held.clear();
    on = false;
    cur = -1;
    Command c; c.type = Command::AllOff; q.push(c);
  }

  void setNum(const char* key, double v) {
    if (!std::strcmp(key, "glide")) glide = v;
    Command c; c.type = Command::ParamNum; std::strncpy(c.key, key, sizeof c.key - 1); c.a = v; q.push(c);
  }
  void setStr(const char* key, const char* v) {
    if (!std::strcmp(key, "legato")) legato = !std::strcmp(v, "on");
    if (!std::strcmp(key, "polyMode")) {
      const bool p = !std::strcmp(v, "poly");
      if (p != poly) { allOff(); poly = p; }
    }
    Command c; c.type = Command::ParamStr; std::strncpy(c.key, key, sizeof c.key - 1);
    std::strncpy(c.str, v, sizeof c.str - 1); q.push(c);
  }

  void bend(double v) { Command c; c.type = Command::Bend; c.a = v; q.push(c); }
  void mod(double v) { Command c; c.type = Command::Mod; c.a = v; q.push(c); }

  int current() const { return cur; }

 private:
  void moveTo(int midi, double vel) {
    if (on && legato) {
      Command c; c.type = Command::Glide; c.id = id; c.midi = midi; c.c = std::max(0.003, glide); q.push(c);
    } else {
      if (on) { Command k; k.type = Command::Kill; k.id = id; q.push(k); }
      Command c; c.type = Command::NoteOn; c.id = ++nextId; c.midi = midi; c.a = vel;
      c.b = glide > 0.004 && lastHz > 0 ? lastHz : 0; c.c = glide;
      q.push(c);
      id = nextId;
      on = true;
    }
    cur = midi;
    lastHz = midiHz(midi);
  }

  void noteUpPoly(int midi) {
    for (size_t i = 0; i < held.size(); i++) {
      if (held[i].first != midi) continue;
      Command c; c.type = Command::NoteOff; c.id = held[i].second; q.push(c);
      held.erase(held.begin() + static_cast<long>(i));
      return;
    }
  }

  CommandQueue& q;
  std::vector<std::pair<int, int>> held;  // poly: (midi, voice id)
  std::vector<int> stack;
  int id = 0, nextId = 0, cur = -1;
  bool on = false;
  double lastHz = 0;
};

// Audio-thread side.
class TabrizHost {
 public:
  explicit TabrizHost(double sr) : eng(sr), fx(std::make_unique<FxBus>(sr)) {}

  CommandQueue queue;

  void drain() {
    Command c;
    while (queue.pop(c)) {
      switch (c.type) {
        case Command::NoteOn: eng.noteOn(c.id, c.midi, 0, c.a, 0, c.b, c.c); break;
        case Command::NoteOff: eng.noteOff(c.id, 0, false); break;
        case Command::Kill: eng.noteOff(c.id, 0, true); break;
        case Command::Glide: eng.glideTo(c.id, c.midi, 0, c.c); break;
        case Command::ParamNum: {
          const std::string key(c.key);  // fits the small-string buffer: no allocation
          if (!fx->setParam(key, c.a)) eng.setParam(key, c.a);
          break;
        }
        case Command::ParamStr: eng.setParam(c.key, std::string(c.str)); break;
        case Command::AllOff: eng.allOff(); break;
        case Command::Bend: eng.setBend(c.a); break;
        case Command::Mod: eng.setMod(c.a); break;
      }
    }
  }

  // Renders n frames into L/R (R may be null). Real-time safe.
  void render(float* L, float* R, int n) {
    drain();
    std::memset(L, 0, sizeof(float) * n);
    for (int p = 0; p < n; p += 128) {
      const int m = std::min(128, n - p);
      eng.render(L + p, nullptr, m);
    }
    if (R) std::memcpy(R, L, sizeof(float) * n);
    fx->process(L, R, n);
  }

  void snap() { eng.snapParams(); }

 private:
  AnalogEngine eng;
  std::unique_ptr<FxBus> fx;  // ~2.5 MB of delay memory: on the heap
};

}  // namespace sy1
