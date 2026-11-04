// Engine bundle for the plugin: the web app's whole sound engine, unchanged
// (notes, mono/legato, HOLD, sustain, arpeggiator, presets, drum machines, FX bus).
import * as synth from "../../src/engine/synth";
import * as drums from "../../src/engine/drums";
import { getTempo, setTempo } from "../../src/engine/tempo";
import { getEngine, getHQState } from "../../src/engine/hq";
import * as bus from "../../src/engine/bus";
(globalThis as any).SY1E = { ...synth, drums, bus, getTempo, setTempo, getEngine, getHQState };
