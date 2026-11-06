import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadItemNames } from '../src/config';
import { UNCATEGORIZED, dayMoney, shopByCategory } from '../src/ledger';
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

  it('computes earnings, expenses and net with quests null when quest pricing is omitted', () => {
    expect(m).toMatchObject({ earnings: 3_309_200, expenses: 1_011_200, net: 2_298_000, quests: null, questsSubmitted: 0 });
  });

  it('returns zero totals and empty lines for an empty in-progress day', () => {
    expect(dayMoney({ ...day([]), complete: false, profitCoef: null }, prices)).toEqual({
      shop: { total: 0, lines: [] }, orders: { total: 0, lines: [] },
      purchasing: { total: 0, lines: [], unpriced: [] },
      earnings: 0, expenses: 0, net: 0, quests: null, questsSubmitted: 0,
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
      questsSubmitted: 1, quests: null, earnings: 0, net: 0,
    });
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
