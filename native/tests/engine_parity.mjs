// The whole web engine (src/engine/*, as the app runs it in Chrome) vs the same code in the
// plugin engine (QuickJS on native/wa with native voice engines).
//   (vite dev server on :3344)  node native/tests/engine_parity.mjs
// Both sides run the same scene with S = engine API and at(t, fn). Chrome renders with an
// OfflineAudioContext; its timers (arpeggiator, drum sequencer) are driven by the render clock
// at every 128-frame boundary, exactly like the plugin runs them.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import pw from "playwright";

const tmp = "/tmp/engine_parity";
mkdirSync(tmp, { recursive: true });
execFileSync("bun", ["native/js/build.ts"], { stdio: "ignore" });
const q = "native/third_party/quickjs";
const objs = [];
for (const f of ["quickjs.c", "libregexp.c", "libunicode.c", "dtoa.c"]) {
  const o = `${tmp}/${f}.o`;
  try { readFileSync(o); } catch { execFileSync("gcc", ["-O2", "-c", `${q}/${f}`, "-o", o]); }
  objs.push(o);
}
execFileSync("g++", ["-O3", "-std=c++17", ...(process.env.WA_SCALAR ? [] : ["-DWA_X86_PARAMS"]), `-I${q}`, "native/tests/engine_render.cpp", ...objs, "-lm", "-o", `${tmp}/engine_render`]);

const rate = 48000;
const seed = (n) => `{ let a = ${n}; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }`;
const Q = 128 / rate;
// Preset scenes switch the preset 20 ms before their notes: Chrome hands a burst of ~450 preset
// messages to its audio thread over two blocks (measured), which would shift those notes by a block.
// Chrome hands worklet messages to its audio thread at a non-deterministic block; giving note events
// a fixed 2-block lead (both sides) makes the comparison exact without changing any sound.
const LEAD = `globalThis.__wkTransform = (m) => { const r = m && /^(on|off|kill|glide)$/.test(m.t) ? { ...m, at: Math.max(Number(m.at) || 0, __now() + ${2 * 128 / 48000}) } : m; ${process.env.LOGMSG ? 'if (r && r.t && r.t !== "xy") console.log("MSG " + __now().toFixed(6) + " " + JSON.stringify(r));' : ""} return r; };`;
const T = (s) => (Math.round(s / Q) * Q).toFixed(9); // action times on 128-frame boundaries
const chord = (notes, on, off, vel = 0.8) => notes.map((n) => `at(${T(on)}, () => S.noteOn(${n}, ${vel})); at(${T(off)}, () => S.noteOff(${n}));`).join("\n");
const machine = (id, preset) => `S.setMachine(${JSON.stringify(id)}); ${preset ? `S.applySynthPreset(${JSON.stringify(preset)});` : ""} S.prepareAudio();`;

