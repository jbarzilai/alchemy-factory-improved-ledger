import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_FLAG_SETTINGS as defaults, loadSettings, LOCAL_FLAGS_FILE } from '@af-ledger/core';
import { buildApp } from '../server/app';
import { fileFlagStore, memoryFlagStore, type FlagStore } from '../server/flagStore';
import { emptyIconStore } from '../server/icons';
import type { DayResponse, MetaResponse } from '../shared/api';
import { fixtureCache, tempDir } from './helpers';
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function setup(flags: FlagStore = memoryFlagStore(defaults)) {
  const cache = fixtureCache();
  const app = await buildApp({ cache, icons: emptyIconStore, flags });
  cleanups.push(() => app.close());
  const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/settings/flags',
    headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  const day = async () => (await app.inject('/api/day/196')).json<DayResponse>();
  const meta = async () => (await app.inject('/api/meta')).json<MetaResponse>();
  return { app, cache, put, day, meta };
}
it('saves thresholds, switches groups and restores the same default flags', async () => {
  const { put, day, meta } = await setup();
  const original = await day();
  const before = await meta();
  expect(original.flags.some(f => f.item === 'CoalOre')).toBe(true);
  const settings = { ...defaults, purchaseShopShare: 1 };
  const response = await put(settings);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ settings });
  expect((await day()).flags.some(f => f.item === 'CoalOre')).toBe(false);
  expect(await meta()).toMatchObject({ settings, flagDefaults: defaults });
  expect((await meta()).days[195].flagCount).toBe(before.days[195].flagCount - 1);
  expect((await put({ ...defaults, purchaseFlags: false })).statusCode).toBe(200);
  expect((await day()).flags).toEqual(original.flags.filter(f => f.stream !== 'purchasing'));
  expect((await meta()).days[195].flagCount).toBe(original.flags.filter(f => f.stream !== 'purchasing').length);
  expect((await put(defaults)).statusCode).toBe(200);
  expect((await day()).flags).toEqual(original.flags);
});
it('rejects invalid bodies without saving or changing flags', async () => {
  const store = memoryFlagStore(defaults);
  const save = vi.spyOn(store, 'save');
  const { app, cache, put, meta } = await setup(store);
  const update = vi.spyOn(cache, 'updateFlags');
  const before = await meta();
  const { incomeFlags: _omit, ...missing } = defaults;
  for (const body of [missing, { ...defaults, extra: 1 }, { ...defaults, riseRatio: 1 },
    { ...defaults, purchaseShopShare: '0.1' }, { ...defaults, incomeFlags: 'false' }, null, []]) {
    const result = await put(body);
    expect(result.statusCode).toBe(400);
    expect(result.json()).toHaveProperty('error');
    expect(await meta()).toEqual(before);
  }
  const empty = await app.inject({ method: 'PUT', url: '/api/settings/flags' });
  expect(empty.statusCode).toBe(400);
  expect(empty.json()).toHaveProperty('error');
  expect(await meta()).toEqual(before);
  expect(save).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it('reports saving failures without updating cached flags', async () => {
  const { cache, put, meta } = await setup({ defaults, save() { throw new Error('config folder not writable'); } });
  const update = vi.spyOn(cache, 'updateFlags');
  const before = await meta();
  const result = await put({ ...defaults, purchaseFlags: false });
  expect(result.statusCode).toBe(500);
  expect(result.json()).toEqual({ error: 'config folder not writable' });
  expect(await meta()).toEqual(before);
  expect(update).not.toHaveBeenCalled();
});
it('exempts only the settings PUT from GET-only API methods', async () => {
  const { app } = await setup();
  for (const [method, url] of [['POST', '/api/settings/flags'], ['PUT', '/api/day/1'], ['OPTIONS', '/api/settings/flags']] as const) {
    const result = await app.inject({ method, url });
    expect(result.statusCode).toBe(405);
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
  }
});
it('persists only base differences, reloads them, and leaves no temporary file', () => {
  const { dir, cleanup } = tempDir(); cleanups.push(cleanup);
  const base = path.join(dir, 'settings.json');
  writeFileSync(base, JSON.stringify({ flags: { riseRatio: 4 } }));
  const store = fileFlagStore(dir);
  expect(store.defaults).toEqual({ ...defaults, riseRatio: 4 });
  const settings = { ...store.defaults, purchaseFlags: false, purchaseShopShare: 1 };
  store.save(settings);
  const local = path.join(dir, LOCAL_FLAGS_FILE);
  const text = readFileSync(local, 'utf8');
  expect(JSON.parse(text)).toEqual({ purchaseShopShare: 1, purchaseFlags: false });
  expect(text).toBe(JSON.stringify(JSON.parse(text), null, 2) + '\n');
  expect(loadSettings(base).flags).toEqual(settings);
  store.save(store.defaults);
  expect(readFileSync(local, 'utf8')).toBe('{}\n');
  expect(loadSettings(base).flags).toEqual(store.defaults);
  expect(readdirSync(dir).sort()).toEqual([LOCAL_FLAGS_FILE, 'settings.json'].sort());
});
it('rejects a PUT whose Host is a domain name, so a DNS-rebound page cannot change flags', async () => {
  const flags = memoryFlagStore(defaults);
  const save = vi.spyOn(flags, 'save');
  const { app, day } = await setup(flags);
  const original = await day();
  const put = (host: string) => app.inject({ method: 'PUT', url: '/api/settings/flags', headers: { host, 'content-type': 'application/json' },
    payload: JSON.stringify({ ...defaults, purchaseFlags: false }) });
  for (const host of ['evil.example:4317', 'evil.example']) expect((await put(host)).statusCode).toBe(403);
  expect(save).not.toHaveBeenCalled();
  expect((await day()).flags).toEqual(original.flags);
  for (const host of ['localhost:4317', '127.0.0.1:4317', '[::1]:4317', '192.168.1.20:4317']) expect((await put(host)).statusCode).toBe(200);
});
