# Live MIDI performance repair — 7 Nov 2026

Reported symptom: crackling while holding notes and moving mapped Cutoff/Resonance, worse with two or three plugin instances. This has not been reproduced on the physical Mac; a DAW/interface deadline failure cannot be ruled out from a description alone.

The bridge compiled a new QuickJS script per MIDI/automation event and per 128-frame timer tick. Its audio-to-editor mirror also took a message-thread mutex in the audio callback. This repair invokes compiled dispatch functions with JSON data, preserves event-time rounding/order and promise-job boundaries, and replaces that outgoing mutex with a bounded single-producer/single-consumer ring. Timer filtering is skipped when nothing is due. MIDI events are not downsampled or coalesced before the sound engine.

DSP, voices, oscillators, filters, smoothing, effects, presets, gain and package-lock.json are unchanged. Reported latency remains 128 samples. Web source is unchanged. The mapping-list UX remains deferred at Armin's request.

Validation required before publication:
- SY1HostTest 1–15: three independent instruments, six held notes each, Cutoff/Resonance CCs every 32 samples, concurrent editor-mirror reads, small/odd/large buffers, finite bounded output and no MIDI echo.
- Bounded queue overflow/wraparound and 100,000 concurrently published/consumed events, preserving exact order.
- All 15 complete native audio scenes bit-identical to the previous source, including preset changes; all six worklet replay scenes bit-identical to TypeScript.
- macOS universal AU/VST3 and Windows VST3 builds, strict auval, and pluginval strictness 8, three rounds per format. Never substitute an unvalidated build for the installed 5ff2184 R2 fallback.

The previous local session measured isolated 100,000-event dispatch at 21.6864 versus 13.9491 microseconds/event (~36% less) on its Linux runner. This is not 36% lower total CPU, and not a measurement on the user's Mac. A fresh run must validate the recovered source; local playback still needs confirmation after installation. Do not claim every possible source of crackling has been eliminated.
