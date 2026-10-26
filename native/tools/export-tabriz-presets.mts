// Writes native/ios/Tabriz/presets.json from the web machine definition, so
// the app and the website share one preset bank. Run:
//   npx esbuild native/tools/export-tabriz-presets.mts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs && node /tmp/x.mjs
import { writeFileSync } from "fs";
import { SYNTH_PARAMS } from "../../src/engine/params";
import { TABRIZ } from "../../src/machines/tabriz";

// keys the analog engine reads (src/dsp/analog-engine.ts setParam) + mono/glide + volume
const KEYS = ["osc1Wave", "osc2Wave", "osc3Wave", "osc1Oct", "osc2Oct", "osc3Oct", "osc2Detune", "osc3Detune", "oscMix",
  "osc3Level", "sub", "noise", "filterType", "cutoff", "res", "envAmt", "fA", "fD", "fS", "aA", "aD", "aS", "aR",
  "keyTrack", "filterDrive", "drift", "velSens", "lfoTarget", "lfoShape", "lfoRate", "lfoDepth", "bendRange",
  "glide", "legato", "volume"];

const out = TABRIZ.presets.map((p) => {
  const merged: Record<string, unknown> = {};
  for (const k of KEYS) merged[k] = SYNTH_PARAMS[k]?.def;
  Object.assign(merged, TABRIZ.base, p.patch);
  const patch: Record<string, unknown> = {};
  for (const k of KEYS) if (merged[k] !== undefined) patch[k] = merged[k];
  return { id: p.id, name: p.name, group: p.group, patch };
});
writeFileSync(new URL("../ios/Tabriz/presets.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`${out.length} presets, ${Object.keys(out[0].patch).length} params each`);
