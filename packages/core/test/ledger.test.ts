import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadItemNames } from '../src/config';
import { UNCATEGORIZED, dayMoney, hasCoinActivity, showCoinRows, shopByCategory } from '../src/ledger';
import type { DayLedger, ItemDayRecord } from '../src/model';

const zero = { gold: 0, silver: 0, copper: 0 };
const rec = (item: string, r: Partial<ItemDayRecord>): ItemDayRecord => ({
  item, soldCount: 0, soldValue: zero, dispatchedCount: 0, dispatchValue: zero,
  restockCount: 0, producedCount: 0, consumedCount: 0, ...r,
});
const day = (items: ItemDayRecord[]): DayLedger => ({
  saveDay: 5, displayDay: 6, complete: true, profitCoef: 1.2, items, questsSubmitted: [],
});

describe('dayMoney', () => {
  const prices = new Map([['Wood', 200], ['RockSalt', 9000]]);
  const d = day([
    rec('Salt', { soldCount: 106, soldValue: { gold: 0, silver: 0, copper: 21200 } }),
    rec('Mars', { soldCount: 6, soldValue: { gold: 0, silver: 2688, copper: 0 } }),
    rec('Bandage', { dispatchedCount: 2000, dispatchValue: { gold: 0, silver: 600, copper: 0 } }),
    rec('Wood', { restockCount: 196 }),
    rec('RockSalt', { restockCount: 108 }),
    rec('Mystery', { restockCount: 4 }),
    rec('Gear', { producedCount: 50, consumedCount: 50 }),
  ]);
  const m = dayMoney(d, prices);

  it('values shop and order income in copper, largest first', () => {
    expect(m.shop.lines).toEqual([{ item: 'Mars', count: 6, copper: 2_688_000 }, { item: 'Salt', count: 106, copper: 21_200 }]);
    expect(m.shop.total).toBe(2_709_200);
    expect(m.orders).toEqual({ total: 600_000, lines: [{ item: 'Bandage', count: 2000, copper: 600_000 }] });
  });

  it('costs purchases from prices and lists unpriced items instead of costing them at 0', () => {
    expect(m.purchasing.lines).toEqual([{ item: 'RockSalt', count: 108, copper: 972_000 }, { item: 'Wood', count: 196, copper: 39_200 }]);
    expect(m.purchasing.total).toBe(1_011_200);
    expect(m.purchasing.unpriced).toEqual([{ item: 'Mystery', count: 4 }]);
  });

  it('computes earnings, expenses and dailySummaryProfit with quests null when quest pricing is omitted', () => {
    expect(m).toMatchObject({ earnings: 3_309_200, expenses: 1_011_200, dailySummaryProfit: 2_298_000, quests: null, questsSubmitted: 0 });
  });

  it('returns zero totals and empty lines for an empty in-progress day', () => {
    expect(dayMoney({ ...day([]), complete: false, profitCoef: null }, prices)).toEqual({
      shop: { total: 0, lines: [] }, orders: { total: 0, lines: [] },
      purchasing: { total: 0, lines: [], unpriced: [] },
      minted: { total: 0, lines: [] }, melted: { total: 0, lines: [] },
      earnings: 0, expenses: 0, beforeQuests: 0, dailySummaryProfit: 0, profit: 0, quests: null, questsSubmitted: 0,
    });
  });

  it('sorts equal-valued lines by item in all three channels without changing the input', () => {
    const input = day(['Zinc', 'Amber'].map((item) => rec(item, {
      soldCount: 1, soldValue: { gold: 1, silver: 0, copper: 0 },
      dispatchedCount: 1, dispatchValue: { gold: 1, silver: 0, copper: 0 }, restockCount: 2,
    })));
    const before = structuredClone(input);
    const money = dayMoney(input, new Map([['Zinc', 50_000], ['Amber', 50_000]]));
    for (const channel of [money.shop, money.orders, money.purchasing]) {
      expect(channel.total).toBe(200_000);
      expect(channel.lines.map((line) => line.item)).toEqual(['Amber', 'Zinc']);
    }
    expect(input).toEqual(before);
  });

  it('retains count-only and value-only income, and distinguishes free purchases from unpriced ones', () => {
    const money = dayMoney(day([
      rec('Free', { soldCount: 1, dispatchedCount: 2, restockCount: 3 }),
      rec('ValueOnly', { soldValue: { gold: 1, silver: 2, copper: 3 }, dispatchValue: { gold: 0, silver: 1, copper: 4 } }),
      rec('Unknown', { restockCount: 4 }),
    ]), new Map([['Free', 0]]));
    expect(money.shop.lines).toEqual([
      { item: 'ValueOnly', count: 0, copper: 102_003 }, { item: 'Free', count: 1, copper: 0 },
    ]);
    expect(money.orders.lines).toEqual([
      { item: 'ValueOnly', count: 0, copper: 1_004 }, { item: 'Free', count: 2, copper: 0 },
    ]);
    expect(money.purchasing).toEqual({
      total: 0, lines: [{ item: 'Free', count: 3, copper: 0 }], unpriced: [{ item: 'Unknown', count: 4 }],
    });
  });

  it('counts submitted quests with quests null and awards excluded when quest pricing is omitted', () => {
    const input = day([]);
    input.questsSubmitted.push({
      questId: 'Main7', isMain: true, isRandom: false, acceptDay: 0, submitDay: 5,
      goldFactor: 1.3, awardGold: { gold: 6, silver: 0, copper: 0 }, requires: [],
    });
    expect(dayMoney(input, prices)).toMatchObject({
      questsSubmitted: 1, quests: null, earnings: 0, dailySummaryProfit: 0,
    });
  });
});

