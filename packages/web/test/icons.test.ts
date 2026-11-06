import * as fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../server/app';
import { loadIconStore } from '../server/icons';
import { fixtureCache, tempDir } from './helpers';
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>() }));
const cleanups: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); cleanups.splice(0).forEach(fn => fn()); });
it('serves only indexed PNGs and rejects unknown ids and encoded traversal without a read', async () => {
  const { dir, cleanup } = tempDir(); cleanups.push(cleanup);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nWQAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(dir, 'ManaPotion.png'), png);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ _source: {}, ManaPotion: { file: 'ManaPotion.png' } }));
  const icons = loadIconStore(dir);
  expect(icons.items()).toEqual(['ManaPotion']);
  expect(icons.has('ManaPotion')).toBe(true);
  expect(icons.file('ManaPotion')).toBe(path.join(dir, 'ManaPotion.png'));
  expect(icons.has('toString')).toBe(false);
  expect(icons.file('NotAnItem')).toBeNull();
  const app = await buildApp({ cache: fixtureCache(), icons });
  try {
    const good = await app.inject('/api/icon/ManaPotion');
    expect(good.statusCode).toBe(200);
    expect(good.headers['content-type']).toBe('image/png');
    expect(good.rawPayload).toEqual(png);
    const read = vi.spyOn(fs, 'readFileSync');
    for (const url of ['/api/icon/..%2F..%2Fpackage.json', '/api/icon/NotAnItem', '/api/icon/toString']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'icon not found' });
    }
    expect(read).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
it('treats a missing folder as an empty store', () => {
  const { dir, cleanup } = tempDir(); cleanups.push(cleanup);
  const icons = loadIconStore(path.join(dir, 'missing'));
  expect(icons.items()).toEqual([]);
  expect(icons.file('ManaPotion')).toBeNull();
});
