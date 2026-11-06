import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const webDir = fileURLToPath(new URL('../', import.meta.url));
try {
  await build({
    entryPoints: [path.join(webDir, 'server/main.ts')],
    outfile: path.join(webDir, 'dist/server.mjs'),
    bundle: true, platform: 'node', format: 'esm',
    external: ['vite', 'fastify', '@fastify/*'],
  });
  const { parseWebArgs, startServer } = await import(pathToFileURL(path.join(webDir, 'dist/server.mjs')).href);
  const args = parseWebArgs(process.argv.slice(2));
  // npm runs scripts from the repo root; resolve --save against the folder the user ran npm from.
  if (args.save) args.save = path.resolve(process.env.INIT_CWD ?? process.cwd(), args.save);
  if (args.mode === 'prod') {
    const { build: buildClient } = await import('vite');
    await buildClient({ configFile: path.join(webDir, 'vite.config.ts') });
  }
  const server = await startServer(args, process.env);
  const close = () => { server.close().catch(error => { console.error(error); process.exitCode = 1; }); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch (error) {
  console.error(`Alchemy Ledger: ${error.message}`);
  process.exitCode = 1;
}
