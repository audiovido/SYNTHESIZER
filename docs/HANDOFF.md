# SY-1 — handoff (state on 4 Nov 2026, commit after `8c44d9c`)

Read this first if you are continuing the project (any AI assistant or developer).
Owner: Armin (music producer; uses Ableton Live and Logic Pro; Intel Mac). Replies to him: **Farsi, right-to-left, simple language**.

## 0. Rules that must not be broken
1. **Do not change the sound** (synthesis, presets, kits, mix, effects) unless Armin asks. The web app's sound is final; the plugin must sound exactly like it.
2. Do not touch `package-lock.json`. No audio sample files (everything is synthesized).
3. Layout audit must stay at 0 failures: `bun scripts/layout-audit`.
4. After any engine change, run the parity tests (section 4). Changes that only affect the plugin must be no-ops in the web app.

## 1. What the project is
- **Web app** (`src/`, Vite + TypeScript, no framework): 15 machines (synths: sy1, yazd, tabriz, baku, konya, kashan, shiraz, nishapur, merv, isfahan, bam; drum machines: kerman, bushehr, rasht, hormoz). Deployed to GitHub Pages (`.github/workflows/deploy.yml`).
- **Plugin** (`plugin/`, JUCE 8.0.15): AU + VST3 + Standalone (macOS universal), VST3 + Standalone (Windows). Built by `.github/workflows/plugin.yml`.
- **Native engine** (`native/`): runs the web app's own engine code inside the plugin.

## 2. Plugin architecture (how it works)
- `native/wa/` — C++ re-implementation of Chrome's Web Audio nodes (bit-exact or float-precise vs Chrome). BSD notice in `native/wa/NOTICE.md`.
- `native/third_party/quickjs/` — QuickJS-ng (MIT). The whole `src/engine` is bundled by `native/js/build.ts` (bun) into `native/js/dist/engine.js` and runs in QuickJS.
- `native/js/wa-shim.js` — maps the Web Audio API to native nodes (`__wa.*` functions in `native/host/wajs.hpp`). Also: `__evOffset` (sample-exact DAW events), `__hostClock()` (DAW position for the arp), in-memory localStorage with dirty flag, UI-mode stub.
- AudioWorklet engines are native C++ ports, bit-identical to the TS processors: `native/dsp/hq.hpp` (sy1-voices), `analog.hpp` (Tabriz), `fm.hpp` (Kashan), `strings.hpp` (Shiraz), `vector.hpp` (Nishapur). Registered in `native/host/worklets.hpp` / `wajs.hpp`.
- `native/host/sy1_engine.hpp` — the plugin's engine wrapper: 128-frame blocks, thread-safe `post()` from the UI, `hostCall(name, args, offsetSec)` on the audio thread, state save (`freshState`), scope, GC only after 1 s of silence, NaN guard.
- `plugin/Source/PluginProcessor.cpp` — **the DAW is the clock**:
  - engine renders one 128-frame block behind the DAW (`setLatencySamples(128)`), so every MIDI event lands at its exact sample (`__evOffset`);
  - `hostClockFor()` per block: `setHostTempo` (exact BPM), `hostTransport(playing)`, and while playing every 16th note of the song → `hostStep(sixteenth, inSec)` (follows loops via loop points, nothing at negative ppq / count-in, de-duplicated by `nextAllowed_`);
  - state = the app's localStorage as JSON, prefixed `SY1STATE1`.
- `plugin/Source/PluginEditor.cpp` — the real web app (built by vite) in a WebView, served from BinaryData (`plugin/prepare.sh` bundles it; HTML/CSS made ASCII by `plugin/ascii.mjs`). **UI mode**: the window's own engine is silent; every top-level engine call it makes is mirrored to the plugin engine (`src/engine/mirror.ts` wraps exported functions as `X__impl` + `mirrorCall`; the list is `src/engine/calls.ts` `ENGINE_CALLS`). Calls the plugin makes (MIDI, tempo, steps) are sent back to the window every 30 ms (`takeOutgoing`).
- In plugin mode the CSS class `is-plugin` hides: REC, DAW-connect, browser-MIDI controls, tempo −/+/TAP (`src/index.css` end).

