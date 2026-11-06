import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@af-ledger/core';
import { fixtureSavePath } from '../../core/test/helpers/fixture';
import { inCodexSandbox } from '../../core/test/helpers/sandbox';
import { buildApp } from '../server/app';
import { attachClient, startServer } from '../server/main';
import { emptyIconStore } from '../server/icons';
import { fixtureCache, tempDir } from './helpers';
it('serves the prod client and SPA fallback while preserving JSON API routes', async () => {
  const { dir, cleanup } = tempDir();
  const html = '<!doctype html><h1>Alchemy Ledger test</h1>';
  writeFileSync(path.join(dir, 'index.html'), html);
  const app = await buildApp({ cache: fixtureCache(), icons: emptyIconStore });
  try {
    await attachClient(app, 'prod', dir);
    for (const url of ['/', '/some/route']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(html);
    }
    // The Host check must also cover the static client, not only the API routes.
    for (const url of ['/', '/some/route', '/index.html']) {
      expect((await app.inject({ url, headers: { host: 'evil.example:4317' } })).statusCode, url).toBe(403);
    }
    const asset = await app.inject('/assets/index-OLDHASH.js');
    expect(asset.statusCode).toBe(404);
    expect((await app.inject('/api/meta')).json().latestDay).toBe(199);
    const unknown = await app.inject('/api/nope');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'unknown API route' });
  } finally { await app.close(); cleanup(); }
});
it.skipIf(inCodexSandbox)('starts on port 0 and closes cleanly', async () => {
  const server = await startServer({ mode: 'prod', save: fixtureSavePath() }, { AF_ENV_FILE: 'none' },
    { ...DEFAULT_SETTINGS, web: { ...DEFAULT_SETTINGS.web, port: 0 } });
  try {
    expect(new URL(server.url).port).not.toBe('0');
    expect(new URL(server.url).hostname).toBe('localhost');
  }
  finally { await server.close(); }
});
