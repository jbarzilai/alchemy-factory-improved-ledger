import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app';
import { emptyIconStore } from '../server/icons';
import { historyView } from '../server/views/history';
import type { LedgerModel } from '../server/state';
import type { HistoryResponse } from '../shared/api';
import { fixtureCache } from './helpers';
let app: FastifyInstance, model: LedgerModel;
beforeAll(async () => { const cache = fixtureCache(); model = (await cache.get()).model; app = await buildApp({ cache, icons: emptyIconStore }); });
afterAll(async () => { await app.close(); });
it('defaults to the last seven completed days', async () => {
  const response = await app.inject('/api/history');
  expect(response.statusCode).toBe(200);
  const result = response.json<HistoryResponse>();
  expect(result).toMatchObject({ from: 193, to: 199 }); expect(result.days).toHaveLength(7);
});
it('sums Days 170–199 and includes whole-save heatmap and events', async () => {
  const response = await app.inject('/api/history?from=170&to=199');
  expect(response.statusCode).toBe(200);
  const result = response.json<HistoryResponse>();
  expect(result).toEqual(historyView(model, 170, 199));
  expect(result.days).toHaveLength(30);
  const sum = (get: (d: HistoryResponse['days'][number]) => number) => result.days.reduce((n, d) => n + get(d), 0);
  expect(sum(d => d.quests)).toBe(11684776); expect(sum(d => d.dailySummaryProfit)).toBe(236877427);
  expect(result.days.filter(d => d.quests > 0)).toHaveLength(18);
  expect(sum(d => Object.entries(d.sources).filter(([key]) => key !== 'orders').reduce((n, [, v]) => n + v, 0))).toBe(238470911);
  expect(sum(d => d.sources.orders)).toBe(149336000); expect(sum(d => d.purchasing)).toBe(162614260);
  expect(result.allDays).toHaveLength(199); expect(result.allDays[198]).toEqual({ day: 199, dailySummaryProfit: 5771730 });
  for (const event of [
    { day: 50, kind: 'shop-profit', text: 'Shop Profit 110%' }, { day: 97, kind: 'shop-profit', text: 'Shop Profit 120%' },
    { day: 52, kind: 'first-order', item: 'Bandage' }, { day: 133, kind: 'first-sale', item: 'Mars' },
    { day: 191, kind: 'stopped', item: 'BlastPotion', text: 'Blast Potion stops selling' }, { day: 180, kind: 'stopped', item: 'PocketWatch', text: 'Pocket Watch orders stop' },
  ]) expect(result.events).toContainEqual(expect.objectContaining(event));
  for (const [day, text] of [[18, 'Sundries 124%'], [136, 'Relic 140%'], [159, 'Potion 180%']] as const) expect(result.events).toContainEqual(expect.objectContaining({ day, kind: 'bonus', text: expect.stringContaining(text) }));
  expect(result.events.filter(e => e.kind === 'bonus').flatMap(e => e.text.split(', '))).toHaveLength(15);
  // Upgrades land mid-day, so Days 101 and 158 hold mixed average prices; the text uses the full new prices.
  expect(result.events.filter(e => e.kind === 'order-income').map(e => [e.day, e.text])).toEqual([
    [101, 'Order prices up 11–17% (Gloom Spores 380 → 420)'],
    [158, 'Order prices up 7–10% (Bandage 280 → 300)'],
  ]);
  expect(result.events).toEqual([...result.events].sort((a, b) => a.day - b.day || a.kind.localeCompare(b.kind)));
});
it.each(['/api/history?from=199&to=170', '/api/history?from=x', '/api/history?to=1.5', '/api/history?from=1&from=2'])('rejects invalid ranges %s', async url => {
  const response = await app.inject(url); expect(response.statusCode).toBe(400); expect(response.json()).toHaveProperty('error');
});
it('names the day the user asked for when it is out of range', async () => {
  const response = await app.inject('/api/history?to=300');
  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: 'Day 300 is not a completed day (Days 1–199)' });
});
it('says there are no completed days yet on a fresh save', async () => {
  const empty = { ...model, days: [], flags: [], ledger: { ...model.ledger, snapshot: { ...model.ledger.snapshot, days: model.ledger.snapshot.days.slice(-1).map(d => ({ ...d, complete: false })) } } };
  const fresh = await buildApp({ cache: { get: async () => ({ model: empty, stale: false }) } as never, icons: emptyIconStore });
  try {
    for (const url of ['/api/history', '/api/items', '/api/day/1']) {
      const response = await fresh.inject(url);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'no completed days yet' });
    }
  } finally { await fresh.close(); }
});
it('uses the shorter save range for defaults', async () => {
  const short = { ...model, days: model.days.slice(0, 3), flags: model.flags.slice(0, 3), ledger: { ...model.ledger, snapshot: { ...model.ledger.snapshot, days: model.ledger.snapshot.days.slice(0, 3) } } };
  const small = await buildApp({ cache: { get: async () => ({ model: short, stale: false }) } as never, icons: emptyIconStore });
  try { expect((await small.inject('/api/history')).json()).toMatchObject({ from: 1, to: 3 }); } finally { await small.close(); }
});
it('skips unknown category dates, merges consecutive order rises and requires long stops', () => {
  const snapshotDays = model.ledger.snapshot.days.slice(0, 10).map((d, i) => ({ ...d, items: [], displayDay: i + 1, saveDay: i }));
  const counts = [10, 10, 10, 0, 0, 0, 0, 10, 10, 10];
  const prices = [100, 110, 120, 120, 130, 130, 130, 130, 130, 130];
  const days = model.days.slice(0, 10).map((d, i) => ({ ...d,
    shop: { total: counts[i] * 100, lines: counts[i] ? [{ item: 'Mars', count: counts[i], copper: counts[i] * 100 }] : [] },
    orders: { total: prices[i], lines: [{ item: 'Bandage', count: 1, copper: prices[i] }] },
  }));
  // Raw records preserve the first item in save order, independent of money-line sorting.
  const item = model.ledger.snapshot.days[198].items[0];
  const rawDays = snapshotDays.map((d, i) => ({ ...d, items: [{ ...item, item: 'Bandage', soldCount: 0, dispatchedCount: 1, dispatchValue: { gold: 0, silver: 0, copper: prices[i] } }] }));
  const bonuses = [100, null, 124, null, 124, 140, 140, 140, 140, 140];
  const synthetic: LedgerModel = { ...model, days, ledger: { ...model.ledger, snapshot: { ...model.ledger.snapshot, days: rawDays },
    bonuses: day => ({ shopProfit: 100, categories: { Sundries: bonuses[day.saveDay], Potion: 100, Beverage: 100, Jewelry: 100, Relic: 100 }, orderIncomePct: 0, questRewards: 100 }),
  } };
  const result = historyView(synthetic, 8, 10);
  expect(result.events.filter(e => e.kind === 'bonus')).toEqual([{ day: 3, kind: 'bonus', text: 'Sundries 124%' }, { day: 6, kind: 'bonus', text: 'Sundries 140%' }]);
  expect(result.events.filter(e => e.kind === 'order-income')).toEqual([
    // A run spanning several days compares the price before it with the price on its last day.
    { day: 2, kind: 'order-income', item: 'Bandage', text: 'Order prices up 20% (Bandage 100 → 120)' },
    { day: 5, kind: 'order-income', item: 'Bandage', text: 'Order prices up 8% (Bandage 120 → 130)' },
  ]);
  expect(result.events.filter(e => e.kind === 'stopped')).toEqual([{ day: 4, kind: 'stopped', item: 'Mars', text: 'Mars stops selling' }]);
  // A run of exactly zeroRunDays is not a stopped event, including at the end of the save.
  const short = { ...synthetic, days: days.slice(0, 6), ledger: { ...synthetic.ledger, snapshot: { ...synthetic.ledger.snapshot, days: rawDays.slice(0, 6) } } };
  expect(historyView(short, 1, 6).events.filter(e => e.kind === 'stopped')).toEqual([]);
  const running = { ...synthetic, days: days.slice(0, 7), ledger: { ...synthetic.ledger, snapshot: { ...synthetic.ledger.snapshot, days: rawDays.slice(0, 7) } } };
  expect(historyView(running, 1, 7).events.filter(e => e.kind === 'stopped')).toHaveLength(1);
});
