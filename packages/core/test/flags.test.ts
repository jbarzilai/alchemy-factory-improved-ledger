import { beforeAll, describe, expect, it } from 'vitest';
import { dayFlags, DEFAULT_FLAG_SETTINGS, streamAmounts } from '../src/flags';
import { dayMoney, type DayMoney } from '../src/ledger';
import { loadGameItems, loadQuestSkills } from '../src/config';
import { questBonus } from '../src/quests';
import { fixtureSnapshot } from './helpers/fixture';

type Lines = Record<string, [number, number]>;
function day(input: { shop?: Lines; orders?: Lines; purchasing?: Lines; unpriced?: Record<string, number>; quests?: number } = {}): DayMoney {
  const stream = (lines: Lines = {}) => ({
    lines: Object.entries(lines).map(([item, [count, copper]]) => ({ item, count, copper })),
    total: Object.values(lines).reduce((sum, [, copper]) => sum + copper, 0),
  });
  const shop = stream(input.shop), orders = stream(input.orders), purchasing = {
    ...stream(input.purchasing), unpriced: Object.entries(input.unpriced ?? {}).map(([item, count]) => ({ item, count })),
  };
  const earnings = shop.total + orders.total + (input.quests ?? 0);
  return { shop, orders, purchasing, quests: { total: input.quests ?? 0, bonus: 1, lines: [], unpriced: [] },
    minted: stream(), melted: stream(), beforeQuests: shop.total + orders.total - purchasing.total,
    profit: earnings - purchasing.total, questsSubmitted: 0, earnings, expenses: purchasing.total, dailySummaryProfit: earnings - purchasing.total };
}
const history = (units: number[]) => units.map(n => day({ shop: { X: [n, n * 10] } }));
const baseline = (d: DayMoney) => [d, d, d];

