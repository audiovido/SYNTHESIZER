#include "PluginProcessor.h"

#include <BinaryData.h>

#include "PluginEditor.h"

static std::string num(double v) {
  char b[64];
  std::snprintf(b, sizeof b, "%.10g", v);
  return b;
}

static std::string resource(const char* name) {
  int size = 0;
  if (const char* d = BinaryData::getNamedResource(name, size)) return std::string(d, static_cast<size_t>(size));
  return {};
}

SY1Processor::SY1Processor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
  // 16 DAW automation parameters: map any knob to one with LEARN (click a knob, move the macro)
  for (int i = 0; i < kMacros; i++) {
    auto* p = new juce::AudioParameterFloat(juce::ParameterID{"macro" + juce::String(i + 1), 1}, "Macro " + juce::String(i + 1),
                                            juce::NormalisableRange<float>(0.0f, 1.0f), 0.0f);
    macros_[static_cast<size_t>(i)] = p;
    addParameter(p);
  }
}

/** Macros that moved since the last engine block go to the engine (slots 128..143 of the MIDI map).
 *  The first values seen are only remembered, so loading a project never moves a knob. */
void SY1Processor::macrosToEngine() {
  for (int i = 0; i < kMacros; i++) {
    const float v = macros_[static_cast<size_t>(i)]->get();
    float& last = lastMacro_[static_cast<size_t>(i)];
    if (std::isnan(last)) { last = v; continue; }
    if (std::fabs(v - last) < 1e-6f) continue;
    last = v;
    engine_.hostCall("hostMacro", "[" + num(i) + ", " + num(v) + "]");
  }
}

