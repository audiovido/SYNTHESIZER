// Renders a Web Audio "scene" script with native/wa (the C++ Web Audio engine).
// The same script runs in Chromium's OfflineAudioContext (wa_scene.mjs); the two
// outputs are compared sample by sample.
//
//   g++ -O2 -std=c++17 native/tests/wa_scene.cpp -o /tmp/wa_scene
//   /tmp/wa_scene scene.txt out.f32        (interleaved stereo float32)
//
// Script lines (whitespace separated; '#' comments):
//   rate <hz>            len <seconds>          at <seconds>   (later lines run at that time)
//   node <id> gain | biquad <type> | delay <max> | shaper <drive k|tanh|softclip|none> <none|2x|4x>
//        | comp | panner | osc <sine|square|sawtooth|triangle> | noise <seed> | merger <n>
//        | iir <b0> <b1>.. / <a0> <a1>.. | feed <noise|tone|burst|chord> <seed/hz> <amp> | pass
//   connect <from> <to> [input]      connectp <from> <to> <param>     out <id>
//   set <id> <param> <v>             ev <id> <param> <method> <args...>
//   start <id> <t> [offset]          stop <id> <t>        loop <id>
#include <cstdio>
#include <fstream>
#include <map>
#include <sstream>
#include <string>

#include "../wa/wa.hpp"
#include "wa_signals.hpp"

using namespace wa;

static Param* param(Node* n, const std::string& p) {
  if (auto g = dynamic_cast<Gain*>(n)) if (p == "gain") return &g->gain;
  if (auto b = dynamic_cast<Biquad*>(n)) {
    if (p == "frequency") return &b->frequency;
    if (p == "Q") return &b->Q;
    if (p == "gain") return &b->gain;
    if (p == "detune") return &b->detune;
  }
  if (auto d = dynamic_cast<Delay*>(n)) if (p == "delayTime") return &d->delayTime;
  if (auto c = dynamic_cast<Compressor*>(n)) {
    if (p == "threshold") return &c->threshold;
    if (p == "knee") return &c->knee;
    if (p == "ratio") return &c->ratio;
    if (p == "attack") return &c->attack;
    if (p == "release") return &c->release;
  }
  if (auto s = dynamic_cast<StereoPanner*>(n)) if (p == "pan") return &s->pan;
  if (auto o = dynamic_cast<Oscillator*>(n)) {
    if (p == "frequency") return &o->frequency;
    if (p == "detune") return &o->detune;
  }
  if (auto b = dynamic_cast<BufferSource*>(n)) {
    if (p == "playbackRate") return &b->playbackRate;
    if (p == "detune") return &b->detune;
  }
  std::fprintf(stderr, "unknown param %s\n", p.c_str());
  std::exit(1);
}

