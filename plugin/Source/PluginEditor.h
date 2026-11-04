#pragma once
#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

/** The plugin window: the SY-1 web app itself, its engine calls mirrored to the plugin's engine. */
class SY1Editor : public juce::AudioProcessorEditor, private juce::Timer {
 public:
  explicit SY1Editor(SY1Processor&);
  ~SY1Editor() override;
  void resized() override;
  void paint(juce::Graphics&) override;
  /** After the DAW loads a new state: start the window again from it. */
  void reloadUi();

 private:
  SY1Processor& proc_;
  std::unique_ptr<juce::WebBrowserComponent> web_;
  void timerCallback() override;
  std::optional<juce::WebBrowserComponent::Resource> serve(const juce::String& url);
  juce::String userScript();
  void build();

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SY1Editor)
};
