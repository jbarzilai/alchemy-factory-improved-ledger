// Derived money per day, in copper-equivalent. Shared by the CLI and web.
import { toCopper } from './coins';
import type { CategoryMap, Prices } from './config';
import type { DayLedger } from './model';
import { questPayout } from './quests';

export type MoneyLine = { item: string; count: number; copper: number };
export type QuestLine = { questId: string; isMain: boolean; copper: number };
export type QuestMoney = {
  total: number;
  bonus: number;
  lines: QuestLine[];
  unpriced: { questId: string; missing: string[] }[];
};

export type DayMoney = {
  shop: { total: number; lines: MoneyLine[] };
  orders: { total: number; lines: MoneyLine[] };
  purchasing: { total: number; lines: MoneyLine[]; unpriced: { item: string; count: number }[] };
  quests: QuestMoney | null; // null when quest pricing was not requested
  questsSubmitted: number;
  earnings: number; // shop + orders + priced quests
  expenses: number; // purchasing (priced items only)
  dailySummaryProfit: number;
};

export const UNCATEGORIZED = 'Uncategorized';

const total = (lines: MoneyLine[]) => lines.reduce((t, l) => t + l.copper, 0);
// Plain code-unit comparison, so tie order doesn't depend on the process locale (WSL vs Windows).
const byItem = (a: { item: string }, b: { item: string }) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0);
const sorted = (lines: MoneyLine[]) => lines.sort((a, b) => b.copper - a.copper || byItem(a, b));

export function dayMoney(day: DayLedger, prices: Prices, questOptions?: { questPrices: Prices; bonus: number }): DayMoney {
  const shop: MoneyLine[] = [];
  const orders: MoneyLine[] = [];
  const purchases: MoneyLine[] = [];
  const unpriced: { item: string; count: number }[] = [];
  for (const r of day.items) {
    const sold = toCopper(r.soldValue);
    if (r.soldCount > 0 || sold !== 0) shop.push({ item: r.item, count: r.soldCount, copper: sold });
    const dispatched = toCopper(r.dispatchValue);
    if (r.dispatchedCount > 0 || dispatched !== 0) orders.push({ item: r.item, count: r.dispatchedCount, copper: dispatched });
    if (r.restockCount > 0) {
      const price = prices.get(r.item);
      if (price === undefined) unpriced.push({ item: r.item, count: r.restockCount });
      else purchases.push({ item: r.item, count: r.restockCount, copper: r.restockCount * price });
    }
  }
  const shopTotal = total(shop);
  const ordersTotal = total(orders);
  const purchasingTotal = total(purchases);
  const quests: QuestMoney | null = questOptions ? { total: 0, bonus: questOptions.bonus, lines: [], unpriced: [] } : null;
  if (questOptions && quests) {
    for (const q of day.questsSubmitted) {
      const payout = questPayout(q, questOptions.questPrices, questOptions.bonus);
      if ('missing' in payout) quests.unpriced.push({ questId: q.questId, missing: payout.missing });
      else {
        quests.lines.push({ questId: q.questId, isMain: q.isMain, copper: payout.copper });
        quests.total += payout.copper;
      }
    }
  }
  const earnings = shopTotal + ordersTotal + (quests?.total ?? 0);
  return {
    shop: { total: shopTotal, lines: sorted(shop) },
    orders: { total: ordersTotal, lines: sorted(orders) },
    purchasing: { total: purchasingTotal, lines: sorted(purchases), unpriced: unpriced.sort(byItem) },
    quests,
    questsSubmitted: day.questsSubmitted.length,
    earnings,
    expenses: purchasingTotal,
    dailySummaryProfit: earnings - purchasingTotal,
  };
}

export function shopByCategory(lines: MoneyLine[], categories: CategoryMap): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    const cat = categories.get(l.item) ?? UNCATEGORIZED;
    out.set(cat, (out.get(cat) ?? 0) + l.copper);
  }
  return out;
}
