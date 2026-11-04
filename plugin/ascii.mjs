// Make the UI's HTML and CSS pure ASCII (numeric escapes), so no web view can mis-decode them.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = process.argv[2];
for (const f of readdirSync(dir)) {
  const p = `${dir}/${f}`;
  if (f.endsWith(".html")) writeFileSync(p, readFileSync(p, "utf8").replace(/[^\x00-\x7f]/gu, (c) => `&#x${c.codePointAt(0).toString(16)};`));
  else if (f.endsWith(".css")) writeFileSync(p, readFileSync(p, "utf8").replace(/[^\x00-\x7f]/gu, (c) => `\\${c.codePointAt(0).toString(16)} `));
}