bool SY1Processor::isBusesLayoutSupported(const BusesLayout& layouts) const {
  return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

bool SY1Processor::startEngine(double sampleRate, const std::string& state) {
  std::string err;
  const bool ok = engine_.init(sampleRate, resource("washim_js"), resource("engine_js"), state, err);
  error_ = ok ? juce::String() : juce::String(err);
  if (ok) rate_ = sampleRate;
  return ok;
}

void SY1Processor::prepareToPlay(double sampleRate, int) {
  // The engine renders in 128-frame blocks, one block behind the DAW: every DAW event of a block is
  // known before the block renders, so each one sounds at its exact sample. The DAW is told about
  // these 128 samples and moves the recorded audio back by them.
  setLatencySamples(wa::RQ);
  if (!engine_.ready() || sampleRate != rate_) {
    // (audio is not running during prepareToPlay, so the engine can be read here)
    if (pendingState_.empty() && engine_.ready()) engine_.saveState();
    const std::string state = !pendingState_.empty() ? pendingState_ : (engine_.ready() ? engine_.state() : std::string());
    startEngine(sampleRate, state);
    pendingState_.clear();
  }
  lastBpm_ = -1;
  wasPlaying_ = false;
  dawPos_ = 0;
  pending_.clear();
  outPending_.clear();
  outPending_.reserve(4096);
  pending_.reserve(2048);
}


void SY1Processor::handleMidi(const juce::MidiMessage& m, double at) {
  if (m.isNoteOn()) engine_.hostCall("midiNoteOn", "[" + num(m.getNoteNumber()) + ", " + num(m.getFloatVelocity()) + "]", at);
  else if (m.isNoteOff()) engine_.hostCall("midiNoteOff", "[" + num(m.getNoteNumber()) + "]", at);
  else if (m.isPitchWheel()) engine_.hostCall("setPitchBend", "[" + num((m.getPitchWheelValue() - 8192) / 8192.0) + "]", at);
  else if (m.isAllNotesOff() || m.isAllSoundOff()) engine_.hostCall("allNotesOff", "[]", at);
  // every other controller (mod wheel and sustain too): MIDI Learn mappings first, then the built-ins
  else if (m.isController())
    engine_.hostCall("hostCC", "[" + num(m.getChannel()) + ", " + num(m.getControllerNumber()) + ", " + num(m.getControllerValue()) + "]", at);
}

void SY1Processor::readPlayHead() {
  host_ = {};
  auto* ph = getPlayHead();
  if (!ph) return;
  const auto pos = ph->getPosition();
  if (!pos) return;
  if (const auto bpm = pos->getBpm()) host_.bpm = *bpm;
  host_.playing = pos->getIsPlaying();
  if (const auto ppq = pos->getPpqPosition()) { host_.ppq = *ppq; host_.hasPpq = true; }
  host_.looping = pos->getIsLooping();
  if (const auto loop = pos->getLoopPoints()) { host_.loopStart = loop->ppqStart; host_.loopEnd = loop->ppqEnd; }
}

/** Before the engine block that covers DAW samples [q0, q0 + 128): the DAW's tempo, Play/Stop and,
 *  while it plays, every 16th note of the song that falls in (or just after) the block. */
void SY1Processor::hostClockFor(int64_t q0) {
  if (host_.bpm > 0 && std::fabs(host_.bpm - lastBpm_) > 1e-6) {
    lastBpm_ = host_.bpm;
    engine_.hostCall("setHostTempo", "[" + num(host_.bpm) + "]");
    uiBpm_.store(host_.bpm, std::memory_order_relaxed);
  }
  const bool playing = host_.playing && host_.hasPpq && host_.bpm > 0;
  if (playing != wasPlaying_) {
    wasPlaying_ = playing;
    engine_.hostCall("hostTransport", playing ? "[true]" : "[false]");
    uiPlaying_.store(playing, std::memory_order_relaxed);
    nextAllowed_ = std::numeric_limits<int64_t>::min();
  }
  if (!playing) { engine_.setHostClock(false, 0, host_.bpm); return; }
  const double sr = rate_, bps = host_.bpm / 60.0;
  const double ppqQ = host_.ppq + static_cast<double>(q0 - dawPos_) / sr * bps;  // beats at the block start
  engine_.setHostClock(true, ppqQ, host_.bpm);
  // 16ths from the block start to 30 ms past its end (flams sound just before their step);
  // in a DAW loop the steps after the loop end come from the loop start
  const double look = (wa::RQ / sr + 0.03) * bps;
  const int64_t stepSamples = static_cast<int64_t>(sr * 60.0 / host_.bpm / 4);
  auto segment = [&](double b0, double b1, double secOffset) {
    for (int64_t k = static_cast<int64_t>(std::ceil(b0 * 4 - 1e-9)); k / 4.0 < b1; k++) {
      if (k < 0) continue;  // count-in / pre-roll: nothing before the song start
      const double dt = (k / 4.0 - b0) / bps + secOffset;
      const int64_t t = q0 + static_cast<int64_t>(std::llround(dt * sr));
      if (t < nextAllowed_) continue;  // already played (blocks look ahead into each other)
      nextAllowed_ = t + stepSamples / 2;
      engine_.hostCall("hostStep", "[" + num(static_cast<double>(k)) + ", " + num(dt) + "]");
    }
  };
  const double end = ppqQ + look;
  if (host_.looping && host_.loopEnd > host_.loopStart && ppqQ < host_.loopEnd && end > host_.loopEnd) {
    segment(ppqQ, host_.loopEnd, 0);
    segment(host_.loopStart, host_.loopStart + (end - host_.loopEnd), (host_.loopEnd - ppqQ) / bps);
  } else {
    segment(ppqQ, end, 0);
  }
}

void SY1Processor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
  juce::ScopedNoDenormals noDenormals;
  const int n = buffer.getNumSamples();
  if (!engine_.ready() || buffer.getNumChannels() < 2) { buffer.clear(); return; }
  readPlayHead();
  for (const auto meta : midi)
    if (pending_.size() < 8192) pending_.push_back({dawPos_ + meta.samplePosition, meta.getMessage()});
  float* L = buffer.getWritePointer(0);
  float* R = buffer.getWritePointer(1);
  double outBase = 0, outT0 = 0;
  bool rendered = false;
  engine_.process(L, R, n, [&](int i) {
    // this engine block covers DAW samples [q0, q0 + 128) and is heard 128 samples later
    const int64_t q0 = dawPos_ + i - wa::RQ;
    // its audio starts at buffer position i: engine time t sounds at output sample dawPos_ + i + (t - T0) * sr
    outBase = static_cast<double>(dawPos_ + i);
    outT0 = engine_.time();
    rendered = true;
    hostClockFor(q0);
    macrosToEngine();
    size_t k = 0;
    for (; k < pending_.size() && pending_[k].t < q0 + wa::RQ; k++)
      handleMidi(pending_[k].m, std::max<int64_t>(0, pending_[k].t - q0) / rate_);
    if (k) pending_.erase(pending_.begin(), pending_.begin() + static_cast<long>(k));
  });
  // MIDI out (drum hits as GM notes): each event goes where its sound is in the output, so a MIDI
  // track recording SY-1 lines up with SY-1's audio
  midi.clear();
  if (rendered)
    engine_.takeMidiOut([&](uint8_t b0, uint8_t b1, uint8_t b2, double t) {
      if (outPending_.size() >= 4096) return;
      // (an event already in the past goes at the start of this buffer)
      const double at = std::max(static_cast<double>(dawPos_), outBase + (t - outT0) * rate_);
      outPending_.push_back({static_cast<int64_t>(std::llround(at)), juce::MidiMessage(b0, b1, b2)});
    });
  if (!outPending_.empty()) {
    std::stable_sort(outPending_.begin(), outPending_.end(), [](const Pending& a, const Pending& b) { return a.t < b.t; });
    size_t k = 0;
    for (; k < outPending_.size() && outPending_[k].t < dawPos_ + n; k++)
      midi.addEvent(outPending_[k].m, static_cast<int>(std::clamp<int64_t>(outPending_[k].t - dawPos_, 0, n - 1)));
    if (k) outPending_.erase(outPending_.begin(), outPending_.begin() + static_cast<long>(k));
  }
  dawPos_ += n;
}

