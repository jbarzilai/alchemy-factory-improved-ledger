// Bundles the CLI into one executable ESM file: npm run build (works from any cwd).
import { chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const outfile = here('./dist/af-ledger.mjs');

await build({
  entryPoints: [here('./src/main.ts')],
  bundle: true,
  external: ['sharp'],
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});
chmodSync(outfile, 0o755);
