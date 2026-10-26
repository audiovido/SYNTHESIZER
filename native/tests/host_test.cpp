// Tests the mono/legato logic and command queue: g++ -O2 -std=c++17 native/tests/host_test.cpp -o ht && ./ht
#include "../dsp/tabriz_host.hpp"
#include <cstdio>
using namespace sy1;
static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { std::printf("FAIL: %s\n", msg); fails++; } else std::printf("ok:   %s\n", msg); } while (0)

// zero-crossing frequency of a buffer
static double freq(const std::vector<float>& x, double sr) {
  int c = 0; double first = -1, last = -1;
  for (size_t i = 1; i < x.size(); i++) if (x[i - 1] < 0 && x[i] >= 0) { double t = i - 1 + -x[i - 1] / (x[i] - x[i - 1]); if (first < 0) first = t; else { last = t; c++; } }
  return c ? c * sr / (last - first) : 0;
}
static std::vector<float> run(TabrizHost& h, double seconds, double sr) {
  std::vector<float> out(size_t(seconds * sr));
  for (size_t p = 0; p < out.size(); p += 256) h.render(out.data() + p, nullptr, int(std::min<size_t>(256, out.size() - p)));
  return out;
}
int main() {
  const double SR = 48000;
  TabrizHost h(SR);
  MonoController mc(h.queue);
  mc.setNum("drift", 0); mc.setNum("cutoff", 18000); mc.setNum("res", 0.1); mc.setNum("envAmt", 0);
  mc.setStr("osc1Wave", "sine"); mc.setNum("oscMix", 0); mc.setNum("sub", 0); mc.setNum("filterDrive", 0);
  mc.setNum("keyTrack", 0); mc.setNum("aS", 1); mc.setNum("aA", 0.002); mc.setNum("glide", 0.05); mc.setStr("legato", "on");
  h.drain(); h.snap();

  mc.noteDown(57, 1);                       // A3
  auto a = run(h, 0.5, SR);
  CHECK(std::fabs(freq(std::vector<float>(a.begin() + 12000, a.end()), SR) - 220) < 0.5, "first note A3 = 220 Hz");
  mc.noteDown(64, 1);                       // E4, legato glide
  auto b = run(h, 0.5, SR);
  CHECK(std::fabs(freq(std::vector<float>(b.begin() + 12000, b.end()), SR) - midiHz(64)) < 0.5, "legato glide reaches E4");
  CHECK(mc.current() == 64, "last-note priority");
  mc.noteUp(64);                            // falls back to the held A3
  auto c = run(h, 0.5, SR);
  CHECK(std::fabs(freq(std::vector<float>(c.begin() + 12000, c.end()), SR) - 220) < 0.5, "release top note returns to held A3");
  mc.noteUp(57);
  auto d = run(h, 2.0, SR);
  double tail = 0; for (size_t i = d.size() - 4800; i < d.size(); i++) tail = std::max(tail, (double)std::fabs(d[i]));
  CHECK(tail < 1e-4, "silence after releasing all keys");
  mc.noteUp(50);                            // releasing a key never pressed is harmless
  // retrigger mode
  mc.setStr("legato", "off");
  mc.noteDown(60, 1); run(h, 0.2, SR); mc.noteDown(62, 1);
  auto e = run(h, 0.5, SR);
  CHECK(std::fabs(freq(std::vector<float>(e.begin() + 12000, e.end()), SR) - midiHz(62)) < 0.5, "retrigger mode plays new note");
  mc.allOff(); run(h, 2, SR);
  // queue flood: 2000 commands without draining must not crash (excess is dropped)
  for (int i = 0; i < 2000; i++) mc.setNum("cutoff", 1000 + i);
  run(h, 0.1, SR);
  CHECK(true, "queue overflow is safe");
  // limiter: worst case stays below 1.0
  mc.setNum("res", 18); mc.setNum("filterDrive", 1); mc.setNum("volume", 1); mc.setNum("osc3Level", 1); mc.setNum("noise", 1);
  mc.noteDown(36, 1);
  auto f = run(h, 1, SR); double pk = 0; for (float v : f) pk = std::max(pk, (double)std::fabs(v));
  CHECK(pk < 1.0, "output never clips (soft limiter)");
  std::printf(fails ? "\n%d FAILED\n" : "\nall passed\n", fails);
  return fails;
}
