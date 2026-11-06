// Compare native/wa (C++) with Chromium's Web Audio on the same scene scripts.
//   node native/tests/wa_scene.mjs native/tests/scenes/*.txt
// Builds /tmp/wa_scene from wa_scene.cpp if needed. Prints max error and the
// error level relative to the signal for every scene.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = "/tmp/wa_scene";
execFileSync("g++", ["-O2", "-std=c++17", ...(process.env.WA_X86 ? ["-DWA_X86_PARAMS"] : []), path.join(here, "wa_scene.cpp"), "-o", bin]);

function runInPage(script) {
  // executed inside Chromium
  return (async (script) => {
    const lines = script.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).map((l) => l.split(/\s+/));
    let sr = 48000, len = 1;
    for (const t of lines) { if (t[0] === "rate") sr = +t[1]; if (t[0] === "len") len = +t[1]; }
    const total = Math.floor(len * sr);
    const ctx = new OfflineAudioContext(2, total, sr);
    const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const drive = (amount) => { const k = amount * 60, n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x)); } return c; };
    const tanhC = () => { const n = 1024, c = new Float32Array(n), k = 1.6; for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; };
    const soft = () => { const n = 8193, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = ((i / (n - 1)) * 2 - 1) * 4, a = Math.abs(x); const y = a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1); c[i] = x < 0 ? -y : y; } return c; };
    const feed = (kind, p, amp) => {
      const b = ctx.createBuffer(2, total, sr), L = b.getChannelData(0), R = b.getChannelData(1), r = rng(p);
      for (let i = 0; i < total; i++) {
        const t = i / sr; let l = 0, rr = 0;
        if (kind === "noise") { l = r() * 2 - 1; rr = r() * 2 - 1; }
        else if (kind === "tone") { l = Math.sin(2 * Math.PI * p * t); rr = Math.sin(2 * Math.PI * p * 1.5 * t); }
        else if (kind === "burst") { const ph = t % 0.4, nl = r() * 2 - 1, nr = r() * 2 - 1, e = ph < 0.05 ? Math.exp(-ph * 60) : 0; l = nl * e; rr = nr * e; }
        else if (kind === "chord") { const f = [110, 164.81, 220.5]; for (let k = 0; k < 3; k++) { l += (2 * ((t * f[k]) % 1) - 1) / 3; rr += (2 * ((t * f[k] * 1.003) % 1) - 1) / 3; } const env = Math.min(1, t * 8) * (t % 1 < 0.6 ? 1 : 0.2); l *= env; rr *= env; }
        L[i] = l * amp; R[i] = rr * amp;
      }
      const s = ctx.createBufferSource(); s.buffer = b; s.start(0); return s;
    };
    const nodes = {};
    const exec = (t) => {
      const op = t[0], N = (i) => nodes[t[i]], D = (i) => +t[i];
      if (op === "node") {
        const ty = t[2]; let n;
        if (ty === "gain") n = ctx.createGain();
        else if (ty === "pass") n = ctx.createAnalyser();
        else if (ty === "biquad") { n = ctx.createBiquadFilter(); n.type = t[3]; }
        else if (ty === "delay") n = ctx.createDelay(D(3));
        else if (ty === "shaper") { n = ctx.createWaveShaper(); let i = 3; if (t[i] === "drive") { n.curve = drive(D(i + 1)); i += 2; } else if (t[i] === "tanh") { n.curve = tanhC(); i++; } else if (t[i] === "softclip") { n.curve = soft(); i++; } else i++; n.oversample = t[i]; }
        else if (ty === "comp") n = ctx.createDynamicsCompressor();
        else if (ty === "panner") n = ctx.createStereoPanner();
        else if (ty === "osc") { n = ctx.createOscillator(); n.type = t[3]; }
        else if (ty === "noise") { const b = ctx.createBuffer(1, sr * 2, sr), d = b.getChannelData(0), r = rng(D(3)); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; n = ctx.createBufferSource(); n.buffer = b; }
        else if (ty === "merger") n = ctx.createChannelMerger(D(3));
        else if (ty === "iir") { const s = t.indexOf("/"); n = ctx.createIIRFilter(t.slice(3, s).map(Number), t.slice(s + 1).map(Number)); }
        else if (ty === "feed") n = feed(t[3], D(4), D(5));
        nodes[t[1]] = n;
      } else if (op === "connect") N(1).connect(N(2), 0, t.length > 3 ? +t[3] : 0);
      else if (op === "connectp") N(1).connect(N(2)[t[3]]);
      else if (op === "out") N(1).connect(ctx.destination);
      else if (op === "set") N(1)[t[2]].value = D(3);
      else if (op === "ev") { const p = N(1)[t[2]]; p[t[3]](...t.slice(4).map(Number)); }
      else if (op === "start") N(1).start(D(2), ...(t.length > 3 ? [D(3)] : []));
      else if (op === "stop") N(1).stop(D(2));
      else if (op === "loop") N(1).loop = true;
    };
    const blocks = [[0, []]];
    for (const t of lines) { if (t[0] === "rate" || t[0] === "len") continue; if (t[0] === "at") blocks.push([+t[1], []]); else blocks[blocks.length - 1][1].push(t); }
    blocks[0][1].forEach(exec);
    for (const [at, ops] of blocks.slice(1)) ctx.suspend(at).then(() => { ops.forEach(exec); ctx.resume(); });
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), out = new Array(total * 2);
    for (let i = 0; i < total; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
    return out;
  })(script);
}

export async function compare(files, { quiet = false } = {}) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  const results = [];
  for (const f of files) {
    const script = readFileSync(f, "utf8");
    const web = await page.evaluate(runInPage, script);
    execFileSync(bin, [f, "/tmp/wa_scene_out.f32"]);
    const nb = readFileSync("/tmp/wa_scene_out.f32");
    const nat = new Float32Array(nb.buffer, nb.byteOffset, nb.byteLength / 4);
    let maxErr = 0, errE = 0, sigE = 0, peak = 0, at = 0;
    for (let i = 0; i < web.length; i++) {
      const e = Math.abs(web[i] - nat[i]);
      if (e > maxErr) { maxErr = e; at = i >> 1; }
      errE += e * e; sigE += web[i] * web[i]; peak = Math.max(peak, Math.abs(web[i]));
    }
    const rel = sigE > 0 ? 10 * Math.log10(errE / sigE) : -Infinity;
    results.push({ scene: path.basename(f), peak, maxErr, relDb: rel, at });
    if (!quiet) console.log(`${path.basename(f).padEnd(28)} peak ${peak.toFixed(3)}  max err ${maxErr.toExponential(2)} (frame ${at})  error ${rel.toFixed(1)} dB`);
  }
  await browser.close();
  return results;
}

if (process.argv[1] && process.argv[1].endsWith("wa_scene.mjs")) {
  const files = process.argv.slice(2);
  if (!files.length || !files.every(existsSync)) { console.error("usage: node wa_scene.mjs scenes..."); process.exit(1); }
  await compare(files);
}
