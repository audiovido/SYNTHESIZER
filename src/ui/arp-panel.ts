/**
 * SY-1 UI — Arpeggiator panel for every synth machine.
 *
 * The ARP button beside the keys opens this panel over the controls (never
 * over the keyboard), so the main layout never grows or scrolls. The button
 * lights up while the arpeggiator is on.
 */

import { getMachine, getSynthPatch, onParamChange } from "../engine/synth";
import { getTempo } from "../engine/tempo";
import { ARP_MODE_OPTS, choice, row, toggles } from "../machines/types";
import { renderControl, setPanelRenderHook } from "./panel";

let open = false;

function html(): string {
  return `<div class="arp-pop" role="dialog" aria-label="Arpeggiator"><div class="arp-pop-inner">
    <div class="arp-pop-head"><h4>ARPEGGIATOR</h4>
      <div class="synth-tempo" role="group" aria-label="Tempo">
        <button type="button" class="synth-midi-btn" data-action="tempo-down" aria-label="Slower">−</button>
        <button type="button" class="synth-tempo-val" data-action="tempo-tap" title="Tempo (BPM). Tap in time to set it.">${getTempo()}</button>
        <button type="button" class="synth-midi-btn" data-action="tempo-up" aria-label="Faster">+</button>
      </div>
      <button type="button" class="synth-midi-btn arp-pop-close" data-arp-close aria-label="Close">✕</button>
    </div>
    ${renderControl(toggles([
      { key: "arpOn", label: "ARP ON", title: "Arpeggiator on/off" },
      { key: "hold", label: "LATCH", title: "Keep the chord playing after you let go" }
    ]))}
    ${renderControl(choice("arpMode", ARP_MODE_OPTS))}
    ${renderControl(row([["arpRate", "RATE"], ["arpOct", "OCT"], ["arpGate", "GATE"], ["arpSwing", "SWING"]]))}
  </div></div>`;
}

function syncButton(): void {
  const btn = document.getElementById("kb-arp");
  if (!btn) return;
  btn.classList.toggle("active", getSynthPatch().arpOn === "on");
  btn.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function render(): void {
  document.querySelectorAll(".arp-pop").forEach((el) => el.remove());
  const panel = document.querySelector(".synth-panel");
  if (open && panel && getMachine().kind === "synth") panel.insertAdjacentHTML("beforeend", html());
  syncButton();
}

function setOpen(v: boolean): void {
  open = v;
  render();
}

export function initArpPanel(): void {
  setPanelRenderHook(render); // the panel is rebuilt on machine change
  const btn = document.getElementById("kb-arp");
  if (btn) btn.addEventListener("click", () => setOpen(!open));
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-arp-close]")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setOpen(false);
  });
  onParamChange((k) => { if (k === "arpOn") syncButton(); });
  syncButton();
}
