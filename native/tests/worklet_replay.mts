// Replay a captured worklet message log into the web TypeScript processor.
//   bun worklet_replay.mts <processor.ts> <messages.txt> <seconds> out.f32
// replay worklet messages into the TS FM processor (fake worklet globals), render, dump
import { readFileSync, writeFileSync } from "node:fs";
const lines = readFileSync(process.argv[3], "utf8").split("\n").filter((l) => l.startsWith("MSG "));
const msgs = lines.map((l) => { const sp = l.indexOf(" ", 4); return { t: +l.slice(4, sp), m: JSON.parse(l.slice(sp + 1)) }; });
let proc: any = null;
(globalThis as any).sampleRate = 48000;
(globalThis as any).currentTime = 0;
(globalThis as any).AudioWorkletProcessor = class { port: any = { onmessage: null, postMessage() {} }; };
(globalThis as any).registerProcessor = (_n: string, C: any) => { proc = new C(); };
await import(process.argv[2]);
const N = Math.floor(Number(process.argv[4]) * 48000), L = new Float32Array(N), R = new Float32Array(N);
let mi = 0;
const flat: string[] = [];
// one line per engine call, for the C++ replay (no JSON parsing there)
const flatten = (t: number, m: any): string[] => {
  const val = (v: any) => (typeof v === "string" ? `s\t${v}` : `n\t${v}`);
  if (m.t === "patch") return [...Object.entries(m.patch).map(([k, v]) => `P\t${t}\t${k}\t${val(v)}`), ...(typeof m.orbitRateHz === "number" ? [`P\t${t}\torbitRateHz\tn\t${m.orbitRateHz}`] : []), `S\t${t}`];
  if (m.t === "path") return Array.isArray(m.pts) && m.pts.length >= 2 ? [`W\t${t}\t` + m.pts.slice(0, 256).map((p: any) => `${Number(p?.[0]) || 0.5}\t${Number(p?.[1]) || 0.5}`).join("\t")] : [];
  if (m.t === "param") return typeof m.value === "number" || typeof m.value === "string" ? [`P\t${t}\t${m.key}\t${val(m.value)}`] : [];
  return [`M\t${t}\t${m.t}\t${m.id | 0}\t${Number(m.midi) || 0}\t${Number(m.cents) || 0}\t${m.vel === undefined ? 1 : Number(m.vel)}\t${Number(m.at) || 0}\t${Number(m.from) || 0}\t${Number(m.glide) || 0}\t${Number(m.v) || 0}`];
};
for (let f = 0; f < N; f += 128) {
  const t = f / 48000;
  while (mi < msgs.length && msgs[mi].t <= t + 1e-9) {
    // the plugin's shim forwards only number and string values: give the TS processor the same
    const m = msgs[mi].m;
    if (m.t === "patch") m.patch = Object.fromEntries(Object.entries(m.patch).filter(([, v]) => typeof v === "number" || typeof v === "string"));
    proc.port.onmessage({ data: m });
    flat.push(...flatten(msgs[mi].t, m));
    mi++;
  }
  (globalThis as any).currentTime = t;
  proc.process([], [[L.subarray(f, f + 128), R.subarray(f, f + 128)]]);
}
writeFileSync(process.argv[5], Buffer.concat([Buffer.from(L.buffer), Buffer.from(R.buffer)]));
writeFileSync(process.argv[5] + ".calls", flat.join("\n"));
