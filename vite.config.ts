import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {defineConfig} from 'vite';

// After the build, fill sw.js with the version and the full list of files to precache (offline support).
function pwaServiceWorker() {
  let root = '';
  return {
    name: 'sy1-pwa-service-worker',
    apply: 'build' as const,
    configResolved(config: {root: string; build: {outDir: string}}) {
      root = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(root, 'sw.js');
      if (!fs.existsSync(swPath)) return;
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          if (fs.statSync(full).isDirectory()) walk(full);
          else files.push(path.relative(root, full).split(path.sep).join('/'));
        }
      };
      walk(root);
      const list = files.filter((f) => f !== 'sw.js').sort();
      const hash = crypto.createHash('sha1');
      list.forEach((f) => hash.update(f).update(fs.readFileSync(path.join(root, f))));
      const version = hash.digest('hex').slice(0, 10);
      const src = fs.readFileSync(swPath, 'utf8')
        .replace('__SW_VERSION__', version)
        .replace('__SW_FILES__', JSON.stringify(['./', ...list]));
      fs.writeFileSync(swPath, src);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [pwaServiceWorker()],
    // Relative asset paths so the build works on GitHub Pages (/SYNTHESIZER/) and anywhere else.
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
