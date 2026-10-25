/**
 * SY-1 Main Entry Point
 */

import "./index.css";
import "./ui/skins.css";
import { initSkin } from "./ui/skins";
import { unlockAudio } from "./engine/bus";
import { requestMidi } from "./engine/midi";
import { SYNTH_PARAMS } from "./engine/params";
import { SYNTH_PRESETS } from "./engine/presets";
import {
  allNotesOff,
  applySynthPreset,
  getSynthPatch,
  noteOff,
  noteOn,
  setModWheel,
  setPitchBend,
  setSustainPedal,
  setSynthParam
} from "./engine/synth";

import { initKeyboardInteractions, renderKeyboard } from "./ui/keyboard";
import { initKnobInteractions } from "./ui/knob";
import { initPanelInteractions, renderSynthPanelHtml } from "./ui/panel";
import { startSynthScope } from "./ui/scope";

function initApp(): void {
  initSkin();
  const panelContainer = document.getElementById("sy1-panel");
  if (panelContainer) {
    panelContainer.innerHTML = renderSynthPanelHtml();
  }

  const startBtn = document.getElementById("sy1-start");
  if (startBtn) {
    startBtn.addEventListener("click", unlockAudio);
  }

  renderKeyboard();
  initPanelInteractions();
  initKnobInteractions();
  initKeyboardInteractions();
  startSynthScope();

  // Public window API for embedding or external control
  (window as any).SY1 = {
    noteOn,
    noteOff,
    allNotesOff,
    setParam: setSynthParam,
    applyPreset: applySynthPreset,
    setPitchBend,
    setModWheel,
    setSustainPedal,
    requestMidi,
    getPatch: () => ({ ...getSynthPatch() }),
    PARAMS: SYNTH_PARAMS,
    PRESETS: SYNTH_PRESETS
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
