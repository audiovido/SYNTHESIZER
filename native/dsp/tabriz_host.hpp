// SY-1 native — Tabriz host layer (C++17, platform independent, real-time safe).
//
//  - CommandQueue: lock-free single-producer/single-consumer queue. The UI
//    thread pushes key presses and parameter changes; the audio thread drains
//    it at the start of every buffer.
//  - TabrizHost (audio thread): all note logic, ported from src/engine/synth.ts
//    and src/engine/arp.ts so the app plays exactly like the website:
//      MONO: note stack, last-note priority, legato glide or retrigger
//      POLY: one voice per key
//      HOLD: keeps notes after release; pressing a latched note again stops it
//      ARP:  up / down / up-down / random / as played, rate (tempo divisions),
//            octaves, gate, swing; with HOLD it latches the chord (LATCH).
//            Steps are scheduled sample-accurately inside the audio callback.
//      ORIENTAL tuning: 12 cent offsets (one per pitch class) computed by the
//            UI from the tuning tables; held voices are retuned live.
//    then renders AnalogEngine in 128-sample chunks and the FX bus (fx.hpp).
//  No allocation, no locks after construction.
#pragma once
#include "analog.hpp"
#include "fx.hpp"
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <memory>

namespace sy1 {

struct Command {
  enum Type : uint8_t { KeyDown, KeyUp, ParamNum, ParamStr, AllOff, Bend, Mod } type = AllOff;
  int midi = 60;
  double a = 0;  // velocity or numeric value
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

// UI-thread helper: turns calls into queue commands. Never touches the engine.
class Controller {
 public:
  explicit Controller(CommandQueue& q) : q(q) {}
  void keyDown(int midi, double vel) { Command c; c.type = Command::KeyDown; c.midi = midi; c.a = vel; q.push(c); }
  void keyUp(int midi) { Command c; c.type = Command::KeyUp; c.midi = midi; q.push(c); }
  void allOff() { Command c; c.type = Command::AllOff; q.push(c); }
  void bend(double v) { Command c; c.type = Command::Bend; c.a = v; q.push(c); }
  void mod(double v) { Command c; c.type = Command::Mod; c.a = v; q.push(c); }
  void setNum(const char* key, double v) {
    Command c; c.type = Command::ParamNum; std::strncpy(c.key, key, sizeof c.key - 1); c.a = v; q.push(c);
  }
  void setStr(const char* key, const char* v) {
    Command c; c.type = Command::ParamStr; std::strncpy(c.key, key, sizeof c.key - 1);
    std::strncpy(c.str, v, sizeof c.str - 1); q.push(c);
  }
 private:
  CommandQueue& q;
};

inline double midiHz(int m) { return 440.0 * std::pow(2.0, (m - 69) / 12.0); }

class TabrizHost {
 public:
  explicit TabrizHost(double sr) : sr_(sr), eng(sr), fx(std::make_unique<FxBus>(sr)) {
    std::memset(polyId_, 0, sizeof polyId_);
    std::memset(phys_, 0, sizeof phys_);
    std::memset(sustained_, 0, sizeof sustained_);
    std::memset(arpPhys_, 0, sizeof arpPhys_);
    std::memset(tc_, 0, sizeof tc_);
  }

  CommandQueue queue;

  // Renders n frames into L/R (R may be null). Real-time safe.
  void render(float* L, float* R, int n) {
    drain();
    arpSchedule(n);
    std::memset(L, 0, sizeof(float) * n);
    for (int p = 0; p < n; p += 128) eng.render(L + p, nullptr, std::min(128, n - p));
    if (R) std::memcpy(R, L, sizeof(float) * n);
    fx->process(L, R, n);
  }

  void snap() { eng.snapParams(); }
  int arpStep() const { return arpRunning_ ? static_cast<int>(stepIndex_) : -1; }