const ONLY = process.env.ONLY;
const scenes0 = [
  { name: "SY-1 init: chord", len: 3, js: machine("sy1") + chord([48, 55, 60, 64], 0.2, 1.4) + chord([62], 1.6, 2.2, 1) },
  { name: "SY-1: knob moves", len: 3, js: machine("sy1") + chord([57, 60, 64], 0.2, 2.2) + `at(${T(0.6)}, () => S.setSynthParam("cutoff", 900)); at(${T(0.9)}, () => S.setSynthParam("revMix", 0.6)); at(${T(1.2)}, () => S.setSynthParam("delayMix", 0.5)); at(${T(1.5)}, () => S.setPitchBend(0.5));` },
  { name: "Yazd pad", len: 4, js: machine("yazd") + chord([50, 57, 62, 65], 0.2, 2.2) },
  { name: "Tabriz mono legato", len: 3, js: machine("tabriz") + `S.setSynthParam("legato", "on"); S.setSynthParam("glide", 0.08);` + chord([45], 0.2, 1.0) + chord([52], 0.6, 1.3) + chord([57], 1.1, 2.0) },
  { name: "Baku arpeggio", len: 4, js: machine("baku") + `S.setSynthParam("arpOn", "on");` + chord([48, 52, 55], 0.2, 3.0) },
  { name: "Baku chord (arp off)", len: 3, js: machine("baku") + `S.setSynthParam("arpOn", "off");` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "Baku dry", len: 3, js: machine("baku") + `S.setSynthParam("arpOn", "off"); S.setSynthParam("revMix", 0); S.setSynthParam("delayMix", 0); S.setSynthParam("chorusMix", 0);` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "Baku chorus only", len: 3, js: machine("baku") + `S.setSynthParam("arpOn", "off"); S.setSynthParam("revMix", 0); S.setSynthParam("delayMix", 0);` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "Baku delay only", len: 3, js: machine("baku") + `S.setSynthParam("arpOn", "off"); S.setSynthParam("revMix", 0); S.setSynthParam("chorusMix", 0);` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "SY-1 chorus", len: 3, js: machine("sy1") + `S.setSynthParam("chorusMix", 0.4); S.setSynthParam("chorusRate", 0.5);` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "SY-1 chorus at start", len: 3, js: `S.setMachine("sy1"); S.setSynthParam("chorusMix", 0.4); S.setSynthParam("revMix", 0); S.prepareAudio();` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "Baku chorus at start", len: 3, js: `S.setMachine("baku"); S.setSynthParam("arpOn", "off"); S.setSynthParam("revMix", 0); S.setSynthParam("delayMix", 0); S.prepareAudio();` + chord([48, 52, 55], 0.2, 2.0) },
  { name: "Kashan FM chord", len: 3, js: machine("kashan") + chord([52, 59, 64], 0.2, 1.6, 0.9) + chord([71], 0.5, 1.2, 0.4) },
  { name: "Kashan presets", len: 4, js: `S.setMachine("kashan"); S.prepareAudio(); const ps = S.getMachine().presets; ` + [0.2, 1.0, 1.8, 2.6].map((t, i) => `at(${T(t - 0.02)}, () => S.applySynthPreset(ps[${i * 3} % ps.length].id)); at(${T(t)}, () => { S.noteOn(57, 0.8); S.noteOn(64, 0.6); }); at(${T(t + 0.6)}, () => { S.noteOff(57); S.noteOff(64); });`).join("\n") + `at(${T(1.4)}, () => S.setModWheel(0.8)); at(${T(2.2)}, () => S.setPitchBend(-0.4));` },
  { name: "Shiraz santur", len: 3, js: machine("shiraz") + chord([62, 69], 0.2, 1.2, 0.9) + chord([74], 0.6, 1.4, 0.5) },
  { name: "Shiraz presets", len: 4, js: `S.setMachine("shiraz"); S.prepareAudio(); const ps = S.getMachine().presets; ` + [0.2, 1.2, 2.2].map((t, i) => `at(${T(t - 0.02)}, () => S.applySynthPreset(ps[${i * 4 + 1}].id)); at(${T(t)}, () => { S.noteOn(55, 0.85); S.noteOn(62, 0.6); }); at(${T(t + 0.7)}, () => { S.noteOff(55); S.noteOff(62); });`).join("\n") },
  { name: "Shiraz riz (tremolo)", len: 3, js: machine("shiraz") + `S.setSynthParam("riz", "on");` + chord([64], 0.2, 1.8, 0.8) },
  { name: "Konya euclid", len: 4, js: machine("konya") + chord([50, 53, 57], 0.2, 3.2) },
  { name: "Nishapur vector chord", len: 4, js: machine("nishapur") + chord([50, 57, 62], 0.2, 2.6, 0.85) + `at(${T(1.2)}, () => S.setModWheel(0.5));` },
  { name: "Nishapur presets", len: 4, js: `S.setMachine("nishapur"); S.prepareAudio(); const ps = S.getMachine().presets; ` + [0.2, 1.2, 2.2].map((t, i) => `at(${T(t - 0.02)}, () => S.applySynthPreset(ps[${i * 5 + 2}].id)); at(${T(t)}, () => { S.noteOn(55, 0.85); S.noteOn(62, 0.6); }); at(${T(t + 0.7)}, () => { S.noteOff(55); S.noteOff(62); });`).join("\n") },
  { name: "Merv chord", len: 3, js: machine("merv") + chord([50, 57, 62], 0.2, 2.0, 0.85) },
  { name: "Isfahan chord", len: 3, js: machine("isfahan") + chord([52, 59, 64], 0.2, 2.0, 0.8) },
  { name: "Bam chord", len: 3, js: machine("bam") + chord([45, 52, 57], 0.2, 2.0, 0.9) },
  { name: "Rasht drums (style)", len: 4, js: machine("rasht") + `at(${T(0.2)}, () => S.drums.startDrums());` },
  { name: "Hormoz drums (style)", len: 4, js: machine("hormoz") + `at(${T(0.2)}, () => S.drums.startDrums());` },
  { name: "Kerman drums (style)", len: 4, js: machine("kerman") + `at(${T(0.2)}, () => S.drums.startDrums());` },
  { name: "Bushehr drums (style)", len: 4, js: machine("bushehr") + `at(${T(0.2)}, () => S.drums.startDrums());` }
];
const scenes = ONLY ? scenes0.filter((s) => s.name.startsWith(ONLY)) : scenes0;

