import { copyFileSync, truncateSync, unlinkSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_FLAG_SETTINGS, IncompleteSaveError, loadLedger } from '@af-ledger/core';
import { LedgerCache } from '../server/state';
import { fixtureLedger, saveDir } from './helpers';
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
async function setup() {
  const temp = saveDir(); cleanups.push(temp.cleanup);
  const ledger = await fixtureLedger();
  const load = vi.fn(async () => ledger);
  const cache = new LedgerCache({ save: temp.dir, env: {}, flags: DEFAULT_FLAG_SETTINGS, load });
  return { ...temp, ledger, load, cache };
}
it('loads once, reuses unchanged files and reloads after an mtime change', async () => {
  const { cache, load, file } = await setup();
  const first = await cache.get();
  expect(load).toHaveBeenCalledTimes(1);
  expect((await cache.get()).model).toBe(first.model);
  expect(load).toHaveBeenCalledTimes(1);
  utimesSync(file, new Date(), new Date(Date.now() + 10_000));
  expect((await cache.get()).model.version).not.toBe(first.model.version);
  expect(load).toHaveBeenCalledTimes(2);
});
it('switches between newer autosaves and manual saves in a slot', async () => {
  const { cache, load, file, dir } = await setup();
  await cache.get();
  const auto = path.join(dir, 'AutoSave1.sav');
  copyFileSync(file, auto);
  utimesSync(auto, new Date(), new Date(Date.now() + 10_000));
  const autosave = await cache.get();
  expect(load.mock.calls.at(-1)).toEqual([expect.objectContaining({ save: auto })]);
  expect(autosave.model.version.startsWith(`${auto}|`)).toBe(true);
  utimesSync(file, new Date(), new Date(Date.now() + 20_000));
  expect((await cache.get()).model.version.startsWith(`${file}|`)).toBe(true);
  expect(load).toHaveBeenCalledTimes(3);
});
it('serves the last good model as stale, retries and recovers after an incomplete read', async () => {
  const { cache, load, file, ledger } = await setup();
  const first = await cache.get();
  utimesSync(file, new Date(), new Date(Date.now() + 10_000));
  load.mockRejectedValueOnce(new IncompleteSaveError('partial'));
  expect(await cache.get()).toEqual({ model: first.model, stale: true });
  load.mockResolvedValueOnce(ledger);
  expect((await cache.get()).stale).toBe(false);
  expect(load).toHaveBeenCalledTimes(3);
});
it('serves the last good model as stale while an explicit save is truncated for rewriting', async () => {
  const { file, ledger } = await setup();
  const load = vi.fn(async (opts: Parameters<typeof loadLedger>[0]) => opts.save === file ? ledger : loadLedger(opts));
  const cache = new LedgerCache({ save: file, env: {}, flags: DEFAULT_FLAG_SETTINGS, load });
  const first = await cache.get();
  truncateSync(file, 0);
  expect(await cache.get()).toEqual({ model: first.model, stale: true });
});
it('rethrows an incomplete first read and other errors', async () => {
  const { cache, load } = await setup();
  load.mockRejectedValueOnce(new IncompleteSaveError('partial'));
  await expect(cache.get()).rejects.toBeInstanceOf(IncompleteSaveError);
  load.mockRejectedValueOnce(new Error('broken'));
  await expect(cache.get()).rejects.toThrow('broken');
});
it('keeps a truncated newest save stale beside an older save, but accepts newer files immediately', async () => {
  const { cache, load, file, dir } = await setup();
  const older = path.join(dir, 'AutoSave0.sav');
  copyFileSync(file, older);
  utimesSync(older, new Date(), new Date(Date.now() - 10_000));
  const first = await cache.get();
  truncateSync(file, 0);
  expect(await cache.get()).toEqual({ model: first.model, stale: true });
  expect(load).toHaveBeenCalledTimes(1);
  utimesSync(older, new Date(), new Date(Date.now() + 10_000));
  expect((await cache.get()).model.version.startsWith(`${older}|`)).toBe(true);
  // Restore the manual save, then deleting it starts another grace period.
  copyFileSync(older, file);
  utimesSync(file, new Date(), new Date(Date.now() + 20_000));
  await cache.get();
  unlinkSync(file);
  expect((await cache.get()).stale).toBe(true);
});
it('shares one load between concurrent callers', async () => {
  const { cache, load } = await setup();
  const [a, b] = await Promise.all([cache.get(), cache.get()]);
  expect(a.model).toBe(b.model);
  expect(load).toHaveBeenCalledTimes(1);
});

