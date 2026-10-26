// Host layer tests (mono, poly, HOLD, ARP, ORIENTAL tuning, limiter):
//   g++ -O2 -std=c++17 native/tests/host_test.cpp -o ht && ./ht
#include "../dsp/tabriz_host.hpp"
#include <cstdio>
#include <vector>
using namespace sy1;
static int fails = 0;
#define CHECK(c, ...) do { std::printf((c) ? "ok:   " : "FAIL: "); std::printf(__VA_ARGS__); std::printf("\n"); if (!(c)) fails++; } while (0)
static const double SR = 48000;

static double freq(const std::vector<float>& x, size_t a, size_t b) {
  int c = 0; double first = -1, last = -1;
  for (size_t i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) { double t = i - 1 + -x[i - 1] / (x[i] - x[i - 1]); if (first < 0) first = t; else { last = t; c++; } }
  return c ? c * SR / (last - first) : 0;
}
static double rms(const std::vector<float>& x, size_t a, size_t b) { double s = 0; for (size_t i = a; i < b; i++) s += x[i] * x[i]; return std::sqrt(s / (b - a)); }
static std::vector<float> run(TabrizHost& h, double seconds) {
  std::vector<float> out(size_t(seconds * SR));
  for (size_t p = 0; p < out.size(); p += 256) h.render(out.data() + p, nullptr, int(std::min<size_t>(256, out.size() - p)));
  return out;
}
static bool near(double f, double ref, double cents = 3) { return f > 0 && std::fabs(1200 * std::log2(f / ref)) < cents; }

