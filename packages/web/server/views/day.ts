import { SHOP_CATEGORIES, questLabel, shopByCategory, streamAmounts, type DayMoney, type Flag, type FlagStream } from '@af-ledger/core';
import type { DayItemLine, DayResponse, SourceKey, Totals } from '../../shared/api';
import type { LedgerModel } from '../state';

// The API series order differs from core's historical category order.
export const SOURCE_CATEGORIES = [...SHOP_CATEGORIES].sort((a, b) =>
  ['Sundries', 'Potion', 'Beverage', 'Jewelry', 'Relic'].indexOf(a) - ['Sundries', 'Potion', 'Beverage', 'Jewelry', 'Relic'].indexOf(b));
export const completedDays = (model: LedgerModel) => model.ledger.snapshot.days.filter(d => d.complete).sort((a, b) => a.saveDay - b.saveDay);
export const apiError = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
export function wholeDay(value: unknown): number {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return apiError(400, 'day must be a whole number');
  return Number(value);
}
export function dayIndex(model: LedgerModel, day: number): number {
  if (!Number.isSafeInteger(day)) return apiError(400, 'day must be a whole number');
  const days = completedDays(model);
  if (!days.length) return apiError(404, 'no completed days yet');
  const index = days.findIndex(d => d.displayDay === day);
  if (index < 0) return apiError(404, `Day ${day} is not a completed day (Days ${days[0].displayDay}–${days.at(-1)!.displayDay})`);
  return index;
}
export function range(model: LedgerModel, from?: unknown, to?: unknown): { from: number; to: number } {
  const days = completedDays(model);
  if (!days.length) return apiError(404, 'no completed days yet');
  const end = to === undefined ? days.at(-1)!.displayDay : wholeDay(to);
  // Check the day the user sent before one derived from it, so the error names their day.
  dayIndex(model, end);
  const start = from === undefined ? Math.max(days[0].displayDay, end - 6) : wholeDay(from);
  dayIndex(model, start);
  if (start > end) return apiError(400, `from must not exceed to (Days ${days[0].displayDay}–${days.at(-1)!.displayDay})`);
  return { from: start, to: end };
}
export const totals = (money: DayMoney): Totals => ({
  earnings: money.shop.total + money.orders.total, expenses: money.expenses,
  profit: money.net - (money.quests?.total ?? 0), quests: money.quests?.total ?? 0,
  gameProfit: money.net, questCount: money.questsSubmitted,
});
export function sources(model: LedgerModel, money: DayMoney): Record<SourceKey, number> {
  const cats = shopByCategory(money.shop.lines, model.ledger.categories);
  return Object.fromEntries([
    ...SOURCE_CATEGORIES.map(label => [label.toLowerCase(), cats.get(label) ?? 0]),
    ['uncategorized', cats.get('Uncategorized') ?? 0], ['orders', money.orders.total],
  ]) as Record<SourceKey, number>;
}
// Flagged items always get a line, so clicking a flag has a row to open. On day 2 or 3 of a stop the item sold
// nothing that day or the day before, so it would otherwise have no line.
export function dayItems(model: LedgerModel, current: DayMoney, previous: DayMoney | null, flags: Flag[] = []): DayResponse['items'] {
  const { ledger } = model;
  const descending = (a: number | null, b: number | null): number =>
    a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a;
  const lines = (stream: FlagStream): DayItemLine[] => {
    const today = streamAmounts(current, stream);
    const yesterday = previous ? streamAmounts(previous, stream) : null;
    return [...new Set([...today.keys(), ...(yesterday?.keys() ?? []), ...flags.filter(f => f.stream === stream).map(f => f.item)])].map(item => {
      const amount = today.get(item);
      const before = yesterday?.get(item);
      return {
        item, name: ledger.name(item),
        category: stream === 'shop' ? (ledger.categories.get(item)?.toLowerCase() ?? 'uncategorized') as SourceKey : null,
        units: amount?.count ?? 0, copper: amount ? amount.copper : 0,
        previousUnits: yesterday ? before?.count ?? 0 : null,
        previousCopper: yesterday ? (before ? before.copper : 0) : null,
      };
    }).sort((a, b) => descending(a.copper, b.copper) || descending(a.previousCopper, b.previousCopper)
      || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  };
  return { shop: lines('shop'), orders: lines('orders'), purchasing: lines('purchasing') };
}
export function dayView(model: LedgerModel, day: number): DayResponse {
  const index = dayIndex(model, day);
  const { ledger } = model;
  const current = model.days[index];
  const previous = index > 0 ? model.days[index - 1] : null;
  const bonuses = ledger.bonuses(completedDays(model)[index]);
  const currentSources = sources(model, current);
  const previousSources = previous ? sources(model, previous) : null;
  const unpriced = current.purchasing.unpriced.map(line => ({ ...line, name: ledger.name(line.item) }));
  const notices: string[] = [];
  if (current.questsSubmitted) notices.push(`Quest rewards use the save's current Quest Rewards bonus (${bonuses.questRewards}%), as the game's own ledger does.`);
  for (const item of new Map(unpriced.map(line => [line.item, line])).values()) notices.push(`${item.name}: no purchase price in the game data, left out of Expenses.`);
  for (const quest of current.quests?.unpriced ?? []) notices.push(`${questLabel(quest.questId)}: no quest price for ${quest.missing.map(ledger.name).join(', ')}, left out of Quest Rewards.`);
  return {
    day, previousDay: index > 0 ? completedDays(model)[index - 1].displayDay : null,
    bonuses: { shopProfit: bonuses.shopProfit, categories: Object.fromEntries(SOURCE_CATEGORIES.map(label => [label.toLowerCase(), bonuses.categories[label]])) as DayResponse['bonuses']['categories'], orderIncomePct: bonuses.orderIncomePct, questRewards: bonuses.questRewards },
    items: dayItems(model, current, previous, model.flags[index]),
    totals: totals(current), previousTotals: previous ? totals(previous) : null,
    sources: [...SOURCE_CATEGORIES.map(label => ({ key: label.toLowerCase() as SourceKey, label })), { key: 'uncategorized' as const, label: 'Uncategorized' }, { key: 'orders' as const, label: 'Order Income' }]
      .filter(({ key }) => key !== 'uncategorized' || currentSources[key] !== 0 || (previousSources?.[key] ?? 0) !== 0)
      .map(({ key, label }) => ({ key, label, copper: currentSources[key], previous: previousSources?.[key] ?? null })),
    purchasing: { copper: current.purchasing.total, previous: previous?.purchasing.total ?? null, unpriced },
    quests: { copper: current.quests?.total ?? 0, previous: previous ? previous.quests?.total ?? 0 : null,
      lines: (current.quests?.lines ?? []).map(({ questId, copper }) => ({ questId, label: questLabel(questId), copper })), unpriced: current.quests?.unpriced ?? [] },
    flags: model.flags[index].map(flag => ({ ...flag, day, name: ledger.name(flag.item), category: flag.stream === 'shop' ? (ledger.categories.get(flag.item)?.toLowerCase() ?? 'uncategorized') as SourceKey : null })),
    notices,
  };
}
