import { afterEach, expect, it, vi } from 'vitest';
import type { SaveEvent } from '../server/watch';
import type { MetaResponse } from '../shared/api';
import { DEFAULT_SELECTION, type Route } from '../client/route';

// Exercise the subscription lifecycle without adding a browser/test-renderer dependency.
const hooks = vi.hoisted(() => ({ effects: [] as { run: () => void | (() => void); deps: unknown[] }[], ref: { current: null as unknown } }));
vi.mock('react', () => ({
  useRef: (value: unknown) => { if (!hooks.ref.current) hooks.ref.current = value; return hooks.ref; },
  useEffect: (run: () => void | (() => void), deps: unknown[]) => { hooks.effects.push({ run, deps }); },
}));
import { saveUpdate, useSaveEvents } from '../client/useSaveEvents';

const initial: SaveEvent = { version: 'v1', latestDay: 199, partialDay: 200, stale: false };
const next: SaveEvent = { ...initial, version: 'v2', latestDay: 200, partialDay: 201 };
const meta = initial as MetaResponse;
afterEach(() => { vi.unstubAllGlobals(); hooks.effects = []; hooks.ref.current = null; });

it('follows an explicitly selected latest Today day, including the first event after metadata', () => {
  const day = 199;
  expect(saveUpdate(next, initial, meta, { page: 'today', items: DEFAULT_SELECTION, day })).toEqual({ reload: true, day: 200 });
  expect(saveUpdate(next, null, meta, { page: 'today', items: DEFAULT_SELECTION, day })).toEqual({ reload: true, day: 200 });
});
it('keeps implicit Today on latest through initial and mid-day events', () => {
  const route: Route = { page: 'today', items: DEFAULT_SELECTION, day: null };
  expect(saveUpdate(initial, null, null, route)).toEqual({ reload: false, day: null });
  expect(saveUpdate(next, initial, null, route)).toEqual({ reload: true, day: null });
  expect(saveUpdate({ ...next, latestDay: 199 }, initial, meta, route)).toEqual({ reload: true, day: null });
  expect(saveUpdate(next, next, meta, route)).toEqual({ reload: false, day: null });
});
it('ignores initial events without metadata and events already loaded by the page', () => {
  expect(saveUpdate(initial, null, null, { page: 'today', items: DEFAULT_SELECTION, day: 199 })).toEqual({ reload: false, day: null });
  expect(saveUpdate(next, initial, next as MetaResponse, { page: 'today', items: DEFAULT_SELECTION, day: 199 })).toEqual({ reload: false, day: null });
});
it.each<Route>([
  { page: 'today', items: DEFAULT_SELECTION, day: 100 },
  { page: 'history', range: { last: 7 } },
  { page: 'items', range: { last: 3 }, item: 'Mars' },
  { page: 'history', range: { from: 100, to: 110 } },
])('reloads without changing an older day or a range: %j', route => {
  expect(saveUpdate(next, initial, meta, route)).toEqual({ reload: true, day: null });
});
it('does not reload stale-only or duplicate/reconnected events', () => {
  expect(saveUpdate({ ...initial, stale: true }, initial, meta, { page: 'today', items: DEFAULT_SELECTION, day: 199 })).toEqual({ reload: false, day: null });
  expect(saveUpdate(initial, null, meta, { page: 'today', items: DEFAULT_SELECTION, day: null })).toEqual({ reload: false, day: null });
});
it('uses the previous event while metadata is still loading and handles empty saves', () => {
  expect(saveUpdate(next, initial, null, { page: 'today', items: DEFAULT_SELECTION, day: 199 })).toEqual({ reload: true, day: 200 });
  expect(saveUpdate({ ...next, latestDay: 0 }, initial, meta, { page: 'today', items: DEFAULT_SELECTION, day: 199 })).toEqual({ reload: true, day: null });
});
it('keeps one EventSource across callback changes, passes previous events, and closes on unmount', () => {
  let receive!: (message: { data: string }) => void;
  const close = vi.fn();
  const source = vi.fn(class {
    close = close;
    addEventListener(name: string, callback: typeof receive) { expect(name).toBe('save'); receive = callback; }
  });
  vi.stubGlobal('EventSource', source);
  const first = vi.fn();
  useSaveEvents(first);
  const cleanup = hooks.effects.map(effect => effect.run()).at(-1)!;
  expect(source).toHaveBeenCalledExactlyOnceWith('/api/events');
  receive({ data: JSON.stringify(initial) });
  expect(first).toHaveBeenCalledExactlyOnceWith(initial, null);
  hooks.effects = [];
  const second = vi.fn();
  useSaveEvents(second);
  // React re-runs only the callback effect: the subscription has empty dependencies.
  hooks.effects.find(effect => effect.deps.length > 0)!.run();
  receive({ data: JSON.stringify(next) });
  expect(second).toHaveBeenCalledExactlyOnceWith(next, initial);
  expect(source).toHaveBeenCalledTimes(1);
  cleanup();
  expect(close).toHaveBeenCalledTimes(1);
});
