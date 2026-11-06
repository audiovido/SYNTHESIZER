/**
 * SY-1 Main Entry Point
 */

import "./index.css";
import { getAnalogState } from "./engine/analog";
import "./ui/skins.css";
import "./ui/keyboard.css";
import { installAudioUnlock } from "./engine/bus";
import { applySkin } from "./ui/skins";
import { getEngine, getHQState } from "./engine/hq";
import { requestMidi } from "./engine/midi";
import { SYNTH_PARAMS } from "./engine/params";
import {
  allNotesOff,
  applySynthPreset,
  getMachine,
  getMachines,
  getSynthPatch,
  initMachine,
  noteOff,
  noteOn,
  onMachineChange,
  prepareAudio,
  setMachine,
  setModWheel,
  setPitchBend,
  setSustainPedal,
  setSynthParam
} from "./engine/synth";
import { getTempo, setTempo } from "./engine/tempo";
import { initKeyboardInteractions, renderKeyboard, syncOriental } from "./ui/keyboard";
import { initKnobInteractions } from "./ui/knob";
import { initPanelInteractions, renderPanel, selectDrumVoiceForNote } from "./ui/panel";
import { startSynthScope } from "./ui/scope";
import { initArpPanel } from "./ui/arp-panel";
import { initOrientalPanel } from "./ui/oriental-panel";
import { initLibrary } from "./ui/library";
import { initMachineBrowser } from "./ui/machine-browser";
import { initDawPanel } from "./ui/daw-panel";
import { setMirrorSink } from "./engine/mirror";
import { applyEngineCall } from "./engine/calls";
import { getParamMacro, paramNorm } from "./engine/cc-map";

function initApp(): void {
  // Inside the AU/VST3 plugin: the plugin's engine makes the sound; this window mirrors
  // every engine call to it, and applies the calls the plugin sends back (DAW MIDI, tempo).
  const plugin = (window as any).__SY1_PLUGIN__;
  if (plugin) {
    document.documentElement.classList.add("is-plugin");
    plugin.onCall = (name: string, args: unknown[]) => applyEngineCall(name, args);
    // the DAW's tempo and Play state come with every update too: the window shows the real tempo
    // even when it opened (or reloaded) after the plugin last sent them
    let hostBpm = 0, hostPlaying = false;
    plugin.onHost = (h: { bpm?: number; playing?: boolean }) => {
      const bpm = Number(h && h.bpm) || 0;
      if (bpm > 0 && bpm !== hostBpm) { hostBpm = bpm; applyEngineCall("setHostTempo", [bpm]); }
      const playing = !!(h && h.playing);
      if (playing !== hostPlaying) { hostPlaying = playing; applyEngineCall("hostTransport", [playing]); }
    };
    // mirror only what the player does from now on (the start-up calls below run in the plugin's engine already)
    setTimeout(() => setMirrorSink((name, args) => {
      plugin.send(name, args);
      // Only a direct player edit is reported. Incoming DAW calls and nested preset
      // changes are unmirrored, preventing automation feedback and preset jumps.
      if (name === "setSynthParam") {
        const key = String(args[0]);
        const macro = getParamMacro(key);
        if (macro !== undefined) plugin.send("macroValue", [macro, paramNorm(key, args[1])]);
      }
    }), 0);
  }
  // skin and keyboard follow the machine
  onMachineChange((m) => {
    applySkin(m.skin);
    renderKeyboard();
    syncOriental();
  });
  initPanelInteractions();
  initArpPanel();
  initOrientalPanel();
  initLibrary();
  initMachineBrowser();
  initDawPanel();
  initMachine();          // loads the remembered machine and its patch
  applySkin(getMachine().skin);
  renderPanel();
  renderKeyboard();

  installAudioUnlock(prepareAudio);

  initKnobInteractions();
  initKeyboardInteractions();
  startSynthScope();

  // tapping a drum pad also selects that drum for editing
  const kb = document.getElementById("kb");
  if (kb) {
    kb.addEventListener("pointerdown", (e) => {
      const pad = (e.target as HTMLElement).closest(".pad") as HTMLElement | null;
      if (pad) selectDrumVoiceForNote(Number(pad.dataset.midi));
    });
  }

  // Public window API for embedding or external control
  (window as any).SY1 = {
    noteOn,
    noteOff,
    allNotesOff,
    setParam: setSynthParam,
    applyPreset: applySynthPreset,
    setMachine,
    getMachine: () => getMachine().id,
    machines: () => getMachines().map((m) => ({ id: m.id, name: m.name, role: m.role, presets: m.presets.length })),
    machineData: () => getMachines(),
    setPitchBend,
    setModWheel,
    setSustainPedal,
    setTempo,
    getTempo,
    requestMidi,
    getPatch: () => ({ ...getSynthPatch() }),
    getEngine: () => ({ engine: getEngine(), hq: getHQState(), analog: getAnalogState() }),
    PARAMS: SYNTH_PARAMS
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// PWA: offline support. Only in the production build (the dev server must not cache anything).
if (import.meta.env.PROD && "serviceWorker" in navigator && !(window as any).__SY1_PLUGIN__) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
