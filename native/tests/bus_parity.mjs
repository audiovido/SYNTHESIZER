// Parity of the native FX bus (native/dsp/bus.hpp) with the web bus (src/engine/bus.ts)
// rendered by Chromium. Run from the repo root:  node native/tests/bus_parity.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import pw from "playwright";

const tmp = "/tmp/bus_parity";
mkdirSync(tmp, { recursive: true });
writeFileSync(`${tmp}/entry.ts`, `import { getSynthBus, setMainToFx } from "${process.cwd()}/src/engine/bus";\n(window as any).BusLib = { getSynthBus, setMainToFx };\n`);
execFileSync("bun", ["build", `${tmp}/entry.ts`, "--format=iife", `--outfile=${tmp}/bus.js`]);
const x86 = process.env.WA_SCALAR ? [] : ["-DWA_X86_PARAMS"]; // this test machine runs Chrome on x86
execFileSync("g++", ["-O2", "-std=c++17", ...x86, "native/tests/bus_render.cpp", "-o", `${tmp}/bus_render`]);

const base = { drive: 0, eqLow: 0, eqMid: 0, eqHigh: 0, delayTime: 0.3, delayFb: 0.3, delayMix: 0, chorusRate: 0.6, chorusDepth: 0.5, chorusMix: 0, revSize: 2.2, revMix: 0, volume: 0.8 };
const ONLY = process.env.ONLY;
const scenes0 = [
  { name: "dry chord", feed: ["chord", 1, 0.5], patch: {} },
  { name: "drive + eq", feed: ["chord", 1, 0.5], patch: { drive: 0.35, eqLow: 4, eqMid: -3, eqHigh: 5 } },
  { name: "delay", feed: ["burst", 4, 0.6], patch: { delayTime: 0.27, delayFb: 0.7, delayMix: 0.6 } },
  { name: "chorus", feed: ["chord", 2, 0.5], patch: { chorusMix: 0.8, chorusDepth: 0.7, chorusRate: 0.9 } },
  { name: "chorus baku", feed: ["chord", 2, 0.5], patch: { chorusMix: 0.4, chorusDepth: 0.5, chorusRate: 0.5, volume: 0.7 } },
  { name: "reverb", feed: ["burst", 5, 0.6], patch: { revMix: 0.7, revSize: 3.5 } },
  { name: "everything + limiter", feed: ["chord", 3, 1.6], patch: { drive: 0.2, delayMix: 0.4, delayFb: 0.5, chorusMix: 0.5, revMix: 0.6, volume: 1 } },
  { name: "knob moves", feed: ["chord", 6, 0.6], patch: { revMix: 0.3, delayMix: 0.3 },
    events: [[0.4, "drive", 0.5], [0.5, "eqHigh", -6], [0.7, "delayTime", 0.12], [0.9, "revSize", 1.2], [1.1, "chorusMix", 0.6], [1.3, "volume", 0.5], [1.5, "master", 0.7]] },
  { name: "drum sends", feed: ["burst", 8, 0.7], mainFx: 0, send: 0.6, patch: { revMix: 0.5, delayMix: 0.4 } },
  { name: "44.1 kHz", rate: 44100, feed: ["chord", 9, 0.6], patch: { revMix: 0.5, chorusMix: 0.4, delayMix: 0.3 } }
];
const scenes = ONLY ? scenes0.filter((s) => s.name === ONLY) : scenes0;

const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");
await page.addScriptTag({ content: readFileSync(`${tmp}/bus.js`, "utf8") });

