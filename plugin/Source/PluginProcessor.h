#pragma once
#include <cstdint>
#include <limits>
#include <vector>
#include <juce_audio_processors/juce_audio_processors.h>

#include "host/sy1_engine.hpp"

/** SY-1 as an instrument plugin: the web app's engine, run natively (see native/README.md). */
class SY1Processor : public juce::AudioProcessor {
 public:
  SY1Processor();
  ~SY1Processor() override = default;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override {}
  bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
  void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

  juce::AudioProcessorEditor* createEditor() override;
  bool hasEditor() const override { return true; }

  const juce::String getName() const override { return "SY-1"; }
  bool acceptsMidi() const override { return true; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 4.0; }

  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return {}; }
  void changeProgramName(int, const juce::String&) override {}

  void getStateInformation(juce::MemoryBlock& destData) override;
  void setStateInformation(const void* data, int sizeInBytes) override;

  /** For the window: the engine, its sample rate, and the state the window starts from. */
  sy1::Sy1Engine& engine() { return engine_; }
  double engineRate() const { return rate_; }
  std::string currentState();
  juce::String engineError() const { return error_; }

 private:
  sy1::Sy1Engine engine_;
  double rate_ = 0;
  std::string pendingState_;
  juce::String error_;
  double lastBpm_ = -1;
  bool wasPlaying_ = false;
  // the DAW's clock: sample position since prepareToPlay, the play head of the current DAW block,
  // MIDI events waiting for their engine block, and the last drum step sent
  int64_t dawPos_ = 0;
  struct HostPos { bool playing = false, hasPpq = false, looping = false; double bpm = 0, ppq = 0, loopStart = 0, loopEnd = 0; } host_;
  struct Pending { int64_t t; juce::MidiMessage m; };
  std::vector<Pending> pending_;
  int64_t nextAllowed_ = 0;
  void readPlayHead();
  void hostClockFor(int64_t q0);
  std::shared_ptr<int> alive_ = std::make_shared<int>(0);  // lets queued UI work see that the plugin is gone
  bool startEngine(double sampleRate, const std::string& state);
  void handleMidi(const juce::MidiMessage& m, double at);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SY1Processor)
};
