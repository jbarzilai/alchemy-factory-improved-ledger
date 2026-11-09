import type { HistoryResponse, ItemsResponse, ItemResponse } from '../shared/api';
import type { Range } from './route';
export type ShopItem = ItemsResponse['items'][number];
export type SortKey = 'name' | 'units' | 'price' | 'copper' | 'share';
export type Sort = { key: SortKey; direction: 'ascending' | 'descending' };
export const defaultSort: Sort = { key: 'copper', direction: 'descending' };
export function nextSort(sort: Sort, key: SortKey): Sort {
  return { key, direction: sort.key === key ? (sort.direction === 'ascending' ? 'descending' : 'ascending') : key === 'name' ? 'ascending' : 'descending' };
}
export const unitPrice = (item: ShopItem) => item.units ? item.copper / item.units : 0;
export function sortItems(items: ShopItem[], sort: Sort): ShopItem[] {
  return [...items].sort((a, b) => {
    const value = (r: ShopItem) => sort.key === 'price' ? unitPrice(r) : sort.key === 'share' ? r.copper : r[sort.key];
    const x = value(a), y = value(b);
    const comparison = typeof x === 'string' && typeof y === 'string' ? (x < y ? -1 : x > y ? 1 : 0) : Number(x) - Number(y);
    return (sort.direction === 'ascending' ? comparison : -comparison) || a.item.localeCompare(b.item);
  });
}
export const moverChange = (m: ItemsResponse['movers'][number]) => m.secondPerDay - m.firstPerDay;
export function selectMovers(movers: ItemsResponse['movers'], dayCount = 2) {
  if (dayCount < 2) return { falling: [], rising: [] };
  return {
    falling: movers.filter(m => moverChange(m) < 0).sort((a, b) => moverChange(a) - moverChange(b)).slice(0, 3),
    rising: movers.filter(m => moverChange(m) > 0).sort((a, b) => moverChange(b) - moverChange(a)).slice(0, 3),
  };
}
export function historyKpis(days: HistoryResponse['days'], questDays: number) {
  if (!days.length) return null;
  return {
    average: Math.round(days.reduce((n, d) => n + d.profit, 0) / days.length),
    averageQuests: Math.round(days.reduce((n, d) => n + d.quests, 0) / days.length),
    best: days.reduce((a, b) => a.profit >= b.profit ? a : b),
    worst: days.reduce((a, b) => a.profit <= b.profit ? a : b), questDays,
  };
}
export function heatLevel(copper: number): number {
  return copper < 0 ? -1 : copper < 1_000_000 ? 0 : copper < 2_500_000 ? 1 : copper < 5_000_000 ? 2 : copper < 8_000_000 ? 3 : 4;
}
export function heatCells(days: HistoryResponse['allDays'], events: HistoryResponse['events']) {
  return days.map(d => ({ ...d, row: Math.floor((d.day - 1) / 20), column: (d.day - 1) % 20, level: heatLevel(d.profit), events: events.filter(e => e.day === d.day) }));
}
export function customRange(mode: 'last' | 'days', last: string, from: string, to: string): Range | null {
  const positive = (s: string) => /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0;
  if (mode === 'last') return positive(last) ? { last: Number(last) } : null;
  return positive(from) && positive(to) && Number(from) <= Number(to) ? { from: Number(from), to: Number(to) } : null;
}
export const shopIncome = (d: HistoryResponse['days'][number]) => Object.entries(d.sources).reduce((n, [key, v]) => n + (key === 'orders' ? 0 : v), 0);

export function itemSummary(days: ItemResponse['days']) {
  return days.reduce((sum, d) => ({ units: sum.units + d.units, income: sum.income + d.copper }), { units: 0, income: 0 });
}
export const totalUnits = (items: ShopItem[]) => items.reduce((n, r) => n + r.units, 0);

export function defaultItem(data: ItemsResponse): string | undefined {
  const dayCount = data.to - data.from + 1;
  return dayCount < 2 ? sortItems(data.items, defaultSort)[0]?.item
    : selectMovers(data.movers, dayCount).falling[0]?.item;
}

// Enter followed by blur must not route twice; invalid drafts never commit.
export function rangeCommit(current: Range, mode: 'last' | 'days', last: string, from: string, to: string): Range | null {
  const next = customRange(mode, last, from, to);
  return next && JSON.stringify(next) !== JSON.stringify(current) ? next : null;
}
