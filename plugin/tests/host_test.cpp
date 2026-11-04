// Host simulation: the real plugin processor driven like a DAW drives it (play head, MIDI, odd
// block sizes, loops, a fractional tempo), checking that everything lands on the DAW's grid.
//   cmake -B build -DSY1_TESTS=ON && cmake --build build --target SY1HostTest
#include "PluginProcessor.h"
#include <cstdio>
#include <thread>

struct FakeHead : juce::AudioPlayHead {
  double bpm = 120, ppq = 0, loopStart = 0, loopEnd = 0;
  bool playing = false, looping = false;
  juce::Optional<PositionInfo> getPosition() const override {
    PositionInfo p;
    p.setBpm(bpm);
    p.setIsPlaying(playing);
    p.setPpqPosition(ppq);
    p.setIsLooping(looping);
    if (looping) p.setLoopPoints(LoopPoints{loopStart, loopEnd});
    return p;
  }
};

static int failures = 0;
static void check(bool ok, const char* what) {
  std::printf("  %s  %s\n", ok ? "ok  " : "FAIL", what);
  if (!ok) failures++;
}

struct Run {
  SY1Processor p;
  FakeHead head;
  double sr = 48000;
  int64_t pos = 0;
  std::vector<std::pair<int64_t, juce::MidiMessage>> out;  // MIDI the plugin sent to the DAW
  explicit Run(const char* machine, double rate = 48000) : sr(rate) {
    p.setPlayHead(&head);
    p.setRateAndBufferSizeDetails(sr, 512);
    p.prepareToPlay(sr, 512);
    p.engine().post("setMachine", std::string("[\"") + machine + "\"]");
    p.engine().js()->eval(
        "globalThis.__log = []; { const oc = SY1E.call; SY1E.call = (n, a) => {"
        " const t = __wa.time() + (globalThis.__evOffset || 0);"
        " if (n === 'hostStep') __log.push([1, a[0], t + a[1]]); else if (n === 'noteOn' || n === 'midiNoteOn') __log.push([2, a[0], t]);"
        " return oc(n, a); }; }");
  }
  /** Render `samples` in DAW blocks of `block`, the play head advancing (and looping). */
  double render(int64_t samples, int block, const std::vector<std::pair<int64_t, juce::MidiMessage>>& midi = {}) {
    juce::AudioBuffer<float> buf(2, block);
    double peak = 0;
    for (int64_t done = 0; done < samples; done += block) {
      juce::MidiBuffer mb;
      for (auto& e : midi)
        if (e.first >= pos && e.first < pos + block) mb.addEvent(e.second, static_cast<int>(e.first - pos));
      buf.clear();
      p.processBlock(buf, mb);
      for (const auto meta : mb) out.push_back({pos + meta.samplePosition, meta.getMessage()});
      for (int i = 0; i < block; i++) peak = std::max(peak, static_cast<double>(std::fabs(buf.getSample(0, i))));
      pos += block;
      if (head.playing) {
        head.ppq += block / sr * head.bpm / 60.0;
        if (head.looping && head.ppq >= head.loopEnd) head.ppq = head.loopStart + (head.ppq - head.loopEnd);
      }
    }
    return peak;
  }
  juce::var log() { return juce::JSON::parse(juce::String(p.engine().js()->evalString("JSON.stringify(__log.splice(0))"))); }
  /** engine time -> the DAW sample where the DAW records it (after its 128-sample compensation) */
  double dawSample(double t) const { return t * sr - wa::RQ; }
};

