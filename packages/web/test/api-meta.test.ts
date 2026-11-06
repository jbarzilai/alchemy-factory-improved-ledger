import { utimesSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_FLAG_SETTINGS, IncompleteSaveError } from '@af-ledger/core';
import { fixtureSavePath } from '../../core/test/helpers/fixture';
import { buildApp } from '../server/app';
import { emptyIconStore } from '../server/icons';
import { LedgerCache } from '../server/state';
import type { MetaResponse } from '../shared/api';
import { fixtureCache, fixtureLedger, saveDir } from './helpers';
let app: FastifyInstance;
beforeAll(async () => { app = await buildApp({ cache: fixtureCache(), icons: emptyIconStore }); });
afterAll(async () => { await app.close(); });
it('reports the fixture using display days, copper and quest-inclusive gameProfit', async () => {
  const response = await app.inject('/api/meta');
  expect(response.statusCode).toBe(200);
  const meta = response.json<MetaResponse>();
  expect(meta).toMatchObject({ saveName: '1 Point Oh', firstDay: 1, latestDay: 199, partialDay: 200,
    questBonusPct: 128, stale: false, settings: DEFAULT_FLAG_SETTINGS, flagDefaults: DEFAULT_FLAG_SETTINGS, iconItems: [] });
  expect(meta.file).toBe('SaveGame3.sav');
  // The save's folder stays on the server: on Windows and WSL it holds the user's name. Compare the JSON-encoded
  // form, since JSON doubles a Windows path's backslashes.
  expect(response.body).not.toContain(JSON.stringify(path.dirname(fixtureSavePath())).slice(1, -1));
  expect(Number.isNaN(Date.parse(meta.savedAt))).toBe(false);
  expect(meta.days).toHaveLength(199);
  expect(meta.days[198]).toEqual({ day: 199, profit: 5176205, quests: 595525, gameProfit: 5771730, questCount: 2, flagCount: 3 });
  expect(meta.days[189].flagCount).toBe(4);
});
it('returns 503 for an incomplete first read', async () => {
  const cache = new LedgerCache({ save: fixtureSavePath(), env: {}, flags: DEFAULT_FLAG_SETTINGS,
    load: async () => { throw new IncompleteSaveError('partial'); } });
  const broken = await buildApp({ cache, icons: emptyIconStore });
  try {
    const response = await broken.inject('/api/meta');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'the save is being written by the game; try again in a moment' });
  } finally { await broken.close(); }
});
it('keeps unknown API routes JSON and rejects all non-GET methods', async () => {
  expect((await app.inject('/api/nope')).json()).toEqual({ error: 'unknown API route' });
  expect((await app.inject('/api/nope')).statusCode).toBe(404);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const) {
    expect((await app.inject({ method, url: '/api/meta' })).statusCode).toBe(405);
    expect((await app.inject({ method, url: '/api/nope' })).statusCode).toBe(405);
  }
});

it('answers every route only when the Host is localhost or an IP address, so a DNS-rebound page reads nothing', async () => {
  const get = (url: string, host: string) => app.inject({ url, headers: { host } });
  for (const url of ['/api/meta', '/api/history', '/api/items', '/api/day/199', '/api/icon/ManaPotion', '/api/events', '/', '/index.html']) {
    for (const host of ['evil.example:4317', 'evil.example']) {
      const response = await get(url, host);
      expect(response.statusCode, `${url} via ${host}`).toBe(403);
      expect(response.json()).toEqual({ error: 'open the ledger through localhost or an IP address' });
    }
  }
  for (const host of ['localhost:4317', 'LocalHost:4317', '127.0.0.1:4317', '[::1]:4317', '192.168.1.20:4317']) {
    expect((await get('/api/meta', host)).statusCode, host).toBe(200);
  }
});

it('also answers through the host name set in config/settings.json', async () => {
  const named = await buildApp({ cache: fixtureCache(), icons: emptyIconStore, host: 'MyPC.local' });
  try {
    const get = (host: string) => named.inject({ url: '/api/meta', headers: { host } });
    for (const host of ['mypc.local:4317', 'MyPC.local', 'localhost:4317']) expect((await get(host)).statusCode, host).toBe(200);
    const refused = await get('evil.example:4317');
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'open the ledger through localhost, an IP address or MyPC.local' });
  } finally { await named.close(); }
});

it('returns the previous meta with stale true while a changed save is incomplete', async () => {
  const temp = saveDir();
  const ledger = await fixtureLedger();
  const load = vi.fn(async () => ledger);
  const cache = new LedgerCache({ save: temp.dir, env: {}, flags: DEFAULT_FLAG_SETTINGS, load });
  const staleApp = await buildApp({ cache, icons: emptyIconStore });
  try {
    const good = (await staleApp.inject('/api/meta')).json<MetaResponse>();
    utimesSync(temp.file, new Date(), new Date(Date.now() + 10_000));
    load.mockRejectedValueOnce(new IncompleteSaveError('partial'));
    const response = await staleApp.inject('/api/meta');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...good, stale: true });
  } finally { await staleApp.close(); temp.cleanup(); }
});
