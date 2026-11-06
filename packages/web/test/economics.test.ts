import { expect, test } from 'vitest';
import { customRange, defaultSort, heatCells, heatLevel, historyKpis, itemSummary, totalUnits, nextSort, selectMovers, sortItems, unitPrice } from '../client/economics';
import type { HistoryResponse, ItemsResponse } from '../shared/api';
const items: ItemsResponse['items'] = [
  { item: 'b', name: 'Beta', category: 'potion', units: 10, copper: 100 },
  { item: 'a', name: 'Alpha', category: 'relic', units: 2, copper: 80 },
  { item: 'c', name: 'Gamma', category: 'sundries', units: 0, copper: 0 },
];
test('all five columns sort both ways without mutating API rows', () => {
  for (const key of ['name', 'units', 'price', 'copper', 'share'] as const) {
    const first = nextSort({ key: 'other' as never, direction: 'ascending' }, key);
    expect(first.direction).toBe(key === 'name' ? 'ascending' : 'descending');
    const ascending = sortItems(items, { key, direction: 'ascending' });
    expect(sortItems(items, { key, direction: 'descending' })).toEqual([...ascending].reverse());
    expect(nextSort(first, key).direction).not.toBe(first.direction);
  }
  expect(sortItems(items, defaultSort)[0].item).toBe('b');
  expect(items.map(i => i.item)).toEqual(['b', 'a', 'c']);
  expect(unitPrice(items[2])).toBe(0);
});
test('custom input rejects incomplete, reversed, fractional and unsafe ranges', () => {
  for (const [from, to] of [['200', '170'], ['', '199'], ['1.5', '2'], ['0', '9'], ['1', '9007199254740992']]) expect(customRange('days', '', from, to)).toBeNull();
  expect(customRange('days', '', '170', '199')).toEqual({ from: 170, to: 199 });
  expect(customRange('last', '30', '', '')).toEqual({ last: 30 });
  expect(customRange('last', '-1', '', '')).toBeNull();
});
test('heatmap uses copper thresholds and rows of twenty, preserving event days', () => {
  expect([-1, 0, 999999, 1000000, 2500000, 5000000, 8000000].map(heatLevel)).toEqual([-1, 0, 0, 1, 2, 3, 4]);
  const cells = heatCells([{ day: 20, gameProfit: -1 }, { day: 21, gameProfit: 5 }], [{ day: 21, kind: 'stopped', text: 'Blast Potion stops selling' }]);
  expect(cells.map(c => [c.row, c.column, c.events.length])).toEqual([[0, 19, 0], [1, 0, 1]]);
});
test('KPIs use gameProfit directly, including quests exactly once', () => {
  const days = [{ day: 1, gameProfit: 100, profit: 200, quests: 0 }, { day: 2, gameProfit: 400, profit: 100, quests: 300 }] as HistoryResponse['days'];
  expect(historyKpis(days, 1)).toMatchObject({ average: 250, averageQuests: 150, best: { day: 2 }, worst: { day: 1 }, questDays: 1 });
  expect(historyKpis([], 0)).toBeNull();
});
test('movers rank income per day, ignore flat items and select three in each direction', () => {
  const movers = [-5, 0, 9, -7, 2, -1, 10, -2, 3].map((change, i) => ({ item: String(i), name: String(i), firstShare: 0, secondShare: 1, firstPerDay: 10, secondPerDay: 10 + change }));
  const selected = selectMovers(movers);
  expect(selected.falling.map(m => m.secondPerDay - m.firstPerDay)).toEqual([-7, -5, -2]);
  expect(selected.rising.map(m => m.secondPerDay - m.firstPerDay)).toEqual([10, 9, 3]);
  expect(selectMovers([])).toEqual({ falling: [], rising: [] });
});

test('item summary sums units and shop income without counting dispatch income', () => {
  expect(itemSummary([{ day: 1, units: 2, copper: 50, dispatched: 3, dispatchCopper: 99 }, { day: 2, units: 0, copper: 0, dispatched: 1, dispatchCopper: 22 }])).toEqual({ units: 2, income: 50 });
  expect(itemSummary([])).toEqual({ units: 0, income: 0 });
  expect(totalUnits(items)).toBe(12);
});

test('fixture history and item economics preserve the canvas checkpoints', async () => {
  const { fixtureCache } = await import('./helpers');
  const { historyView } = await import('../server/views/history');
  const { itemsView, itemView } = await import('../server/views/items');
  const model = (await fixtureCache().get()).model;
  const history = historyView(model, 170, 199);
  const cells = heatCells(history.allDays, history.events);
  expect(cells.find(c => c.day === 191)?.events).toContainEqual(expect.objectContaining({ item: 'BlastPotion', kind: 'stopped' }));
  expect(history.days.at(-1)?.gameProfit).toBe(5771730);
  expect(historyKpis(history.days, 18)).toMatchObject({ average: 7895914, averageQuests: 389493, questDays: 18 });
  const rows = itemsView(model, 170, 199);
  const faller = selectMovers(rows.movers).falling[0];
  expect(faller.item).toBe('BlastPotion');
  expect((faller.secondPerDay - faller.firstPerDay) / 100000).toBeCloseTo(-5.04, 2);
  expect(itemView(model, faller.item, 170, 199).flaggedDays.map(d => d.day)).toEqual([190, 191, 192, 193]);
  expect(itemSummary(itemView(model, faller.item, 170, 199).days)).toEqual({ units: 3070, income: 15699980 });
});

test('single-day ranges have no movers and default to the top income item', async () => {
  const { defaultItem } = await import('../client/economics');
  const movers = [{ item: 'misleading', name: 'Misleading', firstShare: 0, secondShare: 1, firstPerDay: 0, secondPerDay: 500 }];
  expect(selectMovers(movers, 1)).toEqual({ falling: [], rising: [] });
  expect(defaultItem({ from: 1, to: 1, movers, items, categories: [], shopTotal: 180 })).toBe('b');
  expect(defaultItem({ from: 1, to: 1, movers, items: [], categories: [], shopTotal: 0 })).toBeUndefined();
});

test('custom drafts commit once, allowing 30/70/199 and preset-valued edits', async () => {
  const { rangeCommit } = await import('../client/economics');
  for (const value of ['3', '7', '30', '70', '199']) {
    const next = rangeCommit({ last: 10 }, 'last', value, '', '');
    expect(next).toEqual({ last: Number(value) });
    expect(rangeCommit(next!, 'last', value, '', '')).toBeNull();
  }
  expect(rangeCommit({ last: 7 }, 'last', '', '', '')).toBeNull();
  expect(rangeCommit({ last: 7 }, 'days', '', '200', '170')).toBeNull();
  expect(rangeCommit({ last: 7 }, 'days', '', '170', '199')).toEqual({ from: 170, to: 199 });
});
