// Native worklet engines vs the web's own TypeScript processors, on the same message stream.
// A scene runs in the plugin engine (engine_render) and logs every worklet message with its
// time; the log is replayed into the TS processor (bun) and into the C++ engine, and the two
// outputs must be bit-identical. Deterministic (no browser involved).
//   node native/tests/worklet_replay.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const tmp = "/tmp/worklet_replay";
mkdirSync(tmp, { recursive: true });
execFileSync("bun", ["native/js/build.ts"], { stdio: "ignore" });
const q = "native/third_party/quickjs";
const objs = [];
for (const f of ["quickjs.c", "libregexp.c", "libunicode.c", "dtoa.c"]) {
  const o = `${tmp}/${f}.o`;
  try { readFileSync(o); } catch { execFileSync("gcc", ["-O2", "-c", `${q}/${f}`, "-o", o]); }
  objs.push(o);
}
execFileSync("g++", ["-O2", "-std=c++17", `-I${q}`, "native/tests/engine_render.cpp", ...objs, "-lm", "-o", `${tmp}/engine_render`]);
execFileSync("g++", ["-O2", "-std=c++17", "native/tests/worklet_replay.cpp", "-o", `${tmp}/replay`]);

const Q = 128 / 48000, T = (s) => `${Math.round(s / Q)} * ${Q}`;
const log = `globalThis.__wkTransform = (m) => { if (m && m.t) console.log("MSG " + __wa.time().toFixed(9) + " " + JSON.stringify(m)); return m; };`;
const presets = (machine, picks, notes) => `S.setMachine("${machine}"); S.prepareAudio(); const ps = S.getMachine().presets; ` +
  picks.map((p, i) => { const t = 0.2 + i * 0.8; return `at(${T(t)}, () => { S.applySynthPreset(ps[${p}].id); ${notes.map(([n, v]) => `S.noteOn(${n}, ${v});`).join(" ")} }); at(${T(t + 0.5)}, () => { ${notes.map(([n]) => `S.noteOff(${n});`).join(" ")} });`; }).join(" ");
const scenes = [
  { name: "Kashan FM: presets while notes ring", proc: "sy1-fm", ts: "src/engine/worklet/fm-processor.ts", len: 3.6, js: presets("kashan", [0, 3, 6, 9], [[57, 0.8], [64, 0.6]]) + ` at(${T(1.3)}, () => S.setModWheel(0.8)); at(${T(2.1)}, () => S.setPitchBend(-0.4));` },
  { name: "Kashan FM: glide (mono legato)", proc: "sy1-fm", ts: "src/engine/worklet/fm-processor.ts", len: 2.5, js: `S.setMachine("kashan"); S.prepareAudio(); S.setSynthParam("polyMode", "mono"); S.setSynthParam("legato", "on"); S.setSynthParam("glide", 0.1); at(${T(0.2)}, () => S.noteOn(52, 0.9)); at(${T(0.6)}, () => S.noteOn(59, 0.7)); at(${T(1.0)}, () => S.noteOff(59)); at(${T(1.4)}, () => S.noteOff(52));` },
  { name: "Shiraz strings: presets, two notes", proc: "sy1-strings", ts: "src/engine/worklet/strings-processor.ts", len: 4.2, js: presets("shiraz", [1, 5, 9, 13], [[55, 0.85], [62, 0.6]]) },
  { name: "Nishapur vector: presets, two notes", proc: "sy1-vector", ts: "src/engine/worklet/vector-processor.ts", len: 4.2, js: presets("nishapur", [0, 1, 2, 3], [[57, 0.85], [64, 0.6]]) + ` at(${T(1.4)}, () => S.setModWheel(0.6)); at(${T(2.6)}, () => S.setPitchBend(0.3));` },
  { name: "Nishapur vector: drawn path, filters", proc: "sy1-vector", ts: "src/engine/worklet/vector-processor.ts", len: 3.0, js: `S.setMachine("nishapur"); S.prepareAudio(); at(${T(0.1)}, () => { S.setSynthParam("orbitMode", "drawn"); S.call("setVectorDrawnPath", [[[0.1,0.2],[0.8,0.3],[0.6,0.9],[0.2,0.7],[0.5,0.5]]]); S.noteOn(48, 0.9); S.noteOn(55, 0.7); }); at(${T(1.0)}, () => S.setSynthParam("filterType", "bandpass")); at(${T(1.6)}, () => S.setSynthParam("filterType", "highpass")); at(${T(2.2)}, () => { S.noteOff(48); S.noteOff(55); });` },
  { name: "Shiraz strings: riz tremolo + bend", proc: "sy1-strings", ts: "src/engine/worklet/strings-processor.ts", len: 2.5, js: `S.setMachine("shiraz"); S.prepareAudio(); S.setSynthParam("riz", "on"); at(${T(0.2)}, () => S.noteOn(64, 0.8)); at(${T(0.8)}, () => S.setPitchBend(0.5)); at(${T(1.8)}, () => S.noteOff(64));` }
];

let ok = true;
for (const sc of scenes) {
  writeFileSync(`${tmp}/scene.js`, log + "\n" + sc.js);
  const r = spawnSync(`${tmp}/engine_render`, ["48000", String(sc.len), `${tmp}/scene.js`, `${tmp}/full.f32`]);
  writeFileSync(`${tmp}/msgs.txt`, r.stderr.toString());
  execFileSync(process.env.TSRUN || "bun", [...(process.env.TSRUN ? ["--experimental-strip-types", "--no-warnings"] : []), "native/tests/worklet_replay.mts", `${process.cwd()}/${sc.ts}`, `${tmp}/msgs.txt`, String(sc.len), `${tmp}/ts.f32`]);
  execFileSync(`${tmp}/replay`, [sc.proc, `${tmp}/ts.f32.calls`, String(sc.len), `${tmp}/cpp.f32`]);
  const a = new Float32Array(readFileSync(`${tmp}/ts.f32`).buffer.slice(0)), b = new Float32Array(readFileSync(`${tmp}/cpp.f32`).buffer.slice(0));
  let max = 0, peak = 0;
  for (let i = 0; i < a.length; i++) { max = Math.max(max, Math.abs(a[i] - b[i])); peak = Math.max(peak, Math.abs(a[i])); }
  const n = r.stderr.toString().split("\n").filter((l) => l.startsWith("MSG")).length;
  console.log(`${sc.name.padEnd(40)} ${String(n).padStart(5)} messages  peak ${peak.toFixed(3)}  max diff ${max}`);
  if (max !== 0 || peak === 0) ok = false;
}
console.log(ok ? "all bit-identical" : "MISMATCH");
if (!ok) process.exitCode = 1;