describe('coin accounting', () => {
  const mintRecords = [rec('CopperCoin', { producedCount: 66000 }), rec('SilverCoin', { producedCount: 1565 }),
    rec('GoldCoin', { producedCount: 120 })];
  const mintLines = [{ item: 'GoldCoin', count: 120, copper: 12000000 },
    { item: 'SilverCoin', count: 1565, copper: 1565000 }, { item: 'CopperCoin', count: 66000, copper: 66000 }];
  const prices = new Map([['Wood', 200]]);

  it('values all minted coins at face value, largest first', () => {
    const money = dayMoney(day(mintRecords), prices);
    expect(money.minted).toEqual({ total: 13631000, lines: mintLines });
    expect(money.melted).toEqual({ total: 0, lines: [] });
  });

  it('values silver and gold melted at face value', () => {
    const money = dayMoney(day([rec('SilverCoin', { consumedCount: 6 }), rec('GoldCoin', { consumedCount: 3 })]), prices);
    expect(money.melted).toEqual({ total: 306000, lines: [
      { item: 'GoldCoin', count: 3, copper: 300000 }, { item: 'SilverCoin', count: 6, copper: 6000 },
    ] });
  });

  it('includes all six coin flows in Profit while preserving Daily Summary totals and priced quests', () => {
    const input = day([rec('Salt', { soldCount: 1, soldValue: { ...zero, copper: 1000 } }),
      rec('Bandage', { dispatchedCount: 2, dispatchValue: { ...zero, copper: 500 } }), rec('Wood', { restockCount: 2 })]);
    input.questsSubmitted.push({ questId: 'Main7', isMain: true, isRandom: false, acceptDay: 0, submitDay: 5,
      goldFactor: 0, awardGold: { ...zero, copper: 100 }, requires: [] });
    const options = { questPrices: new Map<string, number>(), bonus: 1 };
    const base = dayMoney(input, prices, options);
    const money = dayMoney({ ...input, items: [...input.items, ...mintRecords.map(r => ({ ...r, consumedCount: 3 }))] }, prices, options);
    expect(money.minted.total).toBe(13631000);
    expect(money.melted.total).toBe(303003);
    expect(money.quests?.total).toBe(100);
    expect(money.earnings).toBe(base.earnings);
    expect(money.expenses).toBe(base.expenses);
    expect(money.beforeQuests).toBe(1100);
    expect(money.beforeQuests + (money.quests?.total ?? 0)).toBe(money.dailySummaryProfit);
    expect(money.profit).toBe(money.earnings - money.expenses + money.minted.total - money.melted.total);
  });

  it('sums repeated coin records into one line per stream without changing the input', () => {
    const input = day([rec('CopperCoin', { producedCount: 10, consumedCount: 2 }),
      rec('CopperCoin', { producedCount: 20, consumedCount: 3 }), rec('GoldCoin', {})]);
    const before = structuredClone(input);
    const money = dayMoney(input, prices);
    expect(money.minted).toEqual({ total: 30, lines: [{ item: 'CopperCoin', count: 30, copper: 30 }] });
    expect(money.melted).toEqual({ total: 5, lines: [{ item: 'CopperCoin', count: 5, copper: 5 }] });
    expect(input).toEqual(before);
  });

  it('ignores non-coin production and consumption', () => {
    expect(dayMoney(day([rec('Gear', { producedCount: 50, consumedCount: 50 })]), prices)).toEqual(dayMoney(day([]), prices));
  });

  it('includes coins with quest pricing off and ignores purchase prices for coin face values', () => {
    const input = day([...mintRecords, rec('GoldCoin', { consumedCount: 3 }), rec('CopperCoin', { consumedCount: 10 })]);
    const money = dayMoney(input, new Map([['GoldCoin', 153000], ['CopperCoin', 2]]));
    expect(money.quests).toBeNull();
    expect(money.beforeQuests).toBe(money.dailySummaryProfit);
    expect(money.minted.total).toBe(13631000);
    expect(money.melted.total).toBe(300010);
    expect(money.profit).toBe(money.earnings - money.expenses + 13631000 - 300010);
  });

  it('shows coin rows for activity today or yesterday, including a first day', () => {
    const none = dayMoney(day([]), prices);
    const minted = dayMoney(day(mintRecords), prices);
    const melted = dayMoney(day([rec('CopperCoin', { consumedCount: 1 })]), prices);
    expect(hasCoinActivity(none)).toBe(false);
    expect(hasCoinActivity(minted)).toBe(true);
    expect(hasCoinActivity(melted)).toBe(true);
    expect(showCoinRows(none, null)).toBe(false);
    expect(showCoinRows(minted, null)).toBe(true);
    expect(showCoinRows(melted, null)).toBe(true);
    expect(showCoinRows(none, melted)).toBe(true);
    expect(showCoinRows(none, minted)).toBe(true);
    expect(showCoinRows(none, none)).toBe(false);
  });
});

