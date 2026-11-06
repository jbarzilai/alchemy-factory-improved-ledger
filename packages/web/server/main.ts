import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { loadEnv, loadSettings, repoRoot, resolveSave, saveRoots, type Settings } from '@af-ledger/core';
import { buildApp } from './app';
import { isApiPath } from './api';
import type { WebArgs } from './args';
import { loadIconStore } from './icons';
import { fileFlagStore } from './flagStore';
import { LedgerCache } from './state';
import { SaveWatcher } from './watch';

export { parseWebArgs } from './args';

// Shared by startServer and inject tests; clientDir permits an isolated production client in tests.
export async function attachClient(app: FastifyInstance, mode: WebArgs['mode'], clientDir?: string): Promise<void> {
  if (mode === 'dev') {
    const { createServer } = await import('vite');
    const { default: middie } = await import('@fastify/middie');
    const vite = await createServer({
      configFile: path.join(repoRoot(), 'packages/web/vite.config.ts'),
      root: path.join(repoRoot(), 'packages/web/client'),
      server: { middlewareMode: true, hmr: { server: app.server } }, appType: 'spa',
    });
    app.addHook('onClose', async () => { await vite.close(); });
    await app.register(middie);
    // API misses must reach Fastify's JSON handler, rather than Vite's SPA fallback.
    app.use((req, res, next) => {
      if (isApiPath(req.url ?? '/')) return next();
      vite.middlewares(req, res, next);
    });
  } else {
    const { default: staticPlugin } = await import('@fastify/static');
    await app.register(staticPlugin, {
      root: clientDir ?? path.join(repoRoot(), 'packages/web/dist/client'),
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (isApiPath(request.url)) return reply.code(404).send({ error: 'unknown API route' });
      // Only page routes fall back to the SPA; a missing asset (e.g. an old hashed bundle) stays a 404.
      if ((request.method !== 'GET' && request.method !== 'HEAD') || path.extname(request.url.split('?')[0])) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }
}

export async function startServer(
  args: WebArgs, source: NodeJS.ProcessEnv, settings: Settings = loadSettings(),
): Promise<{ url: string; close(): Promise<void> }> {
  const { env, envError } = loadEnv(source);
  if (envError) console.warn(envError);
  const cache = new LedgerCache({ save: args.save, env, flags: settings.flags });
  const save = resolveSave({ save: args.save, roots: args.save ? [] : saveRoots(env) });
  const watcher = new SaveWatcher(cache, { intervalMs: settings.web.watchIntervalMs });
  const app = await buildApp({ cache, icons: loadIconStore(), watcher, flags: fileFlagStore(), host: settings.web.host });
  try {
    await attachClient(app, args.mode);
    const address = await app.listen({ port: settings.web.port, host: settings.web.host });
    watcher.start();
    // listen() reports the resolved address (127.0.0.1); print the configured host, which the README tells users to open.
    const url = `http://${settings.web.host}:${new URL(address).port}`;
    console.log(`Alchemy Ledger: ${url} (save: ${save.file})`);
    return { url, close: () => app.close() };
  } catch (error) {
    await app.close();
    throw error;
  }
}