let worst = -Infinity;
for (const sc of scenes) {
  const rate = sc.rate || 48000, len = 2;
  const patch = { ...base, ...sc.patch };
  const web = await page.evaluate(async ({ rate, len, patch, feed, mainFx, send, events }) => {
    const total = Math.floor(rate * len);
    const ctx = new OfflineAudioContext(2, total, rate);
    const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const [kind, p, amp] = feed;
    const b = ctx.createBuffer(2, total, rate), L = b.getChannelData(0), R = b.getChannelData(1), r = rng(p);
    for (let i = 0; i < total; i++) {
      const t = i / rate; let l = 0, rr = 0;
      if (kind === "burst") { const ph = t % 0.4, nl = r() * 2 - 1, nr = r() * 2 - 1, e = ph < 0.05 ? Math.exp(-ph * 60) : 0; l = nl * e; rr = nr * e; }
      else if (kind === "chord") { const f = [110, 164.81, 220.5]; for (let k = 0; k < 3; k++) { l += (2 * ((t * f[k]) % 1) - 1) / 3; rr += (2 * ((t * f[k] * 1.003) % 1) - 1) / 3; } const env = Math.min(1, t * 8) * (t % 1 < 0.6 ? 1 : 0.2); l *= env; rr *= env; }
      L[i] = l * amp; R[i] = rr * amp;
    }
    BusLib.setMainToFx(mainFx !== 0);
    const bus = BusLib.getSynthBus(ctx, patch);
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(bus.input);
    if (send > 0) { const g = ctx.createGain(); g.gain.value = send; src.connect(g); g.connect(bus.sendIn); }
    src.start(0);
    const mkCurve = (amount) => { const k = amount * 60, n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x)); } return c; };
    for (const [t, key, v] of events || []) {
      ctx.suspend(t).then(() => {
        const now = ctx.currentTime;
        // same as setSynthParam's bus branch (src/engine/synth.ts)
        if (key === "drive") { bus.drive.curve = mkCurve(v); bus.driveComp.gain.setTargetAtTime(1 / (1 + v * 1.5), now, 0.02); }
        else if (key === "eqLow") bus.eqLow.gain.setTargetAtTime(v, now, 0.02);
        else if (key === "eqMid") bus.eqMid.gain.setTargetAtTime(v, now, 0.02);
        else if (key === "eqHigh") bus.eqHigh.gain.setTargetAtTime(v, now, 0.02);
        else if (key === "delayTime") bus.delay.delayTime.setTargetAtTime(v, now, 0.05);
        else if (key === "delayFb") bus.fb.gain.setTargetAtTime(Math.min(0.95, v), now, 0.02);
        else if (key === "delayMix") bus.delayWet.gain.setTargetAtTime(v * 0.7, now, 0.02);
        else if (key === "revMix") bus.revWet.gain.setTargetAtTime(v * 0.9, now, 0.02);
        else if (key === "chorusMix") bus.chorusWet.gain.setTargetAtTime(v * 0.9, now, 0.03);
        else if (key === "chorusRate") bus.chorusLfo.frequency.setTargetAtTime(v, now, 0.05);
        else if (key === "chorusDepth") { bus.chorusDepthL.gain.setTargetAtTime(0.004 * v, now, 0.05); bus.chorusDepthR.gain.setTargetAtTime(-0.004 * v, now, 0.05); }
        else if (key === "volume") bus.master.gain.setTargetAtTime(v, now, 0.02);
        else if (key === "revSize") bus.reverbCombs.forEach((c) => c.fb.gain.setTargetAtTime(Math.min(0.97, Math.max(0, Math.pow(10, (-3 * c.delaySec) / Math.max(0.05, v)) / bus.dampPeakGain)), now, 0.05));
        else if (key === "master") bus.out.gain.setTargetAtTime(v * v, now, 0.015);
        ctx.resume();
      });
    }
    const out = await ctx.startRendering();
    const a = out.getChannelData(0), c = out.getChannelData(1), res = new Array(total * 2);
    for (let i = 0; i < total; i++) { res[2 * i] = a[i]; res[2 * i + 1] = c[i]; }
    return res;
  }, { rate, len, patch, feed: sc.feed, mainFx: sc.mainFx ?? 1, send: sc.send ?? 0, events: sc.events });

  const args = [String(rate), String(len), sc.feed[0], String(sc.feed[1]), String(sc.feed[2]), String(sc.mainFx ?? 1), String(sc.send ?? 0),
    Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(","), ...(sc.events || []).map(([t, k, v]) => `${t}:${k}=${v}`), `${tmp}/out.f32`];
  const measure = (mask) => {
    execFileSync(`${tmp}/bus_render`, args, { env: { ...process.env, AP_ORDER: String(mask) } });
    const nb = readFileSync(`${tmp}/out.f32`);
    const nat = new Float32Array(nb.buffer, nb.byteOffset, nb.byteLength / 4);
    let maxErr = 0, e2 = 0, s2 = 0, peak = 0;
    for (let i = 0; i < web.length; i++) { const e = Math.abs(web[i] - nat[i]); maxErr = Math.max(maxErr, e); e2 += e * e; s2 += web[i] * web[i]; peak = Math.max(peak, Math.abs(web[i])); }
    return { maxErr, rel: 10 * Math.log10(e2 / s2), peak };
  };
  // The web reverb's allpass topology depends on Chrome's hash-set order (random per page load):
  // find which of the 16 orders this page load used, so the rest of the bus is checked exactly.
  let best = { ...measure(0), mask: 0 };
  if ((patch.revMix > 0) && best.rel > -60) {
    for (let m = 1; m < 16; m++) { const r = measure(m); if (r.rel < best.rel) best = { ...r, mask: m }; if (best.rel < -60) break; }
  }
  const { maxErr, rel, peak } = best;
  worst = Math.max(worst, rel);
  console.log(`${sc.name.padEnd(24)} peak ${peak.toFixed(3)}  max err ${maxErr.toExponential(2)}  error ${rel.toFixed(1)} dB${best.mask ? `  (allpass order ${best.mask})` : ""}`);
}
await browser.close();
console.log(`worst: ${worst.toFixed(1)} dB below the signal`);
