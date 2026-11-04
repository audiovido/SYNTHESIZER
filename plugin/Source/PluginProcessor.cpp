#include "PluginProcessor.h"

#include <BinaryData.h>

#include "PluginEditor.h"

static std::string resource(const char* name) {
  int size = 0;
  if (const char* d = BinaryData::getNamedResource(name, size)) return std::string(d, static_cast<size_t>(size));
  return {};
}

SY1Processor::SY1Processor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {}

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
  // one 128-frame block of latency (the engine renders in Web Audio's render quanta)
  setLatencySamples(wa::RQ);
  if (!engine_.ready() || sampleRate != rate_) {
    // (audio is not running during prepareToPlay, so the engine can be read here)
    if (pendingState_.empty() && engine_.ready()) engine_.saveState();
    const std::string state = !pendingState_.empty() ? pendingState_ : (engine_.ready() ? engine_.state() : std::string());
    startEngine(sampleRate, state);
    pendingState_.clear();
    lastBpm_ = -1;
  }
}

static std::string num(double v) {
  char b[64];
  std::snprintf(b, sizeof b, "%.10g", v);
  return b;
}

void SY1Processor::handleMidi(const juce::MidiMessage& m) {
  if (m.isNoteOn()) engine_.hostCall("noteOn", "[" + num(m.getNoteNumber()) + ", " + num(m.getFloatVelocity()) + "]");
  else if (m.isNoteOff()) engine_.hostCall("noteOff", "[" + num(m.getNoteNumber()) + "]");
  else if (m.isPitchWheel()) engine_.hostCall("setPitchBend", "[" + num((m.getPitchWheelValue() - 8192) / 8192.0) + "]");
  else if (m.isControllerOfType(1)) engine_.hostCall("setModWheel", "[" + num(m.getControllerValue() / 127.0) + "]");
  else if (m.isSustainPedalOn()) engine_.hostCall("setSustainPedal", "[true]");
  else if (m.isSustainPedalOff()) engine_.hostCall("setSustainPedal", "[false]");
  else if (m.isAllNotesOff() || m.isAllSoundOff()) engine_.hostCall("allNotesOff", "[]");
}

void SY1Processor::handleTransport() {
  auto* ph = getPlayHead();
  if (!ph) return;
  const auto pos = ph->getPosition();
  if (!pos) return;
  if (const auto bpm = pos->getBpm()) {
    if (std::fabs(*bpm - lastBpm_) > 0.01) {
      lastBpm_ = *bpm;
      engine_.hostCall("setTempo", "[" + num(*bpm) + "]");
    }
  }
  const bool playing = pos->getIsPlaying();
  if (playing != wasPlaying_) {
    wasPlaying_ = playing;
    double delay = 0, step = 0;
    if (playing) {
      // start the drum pattern on the next 16th note of the DAW's grid, at that 16th's place in the bar
      if (const auto ppq = pos->getPpqPosition()) {
        const double sixteenths = std::max(0.0, *ppq * 4);
        const double next = std::ceil(sixteenths - 1e-6);
        delay = (next - sixteenths) * (60.0 / (lastBpm_ > 0 ? lastBpm_ : 120.0) / 4);
        step = next;
      }
    }
    engine_.hostCall("hostTransport", std::string("[") + (playing ? "true" : "false") + ", " + num(delay) + ", " + num(step) + "]");
  }
}

void SY1Processor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
  juce::ScopedNoDenormals noDenormals;
  const int n = buffer.getNumSamples();
  if (!engine_.ready() || buffer.getNumChannels() < 2) { buffer.clear(); return; }
  handleTransport();
  auto it = midi.cbegin();
  const auto end = midi.cend();
  float* L = buffer.getWritePointer(0);
  float* R = buffer.getWritePointer(1);
  // MIDI events are applied before the 128-frame block that covers them
  engine_.process(L, R, n, [&](int at) {
    while (it != end && (*it).samplePosition < at + wa::RQ) {
      handleMidi((*it).getMessage());
      ++it;
    }
  });
  while (it != end) { handleMidi((*it).getMessage()); ++it; }
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