const browser = await pw.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
let worst = -Infinity;
for (const [i, sc] of scenes.entries()) {
  const js = seed(1000 + i) + "\n" + LEAD + "\n" + sc.js;
  const ctx = await browser.newContext();
  await ctx.addInitScript(({ len, rate }) => {
    // the app's AudioContext becomes one OfflineAudioContext of the scene's length
    let single = null;
    class FakeAC extends OfflineAudioContext {
      constructor() { if (single) return single; super(2, Math.floor(len * rate), rate); single = this; }
      // the live app's context is "running"; without this, the app's unlockAudio() would resume the
      // suspended offline render early (a harness artefact, not app behaviour)
      get state() { return "running"; }
      resume() { return Promise.resolve(); }
    }
    window.AudioContext = FakeAC;
    window.__now = () => (single ? single.currentTime : 0);
    const pm = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (m, ...r) { return pm.call(this, window.__wkTransform ? window.__wkTransform(m) : m, ...r); };
    window.webkitAudioContext = FakeAC;
    // timers on the render clock (driven from the scene runner below)
    const realSet = window.setTimeout.bind(window);
    let timers = [], nextId = 1;
    const now = () => (single ? single.currentTime * 1000 : 0);
    window.__clock = { timers, realSet };
    window.setTimeout = (fn, ms, ...a) => { const id = nextId++; timers.push({ id, at: now() + (+ms || 0), fn: () => fn(...a) }); return id; };
    window.setInterval = (fn, ms, ...a) => { const id = nextId++; timers.push({ id, at: now() + (+ms || 0), fn: () => fn(...a), every: Math.max(1, +ms || 1) }); return id; };
    window.clearTimeout = window.clearInterval = (id) => { const k = timers.findIndex((t) => t.id === id); if (k >= 0) timers.splice(k, 1); };
    window.__runTimers = () => {
      const t = now();
      const due = timers.filter((x) => x.at <= t);
      for (const x of due) { if (x.every) x.at = t + x.every; else timers.splice(timers.indexOf(x), 1); }
      for (const x of due) { try { x.fn(); } catch (e) {} }
    };
  }, { len: sc.len, rate });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("page error:", e.message));
  const webMsgs = [];
  if (process.env.LOGMSG) page.on("console", (m) => { const t = m.text(); if (t.startsWith("MSG ")) webMsgs.push(t); });
  await page.goto("http://127.0.0.1:3344/");
  await page.waitForTimeout(800);
  const web = await page.evaluate(async ({ js, len, rate }) => {
    const S = await import("/src/engine/synth.ts");
    const D = await import("/src/engine/drums.ts");
    const H = await import("/src/engine/hq.ts");
    const pending = [];
    const at = (t, fn) => pending.push([t, fn]);
    const B = await import("/src/engine/bus.ts");
    const SS = { ...S, drums: D, bus: B };
    (new Function("S", "at", js))(SS, at);
    // the scene starts the audio (S.prepareAudio), exactly as in the plugin run
    const ctx = new AudioContext();
    // let the worklet modules load (real time) before rendering starts
    for (let k = 0; k < 60 && H.getHQState() !== "ready"; k++) await new Promise((r) => window.__clock.realSet(r, 50));
    await new Promise((r) => window.__clock.realSet(r, 300));
    const Q = 128 / rate, total = Math.floor(len * rate);
    // every quantum boundary: run the scene's actions due then, then the app's timers (same order as the plugin host)
    for (let f = 128; f < total; f += 128) {
      const t = f / rate;
      ctx.suspend(t).then(() => {
        window.__runTimers();
        for (const p of pending.filter((p) => Math.abs(p[0] - t) < Q / 4)) p[1]();
        OfflineAudioContext.prototype.resume.call(ctx);
      });
    }
    const b = await ctx.startRendering();
    const L = b.getChannelData(0), R = b.getChannelData(1), out = new Array(total * 2);
    for (let i = 0; i < total; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
    return out;
  }, { js, len: sc.len, rate });
  await ctx.close();
  writeFileSync(`${tmp}/scene.js`, js);
  if (process.env.LOGMSG) {
    writeFileSync(`${tmp}/web_msgs.txt`, webMsgs.join("\n"));
    const r = spawnSync(`${tmp}/engine_render`, [String(rate), String(sc.len), `${tmp}/scene.js`, `${tmp}/out.f32`], { env: { ...process.env, LOGMSG: "1" } });
    writeFileSync(`${tmp}/nat_msgs.txt`, r.stderr.toString().split("\n").filter((l) => l.startsWith("MSG ")).join("\n"));
  }
  const measure = (mask) => {
    execFileSync(`${tmp}/engine_render`, [String(rate), String(sc.len), `${tmp}/scene.js`, `${tmp}/out.f32`], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SY1_AP_ORDER: String(mask) } });
    const nb = readFileSync(`${tmp}/out.f32`);
    const nat = new Float32Array(nb.buffer, nb.byteOffset, nb.byteLength / 4);
    let e2 = 0, s2 = 0;
    for (let i = 0; i < web.length; i++) { const e = web[i] - nat[i]; e2 += e * e; s2 += web[i] * web[i]; }
    return { nat, rel: s2 > 0 ? 10 * Math.log10(e2 / s2) : 0 };
  };
  // Chrome's reverb allpass order is random per page load: find the one this load used
  let best = { ...measure(0), mask: 0 };
  for (let m = 1; m < 16 && best.rel > -60; m++) { const r = measure(m); if (r.rel < best.rel) best = { ...r, mask: m }; }
  const nat = best.nat;
  let maxErr = 0, e2 = 0, s2 = 0, peak = 0, atF = 0, npeak = 0;
  for (let i = 0; i < web.length; i++) { const e = Math.abs(web[i] - nat[i]); if (e > maxErr) { maxErr = e; atF = i >> 1; } e2 += e * e; s2 += web[i] * web[i]; peak = Math.max(peak, Math.abs(web[i])); npeak = Math.max(npeak, Math.abs(nat[i])); }
  const onset = (a) => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > 1e-4) return i >> 1; return -1; };
  if (process.env.DEBUG) {
    { let f = -1; for (let i = 0; i < web.length; i++) if (Math.abs(web[i] - nat[i]) > 1e-6) { f = i >> 1; break; } console.log('first diff frame', f, (f / rate).toFixed(4)); } console.log('onset web', onset(web), 'plugin', onset(nat)); writeFileSync(`${tmp}/web.json`, JSON.stringify(web)); writeFileSync(`${tmp}/nat.f32`, Buffer.from(nat.buffer.slice(nat.byteOffset, nat.byteOffset + nat.byteLength))); }
  const rel = s2 > 0 ? 10 * Math.log10(e2 / s2) : 0;
  worst = Math.max(worst, rel);
  console.log(`${sc.name.padEnd(24)} peak web ${peak.toFixed(3)} / plugin ${npeak.toFixed(3)}  max err ${maxErr.toExponential(2)} (t ${(atF / rate).toFixed(3)})  error ${rel.toFixed(1)} dB${best.mask ? ` (allpass order ${best.mask})` : ""}`);
}
await browser.close();
console.log(`worst: ${worst.toFixed(1)} dB below the signal`);
