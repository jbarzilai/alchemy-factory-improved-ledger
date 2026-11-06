import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app';
import { emptyIconStore } from '../server/icons';
import { itemsView, itemView } from '../server/views/items';
import type { LedgerModel } from '../server/state';
import type { ItemsResponse, ItemResponse } from '../shared/api';
import { fixtureCache } from './helpers';
let app: FastifyInstance, model: LedgerModel;
beforeAll(async () => { const cache = fixtureCache(); model = (await cache.get()).model; app = await buildApp({ cache, icons: emptyIconStore }); });
afterAll(async () => { await app.close(); });
it('aggregates shop items and ranks half-range movers by copper per day', async () => {
  const response = await app.inject('/api/items?from=170&to=199'); expect(response.statusCode).toBe(200);
  const result = response.json<ItemsResponse>(); expect(result).toEqual(itemsView(model, 170, 199));
  expect(result.shopTotal).toBe(238470911); expect(result.items.reduce((n, i) => n + i.units, 0)).toBe(67799);
  expect(result.items[0]).toMatchObject({ item: 'Mars', copper: 105280000, units: 235 });
  expect(Object.fromEntries(result.categories.map(c => [c.key, c.copper]))).toEqual({ relic: 178864000, potion: 36438790, sundries: 10768140, jewelry: 7016565, beverage: 5383416 });
  expect(result.movers[0].item).toBe('BlastPotion'); expect(result.movers.at(-1)!.item).toBe('Mars');
  const blast = result.movers[0]; expect(blast.firstShare).toBeCloseTo(11629236 / 122544761, 6); expect(blast.secondShare).toBeCloseTo(4070744 / 115926150, 6);
  expect(blast.firstPerDay).toBeCloseTo(775282.4, 1); expect(blast.secondPerDay).toBeCloseTo(271382.93, 1);
  expect(result.movers.at(-1)).toMatchObject({ firstPerDay: 51968000 / 15, secondPerDay: 53312000 / 15 });
});
it('serves Blast Potion history, flags and last sale', async () => {
  const response = await app.inject('/api/item/BlastPotion?from=170&to=199'); expect(response.statusCode).toBe(200);
  const result = response.json<ItemResponse>(); expect(result).toEqual(itemView(model, 'BlastPotion', 170, 199));
  expect(result.days[20]).toEqual({ day: 190, units: 20, copper: 102280, dispatched: 0, dispatchCopper: 0 });
  expect(result.flaggedDays).toEqual([{ day: 190, stream: 'shop', kind: 'drop' }, ...[191, 192, 193].map(day => ({ day, stream: 'shop', kind: 'stopped' }))]);
  expect(result.lastSoldDay).toBe(190);
});
it('returns 404 for unknown items', async () => { expect((await app.inject('/api/item/Nope')).statusCode).toBe(404); });
it.each(['/api/items', '/api/item/BlastPotion'])('defaults ranges and rejects invalid input for %s', async route => {
  expect((await app.inject(route)).json()).toMatchObject({ from: 193, to: 199 });
  expect((await app.inject(`${route}?from=0`)).statusCode).toBe(404);
  expect((await app.inject(`${route}?to=200`)).statusCode).toBe(404);
  expect((await app.inject(`${route}?from=x`)).statusCode).toBe(400);
  expect((await app.inject(`${route}?from=199&to=170`)).statusCode).toBe(400);
});
it('handles single-day, odd and empty-income halves without division by zero', () => {
  const one = itemsView(model, 199, 199); expect(one.movers.every(m => m.firstPerDay === 0 && m.firstShare === 0)).toBe(true);
  const odd = itemsView(model, 197, 199); const mars = odd.movers.find(m => m.item === 'Mars')!;
  const income = (i: number) => model.days[i].shop.lines.find(l => l.item === 'Mars')!.copper;
  expect(mars.firstPerDay).toBe(income(196)); expect(mars.secondPerDay).toBe((income(197) + income(198)) / 2);
  const empty = { ...model, days: model.days.map(d => ({ ...d, shop: { total: 0, lines: [] } })) };
  expect(itemsView(empty, 197, 199)).toMatchObject({ shopTotal: 0, items: [], movers: [] });
});
