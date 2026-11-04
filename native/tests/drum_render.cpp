// Render a drum scene with the web drum code running in QuickJS on native/wa.
//   drum_render <rate> <seconds> <scene.js> out.f32
#include <cstdio>
#include <fstream>
#include <sstream>

#include "../host/wajs.hpp"

static std::string slurp(const char* p) { std::ifstream f(p); std::stringstream s; s << f.rdbuf(); return s.str(); }

int main(int argc, char** argv) {
  if (argc < 5) return 1;
  const double sr = std::stod(argv[1]), len = std::stod(argv[2]);
  sy1::WaJs js(sr);
  for (const char* f : {"native/js/wa-shim.js", "native/js/dist/drums.js"}) {
    const std::string e = js.eval(slurp(f), f);
    if (!e.empty()) { std::fprintf(stderr, "%s: %s\n", f, e.c_str()); return 1; }
  }
  std::string e = js.eval("globalThis.__ctx = __makeCtx();");
  e += js.eval(slurp(argv[3]), argv[3]);
  if (!e.empty()) { std::fprintf(stderr, "scene: %s\n", e.c_str()); return 1; }
  const size_t total = static_cast<size_t>(len * sr);
  std::vector<float> out;
  float L[wa::RQ], R[wa::RQ];
  for (size_t fr = 0; fr < total; fr += wa::RQ) {
    js.render(L, R);
    for (int k = 0; k < wa::RQ && fr + k < total; k++) { out.push_back(L[k]); out.push_back(R[k]); }
  }
  std::fprintf(stderr, "live nodes at end: %zu\n", js.liveNodes());
  FILE* o = std::fopen(argv[4], "wb");
  std::fwrite(out.data(), sizeof(float), out.size(), o);
  std::fclose(o);
}
