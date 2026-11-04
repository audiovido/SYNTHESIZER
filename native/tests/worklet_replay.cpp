// Replay the engine calls written by worklet_replay.mts (<out.f32>.calls) into a native engine.
//   worklet_replay <processor name> <calls file> <seconds> out.f32
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "../dsp/fm.hpp"
#include "../dsp/strings.hpp"
#include "../dsp/vector.hpp"

int main(int argc, char** argv) {
  if (argc < 5) return 1;
  const std::string proc = argv[1];
  wa::Graph g(48000);
  sy1::WorkletNode* w = nullptr;
  if (proc == "sy1-strings") w = g.make<sy1::StringsWorklet>();
  else if (proc == "sy1-vector") w = g.make<sy1::VectorWorklet>();
  else w = g.make<sy1::FmWorklet>();
  struct Call { double t; std::vector<std::string> f; };
  std::vector<Call> calls;
  std::ifstream in(argv[2]);
  std::string line;
  while (std::getline(in, line)) {
    std::vector<std::string> f;
    std::stringstream ss(line);
    std::string x;
    while (std::getline(ss, x, '\t')) f.push_back(x);
    if (f.size() >= 2) calls.push_back({std::stod(f[1]), f});
  }
  const size_t N = static_cast<size_t>(std::stod(argv[3]) * 48000);
  std::vector<float> L, Rr;
  size_t ci = 0;
  float l[wa::RQ], r[wa::RQ];
  for (size_t fr = 0; fr < N; fr += wa::RQ) {
    const double t = fr / 48000.0;
    while (ci < calls.size() && calls[ci].t <= t + 1e-9) {
      const auto& f = calls[ci].f;
      if (f[0] == "P") { if (f[3] == "s") w->param(f[2], f.size() > 4 ? f[4] : std::string()); else w->param(f[2], std::stod(f[4])); }
      else if (f[0] == "S") w->snap();
      else if (f[0] == "W") { std::vector<double> p; for (size_t k = 2; k < f.size(); k++) p.push_back(std::stod(f[k])); w->path(p); }
      else if (f[0] == "M") w->message(f[2], std::stoi(f[3]), std::stod(f[4]), std::stod(f[5]), std::stod(f[6]), std::stod(f[7]), std::stod(f[8]), std::stod(f[9]), std::stod(f[10]));
      ci++;
    }
    g.render(w, l, r);
    for (int k = 0; k < wa::RQ; k++) { L.push_back(l[k]); Rr.push_back(r[k]); }
  }
  L.resize(N);
  Rr.resize(N);
  FILE* o = std::fopen(argv[4], "wb");
  std::fwrite(L.data(), 4, L.size(), o);
  std::fwrite(Rr.data(), 4, Rr.size(), o);
  std::fclose(o);
}
