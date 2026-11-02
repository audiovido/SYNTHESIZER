// HQ engine parity, TypeScript side: renders the same scenarios as hq_parity.cpp
// with src/dsp/hq-engine.ts and compares against the C++ files.
//
//   g++ -O2 -std=c++17 native/tests/hq_parity.cpp -o hq_parity && ./hq_parity /tmp
//   bun native/tests/hq_parity.mts /tmp
import { readFileSync } from "node:fs";
import { HQEngine } from "../../src/dsp/hq-engine";

const SR = 48000;
const SCENARIOS = 3;
const dir = process.argv[2] || ".";

function scenario(e: HQEngine, which: number): void {
  if (which === 0) {
    e.setParam("osc1Wave", "sawtooth"); e.setParam("osc2Wave", "sawtooth");
    e.setParam("unison", 5); e.setParam("uniDetune", 25); e.setParam("uniWidth", 0.7);
    e.setParam("filterType", "lp24"); e.setParam("cutoff", 900); e.setParam("res", 12); e.setParam("envAmt", 0.6);
    e.setParam("noise", 0.15); e.setParam("lfoTarget", "filter"); e.setParam("lfoShape", "sh");
    e.setParam("lfoDepth", 0.35); e.setParam("lfoRate", 7);
  } else if (which === 1) {
    e.setParam("oriental", "on"); e.setParam("scoop", 0.4); e.setParam("tahrir", 0.7);
    e.setParam("vibDepth", 0.5); e.setParam("vibRate", 6); e.setParam("vibDelay", 0.2);
    e.setParam("osc1Wave", "square"); e.setParam("osc2Wave", "sawtooth"); e.setParam("osc2Detune", 4);
    e.setParam("filterType", "bandpass"); e.setParam("cutoff", 1400); e.setParam("res", 5);
  } else {
    e.setParam("osc1Wave", "triangle"); e.setParam("osc2Wave", "sine"); e.setParam("osc2Oct", 1);
    e.setParam("filterType", "highpass"); e.setParam("cutoff", 300); e.setParam("res", 18);
    e.setParam("lfoTarget", "pitch"); e.setParam("lfoDepth", 0.4); e.setParam("sub", 0.6);
  }
}

function run(which: number): [Float32Array, Float32Array] {
  const e = new HQEngine(SR);
  scenario(e, which);
  e.snapParams();
  const N = SR * 3, B = 128;
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const L = new Float32Array(B), R = new Float32Array(B);
  for (let p = 0, blk = 0; p < N; p += B, blk++) {
    L.fill(0); R.fill(0);
    if (blk === 0) e.noteOn(1, 45, 0, 0.9, 10, 0, 0);
    if (blk === 40) e.noteOn(2, 57, -50, 0.75, 3, 300, 0.2);
    if (blk === 120) e.glideTo(1, 52, -50, 0.15);
    if (blk === 200) e.setParam("cutoff", 2400);
    if (blk === 250) e.setBend(0.5);
    if (blk === 300) e.setMod(0.6);
    if (blk === 400) e.noteOff(1, 5, false);
    if (blk === 500) e.noteOff(2, 0, true);
    if (blk === 600) e.noteOn(3, 64, 25, 0.6, 0, 0, 0);
    if (blk === 900) e.noteOff(3, 0, false);
    e.render(L, R, B);
    for (let i = 0; i < B && p + i < N; i++) { outL[p + i] = L[i]; outR[p + i] = R[i]; }
  }
  return [outL, outR];
}

let worst = 0;
for (let w = 0; w < SCENARIOS; w++) {
  const [l, r] = run(w);
  const buf = readFileSync(`${dir}/hq_cpp_${w}.f32`);
  const cpp = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const N = l.length;
  let maxDiff = 0, errPow = 0, sigPow = 0;
  for (let i = 0; i < N; i++) {
    for (const [ts, c] of [[l[i], cpp[i]], [r[i], cpp[N + i]]]) {
      const d = Math.abs(ts - c);
      if (d > maxDiff) maxDiff = d;
      errPow += d * d;
      sigPow += ts * ts;
    }
  }
  const db = 10 * Math.log10(errPow / Math.max(1e-30, sigPow));
  worst = Math.max(worst, maxDiff);
  console.log(`scenario ${w}: max difference ${maxDiff.toExponential(2)}, error ${errPow === 0 ? "-inf" : db.toFixed(0)} dB below the signal`);
}
// CPU, same benchmark as the C++ side
for (const uni of [1, 5]) {
  const e = new HQEngine(SR);
  e.setParam("osc1Wave", "sawtooth"); e.setParam("unison", uni); e.setParam("res", 10);
  e.setParam("filterType", "lp24"); e.snapParams();
  [48, 52, 55, 59, 62, 64, 67, 71, 74, 77].forEach((m, i) => e.noteOn(i + 1, m, 0, 1, 0, 0, 0));
  const L = new Float32Array(128), R = new Float32Array(128);
  const t0 = performance.now();
  for (let p = 0; p < SR * 10; p += 128) { L.fill(0); R.fill(0); e.render(L, R, 128); }
  const ms = performance.now() - t0;
  console.log(`TS CPU, 10 voices, unison ${uni}: ${ms.toFixed(1)} ms per 10 s of audio = ${(ms / 100).toFixed(2)}% of one core`);
}
process.exit(worst < 1e-5 ? 0 : 1);