## 3. Build, install, CI
- Local (Linux): `bash plugin/prepare.sh && cmake -S plugin -B build -DJUCE_DIR=<juce> -DCMAKE_BUILD_TYPE=Release -DSY1_TESTS=ON && cmake --build build`.
- CI (`plugin.yml`): Mac job runs on **`macos-15-intel`** (arm64 runners were at capacity), builds universal, runs `SY1HostTest`, ad-hoc codesign, auval, **pluginval strictness 8 ×3 rounds for VST3 and AU** (job fails on any crash), then pushes `SY-1-mac.zip` to branch **`plugin-builds`** and uploads artifacts. Windows: WebView2 via nuget, VST3 + exe.
- Install on Mac: unzip `SY-1-mac.zip` → `SY-1.component` into `~/Library/Audio/Plug-Ins/Components/`, `SY-1.vst3` into `~/Library/Audio/Plug-Ins/VST3/`; if downloaded through a browser: `xattr -cr` on both. Restart the DAW.

## 4. Tests (run after changes)
- `node native/tests/worklet_replay.mjs` — native worklets vs TS processors, must say "all bit-identical".
- `node native/tests/engine_parity.mjs` (needs `DISABLE_HMR=true npx vite --port 3344 --host 127.0.0.1`; restart vite after editing src) — whole engine vs Chrome, all scenes ~ -106..-126 dB; "Nishapur presets" varies by Chrome's own timing (-34..-44 dB) — known.
- `plugin/tests/host_test.cpp` (`SY1HostTest`) — drives the processor like a DAW; must say "all passed".
- `bun scripts/layout-audit` — 0 failures. `npx tsc --noEmit -p .` clean.

## 5. Open requests from Armin (next work) — designed, not built yet

### 5.1 Tempo control back on drum machines, in sync with the DAW

