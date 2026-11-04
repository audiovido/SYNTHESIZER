// bun native/js/build.ts  ->  native/js/dist/drums.js
// Bundles engine code from src/ with src/engine/bus.ts replaced by bus-stub.ts.
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const stub = path.join(here, "bus-stub.ts");
const res = await Bun.build({
  entrypoints: [path.join(here, "drums-entry.ts")],
  outdir: path.join(here, "dist"),
  naming: "drums.js",
  format: "iife",
  target: "browser",
  plugins: [{
    name: "bus-stub",
    setup(b) {
      b.onResolve({ filter: /\/bus$/ }, (a) => (a.importer.includes("/src/engine/") ? { path: stub } : undefined));
    }
  }]
});
if (!res.success) { console.error(res.logs); process.exit(1); }
console.log("built", res.outputs.map((o) => o.path).join(", "));