describe('shopByCategory', () => {
  it('totals by shop category and shows unknown items as Uncategorized', () => {
    const cats = new Map([['Salt', 'Sundries' as const], ['Soap', 'Sundries' as const]]);
    const lines = [{ item: 'Salt', count: 1, copper: 100 }, { item: 'Soap', count: 1, copper: 50 }, { item: 'NewThing', count: 1, copper: 7 }];
    expect(shopByCategory(lines, cats)).toEqual(new Map([['Sundries', 150], [UNCATEGORIZED, 7]]));
  });
});

describe('config loaders', () => {
  const dirs: string[] = [];
  const tmp = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'af-ledger-config-'));
    dirs.push(dir);
    return dir;
  };
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it('loads in-game names by default and ignores underscore comment keys', () => {
    expect(loadItemNames().get('Catalyst2')).toBe('Fertile Catalyst');
    const file = path.join(tmp(), 'names.json');
    writeFileSync(file, JSON.stringify({ _comment: {}, Wood: 'Logs' }));
    expect(loadItemNames(file)).toEqual(new Map([['Wood', 'Logs']]));
  });

  it.each([null, 12, true, [], {}, '', '   '])('rejects invalid name %j, naming file and key', (value) => {
    const file = path.join(tmp(), 'names.json');
    writeFileSync(file, JSON.stringify({ Wood: value }));
    expect(() => loadItemNames(file)).toThrow(`${file}: name for Wood must be a non-empty string`);
  });

});