it('returns no flags before windowDays of history', () => {
  const days = history([100, 0, 0]);
  for (let i = 0; i < 3; i++) expect(dayFlags(days, i)).toEqual([]);
});
it('flags a drop at exactly dropRatio and not just above', () => {
  const days = (count: number) => [...baseline(day({ shop: { X: [100, 1000], Y: [100, 10000] } })),
    day({ shop: { X: [count, count * 10], Y: [100, 10000] } })];
  expect(dayFlags(days(50), 3)).toEqual([
    { stream: 'shop', item: 'X', kind: 'drop', today: 50, usual: 100, copper: 500, usualCopper: 1000, impact: -500 },
  ]);
  expect(dayFlags(days(51), 3)).toEqual([]);
});
it('flags a stopped item for its first zeroRunDays days with the pre-stop usual', () => {
  const days = history([100, 100, 100, 0, 0, 0, 0]);
  for (let i = 3; i <= 5; i++) expect(dayFlags(days, i)).toEqual([
    { stream: 'shop', item: 'X', kind: 'stopped', zeroDay: i - 2, today: 0, usual: 100, copper: 0, usualCopper: 1000, impact: -1000 },
  ]);
  expect(dayFlags(days, 6)).toEqual([]);
  expect(dayFlags(history([100, 0, 0, 0]), 3)).toEqual([]);
});
it('keeps flagging a stopped item for zeroRunDays days when that is longer than windowDays', () => {
  // A stopped item has no line at all, as in a real save.
  const days = [100, 100, 100, 0, 0, 0, 0, 0, 0].map(n => day(n ? { shop: { X: [n, n * 10] } } : {}));
  const settings = { ...DEFAULT_FLAG_SETTINGS, zeroRunDays: 5 };
  for (let i = 3; i <= 7; i++) expect(dayFlags(days, i, settings).map(f => f.zeroDay)).toEqual([i - 2]);
  expect(dayFlags(days, 8, settings)).toEqual([]);
});
it('does not flag an item without enough history', () => {
  expect(dayFlags(history([0, 0, 0, 10, 1]), 4)).toEqual([]);
});
it('flags a money drop that the unit rule misses, excluding quests from usual Earnings', () => {
  const prev = day({ shop: { X: [10, 1_000_000], Y: [100, 1_000_000] }, quests: 99_000_000 });
  const today = (copper: number) => day({ shop: { X: [7, copper], Y: [100, 1_000_000] } });
  expect(dayFlags([...baseline(prev), today(700_000)], 3)).toEqual([
    { stream: 'shop', item: 'X', kind: 'money-drop', today: 7, usual: 10, copper: 700_000, usualCopper: 1_000_000, impact: -300_000 },
  ]);
  expect(dayFlags([...baseline(prev), today(800_001)], 3)).toEqual([]);
  expect(dayFlags([...baseline(prev), today(800_000)], 3)[0].kind).toBe('money-drop');
});
it('flags purchase rises at riseRatio and never falls', () => {
  for (const count of [200, 199, 0]) {
    const days = [...baseline(day({ purchasing: { X: [100, 1000] } })), day({ purchasing: { X: [count, count * 10] } })];
    expect(dayFlags(days, 3)).toEqual(count === 200 ? [
      { stream: 'purchasing', item: 'X', kind: 'rise', today: 200, usual: 100, copper: 2000, usualCopper: 1000, impact: -1000 },
    ] : []);
  }
});
describe('purchase cost rises', () => {
  const purchaseDay = (count: number, shop = 1_000_000, price = 1000, orders = 0, quests = 0) =>
    day({ shop: { S: [100, shop] }, purchasing: { P: [count, count * price] }, orders: orders ? { O: [100, orders] } : {}, quests });
  const days = (count: number) => [...baseline(purchaseDay(100)), purchaseDay(count)];
  it('flags exactly 7.5% extra spend below the units threshold', () => {
    expect(dayFlags(days(175), 3)).toEqual([
      { stream: 'purchasing', item: 'P', kind: 'money-rise', today: 175, usual: 100, copper: 175000, usualCopper: 100000, impact: -75000 },
    ]);
  });
  it('does not flag just below 7.5%', () => {
    expect(dayFlags(days(174), 3)).toEqual([]);
  });
  it('prefers the units rule when both match', () => {
    expect(dayFlags(days(250), 3)).toEqual([
      { stream: 'purchasing', item: 'P', kind: 'rise', today: 250, usual: 100, copper: 250000, usualCopper: 100000, impact: -150000 },
    ]);
  });
  it('allows a usual of zero', () => {
    expect(dayFlags([...baseline(day({ shop: { S: [100, 1_000_000] } })), purchaseDay(10, 1_000_000, 10_000)], 3)).toEqual([
      { stream: 'purchasing', item: 'P', kind: 'money-rise', today: 10, usual: 0, copper: 100000, usualCopper: 0, impact: -100000 },
    ]);
  });
  it('uses Shop Income only, excluding large orders and quests', () => {
    for (const shop of [1_000_000, 200_000]) {
      const prev = purchaseDay(100, shop, 1000, 99_000_000, 99_000_000);
      const flags = dayFlags([...baseline(prev), purchaseDay(170, shop, 1000, 99_000_000, 99_000_000)], 3);
      expect(flags).toEqual(shop === 1_000_000 ? [] : [
        { stream: 'purchasing', item: 'P', kind: 'money-rise', today: 170, usual: 100, copper: 170000, usualCopper: 100000, impact: -70000 },
      ]);
    }
  });
  it('turns off with no usual Shop Income', () => {
    expect(dayFlags([...baseline(day({ purchasing: { P: [100, 1_000_000] } })), day({ purchasing: { P: [175, 1_750_000] } })], 3)).toEqual([]);
  });
  it.each(['today', 'usual', 'both'])('ignores an unpriced cost on %s under the units threshold', side => {
    const unpriced = (count: number) => day({ shop: { S: [100, 1_000_000] }, unpriced: { P: count } });
    const prev = side === 'today' ? purchaseDay(100) : unpriced(100);
    const today = side === 'usual' ? purchaseDay(175) : unpriced(175);
    expect(dayFlags([...baseline(prev), today], 3)).toEqual([]);
  });
  it('uses the configured share and median Shop Income over windowDays', () => {
    const varied = [purchaseDay(100, 100_000), purchaseDay(100, 1_000_000), purchaseDay(100, 9_000_000), purchaseDay(175, 9_000_000)];
    expect(dayFlags(varied, 3)[0].kind).toBe('money-rise');
    expect(dayFlags(varied, 3, { ...DEFAULT_FLAG_SETTINGS, purchaseShopShare: 0.076 })).toEqual([]);
    expect(dayFlags(varied, 3, { ...DEFAULT_FLAG_SETTINGS, windowDays: 2 })).toEqual([]);
  });
});
it('unpriced purchase rise has null money and sorts last', () => {
  const prev = day({ shop: { X: [100, 1000] }, unpriced: { A: 10 } });
  expect(dayFlags([...baseline(prev), day({ shop: { X: [50, 500] }, unpriced: { A: 20 } })], 3)).toEqual([
    { stream: 'shop', item: 'X', kind: 'drop', today: 50, usual: 100, copper: 500, usualCopper: 1000, impact: -500 },
    { stream: 'purchasing', item: 'A', kind: 'rise', today: 20, usual: 10, copper: null, usualCopper: null, impact: null },
  ]);
});
it('keeps the same item separate per stream and sorts ties by stream then code-unit item ID', () => {
  const prev = day({ shop: { a: [100, 1000], Z: [100, 1000], Bandage: [100, 1000] }, orders: { Bandage: [100, 1000] }, purchasing: { Z: [100, 500] } });
  const cur = day({ shop: { a: [50, 500], Z: [50, 500], Bandage: [50, 500] }, orders: { Bandage: [50, 500] }, purchasing: { Z: [200, 1000] } });
  expect(dayFlags([...baseline(prev), cur], 3).map(f => [f.stream, f.item])).toEqual([
    ['shop', 'Bandage'], ['shop', 'Z'], ['shop', 'a'], ['orders', 'Bandage'], ['purchasing', 'Z'],
  ]);
});
it('honours settings and uses the mean of the two middle values for even windows', () => {
  expect(dayFlags(history([100, 50]), 1, { ...DEFAULT_FLAG_SETTINGS, windowDays: 1 })[0].usual).toBe(100);
  expect(dayFlags(history([80, 120, 50]), 2, { ...DEFAULT_FLAG_SETTINGS, windowDays: 2 })[0].usual).toBe(100);
});
it('merges repeated lines, propagates unknown purchase cost, and leaves inputs unchanged', () => {
  const prev = day({ shop: { X: [100, 1000] }, purchasing: { P: [10, 100] } });
  prev.shop.lines.push({ item: 'X', count: 100, copper: 1000 });
  prev.shop.total += 1000;
  prev.purchasing.unpriced.push({ item: 'P', count: 10 });
  const days = [...baseline(prev), day({ shop: { X: [100, 1000] }, purchasing: { P: [40, 400] } })];
  const before = structuredClone(days);
  expect(dayFlags(days, 3)).toEqual([
    { stream: 'shop', item: 'X', kind: 'drop', today: 100, usual: 200, copper: 1000, usualCopper: 2000, impact: -1000 },
    { stream: 'purchasing', item: 'P', kind: 'rise', today: 40, usual: 20, copper: 400, usualCopper: null, impact: null },
  ]);
  expect(days).toEqual(before);
});