int main(int argc, char** argv) {
  if (argc < 3) return 1;
  std::ifstream f(argv[1]);
  std::vector<std::vector<std::string>> lines;
  std::string line;
  double sr = 48000, len = 1;
  while (std::getline(f, line)) {
    const auto h = line.find('#');
    if (h != std::string::npos) line = line.substr(0, h);
    std::istringstream is(line);
    std::vector<std::string> t;
    std::string w;
    while (is >> w) t.push_back(w);
    if (t.empty()) continue;
    if (t[0] == "rate") sr = std::stod(t[1]);
    else if (t[0] == "len") len = std::stod(t[1]);
    else lines.push_back(t);
  }
  Graph g(sr);
  std::map<std::string, Node*> nodes;
  Node* outNode = nullptr;
  const size_t total = static_cast<size_t>(len * sr);
  auto noiseBuf = [&](uint32_t seed) {
    auto v = std::make_shared<std::vector<float>>(static_cast<size_t>(sr * 2));
    sig::Rng r(seed);
    for (auto& x : *v) x = static_cast<float>(r.next() * 2 - 1);
    return v;
  };
  auto exec = [&](const std::vector<std::string>& t) {
    const std::string& op = t[0];
    auto N = [&](size_t i) { return nodes.at(t[i]); };
    auto D = [&](size_t i) { return std::stod(t[i]); };
    if (op == "node") {
      const std::string& id = t[1];
      const std::string& ty = t[2];
      Node* n = nullptr;
      if (ty == "gain") n = g.make<Gain>();
      else if (ty == "pass") n = g.make<Passthrough>();
      else if (ty == "biquad") {
        static const std::map<std::string, Biquad::Type> T = {{"lowpass", Biquad::Lowpass}, {"highpass", Biquad::Highpass},
          {"bandpass", Biquad::Bandpass}, {"lowshelf", Biquad::Lowshelf}, {"highshelf", Biquad::Highshelf},
          {"peaking", Biquad::Peaking}, {"notch", Biquad::Notch}, {"allpass", Biquad::Allpass}};
        n = g.make<Biquad>(T.at(t[3]));
      } else if (ty == "delay") n = g.make<Delay>(D(3));
      else if (ty == "shaper") {
        auto* s = g.make<WaveShaper>();
        size_t i = 3;
        if (t[i] == "drive") { s->setCurve(sig::driveCurve(D(i + 1))); i += 2; }
        else if (t[i] == "tanh") { s->setCurve(sig::tanhCurve()); i++; }
        else if (t[i] == "softclip") { s->setCurve(sig::softClipCurve()); i++; }
        else i++;
        s->setOversample(t[i] == "2x" ? WaveShaper::X2 : t[i] == "4x" ? WaveShaper::X4 : WaveShaper::None);
        n = s;
      } else if (ty == "comp") n = g.make<Compressor>();
      else if (ty == "panner") n = g.make<StereoPanner>();
      else if (ty == "osc") {
        static const std::map<std::string, PeriodicWave::Shape> S = {{"sine", PeriodicWave::Sine}, {"square", PeriodicWave::Square},
          {"sawtooth", PeriodicWave::Sawtooth}, {"triangle", PeriodicWave::Triangle}};
        n = g.make<Oscillator>(S.at(t[3]));
      } else if (ty == "noise") {
        auto* b = g.make<BufferSource>();
        b->setBuffer(noiseBuf(static_cast<uint32_t>(D(3))), sr);
        n = b;
      } else if (ty == "merger") n = g.make<Merger>(static_cast<int>(D(3)));
      else if (ty == "iir") {
        std::vector<double> ff, fb;
        bool slash = false;
        for (size_t i = 3; i < t.size(); i++) {
          if (t[i] == "/") { slash = true; continue; }
          (slash ? fb : ff).push_back(std::stod(t[i]));
        }
        n = g.make<IIR>(ff, fb);
      } else if (ty == "feed") n = g.make<Feed>(sig::feed(t[3], D(4), D(5), total, sr));
      else { std::fprintf(stderr, "unknown node %s\n", ty.c_str()); std::exit(1); }
      nodes[id] = n;
    } else if (op == "connect") { N(1)->connect(N(2), t.size() > 3 ? std::stoi(t[3]) : 0); g.changed(); }
    else if (op == "connectp") { N(1)->connect(param(N(2), t[3])); g.changed(); }
    else if (op == "out") outNode = N(1);
    else if (op == "set") param(N(1), t[2])->setValue(static_cast<float>(D(3)));
    else if (op == "ev") {
      Param* p = param(N(1), t[2]);
      const std::string& m = t[3];
      if (m == "setValueAtTime") p->setValueAtTime(static_cast<float>(D(4)), D(5));
      else if (m == "linearRampToValueAtTime") p->linearRampToValueAtTime(static_cast<float>(D(4)), D(5));
      else if (m == "exponentialRampToValueAtTime") p->exponentialRampToValueAtTime(static_cast<float>(D(4)), D(5));
      else if (m == "setTargetAtTime") p->setTargetAtTime(static_cast<float>(D(4)), D(5), D(6));
      else if (m == "cancelScheduledValues") p->cancelScheduledValues(D(4));
    } else if (op == "start") {
      if (auto b = dynamic_cast<BufferSource*>(N(1))) b->start(D(2), t.size() > 3 ? D(3) : 0);
      else dynamic_cast<Source*>(N(1))->start(D(2));
    } else if (op == "stop") dynamic_cast<Source*>(N(1))->stop(D(2));
    else if (op == "loop") dynamic_cast<BufferSource*>(N(1))->loop = true;
  };
  // split into time blocks
  std::vector<std::pair<double, std::vector<std::vector<std::string>>>> blocks{{0.0, {}}};
  for (auto& t : lines) {
    if (t[0] == "at") blocks.push_back({std::stod(t[1]), {}});
    else blocks.back().second.push_back(t);
  }
  size_t bi = 0;
  std::vector<float> outBuf;
  outBuf.reserve(total * 2);
  float L[RQ], R[RQ];
  for (size_t fr = 0; fr < total; fr += RQ) {
    while (bi < blocks.size() && blocks[bi].first * sr <= fr + 0.5) {
      for (auto& t : blocks[bi].second) exec(t);
      bi++;
    }
    g.render(outNode, L, R);
    for (int k = 0; k < RQ && fr + k < total; k++) { outBuf.push_back(L[k]); outBuf.push_back(R[k]); }
  }
  FILE* o = std::fopen(argv[2], "wb");
  std::fwrite(outBuf.data(), sizeof(float), outBuf.size(), o);
  std::fclose(o);
  return 0;
}
