// Derived money per day, in copper-equivalent. Shared by the CLI and web.
import { COIN_FACE_VALUE, toCopper } from './coins';
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
  minted: { total: number; lines: MoneyLine[] }; // coins minted at face value
  melted: { total: number; lines: MoneyLine[] }; // coins melted at face value
  questsSubmitted: number;
  earnings: number; // shop + orders + priced quests (Daily Summary Earnings; no coins)
  expenses: number; // purchasing, priced items only (Daily Summary Expenses; no coins)
  beforeQuests: number; // shop + orders - purchasing (Subtotal before quests)
  dailySummaryProfit: number; // earnings - expenses (the game's Daily Summary Profit)
  profit: number; // dailySummaryProfit + minted - melted (the game's Ledger tab day tile)
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
  const coinCounts = new Map<string, { minted: number; melted: number }>();
  for (const r of day.items) {
    if (COIN_FACE_VALUE.has(r.item)) {
      const counts = coinCounts.get(r.item) ?? { minted: 0, melted: 0 };
      counts.minted += r.producedCount;
      counts.melted += r.consumedCount;
      coinCounts.set(r.item, counts);
    }
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
  const mintedLines: MoneyLine[] = [];
  const meltedLines: MoneyLine[] = [];
  for (const [item, counts] of coinCounts) {
    const faceValue = COIN_FACE_VALUE.get(item)!;
    if (counts.minted !== 0) mintedLines.push({ item, count: counts.minted, copper: counts.minted * faceValue });
    if (counts.melted !== 0) meltedLines.push({ item, count: counts.melted, copper: counts.melted * faceValue });
  }
  const minted = { total: total(mintedLines), lines: sorted(mintedLines) };
  const melted = { total: total(meltedLines), lines: sorted(meltedLines) };
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
  const dailySummaryProfit = earnings - purchasingTotal;
  return {
    shop: { total: shopTotal, lines: sorted(shop) },
    orders: { total: ordersTotal, lines: sorted(orders) },
    purchasing: { total: purchasingTotal, lines: sorted(purchases), unpriced: unpriced.sort(byItem) },
    quests,
    minted,
    melted,
    questsSubmitted: day.questsSubmitted.length,
    earnings,
    expenses: purchasingTotal,
    beforeQuests: shopTotal + ordersTotal - purchasingTotal,
    dailySummaryProfit,
    profit: dailySummaryProfit + minted.total - melted.total,
  };
}

export function hasCoinActivity(money: DayMoney): boolean {
  return money.minted.total > 0 || money.melted.total > 0;
}

export function showCoinRows(day: DayMoney, previous: DayMoney | null): boolean {
  return hasCoinActivity(day) || (previous !== null && hasCoinActivity(previous));
}

export function shopByCategory(lines: MoneyLine[], categories: CategoryMap): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    const cat = categories.get(l.item) ?? UNCATEGORIZED;
    out.set(cat, (out.get(cat) ?? 0) + l.copper);
  }
  return out;
}
