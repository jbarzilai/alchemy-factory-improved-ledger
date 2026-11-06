import { afterEach, expect, it, vi } from 'vitest';
import { SaveWatcher, saveEvent } from '../server/watch';
import { publicVersion, type LedgerCache } from '../server/state';

export function state(version = 'v1', stale = false) {
  return { model: { version, ledger: { snapshot: { days: [
    { complete: true, displayDay: 199 }, { complete: false, displayDay: 200 },
  ] } } }, stale } as Awaited<ReturnType<LedgerCache['get']>>;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('sends a version that changes with the save but hides its path', () => {
  const version = (source: string) => saveEvent(state(`${source}|flags0`)).version;
  const save = '/mnt/c/Users/someone/AppData/Local/AlchemyFactory/Saved/SaveGames/Slot/SaveGame0.sav';
  expect(version(`${save}|100|200`)).toMatch(/^[0-9a-f]{16}$/);
  expect(version(`${save}|100|200`)).toBe(version(`${save}|100|200`));
  expect(version(`${save}|100|201`)).not.toBe(version(`${save}|100|200`));
});
it('polls, emits only version/stale changes, unsubscribes and stops', async () => {
  vi.useFakeTimers();
  const get = vi.fn().mockResolvedValue(state());
  const watcher = new SaveWatcher({ get }, { intervalMs: 100 });
  const listener = vi.fn();
  const off = watcher.on(listener);
  expect(watcher.current()).toBeNull();
  watcher.start(); watcher.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ version: publicVersion('v1'), latestDay: 199, partialDay: 200, stale: false });
  await vi.advanceTimersByTimeAsync(200);
  expect(listener).toHaveBeenCalledTimes(1);
  get.mockResolvedValue(state('v2'));
  await vi.advanceTimersByTimeAsync(100);
  expect(listener).toHaveBeenCalledTimes(2);
  get.mockResolvedValue(state('v2', true));
  await vi.advanceTimersByTimeAsync(200);
  expect(listener).toHaveBeenCalledTimes(3);
  expect(watcher.current()?.stale).toBe(true);
  off();
  get.mockResolvedValue(state('v3'));
  await vi.advanceTimersByTimeAsync(100);
  expect(listener).toHaveBeenCalledTimes(3);
  watcher.stop();
  const calls = get.mock.calls.length;
  await vi.advanceTimersByTimeAsync(500);
  expect(get).toHaveBeenCalledTimes(calls);
  expect(vi.getTimerCount()).toBe(0);
});
it('logs each distinct read error once and continues polling through recovery', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const get = vi.fn().mockRejectedValue(new Error('writing'));
  const watcher = new SaveWatcher({ get }, { intervalMs: 100 });
  watcher.start();
  await vi.advanceTimersByTimeAsync(300);
  expect(log).toHaveBeenCalledTimes(1);
  get.mockRejectedValue(new Error('missing'));
  await vi.advanceTimersByTimeAsync(100);
  expect(log).toHaveBeenCalledTimes(2);
  get.mockResolvedValue(state());
  await vi.advanceTimersByTimeAsync(100);
  expect(watcher.current()?.version).toBe(publicVersion('v1'));
  get.mockRejectedValue(new Error('writing'));
  await vi.advanceTimersByTimeAsync(100);
  expect(log).toHaveBeenCalledTimes(2);
  watcher.stop();
});
it('does not overlap slow reads or emit a read that finishes after stop', async () => {
  vi.useFakeTimers();
  let resolve!: (value: ReturnType<typeof state>) => void;
  const get = vi.fn(() => new Promise<ReturnType<typeof state>>(done => { resolve = done; }));
  const watcher = new SaveWatcher({ get }, { intervalMs: 100 });
  const listener = vi.fn(); watcher.on(listener);
  watcher.start();
  await vi.advanceTimersByTimeAsync(300);
  expect(get).toHaveBeenCalledTimes(1);
  watcher.stop(); resolve(state());
  await vi.advanceTimersByTimeAsync(0);
  expect(listener).not.toHaveBeenCalled();
});
