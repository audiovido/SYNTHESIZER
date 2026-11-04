#!/usr/bin/env bash
# Bundle what the plugin embeds: the engine (QuickJS) and the web UI (the app itself).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf plugin/resources && mkdir -p plugin/resources
bun native/js/build.ts
cp native/js/wa-shim.js plugin/resources/wa-shim.js
cp native/js/dist/engine.js plugin/resources/engine.js
npx vite build --outDir plugin/build-ui --emptyOutDir
# the UI files, flattened (vite names are unique); ui-index.html is the page
cp plugin/build-ui/index.html plugin/resources/ui-index.html
find plugin/build-ui -type f ! -name index.html ! -name "*.map" ! -name "sw.js" ! -name "*.webmanifest" -exec cp {} plugin/resources/ \;
rm -rf plugin/build-ui
node plugin/ascii.mjs plugin/resources
ls plugin/resources | wc -l