describe('fixture with quest pricing', () => {
  let days: DayMoney[];
  beforeAll(async () => {
    const snapshot = await fixtureSnapshot();
    const items = loadGameItems();
    const bonus = questBonus(snapshot.skills, loadQuestSkills());
    days = snapshot.days.filter(d => d.complete).map(d => dayMoney(d, items.purchasePrices, { questPrices: items.questPrices, bonus }));
  });
  it('Day 199 has exactly the three specified flags', () => {
    expect(dayFlags(days, 198)).toEqual([
      { stream: 'shop', item: 'Mars', kind: 'money-drop', today: 6, usual: 10, copper: 2688000, usualCopper: 4480000, impact: -1792000 },
      { stream: 'shop', item: 'Diamond2', kind: 'stopped', zeroDay: 1, today: 0, usual: 1, copper: 0, usualCopper: 144000, impact: -144000 },
      { stream: 'shop', item: 'BronzeRivet', kind: 'drop', today: 70, usual: 145, copper: 16800, usualCopper: 34800, impact: -18000 },
    ]);
  });
  it('Days 190, 191, 193 and 194 match the specified drops and zero runs', () => {
    const pick = (index: number) => dayFlags(days, index).map(({ item, kind, zeroDay, today, usual, impact }) => ({ item, kind, zeroDay, today, usual, impact }));
    expect(pick(189)).toEqual([
      { item: 'BlastPotion', kind: 'drop', today: 20, usual: 158, impact: -705732 },
      { item: 'Jupiter', kind: 'drop', today: 6, usual: 12, impact: -288000 },
      { item: 'LinenRope', kind: 'drop', today: 47, usual: 105, impact: -4176 },
      { item: 'LargeWoodGear', kind: 'drop', today: 55, usual: 137, impact: -820 },
    ]);
    expect(dayFlags(days, 190)).toEqual([
      { stream: 'shop', item: 'BlastPotion', kind: 'stopped', zeroDay: 1, today: 0, usual: 104, copper: 0, usualCopper: 531856, impact: -531856 },
    ]);
    expect(pick(192)).toEqual([
      { item: 'BlastPotion', kind: 'stopped', zeroDay: 3, today: 0, usual: 104, impact: -531856 },
      { item: 'Glass', kind: 'drop', today: 8, usual: 102, impact: -14100 },
      { item: 'Brick', kind: 'drop', today: 25, usual: 56, impact: -4340 },
      { item: 'WoodPulley', kind: 'drop', today: 44, usual: 90, impact: -4048 },
    ]);
    expect(dayFlags(days, 193)).toEqual([]);
  });
  it('Day 196 includes the Coal Ore cost rise', () => {
    expect(dayFlags(days, 195)).toContainEqual({ stream: 'purchasing', item: 'CoalOre', kind: 'money-rise', today: 369, usual: 221, copper: 1771200, usualCopper: 1060800, impact: -710400 });
  });
  it('has 442 flags over all 199 completed days', () => {
    expect(days).toHaveLength(199);
    expect(days.reduce((sum, _, i) => sum + dayFlags(days, i).length, 0)).toBe(442);
  });
});