it.each(['truncated', 'missing'])('bounds the %s newest save grace period to 60 seconds', async kind => {
  const { cache, load, file, dir } = await setup();
  vi.useFakeTimers({ toFake: ['Date'] });
  const older = path.join(dir, 'AutoSave0.sav');
  copyFileSync(file, older);
  utimesSync(older, new Date(), new Date(Date.now() - 10_000));
  const first = await cache.get();
  if (kind === 'missing') unlinkSync(file);
  else truncateSync(file, 0);
  expect(await cache.get()).toEqual({ model: first.model, stale: true });
  vi.setSystemTime(Date.now() + 59_999);
  expect(await cache.get()).toEqual({ model: first.model, stale: true });
  vi.setSystemTime(Date.now() + 1);
  const fallback = await cache.get();
  expect(fallback.stale).toBe(false);
  expect(fallback.model.version.startsWith(`${older}|`)).toBe(true);
  expect(load).toHaveBeenCalledTimes(2);
});
it('loads a newer save immediately when the current file has real content but its mtime moved back', async () => {
  const { cache, load, file, dir } = await setup();
  await cache.get();
  const newer = path.join(dir, 'AutoSave0.sav');
  copyFileSync(file, newer);
  utimesSync(newer, new Date(), new Date(Date.now() - 10_000));
  utimesSync(file, new Date(), new Date(Date.now() - 20_000));
  const result = await cache.get();
  expect(result.stale).toBe(false);
  expect(result.model.version.startsWith(`${newer}|`)).toBe(true);
  expect(load).toHaveBeenCalledTimes(2);
});

it('starts the grace period even before an older alternative is available', async () => {
  const { cache, file, dir } = await setup();
  const first = await cache.get();
  vi.useFakeTimers({ toFake: ['Date'] });
  truncateSync(file, 0);
  expect(await cache.get()).toEqual({ model: first.model, stale: true });
  vi.setSystemTime(Date.now() + 60_000);
  const older = path.join(dir, 'AutoSave0.sav');
  const { file: copy } = await setup();
  copyFileSync(copy, older);
  utimesSync(older, new Date(), new Date(Date.now() - 120_000));
  expect((await cache.get()).model.version.startsWith(`${older}|`)).toBe(true);
});

it('updates flags and version without another load, and restores defaults', async () => {
  const { cache, load, file } = await setup();
  const first = (await cache.get()).model;
  expect(first.flags[195].some(f => f.item === 'CoalOre')).toBe(true);
  cache.updateFlags({ ...DEFAULT_FLAG_SETTINGS, purchaseShopShare: 1 });
  const next = (await cache.get()).model;
  expect(next.flags[195].some(f => f.item === 'CoalOre')).toBe(false);
  expect(next.settings.purchaseShopShare).toBe(1);
  expect(next.version).not.toBe(first.version);
  expect(next.version.startsWith(file)).toBe(true);
  cache.updateFlags({ ...DEFAULT_FLAG_SETTINGS, purchaseFlags: false });
  expect((await cache.get()).model.flags.flat().some(f => f.stream === 'purchasing')).toBe(false);
  cache.updateFlags(DEFAULT_FLAG_SETTINGS);
  expect((await cache.get()).model.flags).toEqual(first.flags);
  expect(load).toHaveBeenCalledTimes(1);
});
it('applies flags set before the first read', async () => {
  const { cache } = await setup();
  const settings = { ...DEFAULT_FLAG_SETTINGS, purchaseFlags: false };
  cache.updateFlags(settings);
  expect((await cache.get()).model.settings).toEqual(settings);
  expect((await cache.get()).model.flags.flat().some(f => f.stream === 'purchasing')).toBe(false);
});
it('keeps new settings when an in-flight load finishes', async () => {
  const { cache, load, ledger } = await setup();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  load.mockImplementationOnce(async () => { await gate; return ledger; });
  const pending = cache.get();
  const settings = { ...DEFAULT_FLAG_SETTINGS, purchaseFlags: false };
  cache.updateFlags(settings);
  release();
  const { model } = await pending;
  expect(model.settings).toEqual(settings);
  expect(model.flags.flat().some(f => f.stream === 'purchasing')).toBe(false);
  expect((await cache.get()).model).toBe(model);
  expect(load).toHaveBeenCalledTimes(1);
});