std::string SY1Processor::currentState() {
  if (!pendingState_.empty()) return pendingState_;
  // the newest state: the audio thread saves it at its next block (if audio is running)
  return engine_.ready() ? engine_.freshState(150) : std::string();
}

void SY1Processor::getStateInformation(juce::MemoryBlock& destData) {
  const std::string s = currentState();
  juce::MemoryOutputStream out(destData, false);
  out.writeString("SY1STATE1");
  out.writeString(juce::String::fromUTF8(s.c_str(), static_cast<int>(s.size())));
}

void SY1Processor::setStateInformation(const void* data, int sizeInBytes) {
  juce::MemoryInputStream in(data, static_cast<size_t>(sizeInBytes), false);
  if (in.readString() != "SY1STATE1") return;
  const std::string s = in.readString().toStdString();
  if (rate_ > 0) {
    suspendProcessing(true);
    startEngine(rate_, s);
    // the new engine has not heard the DAW's tempo or Play state yet: send them again at the next block
    lastBpm_ = -1;
    wasPlaying_ = false;
    uiPlaying_.store(false, std::memory_order_relaxed);
    lastMacro_.fill(std::numeric_limits<float>::quiet_NaN());
    suspendProcessing(false);
    // the window is rebuilt on the message thread (hosts may load a state from any thread)
    std::weak_ptr<int> alive = alive_;
    juce::MessageManager::callAsync([this, alive] {
      if (alive.expired()) return;
      if (auto* ed = dynamic_cast<SY1Editor*>(getActiveEditor())) ed->reloadUi();
    });
  } else {
    pendingState_ = s;
  }
}

juce::AudioProcessorEditor* SY1Processor::createEditor() { return new SY1Editor(*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new SY1Processor(); }
