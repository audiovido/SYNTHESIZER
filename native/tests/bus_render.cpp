// Render the native FX bus (native/dsp/bus.hpp) for bus_parity.mjs.
//   bus_render <rate> <seconds> <feed kind> <feed param> <amp> <mainFx 0|1> <send gain>
//              <k=v,k=v...> [t:key=value ...] out.f32
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>

#include "../dsp/bus.hpp"
#include "wa_signals.hpp"

int main(int argc, char** argv) {
  if (argc < 10) return 1;
  const double sr = std::stod(argv[1]), len = std::stod(argv[2]);
  const size_t total = static_cast<size_t>(len * sr);
  wa::Graph g(sr);
  sy1::FxBus::Patch p;
  std::map<std::string, double*> keys = {{"drive", &p.drive}, {"eqLow", &p.eqLow}, {"eqMid", &p.eqMid}, {"eqHigh", &p.eqHigh},
    {"delayTime", &p.delayTime}, {"delayFb", &p.delayFb}, {"delayMix", &p.delayMix}, {"chorusRate", &p.chorusRate},
    {"chorusDepth", &p.chorusDepth}, {"chorusMix", &p.chorusMix}, {"revSize", &p.revSize}, {"revMix", &p.revMix}, {"volume", &p.volume}};
  std::stringstream ps(argv[8]);
  std::string kv;
  while (std::getline(ps, kv, ',')) {
    const auto e = kv.find('=');
    if (e != std::string::npos) *keys.at(kv.substr(0, e)) = std::stod(kv.substr(e + 1));
  }
  if (const char* m = std::getenv("AP_ORDER")) sy1::FxBus::apOrderMask_ = std::atoi(m);
  sy1::FxBus bus(g, p, std::stoi(argv[6]) != 0);
  auto* feed = g.make<wa::Feed>(sig::feed(argv[3], std::stod(argv[4]), std::stod(argv[5]), total, sr));
  feed->connect(bus.input);
  const double send = std::stod(argv[7]);
  if (send > 0) {
    auto* sg = g.make<wa::Gain>();
    sg->gain.setValue(static_cast<float>(send));
    feed->connect(sg);
    sg->connect(bus.sendIn);
  }
  struct Ev { double t; std::string key; double v; };
  std::vector<Ev> evs;
  for (int i = 9; i < argc - 1; i++) {
    std::string s = argv[i];
    const auto c = s.find(':'), e = s.find('=');
    evs.push_back({std::stod(s.substr(0, c)), s.substr(c + 1, e - c - 1), std::stod(s.substr(e + 1))});
  }
  std::vector<float> out;
  float L[wa::RQ], R[wa::RQ];
  size_t ei = 0;
  for (size_t fr = 0; fr < total; fr += wa::RQ) {
    while (ei < evs.size() && evs[ei].t * sr <= fr + 0.5) {
      if (evs[ei].key == "mainFx") bus.setMainToFx(evs[ei].v != 0);
      else if (evs[ei].key == "master") bus.setMasterVolume(evs[ei].v);
      else bus.setParam(evs[ei].key, evs[ei].v);
      ei++;
    }
    g.render(bus.output, L, R);
    for (int k = 0; k < wa::RQ && fr + k < total; k++) { out.push_back(L[k]); out.push_back(R[k]); }
  }
  FILE* o = std::fopen(argv[argc - 1], "wb");
  std::fwrite(out.data(), sizeof(float), out.size(), o);
  std::fclose(o);
}