int main() {
  TabrizHost h(SR);
  Controller ui(h.queue);
  // clean sine voice, no FX
  for (auto kv : {std::make_pair("drift", 0.0), {"cutoff", 18000.0}, {"res", 0.1}, {"envAmt", 0.0}, {"oscMix", 0.0}, {"sub", 0.0},
                  {"filterDrive", 0.0}, {"keyTrack", 0.0}, {"aS", 1.0}, {"aA", 0.002}, {"aR", 0.05}, {"glide", 0.05}, {"revMix", 0.0},
                  {"delayMix", 0.0}, {"volume", 0.7}})
    ui.setNum(kv.first, kv.second);
  ui.setStr("osc1Wave", "sine"); ui.setStr("legato", "on"); ui.setStr("polyMode", "mono");
  h.drain(); h.snap();

  // ---- mono ----
  ui.keyDown(57, 1); auto a = run(h, 0.5);
  CHECK(near(freq(a, 12000, a.size()), 220), "mono: A3 = 220 Hz");
  ui.keyDown(64, 1); auto b = run(h, 0.5);
  CHECK(near(freq(b, 12000, b.size()), midiHz(64)), "mono: legato glide to E4");
  ui.keyUp(64); auto c = run(h, 0.5);
  CHECK(near(freq(c, 12000, c.size()), 220), "mono: release top key returns to held A3");
  ui.keyUp(57); auto d = run(h, 1.0);
  CHECK(rms(d, d.size() - 4800, d.size()) < 1e-4, "mono: silence after release");
  // ---- HOLD (mono) ----
  ui.setStr("hold", "on"); ui.keyDown(60, 1); ui.keyUp(60); auto e = run(h, 0.5);
  CHECK(near(freq(e, 12000, e.size()), midiHz(60)), "hold mono: note keeps sounding after release");
  ui.keyDown(60, 1); ui.keyUp(60); auto e2 = run(h, 1.0);
  CHECK(rms(e2, e2.size() - 4800, e2.size()) < 1e-4, "hold mono: pressing the latched note again stops it");
  ui.keyDown(62, 1); ui.keyUp(62); run(h, 0.2); ui.setStr("hold", "off"); auto e3 = run(h, 1.0);
  CHECK(rms(e3, e3.size() - 4800, e3.size()) < 1e-4, "hold off: latched note is released");
  // ---- poly + HOLD ----
  ui.setStr("polyMode", "poly");
  ui.keyDown(57, 1); ui.keyDown(64, 1); auto p1 = run(h, 0.5);
  ui.keyUp(64); auto p2 = run(h, 1.0);
  CHECK(rms(p1, 12000, p1.size()) > 0.05 && near(freq(p2, 24000, p2.size()), 220), "poly: chord, then the remaining key keeps sounding");
  ui.keyUp(57); run(h, 1.0);
  ui.setStr("hold", "on"); ui.keyDown(60, 1); ui.keyDown(67, 1); ui.keyUp(60); ui.keyUp(67); auto p3 = run(h, 0.5);
  CHECK(rms(p3, 12000, p3.size()) > 0.05, "hold poly: chord keeps sounding after release");
  ui.keyDown(67, 1); ui.keyUp(67); auto p4 = run(h, 1.0);
  CHECK(near(freq(p4, 24000, p4.size()), midiHz(60)), "hold poly: pressing a latched key stops only that key");
  ui.setStr("hold", "off"); auto p5 = run(h, 1.0);
  CHECK(rms(p5, p5.size() - 4800, p5.size()) < 1e-4, "hold off: poly latched notes released");
  ui.setStr("polyMode", "mono");
  // ---- ORIENTAL tuning (Shur on G: A is -50 cents) ----
  ui.setNum("tc9", -50); ui.keyDown(57, 1); auto o1 = run(h, 0.5);
  CHECK(near(freq(o1, 12000, o1.size()), 220 * std::pow(2, -50 / 1200.0), 1), "oriental: A3 -50 cents = %.2f Hz", freq(o1, 12000, o1.size()));
  ui.setNum("tc9", 0); auto o2 = run(h, 0.5);
  CHECK(near(freq(o2, 12000, o2.size()), 220, 1), "oriental off: held note retuned live to 220 Hz");
  ui.keyUp(57); run(h, 1.0);
  // ---- ARP: up, 120 BPM, 1/16 (rate 6) -> 0.125 s steps, C-E-G ----
  ui.setNum("tempo", 120); ui.setNum("arpRate", 6); ui.setNum("arpGate", 0.6); ui.setNum("arpOct", 1); ui.setNum("arpSwing", 0);
  ui.setStr("arpMode", "up"); ui.setStr("arpOn", "on");
  ui.keyDown(60, 1); ui.keyDown(64, 1); ui.keyDown(67, 1);
  auto r = run(h, 1.0);
  const int expect[6] = {60, 64, 67, 60, 64, 67};
  bool ok = true;
  for (int s = 0; s < 6; s++) {
    const size_t a0 = size_t(s * 0.125 * SR + 0.01 * SR), a1 = size_t(s * 0.125 * SR + 0.07 * SR);
    if (!near(freq(r, a0, a1), midiHz(expect[s]), 5)) { ok = false; std::printf("   step %d: %.1f Hz, expected %.1f\n", s, freq(r, a0, a1), midiHz(expect[s])); }
  }
  CHECK(ok, "arp up: C E G C E G, one step every 125 ms");
  CHECK(rms(r, size_t(0.125 * SR * 0.9), size_t(0.125 * SR - 10)) < 0.02, "arp gate 60%%: silence at the end of each step");
  ui.keyUp(60); ui.keyUp(64); ui.keyUp(67); auto r2 = run(h, 1.0);
  CHECK(rms(r2, r2.size() - 4800, r2.size()) < 1e-4, "arp stops when the keys are released");
  // down mode
  ui.setStr("arpMode", "down"); ui.keyDown(60, 1); ui.keyDown(64, 1); ui.keyDown(67, 1);
  auto r3 = run(h, 0.5);
  CHECK(near(freq(r3, 480, 3360), midiHz(67), 5) && near(freq(r3, 6480, 9360), midiHz(64), 5), "arp down: G then E");
  ui.keyUp(60); ui.keyUp(64); ui.keyUp(67); run(h, 1.0);
  // LATCH
  ui.setStr("arpMode", "up"); ui.setStr("hold", "on");
  ui.keyDown(60, 1); ui.keyUp(60); auto r4 = run(h, 1.0);
  CHECK(rms(r4, 24000, 48000) > 0.02, "arp latch: keeps running after release");
  ui.setStr("hold", "off"); auto r5 = run(h, 1.0);
  CHECK(rms(r5, r5.size() - 4800, r5.size()) < 1e-4, "arp latch off: stops");
  ui.setStr("arpOn", "off");
  // ---- limiter ----
  ui.setNum("res", 18); ui.setNum("filterDrive", 1); ui.setNum("volume", 1); ui.setNum("osc3Level", 1); ui.setNum("noise", 1); ui.setNum("revMix", 1);
  ui.keyDown(36, 1);
  auto f = run(h, 1); double pk = 0; for (float v : f) pk = std::fmax(pk, std::fabs(v));
  CHECK(pk <= 1.0, "output never clips (peak %.3f)", pk);
  // ---- queue flood ----
  for (int i = 0; i < 3000; i++) ui.setNum("cutoff", 1000 + i);
  run(h, 0.1);
  CHECK(true, "queue overflow is safe");
  std::printf(fails ? "\n%d FAILED\n" : "\nall passed\n", fails);
  return fails;
}
