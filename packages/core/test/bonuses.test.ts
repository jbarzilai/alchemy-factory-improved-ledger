import { describe, expect, it } from 'vitest';
import { categoryBonusPct, SHOP_CATEGORIES, shopProfitPct, type DayLedger, type ItemDayRecord } from '../src/index';

const sale = (item: string, unit: number, count = 1): ItemDayRecord => ({
  item, soldCount: count, soldValue: { gold: 0, silver: 0, copper: unit * count },
  dispatchedCount: 0, dispatchValue: { gold: 0, silver: 0, copper: 0 },
  restockCount: 0, producedCount: 0, consumedCount: 0,
});
const day = (items: ItemDayRecord[]): DayLedger => ({
  saveDay: 0, displayDay: 1, complete: true, profitCoef: 1.2, items, questsSubmitted: [],
});
const bases = new Map([['GrowthPotion', 1224], ['HealingPotion', 85], ['Cheap', 8], ['Zero', 0]]);
const categories = new Map([...bases.keys(), 'Missing'].map((item) => [item, 'Potion' as const]));
const infer = (items: ItemDayRecord[], shop = 120) => categoryBonusPct(day(items), shop, bases, categories);

describe('categoryBonusPct', () => {
  it('infers the unique additive category bonus and returns every shop category', () => {
    const result = infer([sale('GrowthPotion', 2448)]);
    expect([...result.keys()]).toEqual(SHOP_CATEGORIES);
    expect(result.get('Potion')).toBe(180);
    for (const category of SHOP_CATEGORIES.filter((c) => c !== 'Potion')) expect(result.get(category)).toBeNull();
  });

  it('respects flooring at the copper boundary', () => {
    expect(infer([sale('HealingPotion', 93)], 100).get('Potion')).toBe(110);
  });

  it('returns null for ambiguous, inconsistent or impossible prices', () => {
    expect(infer([sale('Cheap', 16)]).get('Potion')).toBeNull();
    expect(infer([sale('GrowthPotion', 2448), sale('HealingPotion', 153)]).get('Potion')).toBeNull();
    expect(infer([sale('GrowthPotion', 1)]).get('Potion')).toBeNull();
  });

  it('skips fractional unit prices rather than invalidating the other evidence', () => {
    expect(infer([sale('GrowthPotion', 2448), sale('HealingPotion', 93.5, 2)]).get('Potion')).toBe(180);
    expect(infer([sale('HealingPotion', 93.5, 2)]).get('Potion')).toBeNull();
  });

  it('ignores absent or zero shop bases and items without sales or a shop category', () => {
    expect(infer([sale('GrowthPotion', 2448), sale('Missing', 1), sale('Zero', 1), sale('Cheap', 100, 0), sale('Unknown', 1)])
      .get('Potion')).toBe(180);
    expect([...infer([]).values()]).toEqual(SHOP_CATEGORIES.map(() => null));
    expect(infer([sale('GrowthPotion', 2448, 0)]).get('Potion')).toBeNull();
    expect(infer([sale('Missing', 1)]).get('Potion')).toBeNull();
  });

  it.each([100, 500])('includes the %s percent search boundary', (pct) => {
    expect(infer([sale('GrowthPotion', 1224 * pct / 100)], 100).get('Potion')).toBe(pct);
  });
});

it('rounds the stored float-like Shop Profit coefficient to a whole percent', () => {
  expect(shopProfitPct(1.2000000476837158)).toBe(120);
});
