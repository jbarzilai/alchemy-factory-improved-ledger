import { toCopper } from './coins';
import type { CategoryMap, Prices } from './config';
import type { DayLedger } from './model';

import { SHOP_CATEGORIES } from './shop-categories';
export { SHOP_CATEGORIES, type ShopCategory } from './shop-categories';

// Supplier rank n (ContractProfit<n> = SupplierLicense<n>) pays this much more per order (docs/SAVE_FORMAT.md §10).
const ORDER_PAY_PCT = [0, 8, 18, 30, 44, 60];
export const orderPayPct = (level: number): number => ORDER_PAY_PCT[Math.min(level, ORDER_PAY_PCT.length - 1)] ?? 0;

export const shopProfitPct = (coef: number): number => Math.round(coef * 100);

// Infer only uniquely determined whole percentages. Stored sales already include these bonuses.
export function categoryBonusPct(
  day: DayLedger, shopPct: number, shopBases: Prices, categories: CategoryMap,
): Map<string, number | null> {
  return new Map(SHOP_CATEGORIES.map((category) => {
    const considered = day.items.flatMap((item) => {
      const base = shopBases.get(item.item);
      if (categories.get(item.item) !== category || item.soldCount <= 0 || base === undefined || base <= 0) return [];
      const value = BigInt(toCopper(item.soldValue));
      const count = BigInt(item.soldCount);
      if (value % count !== 0n) return [];
      return [{ base: BigInt(base), unit: value / count }];
    });
    let match: number | null = null;
    if (considered.length) {
      for (let pct = 100; pct <= 500; pct++) {
        // floor(base * multiplier / 100) == unit, expressed with exact integer bounds.
        const multiplier = BigInt(shopPct + pct - 100);
        if (considered.every(({ base, unit }) => base * multiplier >= unit * 100n && base * multiplier < (unit + 1n) * 100n)) {
          if (match !== null) return [category, null];
          match = pct;
        }
      }
    }
    return [category, match];
  }));
}
