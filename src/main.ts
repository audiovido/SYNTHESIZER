/**
 * SY-1 Main Entry Point
 */

import "./index.css";
import "./ui/skins.css";
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
import { initKeyboardInteractions, renderKeyboard } from "./ui/keyboard";
import { initKnobInteractions } from "./ui/knob";
import { initPanelInteractions, renderPanel, selectDrumVoiceForNote } from "./ui/panel";
import { startSynthScope } from "./ui/scope";
import { initArpPanel } from "./ui/arp-panel";
import { initOrientalPanel, syncOrientalButton } from "./ui/oriental-panel";

function initApp(): void {
  // skin and keyboard follow the machine
  onMachineChange((m) => {
    applySkin(m.skin);
    renderKeyboard();
    syncOrientalButton();
  });
  initPanelInteractions();
  initArpPanel();
  initOrientalPanel();
  initMachine();          // loads the remembered machine and its patch
  applySkin(getMachine().skin);
  renderPanel();
  renderKeyboard();

  const startBtn = document.getElementById("sy1-start");
  if (startBtn) startBtn.addEventListener("click", prepareAudio);

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
    getEngine: () => ({ engine: getEngine(), hq: getHQState() }),
    PARAMS: SYNTH_PARAMS
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