it('group switches skip only their streams and keep the other baselines', () => {
  const prev = day({ shop: { S: [100, 1000000] }, orders: { O: [100, 1000000] }, purchasing: { P: [100, 100000] } });
  const days = [...baseline(prev), day({ shop: { S: [70, 700000] }, orders: { O: [70, 700000] }, purchasing: { P: [175, 175000] } })];
  const all = dayFlags(days, 3);
  expect(new Set(all.map(f => f.stream))).toEqual(new Set(['shop', 'orders', 'purchasing']));
  expect(dayFlags(days, 3, { ...DEFAULT_FLAG_SETTINGS, purchaseFlags: false })).toEqual(all.filter(f => f.stream !== 'purchasing'));
  expect(dayFlags(days, 3, { ...DEFAULT_FLAG_SETTINGS, incomeFlags: false })).toEqual(all.filter(f => f.stream === 'purchasing'));
});

it('keeps coins out of flags and income baselines while exposing their item amounts', () => {
  const days = [...baseline(day({ shop: { X: [100, 1000000] }, purchasing: { P: [100, 100000] } })),
    day({ shop: { X: [70, 700000] }, purchasing: { P: [175, 175000] } })];
  const coins = days.map((d, i) => ({ ...d,
    minted: { total: (i + 1) * 100000000, lines: [{ item: 'GoldCoin', count: (i + 1) * 1000, copper: (i + 1) * 100000000 }] },
    melted: { total: 100000000, lines: [{ item: 'SilverCoin', count: 100000, copper: 100000000 }] },
    profit: d.dailySummaryProfit + i * 100000000,
  }));
  expect(dayFlags(days, 3)).toHaveLength(2);
  expect(dayFlags(coins, 3)).toEqual(dayFlags(days, 3));
  expect(streamAmounts(coins[0], 'minted')).toEqual(new Map([['GoldCoin', { count: 1000, copper: 100000000 }]]));
  expect(streamAmounts(coins[0], 'melted')).toEqual(new Map([['SilverCoin', { count: 100000, copper: 100000000 }]]));
});
