import { hasCoinActivity, toCopper, type ShopCategory } from '@af-ledger/core';
import type { HistoryResponse } from '../../shared/api';
import type { LedgerModel } from '../state';
import { apiError, completedDays, dayIndex, sources, SOURCE_CATEGORIES } from './day';

function events(model: LedgerModel): HistoryResponse['events'] {
  const result: HistoryResponse['events'] = [];
  const days = completedDays(model);
  const { ledger, settings } = model;
  const seenSales = new Set<string>();
  const lastPrices = new Map<string, number>();
  const categoryBonuses = new Map<ShopCategory, number>();
  let firstOrder = false;
  let previousShop: number | null = null;
  // An upgrade lands mid-day, so its day holds a mixed average price. A run of consecutive rising days is one event,
  // comparing each item's price before the run with its price on the run's last day.
  let orderRun: { day: number; lastDay: number; item: string; old: Map<string, number>; now: Map<string, number> } | undefined;
  const flushOrder = () => {
    if (!orderRun) return;
    const { day, item, old, now } = orderRun;
    const rises = [...old].map(([id, price]) => Math.round((now.get(id)! / price - 1) * 100));
    const [low, high] = [Math.min(...rises), Math.max(...rises)];
    const price = (copper: number) => Math.round(copper);
    result.push({ day, kind: 'order-income', item, text: `Order prices up ${low === high ? low : `${low}–${high}`}% (${ledger.name(item)} ${price(old.get(item)!)} → ${price(now.get(item)!)})` });
    orderRun = undefined;
  };
  const streamItems = {
    shop: new Set(model.days.flatMap(d => d.shop.lines.map(l => l.item))),
    orders: new Set(model.days.flatMap(d => d.orders.lines.map(l => l.item))),
  };
  days.forEach((day, i) => {
    const bonus = ledger.bonuses(day);
    if (bonus.shopProfit !== null) {
      if (previousShop !== null && bonus.shopProfit !== previousShop) result.push({ day: day.displayDay, kind: 'shop-profit', text: `Shop Profit ${bonus.shopProfit}%` });
      previousShop = bonus.shopProfit;
    }
    const changes: string[] = [];
    for (const category of SOURCE_CATEGORIES) {
      const value = bonus.categories[category];
      if (value === null) continue;
      if (categoryBonuses.has(category) && categoryBonuses.get(category) !== value) changes.push(`${category} ${value}%`);
      categoryBonuses.set(category, value);
    }
    if (changes.length) result.push({ day: day.displayDay, kind: 'bonus', text: changes.join(', ') });
    const rises: { item: string; old: number; price: number }[] = [];
    for (const line of day.items) {
      if (line.soldCount > 0 && !seenSales.has(line.item)) {
        seenSales.add(line.item);
        result.push({ day: day.displayDay, kind: 'first-sale', item: line.item, text: `${ledger.name(line.item)} first sold` });
      }
      if (line.dispatchedCount <= 0) continue;
      if (!firstOrder) {
        firstOrder = true;
        result.push({ day: day.displayDay, kind: 'first-order', item: line.item, text: `First order dispatched (${ledger.name(line.item)})` });
      }
      const price = toCopper(line.dispatchValue) / line.dispatchedCount;
      const old = lastPrices.get(line.item);
      if (old !== undefined && old > 0 && price > old) rises.push({ item: line.item, old, price });
      lastPrices.set(line.item, price);
    }
    if (rises.length) {
      if (orderRun && orderRun.lastDay !== day.displayDay - 1) flushOrder();
      orderRun ??= { day: day.displayDay, lastDay: day.displayDay, item: rises[0].item, old: new Map(), now: new Map() };
      orderRun.lastDay = day.displayDay;
      for (const r of rises) {
        if (!orderRun.old.has(r.item)) orderRun.old.set(r.item, r.old);
        orderRun.now.set(r.item, r.price);
      }
    } else flushOrder();
    for (const stream of ['shop', 'orders'] as const) {
      const count = (index: number, item: string) => model.days[index][stream].lines.filter(l => l.item === item).reduce((n, l) => n + l.count, 0);
      for (const item of streamItems[stream]) {
        if (i < settings.windowDays || count(i, item) !== 0 || count(i - 1, item) === 0) continue;
        let end = i;
        while (end < days.length && count(end, item) === 0) end++;
        if (end - i <= settings.zeroRunDays) continue;
        const usual = Array.from({ length: settings.windowDays }, (_, j) => count(i - settings.windowDays + j, item)).sort((a, b) => a - b);
        const mid = Math.floor(usual.length / 2);
        const median = usual.length % 2 ? usual[mid] : (usual[mid - 1] + usual[mid]) / 2;
        if (median > 0) result.push({ day: day.displayDay, kind: 'stopped', item, text: `${ledger.name(item)} ${stream === 'shop' ? 'stops selling' : 'orders stop'}` });
      }
    }
  });
  flushOrder();
  return result.sort((a, b) => a.day - b.day || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}
export function historyView(model: LedgerModel, from: number, to: number): HistoryResponse {
  const start = dayIndex(model, from), end = dayIndex(model, to);
  if (start > end) return apiError(400, 'from must not exceed to');
  const completed = completedDays(model);
  return { from, to, showCoins: model.days.slice(start, end + 1).some(hasCoinActivity),
    days: model.days.slice(start, end + 1).map((money, i) => ({ day: completed[start + i].displayDay, sources: sources(model, money), purchasing: money.purchasing.total, quests: money.quests?.total ?? 0, minted: money.minted.total, melted: money.melted.total, profit: money.profit })),
    allDays: model.days.map((money, i) => ({ day: completed[i].displayDay, profit: money.profit })), events: events(model),
  };
}
