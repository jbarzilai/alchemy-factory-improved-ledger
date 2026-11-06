import { expect, it, vi } from 'vitest';
import { IncompleteSaveError } from '@af-ledger/core';
import { inCodexSandbox } from '../../core/test/helpers/sandbox';
import { buildApp } from '../server/app';
import { emptyIconStore } from '../server/icons';
import { publicVersion } from '../server/state';
import { SaveWatcher, saveEvent, type SaveEvent } from '../server/watch';
import { fixtureCache } from './helpers';

it.skipIf(inCodexSandbox)('streams initial state and changes, cleans up disconnects, and closes with an open stream', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const cache = fixtureCache();
  let state = await cache.get();
  vi.spyOn(cache, 'get').mockImplementation(async () => state);
  const watcher = new SaveWatcher(cache, { intervalMs: 20 });
  const on = watcher.on.bind(watcher);
  const unsubscribe = vi.fn();
  vi.spyOn(watcher, 'on').mockImplementation(listener => {
    const off = on(listener);
    return () => { off(); unsubscribe(); };
  });
  const app = await buildApp({ cache, icons: emptyIconStore, watcher });
  const controller = new AbortController();
  try {
    const url = await app.listen({ host: '127.0.0.1', port: 0 });
    watcher.start();
    const response = await fetch(`${url}/api/events`, { signal: controller.signal });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    async function frame() {
      while (!buffer.includes('\n\n')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('stream ended before an event');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      const end = buffer.indexOf('\n\n');
      const message = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      return message;
    }
    async function next() {
      const message = await frame();
      expect(message.startsWith('event: save\ndata: ')).toBe(true);
      return JSON.parse(message.slice('event: save\ndata: '.length));
    }
    expect(await next()).toEqual({ version: publicVersion(state.model.version), latestDay: 199, partialDay: 200, stale: false });
    state = { model: { ...state.model, version: 'changed' }, stale: true };
    await vi.advanceTimersByTimeAsync(20);
    expect(await next()).toEqual({ version: publicVersion('changed'), latestDay: 199, partialDay: 200, stale: true });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await frame()).toBe(': ping');
    controller.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    const open = await fetch(`${url}/api/events`);
    await app.close();
    await open.body!.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controller.abort(); watcher.stop(); await app.close(); vi.useRealTimers(); vi.restoreAllMocks();
  }
}, 10_000);

it.each([new Error('unavailable'), new IncompleteSaveError('partial')])(
  'uses a recoverable stream instead of JSON for an initial cache failure: %s', async error => {
    const cache = fixtureCache();
    const state = await cache.get();
    vi.spyOn(cache, 'get').mockRejectedValue(error);
    const watcher = new SaveWatcher(cache);
    let receive!: (event: SaveEvent) => void;
    let subscribed!: () => void;
    const ready = new Promise<void>(resolve => { subscribed = resolve; });
    const unsubscribe = vi.fn();
    vi.spyOn(watcher, 'on').mockImplementation(listener => {
      receive = listener; subscribed(); return unsubscribe;
    });
    const app = await buildApp({ cache, icons: emptyIconStore, watcher });
    try {
      // inject waits for an SSE response to end, so close it after simulating recovery.
      const response = app.inject('/api/events');
      await ready;
      receive(saveEvent(state));
      await app.close();
      const result = await response;
      expect(result.statusCode).toBe(200);
      expect(result.headers['content-type']).toBe('text/event-stream');
      expect(result.body).toContain(': waiting for save\n\n');
      expect(result.body).toContain(`event: save\ndata: ${JSON.stringify(saveEvent(state))}\n\n`);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally { await app.close(); vi.restoreAllMocks(); }
  },
);

it.skipIf(inCodexSandbox).each([new Error('unavailable'), new IncompleteSaveError('partial')])(
  'keeps an SSE connection alive after a cache failure: %s', async error => {
    const cache = fixtureCache();
    const state = await cache.get();
    vi.spyOn(cache, 'get').mockRejectedValueOnce(error).mockResolvedValue(state);
    const watcher = new SaveWatcher(cache);
    const app = await buildApp({ cache, icons: emptyIconStore, watcher });
    const controller = new AbortController();
    try {
      const url = await app.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(`${url}/api/events`, { signal: controller.signal });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = decoder.decode((await reader.read()).value);
      watcher.start();
      while (!buffer.includes('event: save\ndata: ')) buffer += decoder.decode((await reader.read()).value);
      while (!/event: save\ndata: .*\n/.test(buffer)) buffer += decoder.decode((await reader.read()).value);
      const data = JSON.parse(/event: save\ndata: (.*)\n/.exec(buffer)![1]);
      expect(data).toEqual({ version: publicVersion(state.model.version), latestDay: 199, partialDay: 200, stale: false });
    } finally {
      controller.abort(); watcher.stop(); await app.close(); vi.restoreAllMocks();
    }
  }, 10_000,
);

it.skipIf(inCodexSandbox)('ends a request whose initial cache read finishes after shutdown begins', async () => {
  const cache = fixtureCache();
  const state = await cache.get();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(cache, 'get').mockImplementation(async () => { entered(); await gate; return state; });
  const watcher = new SaveWatcher(cache);
  const subscribe = vi.spyOn(watcher, 'on');
  const app = await buildApp({ cache, icons: emptyIconStore, watcher });
  let closing!: () => void;
  const preClosed = new Promise<void>(resolve => { closing = resolve; });
  vi.spyOn(watcher, 'stop').mockImplementation(() => { closing(); });
  const controller = new AbortController();
  try {
    const url = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = fetch(`${url}/api/events`, { signal: controller.signal });
    await started;
    const closed = app.close();
    await preClosed;
    release();
    await closed;
    await (await response).text();
    expect(subscribe).not.toHaveBeenCalled();
  } finally {
    release(); controller.abort(); await app.close(); vi.restoreAllMocks();
  }
}, 5_000);
