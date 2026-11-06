// Compare the complete native audio output against an unchanged checkout.
// Usage: node native/tests/sound_regression.mjs /absolute/path/to/baseline
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const base = path.resolve(process.argv[2]);
const current = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'sy1-sound-regression-'));
const objects = [];
for (const f of ['quickjs.c', 'libregexp.c', 'libunicode.c', 'dtoa.c']) {
  const out = path.join(temp, f + '.o');
  execFileSync('gcc', ['-O2', '-c', `native/third_party/quickjs/${f}`, '-o', out]);
  objects.push(out);
}
for (const [i, cwd] of [base, current].entries()) {
  execFileSync('bun', ['native/js/build.ts'], { cwd, stdio: 'pipe' });
  execFileSync('g++', ['-O2', '-ffp-contract=off', '-std=c++17', '-Inative/third_party/quickjs',
    'native/tests/engine_render.cpp', ...objects, '-lm', '-o', `${temp}/render${i}`], { cwd });
}
const machines = ['sy1','yazd','tabriz','baku','konya','kashan','shiraz','nishapur','merv','isfahan','bam','kerman','bushehr','rasht','hormoz'];
for (const id of machines) {
  const drum = ['kerman','bushehr','rasht','hormoz'].includes(id);
  const scene = `{
    let seed = 123456; Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    S.setMachine(${JSON.stringify(id)}); S.prepareAudio();
    at(0.128, () => ${drum ? 'S.drums.startDrums()' : 'S.noteOn(60, 0.8)'});
    at(0.768, () => S.applySynthPreset(S.getMachine().presets[1].id));
    at(1.28, () => ${drum ? 'S.drums.stopDrums()' : 'S.noteOff(60)'});
  }`;
  writeFileSync(`${temp}/scene.js`, scene);
  for (const [i, cwd] of [base, current].entries()) execFileSync(`${temp}/render${i}`, ['48000', '2', `${temp}/scene.js`, `${temp}/${i}.f32`], { cwd, stdio: 'pipe' });
  const a = readFileSync(`${temp}/0.f32`), b = readFileSync(`${temp}/1.f32`);
  if (!a.equals(b)) throw new Error(`${id}: audio changed from baseline`);
  console.log(`${id}: ${a.length / 8} stereo frames, bit-identical to baseline`);
}
console.log('All 15 machines: audio unchanged from baseline');