  // ---- for tests: apply all queued commands now ----
  void drain() {
    Command c;
    bool retune = false;
    while (queue.pop(c)) {
      switch (c.type) {
        case Command::KeyDown: noteOn(c.midi, c.a); break;
        case Command::KeyUp: noteOff(c.midi); break;
        case Command::AllOff: releaseEverything(); break;
        case Command::Bend: eng.setBend(c.a); break;
        case Command::Mod: eng.setMod(c.a); break;
        case Command::ParamNum: retune |= setNum(c.key, c.a); break;
        case Command::ParamStr: setStr(c.key, c.str); break;
      }
    }
    if (retune) retuneActive();
  }

 private:
  // ------------------------------------------------------------------ params
  bool setNum(const char* k, double v) {
    if (k[0] == 't' && k[1] == 'c' && k[2] >= '0' && k[2] <= '9') {  // tc0..tc11: tuning cents per pitch class
      const int pc = std::atoi(k + 2);
      if (pc >= 0 && pc < 12 && tc_[pc] != v) { tc_[pc] = v; return true; }
      return false;
    }
    if (!std::strcmp(k, "glide")) glide_ = v;
    else if (!std::strcmp(k, "arpRate")) arpRate_ = static_cast<int>(std::lround(v));
    else if (!std::strcmp(k, "arpOct")) arpOct_ = static_cast<int>(std::lround(v));
    else if (!std::strcmp(k, "arpGate")) arpGate_ = v;
    else if (!std::strcmp(k, "arpSwing")) arpSwing_ = v;
    else if (!std::strcmp(k, "tempo")) bpm_ = std::fmax(40, std::fmin(240, v));
    const std::string key(k);  // fits the small-string buffer: no allocation
    if (!fx->setParam(key, v)) eng.setParam(key, v);
    return false;
  }

  void setStr(const char* k, const char* v) {
    const bool on = !std::strcmp(v, "on");
    if (!std::strcmp(k, "legato")) legato_ = on;
    else if (!std::strcmp(k, "polyMode")) {
      const bool p = !std::strcmp(v, "poly");
      if (p != poly_) { releaseEverything(); poly_ = p; }
    } else if (!std::strcmp(k, "hold")) {
      if (hold_ && !on) { hold_ = false; releaseHeldByHold(); arpReleaseLatched(); }
      hold_ = on;
    } else if (!std::strcmp(k, "arpOn")) {
      if (on != arp_) { releaseEverything(); arp_ = on; }
    } else if (!std::strcmp(k, "arpMode")) {
      arpMode_ = !std::strcmp(v, "down") ? 1 : !std::strcmp(v, "updown") ? 2 : !std::strcmp(v, "random") ? 3
               : !std::strcmp(v, "played") ? 4 : 0;
    } else {
      eng.setParam(k, std::string(v));
    }
  }

  double centsFor(int midi) const { return tc_[((midi % 12) + 12) % 12]; }

  int startVoice(int midi, double vel, int offset, double fromHz, double glide) {
    const int id = nextId_++;
    eng.noteOn(id, midi, centsFor(midi), vel, offset, fromHz, glide);
    return id;
  }

  void retuneActive() {
    if (monoOn_ && monoMidi_ >= 0) eng.glideTo(monoId_, monoMidi_, centsFor(monoMidi_), 0.005);
    for (int m = 0; m < 128; m++) if (polyId_[m]) eng.glideTo(polyId_[m], m, centsFor(m), 0.005);
  }

  bool holding() const { return hold_; }

  // ------------------------------------------------------------- note entry
  void noteOn(int midi, double vel) {
    if (midi < 0 || midi > 127) return;
    if (arp_) { arpNoteOn(midi, vel); return; }
    if (poly_) polyOn(midi, vel); else monoOn(midi, vel);
  }

  void noteOff(int midi) {
    if (midi < 0 || midi > 127) return;
    if (arp_) { arpNoteOff(midi); return; }
    if (poly_) polyOff(midi); else monoOff(midi);
  }

  void releaseEverything() {
    eng.allOff();
    monoLen_ = 0; monoOn_ = false; monoMidi_ = -1;
    std::memset(polyId_, 0, sizeof polyId_);
    std::memset(phys_, 0, sizeof phys_);
    std::memset(sustained_, 0, sizeof sustained_);
    arpAllOff();
  }

