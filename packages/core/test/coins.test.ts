import { describe, expect, it } from 'vitest';
import { COIN_FACE_VALUE, coinsFromIntVector, toCopper } from '../src/coins';

describe('coins', () => {
  it('defines exactly the three coin face values', () => {
    expect(Object.fromEntries(COIN_FACE_VALUE)).toEqual({ CopperCoin: 1, SilverCoin: 1000, GoldCoin: 100000 });
  });

  it('converts (gold, silver, copper) to copper-equivalent', () => {
    expect(toCopper({ gold: 1, silver: 2, copper: 3 })).toBe(102_003);
    expect(toCopper({ gold: 6, silver: 0, copper: 0 })).toBe(600_000);
  });

  it('reads an IntVector in (gold, silver, copper) order', () => {
    expect(coinsFromIntVector([0, 2688, 0])).toEqual({ gold: 0, silver: 2688, copper: 0 });
    expect(toCopper(coinsFromIntVector([0, 2688, 0]))).toBe(2_688_000);
  });

  it('rejects vectors that are not 3 components', () => {
    expect(() => coinsFromIntVector([1, 2])).toThrow(/3 components/);
  });
});
