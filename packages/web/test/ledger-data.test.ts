import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError, getDay, getMeta, getItems, getItem } from '../client/api';
import { createLedgerLoader } from '../client/ledgerData';
import type { ItemResponse, ItemsResponse, MetaResponse } from '../shared/api';
vi.mock('../client/api', async importOriginal => ({ ...await importOriginal<typeof import('../client/api')>(), getDay: vi.fn(), getMeta: vi.fn(), getItems: vi.fn(), getItem: vi.fn() }));
const route = { page: 'items', range: { last: 7 }, item: 'A' } as const;
const meta = { latestDay: 1, days: [{ day: 1 }] } as MetaResponse;
const items: ItemsResponse = { from: 1, to: 1, shopTotal: 10, categories: [], items: [{ item: 'A', name: 'A', category: 'potion', units: 1, copper: 10 }], movers: [] };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMeta).mockResolvedValue(meta);
  vi.mocked(getItems).mockResolvedValue(items);
  vi.mocked(getItem).mockImplementation(async id => ({ item: id }) as ItemResponse);
});
test('changing only item fetches only detail; reload and range navigation refresh metadata', async () => {
  const load = createLedgerLoader(), signal = new AbortController().signal;
  await load(route, signal, 0);
  expect((await load({ ...route, item: 'B' }, signal, 0)).item?.item).toBe('B');
  expect(getMeta).toHaveBeenCalledTimes(1);
  expect(getItems).toHaveBeenCalledTimes(1);
  expect(getItem).toHaveBeenCalledTimes(2);
  await load({ ...route, range: { last: 3 } }, signal, 0);
  expect(getMeta).toHaveBeenCalledTimes(2);
  await load({ ...route, range: { last: 3 } }, signal, 1);
  expect(getMeta).toHaveBeenCalledTimes(3);
});
test('unknown item preserves page data and the server sentence; other failures still throw', async () => {
  const load = createLedgerLoader(), signal = new AbortController().signal;
  vi.mocked(getItem).mockRejectedValueOnce(new ApiError('Unknown item: typo.', 404));
  expect(await load(route, signal, 0)).toMatchObject({ meta, items, item: null, itemError: 'Unknown item: typo.' });
  expect(await load({ ...route, item: 'B' }, signal, 0)).toMatchObject({ item: { item: 'B' }, itemError: null });
  vi.mocked(getItem).mockRejectedValueOnce(new ApiError('Unavailable', 503));
  await expect(load(route, signal, 0)).rejects.toThrow('Unavailable');
});
test('aborted ranges are not cached and the signal reaches every fetch', async () => {
  const load = createLedgerLoader(), controller = new AbortController();
  vi.mocked(getItems).mockImplementationOnce(async () => { controller.abort(); return items; });
  await load(route, controller.signal, 0);
  const signal = new AbortController().signal;
  await load(route, signal, 0);
  expect(getMeta).toHaveBeenCalledTimes(2);
  expect(getItems).toHaveBeenLastCalledWith(1, 1, signal);
  expect(getItem).toHaveBeenLastCalledWith('A', 1, 1, signal);
});
test('changing only the Today selection reuses the loaded day', async () => {
  const load = createLedgerLoader(), signal = new AbortController().signal;
  const today = { page: 'today', day: 1, items: { stream: 'shop', category: 'all', item: null } } as const;
  await load(today, signal, 0);
  await load({ ...today, items: { stream: 'shop', category: 'relic', item: 'Mars' } }, signal, 0);
  expect(getMeta).toHaveBeenCalledTimes(1);
  expect(getDay).toHaveBeenCalledTimes(1);
});
