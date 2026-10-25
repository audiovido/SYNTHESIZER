/**
 * SY-1 UI — Oscilloscope Visualization
 */

import { getAudioCtxIfAny, getSynthBus } from "../engine/bus";
import { getSynthPatch } from "../engine/synth";
import { onSkinChange, readScopeColors } from "./skins";

let synthScopeRaf: number | null = null;
let scopeColors: { line: string; grid: string } | null = null;
onSkinChange(() => { scopeColors = null; });

export function startSynthScope(): void {
  if (synthScopeRaf !== null) return;

  const data = new Uint8Array(2048);

  const draw = () => {
    const canvas = document.querySelector(".synth-panel:not([hidden]) .synth-scope") as HTMLCanvasElement | null;
    if (!canvas) {
      synthScopeRaf = null;
      return;
    }

    const g = canvas.getContext("2d");
    if (!g) {
      synthScopeRaf = null;
      return;
    }

    if (!scopeColors) scopeColors = readScopeColors();
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = scopeColors.grid;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();

    const ctx = getAudioCtxIfAny();
    const bus = ctx ? getSynthBus(ctx, getSynthPatch()) : null;

    if (bus) {
      bus.analyser.getByteTimeDomainData(data);
      let start = 0;
      for (let i = 1; i < 1024; i++) {
        if (data[i - 1] < 128 && data[i] >= 128) {
          start = i;
          break;
        }
      }

      g.strokeStyle = scopeColors.line;
      g.lineWidth = 2;
      g.shadowColor = scopeColors.line;
      g.shadowBlur = 6;
      g.beginPath();

      for (let x = 0; x < w; x++) {
        const v = data[start + Math.floor((x / w) * 1000)] / 128 - 1;
        const y = h / 2 - v * (h / 2 - 3);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }

      g.stroke();
      g.shadowBlur = 0;
    }

    synthScopeRaf = requestAnimationFrame(draw);
  };

  synthScopeRaf = requestAnimationFrame(draw);
}