  // ------------------------------------------------------------------- mono
  void monoMoveTo(int midi, double vel) {
    const double hz = midiHz(midi) * std::pow(2.0, centsFor(midi) / 1200);
    if (monoOn_ && legato_) {
      eng.glideTo(monoId_, midi, centsFor(midi), std::fmax(0.003, glide_));
    } else {
      if (monoOn_) eng.noteOff(monoId_, 0, true);
      monoId_ = startVoice(midi, vel, 0, glide_ > 0.004 && lastHz_ > 0 ? lastHz_ : 0, glide_);
      monoOn_ = true;
    }
    monoMidi_ = midi;
    lastHz_ = hz;
  }

  void monoOn(int midi, double vel) {
    // pressing the HOLD-latched note again stops it (toggle)
    if (hold_ && monoOn_ && monoMidi_ == midi && monoLen_ == 0) {
      eng.noteOff(monoId_, 0, false);
      monoOn_ = false;
      monoMidi_ = -1;
      return;
    }
    stackRemove(midi);
    if (monoLen_ < 128) monoStack_[monoLen_++] = midi;
    monoMoveTo(midi, vel);
  }

  void monoOff(int midi) {
    stackRemove(midi);
    if (midi != monoMidi_) return;
    if (monoLen_ > 0) { monoMoveTo(monoStack_[monoLen_ - 1], 0.8); return; }  // back to the previous held key
    if (holding()) return;
    if (monoOn_) eng.noteOff(monoId_, 0, false);
    monoOn_ = false;
    monoMidi_ = -1;
  }

  void stackRemove(int midi) {
    int w = 0;
    for (int i = 0; i < monoLen_; i++) if (monoStack_[i] != midi) monoStack_[w++] = monoStack_[i];
    monoLen_ = w;
  }

  // ------------------------------------------------------------------- poly
  void polyOn(int midi, double vel) {
    if (hold_ && sustained_[midi] && !phys_[midi]) {  // second press on a latched key stops it
      sustained_[midi] = false;
      releasePoly(midi);
      return;
    }
    phys_[midi] = true;
    sustained_[midi] = false;
    if (polyId_[midi]) eng.noteOff(polyId_[midi], 0, false);
    polyId_[midi] = startVoice(midi, vel, 0, 0, 0);
  }

  void polyOff(int midi) {
    phys_[midi] = false;
    if (holding()) { if (polyId_[midi]) sustained_[midi] = true; return; }
    releasePoly(midi);
  }

  void releasePoly(int midi) {
    if (polyId_[midi]) eng.noteOff(polyId_[midi], 0, false);
    polyId_[midi] = 0;
  }

  void releaseHeldByHold() {
    for (int m = 0; m < 128; m++) {
      if (sustained_[m] && !phys_[m]) releasePoly(m);
      sustained_[m] = false;
    }
    if (!poly_ && monoOn_ && monoLen_ == 0) {
      eng.noteOff(monoId_, 0, false);
      monoOn_ = false;
      monoMidi_ = -1;
    }
  }

  // -------------------------------------------------------------------- arp
  struct Held { int midi; double vel; };
  Held held_[128];
  int heldLen_ = 0;
  bool arpPhys_[128];
  bool arpRunning_ = false;
  double toNext_ = 0;  // samples until the next step
  long stepIndex_ = 0;
  int pos_ = -1, dir_ = 1;
  uint32_t rng_ = 0x6d2b79f5u;

  int heldIndex(int midi) const { for (int i = 0; i < heldLen_; i++) if (held_[i].midi == midi) return i; return -1; }
  void heldErase(int i) { for (int j = i; j < heldLen_ - 1; j++) held_[j] = held_[j + 1]; heldLen_--; }

  void arpNoteOn(int midi, double vel) {
    if (hold_ && !arpPhys_[midi]) {  // LATCH: pressing a latched note removes it
      const int i = heldIndex(midi);
      if (i >= 0) { heldErase(i); if (!heldLen_) arpStop(); return; }
    }
    arpPhys_[midi] = true;
    if (heldIndex(midi) < 0 && heldLen_ < 128) held_[heldLen_++] = {midi, vel};
    if (!arpRunning_) { arpRunning_ = true; toNext_ = 0; stepIndex_ = 0; pos_ = -1; dir_ = 1; }
  }

