// bun native/js/build.ts  ->  native/js/dist/drums.js
// Bundles engine code from src/ with src/engine/bus.ts replaced by bus-stub.ts.
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const stub = path.join(here, "bus-stub.ts");
// "?worker&url" imports (AudioWorklet modules) become the processor's name: the plugin's
// AudioWorkletNode shim creates the native engine by that name.
const worklets = {
  name: "worklets",
  setup(b) {
    b.onResolve({ filter: /\?worker&url$/ }, (a) => ({ path: a.path, namespace: "worklet" }));
    b.onLoad({ filter: /.*/, namespace: "worklet" }, (a) => ({ contents: `export default ${JSON.stringify(path.basename(a.path))};`, loader: "js" }));
  }
};
async function build(entry, out, stubBus) {
  const plugins = [worklets];
  if (stubBus) plugins.push({ name: "bus-stub", setup(b) { b.onResolve({ filter: /\/bus$/ }, (a) => (a.importer.includes("/src/engine/") ? { path: stub } : undefined)); } });
  const res = await Bun.build({ entrypoints: [path.join(here, entry)], outdir: path.join(here, "dist"), naming: out, format: "iife", target: "browser", plugins });
  if (!res.success) { console.error(res.logs); process.exit(1); }
  console.log("built", res.outputs.map((o) => o.path).join(", "));
}
await build("drums-entry.ts", "drums.js", true);   // drums only (drum parity test)
await build("engine-entry.ts", "engine.js", false); // the whole engine, with the real bus.ts
