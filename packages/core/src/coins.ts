// Money as stored in the save: IntVector (gold, silver, copper). 1 gold = 100 silver, 1 silver = 1000 copper.
export type Coins = { gold: number; silver: number; copper: number };

export const COPPER_PER_SILVER = 1_000;
export const COPPER_PER_GOLD = 100_000;

export const COIN_FACE_VALUE: ReadonlyMap<string, number> = new Map([
  ['CopperCoin', 1], ['SilverCoin', COPPER_PER_SILVER], ['GoldCoin', COPPER_PER_GOLD],
]);

export function toCopper(c: Coins): number {
  return c.gold * COPPER_PER_GOLD + c.silver * COPPER_PER_SILVER + c.copper;
}

export function coinsFromIntVector(v: readonly number[]): Coins {
  if (v.length !== 3) throw new Error(`IntVector must have 3 components, got ${v.length}`);
  return { gold: v[0], silver: v[1], copper: v[2] };
}