  void arpNoteOff(int midi) {
    if (!arpPhys_[midi]) return;
    arpPhys_[midi] = false;
    if (!hold_) { const int i = heldIndex(midi); if (i >= 0) heldErase(i); }
    if (!heldLen_) arpStop();
  }

  void arpReleaseLatched() {
    for (int i = heldLen_ - 1; i >= 0; i--) if (!arpPhys_[held_[i].midi]) heldErase(i);
    if (!heldLen_) arpStop();
  }

  void arpAllOff() { heldLen_ = 0; std::memset(arpPhys_, 0, sizeof arpPhys_); arpStop(); }
  void arpStop() { arpRunning_ = false; }

  int arpSequence(int* seq) const {  // up to 128*4 notes
    int base[128], nb = 0;
    for (int i = 0; i < heldLen_; i++) base[nb++] = held_[i].midi;
    if (arpMode_ != 4) std::sort(base, base + nb);
    const int octs = std::max(1, std::min(4, arpOct_));
    int n = 0;
    for (int o = 0; o < octs; o++) for (int i = 0; i < nb; i++) seq[n++] = base[i] + 12 * o;
    return n;
  }

  int arpNext() {
    int seq[512];
    const int n = arpSequence(seq);
    if (!n) return -1;
    if (arpMode_ == 3) {  // random
      rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
      return seq[rng_ % static_cast<uint32_t>(n)];
    }
    if (arpMode_ == 1) {  // down
      pos_ = pos_ <= 0 || pos_ > n - 1 ? n - 1 : pos_ - 1;
      return seq[pos_];
    }
    if (arpMode_ == 2) {  // up/down
      if (n == 1) return seq[0];
      pos_ += dir_;
      if (pos_ >= n) { dir_ = -1; pos_ = n - 2; }
      if (pos_ < 0) { dir_ = 1; pos_ = 1; }
      return seq[pos_];
    }
    pos_ = (pos_ + 1) % n;  // up, as played
    return seq[pos_];
  }

  double arpVel(int midi) const {
    const int pc = ((midi % 12) + 12) % 12;
    for (int i = 0; i < heldLen_; i++) if (((held_[i].midi % 12) + 12) % 12 == pc) return held_[i].vel;
    return 0.8;
  }

  // Schedules every step that starts inside the next n samples (sample-accurate).
  void arpSchedule(int n) {
    if (!arpRunning_ || !arp_) return;
    static const double beats[8] = {4, 2, 1, 0.5, 1.0 / 3, 0.25, 1.0 / 6, 0.125};
    const int r = std::max(1, std::min(8, arpRate_));
    const double stepDur = 60.0 / bpm_ * beats[r - 1] * sr_;
    while (toNext_ < n) {
      const double swing = (stepIndex_ % 2 == 1) ? arpSwing_ * stepDur : 0;
      const int at = static_cast<int>(toNext_ + swing);
      const int m = arpNext();
      if (m >= 0 && m <= 127) {
        const double gate = std::max(0.05, std::min(1.0, arpGate_));
        const int id = startVoice(m, arpVel(m), at, 0, 0);
        eng.noteOff(id, at + static_cast<int>(stepDur * gate * 0.98), false);
      }
      stepIndex_++;
      toNext_ += stepDur;
    }
    toNext_ -= n;
  }

  // ----------------------------------------------------------------- state
  double sr_;
  AnalogEngine eng;
  std::unique_ptr<FxBus> fx;  // ~2.5 MB of delay memory: on the heap
  int nextId_ = 1;
  // patch
  bool poly_ = false, legato_ = true, hold_ = false, arp_ = false;
  double glide_ = 0.06, arpGate_ = 0.6, arpSwing_ = 0, bpm_ = 110;
  int arpMode_ = 0, arpRate_ = 6, arpOct_ = 1;
  double tc_[12];
  // mono
  int monoStack_[128];
  int monoLen_ = 0, monoId_ = 0, monoMidi_ = -1;
  bool monoOn_ = false;
  double lastHz_ = 0;
  // poly
  int polyId_[128];
  bool phys_[128], sustained_[128];
};

}  // namespace sy1
