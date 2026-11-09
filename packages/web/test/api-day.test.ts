import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app';
import { emptyIconStore } from '../server/icons';
import { dayView } from '../server/views/day';
import type { LedgerModel } from '../server/state';
import type { DayItemLine, DayResponse } from '../shared/api';
import { fixtureCache } from './helpers';
let app: FastifyInstance, model: LedgerModel;
beforeAll(async () => { const cache = fixtureCache(); model = (await cache.get()).model; app = await buildApp({ cache, icons: emptyIconStore }); });
afterAll(async () => { await app.close(); });
it('serves Day 199 totals, sources, bonuses, flags, quests and notices', async () => {
  const response = await app.inject('/api/day/199');
  expect(response.statusCode).toBe(200);
  const day = response.json<DayResponse>();
  expect(day).toEqual(dayView(model, 199));
  expect(day.totals).toEqual({ shop: 6397045, quests: 595525, beforeQuests: 5176205, dailySummaryProfit: 5771730, questCount: 2 });
  expect(day.previousTotals).toEqual({ shop: 8450376, quests: 0, beforeQuests: 8053896, dailySummaryProfit: 8053896, questCount: 0 });
  expect(day.sources.map(s => [s.key, s.copper, s.previous])).toEqual([
    ['sundries', 370750, 524612], ['potion', 619094, 603912], ['beverage', 204792, 181341], ['jewelry', 66409, 212511], ['relic', 5136000, 6928000], ['orders', 5849000, 6956000],
  ]);
  expect(day.bonuses).toEqual({ shopProfit: 120, categories: { sundries: 180, potion: 180, beverage: 140, jewelry: 124, relic: 140 }, orderIncomePct: 30, questRewards: 128 });
  expect(day.flags.map(f => f.name)).toEqual(['Mars', 'Diamond', 'Bronze Rivet']);
  expect(day.flags[0].category).toBe('relic');
  expect(day.quests.lines).toHaveLength(2);
  expect(day.quests.lines.map(q => q.label)).toEqual(['Random quest (Normal)', 'Random quest (Bulk)']);
  expect(day.notices).toEqual(["Quest rewards use the save's current Quest Rewards bonus (128%), as the game's own ledger does."]);
});
it('has no comparison or flags on Day 1', async () => {
  expect((await app.inject('/api/day/1')).json()).toMatchObject({ previousDay: null, previousTotals: null, flags: [] });
});
it.each([0, 200])('rejects incomplete Day %s with the real range', async day => {
  const response = await app.inject(`/api/day/${day}`);
  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: `Day ${day} is not a completed day (Days 1–199)` });
});
it.each(['x', '1.5', 'Infinity', '9007199254740992'])('rejects non-whole day %s', async day => {
  const response = await app.inject(`/api/day/${day}`);
  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: 'day must be a whole number' });
});
it('names missing purchase and quest prices and keeps previous uncategorized sources', () => {
  const days = model.days.map(d => ({ ...d }));
  days[198] = { ...days[198], purchasing: { total: 0, lines: [], unpriced: [{ item: 'Mars', count: 2 }] }, quests: { total: 0, bonus: 1.28, lines: [], unpriced: [{ questId: 'RandomBulk', missing: ['Mars'] }] } };
  days[197] = { ...days[197], shop: { total: 10, lines: [{ item: 'NoCategory', copper: 10, count: 1 }] } };
  const result = dayView({ ...model, days }, 199);
  expect(result.notices).toEqual(["Quest rewards use the save's current Quest Rewards bonus (128%), as the game's own ledger does.", 'Mars: no purchase price in the game data, left out of Expenses.', 'Random quest (Bulk): no quest price for Mars, left out of Quest Rewards.']);
  expect(result.sources.find(s => s.key === 'uncategorized')).toEqual({ key: 'uncategorized', label: 'Uncategorized', copper: 0, previous: 10 });
});

it('lists Day 199 items against Day 198', async () => {
  const { items } = (await app.inject('/api/day/199')).json<DayResponse>();
  expect(items.shop).toHaveLength(28);
  expect(items.shop.slice(0, 3).map(l => l.item)).toEqual(['Mars', 'Saturn', 'Jupiter']);
  expect(items.shop[0]).toEqual({ item: 'Mars', name: 'Mars', category: 'relic', units: 6, copper: 2688000, previousUnits: 10, previousCopper: 4480000 });
  expect(items.shop.at(-1)).toEqual({ item: 'Diamond2', name: 'Diamond', category: 'jewelry', units: 0, copper: 0, previousUnits: 1, previousCopper: 144000 });
  expect(items.orders.map(l => [l.item, l.units, l.copper, l.previousUnits, l.previousCopper, l.category])).toEqual([
    ['Catalyst2', 880, 3432000, 1160, 4524000, null], ['GloomSpores', 3950, 1817000, 3950, 1817000, null], ['Bandage', 2000, 600000, 2050, 615000, null],
  ]);
  expect(items.purchasing).toHaveLength(10);
  expect(items.purchasing.find(l => l.item === 'CashRegister')).toMatchObject({ units: 1, copper: 3000, previousUnits: 0, previousCopper: 0 });
});
it('item lines add up to the day totals on every completed day', () => {
  for (const d of model.ledger.snapshot.days.filter(d => d.complete)) {
    const view = dayView(model, d.displayDay);
    const sum = (lines: DayItemLine[]) => lines.reduce((t, l) => t + (l.copper ?? 0), 0);
    expect(sum(view.items.shop) + sum(view.items.orders)).toBe(view.totals.shop + view.sources.find(s => s.key === 'orders')!.copper);
    expect(sum(view.items.purchasing)).toBe(view.purchasing.copper);
  }
});
it('gives every flagged item a line, even on day 3 of a stop', () => {
  const view = dayView(model, 120);
  expect(view.flags).toContainEqual(expect.objectContaining({ stream: 'shop', item: 'Saturn', kind: 'stopped' }));
  for (const flag of view.flags) expect(view.items[flag.stream].map(l => l.item)).toContain(flag.item);
  expect(view.items.shop.find(l => l.item === 'Saturn')).toMatchObject({ units: 0, copper: 0, previousUnits: 0, previousCopper: 0 });
});
it('has no previous item values on Day 1', () => {
  const { items } = dayView(model, 1);
  for (const line of [...items.shop, ...items.orders, ...items.purchasing]) expect([line.previousUnits, line.previousCopper]).toEqual([null, null]);
});
it('merges duplicates, keeps unpriced purchases last and marks uncategorized items', () => {
  const days = model.days.map(d => ({ ...d }));
  days[198] = { ...days[198],
    shop: { total: 30, lines: [{ item: 'NoCategory', count: 1, copper: 10 }, { item: 'NoCategory', count: 2, copper: 20 }] },
    purchasing: { total: 5, lines: [{ item: 'Wood', count: 1, copper: 5 }], unpriced: [{ item: 'Mystery', count: 4 }] } };
  const { items } = dayView({ ...model, days }, 199);
  expect(items.shop.find(l => l.item === 'NoCategory')).toMatchObject({ category: 'uncategorized', units: 3, copper: 30, previousUnits: 0, previousCopper: 0 });
  expect(items.purchasing.at(-1)).toMatchObject({ item: 'Mystery', units: 4, copper: null, previousUnits: 0, previousCopper: 0 });
});