int main() {
  juce::ScopedJuceInitialiser_GUI init;

  std::printf("1. Drum machine from the song start, 120 BPM, DAW blocks of 512\n");
  {
    Run r("kerman");
    r.render(4608, 512);  // stopped for a moment
    const int64_t start = r.pos;
    r.head.playing = true;
    r.head.ppq = 0;
    const double peak = r.render(48000 * 4, 512);
    auto log = r.log();
    int steps = 0;
    double worst = 0;
    int64_t prevK = -1;
    bool consecutive = true;
    for (auto& e : *log.getArray()) {
      if (static_cast<int>(e[0]) != 1) continue;
      const int64_t k = static_cast<int64_t>(static_cast<double>(e[1]));
      const double expect = start + k / 4.0 * 60 / 120 * r.sr;
      worst = std::max(worst, std::fabs(r.dawSample(static_cast<double>(e[2])) - expect));
      if (prevK >= 0 && k != prevK + 1) consecutive = false;
      prevK = k;
      steps++;
    }
    std::printf("     %d steps, worst timing error %.2f samples, peak %.3f\n", steps, worst, peak);
    check(steps >= 31 && steps <= 33, "every 16th of 4 s at 120 BPM (32) is played once");
    check(consecutive, "no 16th skipped or doubled");
    check(worst <= 1.0, "each step on the DAW's grid (within 1 sample)");
    check(peak > 0.05, "drums sound");
  }

  std::printf("2. Play pressed in the middle of bar 3 (ppq 9.37), odd DAW block size 441\n");
  {
    Run r("bushehr");
    const int64_t start = r.pos;
    r.head.playing = true;
    r.head.ppq = 9.37;
    r.render(48000 * 2, 441);
    auto log = r.log();
    double worst = 0;
    int64_t firstK = -1;
    for (auto& e : *log.getArray()) {
      if (static_cast<int>(e[0]) != 1) continue;
      const int64_t k = static_cast<int64_t>(static_cast<double>(e[1]));
      if (firstK < 0) firstK = k;
      const double expect = start + (k / 4.0 - 9.37) * 60 / 120 * r.sr;
      worst = std::max(worst, std::fabs(r.dawSample(static_cast<double>(e[2])) - expect));
    }
    std::printf("     first 16th %lld (expected 38), worst error %.2f samples\n", static_cast<long long>(firstK), worst);
    check(firstK == 38, "first step is the DAW's next 16th, at its place in the bar");
    check(worst <= 1.0, "on the grid with odd block sizes");
  }

  std::printf("3. DAW loop over one bar (ppq 4..8), 101.37 BPM, blocks of 256\n");
  {
    Run r("kerman");
    r.head.bpm = 101.37;
    r.head.playing = true;
    r.head.looping = true;
    r.head.loopStart = 4;
    r.head.loopEnd = 8;
    r.head.ppq = 4;
    r.render(48000 * 6, 256);
    auto log = r.log();
    std::vector<std::pair<int64_t, double>> st;
    for (auto& e : *log.getArray())
      if (static_cast<int>(e[0]) == 1) st.push_back({static_cast<int64_t>(static_cast<double>(e[1])), r.dawSample(static_cast<double>(e[2]))});
    const double stepS = 60 / 101.37 / 4 * r.sr;
    double worstGap = 0;
    bool kOk = true;
    int wraps = 0;
    for (size_t i = 1; i < st.size(); i++) {
      worstGap = std::max(worstGap, std::fabs(st[i].second - st[i - 1].second - stepS));
      if (st[i].first < st[i - 1].first) {
        wraps++;
        if (st[i].first != 16) kOk = false;
      } else if (st[i].first != st[i - 1].first + 1) {
        kOk = false;
      }
    }
    std::printf("     %zu steps, %d loop wraps, worst spacing error %.2f samples\n", st.size(), wraps, worstGap);
    check(wraps >= 2, "the pattern follows the DAW loop");
    check(kOk, "after each wrap it continues at the loop start (16th 16), nothing doubled");
    check(worstGap <= 1.5, "even spacing across the loop point");
  }

  std::printf("4. Synth notes land on their exact samples (blocks of 512)\n");
  {
    Run r("sy1");
    std::vector<std::pair<int64_t, juce::MidiMessage>> midi;
    const int64_t at[] = {1000, 1300, 5555, 9001, 20000};
    for (int64_t a : at) {
      midi.push_back({a, juce::MidiMessage::noteOn(1, 60, 0.8f)});
      midi.push_back({a + 200, juce::MidiMessage::noteOff(1, 60)});
    }
    const double peak = r.render(48000, 512, midi);
    auto log = r.log();
    double worst = 0;
    int n = 0;
    for (auto& e : *log.getArray())
      if (static_cast<int>(e[0]) == 2 && n < 5) { worst = std::max(worst, std::fabs(r.dawSample(static_cast<double>(e[2])) - at[n])); n++; }
    std::printf("     %d notes, worst error %.2f samples, peak %.3f\n", n, worst, peak);
    check(n == 5 && worst <= 0.5, "each note at its own sample (the DAW compensates the reported 128)");
    check(peak > 0.05, "synth sounds");
  }

  std::printf("5. The DAW's tempo is the tempo (fractional; the window's controls do nothing)\n");
  {
    Run r("sy1");
    r.head.bpm = 93.5;
    r.head.playing = true;
    r.render(4096, 512);
    r.p.engine().post("setTempo", "[140]");
    r.render(4096, 512);
    const std::string t = r.p.engine().js()->evalString("String(SY1E.getTempo())");
    std::printf("     engine tempo %s\n", t.c_str());
    check(t == "93.5", "93.5 exactly, and the window cannot change it");
  }

  std::printf("6. Count-in (negative song position) plays nothing\n");
  {
    Run r("kerman");
    r.head.playing = true;
    r.head.ppq = -2;
    r.render(48000 / 2, 512);
    int steps = 0;
    auto log = r.log();
    for (auto& e : *log.getArray()) if (static_cast<int>(e[0]) == 1) steps++;
    check(steps == 0, "no drum steps before the song start");
  }

  std::printf("7. State: saved during play from another thread, loaded into a new instance\n");
  {
    Run r("baku");
    r.render(4096, 512);
    r.p.engine().post("setSynthParam", "[\"cutoff\", 777]");
    r.render(1024, 512);
    juce::MemoryBlock mb;
    std::thread saver([&] { r.p.getStateInformation(mb); });
    r.render(48000 / 4, 512);
    saver.join();
    Run r2("sy1");
    r2.p.setStateInformation(mb.getData(), static_cast<int>(mb.getSize()));
    r2.render(4096, 512);
    const std::string m = r2.p.engine().js()->evalString("SY1E.getMachine().id + ' ' + SY1E.getSynthPatch().cutoff");
    std::printf("     restored: %s\n", m.c_str());
    check(m == "baku 777", "machine and the knob turned right before saving come back");
  }

  std::printf("8. SYNC off: the app's own tempo and Play button, the DAW's Play ignored; SYNC on again\n");
  {
    Run r("kerman");
    r.head.bpm = 79;
    r.render(4096, 512);
    r.p.engine().post("setSync", "[false]");
    r.p.engine().post("setTempo", "[98]");
    r.head.playing = true;
    r.head.ppq = 0;
    r.render(48000, 512);
    auto js = [&](const char* e) { return r.p.engine().js()->evalString(e); };
    const std::string tFree = js("String(SY1E.getTempo())");
    const std::string playFree = js("String(SY1E.drums.isDrumPlaying())");
    int hostSteps = 0;
    auto log = r.log();
    for (auto& e : *log.getArray()) if (static_cast<int>(e[0]) == 1) hostSteps++;
    std::printf("     free: tempo %s, drums playing %s (DAW plays; %d DAW steps arrived)\n", tFree.c_str(), playFree.c_str(), hostSteps);
    check(tFree == "98", "own tempo 98 while the DAW is at 79");
    check(playFree == "false", "the DAW's Play does not start the pattern");
    r.p.engine().post("startDrums", "[]");
    const double peak = r.render(48000, 512);
    const std::string playOwn = js("String(SY1E.drums.isDrumPlaying())");
    std::printf("     own Play: drums playing %s, peak %.3f\n", playOwn.c_str(), peak);
    check(playOwn == "true" && peak > 0.05, "the app's own Play works while the DAW plays");
    r.p.engine().post("setSync", "[true]");
    r.render(48000 / 2, 512);
    const std::string tSync = js("String(SY1E.getTempo())");
    const std::string playSync = js("String(SY1E.drums.isDrumPlaying())");
    std::printf("     SYNC on: tempo %s, drums playing %s\n", tSync.c_str(), playSync.c_str());
    check(tSync == "79" && playSync == "true", "SYNC on: back to the DAW's tempo, the DAW runs the pattern");
    r.head.playing = false;
    r.render(4096, 512);
    check(js("String(SY1E.drums.isDrumPlaying())") == "false", "DAW Stop stops it");
  }

  std::printf("9. Project reload: the restored engine gets the DAW's tempo again; SYNC is saved\n");
  {
    Run r("kerman");
    r.head.bpm = 79;
    r.head.playing = true;
    r.render(4096, 512);
    r.p.engine().post("applyDrumStyle", "[\"boombap\"]");  // a style with its own tempo (90)
    r.render(4096, 512);
    juce::MemoryBlock mb;
    std::thread saver0([&] { r.p.getStateInformation(mb); });
    r.render(48000 / 4, 512);
    saver0.join();
    r.p.setStateInformation(mb.getData(), static_cast<int>(mb.getSize()));  // same instance (Ableton reload)
    r.render(4096, 512);
    const std::string t = r.p.engine().js()->evalString("String(SY1E.getTempo()) + ' ' + SY1E.drums.isDrumPlaying()");
    std::printf("     after reload: tempo, playing = %s\n", t.c_str());
    check(t == "79 true", "79 BPM from the DAW (not the style's 90), pattern on the DAW's Play");
    r.p.engine().post("setSync", "[false]");
    r.render(4096, 512);
    juce::MemoryBlock mb2;
    std::thread saver([&] { r.p.getStateInformation(mb2); });  // the newest state comes from the audio thread
    r.render(48000 / 4, 512);
    saver.join();
    Run r2("sy1");
    r2.head.bpm = 79;
    r2.p.setStateInformation(mb2.getData(), static_cast<int>(mb2.getSize()));
    r2.render(4096, 512);
    const std::string s2 = r2.p.engine().js()->evalString("String(SY1E.getSync()) + ' ' + SY1E.getTempo()");
    std::printf("     new instance: sync, tempo = %s\n", s2.c_str());
    check(s2 == "false 90", "SYNC off comes back with the project, with the app's own tempo");
  }

  std::printf("10. MIDI Learn from the DAW: a CC and a DAW macro, pickup, saved with the project\n");
  {
    Run r("sy1");
    auto js = [&](const char* e) { return r.p.engine().js()->evalString(e); };
    r.render(2048, 512);
    r.p.engine().post("setLearnMode", "[true]");
    r.p.engine().post("selectLearnParam", "[\"cutoff\"]");
    r.render(1024, 512);
    r.render(1024, 512, {{r.pos + 100, juce::MidiMessage::controllerEvent(1, 74, 10)}});
    r.render(1024, 512, {{r.pos + 100, juce::MidiMessage::controllerEvent(1, 74, 127)}});
    const std::string c = js("String(Math.round(SY1E.getSynthPatch().cutoff))");
    std::printf("     CC 74 learned -> cutoff %s at value 127\n", c.c_str());
    check(c == "18000", "a DAW CC moves the learned knob");
    r.p.engine().post("selectLearnParam", "[\"res\"]");
    r.render(1024, 512);
    auto* macro3 = r.p.getParameters()[2];
    macro3->setValueNotifyingHost(0.25f);
    r.render(1024, 512);
    macro3->setValueNotifyingHost(1.0f);
    r.render(1024, 512);
    r.p.engine().post("setLearnMode", "[false]");
    const std::string res = js("String(SY1E.getSynthPatch().res)");
    const std::string map = js("localStorage.getItem('musicher_synth_midi_map')");
    std::printf("     Macro 3 learned -> res %s; map %s\n", res.c_str(), map.c_str());
    check(res == "18" && map.find("\"74\":\"cutoff\"") != std::string::npos && map.find("\"130\":\"res\"") != std::string::npos,
          "a DAW automation macro moves its knob; both mappings stored");
    r.p.engine().post("setMidiPickup", "[true]");
    r.p.engine().post("setSynthParam", "[\"cutoff\", 1000]");
    r.render(1024, 512, {{r.pos + 10, juce::MidiMessage::controllerEvent(1, 74, 5)}});
    const std::string held = js("String(Math.round(SY1E.getSynthPatch().cutoff))");
    // cutoff 1000 Hz is at about 0.56 of the knob (log 40..18000): CC 60 is below, 90 above
    r.render(1024, 512, {{r.pos + 10, juce::MidiMessage::controllerEvent(1, 74, 60)},
                         {r.pos + 300, juce::MidiMessage::controllerEvent(1, 74, 90)}});
    const std::string took = js("String(Math.round(SY1E.getSynthPatch().cutoff))");
    std::printf("     pickup: far CC keeps %s Hz; after passing the knob it follows: %s Hz\n", held.c_str(), took.c_str());
    check(held == "1000" && took != "1000", "PICKUP: no jump, takes over once the controller passes the knob");
    juce::MemoryBlock mb;
    std::thread saver([&] { r.p.getStateInformation(mb); });
    r.render(48000 / 4, 512);
    saver.join();
    Run r2("kerman");
    r2.p.setStateInformation(mb.getData(), static_cast<int>(mb.getSize()));
    r2.render(2048, 512);
    r2.render(1024, 512, {{r2.pos + 10, juce::MidiMessage::controllerEvent(1, 74, 0)}});
    const std::string c2 = r2.p.engine().js()->evalString("String(Math.round(SY1E.getSynthPatch().cutoff))");
    std::printf("     reloaded project: CC 74 at 0 -> cutoff %s (pickup off after reload? %s)\n", c2.c_str(),
                r2.p.engine().js()->evalString("localStorage.getItem('sy1_midi_pickup')").c_str());
    check(r2.p.engine().js()->evalString("localStorage.getItem('musicher_synth_midi_map')") == map, "mappings come back with the project");
  }

  std::printf("11. Drum machine -> MIDI out: GM drum notes where their sound is, DAW notes not echoed\n");
  {
    Run r("kerman");
    r.render(4096, 512);
    r.p.engine().post("applyDrumStyle", "[\"k808\"]");
    r.render(24000, 512);  // past the engine's start-up warm-up (hits in its first 0.3 s come 40 ms late)
    const int64_t start = r.pos;
    r.head.bpm = 120;
    r.head.playing = true;
    r.head.ppq = 0;
    r.render(48000 * 2, 441);
    r.head.playing = false;
    r.render(8192, 512);  // the last note-offs
    int ons = 0, offs = 0, onGrid = 0, ch10 = 0, gm = 0;
    for (auto& [t, m] : r.out) {
      if (m.isNoteOn()) {
        ons++;
        if (m.getChannel() == 10) ch10++;
        const int nn = m.getNoteNumber();
        if (nn == 36 || nn == 37 || nn == 38 || nn == 39 || nn == 42 || nn == 45 || nn == 46 || nn == 56) gm++;
        // the 16th grid in the output: start + RQ + k * 6000 samples (120 BPM, 48 kHz)
        const double k = (t - start - wa::RQ) / 6000.0;
        if (std::fabs(k - std::round(k)) * 6000.0 <= 1.0) onGrid++;
        else std::printf("     off grid: note %d at 16th %.4f\n", nn, k);  // (none expected)
      } else if (m.isNoteOff()) {
        offs++;
      }
    }
    std::printf("     %d note-ons (%d on channel 10, %d GM drum notes, %d on the 16th grid), %d note-offs\n", ons, ch10, gm, onGrid, offs);
    check(ons >= 8 && ch10 == ons && gm == ons, "every hit is a GM drum note on channel 10");
    check(onGrid == ons, "each note at its sound's sample (DAW grid + the reported 128)");
    check(offs == ons, "every note gets its note-off");
    r.out.clear();
    r.render(4096, 512, {{r.pos + 100, juce::MidiMessage::noteOn(10, 38, 0.9f)}, {r.pos + 2000, juce::MidiMessage::noteOff(10, 38)}});
    int echoed = 0;
    for (auto& [t, m] : r.out) if (m.isNoteOn()) echoed++;
    check(echoed == 0, "a drum played by the DAW's MIDI is not sent back (no feedback loop)");
    r.p.engine().post("playDrum", "[\"kick\", 1]");
    r.render(8192, 512);
    int pad = 0;
    for (auto& [t, m] : r.out) if (m.isNoteOn() && m.getNoteNumber() == 36) pad++;
    check(pad == 1, "a pad tapped in the window goes out as MIDI");
  }

  std::printf(failures ? "\n%d FAILED\n" : "\nall passed\n", failures);
  return failures ? 1 : 0;
}
