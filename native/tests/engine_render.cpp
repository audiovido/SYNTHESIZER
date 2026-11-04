// Render a scene with the web app's whole engine (native/js/dist/engine.js) in QuickJS on native/wa.
//   engine_render <rate> <seconds> <scene.js> out.f32
// The scene runs with S = the engine API and at(seconds, fn) = run fn at that time.
#include <cstdio>
#include <fstream>
#include <sstream>

#include "../host/wajs.hpp"

static std::string slurp(const char* p) { std::ifstream f(p); std::stringstream s; s << f.rdbuf(); return s.str(); }

int main(int argc, char** argv) {
  if (argc < 5) return 1;
  const double sr = std::stod(argv[1]), len = std::stod(argv[2]);
  sy1::WaJs js(sr);
  for (const char* f : {"native/js/wa-shim.js", "native/js/dist/engine.js"}) {
    const std::string e = js.eval(slurp(f), f);
    if (!e.empty()) { std::fprintf(stderr, "%s: %s\n", f, e.c_str()); return 1; }
  }
  const std::string pre =
      "globalThis.__ctx = __makeCtx(); const S = SY1E; globalThis.__now = () => __wa.time();"
      "const __scene = []; const at = (t, fn) => __scene.push([t, fn]);"
      "{ const rt = globalThis.__runTimers; globalThis.__runTimers = () => { rt(); const t = __wa.time(), q = 128 / __wa.sampleRate;"
      "  for (const p of __scene) if (Math.abs(p[0] - t) < q / 4) { try { p[1](); } catch (e) { console.log('scene error', e, e.stack); } } }; }";
  std::string e = js.eval(pre + "\n" + slurp(argv[3]), argv[3]);
  if (!e.empty()) { std::fprintf(stderr, "scene: %s\n", e.c_str()); return 1; }
  const size_t total = static_cast<size_t>(len * sr);
  std::vector<float> out;
  float L[wa::RQ], R[wa::RQ];
  for (size_t fr = 0; fr < total; fr += wa::RQ) {
    js.render(L, R);
    for (int k = 0; k < wa::RQ && fr + k < total; k++) { out.push_back(L[k]); out.push_back(R[k]); }
  }
  FILE* o = std::fopen(argv[4], "wb");
  std::fwrite(out.data(), sizeof(float), out.size(), o);
  std::fclose(o);
}
