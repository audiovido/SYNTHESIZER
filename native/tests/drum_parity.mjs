// Drum machines: the web drum code (src/engine/drums.ts + drum-models.ts) rendered by
// Chrome vs the same code in QuickJS on native/wa.   node native/tests/drum_parity.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import pw from "/opt/node-tools/node_modules/playwright/index.js";

const tmp = "/tmp/drum_parity";
mkdirSync(tmp, { recursive: true });
execFileSync("bun", ["native/js/build.ts"]);
const q = "native/third_party/quickjs";
const objs = [];
for (const f of ["quickjs.c", "libregexp.c", "libunicode.c", "dtoa.c"]) {
  const o = `${tmp}/${f}.o`;
  try { readFileSync(o); } catch { execFileSync("gcc", ["-O2", "-c", `${q}/${f}`, "-o", o]); }
  objs.push(o);
}
execFileSync("g++", ["-O3", "-std=c++17", ...(process.env.WA_SCALAR ? [] : ["-DWA_X86_PARAMS"]), `-I${q}`, "native/tests/drum_render.cpp", ...objs, "-lm", "-o", `${tmp}/drum_render`]);

const VOICES = ["kick", "snare", "clap", "ch", "oh", "tom", "rim", "bell"];
const MODELS = ["analog", "tr909", "tr707", "tr606", "cr78", "lm80", "acoustic", "persian", "minimal"];
const rate = +(process.env.RATE || 48000), len = 3.2;

function scene(model, seed, knobs) {
  const hits = [];
  let t = 0.1;
  VOICES.forEach((v, i) => { hits.push([v, 1, t]); t += 0.17; hits.push([v, 0.45, t]); t += 0.13; });
  hits.push(["oh", 0.9, 2.55], ["ch", 0.8, 2.62], ["kick", 0.7, 2.7], ["snare", 1, 2.7]);
  const patch = { drumGlue: 0.35, ...knobs };
  return `(function () {
    let a = ${seed};
    Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ctx = globalThis.__ctx;
    const main = ctx.createGain(), send = ctx.createGain();
    send.gain.value = 0.5;
    main.connect(ctx.destination); send.connect(ctx.destination);
    const patch = ${JSON.stringify(patch)};
    SY1E.configureDrums(() => patch, () => ({ main, send }));
    SY1E.setDrumKit(${JSON.stringify(model)}, {});
    for (const [v, vel, t] of ${JSON.stringify(hits)}) SY1E.triggerDrum(v, vel, t);
  })();`;
}

const scenes = [];
MODELS.forEach((m, i) => scenes.push({ name: m, js: scene(m, 11 + i, {}) }));
scenes.push({ name: "knobs (pan/color/drive)", js: scene("analog", 99, { kickDrive: 0.6, snarePan: -0.7, chColor: 0.5, ohColor: -0.4, tomTune: 5, clapDecay: 1.6, bellSend: 0, drumGlue: 0.8 }) });
scenes.push({ name: "fusion kit (per-slot models)", js: scene("analog", 7, { kitModel: "tr909", snareModel: "acoustic", tomModel: "persian", bellModel: "minimal" }) });

const bundle = readFileSync("native/js/dist/drums.js", "utf8");
const browser = await pw.chromium.launch();
let worst = -Infinity;
for (const sc of scenes) {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const web = await page.evaluate(async ({ bundle, js, rate, len }) => {
    const total = Math.floor(rate * len);
    const ctx = new OfflineAudioContext(2, total, rate);
    globalThis.__ctx = ctx;
    (0, eval)(bundle);
    (0, eval)(js);
    const b = await ctx.startRendering();
    const L = b.getChannelData(0), R = b.getChannelData(1), out = new Array(total * 2);
    for (let i = 0; i < total; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
    return out;
  }, { bundle, js: sc.js, rate, len });
  await page.close();
  writeFileSync(`${tmp}/scene.js`, sc.js);
  execFileSync(`${tmp}/drum_render`, [String(rate), String(len), `${tmp}/scene.js`, `${tmp}/out.f32`], { stdio: ["ignore", "ignore", "pipe"] });
  const nb = readFileSync(`${tmp}/out.f32`);
  const nat = new Float32Array(nb.buffer, nb.byteOffset, nb.byteLength / 4);
  let maxErr = 0, e2 = 0, s2 = 0, peak = 0, at = 0;
  for (let i = 0; i < web.length; i++) { const e = Math.abs(web[i] - nat[i]); if (e > maxErr) { maxErr = e; at = i >> 1; } e2 += e * e; s2 += web[i] * web[i]; peak = Math.max(peak, Math.abs(web[i])); }
  const rel = 10 * Math.log10(e2 / s2);
  worst = Math.max(worst, rel);
  console.log(`${sc.name.padEnd(30)} peak ${peak.toFixed(3)}  max err ${maxErr.toExponential(2)} (t ${(at / rate).toFixed(3)} s)  error ${rel.toFixed(1)} dB`);
}
await browser.close();
console.log(`worst: ${worst.toFixed(1)} dB below the signal`);
