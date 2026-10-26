// Writes native/ios/Tabriz/presets.json and panel.json from the web machine
// definition, so the app and the website share one preset bank and one panel
// layout. Run (from the repo root):
//   npx esbuild native/tools/export-tabriz-presets.mts --bundle --platform=node --format=esm --outfile=native/tools/.exp.mjs
//   node native/tools/.exp.mjs && rm native/tools/.exp.mjs
import { writeFileSync } from "fs";
import { PARAM_CHOICES, SYNTH_PARAMS } from "../../src/engine/params";
import { TABRIZ } from "../../src/machines/tabriz";

// ---- every key the panel shows + FX bus + engine-only keys ----
const keys = new Set<string>(["filterType", "volume", "legato", "polyMode", "lfoShape", "osc3Wave"]);
for (const s of TABRIZ.sections)
  for (const c of s.controls) {
    if (c.kind === "choice" || c.kind === "select") keys.add(c.key);
    if (c.kind === "toggles") c.items.forEach((t) => keys.add(t.key));
    if (c.kind === "row") c.knobs.forEach(([k]) => keys.add(k));
  }
["drive", "eqLow", "eqMid", "eqHigh", "delayTime", "delayFb", "delayMix", "revSize", "revMix",
  "chorusMix", "chorusRate", "chorusDepth"].forEach((k) => keys.add(k));
const KEYS = [...keys].filter((k) => SYNTH_PARAMS[k]);

// ---- value formatting: pick the formatter kind that reproduces fmt() exactly ----
const sec = (v: number) => (v < 1 ? Math.round(v * 1000) + "ms" : v.toFixed(2) + "s");
const KINDS: Record<string, (v: number) => string> = {
  pct: (v) => Math.round(v * 100) + "%",
  sec,
  secOff: (v) => (v < 0.005 ? "Off" : sec(v)),
  hz: (v) => v.toFixed(v < 1 ? 2 : 1) + "Hz",
  db: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + "dB",
  cents: (v) => v + "¢",
  st: (v) => v + "st",
  signed: (v) => (v > 0 ? "+" : "") + v,
  freq: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + ""),
  f1: (v) => v.toFixed(1),
  int: (v) => String(Math.round(v)),
};
function kindOf(key: string): string {
  const d = SYNTH_PARAMS[key];
  if (!d.fmt || d.min === undefined || d.max === undefined) return "f1";
  const probes: number[] = [];
  for (let i = 0; i <= 40; i++) {
    let v = d.curve === "log" ? d.min * Math.pow(d.max / d.min, i / 40) : d.min + ((d.max - d.min) * i) / 40;
    if (d.step) v = Math.round(v / d.step) * d.step;
    probes.push(v);
  }
  for (const [k, f] of Object.entries(KINDS)) if (probes.every((v) => f(v) === d.fmt!(v))) return k;
  throw new Error(`no formatter matches ${key}: e.g. ${d.fmt(probes[20])}`);
}

const params: Record<string, unknown> = {};
for (const k of KEYS) {
  const d = SYNTH_PARAMS[k];
  if (d.type) params[k] = { choice: true, options: PARAM_CHOICES[d.type], def: d.def };
  else params[k] = { min: d.min, max: d.max, step: d.step ?? 0, log: d.curve === "log", def: d.def, kind: kindOf(k) };
}

const panel = {
  name: TABRIZ.name,
  role: TABRIZ.role,
  pages: TABRIZ.pages,
  sections: TABRIZ.sections.map((s) => ({
    title: s.title,
    page: s.page,
    controls: s.controls.map((c) => {
      if (c.kind === "choice" || c.kind === "select")
        return { kind: "choice", key: c.key, options: c.options.map(([value, text, title]) => ({ value, text, title: title ?? text })) };
      if (c.kind === "toggles")
        return { kind: "toggles", items: c.items.map((t) => ({ key: t.key, label: t.label, on: t.on ?? "on", off: t.off ?? "off" })) };
      return { kind: "row", knobs: c.knobs.map(([key, label]) => ({ key, label })), small: !!c.small, caption: c.caption ?? "" };
    }),
  })),
  params,
};

const presets = TABRIZ.presets.map((p) => {
  const merged: Record<string, unknown> = {};
  for (const k of KEYS) merged[k] = SYNTH_PARAMS[k].def;
  Object.assign(merged, TABRIZ.base, p.patch);
  const patch: Record<string, unknown> = {};
  for (const k of KEYS) if (merged[k] !== undefined) patch[k] = merged[k];
  return { id: p.id, name: p.name, group: p.group, patch };
});

const dir = new URL("../ios/Tabriz/", import.meta.url);
writeFileSync(new URL("presets.json", dir), JSON.stringify(presets, null, 1));
writeFileSync(new URL("panel.json", dir), JSON.stringify(panel, null, 1));
console.log(`${presets.length} presets x ${KEYS.length} params; ${panel.sections.length} sections on ${panel.pages.length} pages`);
console.log(Object.entries(params).map(([k, v]: [string, any]) => `${k}:${v.choice ? "choice" : v.kind}`).join(" "));