**Built (5 Nov 2026).** SYNC button beside the tempo (plugin only, saved in the state, default on).
- `src/engine/tempo.ts`: `setSync` (mirrored), `isHostSynced()` = SYNC on and a DAW tempo known. The app's own tempo (`setTempo`, a style's tempo) is always remembered and used when SYNC is off.
- `src/engine/drums.ts`: the DAW's Play runs the pattern only while SYNC is on; off = the own Play button and clock. `arp.ts` aligns to the DAW grid only while synced.
- Window: −/+/TAP greyed while synced; the drum library shows `style 98 · now 79 BPM`. The window gets the DAW tempo and Play state with every 30 ms update (`host` in the `sy1` event, `plugin.onHost` in `main.ts`), so it shows the real tempo even after it opened late or reloaded.
- Bug fixed: after a project reload (`setStateInformation`) the new engine never heard the DAW tempo again (it stayed at the style's tempo). `lastBpm_`/`wasPlaying_` are reset so both are re-sent.
- Tests: host_test 8 (SYNC off/on with the DAW playing) and 9 (reload + SYNC saved).

Original design notes:
Problem now: in the plugin the tempo is locked to the DAW and −/+/TAP are hidden. Also the drum style label shows its own BPM (e.g. "98BPM" while Ableton is at 79) — that label is the **style's** stored tempo (`applyDrumStyle` → `setTempo(st.bpm)` is ignored while locked), so it is misleading.
Design (standard behaviour, like Ableton Link / host sync in other plugins):
- Add a **SYNC** toggle (plugin only, saved in state), default ON:
  - SYNC ON + DAW playing or DAW reports a tempo: tempo = DAW tempo; the tempo display shows the DAW tempo; −/+/TAP disabled (greyed, tooltip "tempo from DAW").
  - SYNC OFF: the app's own tempo works (−/+/TAP, style tempo); drums run on the internal clock even when the DAW plays (free mode).
- The style BPM label: show the **current** tempo, or show the style tempo as "style 98 · now 79" when they differ.
- Web/tablet app (no DAW): unchanged (own tempo). For syncing between devices later: **Ableton Link** (link.ableton.com, open source, GPL/commercial) is the standard; for the web app there is no Link — use MIDI clock in (Web MIDI) as the option.
- Code: `src/engine/tempo.ts` (`hostLocked`, `setHostTempo`) → make the lock follow the SYNC flag; `plugin/Source/PluginProcessor.cpp hostClockFor()` → only send `setHostTempo`/`hostStep` when SYNC is on; when off, `hostTransport(false)` and let `startDrums` work. CSS: replace the hide rule for `.tempo-step-btn/.tempo-tap-btn` with a disabled state when `is-plugin.is-synced`.

### 5.2 MIDI Learn that works inside the plugin (any controller, any synth)
There is MIDI learn in the web app (`src/engine/midi.ts`, `learnMode`, Web MIDI) but in the plugin Web MIDI doesn't exist; MIDI comes from the DAW.
Design:
- Plugin: forward incoming **CC messages** (all except 1/64/120-123 which are already handled) from `handleMidi()` to the engine as `hostCC(channel, cc, value)`.
- Engine: one mapping table (per machine + a global table), stored in localStorage → saved in the plugin state: `{ "ch:cc": { param, min, max, curve } }`. Learn = click LEARN, touch a knob, move a controller knob → mapping saved. Right-click / long-press a knob → "Clear MIDI mapping". Reuse the existing learn UI from `midi.ts` so it works the same in web and plugin.
- Standard extras: pickup/soft-takeover option (no jumps), relative-encoder mode, "MIDI channel: omni/1-16".
- Also expose the main knobs as **DAW automation parameters** (JUCE `AudioProcessorValueTreeState` with ~16 macro slots that the user assigns), so Ableton/Logic can automate and map them with their own MIDI map mode. This is the most standard way for DAW users.

### 5.3 Drum machine → MIDI in the DAW (see/record which drum plays when)
Now the plugin outputs audio only (`NEEDS_MIDI_OUTPUT FALSE`).
Design:
- Set `NEEDS_MIDI_OUTPUT TRUE` (`plugin/CMakeLists.txt`) and `producesMidi() = true`.
- In `hostStep` (and the internal sequencer) emit for each triggered voice a MIDI note on/off into the output `MidiBuffer` at the exact sample: use the existing mapping `DRUM_NOTES` in `src/engine/drums.ts` (General MIDI style: kick 36, snare 38, …). Velocity from the step accent/vel. Engine → C++: new outgoing queue of `{voice, vel, inSec}` read by the processor in the same block.
- Ableton: put a MIDI track with input "SY-1" (post FX) and record → you get a MIDI clip with kick/snare/hat lanes; that clip can drive SY-1 itself (set the drum machine to "play from MIDI" = pattern off) or any other drum rack.
- **Export MIDI file** button on the drum machine: write the current pattern (or all 8) as a `.mid` file (one track, GM drum notes, 16ths at the current tempo) — in the web app via download, in the plugin via drag-and-drop to the DAW (JUCE `DragAndDropContainer::performExternalDragDropOfFiles`) or a save dialog.
- Synth arp could output its notes the same way (option "ARP → MIDI out").

## 6. Known limits now
- Knobs are not DAW-automatable yet (see 5.2). Builds are ad-hoc signed, not notarized (needs an Apple Developer ID).
- Switching machine/preset during play costs a one-off few ms of CPU (fine at 256–512 buffer; recommend not below 256 for live).
- Arp is aligned to the DAW grid only at its start (not re-synced on loop jumps).

## 7. Where things are documented
- `native/README.md` — native engine, tests, plugin details.
- Project notes (claude.ai project "Synthesizer"): `claude/SY-1-plugin-plan.md`, `claude/SY-1-status.md`.
